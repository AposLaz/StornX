import type { PodMetrics } from './adapters/k8s/types.js';
import type { Resources } from './types.js';

export const getPodNodeResources = (pod: PodMetrics): Resources => {
  // get the max of requested or used memory and cpu
  let cpu = 0;
  let memory = 0;

  if (pod.usage.cpu > pod.requested.cpu) {
    cpu = pod.usage.cpu;
  } else {
    cpu = pod.requested.cpu;
  }

  if (pod.usage.memory > pod.requested.memory) {
    memory = pod.usage.memory;
  } else {
    memory = pod.requested.memory;
  }

  return { cpu, memory };
};
