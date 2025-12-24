import type { NodeMetrics } from '../../../src/adapters/k8s/types';
import type { NodesLatency } from '../../../src/adapters/prometheus/types';

export const DummyCluster = {
  AzTopology: {
    'zone-1': { nodes: ['node1', 'node11', 'node12'] },
    'zone-2': { nodes: ['node2'] },
    'zone-3': { nodes: ['node3'] },
    'zone-4': { nodes: ['node41', 'node42'] },
  },
  Nodes: [
    {
      name: 'node3',
      zone: 'zone-3',
      capacity: { cpu: 940, memory: 2802.40625 },
      allocatable: { cpu: 940, memory: 2802.40625 },
      requested: { cpu: 935, memory: 1256 },
      limits: { cpu: 6899.999999999999, memory: 5829 },
      freeToUse: { cpu: 5, memory: 1546.40625 },
    },
    {
      name: 'node2',
      zone: 'zone-2',
      capacity: { cpu: 940, memory: 2802.3984375 },
      allocatable: { cpu: 940, memory: 2802.3984375 },
      requested: { cpu: 893.0000000000001, memory: 622.5367431640625 },
      limits: { cpu: 2943.0000000000005, memory: 1662 },
      freeToUse: { cpu: 46.999999999999886, memory: 2179.8616943359375 },
    },
    {
      name: 'node1',
      zone: 'zone-1',
      capacity: { cpu: 940, memory: 2802.3984375 },
      allocatable: { cpu: 940, memory: 2802.3984375 },
      requested: { cpu: 850, memory: 872 },
      limits: { cpu: 3225, memory: 2247 },
      freeToUse: { cpu: 300, memory: 1330.3984375 },
    },
  ] as NodeMetrics[],
  NodesLatency: [
    {
      from: 'node1',
      to: 'node2',
      latency: 0.7060250000000001,
    },
    {
      from: 'node2',
      to: 'node1',
      latency: 0.86663,
    },
    {
      from: 'node1',
      to: 'node3',
      latency: 0.8242775,
    },
    {
      from: 'node3',
      to: 'node1',
      latency: 0.8736125,
    },
    {
      from: 'node3',
      to: 'node2',
      latency: 0.79895,
    },
    {
      from: 'node2',
      to: 'node3',
      latency: 0.7874425,
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
