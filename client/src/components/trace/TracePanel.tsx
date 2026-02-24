import { useMemo, useState } from "react";
import { Tag, Typography, Slider, Empty, Space, Button } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
  RollbackOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { motion, AnimatePresence } from "framer-motion";
import { useAppState, useAppDispatch } from "../../stores/appStore";
import type { TraceEvent } from "../../api/types";
import ResultPreview from "./ResultPreview";
import AiChatPanel from "../ai/AiChatPanel";
import AiConfigModal from "../ai/AiConfigModal";

const { Text } = Typography;

const EVENT_COLORS: Record<string, string> = {
  start: "default",
  complete: "default",
  resultset: "blue",
  dml: "green",
  error: "red",
  info: "default",
  txn: "purple",
};

const EVENT_LABELS: Record<string, string> = {
  start: "START",
  complete: "DONE",
  resultset: "SELECT",
  dml: "DML",
  error: "ERROR",
  info: "INFO",
  txn: "TXN",
};

export default function TracePanel() {
  const { runResult, selectedEventId, timelinePosition, aiConfig } = useAppState();
  const dispatch = useAppDispatch();
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<"trace" | "ai">("trace");

  const selectedEvent = useMemo(
    () => runResult?.trace.find((e) => e.eventId === selectedEventId) ?? null,
    [runResult, selectedEventId],
  );

  const traceContent = useMemo(() => {
    if (!runResult) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 24 }}>
          <Empty description="Run a procedure to see execution trace" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      );
    }

    const { summary, trace } = runResult;

    return (
      <div className="ws-panel-scroll">
        {/* Summary */}
        <div className="neu-inset" style={{ padding: 16, borderRadius: 16, marginBottom: 24, marginTop: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <DatabaseOutlined style={{ color: "var(--neu-info)" }} />
              <Text strong>{summary.totalStatements}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>Stmts</Text>
            </div>
            <div style={{ width: 1, height: 16, background: "var(--neu-inset-deep)" }} />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Text strong style={{ color: "var(--neu-success)" }}>{summary.totalRowsAffected}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>Rows</Text>
            </div>
            <div style={{ width: 1, height: 16, background: "var(--neu-inset-deep)" }} />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Text strong style={{ color: "var(--neu-warning)" }}>{summary.totalDurationMs.toFixed(1)}ms</Text>
            </div>
            
            <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
              <Tag
                icon={summary.hadError ? <CloseCircleOutlined /> : <CheckCircleOutlined />}
                color={summary.hadError ? "error" : "success"}
                style={{ margin: 0, borderRadius: 12 }}
              >
                {summary.hadError ? "ERROR" : "OK"}
              </Tag>
              <Tag icon={<RollbackOutlined />} color={summary.mode === "rollback" ? "purple" : "blue"} style={{ margin: 0, borderRadius: 12 }}>
                {summary.mode.toUpperCase()}
              </Tag>
            </div>
          </div>
        </div>

        {/* Timeline Scrubber */}
        <div style={{ marginBottom: 24 }}>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>TIMELINE</Text>
          <Slider
            min={0}
            max={trace.length}
            value={timelinePosition}
            onChange={(v) => dispatch({ type: "SET_TIMELINE_POS", payload: v })}
            tooltip={{
              formatter: (v) => {
                if (v === undefined || v === null) return "";
                return v === 0 ? "Start" : v >= trace.length ? "End" : `Step ${v}`;
              },
            }}
          />
        </div>

        {/* Event List */}
        <div style={{ marginBottom: 24 }}>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 12 }}>EXECUTION TRACE</Text>
          <div className="neu-inset-deep" style={{ padding: 12, borderRadius: 16 }}>
            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
              {trace.map((evt, idx) => (
                <TraceEventRow
                  key={evt.eventId}
                  event={evt}
                  index={idx}
                  isVisible={idx < timelinePosition}
                  isSelected={evt.eventId === selectedEventId}
                  onClick={() => dispatch({ type: "SELECT_EVENT", payload: evt.eventId })}
                />
              ))}
            </Space>
          </div>
        </div>

        {/* Detail Panel */}
        <AnimatePresence>
          {selectedEvent && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="neu-inset"
              style={{ borderRadius: 16, overflow: "hidden", marginBottom: 16 }}
            >
              <TraceDetail event={selectedEvent} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }, [runResult, selectedEventId, timelinePosition, dispatch]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", backgroundColor: "var(--neu-bg)" }}>
      {/* Tab Bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid var(--neu-border, #e8e8e8)",
        padding: "0 16px",
        flexShrink: 0,
        gap: 4,
      }}>
        <button
          onClick={() => setActiveTab("trace")}
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "trace" ? "2px solid var(--neu-accent)" : "2px solid transparent",
            padding: "12px 16px",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: activeTab === "trace" ? 600 : 400,
            color: activeTab === "trace" ? "var(--neu-accent)" : "var(--neu-muted)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <DatabaseOutlined /> Trace
        </button>
        <button
          onClick={() => {
            if (!aiConfig) { setConfigModalVisible(true); return; }
            setActiveTab("ai");
          }}
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "ai" ? "2px solid var(--neu-accent)" : "2px solid transparent",
            padding: "12px 16px",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: activeTab === "ai" ? 600 : 400,
            color: activeTab === "ai" ? "var(--neu-accent)" : "var(--neu-muted)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <RobotOutlined /> AI
        </button>
        {!aiConfig && (
          <Button size="small" type="link" onClick={() => setConfigModalVisible(true)} style={{ marginLeft: "auto" }}>
            Configure AI
          </Button>
        )}
      </div>

      {/* Tab Content — only one is ever mounted and visible */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: activeTab === "trace" ? "flex" : "none", flexDirection: "column", backgroundColor: "var(--neu-bg)" }}>
        {traceContent}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: activeTab === "ai" ? "flex" : "none", flexDirection: "column", backgroundColor: "var(--neu-bg)" }}>
        <AiChatPanel />
      </div>

      <AiConfigModal
        visible={configModalVisible}
        onClose={() => setConfigModalVisible(false)}
      />
    </div>
  );
}

