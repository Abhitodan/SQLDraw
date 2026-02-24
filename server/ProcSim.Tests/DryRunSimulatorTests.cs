using ProcSim.Models;
using ProcSim.Services;

namespace ProcSim.Tests;

public class DryRunSimulatorTests
{
    private readonly TsqlParser _parser = new();
    private readonly DryRunSimulator _simulator = new();

    [Fact]
    public async Task Simulate_SimpleSelect_ProducesSimulatedResultsetEvent()
    {
        var tsql = @"CREATE PROCEDURE dbo.usp_Test AS BEGIN SELECT * FROM T; END";
        var (cfg, _) = _parser.Parse(tsql);
        var req = new RunRequest { Mode = "dryrun", Tsql = tsql };
        var result = await _simulator.SimulateAsync(req, cfg);
        Assert.NotNull(result);
        Assert.Contains(result.Trace, e => e.EventType == "simulated");
        Assert.Equal("dryrun", result.Summary.Mode);
    }

    [Fact]
    public async Task Simulate_IfBranch_PredictsCorrectBranch()
    {
        var tsql = @"CREATE PROCEDURE dbo.usp_Branch @X INT AS BEGIN
            IF @X > 0 BEGIN SELECT 'positive'; END
            ELSE BEGIN SELECT 'negative'; END
        END";
        var (cfg, _) = _parser.Parse(tsql);
        var req = new RunRequest
        {
            Mode = "dryrun",
            Tsql = tsql,
            Params = new Dictionary<string, object?> { { "@X", 5 } }
        };
        var result = await _simulator.SimulateAsync(req, cfg);
        var branchEvt = result.Trace.FirstOrDefault(e => e.EventType == "branch");
        Assert.NotNull(branchEvt);
        Assert.Contains("TRUE", branchEvt!.BranchTaken ?? "");
    }

    [Fact]
    public async Task Simulate_NoConnectionStringRequired()
    {
        var tsql = @"CREATE PROCEDURE dbo.usp_Test AS BEGIN SELECT 1; END";
        var (cfg, _) = _parser.Parse(tsql);
        var req = new RunRequest { Mode = "dryrun", Tsql = tsql, ConnectionString = null };
        // Should not throw even with null connection string
        var ex = await Record.ExceptionAsync(() => _simulator.SimulateAsync(req, cfg));
        Assert.Null(ex);
    }
}
