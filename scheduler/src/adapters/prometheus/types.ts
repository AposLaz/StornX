/************************************************* PROMETHEUS TYPES */
export type PrometheusResults = {
  metric: PodRps | PromNodesLatency | PromDeploymentResponseTime;
  value: [number, string];
};

export type PrometheusData = {
  resultType: string;
  result: PrometheusResults[];
};

export type PrometheusResponseType = {
  status: string;
  data: PrometheusData;
};

export type PodResourceUsageType = {
  namespace: string;
  podName: string;
  metric: number;
};

/******************************************** PROMETHEUS LATENCY */

export type PromNodesLatency = {
  from_node: string;
  to_node: string;
};

export type NodesLatency = {
  from: string;
  to: string;
  latency: number;
};

/******************************************** PROMETHEUS RPS */
export type PodRps = {
  pod: string;
  namespace: string;
  instance?: string;
  node?: string;
} & Partial<Omit<DeploymentGraphRps, 'pod' | 'node'>>;

export type DeploymentGraphRps = {
  rps: number;
  node: string;
  pod: string;
  source_workload: string;
  source_version: string;
  source_workload_namespace: string;
  destination_service_name: string;
  destination_service_namespace: string;
  destination_version: string;
  destination_workload: string;
};

export type GraphDataRps = {
  node: string;
  destinations: DeploymentGraphRps[];
};

/******************************************** PROMETHEUS RESPONSE TIME */

export type PromDeploymentResponseTime = {
  destination_workload: string;
  namespace: string;
  node: string;
};

export type DeploymentResponseTime = {
  node: string;
  deployment: string;
  namespace: string;
  responseTime: number;
};
