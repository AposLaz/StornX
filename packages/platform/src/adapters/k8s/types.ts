/************************************ THRESHOLD */

export type ThresholdType = {
  upper: number;
  lower: number;
};

/************************************ LATENCY BETWEEN THE NODES */

export type NodeLatency = {
  from: string;
  to: string;
  latency: number;
};

export type ZoneLatency = NodeLatency;

export type ClusterTopology = {
  region: string;
  zone: string;
  node: string;
};

export type ClusterAzTopology = Record<string, { nodes: string[] }>;

export type LatencyProviderType = {
  [key: string]: NodeLatency[];
};

/*********************************** TAINT TYPES */

export type ReplicasAction = 'add' | 'delete';

export type DeploymentPlacementModel = {
  deploymentName: string;
  nodes: string[]; // taint these nodes
  namespace: string;
  deletePod: string;
};

export type DeploymentNotReadyFilesystem = Omit<DeploymentPlacementModel, 'nodes'>;

/******************** METRICS TYPES **************** */

export type NodeUsage = {
  node: string;
  avgMetric: number;
};

export type DeploymentNodeUsage = Record<string, NodeUsage[]>;

export type CriticalDeploymentsNodeUsage = {
  highLoadedDeployments: DeploymentNodeUsage;
  lowLoadedDeployments: DeploymentNodeUsage;
};

export type DeploymentPodMapType = {
  pod: string;
  node: string;
};

export type DeploymentReplicaPods = Record<string, DeploymentPodMapType[]>;

// CPU to millicores, Memory to MB
export type Resources = {
  cpu: number;
  memory: number;
};

export type PodMetrics = {
  node: string;
  pod: string;
  usage: Resources;
  percentUsage: Resources & {
    cpuAndMemory: number;
  };
  requested: Resources;
  limits: Resources;
};

export type NodeMetrics = {
  name: string;
  zone: string;
  capacity: Resources;
  allocatable: Resources;
  requested: Resources;
  limits: Resources;
  freeToUse: Resources;
};
