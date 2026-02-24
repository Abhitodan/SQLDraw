import { useState, useCallback, useMemo } from "react";
import { Button, Switch, Tooltip, Space } from "antd";
import { GroupOutlined, UngroupOutlined, EyeOutlined, EyeInvisibleOutlined } from "@ant-design/icons";
import type { ControlFlowGraph } from "../../api/types";

interface GraphControlsProps {
  cfg: ControlFlowGraph | null;
  executedNodes: Set<string>;
  onToggleClustering: (enabled: boolean) => void;
  onToggleDimUnexecuted: (enabled: boolean) => void;
  onFilterByType: (nodeTypes: number[]) => void;
}

const NODE_TYPE_LABELS: Record<number, string> = {
  0: "Start",
  1: "End",
  2: "Statement",
  3: "Branch",
  4: "Loop",
  5: "DML",
  6: "Select",
  7: "Call",
  8: "Try/Catch",
  9: "Catch",
  10: "Transaction",
  11: "Dynamic SQL",
  12: "Block",
};

export default function GraphControls({
  cfg,
  executedNodes,
  onToggleClustering,
  onToggleDimUnexecuted,
  onFilterByType,
}: GraphControlsProps) {
  const [clusterEnabled, setClusterEnabled] = useState(false);
  const [dimUnexecuted, setDimUnexecuted] = useState(true);
  const [selectedTypes, setSelectedTypes] = useState<number[]>([]);

  const handleClusterToggle = useCallback((checked: boolean) => {
    setClusterEnabled(checked);
    onToggleClustering(checked);
  }, [onToggleClustering]);

  const handleDimToggle = useCallback((checked: boolean) => {
    setDimUnexecuted(checked);
    onToggleDimUnexecuted(checked);
  }, [onToggleDimUnexecuted]);

  const handleTypeFilter = useCallback((nodeType: number, checked: boolean) => {
    let newTypes = [...selectedTypes];
    if (checked) {
      newTypes.push(nodeType);
    } else {
      newTypes = newTypes.filter(t => t !== nodeType);
    }
    setSelectedTypes(newTypes);
    onFilterByType(newTypes);
  }, [selectedTypes, onFilterByType]);

  const nodeTypeCounts = useMemo(() => {
    if (!cfg) return {};
    const counts: Record<number, number> = {};
    cfg.nodes.forEach(node => {
      counts[node.nodeType] = (counts[node.nodeType] || 0) + 1;
    });
    return counts;
  }, [cfg]);

  if (!cfg) return null;

  return (
    <div style={{ 
      position: "absolute", 
      top: 10, 
      right: 10, 
      background: "var(--neu-bg)", 
      padding: 12, 
      borderRadius: 12,
      boxShadow: "var(--neu-extruded)",
      zIndex: 1000,
      minWidth: 200
    }}>
      <Space orientation="vertical" size={8}>
        <div>
          <Tooltip title="Group related nodes into clusters for better overview">
            <Switch
              checkedChildren={<GroupOutlined />}
              unCheckedChildren={<UngroupOutlined />}
              checked={clusterEnabled}
              onChange={handleClusterToggle}
            />
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--neu-muted)" }}>
              Cluster Mode
            </span>
          </Tooltip>
        </div>

        <div>
          <Tooltip title="Dim nodes that weren't executed">
            <Switch
              checkedChildren={<EyeOutlined />}
              unCheckedChildren={<EyeInvisibleOutlined />}
              checked={dimUnexecuted}
              onChange={handleDimToggle}
            />
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--neu-muted)" }}>
              Hide Unexecuted
            </span>
          </Tooltip>
        </div>

        <div style={{ borderTop: "1px solid rgba(163, 177, 198, 0.2)", paddingTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--neu-fg)" }}>
            Filter by Type
          </div>
          {Object.entries(nodeTypeCounts).map(([type, count]) => {
            const nodeType = parseInt(type);
            const isSelected = selectedTypes.includes(nodeType);
            const executedCount = cfg.nodes.filter(n => n.nodeType === nodeType && executedNodes.has(n.id)).length;
            
            return (
              <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Switch
                  size="small"
                  checked={isSelected}
                  onChange={(checked) => handleTypeFilter(nodeType, checked)}
                />
                <span style={{ fontSize: 11, color: "var(--neu-muted)" }}>
                  {NODE_TYPE_LABELS[nodeType]} ({executedCount}/{count})
                </span>
              </div>
            );
          })}
        </div>

        <Button 
          size="small" 
          onClick={() => {
            setSelectedTypes([]);
            onFilterByType([]);
          }}
          style={{ width: "100%" }}
        >
          Clear Filters
        </Button>
      </Space>
    </div>
  );
}
