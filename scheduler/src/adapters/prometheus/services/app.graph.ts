import { logger } from '../../../config/logger.js';
import { PrometheusMapper } from '../mapper.js';
import { executePrometheusQuery } from '../utils.js';

export class Graph {
  constructor(private readonly prometheusUrl: string) {
    this.prometheusUrl = prometheusUrl;
  }

  async getDeploymentDownstream(deployment: string, namespace: string, time: string) {
    try {
      const query = `sum(rate(istio_requests_total{source_workload="${deployment}", source_workload_namespace="${namespace}", destination_workload!="unknown", reporter="destination", job="kubernetes-pods", response_code!="404"}[${time}])) by (pod, node, destination_workload, destination_service_namespace, destination_service_name, destination_version, source_version, source_workload, source_workload_namespace)`;
      const result = await executePrometheusQuery(this.prometheusUrl, query);
      console.log(result);
      if (!result || result.data.result.length === 0) {
        logger.warn(`No downstream pods exists for deployment: ${deployment}`);
        return;
      }

      return PrometheusMapper.toDeploymentGraphDataRpsPerNode(result.data.result, namespace);
    } catch (e: unknown) {
      const error = e as Error;
      logger.error(error);
      return;
    }
  }

  async getDeploymentUpstream(deployment: string, namespace: string, time: string) {
    try {
      const query = `sum(rate(istio_requests_total{source_workload!="unknown",destination_workload="${deployment}", destination_service_namespace="${namespace}", reporter="source", job="kubernetes-pods", response_code!="404"}[${time}])) by (pod, node, destination_workload, destination_service_namespace, destination_service_name, destination_version, source_version, source_workload, source_workload_namespace)`;
      const result = await executePrometheusQuery(this.prometheusUrl, query);

      if (!result || result.data.result.length === 0) {
        logger.warn(`No upstream pods exists for deployment: ${deployment}`);
        return;
      }

      return PrometheusMapper.toDeploymentGraphDataRpsPerNode(result.data.result, namespace);
    } catch (e: unknown) {
      const error = e as Error;
      logger.error(error);
      return;
    }
  }
}
