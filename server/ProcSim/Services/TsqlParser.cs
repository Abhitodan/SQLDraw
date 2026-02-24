using Microsoft.SqlServer.TransactSql.ScriptDom;
using ProcSim.Models;
using System.Text;

namespace ProcSim.Services;

public sealed class TsqlParser
{
    private int _nodeCounter;

    private string NextId() => $"N{_nodeCounter++}";

    /// <summary>
    /// Parse a CREATE/ALTER PROCEDURE statement and extract the body + parameters.
    /// If raw T-SQL statements are provided (not wrapped in a proc), parse them directly.
    /// </summary>
    public (ControlFlowGraph Cfg, List<ProcParameter> Params) Parse(string tsql)
    {
        var parser = new TSql160Parser(initialQuotedIdentifiers: true);
        IList<ParseError> errors;
        using var reader = new StringReader(tsql);
        var fragment = parser.Parse(reader, out errors);

        if (errors.Count > 0)
        {
            var msg = string.Join("; ", errors.Select(e => $"Line {e.Line}: {e.Message}"));
            throw new InvalidOperationException($"T-SQL parse errors: {msg}");
        }

        var script = fragment as TSqlScript
            ?? throw new InvalidOperationException("Could not parse as TSqlScript");

        // Look for a CREATE/ALTER PROCEDURE
        ProcedureStatementBody? procBody = null;
        List<ProcParameter> parameters = new();

        foreach (var batch in script.Batches)
        {
            foreach (var stmt in batch.Statements)
            {
                if (stmt is CreateProcedureStatement cps)
                {
                    procBody = cps;
                    parameters = ExtractParameters(cps.Parameters);
                    break;
                }
                if (stmt is AlterProcedureStatement aps)
                {
                    procBody = aps;
                    parameters = ExtractParameters(aps.Parameters);
                    break;
                }
            }
            if (procBody != null) break;
        }

        _nodeCounter = 0;
        var startNode = new CfgNode { Id = NextId(), NodeType = CfgNodeType.Start, Label = "START" };
        var endNode = new CfgNode { Id = NextId(), NodeType = CfgNodeType.End, Label = "END" };

        var cfg = new ControlFlowGraph
        {
            StartNodeId = startNode.Id,
            EndNodeId = endNode.Id,
            Nodes = new List<CfgNode> { startNode, endNode }
        };

        if (procBody != null)
        {
            var bodyStatements = procBody.StatementList.Statements;
            BuildCfgFromStatements(bodyStatements, cfg, startNode, endNode, tsql);
        }
        else
        {
            // Treat as raw T-SQL batch
            var allStatements = script.Batches.SelectMany(b => b.Statements).ToList();
            BuildCfgFromStatements(allStatements, cfg, startNode, endNode, tsql);
        }

        // If start has no out-edges, connect directly to end
        if (startNode.OutEdges.Count == 0)
            startNode.OutEdges.Add(new CfgEdge { TargetNodeId = endNode.Id });

        return (cfg, parameters);
    }

    private void BuildCfgFromStatements(
        IList<TSqlStatement> statements,
        ControlFlowGraph cfg,
        CfgNode entryNode,
        CfgNode exitNode,
        string sourceText)
    {
        var currentNode = entryNode;

        for (int i = 0; i < statements.Count; i++)
        {
            var stmt = statements[i];
            bool isLast = i == statements.Count - 1;
            var nextExit = isLast ? exitNode : null;

            currentNode = ProcessStatement(stmt, cfg, currentNode, exitNode, sourceText, nextExit);
        }

        // Connect last node to exit if not already connected
        if (currentNode.Id != exitNode.Id && !currentNode.OutEdges.Any(e => e.TargetNodeId == exitNode.Id))
        {
            currentNode.OutEdges.Add(new CfgEdge { TargetNodeId = exitNode.Id });
        }
    }

