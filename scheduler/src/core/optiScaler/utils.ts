import type { CandidateWeights } from './types.js';
import type { GraphDataRps, NodesLatency } from '../../adapters/prometheus/types.js';

export const calculateWeightsUm = (
  upstream: GraphDataRps[],
  ftNodes: string[],
  nodesLatency: NodesLatency[]
): CandidateWeights[] => {
  // calculate the total latency
  const totalLatency = nodesLatency.reduce((acc, n) => {
    return acc + n.latency;
  }, 0);

  // calculate the total rps per node
  const perNodeRps = upstream.map((node) => ({
    node: node.node,
    rps: node.destinations.reduce((nodeRps, pod) => nodeRps + pod.rps, 0),
  }));

  // calculate the total rps
  const totalRps = perNodeRps.reduce((acc, n) => {
    return acc + n.rps;
  }, 0);

  // console.log('perNodeRps', perNodeRps);

  const normalizedRequestPerSeconds = perNodeRps.map(({ node, rps }) => {
    const normRps = (totalRps - rps) / totalRps;
    return {
      node,
      normalizedRps: isNaN(normRps) || normRps < 0 ? 0 : normRps,
    };
  });

  // console.log('normalizedRequestPerSeconds', normalizedRequestPerSeconds);
  const normalizedLatency = nodesLatency.map(({ from, to, latency }) => {
    const normLat = latency / totalLatency;
    return {
      from,
      to,
      normalizedLatency: isNaN(normLat) || normLat < 0 ? 0 : normLat,
    };
  });

  //console.log('normalizedLatency', normalizedLatency);

  const weights: { from: string; to: string; weight: number }[] = [];

  //
  const upstreamNodeNames = Array.from(new Set(upstream.map((n) => n.node)));

  // Only calculate weights from upstream nodes to all candidate nodes
  upstreamNodeNames.forEach((from) => {
    ftNodes.forEach((to) => {
      const normRps = normalizedRequestPerSeconds.find((n) => n.node === from)?.normalizedRps ?? 0;
      const normLatency = normalizedLatency.find((n) => n.from === from && n.to === to)?.normalizedLatency ?? 0;

      // Ensure even self-referencing weights are calculated
      weights.push({
        from,
        to,
        weight: isNaN(normRps + normLatency) ? 0 : normRps + normLatency,
      });
    });
  });

  return weights;
};

export const calculateWeightsDm = (
  upstream: GraphDataRps[],
  ftNodes: string[],
  nodesLatency: NodesLatency[]
): CandidateWeights[] => {
  // calculate the total latency
  const totalLatency = nodesLatency.reduce((acc, n) => {
    return acc + n.latency;
  }, 0);

  // calculate the total rps per node
  const perNodeRps = upstream.map((node) => ({
    node: node.node,
    rps: node.destinations.reduce((nodeRps, pod) => nodeRps + pod.rps, 0),
  }));

  // calculate the total rps
  const totalRps = perNodeRps.reduce((acc, n) => {
    return acc + n.rps;
  }, 0);

  console.log('perNodeRps', perNodeRps);

  const normalizedRequestPerSeconds = perNodeRps.map(({ node, rps }) => {
    const normRps = (totalRps - rps) / totalRps;
    return {
      node,
      normalizedRps: isNaN(normRps) || normRps < 0 ? 0 : normRps,
    };
  });

  console.log('normalizedRequestPerSeconds', normalizedRequestPerSeconds);
  const normalizedLatency = nodesLatency.map(({ from, to, latency }) => {
    const normLat = latency / totalLatency;
    return {
      from,
      to,
      normalizedLatency: isNaN(normLat) || normLat < 0 ? 0 : normLat,
    };
  });

  console.log('normalizedLatency', normalizedLatency);

  const weights: { from: string; to: string; weight: number }[] = [];

  //
  const upstreamNodeNames = Array.from(new Set(upstream.map((n) => n.node)));

  // Only calculate weights from upstream nodes to all candidate nodes
  upstreamNodeNames.forEach((from) => {
    ftNodes.forEach((to) => {
      const normRps = normalizedRequestPerSeconds.find((n) => n.node === from)?.normalizedRps ?? 0;
      const normLatency = normalizedLatency.find((n) => n.from === from && n.to === to)?.normalizedLatency ?? 0;

      // Ensure even self-referencing weights are calculated
      weights.push({
        from,
        to,
        weight: isNaN(normRps + normLatency) ? 0 : normRps + normLatency,
      });
    });
  });

  return weights;
};
