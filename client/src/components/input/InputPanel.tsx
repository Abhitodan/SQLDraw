import { useState, useCallback } from "react";
import { Button, Input, Segmented, Select, Space, Typography, Divider, Tag, Tooltip, Alert } from "antd";
import { PlayCircleOutlined, ThunderboltOutlined, CodeOutlined, CloudServerOutlined } from "@ant-design/icons";
import Editor from "@monaco-editor/react";
import { useAppState, useAppDispatch } from "../../stores/appStore";
import { useConnectionConfig } from "../../stores/configStore";
import { api } from "../../api/client";

const { Text } = Typography;

export default function InputPanel() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [samples, setSamples] = useState<{ name: string; tsql: string }[]>([]);

  const { connectionString, setConnectionString } = useConnectionConfig();

  const handleParse = useCallback(async () => {
    if (state.inputMode === "paste" && !state.tsql.trim()) {
      dispatch({ type: "SET_ERROR", payload: "Please paste T-SQL or load a sample before parsing." });
      return;
    }
    if (state.inputMode === "fetch" && (!connectionString.trim() || !state.procName.trim())) {
      dispatch({ type: "SET_ERROR", payload: "Please provide both a connection string and procedure name." });
      return;
    }
    dispatch({ type: "PARSE_START" });
    try {
      const body =
        state.inputMode === "paste"
          ? { tsql: state.tsql }
          : { connectionString, procName: state.procName };
      const res = await api.parse(body);
      dispatch({ type: "PARSE_SUCCESS", payload: res });
    } catch (err: unknown) {
      dispatch({ type: "SET_ERROR", payload: (err as Error).message });
    }
  }, [dispatch, state.inputMode, state.tsql, connectionString, state.procName]);

  const handleRun = useCallback(async () => {
    dispatch({ type: "RUN_START" });
    try {
      const params: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(state.paramValues)) {
        if (v && v.toUpperCase() !== "NULL") {
          params[k] = isNaN(Number(v)) ? v : Number(v);
        }
      }

      const body = {
        connectionString: state.runMode === "dryrun" ? undefined : connectionString,
        procName: state.inputMode === "fetch" ? state.procName : undefined,
        tsql: state.inputMode === "paste" ? state.tsql : undefined,
        params,
        mode: state.runMode,
      };
      const res = await api.run(body);
      dispatch({ type: "RUN_SUCCESS", payload: res });
    } catch (err: unknown) {
      dispatch({ type: "SET_ERROR", payload: (err as Error).message });
    }
  }, [dispatch, state.runMode, state.inputMode, state.procName, state.tsql, state.paramValues, connectionString]);

  const loadSamples = useCallback(async () => {
    setSamplesLoading(true);
    try {
      const data = await api.getSamples();
      setSamples(data);
    } catch {
      // Fall back to inline samples if endpoint not available
      setSamples([
        {
          name: "usp_AddOrderItem (IF/ELSE)",
          tsql: `CREATE PROCEDURE dbo.usp_AddOrderItem\n    @OrderId    INT,\n    @ProductId  INT,\n    @Quantity   INT\nAS\nBEGIN\n    SET NOCOUNT ON;\n\n    DECLARE @Stock INT, @Price DECIMAL(10,2);\n\n    SELECT @Stock = Stock, @Price = Price\n    FROM dbo.Products\n    WHERE ProductId = @ProductId;\n\n    IF @Stock IS NULL\n    BEGIN\n        RAISERROR('Product not found', 16, 1);\n        RETURN;\n    END\n\n    IF @Stock >= @Quantity\n    BEGIN\n        INSERT INTO dbo.OrderItems (OrderId, ProductId, Quantity, UnitPrice)\n        VALUES (@OrderId, @ProductId, @Quantity, @Price);\n\n        UPDATE dbo.Products\n        SET Stock = Stock - @Quantity\n        WHERE ProductId = @ProductId;\n\n        UPDATE dbo.Orders\n        SET Total = Total + (@Price * @Quantity)\n        WHERE OrderId = @OrderId;\n\n        SELECT 'Item added successfully' AS Result, @Quantity AS Qty, @Price AS UnitPrice;\n    END\n    ELSE\n    BEGIN\n        SELECT 'Insufficient stock' AS Result, @Stock AS AvailableStock, @Quantity AS RequestedQty;\n    END\nEND`,
        },
        {
          name: "usp_ProcessOrder (TRY/CATCH)",
          tsql: `CREATE PROCEDURE dbo.usp_ProcessOrder\n    @OrderId INT\nAS\nBEGIN\n    SET NOCOUNT ON;\n\n    DECLARE @CurrentStatus NVARCHAR(20);\n\n    SELECT @CurrentStatus = Status\n    FROM dbo.Orders\n    WHERE OrderId = @OrderId;\n\n    IF @CurrentStatus IS NULL\n    BEGIN\n        RAISERROR('Order not found', 16, 1);\n        RETURN;\n    END\n\n    IF @CurrentStatus <> 'Pending'\n    BEGIN\n        SELECT 'Order is not in Pending status' AS Result, @CurrentStatus AS CurrentStatus;\n        RETURN;\n    END\n\n    BEGIN TRY\n        BEGIN TRANSACTION;\n\n        UPDATE dbo.Orders\n        SET Status = 'Processing'\n        WHERE OrderId = @OrderId;\n\n        IF EXISTS (\n            SELECT 1\n            FROM dbo.OrderItems oi\n            JOIN dbo.Products p ON p.ProductId = oi.ProductId\n            WHERE oi.OrderId = @OrderId AND p.Stock < oi.Quantity\n        )\n        BEGIN\n            RAISERROR('Insufficient stock for one or more items', 16, 1);\n        END\n\n        UPDATE p\n        SET p.Stock = p.Stock - oi.Quantity\n        FROM dbo.Products p\n        JOIN dbo.OrderItems oi ON oi.ProductId = p.ProductId\n        WHERE oi.OrderId = @OrderId;\n\n        UPDATE dbo.Orders\n        SET Status = 'Shipped'\n        WHERE OrderId = @OrderId;\n\n        COMMIT TRANSACTION;\n\n        SELECT 'Order processed successfully' AS Result, @OrderId AS OrderId;\n    END TRY\n    BEGIN CATCH\n        IF @@TRANCOUNT > 0\n            ROLLBACK TRANSACTION;\n\n        SELECT\n            ERROR_NUMBER() AS ErrorNumber,\n            ERROR_MESSAGE() AS ErrorMessage,\n            'Order processing failed' AS Result;\n    END CATCH\nEND`,
        },
        {
          name: "usp_GetProducts (Simple SELECT)",
          tsql: `CREATE PROCEDURE dbo.usp_GetProducts\n    @IsActive BIT = 1\nAS\nBEGIN\n    SET NOCOUNT ON;\n\n    SELECT ProductId, Name, Price, Stock\n    FROM dbo.Products\n    WHERE IsActive = @IsActive\n    ORDER BY Name;\n\n    SELECT COUNT(*) AS TotalProducts\n    FROM dbo.Products\n    WHERE IsActive = @IsActive;\nEND`,
        },
      ]);
    } finally {
      setSamplesLoading(false);
    }
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", backgroundColor: "var(--neu-bg)" }}>
      {/* Mode Selector */}
      <div style={{ padding: "0 0 16px" }}>
        <Segmented
          block
          value={state.inputMode}
          onChange={(v) => dispatch({ type: "SET_INPUT_MODE", payload: v as "paste" | "fetch" })}
          options={[
            { label: <><CodeOutlined /> Paste T-SQL</>, value: "paste" },
            { label: <><CloudServerOutlined /> Fetch from Server</>, value: "fetch" },
          ]}
        />
      </div>

      {/* Input Area */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 16, backgroundColor: "transparent" }}>
        {state.inputMode === "paste" ? (
          <>
            <div className="neu-inset-deep" style={{ flex: 1, minHeight: 150, borderRadius: 16, overflow: "hidden", backgroundColor: "var(--neu-bg)" }}>
              <Editor
                height="100%"
                defaultLanguage="sql"
                theme="light" // Using light theme to match soft UI
                value={state.tsql}
                onChange={(v) => dispatch({ type: "SET_TSQL", payload: v ?? "" })}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                  scrollBeyondLastLine: false,
                  lineNumbers: "on",
                  wordWrap: "on",
                  padding: { top: 16 },
                  renderLineHighlight: "all",
                }}
                onMount={(_editor, monaco) => {
                  monaco.editor.defineTheme('neu-theme', {
                    base: 'vs',
                    inherit: true,
                    rules: [
                      { token: 'keyword', foreground: '6C63FF', fontStyle: 'bold' }, // var(--neu-accent)
                      { token: 'identifier', foreground: '2D3748' }, // var(--neu-fg)
                      { token: 'string', foreground: '48BB78' }, // var(--neu-success)
                      { token: 'number', foreground: 'ED8936' }, // var(--neu-warning)
                      { token: 'comment', foreground: '4A5568', fontStyle: 'italic' }, // var(--neu-muted)
                      { token: 'type', foreground: '4ECDC4' }, // var(--neu-accent-light)
                      { token: 'predefined', foreground: 'FF6B6B' }, // var(--neu-accent-secondary)
                      { token: 'operator', foreground: '2D3748' }, // var(--neu-fg)
                    ],
                    colors: {
                      'editor.background': '#00000000', // Transparent to let container background show through
                      'editor.lineHighlightBackground': '#A3B1C633', // Subtle shadow color
                      'editorLineNumber.foreground': '#A3B1C6',
                      'editorLineNumber.activeForeground': '#6C63FF',
                      'editor.selectionBackground': '#6C63FF33',
                    }
                  });
                  monaco.editor.setTheme('neu-theme');
                }}
              />
            </div>
            <Select
              placeholder="Load a sample..."
              loading={samplesLoading}
              className="neu-input"
              onOpenChange={(open) => { if (open && samples.length === 0) loadSamples(); }}
              onChange={(idx: number) => {
                const s = samples[idx];
                if (s) {
                  dispatch({ type: "LOAD_SAMPLE", payload: { tsql: s.tsql } });
                  dispatch({ type: "PARSE_START" });
                  api.parse({ tsql: s.tsql })
                    .then((res) => dispatch({ type: "PARSE_SUCCESS", payload: res }))
                    .catch((err: unknown) => dispatch({ type: "SET_ERROR", payload: (err as Error).message }));
                }
              }}
              options={samples.map((s, i) => ({ label: s.name, value: i }))}
              style={{ width: "100%" }}
              allowClear
            />
          </>
        ) : (
          <Space orientation="vertical" style={{ width: "100%" }} size="small">
            <div>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>Connection String</Text>
              <Input
                className="neu-input"
                value={connectionString}
                onChange={(e) => setConnectionString(e.target.value)}
                placeholder="Server=localhost;Database=MyDB;..."
              />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>Procedure Name</Text>
              <Input
                className="neu-input"
                value={state.procName}
                onChange={(e) => dispatch({ type: "SET_PROC_NAME", payload: e.target.value })}
                placeholder="dbo.usp_MyProc"
              />
            </div>
          </Space>
        )}
      </div>

      {/* Parse Button */}
      <div style={{ paddingTop: 16 }}>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          block
          onClick={handleParse}
          loading={state.isLoading && !state.cfg}
          disabled={
            state.inputMode === "paste"
              ? !state.tsql.trim()
              : !connectionString.trim() || !state.procName.trim()
          }
          className="neu-button"
          style={{ height: 44 }}
        >
          Parse
        </Button>
      </div>

      {/* Parameters */}
      {state.params.length > 0 && (
        <div style={{ marginTop: 24, overflow: "auto" }} className="ws-panel-scroll">
          <Divider style={{ margin: "0 0 16px" }}>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>PARAMETERS</Text>
          </Divider>
          <Space orientation="vertical" size={2}>
            {state.params.map((p) => (
              <div key={p.name}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</Text>
                  <Tag color="geekblue" style={{ borderRadius: 12, fontSize: 10 }}>{p.sqlType}</Tag>
                  {p.isOutput && <Tag color="purple" style={{ borderRadius: 12, fontSize: 10 }}>OUT</Tag>}
                </div>
                <Input
                  className="neu-input"
                  value={state.paramValues[p.name] ?? ""}
                  onChange={(e) => dispatch({ type: "SET_PARAM_VALUE", payload: { name: p.name, value: e.target.value } })}
                  placeholder={p.hasDefault ? `default: ${p.defaultValue}` : p.sqlType}
                />
              </div>
            ))}
          </Space>
        </div>
      )}

      {/* Run Controls */}
      {state.cfg && (
        <div style={{ marginTop: 24 }}>
          <Divider style={{ margin: "0 0 16px" }}>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>EXECUTE</Text>
          </Divider>

          {(state.runMode === "rollback" || state.runMode === "commit") && state.inputMode === "paste" && (
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 500, marginBottom: 4, display: "block" }}>Connection String</Text>
              <Input
                className="neu-input"
                value={connectionString}
                onChange={(e) => setConnectionString(e.target.value)}
                placeholder="Server=localhost;Database=MyDB;..."
              />
            </div>
          )}

          <Select
            value={state.runMode}
            onChange={(v) => dispatch({ type: "SET_RUN_MODE", payload: v as "rollback" | "commit" | "dryrun" })}
            style={{ width: 180 }}
            options={[
              { label: <Tooltip title="Simulate execution without database.">Dry Run</Tooltip>, value: "dryrun" },
              { label: <Tooltip title="Execute with transaction rollback.">Rollback</Tooltip>, value: "rollback" },
              { label: <Tooltip title="Execute and commit changes.">Commit</Tooltip>, value: "commit" },
            ]}
          />

          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            block
            onClick={handleRun}
            loading={state.isLoading && !!state.cfg}
            className="neu-button"
            style={{ background: "var(--neu-success)", height: 44 }}
          >
            Run Procedure
          </Button>
        </div>
      )}

      {/* Error Display */}
      {state.error && (
        <div style={{ paddingTop: 16 }}>
          <Alert
            type="error"
            title="Parse Error"
            description={state.error}
            showIcon
            style={{ marginBottom: 16 }}
            closable
            onClose={() => dispatch({ type: "SET_ERROR", payload: null })}
          />
        </div>
      )}
    </div>
  );
}
