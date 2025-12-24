// optiBalancer/index.ts
import { TrafficEngine } from './engine.js';
import { OptiBalancerMapper } from './mapper.js';
import { logger } from '../../config/logger.js';

import type { DestinationRule, DistributedPercentTraffic, OptiScalerType } from './types.js';
import type { KubernetesAdapterImpl } from '../../adapters/k8s/index.js';
import type { PrometheusAdapterImpl } from '../../adapters/prometheus/index.js';
import type { MetricsType } from '../../enums.js';

export class OptiBalancer {
  private readonly k8s: KubernetesAdapterImpl;
  private readonly prom: PrometheusAdapterImpl;
  private readonly metricType: MetricsType;
  private readonly loggerOperation = logger.child({ operation: 'OptiBalancer' });
  private readonly engine: TrafficEngine;

  constructor(k8s: KubernetesAdapterImpl, prometheus: PrometheusAdapterImpl, metricType: MetricsType) {
    this.k8s = k8s;
    this.prom = prometheus;
    this.metricType = metricType;
    this.engine = new TrafficEngine(metricType);
  }

  async Execute(data: OptiScalerType) {
    const upstream = await this.prom.getUpstreamPodGraph(data.deployment, data.namespace);
    if (!upstream || upstream.length === 0) {
      return;
    }

    this.loggerOperation.info(`Initialize traffic distribution rules`, {
      deployment: data.deployment,
      namespace: data.namespace,
    });

    // --- Compute target distribution (delegated to TrafficEngine) ---
    const targetList: DistributedPercentTraffic[] = this.engine.calculateTraffic(
      data.replicaPods,
      upstream,
      data.nodesLatency
    );

    const serviceName = upstream[0].destinations[0].destination_service_name;

    // ---- READ current DR from cluster
    const group = 'networking.istio.io';
    const version = 'v1beta1'; // match your CRD version
    const plural = 'destinationrules';

    const current = await this.k8s.readCustomResource(group, version, data.namespace, plural, serviceName);

    // if DR doesn't exist yet, apply target directly
    if (!current) {
      const dr = OptiBalancerMapper.toDestinationRule(targetList, data.namespace, serviceName, data.clusterTopology);
      await this.applyTrafficRules(dr);
      return;
    }

    let currentDistribute: Array<{ from: string; to: Record<string, number> }> | undefined;

    const dist = current?.spec?.trafficPolicy?.loadBalancer?.localityLbSetting?.distribute;
    if (Array.isArray(dist)) {
      // trust the live DR as current
      currentDistribute = dist as Array<{ from: string; to: Record<string, number> }>;
    }

    // Target as per-from maps
    const targetDistribute = this.engine.percentListToDistribute(targetList);

    // If we have no live DR yet, apply target directly
    const nextDistribute = currentDistribute
      ? this.engine.stepTowardTarget(currentDistribute, targetDistribute, /*step*/ 5, /*epsilon*/ 1)
      : targetDistribute;

    // Optional: only apply if change is meaningful (sum of absolute diffs ≥ 10)
    const delta = currentDistribute ? this.engine.l1Distance(currentDistribute, nextDistribute) : 100;

    if (delta < 10) {
      this.loggerOperation.info(`Skip apply (delta=${delta.toFixed(2)} < 10)`);
      return;
    }

    // Convert back to your flat list for the mapper
    const nextList = this.engine.distributeToPercentList(nextDistribute);

    const createDestinationRule = OptiBalancerMapper.toDestinationRule(
      nextList,
      data.namespace,
      serviceName,
      data.clusterTopology
    );

    // console.log(JSON.stringify(createDestinationRule, null, 2));

    await this.applyTrafficRules(createDestinationRule);
  }

  private async applyTrafficRules(createDestinationRule: DestinationRule) {
    await this.k8s.applyCustomResource(createDestinationRule);
  }
}
