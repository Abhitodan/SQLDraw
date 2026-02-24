using ProcSim.Models;
using ProcSim.Services;

namespace ProcSim.Tests;

public class TsqlParserTests
{
    private readonly TsqlParser _parser = new();

    [Fact]
    public void Parse_SimpleSelect_ProducesLinearCfg()
    {
        var tsql = @"
CREATE PROCEDURE dbo.usp_Test
    @Id INT
AS
BEGIN
    SELECT * FROM Products WHERE Id = @Id;
END";

        var (cfg, parms) = _parser.Parse(tsql);

        Assert.NotNull(cfg);
        Assert.Equal("N0", cfg.StartNodeId);
        Assert.Equal("N1", cfg.EndNodeId);
        Assert.True(cfg.Nodes.Count >= 3); // START, SELECT, END
        Assert.Single(parms);
        Assert.Equal("@Id", parms[0].Name);
        Assert.Equal("INT", parms[0].SqlType.Trim().ToUpper());
    }

    [Fact]
    public void Parse_IfElse_ProducesBranchNode()
    {
        var tsql = @"
CREATE PROCEDURE dbo.usp_Branch
    @X INT
AS
BEGIN
    IF @X > 0
    BEGIN
        UPDATE T SET A = 1;
    END
    ELSE
    BEGIN
        DELETE FROM T;
    END
END";

        var (cfg, _) = _parser.Parse(tsql);

        var branchNodes = cfg.Nodes.Where(n => n.NodeType == CfgNodeType.Branch).ToList();
        Assert.Single(branchNodes);

        var branch = branchNodes[0];
        Assert.Equal(2, branch.OutEdges.Count);
        Assert.Contains(branch.OutEdges, e => e.Condition == "TRUE");
        Assert.Contains(branch.OutEdges, e => e.Condition == "FALSE");
    }

    [Fact]
    public void Parse_WhileLoop_ProducesLoopNode()
    {
        var tsql = @"
CREATE PROCEDURE dbo.usp_Loop
AS
BEGIN
    DECLARE @I INT = 0;
    WHILE @I < 10
    BEGIN
        SET @I = @I + 1;
    END
END";

        var (cfg, _) = _parser.Parse(tsql);

        var loopNodes = cfg.Nodes.Where(n => n.NodeType == CfgNodeType.Loop).ToList();
        Assert.Single(loopNodes);
        Assert.Contains(loopNodes[0].OutEdges, e => e.Condition == "done");
    }

    [Fact]
    public void Parse_TryCatch_ProducesTryCatchAndCatchNodes()
    {
        var tsql = @"
CREATE PROCEDURE dbo.usp_TryCatch
AS
BEGIN
    BEGIN TRY
        SELECT 1;
    END TRY
    BEGIN CATCH
        SELECT ERROR_MESSAGE();
    END CATCH
END";

        var (cfg, _) = _parser.Parse(tsql);

        Assert.Contains(cfg.Nodes, n => n.NodeType == CfgNodeType.TryCatch);
        Assert.Contains(cfg.Nodes, n => n.NodeType == CfgNodeType.CatchBlock);

        var tryNode = cfg.Nodes.First(n => n.NodeType == CfgNodeType.TryCatch);
        Assert.Contains(tryNode.OutEdges, e => e.Condition == "error");
    }

    [Fact]
    public void Parse_Transaction_ProducesTransactionNodes()
    {
        var tsql = @"
CREATE PROCEDURE dbo.usp_Txn
AS
BEGIN
    BEGIN TRANSACTION;
    UPDATE T SET X = 1;
    COMMIT TRANSACTION;
END";

        var (cfg, _) = _parser.Parse(tsql);

        var txnNodes = cfg.Nodes.Where(n => n.NodeType == CfgNodeType.Transaction).ToList();
        Assert.Equal(2, txnNodes.Count); // BEGIN TRAN + COMMIT
    }

    [Fact]
    public void Parse_MultipleParameters_ExtractsAll()
    {
        var tsql = @"
CREATE PROCEDURE dbo.usp_Multi
    @A INT,
    @B NVARCHAR(100) = 'hello',
    @C DECIMAL(10,2) OUTPUT
AS
BEGIN
    SELECT 1;
END";

        var (_, parms) = _parser.Parse(tsql);

        Assert.Equal(3, parms.Count);
        Assert.Equal("@A", parms[0].Name);
        Assert.False(parms[0].HasDefault);
        Assert.False(parms[0].IsOutput);

        Assert.Equal("@B", parms[1].Name);
        Assert.True(parms[1].HasDefault);

        Assert.Equal("@C", parms[2].Name);
        Assert.True(parms[2].IsOutput);
    }

    [Fact]
    public void Parse_ExecStatement_ProducesCallNode()
    {
        var tsql = @"
CREATE PROCEDURE dbo.usp_Caller
AS
BEGIN
    EXEC dbo.usp_Other @Param = 1;
END";

        var (cfg, _) = _parser.Parse(tsql);

        Assert.Contains(cfg.Nodes, n => n.NodeType == CfgNodeType.Call);
    }
}

public class MermaidGeneratorTests
{
    [Fact]
    public void Generate_SimpleCfg_ProducesValidMermaid()
    {
        var cfg = new ControlFlowGraph
        {
            StartNodeId = "N0",
            EndNodeId = "N1",
            Nodes = new List<CfgNode>
            {
                new() { Id = "N0", NodeType = CfgNodeType.Start, Label = "START", OutEdges = new() { new() { TargetNodeId = "N2" } } },
                new() { Id = "N2", NodeType = CfgNodeType.Select, Label = "SELECT 1", OutEdges = new() { new() { TargetNodeId = "N1" } } },
                new() { Id = "N1", NodeType = CfgNodeType.End, Label = "END", OutEdges = new() },
            }
        };

        var gen = new MermaidGenerator();
        var mermaid = gen.Generate(cfg);

        Assert.Contains("flowchart TD", mermaid);
        Assert.Contains("N0", mermaid);
        Assert.Contains("N1", mermaid);
        Assert.Contains("N0 --> N2", mermaid);
        Assert.Contains("N2 --> N1", mermaid);
    }

    [Fact]
    public void Generate_WithExecutedNodes_AddsGreenStyling()
    {
        var cfg = new ControlFlowGraph
        {
            StartNodeId = "N0",
            EndNodeId = "N1",
            Nodes = new List<CfgNode>
            {
                new() { Id = "N0", NodeType = CfgNodeType.Start, Label = "START", OutEdges = new() { new() { TargetNodeId = "N1" } } },
                new() { Id = "N1", NodeType = CfgNodeType.End, Label = "END", OutEdges = new() },
            }
        };

        var gen = new MermaidGenerator();
        var mermaid = gen.Generate(cfg, new HashSet<string> { "N0" });

        Assert.Contains("style N0 fill:#2ecc71", mermaid);
    }
}

public class ProcFetcherTests
{
    [Theory]
    [InlineData("Server=localhost;Database=master")]
    [InlineData("Server=localhost;Database=msdb")]
    [InlineData("Server=localhost;Database=model")]
    [InlineData("Server=localhost;Database=tempdb")]
    public void ValidateConnectionString_RejectsSystemDatabases(string connStr)
    {
        Assert.Throws<InvalidOperationException>(() =>
            ProcFetcher.ValidateConnectionString(connStr));
    }

    [Fact]
    public void ValidateConnectionString_AcceptsUserDatabase()
    {
        // Should not throw
        ProcFetcher.ValidateConnectionString("Server=localhost;Database=MyAppDB");
    }
}