    private CfgNode ProcessStatement(
        TSqlStatement stmt,
        ControlFlowGraph cfg,
        CfgNode currentNode,
        CfgNode exitNode,
        string sourceText,
        CfgNode? nextExit)
    {
        switch (stmt)
        {
            case IfStatement ifStmt:
                return ProcessIf(ifStmt, cfg, currentNode, exitNode, sourceText);

            case WhileStatement whileStmt:
                return ProcessWhile(whileStmt, cfg, currentNode, exitNode, sourceText);

            case TryCatchStatement tryCatch:
                return ProcessTryCatch(tryCatch, cfg, currentNode, exitNode, sourceText);

            case BeginEndBlockStatement block:
                return ProcessBlock(block.StatementList.Statements, cfg, currentNode, exitNode, sourceText);

            case BeginTransactionStatement:
                return AddSimpleNode(stmt, CfgNodeType.Transaction, "BEGIN TRAN", cfg, currentNode, sourceText);

            case CommitTransactionStatement:
                return AddSimpleNode(stmt, CfgNodeType.Transaction, "COMMIT", cfg, currentNode, sourceText);

            case RollbackTransactionStatement:
                return AddSimpleNode(stmt, CfgNodeType.Transaction, "ROLLBACK", cfg, currentNode, sourceText);

            case SelectStatement:
                return AddSimpleNode(stmt, CfgNodeType.Select, TruncateLabel(GetSnippet(stmt, sourceText), 60), cfg, currentNode, sourceText);

            case InsertStatement:
                return AddSimpleNode(stmt, CfgNodeType.Dml, TruncateLabel(GetSnippet(stmt, sourceText), 60), cfg, currentNode, sourceText);

            case UpdateStatement:
                return AddSimpleNode(stmt, CfgNodeType.Dml, TruncateLabel(GetSnippet(stmt, sourceText), 60), cfg, currentNode, sourceText);

            case DeleteStatement:
                return AddSimpleNode(stmt, CfgNodeType.Dml, TruncateLabel(GetSnippet(stmt, sourceText), 60), cfg, currentNode, sourceText);

            case MergeStatement:
                return AddSimpleNode(stmt, CfgNodeType.Dml, TruncateLabel(GetSnippet(stmt, sourceText), 60), cfg, currentNode, sourceText);

            case ExecuteStatement:
                return AddSimpleNode(stmt, CfgNodeType.Call, TruncateLabel(GetSnippet(stmt, sourceText), 60), cfg, currentNode, sourceText);

            default:
                // Check for dynamic SQL patterns
                if (IsDynamicSql(stmt))
                    return AddSimpleNode(stmt, CfgNodeType.DynamicSql, TruncateLabel(GetSnippet(stmt, sourceText), 60), cfg, currentNode, sourceText);

                return AddSimpleNode(stmt, CfgNodeType.Statement, TruncateLabel(GetSnippet(stmt, sourceText), 60), cfg, currentNode, sourceText);
        }
    }

    private CfgNode ProcessIf(IfStatement ifStmt, ControlFlowGraph cfg, CfgNode currentNode, CfgNode exitNode, string sourceText)
    {
        var conditionText = GetFragmentText(ifStmt.Predicate, sourceText);
        var branchNode = new CfgNode
        {
            Id = NextId(),
            NodeType = CfgNodeType.Branch,
            Label = $"IF {TruncateLabel(conditionText, 50)}",
            SqlSnippet = conditionText,
            StartLine = ifStmt.StartLine,
            EndLine = ifStmt.StartLine
        };
        cfg.Nodes.Add(branchNode);
        currentNode.OutEdges.Add(new CfgEdge { TargetNodeId = branchNode.Id });

        // Merge point after IF/ELSE
        var mergeNode = new CfgNode
        {
            Id = NextId(),
            NodeType = CfgNodeType.Statement,
            Label = "(merge)"
        };
        cfg.Nodes.Add(mergeNode);

        // TRUE branch
        var trueEntry = new CfgNode { Id = NextId(), NodeType = CfgNodeType.Block, Label = "then" };
        cfg.Nodes.Add(trueEntry);
        branchNode.OutEdges.Add(new CfgEdge { TargetNodeId = trueEntry.Id, Condition = "TRUE" });

        var trueTail = ProcessStatementAsBlock(ifStmt.ThenStatement, cfg, trueEntry, exitNode, sourceText);
        if (!trueTail.OutEdges.Any(e => e.TargetNodeId == mergeNode.Id || e.TargetNodeId == exitNode.Id))
            trueTail.OutEdges.Add(new CfgEdge { TargetNodeId = mergeNode.Id });

        // FALSE branch
        if (ifStmt.ElseStatement != null)
        {
            var falseEntry = new CfgNode { Id = NextId(), NodeType = CfgNodeType.Block, Label = "else" };
            cfg.Nodes.Add(falseEntry);
            branchNode.OutEdges.Add(new CfgEdge { TargetNodeId = falseEntry.Id, Condition = "FALSE" });

            var falseTail = ProcessStatementAsBlock(ifStmt.ElseStatement, cfg, falseEntry, exitNode, sourceText);
            if (!falseTail.OutEdges.Any(e => e.TargetNodeId == mergeNode.Id || e.TargetNodeId == exitNode.Id))
                falseTail.OutEdges.Add(new CfgEdge { TargetNodeId = mergeNode.Id });
        }
        else
        {
            branchNode.OutEdges.Add(new CfgEdge { TargetNodeId = mergeNode.Id, Condition = "FALSE" });
        }

        return mergeNode;
    }

