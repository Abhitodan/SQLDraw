import type { ControlFlowGraph, CfgNode, CfgEdge } from "../../api/types";

interface Cluster {
  id: string;
  label: string;
  nodeIds: string[];
  type: "branch" | "loop" | "trycatch" | "transaction" | "block";
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ClusteredGraph {
  clusters: Cluster[];
  nodes: CfgNode[];
  edges: CfgEdge[];
}

export function clusterGraph(cfg: ControlFlowGraph, maxNodesPerCluster: number = 10): ClusteredGraph {
  const clusters: Cluster[] = [];
  const processedNodes = new Set<string>();
  const remainingNodes = [...cfg.nodes];

  // Find natural clustering points (branches, loops, try-catch blocks)
  const clusterSeeds = cfg.nodes.filter(node => 
    (node.nodeType === 3 || node.nodeType === 4 || node.nodeType === 8 || node.nodeType === 10) && // Branch, Loop, TryCatch, Transaction
    !processedNodes.has(node.id)
  );

  // Create clusters around these seeds
  for (const seed of clusterSeeds) {
    if (processedNodes.has(seed.id)) continue;

    const cluster = createClusterAroundNode(cfg, seed, maxNodesPerCluster);
    if (cluster.nodeIds.length > 1) {
      clusters.push(cluster);
      cluster.nodeIds.forEach(id => processedNodes.add(id));
    }
  }

  // Add remaining nodes as individual
  const unclusteredNodes = remainingNodes.filter(n => !processedNodes.has(n.id));

  return {
    clusters,
    nodes: unclusteredNodes,
    edges: [] // Edges are part of nodes in this model
  };
}

function createClusterAroundNode(cfg: ControlFlowGraph, seed: CfgNode, maxNodes: number): Cluster {
  const nodeIds = [seed.id];
  const toVisit = [...seed.outEdges.map(e => e.targetNodeId)];
  const visited = new Set([seed.id]);

  // BFS to collect related nodes
  while (toVisit.length > 0 && nodeIds.length < maxNodes) {
    const currentId = toVisit.shift()!;
    if (visited.has(currentId)) continue;
    
    visited.add(currentId);
    const currentNode = cfg.nodes.find(n => n.id === currentId);
    if (!currentNode) continue;

    // Add nodes that are logically related
    if (shouldIncludeInCluster(currentNode)) {
      nodeIds.push(currentId);
      
      // Add its children if they're simple statements
      if (currentNode.nodeType === 2 || currentNode.nodeType === 12) { // Statement or Block
        currentNode.outEdges.forEach(e => {
          if (!visited.has(e.targetNodeId)) {
            toVisit.push(e.targetNodeId);
          }
        });
      }
    }
  }

  return {
    id: `cluster-${seed.id}`,
    label: getClusterLabel(seed),
    nodeIds,
    type: getClusterType(seed.nodeType),
    x: 0, // Will be calculated by layout
    y: 0,
    width: 200,
    height: Math.max(100, nodeIds.length * 30)
  };
}

function shouldIncludeInCluster(node: CfgNode): boolean {
  // Include statements, blocks, and simple operations
  const includeTypes = [2, 5, 6, 12]; // Statement, DML, Select, Block
  return includeTypes.includes(node.nodeType);
}

function getClusterLabel(node: CfgNode): string {
  switch (node.nodeType) {
    case 3: return `IF ${node.label}`;
    case 4: return `LOOP ${node.label}`;
    case 8: return `TRY-CATCH`;
    case 10: return `TRANSACTION`;
    default: return node.label;
  }
}

function getClusterType(nodeType: number): Cluster["type"] {
  switch (nodeType) {
    case 3: return "branch";
    case 4: return "loop";
    case 8: return "trycatch";
    case 10: return "transaction";
    default: return "block";
  }
}

export function simplifyGraph(cfg: ControlFlowGraph, showOnlyExecuted: boolean, executedNodes: Set<string>): ControlFlowGraph {
  if (!showOnlyExecuted) return cfg;

  // Keep only executed nodes and essential control flow nodes
  const keepIds = new Set(cfg.nodes
    .filter(node => executedNodes.has(node.id) || [0, 1, 3, 4].includes(node.nodeType))
    .map(n => n.id)
  );

  // Clone nodes shallowly and filter outEdges without mutating originals
  const filteredNodes = cfg.nodes
    .filter(node => keepIds.has(node.id))
    .map(node => ({
      ...node,
      outEdges: node.outEdges.filter(e => keepIds.has(e.targetNodeId)),
    }));

  return {
    ...cfg,
    nodes: filteredNodes,
  };
}
