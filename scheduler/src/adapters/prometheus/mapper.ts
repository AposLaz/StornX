import { Config } from '../../config/config.js';

import type {
  DeploymentGraphRps,
  GraphDataRps,
  PromNodesLatency,
  PodResourceUsageType,
  PodRps,
  PrometheusResults,
  NodesLatency,
  PromDeploymentResponseTime,
  DeploymentResponseTime,
} from './types.js';

export const PrometheusMapper = {
  toDeploymentGraphDataRpsPerNode: (results: PrometheusResults[], namespace: string): GraphDataRps[] => {
    // Initialize an empty array to store the transformed data.
    const mapGraph = new Map<string, DeploymentGraphRps[]>();
    results.forEach((data) => {
      const podMetrics = data.metric as PodRps;
      const addData: DeploymentGraphRps = {
        rps: Number(data.value[1]),
        node: podMetrics.node ?? 'unknown',
        pod: podMetrics.pod ?? 'unknown',
        source_workload: podMetrics.source_workload ?? 'unknown',
        source_version: podMetrics.source_version ?? 'unknown', // the version is the node of the source
        source_workload_namespace: namespace,
        destination_service_name: podMetrics.destination_service_name ?? 'unknown',
        destination_service_namespace: podMetrics.destination_service_namespace ?? 'unknown',
        destination_version: podMetrics.destination_version ?? 'unknown',
        destination_workload: podMetrics.destination_workload ?? 'unknown',
      };

      if (mapGraph.has(podMetrics.node ?? 'unknown')) {
        mapGraph.get(podMetrics.node ?? 'unknown')?.push(addData);
      } else {
        mapGraph.set(podMetrics.node ?? 'unknown', [addData]);
      }
    });
    // Convert the Map to an array of objects for easier consumption
    return Array.from(mapGraph.entries()).map(([node, destinations]) => ({
      node,
      destinations,
    }));
  },
  toNodesResponseTime(results: PrometheusResults[]): DeploymentResponseTime[] {
    const nodesResponseTime = results.map((data) => {
      const nodeMetrics = data.metric as PromDeploymentResponseTime;

      return {
        node: nodeMetrics.node,
        deployment: nodeMetrics.destination_workload,
        namespace: nodeMetrics.namespace,
        responseTime: isNaN(Number(data.value[1])) || data.value[1] == null ? 0 : Number(data.value[1]),
      };
    });

    return nodesResponseTime;
  },

  toNodesLatency(results: PrometheusResults[]): NodesLatency[] {
    const nodesLatency = results.map((data) => {
      const nodeMetrics = data.metric as PromNodesLatency;

      return {
        from: nodeMetrics.from_node,
        to: nodeMetrics.to_node,
        latency: Number(data.value[1]) / 1000, // convert microseconds to milliseconds
      };
    });
    // Get unique nodes from results
    const uniqueNodes = new Set<string>();
    results.forEach((data) => {
      const nodeMetrics = data.metric as PromNodesLatency;
      uniqueNodes.add(nodeMetrics.from_node);
      uniqueNodes.add(nodeMetrics.to_node);
    });

    // Add rules where each node sends 0% traffic to itself
    const selfTrafficRules: NodesLatency[] = Array.from(uniqueNodes).map((node) => ({
      from: node,
      to: node,
      latency: 0, // Self-traffic should always be zero
    }));

    // Combine latency results with self-traffic rules
    return [...nodesLatency, ...selfTrafficRules];
  },
  toPodResourceUsage: (results: PrometheusResults[]): PodResourceUsageType[] => {
    // Initialize an empty array to store the transformed data.
    const returnResults: PodResourceUsageType[] = [];

    results.forEach((data) => {
      const podMetrics = data.metric as PodRps;

      const returnObject: PodResourceUsageType = {
        namespace: podMetrics.namespace,
        podName: podMetrics.pod,
        metric: Number(data.value[1]),
      };
      returnResults.push(returnObject);
    });

    return returnResults;
  },
  toUpperLowerLimitPods: (pods: PodResourceUsageType[]) => {
    const aboveThreshold = pods.filter((pod) => pod.metric >= Config.metrics.upperThreshold);

    const belowThreshold = pods.filter((pod) => pod.metric < Config.metrics.upperThreshold);

    return {
      aboveThreshold,
      belowThreshold,
    };
  },
};
