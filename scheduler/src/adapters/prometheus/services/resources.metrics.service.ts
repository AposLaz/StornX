import { logger } from '../../../config/logger.js';
import { executePrometheusQuery } from '../utils.js';

export class ResourcesMetricsService {
  constructor(private readonly prometheusUrl: string) {
    this.prometheusUrl = prometheusUrl;
  }

  async fetchResponseTimeByNodeDeployment(deployment: string, namespace: string, time: string) {
    try {
      const query = `histogram_quantile(0.95, sum by(le, destination_workload, node, namespace) (rate(istio_request_duration_milliseconds_bucket{node!="unknown", destination_workload="${deployment}",namespace="${namespace}"}[${time}] offset ${time})))`;
      const result = await executePrometheusQuery(this.prometheusUrl, query);

      if (!result || result.data.result.length === 0) {
        logger.warn(`No data returned for query: ${query}`);
        return;
      }
      console.log(result.data.result);
      return result.data.result;
    } catch (e: unknown) {
      const error = e as Error;
      logger.error(error);
      return;
    }
  }

  async fetchNodesLatency(time: string) {
    try {
      const query = `avg_over_time(node_avg_latency_ms[${time}])`;
      const result = await executePrometheusQuery(this.prometheusUrl, query);

      if (!result || result.data.result.length === 0) {
        logger.warn(`No data returned for query: ${query}`);
        return;
      }

      return result.data.result;
    } catch (e: unknown) {
      const error = e as Error;
      logger.error(error);
      return;
    }
  }

  async fetchAvgPodCpuUsage(pod: string, namespace: string, time: string): Promise<number | undefined> {
    try {
      const query = `sum(rate(container_cpu_usage_seconds_total{container!="", pod="${pod}", namespace="${namespace}"}[${time}]))`;
      const result = await executePrometheusQuery(this.prometheusUrl, query);
      if (!result || result.data.result.length === 0) {
        logger.warn(`No data returned for query: ${query}`);
        return;
      }

      return Number(result.data.result[0].value[1]) * 1000;
    } catch (e: unknown) {
      const error = e as Error;
      logger.error(error);
      return;
    }
  }

  async fetchAvgPodMemoryUsage(pod: string, namespace: string, time: string): Promise<number | undefined> {
    try {
      const query = `sum(avg_over_time(container_memory_usage_bytes{container!="", pod="${pod}", namespace="${namespace}"}[${time}]))`;
      const result = await executePrometheusQuery(this.prometheusUrl, query);

      if (!result || result.data.result.length === 0) {
        logger.warn(`No data returned for query: ${query}`);
        return;
      }

      return Number(result.data.result[0].value[1]) / (1024 * 1024);
    } catch (e: unknown) {
      const error = e as Error;
      logger.error(error);
      return;
    }
  }

  async fetchCurrentPodCpuUsage(pod: string, namespace: string): Promise<number | undefined> {
    try {
      const query = `sum(container_cpu_usage_seconds_total{container!="", pod="${pod}", namespace="${namespace}"})`;
      const result = await executePrometheusQuery(this.prometheusUrl, query);

      if (!result || result.data.result.length === 0) {
        logger.warn(`No data returned for query: ${query}`);
        return;
      }

      return Number(result.data.result[0].value[1]) * 1000;
    } catch (e: unknown) {
      const error = e as Error;
      logger.error(error);
      return;
    }
  }

  async fetchCurrentPodMemoryUsage(pod: string, namespace: string): Promise<number | undefined> {
    try {
      const query = `sum(container_memory_working_set_bytes{container!="", pod="${pod}", namespace="${namespace}"})`;
      const result = await executePrometheusQuery(this.prometheusUrl, query);

      if (!result || result.data.result.length === 0) {
        logger.warn(`No data returned for query: ${query}`);
        return;
      }

      return Number(result.data.result[0].value[1]) / (1024 * 1024);
    } catch (e: unknown) {
      const error = e as Error;
      logger.error(error);
      return;
    }
  }
}
