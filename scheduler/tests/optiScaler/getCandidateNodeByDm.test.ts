import { DummyCluster } from './data/cluster';
import { FileSystemHandler } from '../../src/adapters/filesystem/index';
import { KubernetesAdapterImpl } from '../../src/adapters/k8s/index';
import { PrometheusAdapterImpl } from '../../src/adapters/prometheus/index';
import { ScaleAction } from '../../src/core/optiScaler/enums';
import { OptiScaler } from '../../src/core/optiScaler/index';

import type { NodeMetrics } from '../../src/adapters/k8s/types';
import type { NodesLatency } from '../../src/adapters/prometheus/types';

let k8s: KubernetesAdapterImpl;
let prometheus: PrometheusAdapterImpl;
let fileSystem = new FileSystemHandler();

beforeAll(() => {
  k8s = new KubernetesAdapterImpl();
  prometheus = new PrometheusAdapterImpl();
});

const commonData = {
  capacity: { cpu: 940, memory: 2802.3984375 },
  allocatable: { cpu: 940, memory: 2802.3984375 },
  requested: { cpu: 850, memory: 872 },
  limits: { cpu: 3225, memory: 2247 },
  freeToUse: { cpu: 300, memory: 1330.3984375 },
};

const commonResourceUsage = {
  usage: {
    cpu: 209.725584,
    memory: 253.30078125,
  },
  percentUsage: {
    cpu: 0.7,
    memory: 0.8,
    cpuAndMemory: 0.666342602944664,
  },
  requested: {
    cpu: 60.00000000000001,
    memory: 104,
  },
  limits: {
    cpu: 300.00000000000006,
    memory: 253,
  },
};

const commonDm = {
  pod: 'adservice-5df696df54-mfskk',
  source_workload: 'frontend',
  source_version: 'unknown',
  source_workload_namespace: 'online-boutique',
  destination_service_name: 'adservice',
  destination_service_namespace: 'online-boutique',
  destination_version: 'unknown',
  destination_workload: 'adservice',
};

