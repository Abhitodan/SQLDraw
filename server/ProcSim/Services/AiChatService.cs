using ProcSim.Models;
using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace ProcSim.Services;

public sealed class AiChatService
{
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(120) };

    private static readonly JsonSerializerOptions _camel = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private const string SystemPrompt = @"You are Abhitodan — a principal SQL Server database engineer with 20 years of battle-hardened experience across high-volume OLTP systems, data warehousing, HA/DR architecture, and performance tuning at scale. You've optimised queries processing billions of rows, rescued deadlock-plagued production systems at 3am, and reviewed thousands of stored procedures ranging from elegant to catastrophic.

You are embedded inside SQLDraw Studio — a tool for parsing, visualising, and simulating SQL Server stored procedures.

## Persona
- Blunt, direct, zero padding. You respect the user's time.
- You speak like a senior engineer reviewing a PR, not like a documentation page.
- You proactively surface issues even when not asked — silence on a bad pattern is negligence.
- You give the *fix*, not just the diagnosis. ""Use a covering index on (CustomerId) INCLUDE (Status, Total)"" not ""consider adding an index"".
- You default to suggestions and improvement areas unless the user asks for explanation.

## What You Can See
- Full T-SQL source of the stored procedure
- Parsed Control Flow Graph (CFG): node IDs, types (Branch/DML/Select/TryCatch/Transaction/Loop), edge conditions
- Execution trace: which nodes ran, branch decisions, row counts, result set previews, timing, errors
- Currently selected CFG node (if the user clicked one)

## Default Behaviour (when asked to review or analyse)
Lead with a **quick verdict** (1-2 sentences: what this proc does and your overall assessment).
Then structure output as:

### 🔴 Critical Issues
Problems that will cause bugs, data corruption, deadlocks, or security holes.

### 🟡 Warnings
Correctness risks, fragile patterns, or significant performance hazards.

### 🟢 Suggestions
Improvements, modernisations, best practices, and refactoring ideas.

### 💡 Quick Wins
Small changes with immediate payoff (adding SET NOCOUNT ON, fixing a hint, renaming for clarity).

Only include sections that have content. Skip empty ones.

## Deep Expertise Areas

**Performance**
- Non-SARGable predicates: CONVERT/CAST/ISNULL on indexed columns destroys seek ability
- Parameter sniffing: single-plan caching with skewed data distributions; suggest OPTION(OPTIMIZE FOR UNKNOWN) or OPTION(RECOMPILE) where warranted
- Temp tables vs table variables: temp tables get statistics and parallelism; table variables do not — matters for >1000 rows
- Implicit conversions: VARCHAR vs NVARCHAR mismatches cause full index scans; always flag
- Row-by-row RBAR (Row By Agonising Row): WHILE loops and cursors doing set-based work
- Missing covering indexes: identify the WHERE/JOIN columns and suggest INCLUDE columns from SELECT
- Bookmark lookups: key lookups on large result sets should be eliminated with covering indexes
- Lock escalation: large UPDATE/DELETE without batching will escalate to table locks
- Statistics: stale statistics on large tables cause plan regressions; suggest UPDATE STATISTICS
- READ UNCOMMITTED / NOLOCK: dirty reads, phantom reads — not a performance silver bullet, a correctness trade-off

**Correctness & Reliability**
- Transaction scope: keep transactions as short as possible; never hold a transaction open while calling external systems
- Error handling: TRY/CATCH must include ROLLBACK on @@TRANCOUNT > 0; naked transactions without CATCH will leave locks
- NULL handling: = NULL vs IS NULL, NULLIF, COALESCE vs ISNULL semantics
- SET NOCOUNT ON: omitting it sends row-count messages for every DML, impacts clients and causes spurious ""rows affected"" behaviour
- Deterministic ORDER BY: results without ORDER BY are unordered by definition; OFFSET/FETCH requires it
- Implicit transactions: @@TRANCOUNT mismanagement in nested proc calls
- RAISERROR vs THROW: THROW (SQL 2012+) preserves original error number and stack; prefer it

