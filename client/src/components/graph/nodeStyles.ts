import { CfgNodeType } from "../../api/types";

export interface NodeVisual {
  shape: "pill" | "diamond" | "rect" | "trapezoid" | "stadium" | "doubleRect";
  className: string;
}

const DEFAULT_COLORS: Record<CfgNodeType, NodeVisual> = {
  [CfgNodeType.Start]: { shape: "pill", className: "cfg-node-start" },
  [CfgNodeType.End]: { shape: "pill", className: "cfg-node-end" },
  [CfgNodeType.Branch]: { shape: "diamond", className: "cfg-node-branch" },
  [CfgNodeType.Loop]: { shape: "diamond", className: "cfg-node-loop" },
  [CfgNodeType.Dml]: { shape: "rect", className: "cfg-node-dml" },
  [CfgNodeType.Select]: { shape: "rect", className: "cfg-node-select" },
  [CfgNodeType.Call]: { shape: "doubleRect", className: "cfg-node-call" },
  [CfgNodeType.TryCatch]: { shape: "trapezoid", className: "cfg-node-trycatch" },
  [CfgNodeType.CatchBlock]: { shape: "trapezoid", className: "cfg-node-catch" },
  [CfgNodeType.Transaction]: { shape: "stadium", className: "cfg-node-transaction" },
  [CfgNodeType.DynamicSql]: { shape: "rect", className: "cfg-node-dynamic" },
  [CfgNodeType.Statement]: { shape: "rect", className: "cfg-node-statement" },
  [CfgNodeType.Block]: { shape: "rect", className: "cfg-node-block" },
};

const EXECUTED_COLORS: Record<CfgNodeType, NodeVisual> = {
  [CfgNodeType.Start]: { shape: "pill", className: "cfg-node-start-executed" },
  [CfgNodeType.End]: { shape: "pill", className: "cfg-node-end-executed" },
  [CfgNodeType.Branch]: { shape: "diamond", className: "cfg-node-branch-executed" },
  [CfgNodeType.Loop]: { shape: "diamond", className: "cfg-node-loop-executed" },
  [CfgNodeType.Dml]: { shape: "rect", className: "cfg-node-dml-executed" },
  [CfgNodeType.Select]: { shape: "rect", className: "cfg-node-select-executed" },
  [CfgNodeType.Call]: { shape: "doubleRect", className: "cfg-node-call-executed" },
  [CfgNodeType.TryCatch]: { shape: "trapezoid", className: "cfg-node-trycatch-executed" },
  [CfgNodeType.CatchBlock]: { shape: "trapezoid", className: "cfg-node-catch-executed" },
  [CfgNodeType.Transaction]: { shape: "stadium", className: "cfg-node-transaction-executed" },
  [CfgNodeType.DynamicSql]: { shape: "rect", className: "cfg-node-dynamic-executed" },
  [CfgNodeType.Statement]: { shape: "rect", className: "cfg-node-statement-executed" },
  [CfgNodeType.Block]: { shape: "rect", className: "cfg-node-block-executed" },
};

export function getNodeVisual(nodeType: CfgNodeType, isExecuted: boolean): NodeVisual {
  return isExecuted ? EXECUTED_COLORS[nodeType] : DEFAULT_COLORS[nodeType];
}
