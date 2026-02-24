using Microsoft.Data.Sqlite;
using ProcSim.Models;
using System.Diagnostics;
using System.Text.RegularExpressions;

namespace ProcSim.Services;

/// <summary>
/// Executes a subset of T-SQL against an in-memory SQLite database.
/// Automatically infers and creates referenced tables.
/// SQL Server-specific syntax is adapted on a best-effort basis.
/// Results are real but labelled "sandbox (SQLite)".
/// </summary>
public sealed class SqliteSandboxExecutor
{
    private const int MaxPreviewRows = 50;

    public async Task<RunResponse> ExecuteAsync(RunRequest request, ControlFlowGraph cfg, CancellationToken ct = default)
    {
        var runId = Guid.NewGuid().ToString("N")[..12];
        var trace = new List<TraceEvent>();
        var executedNodes = new HashSet<string>();
        int seq = 0;
        var sw = Stopwatch.StartNew();
        bool hadError = false;
        string? errorMessage = null;
        int totalRows = 0;

        // Build the T-SQL body to execute (strip CREATE PROCEDURE wrapper)
        var bodyTsql = ExtractProcBody(request.Tsql ?? "");
        var statements = SplitStatements(bodyTsql);

        trace.Add(new TraceEvent
        {
            EventId = seq++,
            Timestamp = DateTime.UtcNow,
            EventType = "start",
            SqlText = "[SQLite sandbox — best-effort local execution]",
            DurationMs = 0
        });

        // SQLite doesn't use SSL, but we handle connection strings consistently
        var connStr = new SqliteConnectionStringBuilder
        {
            DataSource = ":memory:",
            Mode = SqliteOpenMode.Memory,
            Cache = SqliteCacheMode.Shared
        }.ToString();

        using var conn = new SqliteConnection(connStr);
        await conn.OpenAsync(ct);

        // Create stub tables inferred from the T-SQL
        await CreateInferredTablesAsync(conn, bodyTsql, ct);

        // First, evaluate IF/ELSE branches and determine which path would be taken
        var bodyLines = bodyTsql.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        var branchTaken = EvaluateBranches(bodyLines, request.Params ?? new());
        
        // Execute each statement individually
        foreach (var rawSql in statements)
        {
            var sql = AdaptForSqlite(rawSql.Trim());
            var normalizedRaw = NormalizeSql(rawSql.Trim());
            
            // Determine if this statement is on the taken branch
            var onTakenBranch = IsStatementOnBranch(normalizedRaw, bodyLines, branchTaken);
            
            // Add trace event for the original T-SQL statement
            var isExecutable = !string.IsNullOrWhiteSpace(sql);
            var originalEvt = new TraceEvent
            {
                EventId = seq++,
                Timestamp = DateTime.UtcNow,
                EventType = onTakenBranch ? "statement" : "control-flow",
                SqlText = onTakenBranch 
                    ? $"[SQLite sandbox] ✓ {TruncateSql(normalizedRaw, 80)}"
                    : $"[SQLite sandbox] ✗ {TruncateSql(normalizedRaw, 80)}",
                DurationMs = 0
            };
            MapToNode(originalEvt, normalizedRaw, cfg, executedNodes);
            trace.Add(originalEvt);

            if (!isExecutable || !onTakenBranch) continue; // Skip statements not on taken branch

            var stmtSw = Stopwatch.StartNew();
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = sql;

                // Bind parameters
                foreach (var (name, value) in request.Params ?? new())
                {
                    var pName = name.StartsWith("@") ? name : $"@{name}";
                    cmd.Parameters.AddWithValue(pName, value ?? DBNull.Value);
                }

                // Detect if SELECT
                if (Regex.IsMatch(sql, @"^\s*SELECT", RegexOptions.IgnoreCase))
                {
                    var columns = new List<string>();
                    var rows = new List<List<object?>>();
                    int rowCount = 0;

                    using var reader = await cmd.ExecuteReaderAsync(ct);
                    for (int i = 0; i < reader.FieldCount; i++) columns.Add(reader.GetName(i));
                    while (await reader.ReadAsync(ct))
                    {
                        rowCount++;
                        if (rowCount <= MaxPreviewRows)
                        {
                            var row = new List<object?>();
                            for (int i = 0; i < reader.FieldCount; i++)
                            {
                                var val = reader.IsDBNull(i) ? null : reader.GetValue(i);
                                // Convert non-primitive types to string for JSON safety
                                if (val != null && val is not (string or int or long or double or float or decimal or bool or DateTime))
                                    val = val.ToString();
                                row.Add(val);
                            }
                            rows.Add(row);
                        }
                    }
                    totalRows += rowCount;

                    var evt = new TraceEvent
                    {
                        EventId = seq++,
                        Timestamp = DateTime.UtcNow,
                        EventType = "resultset",
                        SqlText = $"→ SQLite: {TruncateSql(sql, 80)}",
                        RowCount = rowCount,
                        ResultSetColumns = columns,
                        ResultSetPreviewRows = rows,
                        DurationMs = stmtSw.Elapsed.TotalMilliseconds
                    };
                    MapToNode(evt, rawSql, cfg, executedNodes);
                    trace.Add(evt);
                }
                else
                {
                    var affected = await cmd.ExecuteNonQueryAsync(ct);
                    totalRows += Math.Max(0, affected);

                    var evt = new TraceEvent
                    {
                        EventId = seq++,
                        Timestamp = DateTime.UtcNow,
                        EventType = "dml",
                        SqlText = $"→ SQLite: {TruncateSql(sql, 80)}",
                        RowCount = Math.Max(0, affected),
                        DurationMs = stmtSw.Elapsed.TotalMilliseconds
                    };
                    MapToNode(evt, rawSql, cfg, executedNodes);
                    trace.Add(evt);
                }
            }
            catch (SqliteException ex)
            {
                trace.Add(new TraceEvent
                {
                    EventId = seq++,
                    Timestamp = DateTime.UtcNow,
                    EventType = "error",
                    SqlText = $"[SQLite sandbox error] {ex.Message}",
                    ErrorNumber = ex.SqliteErrorCode,
                    ErrorMessage = ex.Message,
                    DurationMs = stmtSw.Elapsed.TotalMilliseconds
                });
                // Continue — SQLite sandbox is best-effort
            }
        }

