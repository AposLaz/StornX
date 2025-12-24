import { KubernetesAdapterImpl } from '../../src/adapters/k8s/index';
import { PrometheusAdapterImpl } from '../../src/adapters/prometheus/index';
import { OptiBalancer } from '../../src/core/optiBalancer/index';
import { MetricsType } from '../../src/enums';

let k8s: KubernetesAdapterImpl;
let prometheus: PrometheusAdapterImpl;

beforeAll(async () => {
  k8s = new KubernetesAdapterImpl();
  prometheus = new PrometheusAdapterImpl();
});

const commonResources = {
  usage: {
    cpu: 98.217319,
    memory: 59.85546875,
  },
  percentUsage: {
    cpu: 0.5456517722222223,
    memory: 0.2338104248046875,
    cpuAndMemory: 0.3897310985134549,
  },
  requested: {
    cpu: 90,
    memory: 128,
  },
  limits: {
    cpu: 180,
    memory: 256,
  },
};

it('groupPodsByNode', () => {
  const podMetrics = [
    {
      node: 'node1',
      pod: 'replica-1',
      ...commonResources,
    },
    {
      node: 'node1',
      pod: 'replica-2',
      ...commonResources,
    },
    {
      node: 'node3',
      pod: 'replica-3',
      ...commonResources,
    },
  ];

  const optiBalancer = new OptiBalancer(k8s, prometheus, MetricsType.CPU);

  const result = optiBalancer['groupPodsByNode'](podMetrics);

  expect(result).toEqual(
    new Map([
      [
        'node1',
        [
          {
            node: 'node1',
            pod: 'replica-1',
            ...commonResources,
          },
          {
            node: 'node1',
            pod: 'replica-2',
            ...commonResources,
          },
        ],
      ],
      [
        'node3',
        [
          {
            node: 'node3',
            pod: 'replica-3',
            ...commonResources,
          },
        ],
      ],
    ])
  );
});
// it('perNodeLatency', () => {
//   expect(true).toBe(true);
// });
// it('totalLatency', () => {
//   expect(true).toBe(true);
// });
// it('totalLoad', () => {
//   expect(true).toBe(true);
// });
