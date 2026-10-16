import { Config } from '../../config/config.js';
import { MetricsType } from '@stornx/platform/enums.js';

import type {
  DistributedPercentTraffic,
  NodeResponseTime,
  NormalizedTraffic,
  TrafficWeights,
} from './types.js';
import type { PodMetrics } from '@stornx/platform/adapters/k8s/types.js';
import type { GraphDataRps, NodesLatency } from '@stornx/platform/adapters/prometheus/types.js';

/** Calculates routing weights from observations; callers own persistence and Kubernetes updates. */
export class TrafficEngine {
  private readonly metricType: MetricsType;

  constructor(metricType: MetricsType) {
    this.metricType = metricType;
  }

  /**
   * Calculate per-source traffic percentages from latency, load, replicas, and response time.
   *
   * Each destination's weight combines replica share with load, latency, and a logarithmic
   * penalty for response times above the configured threshold. Eligible local destinations
   * receive a minimum share before rounding each source's distribution to 100 percent.
   *
   * @param replicaPods - Observed serving pods and their resource usage.
   * @param upstream - Source nodes from the workload's dependency graph.
   * @param nodesLatency - Observed source-to-destination latency samples.
   * @param nodeResponseTimes - Optional destination P95 measurements in milliseconds.
   * @returns Integer percentages per source, or an empty list when no usable weights exist.
   */
  public calculateTraffic(
    replicaPods: PodMetrics[],
    upstream: GraphDataRps[],
    nodesLatency: NodesLatency[],
    nodeResponseTimes?: NodeResponseTime[],
  ): DistributedPercentTraffic[] {
    const podsPerNode = this.groupPodsByNode(replicaPods);
    const uniqueNodes = Array.from(podsPerNode.keys());

    const totalReplicas = Math.max(1, replicaPods.length); // guard

    const rawTotalLoad = this.totalLoad(replicaPods);
    const avgTotalLoad = rawTotalLoad / totalReplicas || 0;

    const totalLatency = uniqueNodes.reduce(
      (acc, n) => acc + this.totalLatency(upstream, n, nodesLatency),
      0,
    );

    // Build response time lookup map
    const responseTimeMap = new Map<string, number>();

    if (nodeResponseTimes) {
      for (const rt of nodeResponseTimes) {
        responseTimeMap.set(rt.node, rt.responseTimeMs);
      }
    }

    const weights: TrafficWeights[] = [];

    for (const node of uniqueNodes) {
      const nodesLatencyPerNode = this.perNodeLatency(upstream, node, nodesLatency);
      const podsWithinNode = podsPerNode.get(node)!;

      const nodeLoad = this.totalLoad(podsWithinNode) / Math.max(1, podsWithinNode.length) || 0;
      const loadRatioRaw = avgTotalLoad > 0 ? nodeLoad / avgTotalLoad : 1;
      const loadRatio = isNaN(loadRatioRaw) || loadRatioRaw >= 1 ? 1 : loadRatioRaw;
      const normalizedLoad = Math.min(0.9, loadRatio);

      // Calculate response time penalty for this node (absolute, not relative)
      const nodeResponseTime = responseTimeMap.get(node) ?? 0;
      const targetResponseTime = Config.metrics.responseTimeThreshold;
      const responseTimePenalty = this.calculateResponseTimePenalty(
        nodeResponseTime,
        targetResponseTime,
      );

      for (const nl of nodesLatencyPerNode) {
        const normalizedPodsLength = podsWithinNode.length / totalReplicas;

        const latencyRatioRaw = totalLatency > 0 ? nl.latency / totalLatency : 0;
        const latencyRatio = isNaN(latencyRatioRaw) || latencyRatioRaw < 0 ? 0 : latencyRatioRaw;
        const normalizedLatency = Math.min(0.9, latencyRatio);

        // Combine independent penalties with the destination's share of replicas.
        const weight =
          (1 - responseTimePenalty) *
          (1 - normalizedLatency) *
          normalizedPodsLength *
          (1 - normalizedLoad);

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

    const withLocalShare = this.enforcePerFromLocalShare(normalizedTraffic, 0.35, podsPerNode);

    return this.convertTrafficDistributionToPercentages(withLocalShare);
  }

  /** Group percentage edges by source, summing repeated destinations. */
  public percentListToDistribute(list: DistributedPercentTraffic[]) {
    const grouped = new Map<string, Record<string, number>>();

    for (const { from, to, percentage } of list) {
      if (!grouped.has(from)) {
        grouped.set(from, {});
      }

      grouped.get(from)![to] = (grouped.get(from)![to] ?? 0) + percentage;
    }

    return Array.from(grouped.entries()).map(([from, to]) => ({ from, to }));
  }

  /** Flatten per-source maps and round values; callers must normalize their totals separately. */
  public distributeToPercentList(
    distribute: Array<{ from: string; to: Record<string, number> }>,
  ): DistributedPercentTraffic[] {
    const out: DistributedPercentTraffic[] = [];

    for (const d of distribute) {
      for (const [to, pct] of Object.entries(d.to)) {
        out.push({ from: d.from, to, percentage: Math.round(pct) });
      }
    }

    return out;
  }

  /**
   * Convert nonnegative weights with a positive sum to integer percentages using largest remainders.
   * An empty map stays empty; callers must supply a meaningful positive total for other inputs.
   */
  public normalizeTo100(m: Record<string, number>): Record<string, number> {
    const entries = Object.entries(m);
    const sum = entries.reduce((a, [, v]) => a + v, 0) || 1;
    const floats = entries.map(([k, v]) => [k, (v / sum) * 100] as const);
    const floors = floats.map(([k, f]) => [k, Math.floor(f)] as const);
    let used = floors.reduce((a, [, v]) => a + v, 0);
    const rema = floats.map(([k, f], i) => ({ k, r: f - floors[i][1] })).sort((a, b) => b.r - a.r);
    const out = Object.fromEntries(floors) as Record<string, number>;

    for (let i = 0; used < 100 && i < rema.length; i++, used++) {
      out[rema[i].k] += 1;
    }

    return out;
  }

  /**
   * Move current weights toward the target, taking larger steps as their total distance grows.
   * Inputs must use the same source and destination identifiers. Step limits apply before
   * renormalization, so final rounded changes may differ from the requested step.
   *
   * @param current - Current traffic percentages grouped by source.
   * @param target - Desired traffic percentages grouped by source.
   * @param minStep - Base adjustment in percentage points; defaults to 5.
   * @param maxStep - Adjustment at full urgency in percentage points; defaults to 20.
   * @param urgencyThreshold - Total absolute distance at which maximum urgency applies.
   * @param epsilon - Differences at or below this many percentage points are ignored.
   * @returns Per-source integer distributions with nonpositive destinations removed.
   */
  public stepTowardTarget(
    current: Array<{ from: string; to: Record<string, number> }>,
    target: Array<{ from: string; to: Record<string, number> }>,
    minStep = 5,
    maxStep = 20,
    urgencyThreshold = 50,
    epsilon = 1,
  ) {
    // Calculate delta to determine urgency
    const delta = this.l1Distance(current, target);
    // Adaptive step: scales from minStep to maxStep based on urgency
    const urgency = Math.min(1, delta / urgencyThreshold);
    const step = minStep + urgency * (maxStep - minStep);
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

        next[k] =
          Math.abs(diff) <= epsilon ? c : c + Math.sign(diff) * Math.min(Math.abs(diff), step);
      }

      for (const k of Object.keys(next)) {
        if (next[k] <= 0) {
          delete next[k];
        }
      }

      out.push({ from, to: this.normalizeTo100(next) });
    }

    return out;
  }

