import type { DestinationRule, DistributedPercentTraffic } from './types.js';
import type { ClusterTopology } from '../../adapters/k8s/types.js';

export const OptiBalancerMapper = {
  toDestinationRule: (
    trafficRules: DistributedPercentTraffic[],
    namespace: string,
    svc: string,
    clusterTopology: ClusterTopology[]
  ): DestinationRule => {
    const trafficRulesTopology = trafficRules
      .map((tr) => {
        const nodeFrom = clusterTopology.find((ct) => ct.node === tr.from);

        const nodeTo = clusterTopology.find((ct) => ct.node === tr.to);

        if (!nodeFrom || !nodeTo) {
          return;
        }

        return {
          from: `${nodeFrom.region}/${nodeFrom.zone}/${nodeFrom.node}`,
          to: `${nodeTo.region}/${nodeTo.zone}/${nodeTo.node}`,
          percentage: tr.percentage,
        };
      })
      .filter(Boolean) as DistributedPercentTraffic[];

    const groupedTraffic: Record<string, Record<string, number>> = {};

    trafficRulesTopology.forEach(({ from, to, percentage }) => {
      if (!groupedTraffic[from]) {
        groupedTraffic[from] = {};
      }
      groupedTraffic[from][to] = percentage;
    });

    const distributeRules = Object.entries(groupedTraffic).map(([from, toMap]) => ({
      from,
      to: Object.fromEntries(
        Object.entries(toMap).map(([to, percentage]) => [to, percentage]) // Convert back to object
      ),
    }));

    return {
      apiVersion: 'networking.istio.io/v1beta1',
      kind: 'DestinationRule',
      metadata: {
        name: svc,
        namespace: namespace,
      },
      spec: {
        host: `${svc}.${namespace}.svc.cluster.local`,
        trafficPolicy: {
          loadBalancer: {
            simple: 'LEAST_REQUEST',
            warmup: {
              duration: '2m',
              minimumPercent: 2.0,
            },
            localityLbSetting: {
              enabled: true,
              distribute: distributeRules,
            },
          },
          outlierDetection: {
            consecutive5xxErrors: 5,
            interval: '5s',
            baseEjectionTime: '30s',
            maxEjectionPercent: 50,
          },
          connectionPool: {
            tcp: { maxConnections: 500, connectTimeout: '2s' },
            http: {
              http1MaxPendingRequests: 500,
              http2MaxRequests: 1000,
              maxRequestsPerConnection: 0,
              h2UpgradePolicy: 'UPGRADE',
            },
          },
        },
      },
    };
  },
};
