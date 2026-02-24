using ProcSim.Models;
using System.Diagnostics;
using System.Text.RegularExpressions;

namespace ProcSim.Services;

/// <summary>
/// Walks the CFG statically using parameter values to predict branch decisions.
/// No SQL Server connection required. Row counts are always 0. Results are empty.
/// </summary>
public sealed class DryRunSimulator
{
    public Task<RunResponse> SimulateAsync(RunRequest request, ControlFlowGraph cfg)
    {
        var runId = Guid.NewGuid().ToString("N")[..12];
        var trace = new List<TraceEvent>();
        var executedNodes = new HashSet<string>();
        var executedEdges = new HashSet<string>(); // Track edges actually taken
        int seq = 0;
        var sw = Stopwatch.StartNew();

        // Normalise params: ensure @-prefix, coerce types
        var paramMap = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        foreach (var (k, v) in request.Params ?? new())
        {
            var key = k.StartsWith("@") ? k : $"@{k}";
            paramMap[key] = v;
        }

        trace.Add(new TraceEvent
        {
            EventId = seq++,
            Timestamp = DateTime.UtcNow,
            EventType = "start",
            SqlText = "[Dry-run simulation — no SQL Server required]",
            DurationMs = 0
        });

        // Walk CFG from start
        WalkCfg(cfg, cfg.StartNodeId, paramMap, executedNodes, executedEdges, trace, ref seq, new HashSet<string>());

        trace.Add(new TraceEvent
        {
            EventId = seq++,
            Timestamp = DateTime.UtcNow,
            EventType = "complete",
            SqlText = $"Dry-run complete in {sw.Elapsed.TotalMilliseconds:F1}ms",
            DurationMs = sw.Elapsed.TotalMilliseconds
        });

        executedNodes.Add(cfg.StartNodeId);
        executedNodes.Add(cfg.EndNodeId);

        var mermaid = new MermaidGenerator().Generate(cfg, executedNodes);

        return Task.FromResult(new RunResponse
        {
            RunId = runId,
            Summary = new RunSummary
            {
                TotalStatements = trace.Count(e => e.EventType == "simulated"),
                TotalRowsAffected = 0,
                TotalDurationMs = sw.Elapsed.TotalMilliseconds,
                HadError = false,
                Mode = "dryrun"
            },
            Trace = trace,
            ExecutedNodes = executedNodes.ToList(),
            ExecutedEdges = executedEdges.ToList(),
            Mermaid = mermaid
        });
    }

    private void WalkCfg(
        ControlFlowGraph cfg,
        string nodeId,
        Dictionary<string, object?> paramMap,
        HashSet<string> executedNodes,
        HashSet<string> executedEdges,
        List<TraceEvent> trace,
        ref int seq,
        HashSet<string> visited,
        int depth = 0)
    {
        // Guard: stop infinite loops and excessive recursion
        if (visited.Contains(nodeId) || depth > 100) return;
        visited.Add(nodeId);

        var node = cfg.Nodes.FirstOrDefault(n => n.Id == nodeId);
        if (node == null) return;

        executedNodes.Add(node.Id);

        switch (node.NodeType)
        {
            case CfgNodeType.Branch:
                HandleBranch(cfg, node, paramMap, executedNodes, executedEdges, trace, ref seq, visited, depth);
                return;

            case CfgNodeType.Loop:
                HandleLoop(cfg, node, paramMap, executedNodes, executedEdges, trace, ref seq, visited, depth);
                return;

            case CfgNodeType.Start:
            case CfgNodeType.End:
            case CfgNodeType.Block:
                // Fall through to walk edges
                break;

            default:
                // Emit a simulated event for every statement node
                trace.Add(new TraceEvent
                {
                    EventId = seq++,
                    Timestamp = DateTime.UtcNow,
                    NodeId = node.Id,
                    EventType = "simulated",
                    SqlText = node.SqlSnippet.Length > 0 ? node.SqlSnippet : node.Label,
                    RowCount = 0,
                    DurationMs = 0
                });
                break;
        }

        // Follow all outgoing edges (for non-branch nodes, usually just one)
        foreach (var edge in node.OutEdges)
        {
            executedEdges.Add($"{node.Id}->{edge.TargetNodeId}");
            WalkCfg(cfg, edge.TargetNodeId, paramMap, executedNodes, executedEdges, trace, ref seq,
                    new HashSet<string>(visited), depth + 1);
        }
    }

