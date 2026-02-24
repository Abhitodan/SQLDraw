namespace ProcSim.Models;

public sealed class TraceEvent
{
    public int EventId { get; set; }
    public DateTime Timestamp { get; set; }
    public string? NodeId { get; set; }
    public string EventType { get; set; } = ""; // statement, branch, error, resultset, txn
    public string SqlText { get; set; } = "";
    public int? RowCount { get; set; }
    public int? ErrorNumber { get; set; }
    public string? ErrorMessage { get; set; }
    public List<string>? ResultSetColumns { get; set; }
    public List<List<object?>>? ResultSetPreviewRows { get; set; }
    public string? BranchTaken { get; set; }
    public double DurationMs { get; set; }
}