    private CfgNode ProcessWhile(WhileStatement whileStmt, ControlFlowGraph cfg, CfgNode currentNode, CfgNode exitNode, string sourceText)
    {
        var conditionText = GetFragmentText(whileStmt.Predicate, sourceText);
        var loopNode = new CfgNode
        {
            Id = NextId(),
            NodeType = CfgNodeType.Loop,
            Label = $"WHILE {TruncateLabel(conditionText, 50)}",
            SqlSnippet = conditionText,
            StartLine = whileStmt.StartLine,
            EndLine = whileStmt.StartLine
        };
        cfg.Nodes.Add(loopNode);
        currentNode.OutEdges.Add(new CfgEdge { TargetNodeId = loopNode.Id });

        // Exit node for loop
        var loopExitNode = new CfgNode { Id = NextId(), NodeType = CfgNodeType.Statement, Label = "(loop exit)" };
        cfg.Nodes.Add(loopExitNode);

        // Loop body
        var bodyTail = ProcessStatementAsBlock(whileStmt.Statement, cfg, loopNode, exitNode, sourceText);
        // Loop back
        if (!bodyTail.OutEdges.Any(e => e.TargetNodeId == loopNode.Id))
            bodyTail.OutEdges.Add(new CfgEdge { TargetNodeId = loopNode.Id, Condition = "loop back" });

        // Exit condition
        loopNode.OutEdges.Add(new CfgEdge { TargetNodeId = loopExitNode.Id, Condition = "done" });

        return loopExitNode;
    }

    private CfgNode ProcessTryCatch(TryCatchStatement tryCatch, ControlFlowGraph cfg, CfgNode currentNode, CfgNode exitNode, string sourceText)
    {
        var tryNode = new CfgNode
        {
            Id = NextId(),
            NodeType = CfgNodeType.TryCatch,
            Label = "BEGIN TRY",
            StartLine = tryCatch.StartLine,
            EndLine = tryCatch.StartLine
        };
        cfg.Nodes.Add(tryNode);
        currentNode.OutEdges.Add(new CfgEdge { TargetNodeId = tryNode.Id });

        var mergeNode = new CfgNode { Id = NextId(), NodeType = CfgNodeType.Statement, Label = "(try/catch merge)" };
        cfg.Nodes.Add(mergeNode);

        // TRY body
        var tryTail = ProcessBlock(tryCatch.TryStatements.Statements, cfg, tryNode, exitNode, sourceText);
        if (!tryTail.OutEdges.Any(e => e.TargetNodeId == mergeNode.Id))
            tryTail.OutEdges.Add(new CfgEdge { TargetNodeId = mergeNode.Id, Condition = "success" });

        // CATCH block
        var catchNode = new CfgNode
        {
            Id = NextId(),
            NodeType = CfgNodeType.CatchBlock,
            Label = "BEGIN CATCH",
            StartLine = tryCatch.CatchStatements.Statements.FirstOrDefault()?.StartLine ?? tryCatch.StartLine
        };
        cfg.Nodes.Add(catchNode);
        tryNode.OutEdges.Add(new CfgEdge { TargetNodeId = catchNode.Id, Condition = "error" });

        var catchTail = ProcessBlock(tryCatch.CatchStatements.Statements, cfg, catchNode, exitNode, sourceText);
        if (!catchTail.OutEdges.Any(e => e.TargetNodeId == mergeNode.Id))
            catchTail.OutEdges.Add(new CfgEdge { TargetNodeId = mergeNode.Id, Condition = "handled" });

        return mergeNode;
    }

