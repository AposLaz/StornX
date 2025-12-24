import { logger } from '../../../config/logger.js';

import type * as k8s from '@kubernetes/client-node';

export class PodService {
  private readonly client: k8s.CoreV1Api;
  constructor(client: k8s.CoreV1Api) {
    this.client = client;
  }

  async fetchPodsByNamespace(namespace: string) {
    const response = await this.client.listNamespacedPod({ namespace });
    return response.items;
  }

  async fetchPodsByLabels(namespace: string, label?: string) {
    const pods = await this.client.listNamespacedPod({
      namespace,
      labelSelector: label,
    });

    if (pods.items.length === 0) return;

    return pods.items;
  }

  async deletePod(podName: string, namespace: string) {
    logger.info(`Deleting pod ${podName} from namespace ${namespace}`);
    await this.client.deleteNamespacedPod({ name: podName, namespace });
  }
}