    private void HandleBranch(
        ControlFlowGraph cfg,
        CfgNode node,
        Dictionary<string, object?> paramMap,
        HashSet<string> executedNodes,
        HashSet<string> executedEdges,
        List<TraceEvent> trace,
        ref int seq,
        HashSet<string> visited,
        int depth)
    {
        var prediction = TryEvaluatePredicate(node.SqlSnippet, paramMap);
        string branchLabel = prediction switch
        {
            true => "TRUE (predicted)",
            false => "FALSE (predicted)",
            null => "UNPREDICTABLE"
        };

        trace.Add(new TraceEvent
        {
            EventId = seq++,
            Timestamp = DateTime.UtcNow,
            NodeId = node.Id,
            EventType = "branch",
            SqlText = $"IF {node.SqlSnippet}",
            BranchTaken = branchLabel,
            DurationMs = 0
        });

        if (prediction == null)
        {
            // When unpredictable, walk both branches but DON'T mark edges as executed
            // This keeps the flow visualization clear - only show definite paths
            foreach (var edge in node.OutEdges)
            {
                WalkCfg(cfg, edge.TargetNodeId, paramMap, executedNodes, executedEdges, trace, ref seq,
                        new HashSet<string>(visited), depth + 1);
            }
        }
        else
        {
            // Walk only the matching branch and mark it as executed
            var targetCondition = prediction.Value ? "TRUE" : "FALSE";
            var matchingEdge = node.OutEdges.FirstOrDefault(e =>
                e.Condition?.StartsWith(targetCondition, StringComparison.OrdinalIgnoreCase) == true)
                ?? node.OutEdges.FirstOrDefault();

            if (matchingEdge != null)
            {
                executedEdges.Add($"{node.Id}->{matchingEdge.TargetNodeId}");
                WalkCfg(cfg, matchingEdge.TargetNodeId, paramMap, executedNodes, executedEdges, trace, ref seq,
                        new HashSet<string>(visited), depth + 1);
            }
        }
    }

    private void HandleLoop(
        ControlFlowGraph cfg,
        CfgNode node,
        Dictionary<string, object?> paramMap,
        HashSet<string> executedNodes,
        HashSet<string> executedEdges,
        List<TraceEvent> trace,
        ref int seq,
        HashSet<string> visited,
        int depth)
    {
        trace.Add(new TraceEvent
        {
            EventId = seq++,
            Timestamp = DateTime.UtcNow,
            NodeId = node.Id,
            EventType = "simulated",
            SqlText = $"WHILE {node.SqlSnippet} [simulated — 1 iteration shown]",
            DurationMs = 0
        });

        // Simulate one iteration of the loop body (body edge = not "done")
        var bodyEdge = node.OutEdges.FirstOrDefault(e => e.Condition != "done");
        if (bodyEdge != null)
        {
            executedEdges.Add($"{node.Id}->{bodyEdge.TargetNodeId}");
            WalkCfg(cfg, bodyEdge.TargetNodeId, paramMap, executedNodes, executedEdges, trace, ref seq,
                    new HashSet<string>(visited), depth + 1);
        }

        // Then take the exit edge
        var exitEdge = node.OutEdges.FirstOrDefault(e => e.Condition == "done");
        if (exitEdge != null)
        {
            executedEdges.Add($"{node.Id}->{exitEdge.TargetNodeId}");
            WalkCfg(cfg, exitEdge.TargetNodeId, paramMap, executedNodes, executedEdges, trace, ref seq,
                    new HashSet<string>(visited), depth + 1);
        }
    }

    /// <summary>
    /// Best-effort evaluation of simple T-SQL predicates using parameter values.
    /// Handles: @Param op literal (=, !=, <>, >, >=, <, <=), IS NULL, IS NOT NULL.
    /// Returns null when the predicate is too complex to evaluate statically.
    /// </summary>
    private static bool? TryEvaluatePredicate(string predicate, Dictionary<string, object?> paramMap)
    {
        if (string.IsNullOrWhiteSpace(predicate)) return null;

        var p = predicate.Trim();

        // IS NULL / IS NOT NULL
        var isNullMatch = Regex.Match(p, @"^(@\w+)\s+IS\s+(NOT\s+)?NULL$", RegexOptions.IgnoreCase);
        if (isNullMatch.Success)
        {
            var paramName = isNullMatch.Groups[1].Value;
            var isNot = isNullMatch.Groups[2].Success;
            if (!paramMap.TryGetValue(paramName, out var val)) return null;
            var isNull = val == null || val == DBNull.Value;
            return isNot ? !isNull : isNull;
        }

        // @Param op literal
        var cmpMatch = Regex.Match(p,
            @"^(@\w+)\s*(=|!=|<>|>=|<=|>|<)\s*(.+)$",
            RegexOptions.IgnoreCase);
        if (cmpMatch.Success)
        {
            var paramName = cmpMatch.Groups[1].Value;
            var op = cmpMatch.Groups[2].Value;
            var literalStr = cmpMatch.Groups[3].Value.Trim().Trim('\'');

            if (!paramMap.TryGetValue(paramName, out var paramVal)) return null;
            if (paramVal == null) return null;

            // Try numeric comparison first
            if (double.TryParse(paramVal.ToString(), out var pNum) &&
                double.TryParse(literalStr, out var lNum))
            {
                return op switch
                {
                    "=" => pNum == lNum,
                    "!=" or "<>" => pNum != lNum,
                    ">" => pNum > lNum,
                    ">=" => pNum >= lNum,
                    "<" => pNum < lNum,
                    "<=" => pNum <= lNum,
                    _ => null
                };
            }

            // String comparison
            var pStr = paramVal.ToString() ?? "";
            var result = string.Compare(pStr, literalStr, StringComparison.OrdinalIgnoreCase);
            return op switch
            {
                "=" => result == 0,
                "!=" or "<>" => result != 0,
                ">" => result > 0,
                ">=" => result >= 0,
                "<" => result < 0,
                "<=" => result <= 0,
                _ => null
            };
        }

        return null; // Too complex — fall back to UNPREDICTABLE
    }
}
