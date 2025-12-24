/** 
 * Scenario 5: All zones have exactly one replica
Input: Each zone has exactly one replica.
Expected Output: The function should return the most loaded node from any zone.
Scenario 6: One zone has the highest replica count
Input: One or more zones have more replicas than others.
Expected Output: The most loaded node from the most populated zone should be selected.
Scenario 7: No zones have sufficient replicas to remove
Input: All zones have only one node with replicas.
Expected Output: The function should return the most loaded node.

*/

import { DummyCluster } from './data/cluster';
import { DummyDeployments } from './data/deployments';
import { FaultTolerance } from '../../src/core/optiScaler/services/faultTolerance.service';
import { MetricsType } from '../../src/enums';

import type { PodMetrics } from '../../src/adapters/k8s/types';

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

const weights = {
  CPU: 0.5,
  Memory: 0.5,
};

describe('FaultTolerance - getCandidateNodeToRemove', () => {
  // Scenario 1: All zones have exactly one replica
  // Input: 3 zones, each with one replica
  // Expected Output: The most loaded node from any zone (based on CPU/Memory usage or custom weights). All zones have one replica
  describe('Scenario 1: All zones have exactly one replica', () => {
    it('Metric type CPU', () => {
      const ft: FaultTolerance = new FaultTolerance({
        deployment: 'frontend',
        replicaPods: DummyDeployments['frontend'],
        nodeMetrics: DummyCluster.Nodes,
        zonesNodes: DummyCluster.AzTopology,
      });

      const cNode = ft.getCandidateNodeToRemove(MetricsType.CPU, weights);

      expect(cNode.length).toBe(1);
      expect(cNode[0]).toBe('node3');
    });
    it('Metric type Memory', () => {
      const ft: FaultTolerance = new FaultTolerance({
        deployment: 'frontend',
        replicaPods: DummyDeployments['frontend'],
        nodeMetrics: DummyCluster.Nodes,
        zonesNodes: DummyCluster.AzTopology,
      });

      const cNode = ft.getCandidateNodeToRemove(MetricsType.MEMORY, weights);

      expect(cNode.length).toBe(1);
      expect(cNode[0]).toBe('node1');
    });
    it('Metric type CPU-MEMORY', () => {
      const ft: FaultTolerance = new FaultTolerance({
        deployment: 'frontend',
        replicaPods: DummyDeployments['frontend'],
        nodeMetrics: DummyCluster.Nodes,
        zonesNodes: DummyCluster.AzTopology,
      });

      const cNode = ft.getCandidateNodeToRemove(MetricsType.CPU_MEMORY, weights);

      expect(cNode.length).toBe(1);
      expect(cNode[0]).toBe('node3');
    });
  });

  // Scenario 2: One zone has more replicas than others
  // Input: Zone-1 has 3 replicas, Zone-2 has 1, Zone-3 has 1
  // Expected Output: The most loaded node from Zone-1
  describe('Scenario 2: All nones in zone with the most replicas have exactly one replica', () => {
    const nodes = [
      {
        name: 'node1',
        zone: 'zone-1',
        capacity: { cpu: 940, memory: 2802.3984375 },
        allocatable: { cpu: 940, memory: 2802.3984375 },
        requested: { cpu: 850, memory: 872 },
        limits: { cpu: 3225, memory: 2247 },
        freeToUse: { cpu: 100, memory: 1330.3984375 },
      },
      {
        name: 'node11',
        zone: 'zone-1',
        capacity: { cpu: 940, memory: 2802.3984375 },
        allocatable: { cpu: 940, memory: 2802.3984375 },
        requested: { cpu: 850, memory: 872 },
        limits: { cpu: 3225, memory: 2247 },
        freeToUse: { cpu: 300, memory: 630.3984375 },
      },
      {
        name: 'node12',
        zone: 'zone-1',
        capacity: { cpu: 940, memory: 2802.3984375 },
        allocatable: { cpu: 940, memory: 2802.3984375 },
        requested: { cpu: 850, memory: 872 },
        limits: { cpu: 3225, memory: 2247 },
        freeToUse: { cpu: 150, memory: 730.3984375 },
      },
    ];
    const dummyDeploys: PodMetrics[] = [];
    dummyDeploys.push({
      node: 'node2',
      pod: `frontend-21`,
      ...commonData,
    });

    dummyDeploys.push({
      node: 'node3',
      pod: `frontend-31`,
      ...commonData,
    });

    for (let i = 0; i < 3; i++) {
      dummyDeploys.push({
        node: i === 0 ? 'node1' : `node1${i}`,
        pod: `frontend-${i}`,
        ...commonData,
      });
    }

    it('Metric type CPU', () => {
      const ft: FaultTolerance = new FaultTolerance({
        deployment: 'frontend',
        replicaPods: dummyDeploys,
        nodeMetrics: nodes,
        zonesNodes: DummyCluster.AzTopology,
      });

      const cNode = ft.getCandidateNodeToRemove(MetricsType.CPU, weights);

      expect(cNode.length).toBe(1);
      expect(cNode[0]).toBe('node1');
    });

    it('Metric type Memory', () => {
      const ft: FaultTolerance = new FaultTolerance({
        deployment: 'frontend',
        replicaPods: dummyDeploys,
        nodeMetrics: nodes,
        zonesNodes: DummyCluster.AzTopology,
      });

      const cNode = ft.getCandidateNodeToRemove(MetricsType.MEMORY, weights);

      expect(cNode.length).toBe(1);
      expect(cNode[0]).toBe('node11');
    });

    it('Metric type CPU-MEMORY', () => {
      const ft: FaultTolerance = new FaultTolerance({
        deployment: 'frontend',
        replicaPods: dummyDeploys,
        nodeMetrics: nodes,
        zonesNodes: DummyCluster.AzTopology,
      });

      const cNode = ft.getCandidateNodeToRemove(MetricsType.CPU_MEMORY, weights);

      expect(cNode.length).toBe(1);
      expect(cNode[0]).toBe('node12');
    });
  });
});
