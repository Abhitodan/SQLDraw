// ── CFG Models ──

export const CfgNodeType = {
  Start: 0,
  End: 1,
  Statement: 2,
  Branch: 3,
  Loop: 4,
  Dml: 5,
  Select: 6,
  Call: 7,
  TryCatch: 8,
  CatchBlock: 9,
  Transaction: 10,
  DynamicSql: 11,
  Block: 12,
} as const;

export type CfgNodeType = (typeof CfgNodeType)[keyof typeof CfgNodeType];

export interface CfgEdge {
  targetNodeId: string;
  condition?: string;
}

export interface CfgNode {
  id: string;
  nodeType: CfgNodeType;
  label: string;
  sqlSnippet: string;
  startLine: number;
  endLine: number;
  outEdges: CfgEdge[];
}

export interface ControlFlowGraph {
  startNodeId: string;
  endNodeId: string;
  nodes: CfgNode[];
}

export interface ProcParameter {
  name: string;
  sqlType: string;
  hasDefault: boolean;
  defaultValue?: string;
  isOutput: boolean;
}

// ── API Request/Response ──

export interface ParseRequest {
  connectionString?: string;
  procName?: string;
  tsql?: string;
}

export interface ParseResponse {
  cfg: ControlFlowGraph;
  mermaid: string;
  params: ProcParameter[];
}

export interface RunRequest {
  connectionString?: string;  // now optional
  procName?: string;
  tsql?: string;
  params: Record<string, unknown>;
  mode: "rollback" | "commit" | "dryrun" | "sqlite";
}

export interface TraceEvent {
  eventId: number;
  timestamp: string;
  nodeId?: string;
  eventType: string;
  sqlText: string;
  rowCount?: number;
  errorNumber?: number;
  errorMessage?: string;
  resultSetColumns?: string[];
  resultSetPreviewRows?: (string | number | boolean | null)[][];
  branchTaken?: string;
  durationMs: number;
}

export interface RunSummary {
  totalStatements: number;
  totalRowsAffected: number;
  totalDurationMs: number;
  hadError: boolean;
  errorMessage?: string;
  mode: string;
}

export interface RunResponse {
  runId: string;
  summary: RunSummary;
  trace: TraceEvent[];
  executedNodes: string[];
  executedEdges: string[];
  mermaid: string;
}

export interface SampleProc {
  name: string;
  description: string;
  tsql: string;
}

// ── AI Chat ──

export type AiProvider = "anthropic" | "openai" | "azure" | "gemini";

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  azureEndpoint?: string;
}

export interface AiChatContext {
  tsql?: string;
  cfg?: ControlFlowGraph;
  runResult?: RunResponse;
  selectedNodeId?: string;
}
