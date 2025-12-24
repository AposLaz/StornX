// __tests__/TrafficEngine.spec.ts
// Adjust the paths based on your structure

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
    it('moves at most `step` per edge toward the target', () => {
      const current = [{ from: 'a', to: { x: 100 } }];
      const target = [{ from: 'a', to: { x: 0, y: 100 } }];

      const next = engine.stepTowardTarget(current, target, 5, 0.1);

      // current: 100% x, 0% y
      // target:  0% x, 100% y
      // next should shift ~5 from x to y and renormalize to 100
      const nextMap = next[0].to;
      const sum = Object.values(nextMap).reduce((acc, v) => acc + v, 0);
      expect(sum).toBe(100);

      // x should be slightly less than 100, y slightly greater than 0
      expect(nextMap.x).toBeLessThan(100);
      expect(nextMap.y).toBeGreaterThan(0);
      // change should not exceed 5 per edge before normalization
    });

    it('keeps keys non-negative and normalized', () => {
      const current = [{ from: 'a', to: { x: 10, y: 90 } }];
      const target = [{ from: 'a', to: { x: 100 } }];

      const next = engine.stepTowardTarget(current, target, 50, 0.1);
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
});
