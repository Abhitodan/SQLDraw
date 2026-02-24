import { createContext, useContext, useReducer, useEffect, type Dispatch, type ReactNode } from "react";
import type { ControlFlowGraph, ProcParameter, RunResponse, AiConfig, AiChatMessage } from "../api/types";

export interface RunHistoryEntry {
  runId: string;
  procName: string;
  mode: string;
  createdAt: string;
  hadError: boolean;
  totalStatements: number;
  totalDurationMs: number;
  result: RunResponse;
}

export interface AppState {
  // Input
  inputMode: "paste" | "fetch";
  tsql: string;
  connectionString: string;
  procName: string;

  // Parse result
  cfg: ControlFlowGraph | null;
  mermaid: string;
  params: ProcParameter[];

  // Run
  runMode: "rollback" | "commit" | "dryrun";
  paramValues: Record<string, string>;
  runResult: RunResponse | null;

  // AI state
  aiConfig: AiConfig | null;
  aiMessages: AiChatMessage[];
  aiStreaming: boolean;
  aiError: string | null;

  // Run history (in-memory, current session)
  runHistory: RunHistoryEntry[];

  // UI state
  selectedNodeId: string | null;
  selectedEventId: number | null;
  selectionSource: "graph" | "trace" | null;
  timelinePosition: number; // 0..trace.length
  isLoading: boolean;
  error: string | null;
}

const initialState: AppState = {
  inputMode: "paste",
  tsql: "",
  connectionString: "",
  procName: "",
  cfg: null,
  mermaid: "",
  params: [],
  runMode: "dryrun",         // changed default from "rollback"
  paramValues: {},
  runResult: null,
  runHistory: [],
  aiConfig: null,
  aiMessages: [],
  aiStreaming: false,
  aiError: null,
  selectedNodeId: null,
  selectedEventId: null,
  selectionSource: null,
  timelinePosition: -1,
  isLoading: false,
  error: null,
};