    private CfgNode ProcessBlock(IList<TSqlStatement> statements, ControlFlowGraph cfg, CfgNode entryNode, CfgNode exitNode, string sourceText)
    {
        var current = entryNode;
        foreach (var stmt in statements)
        {
            current = ProcessStatement(stmt, cfg, current, exitNode, sourceText, null);
        }
        return current;
    }

    private CfgNode ProcessStatementAsBlock(TSqlStatement stmt, ControlFlowGraph cfg, CfgNode entryNode, CfgNode exitNode, string sourceText)
    {
        if (stmt is BeginEndBlockStatement block)
            return ProcessBlock(block.StatementList.Statements, cfg, entryNode, exitNode, sourceText);
        else
            return ProcessStatement(stmt, cfg, entryNode, exitNode, sourceText, null);
    }

    private CfgNode AddSimpleNode(TSqlStatement stmt, CfgNodeType nodeType, string label, ControlFlowGraph cfg, CfgNode currentNode, string sourceText)
    {
        var node = new CfgNode
        {
            Id = NextId(),
            NodeType = nodeType,
            Label = label,
            SqlSnippet = GetSnippet(stmt, sourceText),
            StartLine = stmt.StartLine,
            EndLine = stmt.StartLine + CountLines(GetSnippet(stmt, sourceText)) - 1
        };
        cfg.Nodes.Add(node);
        currentNode.OutEdges.Add(new CfgEdge { TargetNodeId = node.Id });
        return node;
    }

    private bool IsDynamicSql(TSqlStatement stmt)
    {
        var snippet = GetSnippetFromFragment(stmt);
        return snippet.Contains("sp_executesql", StringComparison.OrdinalIgnoreCase)
            || (snippet.Contains("EXEC", StringComparison.OrdinalIgnoreCase) && snippet.Contains("@", StringComparison.Ordinal));
    }

    private List<ProcParameter> ExtractParameters(IList<ProcedureParameter> parameters)
    {
        var result = new List<ProcParameter>();
        foreach (var p in parameters)
        {
            var param = new ProcParameter
            {
                Name = p.VariableName.Value,
                SqlType = GetFragmentTextDirect(p.DataType),
                IsOutput = p.Modifier == ParameterModifier.Output,
                HasDefault = p.Value != null,
                DefaultValue = p.Value != null ? GetFragmentTextDirect(p.Value) : null
            };
            result.Add(param);
        }
        return result;
    }

    private string GetSnippet(TSqlStatement stmt, string sourceText)
    {
        return GetFragmentText(stmt, sourceText);
    }

    private string GetFragmentText(TSqlFragment fragment, string sourceText)
    {
        if (fragment.StartOffset >= 0 && fragment.FragmentLength > 0
            && fragment.StartOffset + fragment.FragmentLength <= sourceText.Length)
        {
            return sourceText.Substring(fragment.StartOffset, fragment.FragmentLength).Trim();
        }
        return GetFragmentTextDirect(fragment);
    }

    private string GetFragmentTextDirect(TSqlFragment fragment)
    {
        var sb = new StringBuilder();
        for (int i = fragment.FirstTokenIndex; i <= fragment.LastTokenIndex; i++)
        {
            sb.Append(fragment.ScriptTokenStream[i].Text);
        }
        return sb.ToString().Trim();
    }

    private string GetSnippetFromFragment(TSqlStatement stmt)
    {
        return GetFragmentTextDirect(stmt);
    }

    private static string TruncateLabel(string text, int maxLen)
    {
        // Collapse whitespace
        var clean = System.Text.RegularExpressions.Regex.Replace(text, @"\s+", " ").Trim();
        if (clean.Length <= maxLen) return clean;
        return clean[..maxLen] + "...";
    }

    private static int CountLines(string text) => text.Split('\n').Length;
}
