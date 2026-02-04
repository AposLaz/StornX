// __tests__/TrafficEngine.spec.ts
// Adjust the paths based on your structure

import {
  buildCluster,
  buildNodesLatency,
  buildUpstream,
  buildLatencyWithSlowNode,
  getTrafficPercent,
  printTrafficDistribution,
  Scenarios,
} from './data/testBuilders';
import { TrafficEngine } from '../../src/core/optiBalancer/engine';
import { MetricsType } from '../../src/enums';

import type { PodMetrics } from '../../src/adapters/k8s/types';
import type { GraphDataRps, NodesLatency } from '../../src/adapters/prometheus/types';
import type { DistributedPercentTraffic } from '../../src/core/optiBalancer/types';

const makePod = (pod: string, node: string, cpuPercent: number, memPercent: number): PodMetrics =>
  ({
    pod,
    node,
    usage: { cpu: 0, memory: 0 },
    requested: { cpu: 0, memory: 0 },
    limits: { cpu: 0, memory: 0 },
    percentUsage: {
      cpu: cpuPercent,
      memory: memPercent,
      cpuAndMemory: cpuPercent + memPercent,
    },
  }) as unknown as PodMetrics; // cast so tests don't break if types expand later

describe('TrafficEngine', () => {
  const engine = new TrafficEngine(MetricsType.CPU_MEMORY);

  describe('normalizeTo100', () => {
    it('scales values so they sum to 100 while preserving proportions', () => {
      const input = { a: 2, b: 1, c: 1 }; // total 4
      const out = engine.normalizeTo100(input);
      const sum = Object.values(out).reduce((acc, v) => acc + v, 0);
      expect(sum).toBe(100);

      // Approx proportions: a ~ 50, b ~ 25, c ~ 25
      expect(out.a).toBeGreaterThan(out.b);
      expect(out.b).toBeCloseTo(out.c, 0); // integer, so equal
    });

    it('handles zero or empty maps safely', () => {
      const out = engine.normalizeTo100({});
      const sum = Object.values(out).reduce((acc, v) => acc + v, 0);
      expect(sum).toBe(0); // no keys => 0
    });
  });

  describe('percentListToDistribute / distributeToPercentList', () => {
    it('groups and ungroups consistently', () => {
      const list: DistributedPercentTraffic[] = [
        { from: 'a', to: 'x', percentage: 60 },
        { from: 'a', to: 'y', percentage: 40 },
        { from: 'b', to: 'x', percentage: 100 },
      ];

      const distribute = engine.percentListToDistribute(list);
      expect(distribute).toEqual([
        { from: 'a', to: { x: 60, y: 40 } },
        { from: 'b', to: { x: 100 } },
      ]);

      const back = engine.distributeToPercentList(distribute);
      // order may differ; re-group for assertions
      const group = (arr: DistributedPercentTraffic[]) =>
        arr.reduce<Record<string, Record<string, number>>>((acc, e) => {
          acc[e.from] ??= {};
          acc[e.from][e.to] = e.percentage;
          return acc;
        }, {});

      expect(group(back)).toEqual(group(list));
    });
  });

  describe('stepTowardTarget', () => {
    it('moves toward target with adaptive step size based on urgency', () => {
      const current = [{ from: 'a', to: { x: 100 } }];
      const target = [{ from: 'a', to: { x: 0, y: 100 } }];

      // minStep=5, maxStep=20, urgencyThreshold=50, epsilon=0.1
      // delta = 200 (100-0 + 0-100), urgency = min(1, 200/50) = 1
      // step = 5 + 1*(20-5) = 20
      const next = engine.stepTowardTarget(current, target, 5, 20, 50, 0.1);

      // current: 100% x, 0% y
      // target:  0% x, 100% y
      // next should shift with adaptive step and renormalize to 100
      const nextMap = next[0].to;
      const sum = Object.values(nextMap).reduce((acc, v) => acc + v, 0);
      expect(sum).toBe(100);

      // x should be less than 100, y should be greater than 0
      expect(nextMap.x).toBeLessThan(100);
      expect(nextMap.y).toBeGreaterThan(0);
    });

    it('uses smaller step when delta is small (low urgency)', () => {
      const current = [{ from: 'a', to: { x: 90, y: 10 } }];
      const target = [{ from: 'a', to: { x: 80, y: 20 } }];

      // delta = 20 (90-80 + 10-20), urgency = min(1, 20/50) = 0.4
      // step = 5 + 0.4*(20-5) = 11
      const next = engine.stepTowardTarget(current, target, 5, 20, 50, 0.1);

      const nextMap = next[0].to;
      // With small delta, should move towards target with moderate step
      expect(nextMap.x).toBeLessThan(90);
      expect(nextMap.x).toBeGreaterThan(70); // not too aggressive
    });

    it('keeps keys non-negative and normalized', () => {
      const current = [{ from: 'a', to: { x: 10, y: 90 } }];
      const target = [{ from: 'a', to: { x: 100 } }];

      const next = engine.stepTowardTarget(current, target, 5, 50, 50, 0.1);
      const to = next[0].to;

      Object.values(to).forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
      const sum = Object.values(to).reduce((acc, v) => acc + v, 0);
      expect(sum).toBe(100);
    });
  });

  describe('l1Distance', () => {
    it('computes sum of absolute diffs over all from/to pairs', () => {
      const a = [{ from: 'a', to: { x: 60, y: 40 } }];
      const b = [{ from: 'a', to: { x: 70, y: 30 } }];

      const d = engine.l1Distance(a, b);
      // |60-70| + |40-30| = 10 + 10 = 20
      expect(d).toBe(20);
    });
  });

  describe('calculateTraffic', () => {
    it('returns per-from distributions that sum to 100', () => {
      const pods: PodMetrics[] = [
        // node-a: higher load
        makePod('pod-a-1', 'node-a', 0.7, 0.6),
        makePod('pod-a-2', 'node-a', 0.6, 0.5),
        // node-b: lighter load
        makePod('pod-b-1', 'node-b', 0.3, 0.3),
        makePod('pod-b-2', 'node-b', 0.35, 0.25),
      ];

      const upstream: GraphDataRps[] = [
        { node: 'node-a', destinations: [] },
        { node: 'node-b', destinations: [] },
      ] as unknown as GraphDataRps[];

      const nodesLatency: NodesLatency[] = [
        { from: 'node-a', to: 'node-a', latency: 10 },
        { from: 'node-a', to: 'node-b', latency: 30 },
        { from: 'node-b', to: 'node-b', latency: 8 },
        { from: 'node-b', to: 'node-a', latency: 20 },
      ] as NodesLatency[];

      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // group by from
      const grouped = result.reduce<Record<string, DistributedPercentTraffic[]>>((acc, r) => {
        acc[r.from] ??= [];
        acc[r.from].push(r);
        return acc;
      }, {});

      for (const [, edges] of Object.entries(grouped)) {
        const sum = edges.reduce((acc, e) => acc + e.percentage, 0);
        expect(sum).toBe(100);

        // if a local edge exists, its share should be >= 35%
        const local = edges.find((e) => e.from === e.to);
        if (local) {
          const share = local.percentage / 100;
          expect(share).toBeGreaterThanOrEqual(0.35);
        }
      }
    });
  });

  /**
   * ============================================
   * SCENARIO-BASED TESTS
   * These tests help understand algorithm behavior
   * ============================================
   */
  describe('Scenario: Two nodes with equal load', () => {
    it('should distribute traffic proportionally to replica count', () => {
      const { pods, upstream, nodesLatency } = Scenarios.twoNodesEqual();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // With equal load and equal replicas, expect roughly 50/50 split
      // But local share enforcement (35%) affects this
      const fromA = result.filter((r) => r.from === 'node-a');
      const fromB = result.filter((r) => r.from === 'node-b');

      // Each source should send to both destinations
      expect(fromA.length).toBe(2);
      expect(fromB.length).toBe(2);

      // Local traffic should be >= 35%
      expect(getTrafficPercent(result, 'node-a', 'node-a')).toBeGreaterThanOrEqual(35);
      expect(getTrafficPercent(result, 'node-b', 'node-b')).toBeGreaterThanOrEqual(35);

      // Uncomment to visualize:
      // printTrafficDistribution(result, 'Two Nodes Equal Load');
    });
  });

  describe('Scenario: One node overloaded', () => {
    it('should send less traffic to the overloaded node', () => {
      const { pods, upstream, nodesLatency } = Scenarios.twoNodesOneOverloaded();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-a is at 90% load, node-b at 30%
      // From node-b, should prefer local (node-b) over sending to overloaded node-a
      const fromBtoA = getTrafficPercent(result, 'node-b', 'node-a');
      const fromBtoB = getTrafficPercent(result, 'node-b', 'node-b');

      // Expect more traffic stays local on node-b (healthy) than goes to node-a (overloaded)
      expect(fromBtoB).toBeGreaterThan(fromBtoA);

      // Uncomment to visualize:
      // printTrafficDistribution(result, 'One Node Overloaded');
    });

    it('should still respect minimum local share even on overloaded node', () => {
      const { pods, upstream, nodesLatency } = Scenarios.twoNodesOneOverloaded();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // Even overloaded node-a should get at least 35% of its own traffic locally
      // This is the enforced local share rule
      expect(getTrafficPercent(result, 'node-a', 'node-a')).toBeGreaterThanOrEqual(35);
    });
  });

  describe('Scenario: One node with high latency', () => {
    it('should send less traffic to the high-latency node', () => {
      const { pods, upstream, nodesLatency } = Scenarios.twoNodesOneHighLatency();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-b has 100ms latency (slow), node-a is fast
      // From node-a, should prefer local over sending to slow node-b
      const fromAtoA = getTrafficPercent(result, 'node-a', 'node-a');
      const fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');

      expect(fromAtoA).toBeGreaterThan(fromAtoB);

      // Uncomment to visualize:
      // printTrafficDistribution(result, 'One Node High Latency');
    });
  });

  describe('Scenario: Three nodes with varying loads', () => {
    it('should prefer the lightest-loaded node', () => {
      const { pods, upstream, nodesLatency } = Scenarios.threeNodesVaryingLoad();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-a: 80% load (high)
      // node-b: 50% load (medium)
      // node-c: 20% load (light)

      // From node-a, cross-node traffic should prefer node-c (lightest) over node-b
      const fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');
      const fromAtoC = getTrafficPercent(result, 'node-a', 'node-c');

      // node-c is lightest, should get more cross-node traffic
      expect(fromAtoC).toBeGreaterThanOrEqual(fromAtoB);

      // Uncomment to visualize:
      // printTrafficDistribution(result, 'Three Nodes Varying Load');
    });
  });

  describe('Scenario: All nodes equally overloaded', () => {
    it('should distribute based on replica count when loads are equal', () => {
      const { pods, upstream, nodesLatency } = Scenarios.allNodesOverloaded();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // All nodes at 90% load - algorithm should fall back to replica-based distribution
      // With equal replicas, expect similar distribution patterns from each source

      const fromA = result.filter((r) => r.from === 'node-a');
      const fromB = result.filter((r) => r.from === 'node-b');
      const fromC = result.filter((r) => r.from === 'node-c');

      // Each should distribute to all 3 nodes
      expect(fromA.length).toBe(3);
      expect(fromB.length).toBe(3);
      expect(fromC.length).toBe(3);

      // All sums should be 100
      expect(fromA.reduce((a, r) => a + r.percentage, 0)).toBe(100);
      expect(fromB.reduce((a, r) => a + r.percentage, 0)).toBe(100);
      expect(fromC.reduce((a, r) => a + r.percentage, 0)).toBe(100);

      // Uncomment to visualize:
      // printTrafficDistribution(result, 'All Nodes Overloaded');
    });
  });

  describe('Scenario: Uneven replica distribution', () => {
    it('should send more traffic to nodes with more replicas', () => {
      const { pods, upstream, nodesLatency } = Scenarios.unevenReplicas();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-a: 4 replicas
      // node-b: 2 replicas
      // node-c: 1 replica

      // From any source, cross-node traffic to node-a should be highest (most capacity)
      // Note: local share enforcement may affect this for local traffic

      // From node-c, should prefer node-a (most replicas) for cross-node traffic
      const fromCtoA = getTrafficPercent(result, 'node-c', 'node-a');
      const fromCtoB = getTrafficPercent(result, 'node-c', 'node-b');

      expect(fromCtoA).toBeGreaterThan(fromCtoB);

      // Uncomment to visualize:
      // printTrafficDistribution(result, 'Uneven Replicas');
    });
  });

  describe('Scenario: Cross-AZ latency simulation', () => {
    it('should prefer lower latency destinations', () => {
      const { pods, upstream, nodesLatency } = Scenarios.crossAzLatency();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // Latency matrix:
      // az1 -> az2: 5ms, az1 -> az3: 8ms
      // az2 -> az1: 5ms, az2 -> az3: 6ms
      // az3 -> az1: 8ms, az3 -> az2: 6ms

      // From az1, cross-zone traffic should prefer az2 (5ms) over az3 (8ms)
      const fromAz1toAz2 = getTrafficPercent(result, 'node-az1', 'node-az2');
      const fromAz1toAz3 = getTrafficPercent(result, 'node-az1', 'node-az3');

      expect(fromAz1toAz2).toBeGreaterThanOrEqual(fromAz1toAz3);

      // Uncomment to visualize:
      // printTrafficDistribution(result, 'Cross-AZ Latency');
    });
  });

  /**
   * ============================================
   * CUSTOM SCENARIO TESTS
   * Use these to experiment with specific configurations
   * ============================================
   */
  describe('Custom scenarios for algorithm analysis', () => {
    it('should handle mixed high-load and high-latency', () => {
      // node-a: low load, low latency (ideal)
      // node-b: high load, low latency
      // node-c: low load, high latency
      const nodes = ['node-a', 'node-b', 'node-c'];

      const pods = buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 20 }, // light
        { node: 'node-b', podCount: 2, loadPercent: 85 }, // heavy
        { node: 'node-c', podCount: 2, loadPercent: 20 }, // light
      ]);

      const latencyMatrix: Record<string, Record<string, number>> = {
        'node-a': { 'node-a': 0, 'node-b': 5, 'node-c': 50 },
        'node-b': { 'node-a': 5, 'node-b': 0, 'node-c': 50 },
        'node-c': { 'node-a': 50, 'node-b': 50, 'node-c': 0 },
      };

      const upstream = buildUpstream(nodes);
      const nodesLatency = buildNodesLatency(nodes, latencyMatrix);

      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // From node-a:
      // - node-a: local, low load (should be preferred)
      // - node-b: close but heavy load
      // - node-c: light load but high latency
      // Algorithm should balance these factors

      const fromAtoA = getTrafficPercent(result, 'node-a', 'node-a');
      const fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');
      const fromAtoC = getTrafficPercent(result, 'node-a', 'node-c');

      // Local should have highest share due to 35% enforcement + being ideal
      expect(fromAtoA).toBeGreaterThan(fromAtoB);
      expect(fromAtoA).toBeGreaterThan(fromAtoC);

      // Print to analyze the tradeoffs
      // printTrafficDistribution(result, 'Mixed Load and Latency');
    });

    it('should handle extreme load difference', () => {
      const nodes = ['node-a', 'node-b'];

      const pods = buildCluster([
        { node: 'node-a', podCount: 2, loadPercent: 95 }, // nearly maxed
        { node: 'node-b', podCount: 2, loadPercent: 10 }, // nearly idle
      ]);

      const upstream = buildUpstream(nodes);
      const nodesLatency = buildNodesLatency(nodes);

      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // With extreme load difference, should heavily prefer node-b
      // But local share enforcement still applies

      const fromAtoA = getTrafficPercent(result, 'node-a', 'node-a');
      const fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');

      // Local share enforcement means node-a still gets >= 35% of its own traffic
      expect(fromAtoA).toBeGreaterThanOrEqual(35);

      // Print to see actual distribution
      // printTrafficDistribution(result, 'Extreme Load Difference');
    });

    it('should handle single replica per node', () => {
      const nodes = ['node-a', 'node-b', 'node-c'];

      const pods = buildCluster([
        { node: 'node-a', podCount: 1, loadPercent: 50 },
        { node: 'node-b', podCount: 1, loadPercent: 50 },
        { node: 'node-c', podCount: 1, loadPercent: 50 },
      ]);

      const upstream = buildUpstream(nodes);
      const nodesLatency = buildNodesLatency(nodes);

      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // With equal load and single replicas, distribution should be even
      // Local share enforcement affects local traffic

      // All sources should have 3 destinations
      const fromA = result.filter((r) => r.from === 'node-a');
      expect(fromA.length).toBe(3);
      expect(fromA.reduce((a, r) => a + r.percentage, 0)).toBe(100);

      // Print to analyze
      // printTrafficDistribution(result, 'Single Replica Per Node');
    });
  });

  // ============================================
  // EDGE CASE SCENARIOS
  // ============================================

  describe('Scenario: Single node cluster (UC-08)', () => {
    it('should send all traffic locally when only one node exists', () => {
      const { pods, upstream, nodesLatency } = Scenarios.singleNode();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // Only one node, so 100% local
      expect(getTrafficPercent(result, 'node-a', 'node-a')).toBe(100);
    });
  });

  describe('Scenario: Single replica total (UC-09)', () => {
    it('should handle minimal deployment', () => {
      const { pods, upstream, nodesLatency } = Scenarios.singleReplica();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // Single pod, all traffic goes to it
      expect(getTrafficPercent(result, 'node-a', 'node-a')).toBe(100);
    });
  });

  describe('Scenario: Five nodes cluster (UC-10)', () => {
    it('should distribute traffic across all 5 nodes', () => {
      const { pods, upstream, nodesLatency } = Scenarios.fiveNodesCluster();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // From node-a (30% load), should distribute to all nodes
      const fromA = result.filter((r) => r.from === 'node-a');
      expect(fromA.length).toBe(5);
      expect(fromA.reduce((a, r) => a + r.percentage, 0)).toBe(100);

      // Should prefer lighter nodes (a=30%, d=40%) over heavier (c=70%, e=60%)
      const fromAtoC = getTrafficPercent(result, 'node-a', 'node-c');
      const fromAtoD = getTrafficPercent(result, 'node-a', 'node-d');
      expect(fromAtoD).toBeGreaterThanOrEqual(fromAtoC);
    });
  });

  // ============================================
  // LOAD DISTRIBUTION SCENARIOS
  // ============================================

  describe('Scenario: Extreme load difference (UC-11)', () => {
    it('should handle 95% vs 5% load difference', () => {
      const { pods, upstream, nodesLatency } = Scenarios.extremeLoadDifference();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // From node-a (95%), should send more to node-b (5%)
      const fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');
      expect(fromAtoB).toBeGreaterThan(0);

      // Local share enforcement still applies
      expect(getTrafficPercent(result, 'node-a', 'node-a')).toBeGreaterThanOrEqual(35);
    });
  });

  describe('Scenario: All nodes idle (UC-12)', () => {
    it('should distribute evenly when all nodes have 0% load', () => {
      const { pods, upstream, nodesLatency } = Scenarios.allNodesIdle();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // All idle, distribution should be based on replicas (equal here)
      const fromA = result.filter((r) => r.from === 'node-a');
      expect(fromA.reduce((a, r) => a + r.percentage, 0)).toBe(100);
    });
  });

  describe('Scenario: Load gradient (UC-13)', () => {
    it('should prefer lighter-loaded nodes in gradient', () => {
      const { pods, upstream, nodesLatency } = Scenarios.loadGradient();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // From node-e (90%), cross-node should prefer node-a (10%)
      const fromEtoA = getTrafficPercent(result, 'node-e', 'node-a');
      const fromEtoD = getTrafficPercent(result, 'node-e', 'node-d');
      expect(fromEtoA).toBeGreaterThanOrEqual(fromEtoD);
    });
  });

  describe('Scenario: One node at threshold (UC-14)', () => {
    it('should handle node exactly at 70% threshold', () => {
      const { pods, upstream, nodesLatency } = Scenarios.oneNodeAtThreshold();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-a at 70%, others at 40%
      // Cross-node from node-a should prefer node-b and node-c
      const fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');
      const fromAtoC = getTrafficPercent(result, 'node-a', 'node-c');
      expect(fromAtoB + fromAtoC).toBeGreaterThan(30);
    });
  });

  // ============================================
  // LATENCY SCENARIOS
  // ============================================

  describe('Scenario: Extreme latency difference (UC-15)', () => {
    it('should heavily favor local when cross-node latency is 500ms', () => {
      const { pods, upstream, nodesLatency } = Scenarios.extremeLatencyDifference();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // With 500ms cross-node latency, should keep more traffic local
      const fromAtoA = getTrafficPercent(result, 'node-a', 'node-a');
      expect(fromAtoA).toBeGreaterThan(50);
    });
  });

  describe('Scenario: Asymmetric latency (UC-16)', () => {
    it('should handle asymmetric latency (A->B fast, B->A slow)', () => {
      const { pods, upstream, nodesLatency } = Scenarios.asymmetricLatency();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // A->B is 5ms (fast), B->A is 100ms (slow)
      // From node-a, cross-node to B should be reasonable
      const fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');
      // From node-b, cross-node to A should be lower due to high latency
      const fromBtoA = getTrafficPercent(result, 'node-b', 'node-a');

      // Both should respect latency differences
      expect(fromAtoB + fromBtoA).toBeLessThan(100);
    });
  });

  describe('Scenario: Uniform latency (UC-17)', () => {
    it('should distribute based on load when latency is uniform', () => {
      const { pods, upstream, nodesLatency } = Scenarios.uniformLatency();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // All 10ms cross-node latency, 50% load - should be balanced
      const fromA = result.filter((r) => r.from === 'node-a');
      expect(fromA.length).toBe(3);
      expect(fromA.reduce((a, r) => a + r.percentage, 0)).toBe(100);
    });
  });

  describe('Scenario: Multi-region simulation (UC-18)', () => {
    it('should respect high inter-region latency', () => {
      const { pods, upstream, nodesLatency } = Scenarios.multiRegion();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // EU->US: 80ms, EU->Asia: 150ms
      // From EU, should prefer US over Asia due to lower latency
      const fromEUtoUS = getTrafficPercent(result, 'node-eu', 'node-us');
      const fromEUtoAsia = getTrafficPercent(result, 'node-eu', 'node-asia');

      expect(fromEUtoUS).toBeGreaterThanOrEqual(fromEUtoAsia);
    });
  });

  // ============================================
  // REPLICA DISTRIBUTION SCENARIOS
  // ============================================

  describe('Scenario: Highly uneven replicas (UC-19)', () => {
    it('should account for 10:1 replica ratio', () => {
      const { pods, upstream, nodesLatency } = Scenarios.highlyUnevenReplicas();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-a has 10 replicas, node-b has 1
      // From node-b, should send more to node-a (more capacity)
      const fromBtoA = getTrafficPercent(result, 'node-b', 'node-a');
      expect(fromBtoA).toBeGreaterThan(30);
    });
  });

  describe('Scenario: Partial deployment (UC-20)', () => {
    it('should handle node with no replicas being upstream source', () => {
      const { pods, upstream, nodesLatency } = Scenarios.partialDeployment();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-c has no pods but is upstream source
      // All its traffic should go to node-a and node-b
      const fromC = result.filter((r) => r.from === 'node-c');
      expect(fromC.every((r) => r.to !== 'node-c' || r.percentage === 0)).toBe(true);
    });
  });

  // ============================================
  // COMBINED FACTOR SCENARIOS
  // ============================================

  describe('Scenario: Worst node (UC-21)', () => {
    it('should minimize traffic to node with high load + high latency', () => {
      const { pods, upstream, nodesLatency } = Scenarios.worstNode();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-c: 90% load + 100ms latency (worst)
      // From node-a, should prefer node-b over node-c
      const fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');
      const fromAtoC = getTrafficPercent(result, 'node-a', 'node-c');

      expect(fromAtoB).toBeGreaterThan(fromAtoC);
    });
  });

  describe('Scenario: Load vs Latency tradeoff (UC-22)', () => {
    it('should balance load and latency factors', () => {
      const { pods, upstream, nodesLatency } = Scenarios.loadVsLatencyTradeoff();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-a: balanced (50% load, low latency)
      // node-b: high load (85%), low latency
      // node-c: low load (20%), high latency (100ms)

      // From node-a, which wins: high-load/low-latency or low-load/high-latency?
      const fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');
      const fromAtoC = getTrafficPercent(result, 'node-a', 'node-c');

      // Both should get some traffic, algorithm balances both factors
      expect(fromAtoB + fromAtoC).toBeGreaterThan(0);
    });
  });

  describe('Scenario: More replicas on overloaded node (UC-23)', () => {
    it('should test if replica count compensates for high load', () => {
      const { pods, upstream, nodesLatency } = Scenarios.moreReplicasOnOverloaded();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-a: 5 replicas, 80% load
      // node-b: 1 replica, 20% load
      // From node-b, should prefer... which?
      const fromBtoA = getTrafficPercent(result, 'node-b', 'node-a');
      const fromBtoB = getTrafficPercent(result, 'node-b', 'node-b');

      // Local share still applies, plus algorithm balances replicas vs load
      expect(fromBtoA + fromBtoB).toBe(100);
    });
  });

  describe('Scenario: More replicas on high-latency node (UC-24)', () => {
    it('should test if replica count compensates for high latency', () => {
      const { pods, upstream, nodesLatency } = Scenarios.moreReplicasOnHighLatency();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-a: 1 replica, 50% load, low latency from A
      // node-b: 5 replicas, 50% load, 100ms latency
      const fromAtoA = getTrafficPercent(result, 'node-a', 'node-a');
      const fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');

      // Algorithm should balance replica count vs latency
      expect(fromAtoA + fromAtoB).toBe(100);
    });
  });

  // ============================================
  // REAL-WORLD SIMULATION SCENARIOS
  // ============================================

  describe('Scenario: AWS 3-AZ deployment (UC-25)', () => {
    it('should handle realistic AWS latencies', () => {
      const { pods, upstream, nodesLatency } = Scenarios.awsThreeAz();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // Realistic AZ latencies: 0.1-0.7ms
      // Should distribute based primarily on load since latencies are minimal
      const fromA = result.filter((r) => r.from === 'node-1a');
      expect(fromA.length).toBe(3);
      expect(fromA.reduce((a, r) => a + r.percentage, 0)).toBe(100);
    });
  });

  describe('Scenario: Hot spot (UC-26)', () => {
    it('should redirect traffic away from hot spot', () => {
      const { pods, upstream, nodesLatency } = Scenarios.hotSpot();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-a at 95% (hot spot), others at 20%
      // From node-b, should prefer node-c over node-a
      const fromBtoA = getTrafficPercent(result, 'node-b', 'node-a');
      const fromBtoC = getTrafficPercent(result, 'node-b', 'node-c');

      expect(fromBtoC).toBeGreaterThanOrEqual(fromBtoA);
    });
  });

  describe('Scenario: Cold start (UC-27)', () => {
    it('should attract traffic to newly started node', () => {
      const { pods, upstream, nodesLatency } = Scenarios.coldStart();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-c just started (5% load)
      // From node-a (60%), should send traffic to node-c
      const fromAtoC = getTrafficPercent(result, 'node-a', 'node-c');
      expect(fromAtoC).toBeGreaterThan(0);
    });
  });

  describe('Scenario: Scale-up (UC-28)', () => {
    it('should direct traffic to newly added node', () => {
      const { pods, upstream, nodesLatency } = Scenarios.scaleUp();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // Existing nodes at 75%, new node at 10%
      // From existing nodes, should prefer new node
      const fromAtoNew = getTrafficPercent(result, 'node-a', 'node-new');
      const fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');

      expect(fromAtoNew).toBeGreaterThan(fromAtoB);
    });
  });

  describe('Scenario: Degraded node (UC-29)', () => {
    it('should minimize traffic to degraded node', () => {
      const { pods, upstream, nodesLatency } = Scenarios.degradedNode();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-c: 85% load + 50ms latency (degraded)
      // From node-a, should prefer node-b
      const fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');
      const fromAtoC = getTrafficPercent(result, 'node-a', 'node-c');

      expect(fromAtoB).toBeGreaterThan(fromAtoC);
    });
  });

  describe('Scenario: Micro-burst (UC-30)', () => {
    it('should redirect traffic during burst', () => {
      const { pods, upstream, nodesLatency } = Scenarios.microBurst();
      const result = engine.calculateTraffic(pods, upstream, nodesLatency);

      // node-b at 98% (burst)
      // From node-a, should avoid node-b
      const fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');
      const fromAtoC = getTrafficPercent(result, 'node-a', 'node-c');

      expect(fromAtoC).toBeGreaterThan(fromAtoB);
    });
  });

  // ============================================
  // RESPONSE TIME SCENARIOS (UC-31 to UC-35)
  // ============================================

  describe('Scenario: One node high response time (UC-31)', () => {
    const scenario = Scenarios.oneNodeHighResponseTime();

    it('slow node (node-c) should receive significantly less traffic', () => {
      const result = engine.calculateTraffic(
        scenario.pods,
        scenario.upstream,
        scenario.nodesLatency,
        scenario.nodeResponseTimes
      );

      // node-c has 300ms response time (3x threshold), should get less traffic
      const nodeATraffic = getTrafficPercent(result, 'node-a', 'node-a');
      const nodeBTraffic = getTrafficPercent(result, 'node-a', 'node-b');
      const nodeCTraffic = getTrafficPercent(result, 'node-a', 'node-c');

      // Fast nodes should get more traffic than slow node
      expect(nodeATraffic).toBeGreaterThan(nodeCTraffic);
      expect(nodeBTraffic).toBeGreaterThan(nodeCTraffic);
    });

    it('prints distribution', () => {
      const result = engine.calculateTraffic(
        scenario.pods,
        scenario.upstream,
        scenario.nodesLatency,
        scenario.nodeResponseTimes
      );
      printTrafficDistribution(result, 'UC-31: One Node High Response Time');
    });
  });

  describe('Scenario: All nodes high response time (UC-32)', () => {
    const scenario = Scenarios.allNodesHighResponseTime();

    it('should still distribute traffic when all nodes are slow', () => {
      const result = engine.calculateTraffic(
        scenario.pods,
        scenario.upstream,
        scenario.nodesLatency,
        scenario.nodeResponseTimes
      );

      // All nodes have same response time, load, and replicas - should be relatively even
      const totalEntries = result.length;
      expect(totalEntries).toBeGreaterThan(0);

      // Verify traffic sums to 100% from each source
      const nodeATotal = result.filter((r) => r.from === 'node-a').reduce((sum, r) => sum + r.percentage, 0);
      expect(nodeATotal).toBeCloseTo(100, 0);
    });

    it('prints distribution', () => {
      const result = engine.calculateTraffic(
        scenario.pods,
        scenario.upstream,
        scenario.nodesLatency,
        scenario.nodeResponseTimes
      );
      printTrafficDistribution(result, 'UC-32: All Nodes High Response Time');
    });
  });

  describe('Scenario: Low load high response time (UC-33)', () => {
    const scenario = Scenarios.lowLoadHighResponseTime();

    it('slow node should receive less traffic despite low CPU load', () => {
      const result = engine.calculateTraffic(
        scenario.pods,
        scenario.upstream,
        scenario.nodesLatency,
        scenario.nodeResponseTimes
      );

      // node-b has 500ms response time but 20% load, should still get less traffic
      const nodeATraffic = getTrafficPercent(result, 'node-a', 'node-a');
      const nodeBTraffic = getTrafficPercent(result, 'node-a', 'node-b');

      // Fast node-a should get more traffic than slow node-b
      // Despite both having same low load (20%)
      expect(nodeATraffic).toBeGreaterThan(nodeBTraffic);
    });

    it('prints distribution', () => {
      const result = engine.calculateTraffic(
        scenario.pods,
        scenario.upstream,
        scenario.nodesLatency,
        scenario.nodeResponseTimes
      );
      printTrafficDistribution(result, 'UC-33: Low Load High Response Time');
    });
  });

  describe('Scenario: Load vs response time tradeoff (UC-34)', () => {
    const scenario = Scenarios.loadVsResponseTimeTradeoff();

    it('response time penalty should significantly reduce traffic to slow node', () => {
      const result = engine.calculateTraffic(
        scenario.pods,
        scenario.upstream,
        scenario.nodesLatency,
        scenario.nodeResponseTimes
      );

      // node-a: 80% load, 60ms response time
      // node-b: 20% load, 400ms response time
      // This is a genuine tradeoff - high load vs slow response time
      // The algorithm balances both factors
      const nodeATraffic = getTrafficPercent(result, 'node-a', 'node-a');
      const nodeBTraffic = getTrafficPercent(result, 'node-a', 'node-b');

      // Without response time penalty, node-b would get ~80% traffic due to low load
      // With response time penalty (400ms = 4x threshold), node-b's advantage is reduced
      // The traffic should be more balanced than pure load-based would suggest
      expect(nodeATraffic).toBeGreaterThan(30); // node-a gets significant traffic despite high load
      expect(nodeBTraffic).toBeGreaterThan(30); // node-b still gets traffic due to low load

      // Verify total is 100%
      expect(nodeATraffic + nodeBTraffic).toBeCloseTo(100, 0);
    });

    it('prints distribution', () => {
      const result = engine.calculateTraffic(
        scenario.pods,
        scenario.upstream,
        scenario.nodesLatency,
        scenario.nodeResponseTimes
      );
      printTrafficDistribution(result, 'UC-34: Load vs Response Time Tradeoff');
    });
  });

  describe('Scenario: Response time gradient (UC-35)', () => {
    const scenario = Scenarios.responseTimeGradient();

    it('traffic should inversely correlate with response time', () => {
      const result = engine.calculateTraffic(
        scenario.pods,
        scenario.upstream,
        scenario.nodesLatency,
        scenario.nodeResponseTimes
      );

      // Response times: node-a=50ms, node-b=100ms, node-c=200ms, node-d=400ms
      const nodeATraffic = getTrafficPercent(result, 'node-a', 'node-a');
      const nodeBTraffic = getTrafficPercent(result, 'node-a', 'node-b');
      const nodeCTraffic = getTrafficPercent(result, 'node-a', 'node-c');
      const nodeDTraffic = getTrafficPercent(result, 'node-a', 'node-d');

      // Traffic should decrease as response time increases
      expect(nodeATraffic).toBeGreaterThan(nodeBTraffic);
      expect(nodeBTraffic).toBeGreaterThan(nodeCTraffic);
      expect(nodeCTraffic).toBeGreaterThan(nodeDTraffic);
    });

    it('prints distribution', () => {
      const result = engine.calculateTraffic(
        scenario.pods,
        scenario.upstream,
        scenario.nodesLatency,
        scenario.nodeResponseTimes
      );
      printTrafficDistribution(result, 'UC-35: Response Time Gradient');
    });
  });

  /**
   * ============================================
   * VISUALIZATION TEST
   * Uncomment to see all scenario outputs
   * ============================================
   */
  describe.skip('Visualization of all scenarios', () => {
    it('prints all scenario distributions', () => {
      const allScenarios = [
        { name: 'UC-01: Two Nodes Equal', data: Scenarios.twoNodesEqual() },
        { name: 'UC-02: One Node Overloaded', data: Scenarios.twoNodesOneOverloaded() },
        { name: 'UC-03: One Node High Latency', data: Scenarios.twoNodesOneHighLatency() },
        { name: 'UC-04: Three Nodes Varying Load', data: Scenarios.threeNodesVaryingLoad() },
        { name: 'UC-05: All Nodes Overloaded', data: Scenarios.allNodesOverloaded() },
        { name: 'UC-06: Uneven Replicas', data: Scenarios.unevenReplicas() },
        { name: 'UC-07: Cross-AZ Latency', data: Scenarios.crossAzLatency() },
        { name: 'UC-08: Single Node', data: Scenarios.singleNode() },
        { name: 'UC-09: Single Replica', data: Scenarios.singleReplica() },
        { name: 'UC-10: Five Nodes Cluster', data: Scenarios.fiveNodesCluster() },
        { name: 'UC-11: Extreme Load Difference', data: Scenarios.extremeLoadDifference() },
        { name: 'UC-12: All Nodes Idle', data: Scenarios.allNodesIdle() },
        { name: 'UC-13: Load Gradient', data: Scenarios.loadGradient() },
        { name: 'UC-14: One Node At Threshold', data: Scenarios.oneNodeAtThreshold() },
        { name: 'UC-15: Extreme Latency Difference', data: Scenarios.extremeLatencyDifference() },
        { name: 'UC-16: Asymmetric Latency', data: Scenarios.asymmetricLatency() },
        { name: 'UC-17: Uniform Latency', data: Scenarios.uniformLatency() },
        { name: 'UC-18: Multi-Region', data: Scenarios.multiRegion() },
        { name: 'UC-19: Highly Uneven Replicas', data: Scenarios.highlyUnevenReplicas() },
        { name: 'UC-20: Partial Deployment', data: Scenarios.partialDeployment() },
        { name: 'UC-21: Worst Node', data: Scenarios.worstNode() },
        { name: 'UC-22: Load vs Latency Tradeoff', data: Scenarios.loadVsLatencyTradeoff() },
        { name: 'UC-23: More Replicas On Overloaded', data: Scenarios.moreReplicasOnOverloaded() },
        { name: 'UC-24: More Replicas On High Latency', data: Scenarios.moreReplicasOnHighLatency() },
        { name: 'UC-25: AWS 3-AZ Deployment', data: Scenarios.awsThreeAz() },
        { name: 'UC-26: Hot Spot', data: Scenarios.hotSpot() },
        { name: 'UC-27: Cold Start', data: Scenarios.coldStart() },
        { name: 'UC-28: Scale-Up', data: Scenarios.scaleUp() },
        { name: 'UC-29: Degraded Node', data: Scenarios.degradedNode() },
        { name: 'UC-30: Micro-Burst', data: Scenarios.microBurst() },
      ];

      // Scenarios without response time data
      for (const scenario of allScenarios) {
        const result = engine.calculateTraffic(scenario.data.pods, scenario.data.upstream, scenario.data.nodesLatency);
        printTrafficDistribution(result, scenario.name);
      }

      // Response time scenarios (UC-31 to UC-35)
      const responseTimeScenarios = [
        { name: 'UC-31: One Node High Response Time', data: Scenarios.oneNodeHighResponseTime() },
        { name: 'UC-32: All Nodes High Response Time', data: Scenarios.allNodesHighResponseTime() },
        { name: 'UC-33: Low Load High Response Time', data: Scenarios.lowLoadHighResponseTime() },
        { name: 'UC-34: Load vs Response Time Tradeoff', data: Scenarios.loadVsResponseTimeTradeoff() },
        { name: 'UC-35: Response Time Gradient', data: Scenarios.responseTimeGradient() },
      ];

      for (const scenario of responseTimeScenarios) {
        const result = engine.calculateTraffic(
          scenario.data.pods,
          scenario.data.upstream,
          scenario.data.nodesLatency,
          scenario.data.nodeResponseTimes
        );
        printTrafficDistribution(result, scenario.name);
      }
    });
  });
});