  /**
   * Sum absolute percentage-point differences over all sources and destinations.
   * Missing entries count as zero; the total spans every source and can exceed 100.
   */
  public l1Distance(
    a: Array<{ from: string; to: Record<string, number> }>,
    b: Array<{ from: string; to: Record<string, number> }>,
  ) {
    const aMap = new Map(a.map((x) => [x.from, x.to]));
    const bMap = new Map(b.map((x) => [x.from, x.to]));
    const froms = new Set([...aMap.keys(), ...bMap.keys()]);
    let sum = 0;

    for (const f of froms) {
      const am = aMap.get(f) ?? {};
      const bm = bMap.get(f) ?? {};
      const keys = new Set([...Object.keys(am), ...Object.keys(bm)]);

      for (const k of keys) {
        sum += Math.abs((am[k] ?? 0) - (bm[k] ?? 0));
      }
    }

    return sum;
  }

  /** Index serving pods by destination node for replica and load calculations. */
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

  /** Sum the selected resource usage; combined mode adds CPU and memory usage. */
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

  /** Sum latency samples from graph source nodes to the selected destination. */
  private totalLatency(graph: GraphDataRps[], dNode: string, nodesLatency: NodesLatency[]) {
    const latencyTo = nodesLatency.filter((n) => n.to === dNode);

    const latencyFromTo = latencyTo.filter((node) => graph.some((n) => n.node === node.from));

    return latencyFromTo.reduce((acc, n) => acc + n.latency, 0);
  }

  /** Select destination latency edges whose sources occur in the dependency graph. */
  private perNodeLatency(graph: GraphDataRps[], dNode: string, nodesLatency: NodesLatency[]) {
    const latencyTo = nodesLatency.filter((n) => n.to === dNode);
    const latencyFromTo = latencyTo.filter((node) => graph.some((n) => n.node === node.from));

    return latencyFromTo;
  }

