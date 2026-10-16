import { MetricsService } from './adapters/k8s/services/metrics.service.js';
import { k8sMapper } from './adapters/k8s/mapper.js';
import { Config } from './config/config.js';
import type { Clients } from './kube.js';
import type { DeploymentReplicaPodsMetrics } from './types.js';

/** Read workload state and telemetry without granting either service mutation capabilities. */
export class Observations {
  private readonly metrics: MetricsService;

  constructor(readonly api: Clients) {
    this.metrics = new MetricsService(api.metrics, api.core, Config.metrics.weights);
  }

  /** Read resource capacity used by the service-owned placement policy. */
  async getNodesMetrics() {
    return this.metrics.getNodesMetrics();
  }

  /** Map current Node labels into the region, zone and node coordinates used by policies. */
  async getClusterTopology() {
    return k8sMapper.toClusterTopology((await this.api.core.listNode()).items);
  }

  /** Join Deployment ownership to ready, non-terminating pods before attaching metrics. */
  async getDeploymentsMetrics(namespace: string): Promise<DeploymentReplicaPodsMetrics> {
    const [deployments, sets, pods, metrics] = await Promise.all([
      this.api.apps.listNamespacedDeployment({ namespace }),
      this.api.apps.listNamespacedReplicaSet({ namespace }),
      this.api.core.listNamespacedPod({ namespace }),
      this.metrics.getPodsMetrics(namespace),
    ]);
    const result: DeploymentReplicaPodsMetrics = {};

    for (const deploy of deployments.items) {
      const ownedSets = new Set(
        sets.items
          .filter((s) =>
            s.metadata?.ownerReferences?.some(
              (o) => o.uid === deploy.metadata?.uid && o.controller,
            ),
          )
          .map((s) => s.metadata?.uid),
      );
      const ownedPods = new Set(
        pods.items
          .filter(
            (p) =>
              p.metadata?.ownerReferences?.some((o) => ownedSets.has(o.uid) && o.controller) &&
              !p.metadata?.deletionTimestamp &&
              p.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True'),
          )
          .map((p) => p.metadata?.name),
      );

      result[deploy.metadata!.name!] = metrics.filter((m) => ownedPods.has(m.pod));
    }

    return result;
  }
}
