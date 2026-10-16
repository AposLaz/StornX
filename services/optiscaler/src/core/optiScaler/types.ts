import type {
  ClusterAzTopology,
  NodeMetrics,
  PodMetrics,
} from '@stornx/platform/adapters/k8s/types.js';
import type { PrometheusAdapterImpl } from '@stornx/platform/adapters/prometheus/index.js';
import type { NodesLatency } from '@stornx/platform/adapters/prometheus/types.js';

export type FaultToleranceType = {
  deployment: string;
  replicaPods: PodMetrics[];
  nodeMetrics: NodeMetrics[];
  zonesNodes: ClusterAzTopology;
};

export type OptiScalerHandlers = {
  prom: PrometheusAdapterImpl;
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
