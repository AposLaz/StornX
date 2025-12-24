import { logger } from '../../../config/logger.js';
import { k8sMapper } from '../mapper.js';

import type * as k8s from '@kubernetes/client-node';

export class NamespaceService {
  private readonly client: k8s.CoreV1Api;
  constructor(client: k8s.CoreV1Api) {
    this.client = client;
  }

  async createNamespaceIfNotExists(ns: string, labels?: { [key: string]: string }) {
    try {
      const namespace = k8sMapper.toNamespace(ns, labels);
      const response = await this.client.createNamespace(namespace);

      logger.info(`New namespace created: ${response.metadata!.name}`);
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = error as any;
      const statusCode = err.statusCode ?? err.code ?? err.response?.statusCode ?? err.response?.status;

      if (Number(statusCode) === 409) {
        logger.info(`Namespace already exists: ${ns}`);
        return;
      }

      logger.error(`Error creating namespace: ${ns} / ${JSON.stringify(err.body.text(), null, 2)}`);
    }
  }
}
