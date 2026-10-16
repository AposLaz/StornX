import * as k8s from '@kubernetes/client-node';

import { k8sMapper } from '../mapper.js';

import type { MetricWeights } from '../../../types.js';
import type { NodeMetrics, PodMetrics } from '../types.js';

export class MetricsService {
  private readonly metricClient: k8s.Metrics;
  private readonly coreClient: k8s.CoreV1Api;
  private readonly weights: MetricWeights;

  constructor(metricClient: k8s.Metrics, coreClient: k8s.CoreV1Api, weights: MetricWeights) {
    this.metricClient = metricClient;
    this.coreClient = coreClient;
    this.weights = weights;
  }

  async getNodesMetrics(): Promise<NodeMetrics[]> {
    const topNodes = await k8s.topNodes(this.coreClient);
    const nodeResources = k8sMapper.toNodeResources(topNodes);

    return nodeResources;
  }

  async getPodsMetrics(namespace: string): Promise<PodMetrics[]> {
    const samples = await this.metricClient.getPodMetrics(namespace);
    const oldest = Date.now() - Number(process.env.MAX_METRIC_AGE_SECONDS ?? 600) * 1000;

    if (
      !samples.items.length ||
      samples.items.some(
        (sample) =>
          !Number.isFinite(Date.parse(sample.timestamp)) || Date.parse(sample.timestamp) < oldest,
      )
    ) {
      throw new Error('Pod metrics unavailable or stale');
    }

    const topPods = await k8s.topPods(this.coreClient, this.metricClient, namespace);

    const pods = k8sMapper.toPodResources(topPods, this.weights);

    return pods;
  }
}
