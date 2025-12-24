/**
 * filterCandidateZones
Scenario 8: Zones have different numbers of replicas. The function should return zones with at least one replica.
Scenario 9: If there aren’t enough zones with replicas, it should add additional zones from the available list.
filterCandidateNodes
Scenario 10: Nodes should be selected first based on replica count. If fewer than the required number exist, additional nodes without replicas should be included.
getMostLoadedNode
Scenario 11: The method should correctly identify the most loaded node from the list.
Scenario 12: If multiple nodes have the same load, the function should pick the first one in the list.
getNodesWithinSkew
Scenario 13: If all nodes have similar replicas, the function should return all of them.
Scenario 14: If a few nodes have significantly higher replicas than the others, they should be filtered out.
 */

import { DummyCluster } from './data/cluster';
import { DummyDeployments } from './data/deployments';
import { FaultMapper } from '../../src/core/optiScaler/mappers';
import { FaultTolerance } from '../../src/core/optiScaler/services/faultTolerance.service';
import { MetricsType } from '../../src/enums';

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

describe('FaultTolerance - Helper Functions', () => {
  let ft: FaultTolerance;

  beforeEach(() => {
    ft = new FaultTolerance({
      deployment: 'frontend',
      replicaPods: DummyDeployments['frontend'],
      nodeMetrics: DummyCluster.Nodes,
      zonesNodes: DummyCluster.AzTopology,
    });
  });

  describe('filterCandidateZones', () => {
    it('1. All Zones have replicas, fewer than maxFt', () => {
      const maxFt = 3;
      const zones = new Map([
        [
          'zone-1',
          {
            nodes: [{ node: 'node1', replicas: 1 }, { node: 'node11' }, { node: 'node12', replicas: 0 }],
            replicas: 1,
          },
        ],
        ['zone-2', { nodes: [{ node: 'node2', replicas: 1 }], replicas: 1 }],
      ]);
      const filteredZones = ft['filterCandidateZones'](maxFt, zones);
      expect(filteredZones.size).toBe(2);
      expect(filteredZones.has('zone-1')).toBe(true);
      expect(filteredZones.has('zone-2')).toBe(true);
    });

    it('2. All Zones have replicas, more than maxFt', () => {
      const maxFt = 2;
      const zones = new Map([
        [
          'zone-1',
          {
            nodes: [{ node: 'node1', replicas: 1 }, { node: 'node11' }, { node: 'node12', replicas: 0 }],
            replicas: 1,
          },
        ],
        ['zone-2', { nodes: [{ node: 'node2', replicas: 1 }], replicas: 1 }],
        ['zone-3', { nodes: [{ node: 'node3', replicas: 1 }], replicas: 1 }],
        ['zone-4', { nodes: [{ node: 'node4', replicas: 1 }], replicas: 1 }],
      ]);

      // should return all maxFt zones with replicas
      const filteredZones = ft['filterCandidateZones'](maxFt, zones);
      expect(filteredZones.size).toBe(4);
    });

    it('3. Not enough zones with replicas to meet maxFt', () => {
      const maxFt = 3;
      const zones = new Map([
        [
          'zone-1',
          {
            nodes: [{ node: 'node1', replicas: 1 }, { node: 'node11' }, { node: 'node12', replicas: 0 }],
            replicas: 1,
          },
        ],
        ['zone-2', { nodes: [{ node: 'node2', replicas: 0 }], replicas: 0 }],
        ['zone-3', { nodes: [{ node: 'node3', replicas: 0 }], replicas: 0 }],
      ]);

      // should include zones with no replicas if not enough zones with replicas exist
      const filteredZones = ft['filterCandidateZones'](maxFt, zones);
      expect(filteredZones.size).toBe(3);
      expect(filteredZones.has('zone-1')).toBe(true);
      expect(filteredZones.has('zone-2')).toBe(true);
      expect(filteredZones.has('zone-3')).toBe(true);
    });

    it('4. All zones have zero replicas', () => {
      const maxFt = 3;
      const zones = new Map([
        ['zone-1', { nodes: [{ node: 'node1', replicas: 0 }], replicas: 0 }],
        ['zone-2', { nodes: [{ node: 'node2' }], replicas: 0 }],
        ['zone-3', { nodes: [{ node: 'node3' }], replicas: 0 }],
      ]);

      // should return first "maxFt" zones when all zones have zero replicas
      const filteredZones = ft['filterCandidateZones'](maxFt, zones);

      expect(filteredZones.size).toBe(3);
    });

    it('5. maxFt equals number of zones with replicas', () => {
      const maxFt = 3;
      const zones = new Map([
        [
          'zone-1',
          {
            nodes: [{ node: 'node1', replicas: 1 }, { node: 'node11' }, { node: 'node12', replicas: 0 }],
            replicas: 1,
          },
        ],
        ['zone-2', { nodes: [{ node: 'node2', replicas: 1 }], replicas: 1 }],
        ['zone-3', { nodes: [{ node: 'node3', replicas: 0 }], replicas: 0 }],
      ]);

      // should return all maxFt zones with replicas and zones with no replicas if maxFt > number of zones with replicas
      const filteredZones = ft['filterCandidateZones'](maxFt, zones);

      expect(filteredZones.size).toBe(3);
    });
  });

  // getMostLoadedNode()
  describe('Get Most Loaded Node By Metric Type With the most Replicas', () => {
    const weights = {
      CPU: 0.5,
      Memory: 0.5,
    };

    describe('Same amount of replicas', () => {
      const zoneNodes = new Map([
        [
          'zone-1',
          {
            nodes: [{ node: 'node1', replicas: 1 }, { node: 'node11' }, { node: 'node12', replicas: 0 }],
            replicas: 1,
          },
        ],
        ['zone-2', { nodes: [{ node: 'node2', replicas: 1 }], replicas: 1 }],
        ['zone-3', { nodes: [{ node: 'node3', replicas: 1 }], replicas: 1 }],
        [
          'zone-4',
          {
            nodes: [{ node: 'node41', replicas: 0 }, { node: 'node42' }],
            replicas: 0,
          },
        ],
      ]);

      // Metric Type CPU
      it('Metric Type CPU', () => {
        // Create an array of loaded nodes with their names and zones
        const sortNodesByLoad = FaultMapper.toMostHighLoadedNodes(DummyCluster.Nodes, MetricsType.CPU, weights);

        const loadedNodes = sortNodesByLoad.map(({ name, zone }) => ({
          node: name,
          zone,
        }));

        const zonesWithReplicas = Array.from(zoneNodes.entries()).filter(([, data]) => data.replicas > 0);
        // Find the maximum replica count present in any zone
        const maxReplicaCount = Math.max(...zonesWithReplicas.map(([, data]) => data.replicas));

        // Identify zones with the most replicas
        const zonesWithMostReplicas = zonesWithReplicas.filter(([, data]) => data.replicas === maxReplicaCount);

        // Find the most loaded node within the zones with the most replicas
        const mostLoadedNode = ft['getMostLoadedNode'](zonesWithMostReplicas, loadedNodes);
        expect(mostLoadedNode).toEqual('node3');
      });
      // Metric Type MEMORY
      it('Metric Type MEMORY', () => {
        // Create an array of loaded nodes with their names and zones
        const sortNodesByLoad = FaultMapper.toMostHighLoadedNodes(DummyCluster.Nodes, MetricsType.MEMORY, weights);

        const loadedNodes = sortNodesByLoad.map(({ name, zone }) => ({
          node: name,
          zone,
        }));

        const zonesWithReplicas = Array.from(zoneNodes.entries()).filter(([, data]) => data.replicas > 0);
        // Find the maximum replica count present in any zone
        const maxReplicaCount = Math.max(...zonesWithReplicas.map(([, data]) => data.replicas));

        // Identify zones with the most replicas
        const zonesWithMostReplicas = zonesWithReplicas.filter(([, data]) => data.replicas === maxReplicaCount);

        // Find the most loaded node within the zones with the most replicas
        const mostLoadedNode = ft['getMostLoadedNode'](zonesWithMostReplicas, loadedNodes);
        expect(mostLoadedNode).toEqual('node1');
      });
      //   // Metric Type MEMORY & CPU
      it('Metric Type MEMORY & CPU', () => {
        // Create an array of loaded nodes with their names and zones
        const sortNodesByLoad = FaultMapper.toMostHighLoadedNodes(DummyCluster.Nodes, MetricsType.CPU_MEMORY, weights);

        const loadedNodes = sortNodesByLoad.map(({ name, zone }) => ({
          node: name,
          zone,
        }));

        const zonesWithReplicas = Array.from(zoneNodes.entries()).filter(([, data]) => data.replicas > 0);
        // Find the maximum replica count present in any zone
        const maxReplicaCount = Math.max(...zonesWithReplicas.map(([, data]) => data.replicas));

        // Identify zones with the most replicas
        const zonesWithMostReplicas = zonesWithReplicas.filter(([, data]) => data.replicas === maxReplicaCount);

        // Find the most loaded node within the zones with the most replicas
        const mostLoadedNode = ft['getMostLoadedNode'](zonesWithMostReplicas, loadedNodes);
        expect(mostLoadedNode).toEqual('node3');
      });
    });

    describe('Different amount of replicas', () => {
      const zoneNodes = new Map([
        [
          'zone-1',
          {
            nodes: [
              { node: 'node1', replicas: 1 },
              { node: 'node13', replicas: 2 },
              { node: 'node14', replicas: 2 },
            ],
            replicas: 5,
          },
        ],
        ['zone-2', { nodes: [{ node: 'node2', replicas: 1 }], replicas: 1 }],
        ['zone-3', { nodes: [{ node: 'node3', replicas: 1 }], replicas: 1 }],
        [
          'zone-4',
          {
            nodes: [{ node: 'node41', replicas: 0 }, { node: 'node42' }],
            replicas: 0,
          },
        ],
      ]);

      const newNodes = [...DummyCluster.Nodes];

      newNodes.push(
        ...[
          {
            name: 'node13',
            zone: 'zone-1',
            capacity: { cpu: 940, memory: 2802.3984375 },
            allocatable: { cpu: 940, memory: 2802.3984375 },
            requested: { cpu: 850, memory: 872 },
            limits: { cpu: 3225, memory: 2247 },
            freeToUse: { cpu: 10, memory: 1330.3984375 },
          },
          {
            name: 'node14',
            zone: 'zone-1',
            capacity: { cpu: 940, memory: 2802.3984375 },
            allocatable: { cpu: 940, memory: 2802.3984375 },
            requested: { cpu: 850, memory: 872 },
            limits: { cpu: 3225, memory: 2247 },
            freeToUse: { cpu: 300, memory: 300 },
          },
        ]
      );

      // Metric Type CPU
      it('Metric Type CPU', () => {
        // Create an array of loaded nodes with their names and zones
        const sortNodesByLoad = FaultMapper.toMostHighLoadedNodes(newNodes, MetricsType.CPU, weights);

        const loadedNodes = sortNodesByLoad.map(({ name, zone }) => ({
          node: name,
          zone,
        }));

        const zonesWithReplicas = Array.from(zoneNodes.entries()).filter(([, data]) => data.replicas > 0);
        // Find the maximum replica count present in any zone
        const maxReplicaCount = Math.max(...zonesWithReplicas.map(([, data]) => data.replicas));

        // Identify zones with the most replicas
        const zonesWithMostReplicas = zonesWithReplicas.filter(([, data]) => data.replicas === maxReplicaCount);

        // Find the most loaded node within the zones with the most replicas
        const mostLoadedNode = ft['getMostLoadedNode'](zonesWithMostReplicas, loadedNodes);
        expect(mostLoadedNode).toEqual('node13');
      });
      // Metric Type MEMORY
      it('Metric Type MEMORY', () => {
        // Create an array of loaded nodes with their names and zones
        const sortNodesByLoad = FaultMapper.toMostHighLoadedNodes(newNodes, MetricsType.MEMORY, weights);

        const loadedNodes = sortNodesByLoad.map(({ name, zone }) => ({
          node: name,
          zone,
        }));

        const zonesWithReplicas = Array.from(zoneNodes.entries()).filter(([, data]) => data.replicas > 0);
        // Find the maximum replica count present in any zone
        const maxReplicaCount = Math.max(...zonesWithReplicas.map(([, data]) => data.replicas));

        // Identify zones with the most replicas
        const zonesWithMostReplicas = zonesWithReplicas.filter(([, data]) => data.replicas === maxReplicaCount);

        // Find the most loaded node within the zones with the most replicas
        const mostLoadedNode = ft['getMostLoadedNode'](zonesWithMostReplicas, loadedNodes);
        expect(mostLoadedNode).toEqual('node14');
      });
      // Metric Type MEMORY & CPU
      it('Metric Type MEMORY & CPU', () => {
        // Create an array of loaded nodes with their names and zones
        const sortNodesByLoad = FaultMapper.toMostHighLoadedNodes(newNodes, MetricsType.CPU_MEMORY, weights);

        const loadedNodes = sortNodesByLoad.map(({ name, zone }) => ({
          node: name,
          zone,
        }));

        const zonesWithReplicas = Array.from(zoneNodes.entries()).filter(([, data]) => data.replicas > 0);
        // Find the maximum replica count present in any zone
        const maxReplicaCount = Math.max(...zonesWithReplicas.map(([, data]) => data.replicas));

        // Identify zones with the most replicas
        const zonesWithMostReplicas = zonesWithReplicas.filter(([, data]) => data.replicas === maxReplicaCount);

        // Find the most loaded node within the zones with the most replicas
        const mostLoadedNode = ft['getMostLoadedNode'](zonesWithMostReplicas, loadedNodes);
        expect(mostLoadedNode).toEqual('node14');
      });
    });
  });

  // replicaPodsPerNode()
  it('Get Replica Pods length per Node', () => {
    const addMoreData = [...DummyDeployments['frontend']];

    // add 4 more pods to node 1
    for (let i = 0; i < 4; i++) {
      addMoreData.push({
        node: 'node1',
        pod: `frontend-[${i}]`,
        ...commonData,
      });
    }

    // add 2 more pods to node 2
    for (let i = 0; i < 2; i++) {
      addMoreData.push({
        node: 'node2',
        pod: `frontend-[${i}]`,
        ...commonData,
      });
    }

    const replicaPodsByNode = ft['replicaPodsPerNode'](addMoreData);

    expect(replicaPodsByNode['node1']).toBe(5);
    expect(replicaPodsByNode['node2']).toBe(3);
    expect(replicaPodsByNode['node3']).toBe(1);
  });

  // getZonesWithSufficientResources()
  it('Get Zones with Sufficient Resources', () => {
    const zoneNodes = new Map([
      ['zone-1', { nodes: [{ node: 'node1' }, { node: 'node11' }, { node: 'node12' }], replicas: 1 }],
      ['zone-2', { nodes: [], replicas: 0 }],
      ['zone-3', { nodes: [{ node: 'node3', replicas: 1 }], replicas: 1 }],
    ]);

    const zonesWithResources = ft['getZonesWithSufficientResources'](zoneNodes, DummyCluster.Nodes);

    expect(zonesWithResources.size).toBe(2);
    expect(zonesWithResources.has('zone-1')).toBe(true);
    expect(zonesWithResources.has('zone-2')).toBe(false);
    expect(zonesWithResources.has('zone-3')).toBe(true);
  });

  // getZonesWithinSkew()
  describe('Get Zones within the Skew', () => {
    it('Max Skew = 1', () => {
      const zoneNodes = new Map([
        ['zone-1', { nodes: [{ node: 'node1' }, { node: 'node11' }, { node: 'node12' }], replicas: 0 }],
        ['zone-2', { nodes: [{ node: 'node2' }], replicas: 1 }],
        ['zone-3', { nodes: [{ node: 'node3' }], replicas: 1 }],
      ]);

      const zonesWithinSkew = ft['getZonesWithinSkew'](zoneNodes, 1);

      expect(zonesWithinSkew.size).toBe(1);
      expect(zonesWithinSkew.has('zone-1')).toBe(true);
      expect(zonesWithinSkew.has('zone-2')).toBe(false);
      expect(zonesWithinSkew.has('zone-3')).toBe(false);
    });

    it('Max Skew = 5', () => {
      // The default max skew is 5
      const zoneNodes = new Map([
        ['zone-1', { nodes: [{ node: 'node1' }, { node: 'node11' }, { node: 'node12' }], replicas: 7 }],
        ['zone-2', { nodes: [{ node: 'node2' }], replicas: 2 }],
        ['zone-3', { nodes: [{ node: 'node3' }], replicas: 3 }],
      ]);

      const zonesWithinSkew = ft['getZonesWithinSkew'](zoneNodes);

      expect(zonesWithinSkew.size).toBe(2);
      expect(zonesWithinSkew.has('zone-1')).toBe(false);
      expect(zonesWithinSkew.has('zone-2')).toBe(true);
      expect(zonesWithinSkew.has('zone-3')).toBe(true);
    });
  });
});
