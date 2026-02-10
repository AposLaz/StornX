/**
 * Test data builders for TrafficEngine testing
 * These helpers make it easy to create realistic test scenarios
 */

import type { PodMetrics } from '../../../src/adapters/k8s/types';
import type { GraphDataRps, NodesLatency } from '../../../src/adapters/prometheus/types';
import type { NodeResponseTime } from '../../../src/core/optiBalancer/types';

/**
 * Build a PodMetrics object with sensible defaults
 */
export function buildPod(overrides: {
  pod?: string;
  node: string;
  cpuPercent?: number;
  memoryPercent?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  cpuLimit?: number;
  memoryLimit?: number;
}): PodMetrics {
  const cpuPercent = overrides.cpuPercent ?? 50;
  const memoryPercent = overrides.memoryPercent ?? 50;

  return {
    pod: overrides.pod ?? `pod-${overrides.node}-${Math.random().toString(36).slice(2, 6)}`,
    node: overrides.node,
    usage: {
      cpu: overrides.cpuUsage ?? 100,
      memory: overrides.memoryUsage ?? 256,
    },
    requested: {
      cpu: 100,
      memory: 256,
    },
    limits: {
      cpu: overrides.cpuLimit ?? 200,
      memory: overrides.memoryLimit ?? 512,
    },
    percentUsage: {
      cpu: cpuPercent,
      memory: memoryPercent,
      cpuAndMemory: cpuPercent + memoryPercent,
    },
  } as PodMetrics;
}

/**
 * Build multiple pods on a node with specified load
 */
export function buildPodsOnNode(node: string, count: number, loadPercent: number): PodMetrics[] {
  return Array.from({ length: count }, (_, i) =>
    buildPod({
      pod: `pod-${node}-${i}`,
      node,
      cpuPercent: loadPercent,
      memoryPercent: loadPercent,
    })
  );
}

/**
 * Build a cluster with specified node configurations
 * @param nodeConfigs Array of { node, podCount, loadPercent }
 */
export function buildCluster(
  nodeConfigs: Array<{
    node: string;
    podCount: number;
    loadPercent: number;
  }>
): PodMetrics[] {
  return nodeConfigs.flatMap((config) => buildPodsOnNode(config.node, config.podCount, config.loadPercent));
}

/**
 * Build NodesLatency array for a set of nodes
 * @param nodes List of node names
 * @param latencyMatrix Optional custom latency matrix (node -> node -> ms)
 *                      If not provided, uses default: 0ms local, 10ms cross-node
 */
export function buildNodesLatency(
  nodes: string[],
  latencyMatrix?: Record<string, Record<string, number>>
): NodesLatency[] {
  const result: NodesLatency[] = [];

  for (const from of nodes) {
    for (const to of nodes) {
      let latency: number;
      if (latencyMatrix && latencyMatrix[from]?.[to] !== undefined) {
        latency = latencyMatrix[from][to];
      } else {
        // Default: 0ms local, 10ms cross-node
        latency = from === to ? 0 : 10;
      }
      result.push({ from, to, latency });
    }
  }

  return result;
}

/**
 * Build NodesLatency with one slow node
 * @param nodes All node names
 * @param slowNode The node that has high latency TO it
 * @param slowLatency Latency in ms to the slow node
 */
export function buildLatencyWithSlowNode(nodes: string[], slowNode: string, slowLatency: number): NodesLatency[] {
  const matrix: Record<string, Record<string, number>> = {};

  for (const from of nodes) {
    matrix[from] = {};
    for (const to of nodes) {
      if (from === to) {
        matrix[from][to] = 0; // local always 0
      } else if (to === slowNode) {
        matrix[from][to] = slowLatency; // high latency to slow node
      } else {
        matrix[from][to] = 10; // normal cross-node latency
      }
    }
  }

  return buildNodesLatency(nodes, matrix);
}

/**
 * Build GraphDataRps (upstream traffic sources)
 * @param nodes List of nodes that are sending traffic
 */
export function buildUpstream(nodes: string[]): GraphDataRps[] {
  return nodes.map((node) => ({
    node,
    destinations: [],
  })) as GraphDataRps[];
}

/**
 * Build NodeResponseTime array for testing response time impact
 * @param nodes List of node names
 * @param responseTimeMs Response time in ms per node. Can be:
 *   - number: same for all nodes
 *   - Record<string, number>: specific per node
 */