function TraceEventRow({
  event: evt,
  index,
  isVisible,
  isSelected,
  onClick,
}: {
  event: TraceEvent;
  index: number;
  isVisible: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: isVisible ? 1 : 0.4 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={isSelected ? "neu-extruded" : "neu-button"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 12,
        cursor: "pointer",
        fontSize: 13,
        border: "none",
        color: isSelected ? "var(--neu-accent)" : "var(--neu-fg)",
        fontWeight: isSelected ? 600 : 500,
        width: "100%",
        textAlign: "left"
      }}
    >
      <span style={{ color: "var(--neu-muted)", fontSize: 11, width: 20, textAlign: "right", flexShrink: 0 }}>
        {index + 1}
      </span>
      <Tag
        color={EVENT_COLORS[evt.eventType] ?? "default"}
        style={{ margin: 0, fontSize: 10, borderRadius: 12, minWidth: 44, textAlign: "center" }}
      >
        {EVENT_LABELS[evt.eventType] ?? evt.eventType.toUpperCase()}
      </Tag>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "inherit" }}>
        {evt.sqlText.length > 60 ? evt.sqlText.slice(0, 57) + "..." : evt.sqlText}
      </span>
      {evt.rowCount != null && (
        <span style={{ color: "var(--neu-success)", fontSize: 11, flexShrink: 0 }}>{evt.rowCount} rows</span>
      )}
      <span style={{ color: "var(--neu-muted)", fontSize: 11, flexShrink: 0 }}>
        {evt.durationMs.toFixed(1)}ms
      </span>
    </motion.div>
  );
}

function TraceDetail({ event: evt }: { event: TraceEvent }) {
  return (
    <div style={{ padding: 16, maxHeight: 300, overflowY: "auto" }}>
      {/* SQL Text */}
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>SQL SOURCE</Text>
        <pre style={{
          background: "var(--neu-bg)",
          borderRadius: 12,
          padding: 12,
          fontSize: 12,
          color: "var(--neu-fg)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          maxHeight: 120,
          overflowY: "auto",
          margin: "8px 0 0",
          boxShadow: "var(--neu-inset-deep)",
          fontFamily: "'Cascadia Code', 'Fira Code', monospace"
        }}>
          {evt.sqlText}
        </pre>
      </div>

      {/* Error */}
      {evt.errorMessage && (
        <div style={{ 
          background: "var(--neu-bg)", 
          boxShadow: "var(--neu-inset)", 
          borderRadius: 12, 
          padding: "12px 16px", 
          color: "var(--neu-error)", 
          fontSize: 13, 
          marginBottom: 12,
          border: "1px solid var(--neu-error)" 
        }}>
          <strong>Error #{evt.errorNumber}:</strong> {evt.errorMessage}
        </div>
      )}

      {/* Result Set Preview */}
      {evt.resultSetColumns && evt.resultSetPreviewRows && (
        <div style={{ marginTop: 16 }}>
          <ResultPreview columns={evt.resultSetColumns} rows={evt.resultSetPreviewRows} />
        </div>
      )}
    </div>
  );
}
