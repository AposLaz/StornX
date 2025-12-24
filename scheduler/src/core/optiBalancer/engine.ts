import { MetricsType } from '../../enums.js';

import type { DistributedPercentTraffic, NormalizedTraffic, TrafficWeights } from './types.js';
import type { PodMetrics } from '../../adapters/k8s/types.js';
import type { GraphDataRps, NodesLatency } from '../../adapters/prometheus/types.js';

export class TrafficEngine {
  private readonly metricType: MetricsType;

  constructor(metricType: MetricsType) {
    this.metricType = metricType;
  }

  public calculateTraffic(
    replicaPods: PodMetrics[],
    upstream: GraphDataRps[],
    nodesLatency: NodesLatency[]
  ): DistributedPercentTraffic[] {
    const podsPerNode = this.groupPodsByNode(replicaPods);
    const uniqueNodes = Array.from(podsPerNode.keys());

    const totalReplicas = Math.max(1, replicaPods.length); // guard

    const rawTotalLoad = this.totalLoad(replicaPods);
    const avgTotalLoad = rawTotalLoad / totalReplicas || 0;

    const totalLatency = uniqueNodes.reduce((acc, n) => acc + this.totalLatency(upstream, n, nodesLatency), 0);

    const weights: TrafficWeights[] = [];

    for (const node of uniqueNodes) {
      const nodesLatencyPerNode = this.perNodeLatency(upstream, node, nodesLatency);
      const podsWithinNode = podsPerNode.get(node)!;

      const nodeLoad = this.totalLoad(podsWithinNode) / Math.max(1, podsWithinNode.length) || 0;
      const loadRatioRaw = avgTotalLoad > 0 ? nodeLoad / avgTotalLoad : 1;
      const loadRatio = isNaN(loadRatioRaw) || loadRatioRaw >= 1 ? 1 : loadRatioRaw;
      const normalizedLoad = Math.min(0.9, loadRatio);

      for (const nl of nodesLatencyPerNode) {
        const normalizedPodsLength = podsWithinNode.length / totalReplicas;

        const latencyRatioRaw = totalLatency > 0 ? nl.latency / totalLatency : 0;
        const latencyRatio = isNaN(latencyRatioRaw) || latencyRatioRaw < 0 ? 0 : latencyRatioRaw;
        const normalizedLatency = Math.min(0.9, latencyRatio);

        const weight = (1 - normalizedLatency) * normalizedPodsLength * (1 - normalizedLoad);
        weights.push({ from: nl.from, to: nl.to, weight });
      }
    }

    // --- Normalize weights ---
    const totalWeights = weights.reduce((acc, n) => acc + n.weight, 0);
    if (totalWeights === 0) {
      // nothing to route
      return this.convertTrafficDistributionToPercentages([]);
    }

    const normalizedTraffic: NormalizedTraffic[] = weights.map((w) => ({
      from: w.from,
      to: w.to,
      normalizedTraffic: w.weight / totalWeights,
    }));

    const withLocalShare = this.enforcePerFromLocalShare(normalizedTraffic, 0.35);
    return this.convertTrafficDistributionToPercentages(withLocalShare);
  }

  // Convert your DistributedPercentTraffic[] (flat) to per-from maps
  public percentListToDistribute(list: DistributedPercentTraffic[]) {
    const grouped = new Map<string, Record<string, number>>();
    for (const { from, to, percentage } of list) {
      if (!grouped.has(from)) grouped.set(from, {});
      grouped.get(from)![to] = (grouped.get(from)![to] ?? 0) + percentage;
    }
    return Array.from(grouped.entries()).map(([from, to]) => ({ from, to }));
  }

  public distributeToPercentList(
    distribute: Array<{ from: string; to: Record<string, number> }>
  ): DistributedPercentTraffic[] {
    const out: DistributedPercentTraffic[] = [];
    for (const d of distribute) {
      for (const [to, pct] of Object.entries(d.to)) {
        out.push({ from: d.from, to, percentage: Math.round(pct) });
      }
    }
    return out;
  }

  public normalizeTo100(m: Record<string, number>): Record<string, number> {
    const entries = Object.entries(m);
    const sum = entries.reduce((a, [, v]) => a + v, 0) || 1;
    const floats = entries.map(([k, v]) => [k, (v / sum) * 100] as const);
    const floors = floats.map(([k, f]) => [k, Math.floor(f)] as const);
    let used = floors.reduce((a, [, v]) => a + v, 0);
    const rema = floats.map(([k, f], i) => ({ k, r: f - floors[i][1] })).sort((a, b) => b.r - a.r);
    const out = Object.fromEntries(floors) as Record<string, number>;
    for (let i = 0; used < 100 && i < rema.length; i++, used++) out[rema[i].k] += 1;
    return out;
  }

  public stepTowardTarget(
    current: Array<{ from: string; to: Record<string, number> }>,
    target: Array<{ from: string; to: Record<string, number> }>,
    step = 5, // ≤5% change per edge per apply
    epsilon = 1 // ignore <1% noise
  ) {
    const curByFrom = new Map(current.map((x) => [x.from, x.to]));
    const tgtByFrom = new Map(target.map((x) => [x.from, x.to]));
    const froms = new Set([...curByFrom.keys(), ...tgtByFrom.keys()]);
    const out: Array<{ from: string; to: Record<string, number> }> = [];

    for (const from of froms) {
      const curMap = curByFrom.get(from) ?? {};
      const tgtMap = tgtByFrom.get(from) ?? {};
      const keys = new Set([...Object.keys(curMap), ...Object.keys(tgtMap)]);
      const next: Record<string, number> = {};

      for (const k of keys) {
        const c = curMap[k] ?? 0;
        const t = tgtMap[k] ?? 0;
        const diff = t - c;
        next[k] = Math.abs(diff) <= epsilon ? c : c + Math.sign(diff) * Math.min(Math.abs(diff), step);
      }
      for (const k of Object.keys(next)) if (next[k] <= 0) delete next[k];
      out.push({ from, to: this.normalizeTo100(next) });
    }
    return out;
  }