**Security**
- Dynamic SQL: concatenated user input = SQL injection; always use sp_executesql with typed parameters
- EXECUTE AS: understand the permission context — EXECUTE AS OWNER vs CALLER implications
- Sensitive data in trace/logs: PRINT statements or SELECT inside procs that expose PII

**Modernisation & Refactoring**
- Replace old-style JOINs (comma-separated FROM) with explicit JOIN syntax
- Replace correlated subqueries with window functions (ROW_NUMBER, SUM OVER, etc.) where appropriate
- Replace multiple single-row INSERTs in a loop with a single set-based INSERT...SELECT
- CTEs for readability; but watch out for CTE being evaluated multiple times in some plans
- JSON/XML output: use FOR JSON PATH or FOR XML PATH instead of manual string concatenation
- Split god-procs doing 5 different things into focused, single-responsibility procs

## Response Style
- Lead with what matters most
- Bullet points for issue lists; code blocks for all T-SQL
- Reference CFG node IDs (e.g. ""node N4 — the IF branch"") when relevant
- Test cases: numbered list, `EXEC dbo.ProcName @Param1 = value, @Param2 = value` format
- Severity prefix on every finding: 🔴 Critical | 🟡 Warning | 🟢 Suggestion | 💡 Quick Win
- No restating the question. No filler. No ""Great question!"".

