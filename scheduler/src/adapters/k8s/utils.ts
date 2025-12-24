import type { CriticalDeploymentsNodeUsage, DeploymentNodeUsage, ThresholdType } from './types.js';
import type { MetricsType } from '../../enums.js';
import type { DeploymentReplicaPodsMetrics } from '../../types.js';
import type { V1Deployment } from '@kubernetes/client-node';

/**
 * Calculate the average metric for each node of each deployment.
 * @param deployments - An object where each key is a deployment name and the value is an array of objects with node and percentUsage properties.
 * @param metricType - The type of metric to calculate the average for. Can be 'cpu', 'memory' or 'cpuAndMemory'.
 * @returns An object where each key is a deployment name and the value is an array of objects with node and avgMetric properties.
 */
export const avgDeploymentMetricByNode = (deployments: DeploymentReplicaPodsMetrics, metricType: MetricsType) => {
  const metricDeployments: DeploymentNodeUsage = {};

  for (const [deployment, replicaPods] of Object.entries(deployments)) {
    const nodeMemoryUsage: { [key: string]: number } = {};
    const replicasInNode: { [key: string]: number } = {};

    replicaPods.forEach(({ node, percentUsage }) => {
      if (!nodeMemoryUsage[node]) {
        nodeMemoryUsage[node] = 0;
      }

      if (metricType === 'cpu') {
        nodeMemoryUsage[node] += percentUsage.cpu;
        replicasInNode[node] = (replicasInNode[node] ?? 0) + 1;
      } else if (metricType === 'memory') {
        nodeMemoryUsage[node] += percentUsage.memory;
        replicasInNode[node] = (replicasInNode[node] ?? 0) + 1;
      } else {
        nodeMemoryUsage[node] += percentUsage.cpuAndMemory;
        replicasInNode[node] = (replicasInNode[node] ?? 0) + 1;
      }
    });

    metricDeployments[deployment] = Object.entries(nodeMemoryUsage).map(([node, metric]) => ({
      node,
      avgMetric: metric / replicasInNode[node],
    }));
  }

  return metricDeployments;
};

/**
 * Classifies deployments based on their load relative to specified thresholds.
 *
 * For each deployment, the function evaluates the average metric for its nodes
 * and categorizes the deployment as either high-loaded or low-loaded. A deployment
 * is considered high-loaded if at least one of its nodes has an average metric
 * above the upper threshold. Conversely, it is considered low-loaded if at least
 * one node has an average metric below the lower threshold.
 *
 * @param deployments - An object where each key is a deployment name and the value
 * is an array of objects, each containing a node and its average metric usage.
 * @param threshold - An object specifying the upper and lower thresholds to
 * classify deployments.
 * @returns An object containing two properties: `highLoadedDeployments` and
 * `lowLoadedDeployments`, each mapping deployment names to their respective node
 * usage data that meets the classification criteria.
 */

export const classifyDeploymentsByLoad = (
  deployments: DeploymentNodeUsage,
  threshold: ThresholdType
): CriticalDeploymentsNodeUsage => {
  const highLoadedDeployments: DeploymentNodeUsage = {};
  const lowLoadedDeployments: DeploymentNodeUsage = {};

  for (const [deployment, nodes] of Object.entries(deployments)) {
    // find at least one node with avgMetric above threshold
    const criticalDeployments = nodes.some(({ avgMetric }) => avgMetric > threshold.upper);
    if (criticalDeployments) {
      highLoadedDeployments[deployment] = nodes;
      continue;
    }

    const lowUsageDeployments = nodes.some(({ avgMetric }) => avgMetric < threshold.lower);

    if (lowUsageDeployments) lowLoadedDeployments[deployment] = nodes;
  }

  const filteredHighLoadedDeploys = Object.fromEntries(
    Object.entries(highLoadedDeployments).filter(([, value]) => value.length > 0)
  );

  const filteredLowLoadedDeploys = Object.fromEntries(
    Object.entries(lowLoadedDeployments).filter(([, value]) => value.length > 0)
  );

  return {
    highLoadedDeployments: filteredHighLoadedDeploys,
    lowLoadedDeployments: filteredLowLoadedDeploys,
  };
};

export const isDeploymentFullyRunning = (deployment: V1Deployment): boolean => {
  const desired = deployment.spec?.replicas ?? 0;
  const ready = deployment.status?.readyReplicas ?? 0;
  const available = deployment.status?.availableReplicas ?? 0;
  const updated = deployment.status?.updatedReplicas ?? 0;

  return desired > 0 && desired === ready && desired === available && desired === updated;
};