  public l1Distance(
    a: Array<{ from: string; to: Record<string, number> }>,
    b: Array<{ from: string; to: Record<string, number> }>
  ) {
    const aMap = new Map(a.map((x) => [x.from, x.to]));
    const bMap = new Map(b.map((x) => [x.from, x.to]));
    const froms = new Set([...aMap.keys(), ...bMap.keys()]);
    let sum = 0;
    for (const f of froms) {
      const am = aMap.get(f) ?? {};
      const bm = bMap.get(f) ?? {};
      const keys = new Set([...Object.keys(am), ...Object.keys(bm)]);
      for (const k of keys) sum += Math.abs((am[k] ?? 0) - (bm[k] ?? 0));
    }
    return sum;
  }

  // ---------- PRIVATE helpers ----------

  private groupPodsByNode(rs: PodMetrics[]) {
    const nodeMap = new Map<string, PodMetrics[]>();

    for (const pod of rs) {
      if (!nodeMap.has(pod.node)) {
        nodeMap.set(pod.node, []);
      }
      nodeMap.get(pod.node)!.push(pod);
    }

    return nodeMap;
  }

  private totalLoad(rs: PodMetrics[]) {
    switch (this.metricType) {
      case MetricsType.CPU:
        return rs.reduce((acc, n) => acc + n.percentUsage.cpu, 0);
      case MetricsType.CPU_MEMORY:
        return rs.reduce((acc, n) => acc + n.percentUsage.cpu + n.percentUsage.memory, 0);
      default:
        return rs.reduce((acc, n) => acc + n.percentUsage.memory, 0);
    }
  }

  private totalLatency(graph: GraphDataRps[], dNode: string, nodesLatency: NodesLatency[]) {
    const latencyTo = nodesLatency.filter((n) => n.to === dNode);

    const latencyFromTo = latencyTo.filter((node) => graph.some((n) => n.node === node.from));

    return latencyFromTo.reduce((acc, n) => acc + n.latency, 0);
  }

  private perNodeLatency(graph: GraphDataRps[], dNode: string, nodesLatency: NodesLatency[]) {
    const latencyTo = nodesLatency.filter((n) => n.to === dNode);
    const latencyFromTo = latencyTo.filter((node) => graph.some((n) => n.node === node.from));
    return latencyFromTo;
  }

  private convertTrafficDistributionToPercentages(normalizedTraffic: NormalizedTraffic[]): DistributedPercentTraffic[] {
    // Step 1: Group traffic by `from` node
    const grouped = new Map<string, { to: string; raw: number }[]>();

    for (const t of normalizedTraffic) {
      if (!grouped.has(t.from)) grouped.set(t.from, []);
      grouped.get(t.from)!.push({ to: t.to, raw: t.normalizedTraffic });
    }

    // Step 2: Normalize per `from` node to ensure each sums to 100
    const out: DistributedPercentTraffic[] = [];

    for (const [from, list] of grouped.entries()) {
      const total = list.reduce((a, b) => a + b.raw, 0) || 1; // avoid div by zero
      // exact percentages
      const exact = list.map((x) => ({
        to: x.to,
        exact: (x.raw / total) * 100,
      }));
      // floor and track fractions
      const floored = exact.map((x) => ({
        to: x.to,
        base: Math.floor(x.exact),
        frac: x.exact - Math.floor(x.exact),
      }));
      let sumBase = floored.reduce((a, b) => a + b.base, 0);
      let deficit = 100 - sumBase;

      // give +1 to the largest fractions until we hit 100
      floored.sort((a, b) => b.frac - a.frac);
      for (let i = 0; i < deficit; i++) floored[i % floored.length].base += 1;

      // emit integers only
      for (const r of floored) {
        out.push({ from, to: r.to, percentage: r.base });
      }
    }

    return out;
  }

  // Scale local vs cross per `from`, preserving proportions within each bucket.
  private enforcePerFromLocalShare(edges: NormalizedTraffic[], minLocalShare = 0.7): NormalizedTraffic[] {
    // group by from node
    const grouped = new Map<string, NormalizedTraffic[]>();
    for (const e of edges) {
      if (!grouped.has(e.from)) grouped.set(e.from, []);
      grouped.get(e.from)!.push(e);
    }

    const result: NormalizedTraffic[] = [];

    for (const [, list] of grouped) {
      const total = list.reduce((a, b) => a + b.normalizedTraffic, 0) || 1;
      const local = list.find((e) => e.from === e.to);
      const localShare = local ? local.normalizedTraffic / total : 0;

      // only boost if below threshold
      if (localShare < minLocalShare && local) {
        const deficit = minLocalShare - localShare;

        // reduce non-local edges proportionally
        const crossSum = list.filter((e) => e.from !== e.to).reduce((a, b) => a + b.normalizedTraffic, 0);

        for (const e of list) {
          if (e.from === e.to) {
            e.normalizedTraffic += deficit * total; // boost local
          } else if (crossSum > 0) {
            e.normalizedTraffic -= (e.normalizedTraffic / crossSum) * (deficit * total);
          }
        }

        // clamp negatives to 0
        for (const e of list) {
          e.normalizedTraffic = Math.max(0, e.normalizedTraffic);
        }

        // normalize again per from-node
        const newTotal = list.reduce((a, b) => a + b.normalizedTraffic, 0) || 1;
        for (const e of list) e.normalizedTraffic /= newTotal;
      }

      result.push(...list);
    }

    return result;
  }
}