## Hard Rules (call these out every time, no exceptions)
- `SELECT *` in production code → always wrong, always flag
- Cursor doing set-based work → always wrong, always flag
- Transaction without TRY/CATCH → data integrity time bomb, always flag
- Dynamic SQL via string concatenation → security hole, always flag
- Implicit type conversion on a filtered/joined column → index killer, always flag
- `WITH (NOLOCK)` on tables with write activity → dirty reads, not free performance, always contextualise";

    /// <summary>
    /// Streams AI response tokens as an async enumerable of string deltas.
    /// Caller writes each delta as an SSE chunk.
    /// </summary>
    public async IAsyncEnumerable<string> StreamAsync(
        AiChatRequest request,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        var systemContent = BuildSystemContent(request.Context);

        switch (request.Provider.ToLowerInvariant())
        {
            case "anthropic":
                await foreach (var delta in StreamAnthropicAsync(request, systemContent, ct))
                    yield return delta;
                break;

            case "openai":
                await foreach (var delta in StreamOpenAiAsync(request, systemContent, ct))
                    yield return delta;
                break;

            case "azure":
                await foreach (var delta in StreamAzureAsync(request, systemContent, ct))
                    yield return delta;
                break;

            case "gemini":
                await foreach (var delta in StreamGeminiAsync(request, systemContent, ct))
                    yield return delta;
                break;

            default:
                throw new ArgumentException($"Unknown provider: {request.Provider}");
        }
    }

    private static string BuildSystemContent(AiChatContext ctx)
    {
        var sb = new StringBuilder(SystemPrompt);
        sb.AppendLine("\n\n---\n## Current Context\n");

        if (!string.IsNullOrWhiteSpace(ctx.Tsql))
        {
            sb.AppendLine("### T-SQL Source");
            sb.AppendLine("```sql");
            sb.AppendLine(ctx.Tsql.Length > 8000 ? ctx.Tsql[..8000] + "\n[truncated]" : ctx.Tsql);
            sb.AppendLine("```");
        }

        if (ctx.Cfg != null)
        {
            sb.AppendLine("\n### CFG Nodes (id → label → type → edges)");
            foreach (var node in ctx.Cfg.Nodes.Take(60))
            {
                var edges = string.Join(", ", node.OutEdges.Select(e =>
                    string.IsNullOrEmpty(e.Condition) ? e.TargetNodeId : $"{e.TargetNodeId}[{e.Condition}]"));
                sb.AppendLine($"- {node.Id}: [{node.NodeType}] {node.Label.Replace("\n", " ")} → {edges}");
            }
        }

        if (!string.IsNullOrEmpty(ctx.SelectedNodeId) && ctx.Cfg != null)
        {
            var sel = ctx.Cfg.Nodes.FirstOrDefault(n => n.Id == ctx.SelectedNodeId);
            if (sel != null)
            {
                sb.AppendLine($"\n### Currently Selected Node: {sel.Id}");
                sb.AppendLine($"Type: {sel.NodeType}, Label: {sel.Label}");
                sb.AppendLine($"SQL: {sel.SqlSnippet}");
            }
        }

        if (ctx.RunResult != null)
        {
            var r = ctx.RunResult;
            sb.AppendLine($"\n### Last Run Summary");
            sb.AppendLine($"- Mode: {r.Summary.Mode}, Duration: {r.Summary.TotalDurationMs:F1}ms");
            sb.AppendLine($"- Statements: {r.Summary.TotalStatements}, Rows: {r.Summary.TotalRowsAffected}");
            sb.AppendLine($"- Had Error: {r.Summary.HadError}" +
                          (r.Summary.HadError ? $" — {r.Summary.ErrorMessage}" : ""));
            sb.AppendLine($"- Executed Nodes: {string.Join(", ", r.ExecutedNodes)}");
            sb.AppendLine("\n### Trace Events (first 20)");
            foreach (var evt in r.Trace.Take(20))
            {
                var row = evt.RowCount.HasValue ? $" ({evt.RowCount} rows)" : "";
                var err = evt.ErrorMessage != null ? $" ERROR#{evt.ErrorNumber}: {evt.ErrorMessage}" : "";
                var branch = evt.BranchTaken != null ? $" branch={evt.BranchTaken}" : "";
                sb.AppendLine($"- [{evt.EventType}] {evt.SqlText.Replace("\n", " ")[..Math.Min(120, evt.SqlText.Length)]}{row}{err}{branch}");
            }
        }

        return sb.ToString();
    }

    // ── Anthropic ────────────────────────────────────────────────────────────

    private static async IAsyncEnumerable<string> StreamAnthropicAsync(
        AiChatRequest req,
        string systemContent,
        [EnumeratorCancellation] CancellationToken ct)
    {
        var body = new
        {
            model = req.Model,
            max_tokens = 2048,
            system = systemContent,
            stream = true,
            messages = req.Messages.Select(m => new { role = m.Role, content = m.Content }).ToArray()
        };

        using var httpReq = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages");
        httpReq.Headers.Add("x-api-key", req.ApiKey);
        httpReq.Headers.Add("anthropic-version", "2023-06-01");
        httpReq.Content = new StringContent(JsonSerializer.Serialize(body, _camel), Encoding.UTF8, "application/json");

        using var resp = await _http.SendAsync(httpReq, HttpCompletionOption.ResponseHeadersRead, ct);
        resp.EnsureSuccessStatusCode();

        await foreach (var line in ReadSseLines(resp, ct))
        {
            if (!line.StartsWith("data: ")) continue;
            var json = line[6..];
            if (json == "[DONE]") yield break;

            var node = JsonNode.Parse(json);
            var delta = node?["delta"]?["text"]?.GetValue<string>();
            if (delta != null) yield return delta;
        }
    }

    // ── OpenAI ───────────────────────────────────────────────────────────────

    private static async IAsyncEnumerable<string> StreamOpenAiAsync(
        AiChatRequest req,
        string systemContent,
        [EnumeratorCancellation] CancellationToken ct)
    {
        var messages = new List<object>
        {
            new { role = "system", content = systemContent }
        };
        messages.AddRange(req.Messages.Select(m => new { role = m.Role, content = m.Content }).Cast<object>());

        var body = new { model = req.Model, stream = true, messages };

        using var httpReq = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions");
        httpReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", req.ApiKey);
        httpReq.Content = new StringContent(JsonSerializer.Serialize(body, _camel), Encoding.UTF8, "application/json");

        using var resp = await _http.SendAsync(httpReq, HttpCompletionOption.ResponseHeadersRead, ct);
        resp.EnsureSuccessStatusCode();

        await foreach (var line in ReadSseLines(resp, ct))
        {
            if (!line.StartsWith("data: ")) continue;
            var json = line[6..];
            if (json == "[DONE]") yield break;

            var node = JsonNode.Parse(json);
            var delta = node?["choices"]?[0]?["delta"]?["content"]?.GetValue<string>();
            if (delta != null) yield return delta;
        }
    }

    // ── Azure OpenAI ─────────────────────────────────────────────────────────

    private static async IAsyncEnumerable<string> StreamAzureAsync(
        AiChatRequest req,
        string systemContent,
        [EnumeratorCancellation] CancellationToken ct)
    {
        // Azure endpoint: https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-02-01
        var endpoint = req.AzureEndpoint
            ?? throw new ArgumentException("AzureEndpoint is required for provider=azure");

        var messages = new List<object>
        {
            new { role = "system", content = systemContent }
        };
        messages.AddRange(req.Messages.Select(m => new { role = m.Role, content = m.Content }).Cast<object>());

        var body = new { stream = true, messages };

        using var httpReq = new HttpRequestMessage(HttpMethod.Post, endpoint);
        httpReq.Headers.Add("api-key", req.ApiKey);
        httpReq.Content = new StringContent(JsonSerializer.Serialize(body, _camel), Encoding.UTF8, "application/json");

        using var resp = await _http.SendAsync(httpReq, HttpCompletionOption.ResponseHeadersRead, ct);
        resp.EnsureSuccessStatusCode();

        await foreach (var line in ReadSseLines(resp, ct))
        {
            if (!line.StartsWith("data: ")) continue;
            var json = line[6..];
            if (json == "[DONE]") yield break;

            var node = JsonNode.Parse(json);
            var delta = node?["choices"]?[0]?["delta"]?["content"]?.GetValue<string>();
            if (delta != null) yield return delta;
        }
    }

    // ── Google Gemini ────────────────────────────────────────────────────────

    private static async IAsyncEnumerable<string> StreamGeminiAsync(
        AiChatRequest req,
        string systemContent,
        [EnumeratorCancellation] CancellationToken ct)
    {
        var contents = req.Messages.Select(m => new
        {
            role = m.Role == "assistant" ? "model" : "user",
            parts = new[] { new { text = m.Content } }
        }).ToList();

        var body = new
        {
            systemInstruction = new { parts = new[] { new { text = systemContent } } },
            contents = contents
        };

        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{req.Model}:streamGenerateContent?alt=sse&key={req.ApiKey}";
        using var httpReq = new HttpRequestMessage(HttpMethod.Post, url);
        httpReq.Content = new StringContent(JsonSerializer.Serialize(body, _camel), Encoding.UTF8, "application/json");

        using var resp = await _http.SendAsync(httpReq, HttpCompletionOption.ResponseHeadersRead, ct);
        
        if (!resp.IsSuccessStatusCode)
        {
            var errorText = await resp.Content.ReadAsStringAsync(ct);
            throw new HttpRequestException($"Gemini API error {resp.StatusCode}: {errorText}");
        }

        await foreach (var line in ReadSseLines(resp, ct))
        {
            if (!line.StartsWith("data: ")) continue;
            var json = line[6..];
            if (json == "[DONE]") yield break;
            if (string.IsNullOrWhiteSpace(json)) continue;

            var node = JsonNode.Parse(json);
            var text = node?["candidates"]?[0]?["content"]?["parts"]?[0]?["text"]?.GetValue<string>();
            if (text != null) yield return text;
        }
    }

    // ── Shared SSE reader ────────────────────────────────────────────────────

    private static async IAsyncEnumerable<string> ReadSseLines(
        HttpResponseMessage resp,
        [EnumeratorCancellation] CancellationToken ct)
    {
        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);
        while (!reader.EndOfStream && !ct.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(ct);
            if (line != null) yield return line;
        }
    }
}
