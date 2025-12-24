import { logger } from '../config/logger.js';

import type { PodMetrics } from '../adapters/k8s/types.js';
import type { PrometheusAdapterImpl } from '../adapters/prometheus/index.js';
import type { DeploymentReplicaPodsMetrics, MetricWeights } from '../types.js';

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const addMissingResources = async (
  data: DeploymentReplicaPodsMetrics,
  namespace: string,
  weights: MetricWeights,
  prometheus: PrometheusAdapterImpl
): Promise<DeploymentReplicaPodsMetrics> => {
  const avgTime = '2m';
  const result: DeploymentReplicaPodsMetrics = {};

  for (const [service, pods] of Object.entries(data)) {
    const updated = await Promise.all(
      pods.map(async (pod) => {
        const updatedPod = { ...pod };

        const p = updatedPod.percentUsage ?? {};
        const needsRecalc =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          !isFiniteNum((p as any).cpu) || !isFiniteNum((p as any).memory) || !isFiniteNum((p as any).cpuAndMemory);

        if (needsRecalc) {
          // Fetch current point-in-time usage if missing or zero in source
          const cpuUsage =
            pod.usage.cpu === 0 ? await prometheus.getCurrentPodCpuUsage(pod.pod, namespace) : pod.usage.cpu;

          const memUsage =
            pod.usage.memory === 0 ? await prometheus.getCurrentPodMemoryUsage(pod.pod, namespace) : pod.usage.memory;

          // Only treat null/undefined as missing (0 is valid)
          if (cpuUsage == null || memUsage == null) {
            logger.info(`Skipping pod ${pod.pod} due to missing resource data.`);
            return null;
          }

          // Try averages (used here as "desired requests")
          const requestedCpu = await prometheus.getAvgPodCpuUsage(pod.pod, namespace, avgTime);
          const requestedMemory = await prometheus.getAvgPodMemoryUsage(pod.pod, namespace, avgTime);

          // Compute limits safely
          const limitCpu = requestedCpu != null && requestedCpu > 0 ? requestedCpu * 2 : cpuUsage * 2;
          const limitMem = requestedMemory != null && requestedMemory > 0 ? requestedMemory * 2 : memUsage * 2;

          // Avoid divide-by-zero (shouldn’t happen with guards above, but belt & suspenders)
          const safeDiv = (num: number, den: number) => (den > 0 ? num / den : 0);

          const percentCpu = safeDiv(cpuUsage, limitCpu);
          const percentMem = safeDiv(memUsage, limitMem);
          const percentCpuAndMem = weights.CPU * percentCpu + weights.Memory * percentMem;

          updatedPod.usage = { cpu: cpuUsage, memory: memUsage };
          updatedPod.percentUsage = { cpu: percentCpu, memory: percentMem, cpuAndMemory: percentCpuAndMem };
          updatedPod.requested = {
            cpu: requestedCpu != null && requestedCpu > 0 ? requestedCpu : cpuUsage,
            memory: requestedMemory != null && requestedMemory > 0 ? requestedMemory : memUsage,
          };
          updatedPod.limits = { cpu: limitCpu, memory: limitMem };
        }

        return updatedPod;
      })
    );

    result[service] = updated.filter((pod): pod is PodMetrics => pod !== null);
  }

  return result;
};
