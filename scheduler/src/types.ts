import type { DeploymentPlacementModel, PodMetrics } from './adapters/k8s/types';
import type { MetricsType } from './enums';

/**
 * Type guard and interface for Kubernetes API errors.
 * Used to properly type error handling in K8s service calls.
 */
export interface K8sApiError extends Error {
  statusCode?: number;
  code?: number;
  body?: unknown;
  response?: {
    statusCode?: number;
    status?: number;
    body?: unknown;
  };
}

export const isK8sApiError = (error: unknown): error is K8sApiError => {
  return error instanceof Error && ('statusCode' in error || 'response' in error || 'code' in error);
};

export const getK8sErrorStatusCode = (error: unknown): number | undefined => {
  if (!isK8sApiError(error)) return undefined;
  return error.statusCode ?? error.code ?? error.response?.statusCode ?? error.response?.status;
};

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