export function buildNodeResponseTimes(
  nodes: string[],
  responseTimeMs: number | Record<string, number>
): NodeResponseTime[] {
  return nodes.map((node) => ({
    node,
    responseTimeMs: typeof responseTimeMs === 'number' ? responseTimeMs : (responseTimeMs[node] ?? 50),
  }));
}

/**
 * Pretty print traffic distribution for debugging
 */
export function printTrafficDistribution(
  result: Array<{ from: string; to: string; percentage: number }>,
  title?: string
): void {
  if (title) {
    console.log(`\n=== ${title} ===`);
  }

  // Group by 'from'
  const grouped = new Map<string, Array<{ to: string; percentage: number }>>();
  for (const r of result) {
    if (!grouped.has(r.from)) {
      grouped.set(r.from, []);
    }
    grouped.get(r.from)!.push({ to: r.to, percentage: r.percentage });
  }

  // Print as table
  for (const [from, destinations] of grouped) {
    const destStr = destinations
      .sort((a, b) => b.percentage - a.percentage)
      .map((d) => `${d.to}: ${d.percentage}%`)
      .join(', ');
    console.log(`  ${from} → ${destStr}`);
  }
}

/**
 * Build a traffic distribution matrix for easy comparison
 */
export function toTrafficMatrix(
  result: Array<{ from: string; to: string; percentage: number }>
): Map<string, Map<string, number>> {
  const matrix = new Map<string, Map<string, number>>();

  for (const r of result) {
    if (!matrix.has(r.from)) {
      matrix.set(r.from, new Map());
    }
    matrix.get(r.from)!.set(r.to, r.percentage);
  }

  return matrix;
}

/**
 * Get traffic percentage from a result array
 */
export function getTrafficPercent(
  result: Array<{ from: string; to: string; percentage: number }>,
  from: string,
  to: string
): number {
  const entry = result.find((r) => r.from === from && r.to === to);
  return entry?.percentage ?? 0;
}

/**
 * Scenario builder for common test cases
 */
