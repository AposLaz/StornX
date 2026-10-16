import { createHash } from 'node:crypto';
import { available, optedIn, statusCode, mergePatch } from '@stornx/platform/kube.js';
import type { Runtime } from '@stornx/platform/runtime.js';
import type { RoutingDecision, Distribution } from './journal.js';

export interface LiveRule {
  apiVersion?: string;
  kind?: string;
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    resourceVersion?: string;
    annotations?: Record<string, string>;
  };
  spec: {
    host?: string;
    trafficPolicy?: {
      loadBalancer?: { localityLbSetting?: { distribute?: Distribution[] } };
    };
  };
}

export const decisionAnnotation = 'stornx.io/routing-decision';

/**
 * Patch only StornX-owned locality fields and the recovery marker, preserving customer policies.
 */
export function routingPatch(rule: LiveRule, decision: RoutingDecision) {
  return {
    metadata: {
      resourceVersion: rule.metadata.resourceVersion,
      annotations: { [decisionAnnotation]: decision.id },
    },
    spec: {
      trafficPolicy: {
        loadBalancer: {
          localityLbSetting: { enabled: true, distribute: decision.desired },
        },
      },
    },
  };
}

/** Read serving topology and apply conflict-checked routing changes without scaling privileges. */
export class BalancerKubernetes {
  constructor(readonly runtime: Runtime) {}

  /** Ignore replaced or opted-out workloads and defer work until the current rollout is ready. */
  async workload(namespace: string, name: string, uid: string) {
    const deployment = await this.runtime.api.apps.readNamespacedDeployment({
      namespace,
      name,
    });

    if (deployment.metadata?.uid !== uid) {
      return undefined;
    }

    if (!optedIn(deployment, 'balancing')) {
      return undefined;
    }

    if (!available(deployment)) {
      throw new Error('Workload is not available for traffic reconciliation');
    }

    return deployment;
  }

  /**
   * Hash serving pods, endpoint membership, and topology to validate a routing decision.
   * Volatile resource versions are excluded so unrelated updates do not invalidate the hash.
   *
   * @returns A stable SHA-256 digest of the observed routing inputs.
   * @throws Error when the workload is unavailable, endpoints lag, or service ownership is ambiguous.
   */
  async fingerprint(
    namespace: string,
    name: string,
    uid: string,
    service: string,
  ): Promise<string> {
    const deployment = await this.workload(namespace, name, uid);

    if (!deployment) {
      throw new Error('Workload replaced or balancing disabled');
    }

    const [slices, sets, pods, nodes] = await Promise.all([
      this.runtime.api.discovery.listNamespacedEndpointSlice({
        namespace,
        labelSelector: `kubernetes.io/service-name=${service}`,
      }),
      this.runtime.api.apps.listNamespacedReplicaSet({ namespace }),
      this.runtime.api.core.listNamespacedPod({ namespace }),
      this.runtime.api.core.listNode(),
    ]);
    const ready = slices.items.flatMap((s) =>
      s.endpoints.filter((e) => e.conditions?.ready === true && !e.conditions?.terminating),
    );

    if (!ready.length) {
      throw new Error('No ready service endpoints');
    }

    const owned = new Set(
      sets.items
        .filter((s) => s.metadata?.ownerReferences?.some((o) => o.uid === uid))
        .map((s) => s.metadata?.uid),
    );
    const serving = pods.items.filter(
      (p) =>
        p.metadata?.ownerReferences?.some((o) => owned.has(o.uid)) &&
        !p.metadata?.deletionTimestamp &&
        p.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True'),
    );

    if (!serving.length) {
      throw new Error('No ready workload pods');
    }

    const endpointUids = new Set(ready.map((e) => e.targetRef?.uid));

    if (!serving.every((p) => endpointUids.has(p.metadata?.uid))) {
      throw new Error('EndpointSlices have not observed ready workload pods');
    }

    const servingUids = new Set(serving.map((p) => p.metadata?.uid));

    if (ready.some((e) => !servingUids.has(e.targetRef?.uid))) {
      throw new Error('Service endpoints span multiple workloads; routing ownership is ambiguous');
    }

    const state = {
      uid,
      generation: deployment.metadata?.generation,
      replicas: deployment.spec?.replicas,
      pods: serving.map((p) => [p.metadata?.uid, p.spec?.nodeName]).sort(),
      endpoints: ready.map((e) => [e.targetRef?.uid, e.nodeName, [...e.addresses].sort()]).sort(),
      topology: nodes.items
        .map((n) => [
          n.metadata?.name,
          n.metadata?.labels?.['topology.kubernetes.io/region'],
          n.metadata?.labels?.['topology.kubernetes.io/zone'],
          n.metadata?.labels?.['topology.istio.io/subzone'],
        ])
        .sort(),
    };

    return createHash('sha256').update(JSON.stringify(state)).digest('hex');
  }

  /**
   * Return absence only for a missing DestinationRule; permission and transport failures
   * propagate.
   */
  async read(namespace: string, name: string): Promise<LiveRule | undefined> {
    try {
      return (await this.runtime.api.custom.getNamespacedCustomObject({
        group: 'networking.istio.io',
        version: 'v1',
        plural: 'destinationrules',
        namespace,
        name,
      })) as LiveRule;
    } catch (error) {
      if (statusCode(error) === 404) {
        return undefined;
      }

      throw error;
    }
  }

  /**
   * Apply the recorded routing intent only while leadership, database locks and resource
   * identity hold.
   */
  async apply(decision: RoutingDecision, rule?: LiveRule): Promise<void> {
    await this.runtime.db.assertLocks();
    this.runtime.assertMutation();

    const namespace = decision.namespace;
    const name = decision.name;

    if (rule) {
      if (
        rule.metadata.uid !== decision.resource_uid ||
        rule.metadata.resourceVersion !== decision.resource_version
      ) {
        throw new Error('DestinationRule changed since the decision');
      }

      const host = rule.spec.host;

      if (
        ![
          name,
          `${name}.${namespace}`,
          `${name}.${namespace}.svc`,
          `${name}.${namespace}.svc.cluster.local`,
        ].includes(host ?? '')
      ) {
        throw new Error('DestinationRule host does not match the selected service');
      }

      await this.runtime.api.custom.patchNamespacedCustomObject(
        {
          group: 'networking.istio.io',
          version: 'v1',
          plural: 'destinationrules',
          namespace,
          name,
          body: routingPatch(rule, decision),
        },
        mergePatch,
      );
    } else {
      if (decision.resource_uid) {
        throw new Error('DestinationRule was deleted');
      }

      await this.runtime.api.custom.createNamespacedCustomObject({
        group: 'networking.istio.io',
        version: 'v1',
        plural: 'destinationrules',
        namespace,
        body: {
          apiVersion: 'networking.istio.io/v1',
          kind: 'DestinationRule',
          metadata: {
            name,
            namespace,
            annotations: { [decisionAnnotation]: decision.id },
          },
          spec: {
            host: `${name}.${namespace}.svc.cluster.local`,
            trafficPolicy: {
              loadBalancer: {
                simple: 'LEAST_REQUEST',
                localityLbSetting: {
                  enabled: true,
                  distribute: decision.desired,
                },
              },
            },
          },
        },
      });
    }
  }
}
