import { randomUUID } from 'node:crypto';
import { eventType } from '@stornx/event-contracts';
import { Observations } from '@stornx/platform/observations.js';
import { PrometheusAdapterImpl } from '@stornx/platform/adapters/prometheus/index.js';
import { addMissingResources } from '@stornx/platform/core/services.js';
import { k8sMapper } from '@stornx/platform/adapters/k8s/mapper.js';
import { getPodNodeResources } from '@stornx/platform/utils.js';
import { integer, boolean } from '@stornx/platform/settings.js';
import { optedIn, statusCode } from '@stornx/platform/kube.js';
import { logger } from '@stornx/platform/config/logger.js';
import { Config } from './config/config.js';
import { OptiScaler } from './core/optiScaler/index.js';
import { ScaleAction } from './core/optiScaler/enums.js';
import { ScalerJournal } from './journal.js';
import { ScalerKubernetes } from './kubernetes.js';
import { recoveryAction } from './policy.js';
import type { ScaleOperation } from './journal.js';
import type { Runtime } from '@stornx/platform/runtime.js';

/** Coordinate scaling policy, durable intent recording and recovery of ambiguous API outcomes. */
export class ScalerController {
  readonly journal;
  readonly kubernetes;
  readonly observations;
  readonly prometheus = new PrometheusAdapterImpl();
  readonly cooldown = integer(process.env, 'SCALER_COOLDOWN_SECONDS', 60);
  readonly placement = boolean(process.env, 'TARGETED_PLACEMENT', true);
  readonly lower = Number(process.env.METRICS_LOWER_THRESHOLD ?? 30) / 100;
  readonly upper = Number(process.env.METRICS_UPPER_THRESHOLD ?? 80) / 100;

  constructor(readonly runtime: Runtime) {
    this.journal = new ScalerJournal(runtime.db);
    this.observations = new Observations(runtime.api);
    this.kubernetes = new ScalerKubernetes(
      runtime,
      integer(process.env, 'MIN_REPLICAS', 1),
      integer(process.env, 'MAX_REPLICAS', 100),
    );

    if (this.kubernetes.max < this.kubernetes.min) {
      throw new Error('MAX_REPLICAS must be >= MIN_REPLICAS');
    }

    if (
      !Number.isFinite(this.lower) ||
      !Number.isFinite(this.upper) ||
      this.lower < 0 ||
      this.lower >= this.upper ||
      this.upper > 1
    ) {
      throw new Error('Invalid scaling thresholds');
    }

    if (
      !Number.isSafeInteger(Config.faultTolerance.maxZones) ||
      Config.faultTolerance.maxZones < 1
    ) {
      throw new Error('Invalid FT_MAX_ZONES');
    }
  }

