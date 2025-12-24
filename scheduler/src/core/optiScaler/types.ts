import type { FileSystemHandler } from '../../adapters/filesystem/index.js';
import type { KubernetesAdapterImpl } from '../../adapters/k8s/index.js';
import type { ClusterAzTopology, NodeMetrics, PodMetrics } from '../../adapters/k8s/types.js';
import type { PrometheusAdapterImpl } from '../../adapters/prometheus/index.js';
import type { NodesLatency } from '../../adapters/prometheus/types.js';

export type FaultToleranceType = {
  deployment: string;
  replicaPods: PodMetrics[];
  nodeMetrics: NodeMetrics[];
  zonesNodes: ClusterAzTopology;
};

export type OptiScalerHandlers = {
  prom: PrometheusAdapterImpl;
  k8s: KubernetesAdapterImpl;
  fileSystem: FileSystemHandler;
};

export type OptiScalerType = FaultToleranceType & {
  namespace: string;
  nodesLatency: NodesLatency[];
};

export type FaultNodesReplicas = {
  node: string;
  replicas?: number;
};

export type FaultNodesSumReplicas = {
  replicas: number;
  nodes: FaultNodesReplicas[];
};

export type FaultZonesNodes = Map<string, FaultNodesSumReplicas>;

export type CandidateWeights = {
  from: string;
  to: string;
  weight: number;
};
