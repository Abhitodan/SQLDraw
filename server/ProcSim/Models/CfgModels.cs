namespace ProcSim.Models;

public enum CfgNodeType
{
    Start,
    End,
    Statement,
    Branch,
    Loop,
    Dml,
    Select,
    Call,
    TryCatch,
    CatchBlock,
    Transaction,
    DynamicSql,
    Block
}

public sealed class CfgNode
{
    public string Id { get; set; } = "";
    public CfgNodeType NodeType { get; set; }
    public string Label { get; set; } = "";
    public string SqlSnippet { get; set; } = "";
    public int StartLine { get; set; }
    public int EndLine { get; set; }
    public List<CfgEdge> OutEdges { get; set; } = new();
}

public sealed class CfgEdge
{
    public string TargetNodeId { get; set; } = "";
    public string? Condition { get; set; }
}

public sealed class ControlFlowGraph
{
    public string StartNodeId { get; set; } = "";
    public string EndNodeId { get; set; } = "";
    public List<CfgNode> Nodes { get; set; } = new();
}

public sealed class ProcParameter
{
    public string Name { get; set; } = "";
    public string SqlType { get; set; } = "";
    public bool HasDefault { get; set; }
    public string? DefaultValue { get; set; }
    public bool IsOutput { get; set; }
}
