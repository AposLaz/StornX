import type { CandidateWeights } from './types.js';
import type { GraphDataRps, NodesLatency } from '../../adapters/prometheus/types.js';

/**
 * Calculates candidate node weights based on RPS and latency metrics.
 * This is used for both upstream (Um) and downstream (Dm) traffic analysis.
 *
 * @param graphData - Array of nodes with their RPS destinations (upstream or downstream pods)
 * @param ftNodes - Array of fault-tolerant candidate node names
 * @param nodesLatency - Array of latency measurements between nodes
 * @returns Array of weights from source nodes to candidate nodes
 */
const calculateNodeWeights = (
  graphData: GraphDataRps[],
  ftNodes: string[],
  nodesLatency: NodesLatency[]
): CandidateWeights[] => {
  // Calculate total latency for normalization
  const totalLatency = nodesLatency.reduce((acc, n) => acc + n.latency, 0);

  // Calculate total RPS per node
  const perNodeRps = graphData.map((node) => ({
    node: node.node,
    rps: node.destinations.reduce((nodeRps, pod) => nodeRps + pod.rps, 0),
  }));

  // Calculate total RPS across all nodes
  const totalRps = perNodeRps.reduce((acc, n) => acc + n.rps, 0);

  // Normalize RPS: nodes with lower RPS get higher normalized values (inverse weighting)
  const normalizedRequestPerSeconds = perNodeRps.map(({ node, rps }) => {
    const normRps = totalRps > 0 ? (totalRps - rps) / totalRps : 0;
    return {
      node,
      normalizedRps: isNaN(normRps) || normRps < 0 ? 0 : normRps,
    };
  });

  // Normalize latency
  const normalizedLatency = nodesLatency.map(({ from, to, latency }) => {
    const normLat = totalLatency > 0 ? latency / totalLatency : 0;
    return {
      from,
      to,
      normalizedLatency: isNaN(normLat) || normLat < 0 ? 0 : normLat,
    };
  });

  // Calculate weights from each source node to each candidate node
  const weights: CandidateWeights[] = [];
  const sourceNodeNames = Array.from(new Set(graphData.map((n) => n.node)));

  sourceNodeNames.forEach((from) => {
    ftNodes.forEach((to) => {
      const normRps = normalizedRequestPerSeconds.find((n) => n.node === from)?.normalizedRps ?? 0;
      const normLatency = normalizedLatency.find((n) => n.from === from && n.to === to)?.normalizedLatency ?? 0;

      weights.push({
        from,
        to,
        weight: isNaN(normRps + normLatency) ? 0 : normRps + normLatency,
      });
    });
  });

  return weights;
};

/**
 * Calculate weights for upstream traffic analysis.
 * Used to determine optimal node placement based on incoming traffic patterns.
 */
export const calculateWeightsUm = (
  upstream: GraphDataRps[],
  ftNodes: string[],
  nodesLatency: NodesLatency[]
): CandidateWeights[] => {
  return calculateNodeWeights(upstream, ftNodes, nodesLatency);
};

/**
 * Calculate weights for downstream traffic analysis.
 * Used to determine optimal node placement based on outgoing traffic patterns.
 */
export const calculateWeightsDm = (
  downstream: GraphDataRps[],
  ftNodes: string[],
  nodesLatency: NodesLatency[]
): CandidateWeights[] => {
  return calculateNodeWeights(downstream, ftNodes, nodesLatency);
};
