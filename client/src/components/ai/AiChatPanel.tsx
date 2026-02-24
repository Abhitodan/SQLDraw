import { useState, useRef, useCallback, useEffect } from "react";
import { Button, Input, Space, Typography, Alert } from "antd";
import { SendOutlined, RobotOutlined, CloseOutlined, VerticalAlignBottomOutlined } from "@ant-design/icons";
import { useAppState, useAppDispatch } from "../../stores/appStore";
import { api } from "../../api/client";
import ReactMarkdown from "react-markdown";

const { TextArea } = Input;
const { Text } = Typography;

export default function AiChatPanel() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const abortController = useRef<AbortController | null>(null);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !state.aiConfig) return;

    const userMessage = { role: "user" as const, content: input.trim() };
    dispatch({ type: "AI_MESSAGE_ADD", payload: userMessage });
    dispatch({ type: "AI_STREAMING_START" });
    setInput("");

    try {
      abortController.current = new AbortController();
      
      const context: import("../../api/types").AiChatContext = {
        tsql: state.tsql || undefined,
        cfg: state.cfg || undefined,
        runResult: state.runResult || undefined,
        selectedNodeId: state.selectedNodeId || undefined,
      };

      for await (const delta of api.chatStream(state.aiConfig, [...state.aiMessages, userMessage], context, abortController.current.signal)) {
        dispatch({ type: "AI_STREAMING_DELTA", payload: delta });
      }
      dispatch({ type: "AI_STREAMING_END" });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled - no error needed
        dispatch({ type: "AI_STREAMING_END" });
      } else {
        dispatch({ type: "AI_ERROR", payload: (err as Error).message });
      }
    } finally {
      abortController.current = null;
    }
  }, [input, state.aiConfig, state.aiMessages, state.tsql, state.cfg, state.runResult, state.selectedNodeId, dispatch]);

  const handleCancel = useCallback(() => {
    if (abortController.current) {
      abortController.current.abort();
    }
  }, []);

  const handleClear = useCallback(() => {
    dispatch({ type: "AI_RESET_MESSAGES" });
  }, [dispatch]);

  // Auto-scroll to bottom when messages change (only if user is at bottom)
  useEffect(() => {
    if (!messagesContainerRef.current) return;
    
    const container = messagesContainerRef.current;
    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
    
    // Only auto-scroll if user is at bottom or it's a new conversation
    if (isAtBottom || state.aiMessages.length <= 2) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [state.aiMessages, state.aiStreaming]);

  if (!state.aiConfig) {
    return (
      <div style={{ padding: 24, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Alert
          title="AI Configuration Required"
          description="Configure your AI provider and API key to enable chat functionality."
          type="info"
          showIcon
          icon={<RobotOutlined />}
          style={{ borderRadius: 16, border: "none", boxShadow: "var(--neu-inset)" }}
        />
      </div>
    );
  }

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      height: "100%", 
      overflow: "hidden",
      minHeight: 0,
      backgroundColor: "var(--neu-bg)"
    }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Space>
          <RobotOutlined style={{ color: "var(--neu-accent)" }} />
          <Text strong style={{ color: "var(--neu-fg)" }}>Abhitodan</Text>
        </Space>
        <Button size="small" type="text" onClick={handleClear} style={{ color: "var(--neu-muted)" }}>
            Clear
          </Button>
      </div>

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        className="ws-panel-scroll" 
        style={{ 
          padding: "8px 20px",
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          position: "relative"
        }}
        onScroll={(e) => {
          const container = e.currentTarget;
          const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
          setIsUserScrolling(!isAtBottom);
        }}
      >
        {state.aiMessages.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--neu-muted)", padding: "40px 0" }}>
            <div className="neu-inset-deep" style={{ width: 64, height: 64, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <RobotOutlined style={{ fontSize: 24, color: "var(--neu-accent)" }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Ask Abhitodan about your stored procedure!</div>
          </div>
        ) : (
          <Space orientation="vertical" style={{ width: "100%", flex: 1 }}>
            {state.aiMessages.map((msg, i) => (
              <div key={i} style={{ 
                background: "var(--neu-bg)", 
                boxShadow: msg.role === "user" ? "var(--neu-extruded-sm)" : "var(--neu-inset)",
                borderRadius: msg.role === "user" ? "16px 16px 0 16px" : "0 16px 16px 16px", 
                padding: "12px 16px",
                maxWidth: "90%",
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                marginLeft: msg.role === "user" ? "auto" : 0,
              }}>
                <Text style={{ fontSize: 11, color: msg.role === "user" ? "var(--neu-info)" : "var(--neu-accent)", fontWeight: 700, display: "block", marginBottom: 4 }}>
                  {msg.role === "user" ? "You" : "Abhitodan"}
                </Text>
                {msg.role === "assistant" ? (
                  <div className="ai-markdown">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, color: "var(--neu-fg)", lineHeight: 1.5 }}>
                    {msg.content}
                  </div>
                )}
              </div>
            ))}
            {state.aiStreaming && (
              <div style={{ color: "var(--neu-muted)", fontStyle: "italic", fontSize: 13, padding: "8px 16px" }}>
                <RobotOutlined spin style={{ marginRight: 8, color: "var(--neu-accent)" }} /> Abhitodan is thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </Space>
        )}
        
        {/* Scroll to bottom button */}
        {isUserScrolling && state.aiMessages.length > 0 && (
          <Button
            type="primary"
            shape="circle"
            icon={<VerticalAlignBottomOutlined />}
            onClick={() => {
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
              setIsUserScrolling(false);
            }}
            style={{
              position: "absolute",
              bottom: 20,
              right: 20,
              zIndex: 10,
              boxShadow: "var(--neu-extruded)"
            }}
          />
        )}
      </div>

      {/* Error Display */}
      {state.aiError && (
        <div style={{ padding: "0 20px 16px" }}>
          <Alert
            title="Error"
            description={state.aiError}
            type="error"
            closable
            onClose={() => dispatch({ type: "AI_ERROR", payload: null })}
            style={{ borderRadius: 12, border: "none", boxShadow: "var(--neu-inset)" }}
          />
        </div>
      )}

      {/* Input */}
      <div style={{ padding: "16px 20px", background: "var(--neu-bg)", boxShadow: "0 -4px 12px rgba(163, 177, 198, 0.15)" }}>
        <Space.Compact style={{ width: "100%" }}>
          <TextArea
            className="neu-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the procedure, execution, or suggest improvements..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={state.aiStreaming}
            style={{ borderRadius: "16px 0 0 16px" }}
          />
          {state.aiStreaming ? (
            <Button icon={<CloseOutlined />} onClick={handleCancel} danger className="neu-button" style={{ borderRadius: "0 16px 16px 0", height: "auto" }}>
              Stop
            </Button>
          ) : (
            <Button 
              type="primary" 
              icon={<SendOutlined />} 
              onClick={handleSend}
              disabled={!input.trim() || !state.aiConfig}
              className="neu-button"
              style={{ borderRadius: "0 16px 16px 0", height: "auto", background: input.trim() && state.aiConfig ? "var(--neu-accent)" : undefined }}
            >
            </Button>
          )}
        </Space.Compact>
        <div style={{ marginTop: 8, textAlign: "center" }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Shift+Enter for new line • Context: T-SQL, CFG, and last run
          </Text>
        </div>
      </div>

    </div>
  );
}
