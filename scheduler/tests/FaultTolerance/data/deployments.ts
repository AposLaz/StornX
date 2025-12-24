import type { DeploymentReplicaPodsMetrics } from '../../../src/types';

export const DummyDeployments: DeploymentReplicaPodsMetrics = {
  frontend: [
    {
      node: 'node1',
      pod: 'frontend-6b8cdfd545-xssxw',
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
    },
    {
      node: 'node2',
      pod: 'frontend-6b8cdfd545-c8pwc',
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
    },
    {
      node: 'node3',
      pod: 'frontend-6b8cdfd545-8kbf2',
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
    },
  ],
};
