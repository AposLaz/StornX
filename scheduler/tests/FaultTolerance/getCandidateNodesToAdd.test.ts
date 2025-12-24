/**
 * Test Cases for getCandidateNodesToAdd
 */

import { DummyCluster } from './data/cluster';
import { DummyDeployments } from './data/deployments';
import { FaultTolerance } from '../../src/core/optiScaler/services/faultTolerance.service';

const commonData = {
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

const commonDataNodes = {
  capacity: { cpu: 940, memory: 2802.3984375 },
  allocatable: { cpu: 940, memory: 2802.3984375 },
  requested: { cpu: 850, memory: 872 },
  limits: { cpu: 3225, memory: 2247 },
  freeToUse: { cpu: 300, memory: 1330.3984375 },
};

describe('FaultTolerance - getCandidateNodesToAdd', () => {
  // Scenario 1: Node 1, from zone 1 have available resources
  // Input: all nodes have one replica & the 3 nodes have available resources
  // Expected Output: all 3 nodes
  it('Scenario 1: Nodes have sufficient resources and are evenly distributed', () => {
    const ft: FaultTolerance = new FaultTolerance({
      deployment: 'frontend',
      replicaPods: DummyDeployments['frontend'],
      nodeMetrics: DummyCluster.Nodes,
      zonesNodes: DummyCluster.AzTopology,
    });

    const cNodes = ft.getCandidateNodesToAdd();

    expect(cNodes.length).toBe(3);
  });
  // Scenario 2: Some zones lack resources
  // Input: At least one zone lacks nodes with enough available resources. Frontend deployment have replica to nodes with replicas
  // Expected Output: The returned candidate nodes should only come from zones with available resources.
  it('Scenario 2: Some zones lack resources', () => {
    // remove node-2, zone2 from the nodes with available resources
    const dummyNodes = DummyCluster.Nodes.filter((node) => node.name !== 'node2');

    const ft: FaultTolerance = new FaultTolerance({
      deployment: 'frontend',
      replicaPods: DummyDeployments['frontend'],
      nodeMetrics: dummyNodes,
      zonesNodes: DummyCluster.AzTopology,
    });

    const cNodes = ft.getCandidateNodesToAdd();

    expect(cNodes.length).toBe(2);
    expect(cNodes.some((node) => node === 'node1')).toBe(true);
    expect(cNodes.some((node) => node !== 'node2')).toBe(true); // node net have sufficient resources
    expect(cNodes.some((node) => node === 'node3')).toBe(true);
  });
  // Scenario 3: A zone do not have any replicas
  // Input: node2 have resources but no replicas and the other 2 zone, nodes have replicas
  // Expected Output: The function should prioritize zones that currently have zero replicas.
  it('Scenario 3: Deployment replicas are fewer than zones', () => {
    const dummyDeploys = DummyDeployments['frontend'].filter((f) => f.node !== 'node2');

    const ft: FaultTolerance = new FaultTolerance({
      deployment: 'frontend',
      replicaPods: dummyDeploys,
      nodeMetrics: DummyCluster.Nodes,
      zonesNodes: DummyCluster.AzTopology,
    });

    const cNodes = ft.getCandidateNodesToAdd();

    expect(cNodes.length).toBe(1);
    expect(cNodes[0]).toBe('node2');
  });
  // Scenario 4: 3 nodes across 3 zones, only one zone has replicas
  // Input: Zone-1 has replicas, Zone-2 and Zone-3 have no replicas
  // Expected Output: Nodes from Zone-2 and Zone-3 (i.e., nodes with no replicas)
  it('Scenario 4: Select nodes from zones without replicas', () => {
    const dummyDeploys = DummyDeployments['frontend'].filter((f) => f.node === 'node1');

    const ft: FaultTolerance = new FaultTolerance({
      deployment: 'frontend',
      replicaPods: dummyDeploys,
      nodeMetrics: DummyCluster.Nodes,
      zonesNodes: DummyCluster.AzTopology,
    });

    const cNodes = ft.getCandidateNodesToAdd();

    expect(cNodes.length).toBe(2);
    expect(cNodes.some((node) => node === 'node2')).toBe(true);
    expect(cNodes.some((node) => node === 'node3')).toBe(true);
  });

  // Scenario 5: Nodes are unevenly distributed with replicas
  // Input: Node-1 has 1 replica, Node-2 and Node-3 each have 6 replicas (maxSkew = 5)
  // Expected Output: Node-1 (least loaded node)
  describe('Scenario 5: Select node with skew of replicas', () => {
    it('skew=5', () => {
      const dummyDeploys = [];
      dummyDeploys.push({
        node: 'node1',
        pod: `frontend-[1]`,
        ...commonData,
      });

      // add 5 more pods to node 2
      for (let i = 0; i < 6; i++) {
        dummyDeploys.push({
          node: 'node2',
          pod: `frontend-[${i}]`,
          ...commonData,
        });
      }

      // add 5 more pods to node 3
      for (let i = 0; i < 6; i++) {
        dummyDeploys.push({
          node: 'node3',
          pod: `frontend-[${i}]`,
          ...commonData,
        });
      }
      const ft: FaultTolerance = new FaultTolerance({
        deployment: 'frontend',
        replicaPods: dummyDeploys,
        nodeMetrics: DummyCluster.Nodes,
        zonesNodes: DummyCluster.AzTopology,
      });

      const cNodes = ft.getCandidateNodesToAdd();

      expect(cNodes.length).toBe(1);
      expect(cNodes[0]).toBe('node1');
    });

    it('maxSkew=5 && skew=3', () => {
      const dummyDeploys = [];
      dummyDeploys.push({
        node: 'node1',
        pod: `frontend-[1]`,
        ...commonData,
      });
      // add 5 more pods to node 2
      for (let i = 0; i < 6; i++) {
        dummyDeploys.push({
          node: 'node2',
          pod: `frontend-[${i}]`,
          ...commonData,
        });
      }

      // add 3 more pods to node 3
      for (let i = 0; i < 3; i++) {
        dummyDeploys.push({
          node: 'node3',
          pod: `frontend-[${i}]`,
          ...commonData,
        });
      }

      const ft: FaultTolerance = new FaultTolerance({
        deployment: 'frontend',
        replicaPods: dummyDeploys,
        nodeMetrics: DummyCluster.Nodes,
        zonesNodes: DummyCluster.AzTopology,
      });

      const cNodes = ft.getCandidateNodesToAdd();

      expect(cNodes.length).toBe(2);
      expect(cNodes.some((node) => node === 'node1')).toBe(true);
      expect(cNodes.some((node) => node === 'node3')).toBe(true);
    });
  });

  // Scenario 6: 1 zone with 3 nodes, only one node has replicas
  // Input: Zone-1 contains Node-1 (with replicas), Node-11, Node-12 (no replicas but has resources)
  // Expected Output: Node-11, Node-12
  it('Scenario 6: Select nodes in the same zone without replicas', () => {
    // nodes with resources
    const zones = { 'zone-1': DummyCluster.AzTopology['zone-1'] };
    const nodesWithResources = [
      {
        name: 'node1',
        zone: 'zone-1',
        ...commonDataNodes,
      },
      {
        name: 'node11',
        zone: 'zone-1',
        ...commonDataNodes,
      },
      {
        name: 'node12',
        zone: 'zone-1',
        ...commonDataNodes,
      },
    ];

    const ft: FaultTolerance = new FaultTolerance({
      deployment: 'frontend',
      replicaPods: DummyDeployments['frontend'],
      nodeMetrics: nodesWithResources,
      zonesNodes: zones,
    });

    const cNodes = ft.getCandidateNodesToAdd();
    expect(cNodes.length).toBe(2);
    expect(cNodes.some((node) => node === 'node11')).toBe(true);
    expect(cNodes.some((node) => node === 'node12')).toBe(true);
  });

  // Scenario 7: 2 zones, each with 3 nodes, only one zone has replicas, some nodes have no available resources
  // Input: Zone-1 has replicas, Zone-2 has available nodes, but some without resources
  // Expected Output: Only nodes in Zone-2 that have available resources
  it('Scenario 7: Ignore zones without resources', () => {
    // nodes with resources
    const zones = { 'zone-1': DummyCluster.AzTopology['zone-1'], 'zone-2': DummyCluster.AzTopology['zone-2'] };

    const nodesWithResources = [
      {
        name: 'node1',
        zone: 'zone-1',
        ...commonDataNodes,
      },
      {
        name: 'node12',
        zone: 'zone-1',
        ...commonDataNodes,
      },
      {
        name: 'node2',
        zone: 'zone-2',
        ...commonDataNodes,
      },
    ];

    const dummyDeploys = [];
    dummyDeploys.push({
      node: 'node1',
      pod: `frontend-[1]`,
      ...commonData,
    });

    const ft: FaultTolerance = new FaultTolerance({
      deployment: 'frontend',
      replicaPods: dummyDeploys,
      nodeMetrics: nodesWithResources,
      zonesNodes: zones,
    });

    const cNodes = ft.getCandidateNodesToAdd();

    expect(cNodes.length).toBe(1);
    expect(cNodes[0]).toBe('node2');
  });

  // Scenario 8: All zones and nodes have no available resources
  // Input: Dummy.Nodes = [] (no capacity)
  // Expected Output: Empty array
  it('Scenario 8: No candidates due to lack of resources', () => {
    const ft: FaultTolerance = new FaultTolerance({
      deployment: 'frontend',
      replicaPods: DummyDeployments['frontend'],
      nodeMetrics: [],
      zonesNodes: DummyCluster.AzTopology,
    });

    const cNodes = ft.getCandidateNodesToAdd();
    expect(cNodes.length).toBe(0);
  });
});