export const Scenarios = {
  /**
   * 2 nodes, equal load, equal replicas
   */
  twoNodesEqual(): {
    nodeResponseTimes(
      pods: PodMetrics[],
      upstream: GraphDataRps[],
      nodesLatency: NodesLatency[],
      nodeResponseTimes: any
    ): unknown;
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 50 },
        { node: 'node-b', podCount: 2, loadPercent: 50 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * 2 nodes, one overloaded
   */
  twoNodesOneOverloaded(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 90 }, // overloaded
        { node: 'node-b', podCount: 2, loadPercent: 30 }, // light
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * 2 nodes, one with high latency
   */
  twoNodesOneHighLatency(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 50 },
        { node: 'node-b', podCount: 2, loadPercent: 50 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildLatencyWithSlowNode(nodes, 'node-b', 100), // node-b is slow
    };
  },

  /**
   * 3 nodes, varying loads
   */
  threeNodesVaryingLoad(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 80 }, // high load
        { node: 'node-b', podCount: 2, loadPercent: 50 }, // medium
        { node: 'node-c', podCount: 2, loadPercent: 20 }, // light
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * 3 nodes, all overloaded equally
   */
  allNodesOverloaded(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 90 },
        { node: 'node-b', podCount: 2, loadPercent: 90 },
        { node: 'node-c', podCount: 2, loadPercent: 90 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * Uneven replica distribution
   */
  unevenReplicas(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 4, loadPercent: 50 }, // many replicas
        { node: 'node-b', podCount: 2, loadPercent: 50 }, // medium
        { node: 'node-c', podCount: 1, loadPercent: 50 }, // few
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * Cross-AZ latency simulation (3 zones)
   */
  crossAzLatency(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-az1', 'node-az2', 'node-az3'];
    const latencyMatrix: Record<string, Record<string, number>> = {
      'node-az1': { 'node-az1': 0, 'node-az2': 5, 'node-az3': 8 },
      'node-az2': { 'node-az1': 5, 'node-az2': 0, 'node-az3': 6 },
      'node-az3': { 'node-az1': 8, 'node-az2': 6, 'node-az3': 0 },
    };
    return {
      pods: buildCluster([
        { node: 'node-az1', podCount: 2, loadPercent: 50 },
        { node: 'node-az2', podCount: 2, loadPercent: 50 },
        { node: 'node-az3', podCount: 2, loadPercent: 50 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes, latencyMatrix),
    };
  },

  // ============================================
  // EDGE CASES
  // ============================================

  /**
   * UC-08: Single node cluster (no cross-node traffic possible)
   */
  singleNode(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a'];
    return {
      pods: buildCluster([{ node: 'node-a', podCount: 3, loadPercent: 50 }]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * UC-09: Single replica total (minimal deployment)
   */
  singleReplica(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a'];
    return {
      pods: buildCluster([{ node: 'node-a', podCount: 1, loadPercent: 50 }]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * UC-10: Many nodes (5 nodes, simulating larger cluster)
   */
  fiveNodesCluster(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c', 'node-d', 'node-e'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 30 },
        { node: 'node-b', podCount: 2, loadPercent: 50 },
        { node: 'node-c', podCount: 2, loadPercent: 70 },
        { node: 'node-d', podCount: 2, loadPercent: 40 },
        { node: 'node-e', podCount: 2, loadPercent: 60 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  // ============================================
  // LOAD DISTRIBUTION SCENARIOS
  // ============================================

  /**
   * UC-11: Extreme load difference (95% vs 5%)
   */
  extremeLoadDifference(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 95 },
        { node: 'node-b', podCount: 2, loadPercent: 5 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * UC-12: All nodes idle (0% load)
   */
  allNodesIdle(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 0 },
        { node: 'node-b', podCount: 2, loadPercent: 0 },
        { node: 'node-c', podCount: 2, loadPercent: 0 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * UC-13: Gradual load gradient (10%, 30%, 50%, 70%, 90%)
   */
  loadGradient(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c', 'node-d', 'node-e'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 10 },
        { node: 'node-b', podCount: 2, loadPercent: 30 },
        { node: 'node-c', podCount: 2, loadPercent: 50 },
        { node: 'node-d', podCount: 2, loadPercent: 70 },
        { node: 'node-e', podCount: 2, loadPercent: 90 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * UC-14: One node at threshold (exactly 70%)
   */
  oneNodeAtThreshold(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 70 }, // at threshold
        { node: 'node-b', podCount: 2, loadPercent: 40 },
        { node: 'node-c', podCount: 2, loadPercent: 40 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  // ============================================
  // LATENCY SCENARIOS
  // ============================================

  /**
   * UC-15: Extreme latency difference (1ms vs 500ms)
   */
  extremeLatencyDifference(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b'];
    const latencyMatrix: Record<string, Record<string, number>> = {
      'node-a': { 'node-a': 0, 'node-b': 500 },
      'node-b': { 'node-a': 500, 'node-b': 0 },
    };
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 50 },
        { node: 'node-b', podCount: 2, loadPercent: 50 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes, latencyMatrix),
    };
  },

  /**
   * UC-16: Asymmetric latency (A->B fast, B->A slow)
   */
  asymmetricLatency(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b'];
    const latencyMatrix: Record<string, Record<string, number>> = {
      'node-a': { 'node-a': 0, 'node-b': 5 }, // A to B is fast
      'node-b': { 'node-a': 100, 'node-b': 0 }, // B to A is slow
    };
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 50 },
        { node: 'node-b', podCount: 2, loadPercent: 50 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes, latencyMatrix),
    };
  },

  /**
   * UC-17: All cross-node latency equal
   */
  uniformLatency(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c'];
    const latencyMatrix: Record<string, Record<string, number>> = {
      'node-a': { 'node-a': 0, 'node-b': 10, 'node-c': 10 },
      'node-b': { 'node-a': 10, 'node-b': 0, 'node-c': 10 },
      'node-c': { 'node-a': 10, 'node-b': 10, 'node-c': 0 },
    };
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 50 },
        { node: 'node-b', podCount: 2, loadPercent: 50 },
        { node: 'node-c', podCount: 2, loadPercent: 50 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes, latencyMatrix),
    };
  },

  /**
   * UC-18: Multi-region simulation (high cross-region latency)
   */
  multiRegion(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-eu', 'node-us', 'node-asia'];
    const latencyMatrix: Record<string, Record<string, number>> = {
      'node-eu': { 'node-eu': 0, 'node-us': 80, 'node-asia': 150 },
      'node-us': { 'node-eu': 80, 'node-us': 0, 'node-asia': 120 },
      'node-asia': { 'node-eu': 150, 'node-us': 120, 'node-asia': 0 },
    };
    return {
      pods: buildCluster([
        { node: 'node-eu', podCount: 2, loadPercent: 50 },
        { node: 'node-us', podCount: 2, loadPercent: 50 },
        { node: 'node-asia', podCount: 2, loadPercent: 50 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes, latencyMatrix),
    };
  },

  // ============================================
  // REPLICA DISTRIBUTION SCENARIOS
  // ============================================

  /**
   * UC-19: Highly uneven replicas (10 vs 1)
   */
  highlyUnevenReplicas(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 10, loadPercent: 50 },
        { node: 'node-b', podCount: 1, loadPercent: 50 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * UC-20: One node with no replicas (partial deployment)
   * This simulates a node that only sends traffic but doesn't receive it
   */
  partialDeployment(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const allNodes = ['node-a', 'node-b', 'node-c'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 50 },
        { node: 'node-b', podCount: 2, loadPercent: 50 },
        // node-c has no pods but is an upstream source
      ]),
      upstream: buildUpstream(allNodes),
      nodesLatency: buildNodesLatency(allNodes),
    };
  },

  // ============================================
  // COMBINED FACTOR SCENARIOS
  // ============================================

  /**
   * UC-21: High load + high latency on same node (worst node)
   */
  worstNode(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c'];
    const latencyMatrix: Record<string, Record<string, number>> = {
      'node-a': { 'node-a': 0, 'node-b': 5, 'node-c': 100 },
      'node-b': { 'node-a': 5, 'node-b': 0, 'node-c': 100 },
      'node-c': { 'node-a': 100, 'node-b': 100, 'node-c': 0 },
    };
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 30 },
        { node: 'node-b', podCount: 2, loadPercent: 30 },
        { node: 'node-c', podCount: 2, loadPercent: 90 }, // high load + high latency
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes, latencyMatrix),
    };
  },

  /**
   * UC-22: Low load + high latency vs high load + low latency
   * Tests which factor dominates
   */
  loadVsLatencyTradeoff(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c'];
    const latencyMatrix: Record<string, Record<string, number>> = {
      'node-a': { 'node-a': 0, 'node-b': 5, 'node-c': 100 },
      'node-b': { 'node-a': 5, 'node-b': 0, 'node-c': 100 },
      'node-c': { 'node-a': 100, 'node-b': 100, 'node-c': 0 },
    };
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 50 }, // balanced, low latency
        { node: 'node-b', podCount: 2, loadPercent: 85 }, // high load, low latency
        { node: 'node-c', podCount: 2, loadPercent: 20 }, // low load, high latency
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes, latencyMatrix),
    };
  },

  /**
   * UC-23: More replicas on overloaded node
   * Tests if replica count can compensate for high load
   */
  moreReplicasOnOverloaded(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 5, loadPercent: 80 }, // many replicas but overloaded
        { node: 'node-b', podCount: 1, loadPercent: 20 }, // few replicas but light
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * UC-24: More replicas on high-latency node
   * Tests if replica count can compensate for high latency
   */
  moreReplicasOnHighLatency(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b'];
    const latencyMatrix: Record<string, Record<string, number>> = {
      'node-a': { 'node-a': 0, 'node-b': 100 },
      'node-b': { 'node-a': 100, 'node-b': 0 },
    };
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 1, loadPercent: 50 },
        { node: 'node-b', podCount: 5, loadPercent: 50 }, // many replicas but high latency
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes, latencyMatrix),
    };
  },

  // ============================================
  // REAL-WORLD SIMULATION SCENARIOS
  // ============================================

  /**
   * UC-25: AWS-like 3-AZ deployment with realistic latencies
   */
  awsThreeAz(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-1a', 'node-1b', 'node-1c'];
    const latencyMatrix: Record<string, Record<string, number>> = {
      'node-1a': { 'node-1a': 0.1, 'node-1b': 0.5, 'node-1c': 0.7 },
      'node-1b': { 'node-1a': 0.5, 'node-1b': 0.1, 'node-1c': 0.4 },
      'node-1c': { 'node-1a': 0.7, 'node-1b': 0.4, 'node-1c': 0.1 },
    };
    return {
      pods: buildCluster([
        { node: 'node-1a', podCount: 3, loadPercent: 45 },
        { node: 'node-1b', podCount: 3, loadPercent: 55 },
        { node: 'node-1c', podCount: 3, loadPercent: 50 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes, latencyMatrix),
    };
  },

  /**
   * UC-26: Hot spot scenario (one node receiving most traffic)
   */
  hotSpot(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 95 }, // hot spot
        { node: 'node-b', podCount: 2, loadPercent: 20 },
        { node: 'node-c', podCount: 2, loadPercent: 20 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * UC-27: Cold start scenario (one node just started, low load)
   */
  coldStart(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 60 },
        { node: 'node-b', podCount: 2, loadPercent: 60 },
        { node: 'node-c', podCount: 2, loadPercent: 5 }, // just started
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * UC-28: Scale-up scenario (new node added with fresh replicas)
   */
  scaleUp(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c', 'node-new'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 3, loadPercent: 75 },
        { node: 'node-b', podCount: 3, loadPercent: 75 },
        { node: 'node-c', podCount: 3, loadPercent: 75 },
        { node: 'node-new', podCount: 3, loadPercent: 10 }, // new node
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  /**
   * UC-29: Degraded node scenario (one node experiencing issues)
   */
  degradedNode(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c'];
    const latencyMatrix: Record<string, Record<string, number>> = {
      'node-a': { 'node-a': 0, 'node-b': 5, 'node-c': 50 }, // node-c has degraded latency
      'node-b': { 'node-a': 5, 'node-b': 0, 'node-c': 50 },
      'node-c': { 'node-a': 50, 'node-b': 50, 'node-c': 0 },
    };
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 50 },
        { node: 'node-b', podCount: 2, loadPercent: 50 },
        { node: 'node-c', podCount: 2, loadPercent: 85 }, // degraded: high load + high latency
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes, latencyMatrix),
    };
  },

  /**
   * UC-30: Micro-burst scenario (temporary spike on one node)
   */
  microBurst(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 40 },
        { node: 'node-b', podCount: 2, loadPercent: 98 }, // burst
        { node: 'node-c', podCount: 2, loadPercent: 40 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
    };
  },

  // ============================================
  // RESPONSE TIME SCENARIOS (UC-31 to UC-35)
  // ============================================

  /**
   * UC-31: One node with high P95 response time (slow service)
   */
  oneNodeHighResponseTime(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
    nodeResponseTimes: NodeResponseTime[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 50 },
        { node: 'node-b', podCount: 2, loadPercent: 50 },
        { node: 'node-c', podCount: 2, loadPercent: 50 }, // same load but slow response
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
      nodeResponseTimes: buildNodeResponseTimes(nodes, {
        'node-a': 50, // fast (50ms)
        'node-b': 80, // ok (80ms)
        'node-c': 300, // slow (300ms) - 3x threshold
      }),
    };
  },

  /**
   * UC-32: All nodes have high response time (system under stress)
   */
  allNodesHighResponseTime(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
    nodeResponseTimes: NodeResponseTime[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 70 },
        { node: 'node-b', podCount: 2, loadPercent: 70 },
        { node: 'node-c', podCount: 2, loadPercent: 70 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
      nodeResponseTimes: buildNodeResponseTimes(nodes, 250), // all slow
    };
  },

  /**
   * UC-33: Low load but high response time (GC pauses, external deps)
   */
  lowLoadHighResponseTime(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
    nodeResponseTimes: NodeResponseTime[];
  } {
    const nodes = ['node-a', 'node-b'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 20 }, // low load
        { node: 'node-b', podCount: 2, loadPercent: 20 }, // low load
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
      nodeResponseTimes: buildNodeResponseTimes(nodes, {
        'node-a': 50, // fast
        'node-b': 500, // very slow despite low CPU (e.g., DB connection issues)
      }),
    };
  },

  /**
   * UC-34: High load but good response time vs low load with bad response time
   * Tests if response time takes priority over load
   */
  loadVsResponseTimeTradeoff(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
    nodeResponseTimes: NodeResponseTime[];
  } {
    const nodes = ['node-a', 'node-b'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 80 }, // high load but fast
        { node: 'node-b', podCount: 2, loadPercent: 20 }, // low load but slow
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
      nodeResponseTimes: buildNodeResponseTimes(nodes, {
        'node-a': 60, // fast response despite load
        'node-b': 400, // slow response despite low load
      }),
    };
  },

  /**
   * UC-35: Response time gradient (50ms, 100ms, 200ms, 400ms)
   */
  responseTimeGradient(): {
    pods: PodMetrics[];
    upstream: GraphDataRps[];
    nodesLatency: NodesLatency[];
    nodeResponseTimes: NodeResponseTime[];
  } {
    const nodes = ['node-a', 'node-b', 'node-c', 'node-d'];
    return {
      pods: buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 50 },
        { node: 'node-b', podCount: 2, loadPercent: 50 },
        { node: 'node-c', podCount: 2, loadPercent: 50 },
        { node: 'node-d', podCount: 2, loadPercent: 50 },
      ]),
      upstream: buildUpstream(nodes),
      nodesLatency: buildNodesLatency(nodes),
      nodeResponseTimes: buildNodeResponseTimes(nodes, {
        'node-a': 50, // excellent
        'node-b': 100, // at threshold
        'node-c': 200, // 2x threshold
        'node-d': 400, // 4x threshold
      }),
    };
  },
};
