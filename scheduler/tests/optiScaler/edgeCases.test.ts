/**
 * Edge case tests for OptiScaler handling single-node clusters,
 * empty clusters, and other boundary conditions.
 */

import { jest } from '@jest/globals';

import { FaultTolerance } from '../../src/core/optiScaler/services/faultTolerance.service';
import { MetricsType } from '../../src/enums';

import type { ClusterAzTopology, NodeMetrics, PodMetrics } from '../../src/adapters/k8s/types';
import type { FaultToleranceType } from '../../src/core/optiScaler/types';

// Mock the logger
jest.mock('../../src/config/logger', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// Mock the config
jest.mock('../../src/config/config', () => ({
  Config: {
    faultTolerance: {
      maxZones: 3,
    },
  },
}));

const weights = {
  CPU: 0.5,
  Memory: 0.5,
};

// Helper to create PodMetrics
const createPod = (pod: string, node: string): PodMetrics => ({
  pod,
  node,
  usage: { cpu: 100, memory: 128 },
  percentUsage: { cpu: 10, memory: 10, cpuAndMemory: 10 },
  requested: { cpu: 100, memory: 128 },
  limits: { cpu: 200, memory: 256 },
});

describe('Edge Cases: Single Node Cluster', () => {
  const singleNodeTopology: ClusterAzTopology = {
    'zone-1': { nodes: ['only-node'] },
  };

  const singleNode: NodeMetrics[] = [
    {
      name: 'only-node',
      zone: 'zone-1',
      capacity: { cpu: 4000, memory: 8000 },
      allocatable: { cpu: 3800, memory: 7500 },
      requested: { cpu: 1000, memory: 2000 },
      limits: { cpu: 2000, memory: 4000 },
      freeToUse: { cpu: 2800, memory: 5500 },
    },
  ];

  describe('Scale Up', () => {
    it('should return single node as candidate when no replicas exist', () => {
      const data: FaultToleranceType = {
        deployment: 'frontend',
        zonesNodes: singleNodeTopology,
        replicaPods: [],
        nodeMetrics: singleNode,
      };

      const ft = new FaultTolerance(data);
      const candidates = ft.getCandidateNodesToAdd();

      expect(candidates).toEqual(['only-node']);
    });

    it('should return single node as candidate even when replicas already exist on it', () => {
      const existingPods: PodMetrics[] = [
        createPod('frontend-abc-1', 'only-node'),
        createPod('frontend-abc-2', 'only-node'),
      ];

      const data: FaultToleranceType = {
        deployment: 'frontend',
        zonesNodes: singleNodeTopology,
        replicaPods: existingPods,
        nodeMetrics: singleNode,
      };

      const ft = new FaultTolerance(data);
      const candidates = ft.getCandidateNodesToAdd();

      expect(candidates).toEqual(['only-node']);
    });

    it('should return empty array when single node has no metrics (not in nodeMetrics)', () => {
      // Note: The FaultTolerance service checks if nodes are in nodeMetrics list.
      // If a node is not in nodeMetrics, it's considered unavailable.
      const data: FaultToleranceType = {
        deployment: 'frontend',
        zonesNodes: singleNodeTopology,
        replicaPods: [],
        nodeMetrics: [], // Empty - no nodes have resource data
      };

      const ft = new FaultTolerance(data);
      const candidates = ft.getCandidateNodesToAdd();

      expect(candidates).toEqual([]);
    });
  });

  describe('Scale Down', () => {
    it('should return single node when it has one replica', () => {
      const existingPods: PodMetrics[] = [createPod('frontend-abc-1', 'only-node')];

      const data: FaultToleranceType = {
        deployment: 'frontend',
        zonesNodes: singleNodeTopology,
        replicaPods: existingPods,
        nodeMetrics: singleNode,
      };

      const ft = new FaultTolerance(data);
      const candidates = ft.getCandidateNodeToRemove(MetricsType.CPU, weights);

      expect(candidates).toEqual(['only-node']);
    });

    it('should return single node when it has multiple replicas', () => {
      const existingPods: PodMetrics[] = [
        createPod('frontend-abc-1', 'only-node'),
        createPod('frontend-abc-2', 'only-node'),
        createPod('frontend-abc-3', 'only-node'),
      ];

      const data: FaultToleranceType = {
        deployment: 'frontend',
        zonesNodes: singleNodeTopology,
        replicaPods: existingPods,
        nodeMetrics: singleNode,
      };

      const ft = new FaultTolerance(data);
      const candidates = ft.getCandidateNodeToRemove(MetricsType.CPU, weights);

      expect(candidates).toEqual(['only-node']);
    });
  });
});

describe('Edge Cases: Empty Cluster (No Nodes with Resources)', () => {
  const emptyTopology: ClusterAzTopology = {};

  describe('Scale Up', () => {
    it('should return empty array when no zones exist', () => {
      const data: FaultToleranceType = {
        deployment: 'frontend',
        zonesNodes: emptyTopology,
        replicaPods: [],
        nodeMetrics: [],
      };

      const ft = new FaultTolerance(data);
      const candidates = ft.getCandidateNodesToAdd();

      expect(candidates).toEqual([]);
    });

    it('should return empty array when zones exist but no nodes have metrics', () => {
      const zonesWithoutNodes: ClusterAzTopology = {
        'zone-1': { nodes: ['node1'] },
        'zone-2': { nodes: ['node2'] },
      };

      const data: FaultToleranceType = {
        deployment: 'frontend',
        zonesNodes: zonesWithoutNodes,
        replicaPods: [],
        nodeMetrics: [], // No metrics for any node
      };

      const ft = new FaultTolerance(data);
      const candidates = ft.getCandidateNodesToAdd();

      expect(candidates).toEqual([]);
    });
  });
});

describe('Edge Cases: Partial Node Availability', () => {
  const multiZoneTopology: ClusterAzTopology = {
    'zone-1': { nodes: ['node1'] },
    'zone-2': { nodes: ['node2'] },
    'zone-3': { nodes: ['node3'] },
  };

  it('should return only nodes that are present in nodeMetrics', () => {
    // Only node2 has resource data available
    const availableNodes: NodeMetrics[] = [
      {
        name: 'node2',
        zone: 'zone-2',
        capacity: { cpu: 4000, memory: 8000 },
        allocatable: { cpu: 3800, memory: 7500 },
        requested: { cpu: 1000, memory: 2000 },
        limits: { cpu: 2000, memory: 4000 },
        freeToUse: { cpu: 2800, memory: 5500 },
      },
    ];

    const data: FaultToleranceType = {
      deployment: 'frontend',
      zonesNodes: multiZoneTopology,
      replicaPods: [],
      nodeMetrics: availableNodes,
    };

    const ft = new FaultTolerance(data);
    const candidates = ft.getCandidateNodesToAdd();

    expect(candidates).toContain('node2');
    expect(candidates).not.toContain('node1');
    expect(candidates).not.toContain('node3');
  });
});

describe('Edge Cases: Zone Imbalance', () => {
  const multiZoneTopology: ClusterAzTopology = {
    'zone-1': { nodes: ['node1', 'node11', 'node12'] },
    'zone-2': { nodes: ['node2'] },
    'zone-3': { nodes: ['node3'] },
  };

  const nodes: NodeMetrics[] = [
    {
      name: 'node1',
      zone: 'zone-1',
      capacity: { cpu: 4000, memory: 8000 },
      allocatable: { cpu: 3800, memory: 7500 },
      requested: { cpu: 1000, memory: 2000 },
      limits: { cpu: 2000, memory: 4000 },
      freeToUse: { cpu: 2800, memory: 5500 },
    },
    {
      name: 'node11',
      zone: 'zone-1',
      capacity: { cpu: 4000, memory: 8000 },
      allocatable: { cpu: 3800, memory: 7500 },
      requested: { cpu: 1000, memory: 2000 },
      limits: { cpu: 2000, memory: 4000 },
      freeToUse: { cpu: 2800, memory: 5500 },
    },
    {
      name: 'node12',
      zone: 'zone-1',
      capacity: { cpu: 4000, memory: 8000 },
      allocatable: { cpu: 3800, memory: 7500 },
      requested: { cpu: 1000, memory: 2000 },
      limits: { cpu: 2000, memory: 4000 },
      freeToUse: { cpu: 2800, memory: 5500 },
    },
    {
      name: 'node2',
      zone: 'zone-2',
      capacity: { cpu: 4000, memory: 8000 },
      allocatable: { cpu: 3800, memory: 7500 },
      requested: { cpu: 1000, memory: 2000 },
      limits: { cpu: 2000, memory: 4000 },
      freeToUse: { cpu: 2800, memory: 5500 },
    },
    {
      name: 'node3',
      zone: 'zone-3',
      capacity: { cpu: 4000, memory: 8000 },
      allocatable: { cpu: 3800, memory: 7500 },
      requested: { cpu: 1000, memory: 2000 },
      limits: { cpu: 2000, memory: 4000 },
      freeToUse: { cpu: 2800, memory: 5500 },
    },
  ];

  it('should prefer zone with fewer replicas for scale up', () => {
    // All replicas in zone-1, none in other zones
    const existingPods: PodMetrics[] = [
      createPod('frontend-1', 'node1'),
      createPod('frontend-2', 'node11'),
      createPod('frontend-3', 'node12'),
    ];

    const data: FaultToleranceType = {
      deployment: 'frontend',
      zonesNodes: multiZoneTopology,
      replicaPods: existingPods,
      nodeMetrics: nodes,
    };

    const ft = new FaultTolerance(data);
    const candidates = ft.getCandidateNodesToAdd();

    // Should prefer zone-2 or zone-3 which have 0 replicas
    const zone1Nodes = ['node1', 'node11', 'node12'];
    const hasOtherZoneNode = candidates.some((n) => ['node2', 'node3'].includes(n));

    expect(hasOtherZoneNode).toBe(true);
    // Zone-1 should NOT be preferred since it has the most replicas
    if (candidates.length === 1) {
      expect(zone1Nodes).not.toContain(candidates[0]);
    }
  });

  it('should prefer zone with most replicas for scale down', () => {
    // More replicas in zone-1
    const existingPods: PodMetrics[] = [
      createPod('frontend-1', 'node1'),
      createPod('frontend-2', 'node11'),
      createPod('frontend-3', 'node12'),
      createPod('frontend-4', 'node2'),
    ];

    const data: FaultToleranceType = {
      deployment: 'frontend',
      zonesNodes: multiZoneTopology,
      replicaPods: existingPods,
      nodeMetrics: nodes,
    };

    const ft = new FaultTolerance(data);
    const candidates = ft.getCandidateNodeToRemove(MetricsType.CPU, weights);

    // Should prefer zone-1 nodes since it has 3 replicas vs zone-2's 1
    const zone1Nodes = ['node1', 'node11', 'node12'];
    expect(zone1Nodes).toContain(candidates[0]);
  });
});

describe('Edge Cases: Maximum Replicas Per Node', () => {
  const singleZoneTopology: ClusterAzTopology = {
    'zone-1': { nodes: ['node1', 'node2'] },
  };

  const nodes: NodeMetrics[] = [
    {
      name: 'node1',
      zone: 'zone-1',
      capacity: { cpu: 4000, memory: 8000 },
      allocatable: { cpu: 3800, memory: 7500 },
      requested: { cpu: 3500, memory: 7000 },
      limits: { cpu: 3600, memory: 7200 },
      freeToUse: { cpu: 300, memory: 500 },
    },
    {
      name: 'node2',
      zone: 'zone-1',
      capacity: { cpu: 4000, memory: 8000 },
      allocatable: { cpu: 3800, memory: 7500 },
      requested: { cpu: 1000, memory: 2000 },
      limits: { cpu: 2000, memory: 4000 },
      freeToUse: { cpu: 2800, memory: 5500 },
    },
  ];

  it('should include node with fewer replicas', () => {
    const existingPods: PodMetrics[] = [
      createPod('frontend-1', 'node1'),
      createPod('frontend-2', 'node1'),
      createPod('frontend-3', 'node1'),
    ];

    const data: FaultToleranceType = {
      deployment: 'frontend',
      zonesNodes: singleZoneTopology,
      replicaPods: existingPods,
      nodeMetrics: nodes,
    };

    const ft = new FaultTolerance(data);
    const candidates = ft.getCandidateNodesToAdd();

    // node2 has fewer replicas (0) vs node1 (3)
    expect(candidates).toContain('node2');
  });
});
