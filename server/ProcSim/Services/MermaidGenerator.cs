using ProcSim.Models;
using System.Text;

namespace ProcSim.Services;

public sealed class MermaidGenerator
{
    /// <summary>
    /// Generate Mermaid flowchart text from a CFG.
    /// Optionally highlight a set of executed node IDs.
    /// </summary>
    public string Generate(ControlFlowGraph cfg, HashSet<string>? executedNodes = null)
    {
        var sb = new StringBuilder();
        sb.AppendLine("flowchart TD");

        foreach (var node in cfg.Nodes)
        {
            var safeLabel = EscapeMermaid(node.Label);

            switch (node.NodeType)
            {
                case CfgNodeType.Start:
                case CfgNodeType.End:
                    sb.AppendLine($"    {node.Id}([{safeLabel}])");
                    break;
                case CfgNodeType.Branch:
                    sb.AppendLine($"    {node.Id}{{{{{safeLabel}}}}}");
                    break;
                case CfgNodeType.Loop:
                    sb.AppendLine($"    {node.Id}{{{{{safeLabel}}}}}");
                    break;
                case CfgNodeType.TryCatch:
                case CfgNodeType.CatchBlock:
                    sb.AppendLine($"    {node.Id}[/{safeLabel}/]");
                    break;
                case CfgNodeType.Transaction:
                    sb.AppendLine($"    {node.Id}[({safeLabel})]");
                    break;
                case CfgNodeType.Call:
                    sb.AppendLine($"    {node.Id}[[{safeLabel}]]");
                    break;
                case CfgNodeType.DynamicSql:
                    sb.AppendLine($"    {node.Id}>{safeLabel}]");
                    break;
                case CfgNodeType.Dml:
                    sb.AppendLine($"    {node.Id}[{safeLabel}]");
                    break;
                case CfgNodeType.Select:
                    sb.AppendLine($"    {node.Id}[{safeLabel}]");
                    break;
                default:
                    // Block / Statement / merge nodes
                    if (node.Label.StartsWith("(") && node.Label.EndsWith(")"))
                    {
                        // Merge nodes: render small
                        sb.AppendLine($"    {node.Id}(({safeLabel}))");
                    }
                    else
                    {
                        sb.AppendLine($"    {node.Id}[{safeLabel}]");
                    }
                    break;
            }
        }

        sb.AppendLine();

        // Edges
        foreach (var node in cfg.Nodes)
        {
            foreach (var edge in node.OutEdges)
            {
                if (!string.IsNullOrEmpty(edge.Condition))
                    sb.AppendLine($"    {node.Id} -->|{EscapeMermaid(edge.Condition)}| {edge.TargetNodeId}");
                else
                    sb.AppendLine($"    {node.Id} --> {edge.TargetNodeId}");
            }
        }

        // Style executed nodes
        if (executedNodes != null && executedNodes.Count > 0)
        {
            sb.AppendLine();
            foreach (var nodeId in executedNodes)
            {
                sb.AppendLine($"    style {nodeId} fill:#2ecc71,stroke:#27ae60,color:#fff");
            }
        }

        return sb.ToString();
    }

    private static string EscapeMermaid(string text)
    {
        // Mermaid special chars that need escaping in labels
        return text
            .Replace("\"", "#quot;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("{", "#lbrace;")
            .Replace("}", "#rbrace;");
    }
}