  /** Round each source's normalized edges to integer percentages totaling 100. */
  private convertTrafficDistributionToPercentages(
    normalizedTraffic: NormalizedTraffic[],
  ): DistributedPercentTraffic[] {
    // Step 1: Group traffic by `from` node
    const grouped = new Map<string, { to: string; raw: number }[]>();

    for (const t of normalizedTraffic) {
      if (!grouped.has(t.from)) {
        grouped.set(t.from, []);
      }

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

      for (let i = 0; i < deficit; i++) {
        floored[i % floored.length].base += 1;
      }

      // emit integers only
      for (const r of floored) {
        out.push({ from, to: r.to, percentage: r.base });
      }
    }

    return out;
  }

  /**
   * Boost eligible local destinations while preserving relative cross-node weights.
   * Mutates the supplied edge objects and returns them grouped by source.
   *
   * @param edges - Nonnegative fractional traffic weights.
   * @param minLocalShare - Minimum local fraction; defaults to 0.7.
   * @param podsPerNode - Destination replicas used to check local capacity eligibility.
   */
  private enforcePerFromLocalShare(
    edges: NormalizedTraffic[],
    minLocalShare = 0.7,
    podsPerNode?: Map<string, PodMetrics[]>,
  ): NormalizedTraffic[] {
    // group by from node
    const grouped = new Map<string, NormalizedTraffic[]>();

    for (const e of edges) {
      if (!grouped.has(e.from)) {
        grouped.set(e.from, []);
      }

      grouped.get(e.from)!.push(e);
    }

    const result: NormalizedTraffic[] = [];

    for (const [fromNode, list] of grouped) {
      const total = list.reduce((a, b) => a + b.normalizedTraffic, 0) || 1;
      const local = list.find((e) => e.from === e.to);
      const localShare = local ? local.normalizedTraffic / total : 0;

      // Check if local node has enough replicas to justify enforcing local share
      const shouldEnforceLocalShare = this.shouldEnforceLocalShare(fromNode, podsPerNode);

      // only boost if below threshold AND local has sufficient replicas
      if (localShare < minLocalShare && local && shouldEnforceLocalShare) {
        const deficit = minLocalShare - localShare;

        // reduce non-local edges proportionally
        const crossSum = list
          .filter((e) => e.from !== e.to)
          .reduce((a, b) => a + b.normalizedTraffic, 0);

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

        for (const e of list) {
          e.normalizedTraffic /= newTotal;
        }
      }

      result.push(...list);
    }

    return result;
  }

  /**
   * Allow a local-share boost when local replicas match or exceed the busiest other destination.
   * Without replica data, preserve the legacy behavior of allowing the boost.
   */
  private shouldEnforceLocalShare(
    fromNode: string,
    podsPerNode?: Map<string, PodMetrics[]>,
  ): boolean {
    // Preserve the original eligibility rule when no replica snapshot is supplied.
    if (!podsPerNode) {
      return true;
    }

    const localReplicas = podsPerNode.get(fromNode)?.length ?? 0;

    // A source with no local destination pods cannot receive a local-share boost.
    if (localReplicas === 0) {
      return false;
    }

    // Get max replicas across all other nodes
    let maxOtherReplicas = 0;

    for (const [node, pods] of podsPerNode) {
      if (node !== fromNode && pods.length > maxOtherReplicas) {
        maxOtherReplicas = pods.length;
      }
    }

    // Only enforce local share if local replicas >= max replicas of other nodes
    return localReplicas >= maxOtherReplicas;
  }

  /**
   * Penalize response times above the absolute target using 1 - 1 / (1 + ln(ratio)).
   * At or below target the penalty is zero; above target it grows to a cap of 0.9.
   * Nonpositive measurements or thresholds disable this penalty.
   *
   * @param responseTimeMs - P95 response time in milliseconds
   * @param targetMs - Target response time threshold (e.g., 100ms)
   * @returns A penalty between 0 and 0.9 for finite positive measurements.
   */
  private calculateResponseTimePenalty(responseTimeMs: number, targetMs: number): number {
    if (responseTimeMs <= 0 || targetMs <= 0) {
      return 0; // no penalty if no data or invalid target
    }

    // Response time ratio: how many times over target
    const ratio = responseTimeMs / targetMs;

    if (ratio <= 1) {
      // Below or at target: no penalty
      return 0;
    }

    // Logarithmic penalty: grows quickly at first, then tapers off
    // penalty = 1 - 1/(1 + ln(ratio))
    // At ratio=2: penalty ≈ 0.41
    // At ratio=3: penalty ≈ 0.52
    // At ratio=5: penalty ≈ 0.62
    // At ratio=10: penalty ≈ 0.70
    const penalty = 1 - 1 / (1 + Math.log(ratio));

    // Cap at 0.9 to never fully exclude a node
    return Math.min(0.9, penalty);
  }
}
