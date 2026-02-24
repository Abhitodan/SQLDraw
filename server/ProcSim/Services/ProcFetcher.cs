using Microsoft.Data.SqlClient;

namespace ProcSim.Services;

public sealed class ProcFetcher
{
    /// <summary>
    /// Fetch the definition of a stored procedure from SQL Server.
    /// </summary>
    public async Task<string> FetchDefinitionAsync(string connectionString, string procName, CancellationToken ct = default)
    {
        ValidateConnectionString(connectionString);

        // Add TrustServerCertificate=True to handle self-signed certificates
        var builder = new SqlConnectionStringBuilder(connectionString)
        {
            TrustServerCertificate = true
        };

        using var conn = new SqlConnection(builder.ConnectionString);
        await conn.OpenAsync(ct);

        using var cmd = conn.CreateCommand();
        cmd.CommandTimeout = 15;
        cmd.CommandText = @"
            SELECT OBJECT_DEFINITION(OBJECT_ID(@procName))
        ";
        cmd.Parameters.AddWithValue("@procName", procName);

        var result = await cmd.ExecuteScalarAsync(ct);
        if (result == null || result == DBNull.Value)
            throw new InvalidOperationException($"Procedure '{procName}' not found or definition not accessible.");

        return (string)result;
    }

    public static void ValidateConnectionString(string connectionString)
    {
        var builder = new SqlConnectionStringBuilder(connectionString)
        {
            TrustServerCertificate = true
        };
        var db = (builder.InitialCatalog ?? "").ToLowerInvariant();
        var forbidden = new[] { "master", "msdb", "model", "tempdb" };
        if (forbidden.Contains(db))
            throw new InvalidOperationException($"Refused: cannot target system database '{db}'.");
    }
}
