// __tests__/OptiBalancerMapper.spec.ts
// Adjust import paths as needed

import { OptiBalancerMapper } from '../../src/core/optiBalancer/mapper';

import type { ClusterTopology } from '../../src/adapters/k8s/types';
import type { DistributedPercentTraffic } from '../../src/core/optiBalancer/types';

describe('OptiBalancerMapper.toDestinationRule', () => {
  it('creates a DestinationRule with correct locality distribute config', () => {
    const traffic: DistributedPercentTraffic[] = [
      { from: 'node-a', to: 'node-a', percentage: 70 },
      { from: 'node-a', to: 'node-b', percentage: 30 },
      { from: 'node-b', to: 'node-b', percentage: 100 },
    ];

    const clusterTopology: ClusterTopology[] = [
      { node: 'node-a', zone: 'zone-1', region: 'region-1' },
      { node: 'node-b', zone: 'zone-1', region: 'region-1' },
    ] as ClusterTopology[];

    const dr = OptiBalancerMapper.toDestinationRule(traffic, 'ns-test', 'my-svc', clusterTopology);

    expect(dr.apiVersion).toBe('networking.istio.io/v1beta1');
    expect(dr.kind).toBe('DestinationRule');
    expect(dr.metadata.name).toBe('my-svc');
    expect(dr.metadata.namespace).toBe('ns-test');
    expect(dr.spec.host).toBe('my-svc.ns-test.svc.cluster.local');

    const lb = dr.spec.trafficPolicy.loadBalancer;
    expect(lb.simple).toBe('LEAST_REQUEST');
    expect(lb.localityLbSetting.enabled).toBe(true);

    const distribute = lb.localityLbSetting.distribute;
    // order may vary; re-group by from
    const mapByFrom = distribute.reduce<Record<string, Record<string, number>>>((acc, d) => {
      acc[d.from] = d.to;
      return acc;
    }, {});

    expect(mapByFrom['region-1/zone-1/node-a']).toEqual({
      'region-1/zone-1/node-a': 70,
      'region-1/zone-1/node-b': 30,
    });

    expect(mapByFrom['region-1/zone-1/node-b']).toEqual({
      'region-1/zone-1/node-b': 100,
    });
  });
});
