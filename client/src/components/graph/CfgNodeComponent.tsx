import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { CfgNodeType } from "../../api/types";
import { getNodeVisual } from "./nodeStyles";

export interface CfgNodeData {
  label: string;
  nodeType: CfgNodeType;
  sqlSnippet: string;
  isExecuted: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  [key: string]: unknown;
}

export default function CfgNodeComponent({ data }: NodeProps) {
  // Defensive check for data
  if (!data) {
    return null;
  }
  
  const d = data as unknown as CfgNodeData;
  const vis = getNodeVisual(d.nodeType || CfgNodeType.Statement, d.isExecuted || false);

  // Fallback to default values if vis is undefined
  const shape = vis?.shape || "rect";
  const className = vis?.className || "neu-inset-deep";

  const opacity = (d.isDimmed ?? false) ? 0.3 : 1;

  // Shape-specific border radius
  const borderRadius =
    shape === "pill" || shape === "stadium" ? 24 :
    shape === "diamond" ? 8 : 16;

  const isDiamond = shape === "diamond";
  const label = (d.label || "").length > 55 ? (d.label || "").slice(0, 52) + "..." : d.label || "";
  const isMerge = label.startsWith("(") && label.endsWith(")");

  const finalClassName = `${className} transition-all duration-300 ease-out`;

  // Use a strong inline boxShadow for selection to ensure it always renders correctly
  const selectionStyle = (d.isSelected ?? false) 
    ? { boxShadow: "0 0 0 2px var(--neu-bg), 0 0 0 4px var(--neu-accent)" }
    : {};

  return (
    <motion.div
      initial={false}
      animate={{ opacity }}
      transition={{ duration: 0.3 }}
      className={finalClassName}
      style={{
        ...selectionStyle,
        padding: isMerge ? "8px 16px" : isDiamond ? "16px 24px" : "12px 20px",
        borderRadius,
        backgroundColor: "var(--neu-bg)",
        color: "var(--neu-fg)",
        fontSize: isMerge ? 11 : 13,
        fontWeight: (d.isExecuted ?? false) ? 600 : 500,
        fontFamily: "'DM Sans', sans-serif",
        minWidth: isMerge ? 60 : isDiamond ? 120 : 140,
        maxWidth: 280,
        textAlign: "center",
        cursor: "pointer",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        lineHeight: 1.4,
      }}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        style={{ 
          background: "var(--neu-bg)", 
          width: 8, 
          height: 8, 
          border: "none",
          boxShadow: "var(--neu-inset-sm)"
        }} 
      />

      {(d.isExecuted ?? false) && (
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: "var(--neu-accent)",
            boxShadow: "0 0 8px rgba(108, 99, 255, 0.6)",
          }}
        />
      )}

      <span style={{ wordBreak: "break-word" }}>{label}</span>

      <Handle 
        type="source" 
        position={Position.Bottom} 
        style={{ 
          background: "var(--neu-bg)", 
          width: 8, 
          height: 8, 
          border: "none",
          boxShadow: "var(--neu-inset-sm)"
        }} 
      />
    </motion.div>
  );
}
