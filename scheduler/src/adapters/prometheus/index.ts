import { PrometheusMapper } from './mapper.js';
import { Graph } from './services/app.graph.js';
import { ResourcesMetricsService } from './services/resources.metrics.service.js';
import { cronParseToInterval } from '../../common/helpers.js';
import { Config } from '../../config/config.js';

import type { DeploymentResponseTime, GraphDataRps, NodesLatency } from './types.js';
import type { PrometheusAdapter } from '../prometheus.interface.js';

export class PrometheusAdapterImpl implements PrometheusAdapter {
  private readonly time = cronParseToInterval(Config.CRONJOB_EXPRESSION);
  private readonly prometheusUrl = Config.prometheusUrl;
  private readonly appGraph: Graph;
  private readonly resourcesMetrics: ResourcesMetricsService;

  constructor() {
    this.appGraph = new Graph(this.prometheusUrl);
    this.resourcesMetrics = new ResourcesMetricsService(this.prometheusUrl);
  }

  async getDownstreamPodGraph(deployment: string, namespace: string): Promise<GraphDataRps[] | undefined> {
    return this.appGraph.getDeploymentDownstream(deployment, namespace, this.time);
  }

  async getUpstreamPodGraph(deployment: string, namespace: string): Promise<GraphDataRps[] | undefined> {
    return this.appGraph.getDeploymentUpstream(deployment, namespace, this.time);
  }

  async getNodesLatency(): Promise<NodesLatency[] | undefined> {
    const data = await this.resourcesMetrics.fetchNodesLatency(this.time);

    if (!data) {
      return;
    }

    return PrometheusMapper.toNodesLatency(data);
  }

  async getResponseTimeByNodeDeployment(
    deployment: string,
    namespace: string
  ): Promise<DeploymentResponseTime[] | undefined> {
    const data = await this.resourcesMetrics.fetchResponseTimeByNodeDeployment(deployment, namespace, this.time);

    if (!data) {
      return;
    }

    return PrometheusMapper.toNodesResponseTime(data);
  }

  async getAvgPodCpuUsage(pod: string, namespace: string, time: string): Promise<number | undefined> {
    return this.resourcesMetrics.fetchAvgPodCpuUsage(pod, namespace, time);
  }

  async getAvgPodMemoryUsage(pod: string, namespace: string, time: string): Promise<number | undefined> {
    return this.resourcesMetrics.fetchAvgPodMemoryUsage(pod, namespace, time);
  }

  async getCurrentPodCpuUsage(pod: string, namespace: string): Promise<number | undefined> {
    return this.resourcesMetrics.fetchCurrentPodCpuUsage(pod, namespace);
  }

  async getCurrentPodMemoryUsage(pod: string, namespace: string): Promise<number | undefined> {
    return this.resourcesMetrics.fetchCurrentPodMemoryUsage(pod, namespace);
  }
}
