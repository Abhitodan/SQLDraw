namespace ProcSim.Models;

// --- Parse ---

public sealed class ParseRequest
{
    public string? ConnectionString { get; set; }
    public string? ProcName { get; set; }
    public string? Tsql { get; set; }
}

public sealed class ParseResponse
{
    public ControlFlowGraph Cfg { get; set; } = new();
    public string Mermaid { get; set; } = "";
    public List<ProcParameter> Params { get; set; } = new();
}

// --- Run ---

public sealed class RunRequest
{
    public string? ConnectionString { get; set; }   // null = offline mode
    public string? ProcName { get; set; }
    public string? Tsql { get; set; }
    public Dictionary<string, object?> Params { get; set; } = new();
    // "rollback" | "commit" | "dryrun" | "sqlite"
    public string Mode { get; set; } = "dryrun";
}

public sealed class RunResponse
{
    public string RunId { get; set; } = "";
    public RunSummary Summary { get; set; } = new();
    public List<TraceEvent> Trace { get; set; } = new();
    public List<string> ExecutedNodes { get; set; } = new();
    public List<string> ExecutedEdges { get; set; } = new(); // "sourceId-targetId" pairs for edges actually taken
    public string Mermaid { get; set; } = "";
    public SqliteRunMetadata? SqliteMetadata { get; set; } // Populated only for SQLite sandbox runs
}

public sealed class RunSummary
{
    public int TotalStatements { get; set; }
    public int TotalRowsAffected { get; set; }
    public double TotalDurationMs { get; set; }
    public bool HadError { get; set; }
    public string? ErrorMessage { get; set; }
    public string Mode { get; set; } = "";
}

// --- AI Chat ---

public sealed class AiChatMessage
{
    public string Role { get; set; } = "user"; // "user" | "assistant"
    public string Content { get; set; } = "";
}

public sealed class AiChatRequest
{
    public string Provider { get; set; } = "anthropic"; // "anthropic" | "openai" | "azure"
    public string ApiKey { get; set; } = "";
    public string Model { get; set; } = "claude-opus-4-5";
    public string? AzureEndpoint { get; set; }  // only for "azure"
    public List<AiChatMessage> Messages { get; set; } = new();
    public AiChatContext Context { get; set; } = new();
}

public sealed class AiChatContext
{
    public string? Tsql { get; set; }
    public ControlFlowGraph? Cfg { get; set; }
    public RunResponse? RunResult { get; set; }
    public string? SelectedNodeId { get; set; }
}

public sealed class AiModelsRequest
{
    public string Provider { get; set; } = "";
    public string ApiKey { get; set; } = "";
}

// --- SQLite Sandbox Metadata ---

public sealed class SqliteRunMetadata
{
    public Dictionary<string, TablePreview> DataPreview { get; set; } = new();
    public List<string> TablesCreated { get; set; } = new();
    public int TotalRowsGenerated { get; set; }
}

public sealed class TablePreview
{
    public string TableName { get; set; } = "";
    public List<string> Columns { get; set; } = new();
    public List<List<object?>> SampleRows { get; set; } = new(); // First 3 rows as preview
    public int RowCount { get; set; }
}
