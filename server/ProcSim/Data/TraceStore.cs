using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace ProcSim.Data;

public class TraceDbContext : DbContext
{
    public TraceDbContext(DbContextOptions<TraceDbContext> options) : base(options) { }
    public DbSet<StoredRun> Runs => Set<StoredRun>();
}

public class StoredRun
{
    [Key]
    public string RunId { get; set; } = "";
    public string ProcName { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public string ResponseJson { get; set; } = "";
}

public sealed class TraceStore
{
    private readonly TraceDbContext _db;

    public TraceStore(TraceDbContext db)
    {
        _db = db;
    }

    public async Task SaveRunAsync(string runId, string procName, object response)
    {
        _db.Runs.Add(new StoredRun
        {
            RunId = runId,
            ProcName = procName,
            CreatedAt = DateTime.UtcNow,
            ResponseJson = JsonSerializer.Serialize(response, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase })
        });
        await _db.SaveChangesAsync();
    }

    public async Task<string?> GetRunAsync(string runId)
    {
        var run = await _db.Runs.FindAsync(runId);
        return run?.ResponseJson;
    }
}
