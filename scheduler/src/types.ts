import type { DeploymentPlacementModel, PodMetrics } from './adapters/k8s/types';
import type { MetricsType } from './enums';

export type MetricWeights = {
  CPU: number;
  Memory: number;
};
export type ConfigMetrics = {
  upperThreshold: number;
  lowerThreshold: number;
  type: MetricsType;
  weights: MetricWeights;
};

export type Resources = {
  cpu: number;
  memory: number;
};

export type DeploymentReplicaPodsMetrics = {
  [key: string]: PodMetrics[];
};

export type NodeRps = {
  node: string;
  rps: number;
};

export type NodeWeight = {
  name: string;
  score: number;
};

/** DEFAULT TYPES */

export type ObjectStrings = { [key: string]: string[] };
export type ObjectResources = Record<string, { totalCpu: number; totalMemory: number; currentNode: string }[]>;
export type MapResourcesNode = {
  name: string;
  cpu: number;
  memory: number;
};

/************************* EXCHANGE PODS */

export type CandidateAndCurrentNodes = {
  currentNode: string;
  candidateNode: string;
};

/************************ RESPONSE TIME TYPES */

export type DeploymentLabels = {
  deployment: string;
  matchLabels: { [key: string]: string };
};

type NodePodsMap = {
  name: string;
  pods: string[];
};

export type DeploymentReplicasData = DeploymentLabels & {
  nodes: NodePodsMap[];
};

export type CandidateReschedulingPods = DeploymentPlacementModel & {
  candidateNode: string; // this is the node where the pod will be created
  currentNode: string;
  maxPodCpu: number;
  maxPodMemory: number;
};

/*********************************** PROMETHEUS TYPES */

export type PrometheusFetchData_Istio_Metrics = {
  status: string;
  data: {
    resultType: string;
    result: {
      metric: {
        node: string;
        source_workload: string;
        destination_workload: string;
        pod: string;
      };
      value: [number, string];
    }[];
  };
};

export type PrometheusTransformResultsToIstioMetrics = {
  node: string;
  source: string;
  target: string;
  replicaPod: string;
  metric: number;
};