describe('OptiScaler => getCandidateNodeByDm', () => {
  /**
   * Scenario 1: Single Downstream Replica on Different Node
   * Description: The current replica pod is running on node1.
   *              There is one downstream pod on node2.
   *              Node2 is in the FT candidate list and has low latency from node1.
   * Expected Output: Node2 should be selected as the candidate node for scaling.
   */

  it('Single Downstream Replica on Different Node', () => {
    const data = {
      deployment: 'frontend',
      namespace: 'online-boutique',
      replicaPods: [
        {
          node: 'node1',
          pod: 'frontend-6b8cdfd545-c8pwc',
          ...commonResourceUsage,
        },
      ],
      nodeMetrics: DummyCluster.Nodes,
      zonesNodes: DummyCluster.AzTopology,
      nodesLatency: DummyCluster.NodesLatency,
    };
    const DummyDmPods = [
      {
        node: 'node2',
        destinations: [
          {
            rps: 1.6,
            node: 'node2',
            ...commonDm,
          },
        ],
      },
    ];

    const optiScaler = new OptiScaler(ScaleAction.UP, data, { prom: prometheus, k8s: k8s, fileSystem });

    const nodes = DummyCluster.Nodes.map((node) => node.name);

    const cNode = optiScaler.getCandidateNodeByDm(DummyDmPods, nodes);

    expect(cNode).toBe('node2');
  });

  /**
   * Scenario 2: Random Selection of Target Node
   * Description: Downstream pods are running on node2 and node3.
   * Node 1 does not have Available resources.
   *              RPS is similar between both nodes.
   *              Latency from the source node to node2 is lower than to node3.
   * Expected Output: Node2 or Node3 should be randomnly selected as the candidate node.
   */

  it('Random Selection of Target Node', () => {
    const data = {
      deployment: 'frontend',
      namespace: 'online-boutique',
      replicaPods: [
        {
          node: 'node1',
          pod: 'frontend-6b8cdfd545-c8pwc',
          ...commonResourceUsage,
        },
      ],
      nodeMetrics: [
        {
          name: 'node2',
          zone: 'zone-2',
          ...commonData,
        },
        {
          name: 'node3',
          zone: 'zone-3',
          ...commonData,
        },
      ] as NodeMetrics[],
      zonesNodes: DummyCluster.AzTopology,
      nodesLatency: DummyCluster.NodesLatency,
    };
    const DummyDmPods = [
      {
        node: 'node2',
        destinations: [
          {
            rps: 1.6,
            node: 'node2',
            ...commonDm,
          },
        ],
      },
      {
        node: 'node3',
        destinations: [
          {
            rps: 1.6,
            node: 'node3',
            ...commonDm,
          },
        ],
      },
    ];

    const optiScaler = new OptiScaler(ScaleAction.UP, data, { prom: prometheus, k8s: k8s, fileSystem });

    const nodes = data.nodeMetrics.map((node) => node.name);

    const cNode = optiScaler.getCandidateNodeByDm(DummyDmPods, nodes);

    expect(['node2', 'node3']).toContain(cNode);
  });

  /**
   * Scenario 3: Node Selection Based on Downstream Latency
   * Description: Downstream pods are running on node1.
   *              Latency from node2 -> node1 is lower then the latency of node3 -> node1.
   * Expected Output: Node2 should be selected due to lower latency.
   */

  it('Node Selection Based on Downstream Latency', () => {
    const data = {
      deployment: 'frontend',
      namespace: 'online-boutique',
      replicaPods: [
        {
          node: 'node1',
          pod: 'frontend-6b8cdfd545-c8pwc',
          ...commonResourceUsage,
        },
      ],
      nodeMetrics: [
        {
          name: 'node2',
          zone: 'zone-2',
          ...commonData,
        },
        {
          name: 'node3',
          zone: 'zone-3',
          ...commonData,
        },
      ] as NodeMetrics[],
      zonesNodes: DummyCluster.AzTopology,
      nodesLatency: DummyCluster.NodesLatency,
    };
    const DummyDmPods = [
      {
        node: 'node1',
        destinations: [
          {
            rps: 1.6,
            node: 'node1',
            ...commonDm,
          },
        ],
      },
    ];

    const optiScaler = new OptiScaler(ScaleAction.UP, data, { prom: prometheus, k8s: k8s, fileSystem });

    const nodes = data.nodeMetrics.map((node) => node.name);

    const cNode = optiScaler.getCandidateNodeByDm(DummyDmPods, nodes);

    expect(cNode).toBe('node2');
  });

  /**
   * Scenario 4: Node Selection Based on Downstream RPS
   * Description: Downstream pods are running on node1.
   *              Latency from node1 -> node2 is higher than the latency of node1 -> node3.
   * Expected Output: Node2 should be selected due to higher rps.
   */

  it('Node Selection Based on Downstream RPS', () => {
    const data = {
      deployment: 'frontend',
      namespace: 'online-boutique',
      replicaPods: [
        {
          node: 'node1',
          pod: 'frontend-6b8cdfd545-c8pwc',
          ...commonResourceUsage,
        },
      ],
      nodeMetrics: [
        {
          name: 'node2',
          zone: 'zone-2',
          ...commonData,
        },
        {
          name: 'node3',
          zone: 'zone-3',
          ...commonData,
        },
      ] as NodeMetrics[],
      zonesNodes: DummyCluster.AzTopology,
      nodesLatency: [
        {
          from: 'node1',
          to: 'node2',
          latency: 15,
        },
        {
          from: 'node2',
          to: 'node1',
          latency: 13,
        },
        {
          from: 'node1',
          to: 'node3',
          latency: 7.5,
        },
        {
          from: 'node3',
          to: 'node1',
          latency: 7,
        },
        {
          from: 'node3',
          to: 'node2',
          latency: 5,
        },
        {
          from: 'node2',
          to: 'node3',
          latency: 5,
        },
        {
          from: 'node1',
          to: 'node1',
          latency: 0,
        },
        {
          from: 'node2',
          to: 'node2',
          latency: 0,
        },
        {
          from: 'node3',
          to: 'node3',
          latency: 0,
        },
      ] as NodesLatency[],
    };
    const DummyDmPods = [
      {
        node: 'node1',
        destinations: [
          {
            rps: 80,
            node: 'node1',
            ...commonDm,
          },
        ],
      },
      {
        node: 'node2',
        destinations: [
          {
            rps: 160,
            node: 'node1',
            ...commonDm,
          },
        ],
      },
      {
        node: 'node3',
        destinations: [
          {
            rps: 100,
            node: 'node3',
            ...commonDm,
          },
        ],
      },
    ];

    const optiScaler = new OptiScaler(ScaleAction.UP, data, { prom: prometheus, k8s: k8s, fileSystem });

    const nodes = data.nodeMetrics.map((node) => node.name);

    const cNode = optiScaler.getCandidateNodeByDm(DummyDmPods, nodes);

    expect(cNode).toBe('node2');
  });
});