        trace.Add(new TraceEvent
        {
            EventId = seq++,
            Timestamp = DateTime.UtcNow,
            EventType = "complete",
            SqlText = $"SQLite sandbox complete in {sw.Elapsed.TotalMilliseconds:F1}ms",
            DurationMs = sw.Elapsed.TotalMilliseconds
        });

        executedNodes.Add(cfg.StartNodeId);
        executedNodes.Add(cfg.EndNodeId);

        var mermaid = new MermaidGenerator().Generate(cfg, executedNodes);

        // Generate data preview for frontend display
        var dataPreview = await GenerateDataPreviewAsync(conn, ct);

        return new RunResponse
        {
            RunId = runId,
            Summary = new RunSummary
            {
                TotalStatements = trace.Count(e => e.EventType is "resultset" or "dml"),
                TotalRowsAffected = totalRows,
                TotalDurationMs = sw.Elapsed.TotalMilliseconds,
                HadError = hadError,
                ErrorMessage = errorMessage,
                Mode = "sqlite"
            },
            Trace = trace,
            ExecutedNodes = executedNodes.ToList(),
            Mermaid = mermaid,
            // Extra metadata for SQLite sandbox
            SqliteMetadata = new SqliteRunMetadata
            {
                DataPreview = dataPreview,
                TablesCreated = dataPreview.Keys.ToList(),
                TotalRowsGenerated = dataPreview.Values.Sum(v => v.RowCount)
            }
        };
    }

    private static string ExtractProcBody(string tsql)
    {
        // Strip CREATE/ALTER PROCEDURE header up to AS BEGIN
        var match = Regex.Match(tsql,
            @"AS\s*\r?\n?\s*BEGIN\s*\r?\n(.*)\r?\n\s*END\s*$",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
        return match.Success ? match.Groups[1].Value : tsql;
    }

    private static List<string> SplitStatements(string sql)
    {
        // Extract all SELECT/INSERT/UPDATE/DELETE statements, even those inside IF/ELSE blocks
        var statements = new List<string>();
        var lines = sql.Split('\n');
        var currentStatement = new List<string>();
        var inStatement = false;

        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            
            // Skip control flow and variable declarations
            if (Regex.IsMatch(trimmed,
                @"^\s*(DECLARE|SET\s+@|IF|ELSE|BEGIN|END|RETURN|RAISERROR|EXEC|PRINT)\b",
                RegexOptions.IgnoreCase))
            {
                continue;
            }

            // Check if line starts a DML statement
            if (Regex.IsMatch(trimmed,
                @"^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|WITH)\b",
                RegexOptions.IgnoreCase))
            {
                inStatement = true;
                currentStatement.Add(trimmed);
            }
            // Continue collecting multi-line statement
            else if (inStatement && !string.IsNullOrWhiteSpace(trimmed))
            {
                currentStatement.Add(trimmed);
            }
            // End of statement (semicolon or empty line after statement)
            else if (inStatement && (trimmed.EndsWith(";") || string.IsNullOrWhiteSpace(trimmed)))
            {
                if (trimmed.EndsWith(";"))
                    currentStatement[currentStatement.Count - 1] = trimmed.TrimEnd(';');
                
                var fullStatement = string.Join(" ", currentStatement);
                if (!string.IsNullOrWhiteSpace(fullStatement))
                    statements.Add(fullStatement);
                
                currentStatement.Clear();
                inStatement = false;
            }
        }

        // Catch any statement not terminated by semicolon
        if (currentStatement.Count > 0)
        {
            var fullStatement = string.Join(" ", currentStatement);
            if (!string.IsNullOrWhiteSpace(fullStatement))
                statements.Add(fullStatement);
        }

        return statements;
    }

    private static string AdaptForSqlite(string sql)
    {
        // SQL Server function/type → SQLite equivalents
        sql = Regex.Replace(sql, @"\bGETDATE\(\)", "datetime('now')", RegexOptions.IgnoreCase);
        sql = Regex.Replace(sql, @"\bSYSDATETIME\(\)", "datetime('now')", RegexOptions.IgnoreCase);
        sql = Regex.Replace(sql, @"\bNEWID\(\)", "hex(randomblob(16))", RegexOptions.IgnoreCase);
        sql = Regex.Replace(sql, @"\bNVARCHAR\s*\(\s*\w+\s*\)", "TEXT", RegexOptions.IgnoreCase);
        sql = Regex.Replace(sql, @"\bNVARCHAR\b", "TEXT", RegexOptions.IgnoreCase);
        sql = Regex.Replace(sql, @"\bVARCHAR\s*\(\s*\w+\s*\)", "TEXT", RegexOptions.IgnoreCase);
        sql = Regex.Replace(sql, @"\bVARCHAR\b", "TEXT", RegexOptions.IgnoreCase);
        sql = Regex.Replace(sql, @"\bDECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\)", "REAL", RegexOptions.IgnoreCase);
        sql = Regex.Replace(sql, @"\bFLOAT\b", "REAL", RegexOptions.IgnoreCase);
        sql = Regex.Replace(sql, @"\bBIT\b", "INTEGER", RegexOptions.IgnoreCase);
        sql = Regex.Replace(sql, @"\bIDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)", "AUTOINCREMENT", RegexOptions.IgnoreCase);
        // Strip dbo. schema prefix
        sql = Regex.Replace(sql, @"\bdbo\.", "", RegexOptions.IgnoreCase);
        // Strip TOP n (not supported in SQLite UPDATE/DELETE)
        sql = Regex.Replace(sql, @"\bTOP\s*\(\s*\d+\s*\)\s*", "", RegexOptions.IgnoreCase);
        sql = Regex.Replace(sql, @"\bTOP\s+\d+\s+", "", RegexOptions.IgnoreCase);
        // Strip WITH NOLOCK and other hints
        sql = Regex.Replace(sql, @"\bWITH\s*\(\s*NOLOCK\s*\)", "", RegexOptions.IgnoreCase);
        sql = Regex.Replace(sql, @"\bWITH\s*\(\s*\w+\s*\)", "", RegexOptions.IgnoreCase);
        return sql.Trim();
    }

    private static async Task CreateInferredTablesAsync(SqliteConnection conn, string sql, CancellationToken ct)
    {
        // Build a map: tableName -> set of column names referenced in SELECT/WHERE/SET/INSERT
        var tableColumns = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);

        // 1. Tables from FROM/JOIN/UPDATE/INTO
        var tableRefs = Regex.Matches(sql,
            @"(?:FROM|JOIN|INTO|UPDATE)\s+(?:dbo\.)?(\w+)\b",
            RegexOptions.IgnoreCase);
        foreach (Match m in tableRefs)
        {
            var t = m.Groups[1].Value;
            if (!tableColumns.ContainsKey(t))
                tableColumns[t] = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        // 2. Columns from SELECT col1, col2 FROM table
        var selectMatches = Regex.Matches(sql,
            @"SELECT\s+(.*?)\s+FROM\s+(?:dbo\.)?(\w+)",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
        foreach (Match m in selectMatches)
        {
            var colList = m.Groups[1].Value;
            var table = m.Groups[2].Value;
            if (!tableColumns.ContainsKey(table))
                tableColumns[table] = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // Skip SELECT * or SELECT COUNT(*)
            if (colList.Contains("*") || Regex.IsMatch(colList, @"^\s*COUNT\s*\(", RegexOptions.IgnoreCase))
                continue;

            // Parse individual columns — handle aliases like "Col AS Alias"
            foreach (var col in colList.Split(','))
            {
                var colName = Regex.Match(col.Trim(), @"^(?:\w+\.)?(\w+)").Groups[1].Value;
                if (!string.IsNullOrWhiteSpace(colName) && !colName.StartsWith("@"))
                    tableColumns[table].Add(colName);
            }
        }

        // 3. Columns from UPDATE table SET col = ...
        var updateMatches = Regex.Matches(sql,
            @"UPDATE\s+(?:dbo\.)?(\w+)\s+SET\s+(.*?)(?=\s+WHERE|\s*$)",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
        foreach (Match m in updateMatches)
        {
            var table = m.Groups[1].Value;
            if (!tableColumns.ContainsKey(table))
                tableColumns[table] = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var assignment in m.Groups[2].Value.Split(','))
            {
                var colName = Regex.Match(assignment.Trim(), @"^(\w+)\s*=").Groups[1].Value;
                if (!string.IsNullOrWhiteSpace(colName))
                    tableColumns[table].Add(colName);
            }
        }

        // 4. Columns from INSERT INTO table (col1, col2)
        var insertMatches = Regex.Matches(sql,
            @"INSERT\s+INTO\s+(?:dbo\.)?(\w+)\s*\(([^)]+)\)",
            RegexOptions.IgnoreCase);
        foreach (Match m in insertMatches)
        {
            var table = m.Groups[1].Value;
            if (!tableColumns.ContainsKey(table))
                tableColumns[table] = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var col in m.Groups[2].Value.Split(','))
            {
                var colName = col.Trim();
                if (!string.IsNullOrWhiteSpace(colName))
                    tableColumns[table].Add(colName);
            }
        }

        // Create each table with inferred columns and seed realistic test data
        foreach (var (tableName, cols) in tableColumns)
        {
            var columnDefs = new List<string> { "Id INTEGER PRIMARY KEY AUTOINCREMENT" };
            foreach (var col in cols)
            {
                var type = InferSqliteType(col, tableName);
                columnDefs.Add($"[{col}] {type} DEFAULT NULL");
            }

            using var cmd = conn.CreateCommand();
            cmd.CommandText = $"CREATE TABLE IF NOT EXISTS [{tableName}] ({string.Join(", ", columnDefs)})";
            await cmd.ExecuteNonQueryAsync(ct);

            // Seed realistic test data
            await SeedTableAsync(conn, tableName, cols.ToList(), ct);
        }
    }

    private static void MapToNode(TraceEvent evt, string sql, ControlFlowGraph cfg, HashSet<string> executedNodes)
    {
        // Best-effort: normalize and match against node snippets
        var normalSql = NormalizeSql(sql);
        var match = cfg.Nodes
            .Where(n => n.SqlSnippet.Length > 10)
            .FirstOrDefault(n => NormalizeSql(n.SqlSnippet).StartsWith(normalSql[..Math.Min(30, normalSql.Length)], StringComparison.OrdinalIgnoreCase));

        if (match != null)
        {
            evt.NodeId = match.Id;
            executedNodes.Add(match.Id);
        }

        // Mark all DML and Select nodes generically
        foreach (var node in cfg.Nodes.Where(n => n.NodeType is CfgNodeType.Dml or CfgNodeType.Select))
            executedNodes.Add(node.Id);
    }

    private static string NormalizeSql(string sql) =>
        Regex.Replace(sql.Trim(), @"\s+", " ", RegexOptions.Compiled);

    private static string TruncateSql(string sql, int max) =>
        sql.Length > max ? sql[..max] + "..." : sql;

    private static string InferSqliteType(string columnName, string tableName)
    {
        var col = columnName.ToLowerInvariant();
        var table = tableName.ToLowerInvariant();

        // ID columns
        if (col.Contains("id") && !col.Contains("guid")) return "INTEGER";
        
        // Numeric types
        if (col.Contains("price") || col.Contains("cost") || col.Contains("amount") || col.Contains("total")) return "REAL";
        if (col.Contains("qty") || col.Contains("quantity") || col.Contains("stock") || col.Contains("count") || col.Contains("num")) return "INTEGER";
        if (col.Contains("rate") || col.Contains("percent") || col.Contains("ratio")) return "REAL";
        
        // Date/time
        if (col.Contains("date") || col.Contains("time") || col.Contains("created") || col.Contains("updated") || col.Contains("modified")) return "TEXT";
        
        // Boolean/bit
        if (col.Contains("active") || col.Contains("is") || col.Contains("has") || col.Contains("flag") || col.Contains("enabled")) return "INTEGER";
        
        // Text/strings
        return "TEXT";
    }

    private static async Task SeedTableAsync(SqliteConnection conn, string tableName, List<string> columns, CancellationToken ct)
    {
        var rowCount = Math.Min(5 + columns.Count, 12); // Dynamic row count based on complexity
        var random = new Random(42); // Fixed seed for reproducible results

        for (int i = 1; i <= rowCount; i++)
        {
            var colValues = new List<object?>();
            var paramNames = new List<string>();

            foreach (var col in columns)
            {
                var value = GenerateTestData(col, tableName, i, random);
                colValues.Add(value);
                paramNames.Add($"@p{paramNames.Count}");
            }

            using var cmd = conn.CreateCommand();
            cmd.CommandText = $"INSERT INTO [{tableName}] ({string.Join(", ", columns.Select(c => $"[{c}]"))}) VALUES ({string.Join(", ", paramNames)})";
            
            for (int j = 0; j < paramNames.Count; j++)
            {
                var param = cmd.CreateParameter();
                param.ParameterName = paramNames[j];
                param.Value = colValues[j] ?? (object)DBNull.Value;
                cmd.Parameters.Add(param);
            }
            
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private static object GenerateTestData(string columnName, string tableName, int rowId, Random random)
    {
        var col = columnName.ToLowerInvariant();
        var table = tableName.ToLowerInvariant();

        // ID columns
        if (col.Contains("id") && !col.Contains("guid"))
            return rowId;

        // Product-specific data
        if (table.Contains("product"))
        {
            if (col.Contains("name")) return new[] { "Widget Pro", "MegaGadget", "SuperWidget", "UltraDevice", "PowerTool" }[rowId % 5];
            if (col.Contains("price")) return Math.Round(random.NextDouble() * 100 + 10, 2);
            if (col.Contains("stock") || col.Contains("qty")) return random.Next(0, 50);
            if (col.Contains("active")) return random.NextDouble() > 0.3 ? 1 : 0;
        }

        // Order-specific data
        if (table.Contains("order"))
        {
            if (col.Contains("status")) return new[] { "Pending", "Processing", "Shipped", "Delivered" }[rowId % 4];
            if (col.Contains("total") || col.Contains("amount")) return Math.Round(random.NextDouble() * 500 + 50, 2);
            if (col.Contains("date") || col.Contains("created")) return DateTime.Now.AddDays(-random.Next(1, 30)).ToString("yyyy-MM-dd HH:mm:ss");
            if (col.Contains("customer")) return $"Customer {rowId}";
        }

        // User/Customer data
        if (table.Contains("user") || table.Contains("customer"))
        {
            if (col.Contains("name")) return new[] { "Alice Johnson", "Bob Smith", "Carol Davis", "David Wilson", "Eva Brown" }[rowId % 5];
            if (col.Contains("email")) return $"user{rowId}@example.com";
            if (col.Contains("active") || col.Contains("enabled")) return random.NextDouble() > 0.2 ? 1 : 0;
            if (col.Contains("created") || col.Contains("date")) return DateTime.Now.AddDays(-random.Next(1, 365)).ToString("yyyy-MM-dd");
        }

        // Generic patterns
        if (col.Contains("price") || col.Contains("cost") || col.Contains("amount") || col.Contains("total"))
            return Math.Round(random.NextDouble() * 1000 + 10, 2);

        if (col.Contains("qty") || col.Contains("quantity") || col.Contains("stock") || col.Contains("count") || col.Contains("num"))
            return random.Next(0, 100);

        if (col.Contains("rate") || col.Contains("percent"))
            return Math.Round(random.NextDouble() * 100, 2);

        if (col.Contains("date") || col.Contains("time"))
            return DateTime.Now.AddDays(-random.Next(1, 365)).ToString("yyyy-MM-dd");

        if (col.Contains("active") || col.Contains("is") || col.Contains("has") || col.Contains("flag") || col.Contains("enabled"))
            return random.NextDouble() > 0.5 ? 1 : 0;

        // Default text
        return $"Sample {col} {rowId}";
    }

    private static async Task<Dictionary<string, TablePreview>> GenerateDataPreviewAsync(SqliteConnection conn, CancellationToken ct)
    {
        var preview = new Dictionary<string, TablePreview>();
        
        // Get all table names
        var tables = new List<string>();
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
            using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                tables.Add(reader.GetString(0));
        }

        // Generate preview for each table
        foreach (var table in tables)
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = $"SELECT * FROM [{table}] LIMIT 3";
            
            var columns = new List<string>();
            var sampleRows = new List<List<object?>>();
            int totalRows = 0;

            using (var reader = await cmd.ExecuteReaderAsync(ct))
            {
                // Get column names
                for (int i = 0; i < reader.FieldCount; i++)
                    columns.Add(reader.GetName(i));

                // Get sample rows
                while (await reader.ReadAsync(ct))
                {
                    var row = new List<object?>();
                    for (int i = 0; i < reader.FieldCount; i++)
                    {
                        var val = reader.IsDBNull(i) ? null : reader.GetValue(i);
                        // Convert non-primitive types to string for JSON safety
                        if (val != null && val is not (string or int or long or double or float or decimal or bool or DateTime))
                            val = val.ToString();
                        row.Add(val);
                    }
                    sampleRows.Add(row);
                }
            }

            // Get total row count
            using (var countCmd = conn.CreateCommand())
            {
                countCmd.CommandText = $"SELECT COUNT(*) FROM [{table}]";
                totalRows = Convert.ToInt32(await countCmd.ExecuteScalarAsync(ct));
            }

            preview[table] = new TablePreview
            {
                TableName = table,
                Columns = columns,
                SampleRows = sampleRows,
                RowCount = totalRows
            };
        }

        return preview;
    }

    private static string EvaluateBranches(string[] lines, Dictionary<string, object?> parameters)
    {
        // Simple branch evaluation for common patterns
        // Returns: "if", "else_if", "else", or "unknown"
        
        for (int i = 0; i < lines.Length; i++)
        {
            var line = lines[i].Trim();
            
            // Look for IF conditions with parameters
            var ifMatch = Regex.Match(line, @"IF\s+(.+?)\s*$", RegexOptions.IgnoreCase);
            if (ifMatch.Success)
            {
                var condition = ifMatch.Groups[1].Value;
                if (EvaluateCondition(condition, parameters))
                    return "if";
            }
            
            // Look for ELSE IF conditions
            var elseIfMatch = Regex.Match(line, @"ELSE\s+IF\s+(.+?)\s*$", RegexOptions.IgnoreCase);
            if (elseIfMatch.Success)
            {
                var condition = elseIfMatch.Groups[1].Value;
                if (EvaluateCondition(condition, parameters))
                    return "else_if";
            }
            
            // Look for standalone ELSE
            if (Regex.IsMatch(line, @"^\s*ELSE\s*$", RegexOptions.IgnoreCase))
            {
                return "else";
            }
        }
        
        return "unknown";
    }

    private static bool EvaluateCondition(string condition, Dictionary<string, object?> parameters)
    {
        // Very simple condition evaluation for common patterns
        // This is a simplified implementation for demonstration
        
        // Handle parameter comparisons like @ProductId = 1
        var paramMatch = Regex.Match(condition, @"@(\w+)\s*=\s*(\d+)");
        if (paramMatch.Success)
        {
            var paramName = paramMatch.Groups[1].Value.ToLower();
            var expectedValue = int.Parse(paramMatch.Groups[2].Value);
            
            if (parameters.TryGetValue(paramName, out var actualValue) && 
                actualValue is int actualInt)
            {
                return actualInt == expectedValue;
            }
        }
        
        // Handle range comparisons like @CurrentStock >= @RequestedQty
        var rangeMatch = Regex.Match(condition, @"@(\w+)\s*>=\s*@(\w+)");
        if (rangeMatch.Success)
        {
            var param1 = rangeMatch.Groups[1].Value.ToLower();
            var param2 = rangeMatch.Groups[2].Value.ToLower();
            
            if (parameters.TryGetValue(param1, out var val1) && val1 is int int1 &&
                parameters.TryGetValue(param2, out var val2) && val2 is int int2)
            {
                return int1 >= int2;
            }
        }
        
        // Handle NULL checks like @CurrentStock IS NULL
        var nullMatch = Regex.Match(condition, @"@(\w+)\s+IS\s+NULL", RegexOptions.IgnoreCase);
        if (nullMatch.Success)
        {
            var paramName = nullMatch.Groups[1].Value.ToLower();
            return !parameters.ContainsKey(paramName) || parameters[paramName] == null;
        }
        
        return false; // Default to false for unsupported conditions
    }

    private static bool IsStatementOnBranch(string statement, string[] allLines, string branchTaken)
    {
        if (branchTaken == "unknown") return true; // Execute all if we can't determine
        
        var currentBranch = "before_if";
        
        foreach (var line in allLines)
        {
            var trimmed = line.Trim();
            
            if (Regex.IsMatch(trimmed, @"^\s*IF\s+", RegexOptions.IgnoreCase))
            {
                currentBranch = "if";
            }
            else if (Regex.IsMatch(trimmed, @"^\s*ELSE\s+IF\s+", RegexOptions.IgnoreCase))
            {
                currentBranch = "else_if";
            }
            else if (Regex.IsMatch(trimmed, @"^\s*ELSE\s*$", RegexOptions.IgnoreCase))
            {
                currentBranch = "else";
            }
            else if (Regex.IsMatch(trimmed, @"^\s*(SELECT|INSERT|UPDATE|DELETE)", RegexOptions.IgnoreCase))
            {
                if (NormalizeSql(trimmed).StartsWith(NormalizeSql(statement[..Math.Min(30, statement.Length)]), StringComparison.OrdinalIgnoreCase))
                {
                    return currentBranch == branchTaken;
                }
            }
        }
        
        return true; // Default to executing if we can't match
    }
}
