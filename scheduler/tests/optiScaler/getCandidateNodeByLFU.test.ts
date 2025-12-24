import { DummyCluster } from './data/cluster';
import { DummyDeployments } from './data/deployment';
import { FileSystemHandler } from '../../src/adapters/filesystem/index';
import { KubernetesAdapterImpl } from '../../src/adapters/k8s/index';
import { PrometheusAdapterImpl } from '../../src/adapters/prometheus/index';
import { ScaleAction } from '../../src/core/optiScaler/enums';
import { OptiScaler } from '../../src/core/optiScaler/index';
import { MetricsType } from '../../src/enums';

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

describe(`OptiScaler => getCandidateNodeByLFU`, () => {
  it('LFU by CPU', () => {
    const data = {
      deployment: 'frontend',
      namespace: 'online-boutique',
      replicaPods: DummyDeployments['frontend'],
      nodeMetrics: DummyCluster.Nodes,
      zonesNodes: DummyCluster.AzTopology,
      nodesLatency: DummyCluster.NodesLatency,
    };
    const optiScaler = new OptiScaler(ScaleAction.UP, data, { prom: prometheus, k8s: k8s, fileSystem });

    const nodes = DummyCluster.Nodes.map((node) => node.name);

    const cNode = optiScaler.getCandidateNodeByLFU(nodes, MetricsType.CPU, weights);

    expect(cNode).toBe('node1');
  });
  it('LFU by Memory', () => {
    const data = {
      deployment: 'frontend',
      namespace: 'online-boutique',
      replicaPods: DummyDeployments['frontend'],
      nodeMetrics: DummyCluster.Nodes,
      zonesNodes: DummyCluster.AzTopology,
      nodesLatency: DummyCluster.NodesLatency,
    };
    const optiScaler = new OptiScaler(ScaleAction.UP, data, { prom: prometheus, k8s: k8s, fileSystem });

    const nodes = DummyCluster.Nodes.map((node) => node.name);

    const cNode = optiScaler.getCandidateNodeByLFU(nodes, MetricsType.MEMORY, weights);

    expect(cNode).toBe('node2');
  });
  it('LFU by CPU-Memory', () => {
    const data = {
      deployment: 'frontend',
      namespace: 'online-boutique',
      replicaPods: DummyDeployments['frontend'],
      nodeMetrics: DummyCluster.Nodes,
      zonesNodes: DummyCluster.AzTopology,
      nodesLatency: DummyCluster.NodesLatency,
    };
    const optiScaler = new OptiScaler(ScaleAction.UP, data, { prom: prometheus, k8s: k8s, fileSystem });

    const nodes = DummyCluster.Nodes.map((node) => node.name);

    const cNode = optiScaler.getCandidateNodeByLFU(nodes, MetricsType.CPU_MEMORY, weights);

    expect(cNode).toBe('node2');
  });
});
