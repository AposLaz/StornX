import { setHeaderOptions, PatchStrategy } from '@kubernetes/client-node';
import { assertPolicy } from './policy.js';
import { mergePatch } from '@stornx/platform/kube.js';
import type { Runtime } from '@stornx/platform/runtime.js';
import type { ScaleOperation } from './journal.js';

const taintKey = 'stornx.io/placement-operation';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Restrict scaling and placement mutations to guarded, journaled operations. */
export class ScalerKubernetes {
  constructor(
    readonly runtime: Runtime,
    readonly min: number,
    readonly max: number,
  ) {}

  /** Fetch live Deployment state rather than relying on the snapshot used for a decision. */
  async read(namespace: string, name: string) {
    return this.runtime.api.apps.readNamespacedDeployment({ namespace, name });
  }

  /** Read HPA and PDB policy with the workload; failed reads propagate and block scaling. */
  async guard(namespace: string, name: string, target: number, ready = true) {
    const [deployment, hpas, pdbs] = await Promise.all([
      this.read(namespace, name),
      this.runtime.api.autoscaling.listNamespacedHorizontalPodAutoscaler({
        namespace,
      }),
      this.runtime.api.policy.listNamespacedPodDisruptionBudget({ namespace }),
    ]);
    const hpa = hpas.items.some(
      (h) => h.spec?.scaleTargetRef.kind === 'Deployment' && h.spec.scaleTargetRef.name === name,
    );

    assertPolicy(deployment, target, this.min, this.max, pdbs.items, hpa, ready);

    return deployment;
  }

  /** Apply an absolute target with a resource-version check instead of retrying an increment. */
  async scale(op: ScaleOperation, resourceVersion: string): Promise<void> {
    await this.runtime.db.assertLocks();
    this.runtime.assertMutation();
    await this.runtime.api.apps.patchNamespacedDeploymentScale(
      {
        namespace: op.namespace,
        name: op.name,
        body: {
          metadata: { resourceVersion },
          spec: { replicas: op.target },
        },
      },
      mergePatch,
    );
  }

  /**
   * Temporarily discourage scheduling on other nodes, marking each taint with this operation ID.
   */
  async taint(op: ScaleOperation): Promise<void> {
    for (const node of (await this.runtime.api.core.listNode()).items) {
      if (node.metadata?.name === op.candidate) {
        continue;
      }

      await this.runtime.db.assertLocks();
      this.runtime.assertMutation();

      const taints = node.spec?.taints ?? [];

      if (taints.some((t) => t.key === taintKey && t.value !== op.id)) {
        throw new Error('Another placement operation owns node taints');
      }

      await this.runtime.api.core.patchNode(
        {
          name: node.metadata!.name!,
          body: {
            metadata: { resourceVersion: node.metadata?.resourceVersion },
            spec: {
              taints: [
                ...taints.filter((t) => t.key !== taintKey),
                { key: taintKey, value: op.id, effect: 'NoSchedule' },
              ],
            },
          },
        },
        mergePatch,
      );
    }
  }

  /** Remove only StornX placement taints, optionally restricted to one operation owner. */
  async cleanup(operationId?: string): Promise<void> {
    const nodes = (await this.runtime.api.core.listNode()).items;

    for (const node of nodes) {
      const taints = node.spec?.taints ?? [];

      if (!taints.some((t) => t.key === taintKey && (!operationId || t.value === operationId))) {
        continue;
      }

      // Only operation-owned taints are removed, including after leadership loss.
      await this.runtime.api.core.patchNode(
        {
          name: node.metadata!.name!,
          body: {
            metadata: { resourceVersion: node.metadata?.resourceVersion },
            spec: {
              taints: taints.filter(
                (t) => t.key !== taintKey || (operationId && t.value !== operationId),
              ),
            },
          },
        },
        mergePatch,
      );
    }
  }

  /** Keep temporary placement constraints until replicas are assigned or the bounded wait fails. */
  async waitScheduled(op: ScaleOperation): Promise<void> {
    const deadline = Date.now() + 60000;

    while (Date.now() < deadline) {
      this.runtime.assertMutation();

      const sets = (
        await this.runtime.api.apps.listNamespacedReplicaSet({
          namespace: op.namespace,
        })
      ).items;
      const owned = new Set(
        sets
          .filter((s) => s.metadata?.ownerReferences?.some((o) => o.uid === op.uid))
          .map((s) => s.metadata?.uid),
      );
      const pods = (
        await this.runtime.api.core.listNamespacedPod({
          namespace: op.namespace,
        })
      ).items.filter(
        (p) =>
          !p.metadata?.deletionTimestamp &&
          p.metadata?.ownerReferences?.some((o) => owned.has(o.uid)),
      );

      if (pods.length >= op.target && pods.every((p) => Boolean(p.spec?.nodeName))) {
        return;
      }

      await delay(2000);
    }

    throw new Error('Timed out waiting for placement; scale outcome will be recovered');
  }

  /** Maintain the node subzone labels needed by Istio locality routing. */
  async labels(): Promise<void> {
    const nodes = (await this.runtime.api.core.listNode()).items;

    for (const node of nodes) {
      /** Maintain the node subzone labels needed by Istio locality routing. */
      const labels = node.metadata?.labels ?? {};
      const desired = { 'topology.istio.io/subzone': node.metadata!.name! };

      if (labels['topology.istio.io/subzone'] === node.metadata?.name) {
        continue;
      }

      await this.runtime.db.assertLocks();
      this.runtime.assertMutation();
      await this.runtime.api.core.patchNode(
        {
          name: node.metadata!.name!,
          body: {
            metadata: {
              resourceVersion: node.metadata?.resourceVersion,

              labels: desired,
            },
          },
        },
        setHeaderOptions('Content-Type', PatchStrategy.MergePatch),
      );
    }
  }
}
