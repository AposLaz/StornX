import { convertResourcesStringToNumber } from '../../common/helpers.js';
import { logger } from '../../config/logger.js';
import { TaintEffects } from '../../enums.js';

import type {
  ClusterAzTopology,
  DeploymentReplicaPods,
  LatencyProviderType,
  ClusterTopology,
  DeploymentNotReadyFilesystem,
  DeploymentPlacementModel,
  NodeLatency,
  NodeMetrics,
  PodMetrics,
  ZoneLatency,
} from './types.js';
import type { DeploymentReplicaPodsMetrics, MetricWeights } from '../../types.js';
import type * as k8s from '@kubernetes/client-node';

const k8sMapper = {
  toClusterTopology: (nodes: k8s.V1Node[]): ClusterTopology[] => {
    return nodes.map((node) => {
      return {
        region: node.metadata!.labels!['topology.kubernetes.io/region'],
        zone: node.metadata!.labels!['topology.kubernetes.io/zone'],
        node: node.metadata!.labels!['kubernetes.io/hostname'],
      };
    });
  },
  toClusterAzTopology: (cluster: ClusterTopology[]): ClusterAzTopology => {
    const assignNodesToZones: ClusterAzTopology = {};

    cluster.forEach((node) => {
      assignNodesToZones[node.zone] = assignNodesToZones[node.zone] || {
        nodes: [],
      };
      assignNodesToZones[node.zone].nodes.push(node.node);
    });

    return assignNodesToZones;
  },
  toDeploymentLabels: (deployment: k8s.V1Deployment): string | undefined => {
    // Extract label selector from the Deployment's spec
    const matchLabels = deployment.spec?.selector?.matchLabels;
    if (!matchLabels) {
      logger.error(`Deployment ${deployment.metadata?.name} does not have matchLabels defined.`);
      return;
    }

    // Convert matchLabels into a label selector string
    const labelSelector = Object.entries(matchLabels)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');

    return labelSelector;
  },
  /**
   * Map Deployments to its replica pod's metrics
   *
   *  Given a mapping of deployments to their respective replica pods and a list of pod metrics,
   *  this function will return a new mapping where the values are the pod metrics for each replica pod.
   *
   *  For example, given the following input:
   *
   *    deployments = {
   *      'deployment-1': [
   *        { pod: 'pod-1', node: 'node-1' },
   *        { pod: 'pod-2', node: 'node-2' },
   *      ],
   *      'deployment-2': [
   *       { pod: 'pod-3', node: 'node-3' },
   *        { pod: 'pod-4', node: 'node-4' },
   *      ],
   *    }
   *
   *    podMetrics = [
   *      { pod: 'pod-1', cpu: 100, memory: 100 },
   *      { pod: 'pod-2', cpu: 200, memory: 200 },
   *      { pod: 'pod-3', cpu: 300, memory: 300 },
   *      { pod: 'pod-4', cpu: 400, memory: 400 },
   *    ]
   *
   *  The function will return the following output:
   *
   *    {
   *      'deployment-1': [
   *        { pod: 'pod-1', node: 'node-1', cpu: 100, memory: 100 },
   *        { pod: 'pod-2', node: 'node-2', cpu: 200, memory: 200 },
   *      ],
   *      'deployment-2': [
   *        { pod: 'pod-3', node: 'node-3', cpu: 300, memory: 300 },
   *        { pod: 'pod-4', node: 'node-4', cpu: 400, memory: 400 },
   *      ],
   *    }
   */
  toDeploymentMetrics: (deployments: DeploymentReplicaPods, podMetrics: PodMetrics[]): DeploymentReplicaPodsMetrics => {
    const podMetricsMap = new Map(podMetrics.map((m) => [m.pod, m]));

    return Object.fromEntries(
      Object.entries(deployments).map(([deployment, pods]) => [
        deployment,
        pods.map((pod) => podMetricsMap.get(pod.pod)).filter(Boolean) as PodMetrics[],
      ])
    );
  },
  toDeploymentStore: (deployment: DeploymentPlacementModel): DeploymentNotReadyFilesystem => ({
    deploymentName: deployment.deploymentName, // key is the pod name
    namespace: deployment.namespace,
    deletePod: deployment.deletePod,
  }),
  toNamespace: (ns: string, labels?: { [key: string]: string }): k8s.CoreV1ApiCreateNamespaceRequest => ({
    body: {
      metadata: {
        name: ns,
        labels: {
          ...labels,
        },
      },
    },
  }),
  toNodeTaints: (deploymentName: string): k8s.V1Taint => ({
    key: deploymentName, // key is the deployment name
    effect: TaintEffects.NO_SCHEDULE,
  }),
  toNodeLocalityLabels: (nodes: k8s.V1Node[]): { [key: string]: string }[] => {
    return nodes.map((node) => ({
      'topology.istio.io/subzone': node.metadata!.name!,
    }));
  },
  toNodeLatency: (cluster: ClusterTopology[], latencies: LatencyProviderType[]): NodeLatency[] => {
    const allLatencies: NodeLatency[] = [];

    // Ensure all node pairs are accounted for
    cluster.forEach((fromNode) => {
      cluster.forEach((toNode) => {
        // Find the latency for the specific zone pair
        const matchingLatency = latencies.flatMap((region) =>
          Object.values(region).flatMap((zoneLatencies: ZoneLatency[]) =>
            zoneLatencies.filter((latency) => latency.from === fromNode.zone && latency.to === toNode.zone)
          )
        )[0]; // Take the first match if found

        allLatencies.push({
          from: fromNode.node,
          to: toNode.node,
          latency: matchingLatency ? matchingLatency.latency : 0, // Default to 0 if no latency is found
        });
      });
    });

    return allLatencies.filter((latency) => latency.latency > 0);
  },
  toNodeResources: (nodes: k8s.NodeStatus[]): NodeMetrics[] => {
    // CPU to millicores & RAM to MB
    return nodes.map((node) => {
      const capacity = {
        cpu: Number(node.CPU.Capacity) * 1000,
        memory: Number(node.Memory.Capacity) / (1024 * 1024),
      };

      const allocatable = {
        cpu: convertResourcesStringToNumber(node.Node.status!.allocatable!.cpu),
        memory: convertResourcesStringToNumber(node.Node.status!.allocatable!.memory) / 1024,
      };

      const requested = {
        cpu: Number(node.CPU.RequestTotal) * 1000,
        memory: Number(node.Memory.RequestTotal) / (1024 * 1024),
      };

      const limits = {
        cpu: Number(node.CPU.LimitTotal) * 1000,
        memory: Number(node.Memory.LimitTotal) / (1024 * 1024),
      };

      return {
        name: node.Node.metadata!.name as string,
        zone: node.Node.metadata!.labels!['topology.kubernetes.io/zone'] ?? 'no-zone',
        capacity: capacity,
        //Allocatable represents the resources of a node that are available for scheduling. Defaults to Capacity.
        allocatable: allocatable,
        requested: requested,
        limits: limits,
        freeToUse: {
          cpu: allocatable.cpu - requested.cpu,
          memory: allocatable.memory - requested.memory,
        },
      };
    });
  },
  toPodResources: (pods: k8s.PodStatus[], weights: MetricWeights): PodMetrics[] => {
    // CPU to millicores & RAM to MB
    return pods.map((pod) => {
      const usageCpu = Number(pod.CPU.CurrentUsage) * 1000;
      const usageMem = Number(pod.Memory.CurrentUsage) / (1024 * 1024);
      const limitCpu = Number(pod.CPU.LimitTotal) * 1000;
      const limitMem = Number(pod.Memory.LimitTotal) / (1024 * 1024);

      const normalizedCpu = usageCpu / limitCpu;
      const normalizedMem = usageMem / limitMem;

      return {
        node: pod.Pod.spec!.nodeName as string,
        pod: pod.Pod.metadata!.name as string,
        usage: {
          cpu: usageCpu,
          memory: usageMem,
        },
        percentUsage: {
          cpu: normalizedCpu,
          memory: normalizedMem,
          cpuAndMemory: weights.CPU * normalizedCpu + weights.Memory * normalizedMem,
        },
        requested: {
          cpu: Number(pod.CPU.RequestTotal) * 1000,
          memory: Number(pod.Memory.RequestTotal) / (1024 * 1024),
        },
        limits: {
          cpu: limitCpu,
          memory: limitMem,
        },
      };
    });
  },
};

export { k8sMapper };
