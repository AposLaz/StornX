import { DummyCluster } from './data/cluster';
import { DummyDeployments } from './data/deployment';
import { PrometheusAdapterImpl } from '@stornx/platform/adapters/prometheus/index.js';
import { ScaleAction } from '../../src/core/optiScaler/enums';
import { OptiScaler } from '../../src/core/optiScaler/index';
import { MetricsType } from '@stornx/platform/enums.js';

/**
 * All nodes have 1 replica in each zone
 */

let prometheus: PrometheusAdapterImpl;

beforeAll(() => {
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
    const optiScaler = new OptiScaler(ScaleAction.UP, data, {
      prom: prometheus,
    });

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
    const optiScaler = new OptiScaler(ScaleAction.UP, data, {
      prom: prometheus,
    });

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
    const optiScaler = new OptiScaler(ScaleAction.UP, data, {
      prom: prometheus,
    });

    const ftNodes = optiScaler.getFaultToleranceNodes(MetricsType.CPU_MEMORY, weights);

    expect(ftNodes.length).toBe(3);
    expect(ftNodes.some((node) => node === 'node1')).toBe(true);
    expect(ftNodes.some((node) => node === 'node2')).toBe(true);
    expect(ftNodes.some((node) => node === 'node3')).toBe(true);
  });
});
