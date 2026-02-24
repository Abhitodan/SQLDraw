using Microsoft.EntityFrameworkCore;
using ProcSim.Data;
using ProcSim.Models;
using ProcSim.Services;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

// Services
builder.Services.AddDbContext<TraceDbContext>(opt =>
    opt.UseSqlite("Data Source=procsim_traces.db"));
builder.Services.AddScoped<TraceStore>();
builder.Services.AddSingleton<TsqlParser>();
builder.Services.AddSingleton<MermaidGenerator>();
builder.Services.AddSingleton<ProcFetcher>();
builder.Services.AddScoped<ProcExecutor>();
builder.Services.AddSingleton<DryRunSimulator>();
builder.Services.AddSingleton<SqliteSandboxExecutor>();
builder.Services.AddSingleton<AiChatService>();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// Ensure DB created
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TraceDbContext>();
    db.Database.EnsureCreated();
}

app.UseCors();
app.UseStaticFiles();

var jsonOpts = new JsonSerializerOptions 
{ 
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    PropertyNameCaseInsensitive = true,
    WriteIndented = false,
    DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
};

// ============================================================
// POST /api/proc/parse
// ============================================================
app.MapPost("/api/proc/parse", async (ParseRequest req, TsqlParser parser, MermaidGenerator mermaidGen, ProcFetcher fetcher) =>
{
    try
    {
        string tsql;

        if (!string.IsNullOrWhiteSpace(req.Tsql))
        {
            tsql = req.Tsql;
        }
        else if (!string.IsNullOrWhiteSpace(req.ConnectionString) && !string.IsNullOrWhiteSpace(req.ProcName))
        {
            tsql = await fetcher.FetchDefinitionAsync(req.ConnectionString, req.ProcName);
        }
        else
        {
            return Results.BadRequest(new { error = "Provide either 'tsql' or both 'connectionString' and 'procName'." });
        }

        var (cfg, parameters) = parser.Parse(tsql);
        var mermaid = mermaidGen.Generate(cfg);

        return Results.Json(new ParseResponse
        {
            Cfg = cfg,
            Mermaid = mermaid,
            Params = parameters
        }, jsonOpts);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// ============================================================
// POST /api/proc/run
// ============================================================
app.MapPost("/api/proc/run", async (RunRequest req, TsqlParser parser, ProcExecutor sqlExecutor,
    DryRunSimulator dryRun, SqliteSandboxExecutor sqliteSandbox, TraceStore store) =>
{
    try
    {
        string tsql;
        ProcFetcher fetcher = new();

        if (!string.IsNullOrWhiteSpace(req.Tsql))
            tsql = req.Tsql;
        else if (!string.IsNullOrWhiteSpace(req.ConnectionString) && !string.IsNullOrWhiteSpace(req.ProcName))
            tsql = await fetcher.FetchDefinitionAsync(req.ConnectionString, req.ProcName);
        else
            return Results.BadRequest(new { error = "Provide either 'tsql' or both 'connectionString' and 'procName'." });

        var (cfg, _) = parser.Parse(tsql);

        RunResponse result = req.Mode switch
        {
            "dryrun" => await dryRun.SimulateAsync(req, cfg),
            "sqlite" => await sqliteSandbox.ExecuteAsync(req, cfg),
            _ => await sqlExecutor.ExecuteAsync(req, cfg) // "rollback" | "commit" — needs connection string
        };

        await store.SaveRunAsync(result.RunId, req.ProcName ?? "(inline)", result);
        return Results.Json(result, jsonOpts);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// ============================================================
// GET /api/proc/run/{runId}
// ============================================================
app.MapGet("/api/proc/run/{runId}", async (string runId, TraceStore store) =>
{
    var json = await store.GetRunAsync(runId);
    if (json == null)
        return Results.NotFound(new { error = "Run not found." });

    return Results.Content(json, "application/json");
});

// ============================================================
// GET /api/proc/samples
// ============================================================
app.MapGet("/api/proc/samples", () =>
{
    var samples = new[]
    {
        new
        {
            name = "usp_GetProducts (Simple SELECT)",
            description = "Simple product lookup with parameter and two result sets.",
            tsql = @"CREATE PROCEDURE dbo.usp_GetProducts
    @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;

    SELECT ProductId, Name, Price, Stock
    FROM dbo.Products
    WHERE IsActive = @IsActive
    ORDER BY Name;

    SELECT COUNT(*) AS TotalProducts
    FROM dbo.Products
    WHERE IsActive = @IsActive;
END"
        },
        new
        {
            name = "usp_AddOrderItem (IF/ELSE)",
            description = "Adds an order item with stock validation using IF/ELSE branching.",
            tsql = @"CREATE PROCEDURE dbo.usp_AddOrderItem
    @OrderId    INT,
    @ProductId  INT,
    @Quantity   INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Stock INT, @Price DECIMAL(10,2);

    SELECT @Stock = Stock, @Price = Price
    FROM dbo.Products
    WHERE ProductId = @ProductId;

    IF @Stock IS NULL
    BEGIN
        RAISERROR('Product not found', 16, 1);
        RETURN;
    END

    IF @Stock >= @Quantity
    BEGIN
        INSERT INTO dbo.OrderItems (OrderId, ProductId, Quantity, UnitPrice)
        VALUES (@OrderId, @ProductId, @Quantity, @Price);

        UPDATE dbo.Products
        SET Stock = Stock - @Quantity
        WHERE ProductId = @ProductId;

        UPDATE dbo.Orders
        SET Total = Total + (@Price * @Quantity)
        WHERE OrderId = @OrderId;

        SELECT 'Item added successfully' AS Result, @Quantity AS Qty, @Price AS UnitPrice;
    END
    ELSE
    BEGIN
        SELECT 'Insufficient stock' AS Result, @Stock AS AvailableStock, @Quantity AS RequestedQty;
    END
END"
        },
        new
        {
            name = "usp_ProcessOrder (TRY/CATCH)",
            description = "Order processing with TRY/CATCH, transactions, and nested IF checks.",
            tsql = @"CREATE PROCEDURE dbo.usp_ProcessOrder
    @OrderId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @CurrentStatus NVARCHAR(20);

    SELECT @CurrentStatus = Status
    FROM dbo.Orders
    WHERE OrderId = @OrderId;

    IF @CurrentStatus IS NULL
    BEGIN
        RAISERROR('Order not found', 16, 1);
        RETURN;
    END

    IF @CurrentStatus <> 'Pending'
    BEGIN
        SELECT 'Order is not in Pending status' AS Result, @CurrentStatus AS CurrentStatus;
        RETURN;
    END

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.Orders
        SET Status = 'Processing'
        WHERE OrderId = @OrderId;

        IF EXISTS (
            SELECT 1
            FROM dbo.OrderItems oi
            JOIN dbo.Products p ON p.ProductId = oi.ProductId
            WHERE oi.OrderId = @OrderId AND p.Stock < oi.Quantity
        )
        BEGIN
            RAISERROR('Insufficient stock for one or more items', 16, 1);
        END

        UPDATE p
        SET p.Stock = p.Stock - oi.Quantity
        FROM dbo.Products p
        JOIN dbo.OrderItems oi ON oi.ProductId = p.ProductId
        WHERE oi.OrderId = @OrderId;

        UPDATE dbo.Orders
        SET Status = 'Shipped'
        WHERE OrderId = @OrderId;

        COMMIT TRANSACTION;

        SELECT 'Order processed successfully' AS Result, @OrderId AS OrderId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        SELECT
            ERROR_NUMBER() AS ErrorNumber,
            ERROR_MESSAGE() AS ErrorMessage,
            'Order processing failed' AS Result;
    END CATCH
END"
        }
    };

    return Results.Json(samples, jsonOpts);
});

// ============================================================
// POST /api/ai/chat  — SSE streaming
// ============================================================
app.MapPost("/api/ai/chat", async (HttpContext http, AiChatRequest req, AiChatService ai) =>
{
    http.Response.Headers["Content-Type"] = "text/event-stream";
    http.Response.Headers["Cache-Control"] = "no-cache";
    http.Response.Headers["X-Accel-Buffering"] = "no";

    try
    {
        await foreach (var delta in ai.StreamAsync(req, http.RequestAborted))
        {
            var escaped = delta.Replace("\n", "\\n").Replace("\r", "");
            await http.Response.WriteAsync($"data: {JsonSerializer.Serialize(delta)}\n\n");
            await http.Response.Body.FlushAsync(http.RequestAborted);
        }
        await http.Response.WriteAsync("data: [DONE]\n\n");
        await http.Response.Body.FlushAsync();
    }
    catch (OperationCanceledException) { /* client disconnected */ }
    catch (Exception ex)
    {
        await http.Response.WriteAsync($"data: {{\"error\":\"{ex.Message}\"}}\n\n");
    }
});

// ============================================================
// POST /api/ai/models  — Fetch available models for a provider
// ============================================================
app.MapPost("/api/ai/models", async (AiModelsRequest req) =>
{
    if (req.Provider?.ToLowerInvariant() != "gemini")
    {
        return Results.BadRequest(new { error = "Only Gemini provider supports dynamic model fetching currently." });
    }

    if (string.IsNullOrWhiteSpace(req.ApiKey))
    {
        return Results.BadRequest(new { error = "API key is required." });
    }

    try
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        var url = $"https://generativelanguage.googleapis.com/v1beta/models?key={req.ApiKey}";
        
        var response = await http.GetAsync(url);
        if (!response.IsSuccessStatusCode)
        {
            var errorText = await response.Content.ReadAsStringAsync();
            return Results.BadRequest(new { error = $"Gemini API error: {response.StatusCode} - {errorText}" });
        }

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        
        var models = new List<string>();
        if (doc.RootElement.TryGetProperty("models", out var modelsArray))
        {
            foreach (var model in modelsArray.EnumerateArray())
            {
                if (model.TryGetProperty("name", out var nameProp))
                {
                    var name = nameProp.GetString();
                    if (!string.IsNullOrEmpty(name))
                    {
                        // Gemini returns names like "models/gemini-1.5-pro"
                        name = name.StartsWith("models/") ? name.Substring(7) : name;
                        models.Add(name);
                    }
                }
            }
        }
        
        return Results.Json(new { models });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Fallback: serve index.html for SPA
app.MapFallbackToFile("index.html");

app.Run();
