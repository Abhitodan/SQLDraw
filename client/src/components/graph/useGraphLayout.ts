import { useMemo } from "react";
import dagre from "dagre";
import { type Edge, type Node, MarkerType } from "@xyflow/react";
import type { ControlFlowGraph } from "../../api/types";
import type { CfgNodeData } from "./CfgNodeComponent";
import { simplifyGraph } from "./graphClustering";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 60;

export function useGraphLayout(
  cfg: ControlFlowGraph | null,
  executedNodes: Set<string>,
  executedEdges: Set<string>,
  selectedNodeId: string | null,
  hasRunResult: boolean,
  clusterEnabled: boolean = false,
  dimUnexecuted: boolean = true,
  filteredTypes: number[] = [],
) {
  return useMemo(() => {
    if (!cfg) return { nodes: [] as Node[], edges: [] as Edge[] };

    // Apply filtering based on user preferences
    let processedCfg = cfg;
    
    // Filter by node types if any are selected
    if (filteredTypes.length > 0) {
      processedCfg = {
        ...cfg,
        nodes: cfg.nodes.filter(node => filteredTypes.includes(node.nodeType))
      };
    }
    
    // Simplify graph if dimming unexecuted nodes
    if (dimUnexecuted && hasRunResult) {
      processedCfg = simplifyGraph(processedCfg, true, executedNodes);
    }

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ 
      rankdir: "TB",
      ranksep: clusterEnabled ? 100 : 80,
      nodesep: clusterEnabled ? 80 : 60,
      marginx: 40,
      marginy: 40,
      edgesep: 10,
    });

    // Use all nodes — filtering causes missing dagre positions (undefined x/y → stack at top)
    const meaningfulNodes = processedCfg.nodes;

    for (const node of meaningfulNodes) {
      const isStartEnd = node.nodeType === 0 || node.nodeType === 1;
      const isBranch = node.nodeType === 3 || node.nodeType === 4;
      const width = isStartEnd ? 120 : isBranch ? 160 : NODE_WIDTH;
      const height = isStartEnd ? 50 : NODE_HEIGHT;
      g.setNode(node.id, { width, height });
    }

    const nodeIds = new Set(meaningfulNodes.map((n) => n.id));
    for (const node of meaningfulNodes) {
      for (const edge of node.outEdges) {
        if (nodeIds.has(edge.targetNodeId)) {
          g.setEdge(node.id, edge.targetNodeId);
        }
      }
    }

    dagre.layout(g);

    const nodes: Node[] = meaningfulNodes.map((cfgNode) => {
      const pos = g.node(cfgNode.id);
      const isExecuted = executedNodes.has(cfgNode.id);
      const nodeWidth = pos?.width ?? NODE_WIDTH;
      const nodeHeight = pos?.height ?? NODE_HEIGHT;
      // pos.x/y are centre-based in dagre — subtract half dims for top-left origin
      const x = pos?.x != null ? pos.x - nodeWidth / 2 : 0;
      const y = pos?.y != null ? pos.y - nodeHeight / 2 : 0;

      return {
        id: cfgNode.id,
        type: "cfgNode",
        position: { x, y },
        data: {
          label: cfgNode.label,
          nodeType: cfgNode.nodeType,
          sqlSnippet: cfgNode.sqlSnippet,
          isExecuted,
          isSelected: cfgNode.id === selectedNodeId,
          isDimmed: hasRunResult && !isExecuted,
        } satisfies CfgNodeData,
      };
    });

    const edges: Edge[] = [];
    for (const node of meaningfulNodes) {
      for (const edge of node.outEdges) {
        if (!nodeIds.has(edge.targetNodeId)) continue;
        const edgeId = `${node.id}->${edge.targetNodeId}`;
        const isDefinitelyExecuted = executedEdges.has(edgeId) && hasRunResult;
        const bothNodesExecuted = executedNodes.has(node.id) && executedNodes.has(edge.targetNodeId);
        
        // Three states: definitely executed (blue), potentially executed (green dashed), not executed (light gray)
        let stroke = "rgba(163, 177, 198, 0.3)";
        let strokeWidth = 1;
        let animated = false;
        let strokeDasharray: string | undefined = undefined;
        
        if (isDefinitelyExecuted) {
          stroke = "var(--neu-accent)";
          strokeWidth = 2;
          animated = true;
        } else if (bothNodesExecuted && hasRunResult) {
          // Both nodes executed but edge not definitely taken - show as animated green dashed
          stroke = "#48BB78"; // Green color for potential paths
          strokeWidth = 2;
          strokeDasharray = "6,3";
          animated = true; // Add animation to potential paths
        }
        
        const isBranchEdge = node.nodeType === 3 || node.nodeType === 4; // Branch or Loop
        const edgeLabel = edge.condition ?? (isBranchEdge && node.outEdges.length === 2
          ? node.outEdges.indexOf(edge) === 0 ? "True" : "False"
          : undefined);

        edges.push({
          id: edgeId,
          source: node.id,
          target: edge.targetNodeId,
          label: edgeLabel,
          labelStyle: { 
            fill: isDefinitelyExecuted ? "var(--neu-accent)" : "var(--neu-muted)", 
            fontSize: 10,
            fontWeight: isDefinitelyExecuted ? 700 : 500,
          },
          labelShowBg: true,
          labelBgStyle: { fill: "var(--neu-bg)", fillOpacity: 0.9 },
          labelBgPadding: [2, 4],
          labelBgBorderRadius: 4,
          animated,
          type: "smoothstep",
          style: {
            stroke,
            strokeWidth,
            strokeDasharray,
          },
          markerEnd: { 
            type: MarkerType.ArrowClosed, 
            color: isDefinitelyExecuted ? "var(--neu-accent)" : 
                   (bothNodesExecuted && hasRunResult) ? "#48BB78" : "rgba(163, 177, 198, 0.4)" 
          },
        });
      }
    }

    return { nodes, edges };
  }, [cfg, executedNodes, executedEdges, selectedNodeId, hasRunResult, clusterEnabled, dimUnexecuted, filteredTypes]);
}
