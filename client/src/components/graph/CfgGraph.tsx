import { useCallback, useMemo, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  type NodeTypes,
  useReactFlow,
  ConnectionLineType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import CfgNodeComponent from "./CfgNodeComponent";
import { useGraphLayout } from "./useGraphLayout";
import { useAppState, useAppDispatch } from "../../stores/appStore";
import GraphControls from "./GraphControls";

const nodeTypes: NodeTypes = {
  cfgNode: CfgNodeComponent,
};

function CfgGraph() {
  const { cfg, runResult, selectedNodeId, selectedEventId } = useAppState();
  const dispatch = useAppDispatch();
  const { setCenter, fitView } = useReactFlow();

  // Graph control states
  const [clusterEnabled, setClusterEnabled] = useState(false);
  const [dimUnexecuted, setDimUnexecuted] = useState(true);
  const [filteredTypes, setFilteredTypes] = useState<number[]>([]);

  const executedNodes = useMemo(
    () => new Set(runResult?.executedNodes ?? []),
    [runResult],
  );

  const executedEdges = useMemo(
    () => new Set(runResult?.executedEdges ?? []),
    [runResult],
  );

  const { nodes, edges } = useGraphLayout(
    cfg,
    executedNodes,
    executedEdges,
    selectedNodeId,
    !!runResult,
    clusterEnabled,
    dimUnexecuted,
    filteredTypes,
  );

  // Sync selectedEventId -> selectedNodeId
  useEffect(() => {
    if (selectedEventId !== null && runResult?.trace) {
      const event = runResult.trace.find(e => e.eventId === selectedEventId);
      if (event && event.nodeId) {
        // Select the node associated with this event
        dispatch({ type: "SELECT_NODE", payload: event.nodeId });
        
        // Also center the graph on this node
        const node = nodes.find(n => n.id === event.nodeId);
        if (node) {
          // Add a slight delay to ensure the DOM is ready for the transition
          setTimeout(() => {
            setCenter(node.position.x + 100, node.position.y + 50, { duration: 800, zoom: 1.2 });
          }, 50);
        }
      }
    }
  }, [selectedEventId, runResult, dispatch, nodes, setCenter]);

  // Fit view when CFG first loads (no run result yet)
  useEffect(() => {
    if (cfg && !runResult && nodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.2, duration: 600 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [cfg, fitView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom to start node when run result is available
  useEffect(() => {
    if (runResult && cfg) {
      const startNode = nodes.find(n => n.id === cfg.startNodeId);
      if (startNode) {
        const timer = setTimeout(() => {
          setCenter(startNode.position.x + 100, startNode.position.y + 30, { zoom: 1.2, duration: 800 });
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [runResult, cfg, nodes, setCenter]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      dispatch({ type: "SELECT_NODE", payload: node.id });
    },
    [dispatch],
  );

  if (!cfg) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 12,
        color: "var(--neu-muted)",
        backgroundColor: "var(--neu-bg)",
      }}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.3 }}>
          <rect x="4" y="18" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="2"/>
          <rect x="28" y="8" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="2"/>
          <rect x="28" y="28" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="2"/>
          <path d="M20 24h4M24 14h4M24 34h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <span style={{ fontSize: 14, fontWeight: 500 }}>No graph yet</span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Paste a stored procedure and click <strong>Parse</strong></span>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <GraphControls
        cfg={cfg}
        executedNodes={executedNodes}
        onToggleClustering={setClusterEnabled}
        onToggleDimUnexecuted={setDimUnexecuted}
        onFilterByType={setFilteredTypes}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView={false} // We handle manual zoom to start node
        fitViewOptions={{ padding: 0.3, includeHiddenNodes: false }}
        minZoom={0.1}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
        style={{ background: "var(--neu-bg)" }}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        connectionLineType={ConnectionLineType.SmoothStep}
        elevateNodesOnSelect={false}
        elevateEdgesOnSelect={false}
      >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#a3b1c6" />
      <Controls
        style={{ background: "var(--neu-bg)", border: "1px solid rgba(163, 177, 198, 0.2)", borderRadius: 8 }}
      />
      </ReactFlow>
    </div>
  );
}

export default CfgGraph;