type Action =
  | { type: "SET_INPUT_MODE"; payload: "paste" | "fetch" }
  | { type: "SET_TSQL"; payload: string }
  | { type: "SET_CONNECTION_STRING"; payload: string }
  | { type: "SET_PROC_NAME"; payload: string }
  | { type: "SET_RUN_MODE"; payload: "rollback" | "commit" | "dryrun" }
  | { type: "SET_PARAM_VALUE"; payload: { name: string; value: string } }
  | { type: "PARSE_START" }
  | { type: "PARSE_SUCCESS"; payload: { cfg: ControlFlowGraph; mermaid: string; params: ProcParameter[] } }
  | { type: "RUN_START" }
  | { type: "RUN_SUCCESS"; payload: RunResponse }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SELECT_NODE"; payload: { nodeId: string | null; source: "graph" | "trace" } }
  | { type: "SELECT_EVENT"; payload: { eventId: number | null; source: "graph" | "trace" } }
  | { type: "SET_TIMELINE_POS"; payload: number }
  | { type: "LOAD_SAMPLE"; payload: { tsql: string } }
  | { type: "RESET" }
  | { type: "LOAD_RUN_FROM_HISTORY"; payload: RunHistoryEntry }
  | { type: "SET_AI_CONFIG"; payload: AiConfig | null }
  | { type: "AI_MESSAGE_ADD"; payload: AiChatMessage }
  | { type: "AI_STREAMING_START" }
  | { type: "AI_STREAMING_DELTA"; payload: string }
  | { type: "AI_STREAMING_END" }
  | { type: "AI_ERROR"; payload: string | null }
  | { type: "AI_RESET_MESSAGES" };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_INPUT_MODE":
      return { ...state, inputMode: action.payload };
    case "SET_TSQL":
      return { ...state, tsql: action.payload };
    case "SET_CONNECTION_STRING":
      return { ...state, connectionString: action.payload };
    case "SET_PROC_NAME":
      return { ...state, procName: action.payload };
    case "SET_RUN_MODE":
      return { ...state, runMode: action.payload };
    case "SET_PARAM_VALUE":
      return { ...state, paramValues: { ...state.paramValues, [action.payload.name]: action.payload.value } };
    case "PARSE_START":
      return { ...state, isLoading: true, error: null, runResult: null, selectedNodeId: null, selectedEventId: null, selectionSource: null, timelinePosition: -1 };
    case "PARSE_SUCCESS":
      return {
        ...state,
        isLoading: false,
        cfg: action.payload.cfg,
        mermaid: action.payload.mermaid,
        params: action.payload.params,
        paramValues: Object.fromEntries(
          action.payload.params.map((p) => [p.name, p.defaultValue ?? ""])
        ),
      };
    case "RUN_START":
      return { ...state, isLoading: true, error: null };
    case "RUN_SUCCESS": {
      const entry: RunHistoryEntry = {
        runId: action.payload.runId,
        procName: state.procName || "(inline)",
        mode: action.payload.summary.mode,
        createdAt: new Date().toISOString(),
        hadError: action.payload.summary.hadError,
        totalStatements: action.payload.summary.totalStatements,
        totalDurationMs: action.payload.summary.totalDurationMs,
        result: action.payload,
      };
      return {
        ...state,
        isLoading: false,
        runResult: action.payload,
        timelinePosition: action.payload.trace.length,
        runHistory: [entry, ...state.runHistory].slice(0, 20),
      };
    }
    case "LOAD_RUN_FROM_HISTORY":
      return {
        ...state,
        runResult: action.payload.result,
        timelinePosition: action.payload.result.trace.length,
        selectedEventId: null,
        selectedNodeId: null,
        selectionSource: null,
      };
    case "SET_ERROR":
      return { ...state, isLoading: false, error: action.payload };
    case "SELECT_NODE":
      return { 
        ...state, 
        selectedNodeId: action.payload.nodeId,
        selectionSource: action.payload.source,
        selectedEventId: action.payload.nodeId ? state.selectedEventId : null
      };
    case "SELECT_EVENT": {
      // When selecting an event, also select its node and set timeline
      const evt = state.runResult?.trace.find((e) => e.eventId === action.payload.eventId);
      return {
        ...state,
        selectedEventId: action.payload.eventId,
        selectedNodeId: evt?.nodeId ?? state.selectedNodeId,
        selectionSource: action.payload.source,
      };
    }
    case "SET_TIMELINE_POS":
      return { ...state, timelinePosition: action.payload };
    case "LOAD_SAMPLE":
      return { ...state, inputMode: "paste", tsql: action.payload.tsql };
    case "RESET":
      return initialState;
    case "SET_AI_CONFIG":
      return { ...state, aiConfig: action.payload };
    case "AI_MESSAGE_ADD":
      return { ...state, aiMessages: [...state.aiMessages, action.payload] };
    case "AI_STREAMING_START":
      return { ...state, aiStreaming: true, aiError: null,
               aiMessages: [...state.aiMessages, { role: "assistant", content: "" }] };
    case "AI_STREAMING_DELTA": {
      const msgs = [...state.aiMessages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant")
        msgs[msgs.length - 1] = { ...last, content: last.content + action.payload };
      return { ...state, aiMessages: msgs };
    }
    case "AI_STREAMING_END":
      return { ...state, aiStreaming: false };
    case "AI_ERROR":
      return { ...state, aiStreaming: false, aiError: action.payload };
    case "AI_RESET_MESSAGES":
      return { ...state, aiMessages: [] };
    default:
      return state;
  }
}

const StateCtx = createContext<AppState>(initialState);
const DispatchCtx = createContext<Dispatch<Action>>(() => {});

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const savedAiConfig = localStorage.getItem("procsim_ai_config");

  // Also try to restore from zustand configStore persisted in localStorage
  let restoredAiConfig = savedAiConfig ? JSON.parse(savedAiConfig) : null;
  if (!restoredAiConfig) {
    try {
      const configStoreRaw = localStorage.getItem("sqldraw-config");
      if (configStoreRaw) {
        const configStoreData = JSON.parse(configStoreRaw);
        const cfg = configStoreData?.state?.config;
        if (cfg?.aiProvider) {
          const apiKey = cfg.aiProvider === "anthropic" ? cfg.anthropicApiKey
            : cfg.aiProvider === "openai" ? cfg.openaiApiKey
            : cfg.aiProvider === "azure" ? cfg.azureApiKey
            : cfg.aiProvider === "gemini" ? cfg.geminiApiKey : "";
          if (apiKey) {
            restoredAiConfig = {
              provider: cfg.aiProvider,
              apiKey,
              model: cfg.aiModel || "claude-opus-4-5",
              azureEndpoint: cfg.azureEndpoint || undefined,
            };
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  const initialWithAi: AppState = {
    ...initialState,
    aiConfig: restoredAiConfig,
  };
  const [state, dispatch] = useReducer(reducer, initialWithAi);

  // Persist aiConfig to localStorage whenever it changes
  useEffect(() => {
    if (state.aiConfig)
      localStorage.setItem("procsim_ai_config", JSON.stringify(state.aiConfig));
    else
      localStorage.removeItem("procsim_ai_config");
  }, [state.aiConfig]);

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export const useAppState = () => useContext(StateCtx);
export const useAppDispatch = () => useContext(DispatchCtx);
