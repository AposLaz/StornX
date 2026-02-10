import { logger } from '../../../config/logger.js';

import type * as k8s from '@kubernetes/client-node';

/**
 * Service for interacting with Kubernetes autoscaling resources (HPA, PDB)
 */
export class AutoscalingService {
  private readonly autoscalingClient: k8s.AutoscalingV2Api;
  private readonly policyClient: k8s.PolicyV1Api;
  private readonly loggerOperation = logger.child({ operation: 'AutoscalingService' });

  constructor(autoscalingClient: k8s.AutoscalingV2Api, policyClient: k8s.PolicyV1Api) {
    this.autoscalingClient = autoscalingClient;
    this.policyClient = policyClient;
  }

  /**
   * Check if a HorizontalPodAutoscaler exists for the given deployment
   * @param deploymentName - Name of the deployment
   * @param namespace - Namespace of the deployment
   * @returns true if HPA exists, false otherwise
   */
  async hasHPA(deploymentName: string, namespace: string): Promise<boolean> {
    try {
      const response = await this.autoscalingClient.listNamespacedHorizontalPodAutoscaler({ namespace });
      const hpas = response.items;

      // Find HPA targeting this deployment
      const hasHpa = hpas.some(
        (hpa) => hpa.spec?.scaleTargetRef?.kind === 'Deployment' && hpa.spec?.scaleTargetRef?.name === deploymentName
      );

      if (hasHpa) {
        this.loggerOperation.info(`HPA found for deployment "${deploymentName}" in namespace "${namespace}"`);
      }

      return hasHpa;
    } catch (error: unknown) {
      const err = error as Error;
      this.loggerOperation.error(`Error checking HPA for ${deploymentName}: ${err.message}`);
      return false;
    }
  }

  /**
   * Get the HPA configuration for a deployment (if exists)
   * @param deploymentName - Name of the deployment
   * @param namespace - Namespace of the deployment
   * @returns HPA spec or null if not found
   */
  async getHPA(deploymentName: string, namespace: string): Promise<k8s.V2HorizontalPodAutoscaler | null> {
    try {
      const response = await this.autoscalingClient.listNamespacedHorizontalPodAutoscaler({ namespace });
      const hpas = response.items;

      const hpa = hpas.find(
        (h) => h.spec?.scaleTargetRef?.kind === 'Deployment' && h.spec?.scaleTargetRef?.name === deploymentName
      );

      return hpa ?? null;
    } catch (error: unknown) {
      const err = error as Error;
      this.loggerOperation.error(`Error getting HPA for ${deploymentName}: ${err.message}`);
      return null;
    }
  }

  /**
   * Check if scaling down would violate Pod Disruption Budget
   * @param deploymentName - Name of the deployment
   * @param namespace - Namespace of the deployment
   * @param currentReplicas - Current number of replicas
   * @returns true if scale down is allowed, false if it would violate PDB
   */
  async canScaleDown(deploymentName: string, namespace: string, currentReplicas: number): Promise<boolean> {
    try {
      const response = await this.policyClient.listNamespacedPodDisruptionBudget({ namespace });
      const pdbs = response.items;

      // Find PDB that might apply to this deployment
      // PDBs use label selectors, so we need to check if the deployment's pods match
      for (const pdb of pdbs) {
        const selector = pdb.spec?.selector?.matchLabels;
        if (!selector) continue;

        // Check if this PDB might target our deployment (by app label convention)
        const appLabel = selector['app'] || selector['app.kubernetes.io/name'];
        if (appLabel && (appLabel === deploymentName || deploymentName.includes(appLabel))) {
          const minAvailable = pdb.spec?.minAvailable;
          const maxUnavailable = pdb.spec?.maxUnavailable;

          // Calculate if we can scale down
          if (minAvailable !== undefined) {
            const minAvailableNum = typeof minAvailable === 'number' ? minAvailable : parseInt(String(minAvailable));
            if (currentReplicas - 1 < minAvailableNum) {
              this.loggerOperation.warn(
                `PDB "${pdb.metadata?.name}" prevents scaling down "${deploymentName}": ` +
                  `minAvailable=${minAvailable}, currentReplicas=${currentReplicas}`
              );
              return false;
            }
          }

          if (maxUnavailable !== undefined) {
            const maxUnavailableNum =
              typeof maxUnavailable === 'number' ? maxUnavailable : parseInt(String(maxUnavailable));
            // If maxUnavailable is 0, we can't scale down at all
            if (maxUnavailableNum === 0) {
              this.loggerOperation.warn(
                `PDB "${pdb.metadata?.name}" prevents scaling down "${deploymentName}": maxUnavailable=0`
              );
              return false;
            }
          }
        }
      }

      return true;
    } catch (error: unknown) {
      const err = error as Error;
      this.loggerOperation.error(`Error checking PDB for ${deploymentName}: ${err.message}`);
      // On error, allow scaling (fail-open for backwards compatibility)
      return true;
    }
  }

  /**
   * Get PDB status for a deployment
   * @param deploymentName - Name of the deployment
   * @param namespace - Namespace of the deployment
   * @returns PDB status or null if not found
   */
  async getPDB(deploymentName: string, namespace: string): Promise<k8s.V1PodDisruptionBudget | null> {
    try {
      const response = await this.policyClient.listNamespacedPodDisruptionBudget({ namespace });
      const pdbs = response.items;

      for (const pdb of pdbs) {
        const selector = pdb.spec?.selector?.matchLabels;
        if (!selector) continue;

        const appLabel = selector['app'] || selector['app.kubernetes.io/name'];
        if (appLabel && (appLabel === deploymentName || deploymentName.includes(appLabel))) {
          return pdb;
        }
      }

      return null;
    } catch (error: unknown) {
      const err = error as Error;
      this.loggerOperation.error(`Error getting PDB for ${deploymentName}: ${err.message}`);
      return null;
    }
  }
}
