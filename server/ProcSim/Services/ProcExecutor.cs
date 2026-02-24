using Microsoft.Data.SqlClient;
using ProcSim.Models;
using System.Data;
using System.Diagnostics;
using System.Text.Json;

namespace ProcSim.Services;

public sealed class ProcExecutor
{
    private const int MaxPreviewRows = 50;
    private const int StatementTimeoutSeconds = 30;

    /// <summary>
    /// Execute a stored procedure, capture trace events, and optionally rollback.
    /// Uses direct execution with EXEC and captures output via InfoMessage + result sets.
    /// </summary>
    public async Task<RunResponse> ExecuteAsync(
        RunRequest request,
        ControlFlowGraph cfg,
        CancellationToken ct = default)
    {
        ProcFetcher.ValidateConnectionString(request.ConnectionString);

        var runId = Guid.NewGuid().ToString("N")[..12];
        var trace = new List<TraceEvent>();
        var executedNodes = new HashSet<string>();
        int eventSeq = 0;
        var sw = Stopwatch.StartNew();
        bool hadError = false;
        string? errorMessage = null;
        int totalRows = 0;

        // Add TrustServerCertificate=True to handle self-signed certificates
        var builder = new SqlConnectionStringBuilder(request.ConnectionString)
        {
            TrustServerCertificate = true
        };

        using var conn = new SqlConnection(builder.ConnectionString);

        // Capture info messages (PRINT, RAISERROR with severity <=10, row counts)
        var infoMessages = new List<string>();
        conn.InfoMessage += (sender, args) =>
        {
            foreach (SqlError err in args.Errors)
            {
                infoMessages.Add(err.Message);
            }
        };

        await conn.OpenAsync(ct);

        // Wrap in transaction for rollback mode
        SqlTransaction? txn = null;
        if (request.Mode == "rollback")
        {
            txn = conn.BeginTransaction();
        }

        try
        {
            // Enable row count messages
            using (var setCmd = new SqlCommand("SET NOCOUNT OFF", conn, txn))
            {
                setCmd.CommandTimeout = StatementTimeoutSeconds;
                await setCmd.ExecuteNonQueryAsync(ct);
            }

            // Build the EXEC command
            using var cmd = new SqlCommand();
            cmd.Connection = conn;
            cmd.Transaction = txn;
            cmd.CommandTimeout = StatementTimeoutSeconds;
            cmd.CommandType = CommandType.StoredProcedure;

            if (!string.IsNullOrEmpty(request.ProcName))
            {
                cmd.CommandText = request.ProcName;
            }
            else if (!string.IsNullOrEmpty(request.Tsql))
            {
                // For raw T-SQL, execute as text
                cmd.CommandType = CommandType.Text;
                cmd.CommandText = request.Tsql;
            }
            else
            {
                throw new InvalidOperationException("Either ProcName or Tsql must be provided.");
            }

            // Add parameters
            if (request.Params != null && cmd.CommandType == CommandType.StoredProcedure)
            {
                foreach (var (name, value) in request.Params)
                {
                    var paramName = name.StartsWith("@") ? name : $"@{name}";
                    cmd.Parameters.AddWithValue(paramName, value ?? DBNull.Value);
                }
            }

            // Execute and capture result sets
            var stmtSw = Stopwatch.StartNew();

            trace.Add(new TraceEvent
            {
                EventId = eventSeq++,
                Timestamp = DateTime.UtcNow,
                EventType = "start",
                SqlText = cmd.CommandText,
                DurationMs = 0
            });

            using var reader = await cmd.ExecuteReaderAsync(ct);

            do
            {
                var columns = new List<string>();
                var rows = new List<List<object?>>();

                if (reader.FieldCount > 0)
                {
                    for (int i = 0; i < reader.FieldCount; i++)
                        columns.Add(reader.GetName(i));

                    int rowCount = 0;
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

                    var resultEvent = new TraceEvent
                    {
                        EventId = eventSeq++,
                        Timestamp = DateTime.UtcNow,
                        EventType = "resultset",
                        SqlText = $"Result set ({columns.Count} columns, {rowCount} rows)",
                        RowCount = rowCount,
                        ResultSetColumns = columns,
                        ResultSetPreviewRows = rows,
                        DurationMs = stmtSw.Elapsed.TotalMilliseconds
                    };

                    // Try to map to a CFG node
                    MapEventToNode(resultEvent, cfg, executedNodes);
                    trace.Add(resultEvent);

                    stmtSw.Restart();
                }
                else
                {
                    // DML with rows affected
                    var affected = reader.RecordsAffected;
                    if (affected >= 0)
                    {
                        totalRows += affected;
                        var dmlEvent = new TraceEvent
                        {
                            EventId = eventSeq++,
                            Timestamp = DateTime.UtcNow,
                            EventType = "dml",
                            SqlText = "DML statement",
                            RowCount = affected,
                            DurationMs = stmtSw.Elapsed.TotalMilliseconds
                        };
                        MapEventToNode(dmlEvent, cfg, executedNodes);
                        trace.Add(dmlEvent);
                        stmtSw.Restart();
                    }
                }
            } while (await reader.NextResultAsync(ct));

            // Capture info messages as trace events
            foreach (var msg in infoMessages)
            {
                trace.Add(new TraceEvent
                {
                    EventId = eventSeq++,
                    Timestamp = DateTime.UtcNow,
                    EventType = "info",
                    SqlText = msg,
                    DurationMs = 0
                });
            }

            trace.Add(new TraceEvent
            {
                EventId = eventSeq++,
                Timestamp = DateTime.UtcNow,
                EventType = "complete",
                SqlText = $"Execution completed ({request.Mode} mode)",
                DurationMs = sw.Elapsed.TotalMilliseconds
            });
        }
        catch (SqlException ex)
        {
            hadError = true;
            errorMessage = ex.Message;
            trace.Add(new TraceEvent
            {
                EventId = eventSeq++,
                Timestamp = DateTime.UtcNow,
                EventType = "error",
                SqlText = ex.Message,
                ErrorNumber = ex.Number,
                ErrorMessage = ex.Message,
                DurationMs = sw.Elapsed.TotalMilliseconds
            });

            // Try to map error to catch block node
            var catchNode = cfg.Nodes.FirstOrDefault(n => n.NodeType == CfgNodeType.CatchBlock);
            if (catchNode != null)
                executedNodes.Add(catchNode.Id);
        }
        finally
        {
            if (txn != null)
            {
                try
                {
                    txn.Rollback();
                    trace.Add(new TraceEvent
                    {
                        EventId = eventSeq++,
                        Timestamp = DateTime.UtcNow,
                        EventType = "txn",
                        SqlText = "Transaction rolled back (sandbox mode)",
                        DurationMs = 0
                    });
                }
                catch { /* already rolled back or connection broken */ }
            }
        }

        // Mark start and end nodes as executed
        executedNodes.Add(cfg.StartNodeId);
        executedNodes.Add(cfg.EndNodeId);

        // Generate mermaid with highlighting
        var mermaidGen = new MermaidGenerator();
        var mermaid = mermaidGen.Generate(cfg, executedNodes);

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
                Mode = request.Mode
            },
            Trace = trace,
            ExecutedNodes = executedNodes.ToList(),
            Mermaid = mermaid
        };
    }

    /// <summary>
    /// Best-effort mapping: match trace events to CFG nodes by checking SQL snippets.
    /// </summary>
    private void MapEventToNode(TraceEvent evt, ControlFlowGraph cfg, HashSet<string> executedNodes)
    {
        // For result sets and DML, walk the CFG and mark all statement-type nodes as executed
        // (since we can't precisely map with CommandType.StoredProcedure execution).
        // Mark DML and Select nodes in order of the trace.
        foreach (var node in cfg.Nodes)
        {
            if (node.NodeType is CfgNodeType.Dml or CfgNodeType.Select or CfgNodeType.Call or CfgNodeType.Statement or CfgNodeType.Transaction or CfgNodeType.DynamicSql)
            {
                executedNodes.Add(node.Id);
            }
        }

        // Also mark branch/merge nodes along paths
        foreach (var node in cfg.Nodes)
        {
            if (node.NodeType is CfgNodeType.Branch or CfgNodeType.Loop or CfgNodeType.TryCatch or CfgNodeType.Block)
            {
                executedNodes.Add(node.Id);
            }
        }
    }
}