  /** Recover unfinished operations before evaluating fresh telemetry for allowlisted workloads. */
  async cycle(): Promise<void> {
    // One placement owner per cluster, including standby replicas and overlapping releases.
    await this.runtime.db.lock(`placement:${this.runtime.config.clusterId}`, async (tx) => {
      this.runtime.leader.assert();

      const mutation = !this.runtime.config.dryRun && this.runtime.config.mutationsEnabled;

      if (mutation) {
        // Finish interrupted placement before a fresh decision can change the same workload.
        await this.kubernetes.cleanup();

        for (const op of await this.journal.pending(this.runtime.config.clusterId)) {
          try {
            await this.execute(op);
          } catch (error) {
            this.runtime.counters.failures_total++;
            logger.error('Scale operation awaiting recovery', {
              operationId: op.id,
              error: String(error),
            });
          }
        }

        await this.kubernetes.labels();
      }

      // Decisions use a new telemetry/topology snapshot for this cycle.
      const topology = await this.observations.getClusterTopology();
      const zonesNodes = k8sMapper.toClusterAzTopology(topology);
      const nodesLatency = await this.prometheus.getNodesLatency();

      if (!nodesLatency?.length) {
        throw new Error('Node latency metrics unavailable');
      }

      for (const namespace of this.runtime.config.namespaces) {
        const metrics = await addMissingResources(
          await this.observations.getDeploymentsMetrics(namespace),
          namespace,
          Config.metrics.weights,
          this.prometheus,
        );
        const deployments = (await this.runtime.api.apps.listNamespacedDeployment({ namespace }))
          .items;

        for (const deployment of deployments) {
          if (!optedIn(deployment, 'scaling')) {
            continue;
          }

          const name = deployment.metadata!.name!;
          const uid = deployment.metadata!.uid!;
          const replicaPods = metrics[name];

          if (
            !replicaPods?.length ||
            (await this.journal.cooling(
              tx,
              this.runtime.config.clusterId,
              namespace,
              uid,
              this.cooldown,
            ))
          ) {
            continue;
          }

          const metric =
            Config.metrics.type === 'cpu-memory' ? 'cpuAndMemory' : Config.metrics.type;
          const load =
            replicaPods.reduce((sum, p) => sum + p.percentUsage[metric], 0) / replicaPods.length;

          if (!Number.isFinite(load)) {
            continue;
          }

          const action =
            load > this.upper ? ScaleAction.UP : load < this.lower ? ScaleAction.DOWN : undefined;

          if (!action) {
            continue;
          }

          const original = deployment.spec?.replicas ?? 0;
          const target = original + (action === ScaleAction.UP ? 1 : -1);

          try {
            const checked = await this.kubernetes.guard(namespace, name, target);

            if (checked.metadata?.uid !== uid || checked.spec?.replicas !== original) {
              continue;
            }

            const readyNodes = new Set(
              (await this.runtime.api.core.listNode()).items
                .filter(
                  (n) =>
                    !n.spec?.unschedulable &&
                    n.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True'),
                )
                .map((n) => n.metadata?.name),
            );
            let nodes = (await this.observations.getNodesMetrics()).filter((n) =>
              readyNodes.has(n.name),
            );

            if (action === ScaleAction.UP) {
              const needed = getPodNodeResources(replicaPods[0]);

              nodes = nodes.filter(
                (n) => n.freeToUse.cpu >= needed.cpu && n.freeToUse.memory >= needed.memory,
              );
            }

            const planner = new OptiScaler(
              action,
              {
                deployment: name,
                namespace,
                replicaPods,
                nodeMetrics: nodes,
                zonesNodes,
                nodesLatency,
              },
              { prom: this.prometheus },
            );
            const candidate = await planner.planNode(Config.metrics.type, Config.metrics.weights);

            if (!candidate) {
              continue;
            }

            const op: ScaleOperation = {
              id: randomUUID(),
              cluster_id: this.runtime.config.clusterId,
              namespace,
              name,
              uid,
              original,
              target,
              generation: Number(checked.metadata!.generation),
              candidate: action === ScaleAction.UP && this.placement ? candidate : null,
              status: mutation ? 'pending' : 'dry-run',
              created_at: new Date(),
              input: { load, action, metric: Config.metrics.type, candidate },
            };

            // Persist the absolute target first; recovery must never repeat a replica increment.
            await this.journal.create(tx, op);
            this.runtime.counters.decisions_total++;
            logger.info('Scaling decision', {
              operationId: op.id,
              ...op.input,
              target,
              dryRun: !mutation,
            });

            if (mutation) {
              await this.execute(op);
            }
          } catch (error) {
            logger.warn('Scaling skipped or pending recovery', {
              namespace,
              name,
              error: String(error),
            });
            this.runtime.counters.failures_total++;
          }
        }
      }

      this.runtime.counters.cycles_total++;
    });
  }

  /**
   * Reconcile one absolute target against live state, then commit its outcome and notification
   * together.
   */
  async execute(op: ScaleOperation): Promise<void> {
    try {
      this.runtime.assertMutation();

      if (!this.runtime.config.namespaces.includes(op.namespace)) {
        throw new Error('Pending operation outside configured namespaces');
      }

      let deployment = await this.kubernetes.read(op.namespace, op.name);
      let action = recoveryAction(op, deployment);

      if (action === 'superseded') {
        await this.journal.finish(op, 'superseded');

        return;
      }

      if (action === 'apply') {
        deployment = await this.kubernetes.guard(op.namespace, op.name, op.target);
        action = recoveryAction(op, deployment);

        if (action !== 'apply') {
          if (action === 'superseded') {
            await this.journal.finish(op, 'superseded');

            return;
          }
        } else {
          try {
            if (op.candidate) {
              await this.kubernetes.taint(op);
            }

            await this.kubernetes.scale(op, deployment.metadata!.resourceVersion!);

            if (op.candidate) {
              await this.kubernetes.waitScheduled(op);
            }
          } finally {
            if (op.candidate) {
              await this.kubernetes.cleanup(op.id);
            }
          }
        }

        deployment = await this.kubernetes.read(op.namespace, op.name);

        if (recoveryAction(op, deployment) !== 'complete') {
          throw new Error('Scale result has not been observed');
        }
      }

      // The observed outcome and its notification commit together in PostgreSQL.
      await this.journal.finish(op, 'applied', {
        type: eventType,
        schemaVersion: 1,
        id: op.id,
        correlationId: op.id,
        producer: 'optiscaler',
        occurredAt: new Date().toISOString(),
        clusterId: op.cluster_id,
        namespace: op.namespace,
        workload: { kind: 'Deployment', name: op.name, uid: op.uid },
        reason: 'replica-target-changed',
        desiredReplicas: op.target,
        resourceVersion: deployment.metadata!.resourceVersion,
      });
    } catch (error) {
      if (statusCode(error) === 404) {
        await this.journal.finish(op, 'superseded', undefined, 'Workload no longer exists');

        return;
      }

      await this.journal.error(op.id, error);

      throw error;
    }
  }
}
