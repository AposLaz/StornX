import type { ClusterTopology, PodMetrics } from '../../adapters/k8s/types.js';
import type { NodesLatency } from '../../adapters/prometheus/types.js';

/**
 * Response time per node (P95 in milliseconds)
 */
export type NodeResponseTime = {
  node: string;
  responseTimeMs: number;
};

export type OptiScalerType = {
  deployment: string;
  namespace: string;
  replicaPods: PodMetrics[];
  nodesLatency: NodesLatency[];
  clusterTopology: ClusterTopology[];
  /** Optional: P95 response time per node in milliseconds */
  nodeResponseTimes?: NodeResponseTime[];
};

export type FromToNode = { from: string; to: string };

export type TrafficWeights = FromToNode & {
  weight: number;
};

export type NormalizedTraffic = FromToNode & {
  normalizedTraffic: number;
};

export type DistributedPercentTraffic = FromToNode & {
  percentage: number;
};

export type DestinationRule = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    host: string;
    trafficPolicy: {
      loadBalancer: {
        simple: string;
        warmup: {
          duration: string;
          minimumPercent: number;
        };
        localityLbSetting: {
          enabled: boolean;
          distribute: {
            from: string;
            to: {
              [k: string]: number;
            };
          }[];
        };
      };
      outlierDetection: {
        consecutive5xxErrors: number;
        interval: string;
        baseEjectionTime: string;
        maxEjectionPercent: number;
      };
      connectionPool: {
        tcp: { maxConnections: number; connectTimeout: string };
        http: {
          http1MaxPendingRequests: number;
          http2MaxRequests: number;
          maxRequestsPerConnection: number;
          h2UpgradePolicy: string;
        };
      };
    };
  };
};
