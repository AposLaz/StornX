import { DummyCluster } from './data/cluster';
import { DummyDeployments } from './data/deployment';
import { FileSystemHandler } from '../../src/adapters/filesystem/index';
import { KubernetesAdapterImpl } from '../../src/adapters/k8s/index';
import { PrometheusAdapterImpl } from '../../src/adapters/prometheus/index';
import { ScaleAction } from '../../src/core/optiScaler/enums';
import { OptiScaler } from '../../src/core/optiScaler/index';
import { MetricsType } from '../../src/enums';

/**
 * All nodes have 1 replica in each zone
 */

let k8s: KubernetesAdapterImpl;
let prometheus: PrometheusAdapterImpl;
let fileSystem = new FileSystemHandler();

beforeAll(() => {
  k8s = new KubernetesAdapterImpl();
  prometheus = new PrometheusAdapterImpl();
});

const weights = {
  CPU: 0.5,
  Memory: 0.5,
};

describe(`OptiScaler => getFaultToleranceNodes`, () => {
  it('Fault Tolerance by CPU', () => {
    const data = {
      deployment: 'frontend',
      namespace: 'online-boutique',
      replicaPods: DummyDeployments['frontend'],
      nodeMetrics: DummyCluster.Nodes,
      zonesNodes: DummyCluster.AzTopology,
      nodesLatency: DummyCluster.NodesLatency,
    };
    const optiScaler = new OptiScaler(ScaleAction.UP, data, { prom: prometheus, k8s: k8s, fileSystem });

    const ftNodes = optiScaler.getFaultToleranceNodes(MetricsType.CPU, weights);

    expect(ftNodes.length).toBe(3);
    expect(ftNodes.some((node) => node === 'node1')).toBe(true);
    expect(ftNodes.some((node) => node === 'node2')).toBe(true);
    expect(ftNodes.some((node) => node === 'node3')).toBe(true);
  });
  it('Fault Tolerance by MEMORY', () => {
    const data = {
      deployment: 'frontend',
      namespace: 'online-boutique',
      replicaPods: DummyDeployments['frontend'],
      nodeMetrics: DummyCluster.Nodes,
      zonesNodes: DummyCluster.AzTopology,
      nodesLatency: DummyCluster.NodesLatency,
    };
    const optiScaler = new OptiScaler(ScaleAction.UP, data, { prom: prometheus, k8s: k8s, fileSystem });

    const ftNodes = optiScaler.getFaultToleranceNodes(MetricsType.MEMORY, weights);

    expect(ftNodes.length).toBe(3);
    expect(ftNodes.some((node) => node === 'node1')).toBe(true);
    expect(ftNodes.some((node) => node === 'node2')).toBe(true);
    expect(ftNodes.some((node) => node === 'node3')).toBe(true);
  });
  it('Fault Tolerance by CPU-MEMORY', () => {
    const data = {
      deployment: 'frontend',
      namespace: 'online-boutique',
      replicaPods: DummyDeployments['frontend'],
      nodeMetrics: DummyCluster.Nodes,
      zonesNodes: DummyCluster.AzTopology,
      nodesLatency: DummyCluster.NodesLatency,
    };
    const optiScaler = new OptiScaler(ScaleAction.UP, data, { prom: prometheus, k8s: k8s, fileSystem });

    const ftNodes = optiScaler.getFaultToleranceNodes(MetricsType.CPU_MEMORY, weights);

    expect(ftNodes.length).toBe(3);
    expect(ftNodes.some((node) => node === 'node1')).toBe(true);
    expect(ftNodes.some((node) => node === 'node2')).toBe(true);
    expect(ftNodes.some((node) => node === 'node3')).toBe(true);
  });
});
