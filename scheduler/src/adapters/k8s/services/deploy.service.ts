import * as k8s from '@kubernetes/client-node';

import { logger } from '../../../config/logger.js';

import type { ReplicasAction } from '../types.js';

export class DeploymentService {
  private readonly client: k8s.AppsV1Api;

  constructor(client: k8s.AppsV1Api) {
    this.client = client;
  }

  async fetchDeploymentsByNamespace(namespace: string) {
    const response = await this.client.listNamespacedDeployment({ namespace });

    // get Deployments on Namespace
    const deployments = response.items.filter((deploy) => deploy.metadata?.name !== undefined);
    if (deployments.length === 0) {
      logger.warn(`No Deployments found on Namespace: ${namespace}`);
      return;
    }

    return deployments;
  }

  async fetchNamespacedDeployments(deployment: string, namespace: string) {
    const response = await this.client.readNamespacedDeployment({ name: deployment, namespace });
    return response;
  }

  async fetchDeploymentReplicaSetsByNamespace(namespace: string) {
    // get Replica sets on Namespace
    const res = await this.client.listNamespacedReplicaSet({ namespace });
    const replicaSets = res.items.filter((rs) =>
      rs.metadata?.ownerReferences?.some((owner) => owner.kind === 'Deployment')
    );
    if (replicaSets.length === 0) {
      logger.warn(`No Replica Sets found on Namespace: ${namespace}`);
      return;
    }

    return replicaSets;
  }

  async handleDeployReplicas(deployName: string, namespace: string, action: ReplicasAction) {
    const deploy = await this.client.readNamespacedDeployment({ name: deployName, namespace });

    if (action === 'add') {
      logger.info(`Adding 1 replicas to deployment ${deployName}`);
      deploy.spec!.replicas!++;
    }
    if (action === 'delete') {
      logger.info(`Deleting 1 replicas to deployment ${deployName}`);
      deploy.spec!.replicas!--;
    }

    const patchReplicas = {
      spec: {
        replicas: deploy.spec!.replicas,
      },
    };

    // update replicas
    await this.client.patchNamespacedDeploymentScale(
      {
        name: deployName,
        namespace,
        body: patchReplicas,
      },
      k8s.setHeaderOptions('Content-Type', k8s.PatchStrategy.MergePatch)
    );
  }
}
