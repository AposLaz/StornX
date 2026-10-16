import { BalancerJournal } from './journal.js';
import { BalancerKubernetes, decisionAnnotation } from './kubernetes.js';
import { Config } from './config/config.js';
import { TrafficEngine } from './core/optiBalancer/engine.js';
import { OptiBalancerMapper } from './core/optiBalancer/mapper.js';
import { Observations } from '@stornx/platform/observations.js';
import { PrometheusAdapterImpl } from '@stornx/platform/adapters/prometheus/index.js';
import { addMissingResources } from '@stornx/platform/core/services.js';
import { optedIn, statusCode } from '@stornx/platform/kube.js';
import { logger } from '@stornx/platform/config/logger.js';
import type { Runtime } from '@stornx/platform/runtime.js';
import type { Job } from './journal.js';

/** Reconcile current traffic independently of the component that caused a workload change. */
export class BalancerController {
  readonly journal;
  readonly kubernetes;
  readonly observations;
  readonly prometheus = new PrometheusAdapterImpl();
  readonly engine = new TrafficEngine(Config.metrics.type);

  constructor(readonly runtime: Runtime) {
    this.journal = new BalancerJournal(runtime.db);
    this.kubernetes = new BalancerKubernetes(runtime);
    this.observations = new Observations(runtime.api);

    if (
      Object.values(Config.balancer).some((v) => !Number.isFinite(v) || v < 0) ||
      Config.balancer.minStepSize <= 0 ||
      Config.balancer.maxStepSize > 100 ||
      Config.balancer.maxStepSize < Config.balancer.minStepSize ||
      Config.balancer.urgencyThreshold <= 0 ||
      Config.metrics.responseTimeThreshold <= 0
    ) {
      throw new Error('Invalid balancer configuration');
    }
  }

  /**
   * Relist opted-in workloads so periodic work recovers missed notifications and continues
   * convergence.
   */
  async scan(): Promise<void> {
    for (const namespace of this.runtime.config.namespaces) {
      for (const deployment of (await this.runtime.api.apps.listNamespacedDeployment({ namespace }))
        .items) {
        if (optedIn(deployment, 'balancing')) {
          await this.journal.request({
            cluster_id: this.runtime.config.clusterId,
            namespace,
            name: deployment.metadata!.name!,
            uid: deployment.metadata!.uid!,
          });
        }
      }
    }

    this.runtime.counters.cycles_total++;
  }

  /** Process due jobs under workload locks and persist either completion or retry state. */
  async work(): Promise<void> {
    for (const job of await this.journal.due(this.runtime.config.clusterId)) {
      if (!this.runtime.config.namespaces.includes(job.namespace)) {
        continue;
      }

      await this.runtime.db.lock(`job:${job.cluster_id}:${job.namespace}:${job.uid}`, async () => {
        try {
          this.runtime.leader.assert();
          await this.reconcile(job);
          await this.journal.done(job);
        } catch (error) {
          if (statusCode(error) === 404) {
            await this.journal.done(job);

            return;
          }

          this.runtime.counters.failures_total++;
          logger.warn('Traffic reconciliation deferred', {
            namespace: job.namespace,
            name: job.name,
            error: String(error),
          });
          await this.journal.retry(job, error, this.runtime.config.maxAttempts);
        }
      });
    }

    const rows = await this.runtime.db.pool.query(
      `
        SELECT
          count(*) FILTER (WHERE status = 'pending')::int AS pending,
          count(*) FILTER (WHERE status = 'dead-letter')::int AS dead,
          COALESCE(
            EXTRACT(EPOCH FROM now() - min(created_at) FILTER (WHERE status = 'pending')),
            0
          )::float AS age
        FROM optibalancer.jobs
        WHERE cluster_id = $1
      `,
      [this.runtime.config.clusterId],
    );

    this.runtime.gauges.jobs_pending = rows.rows[0].pending;
    this.runtime.gauges.jobs_dead_letter = rows.rows[0].dead;
    this.runtime.gauges.jobs_oldest_seconds = rows.rows[0].age;
  }

  /**
   * Reconcile the changed workload and affected downstream services within the namespace
   * allowlist.
   */
  async reconcile(job: Job): Promise<void> {
    if (!(await this.kubernetes.workload(job.namespace, job.name, job.uid))) {
      return;
    }

    const downstream = await this.prometheus.getDownstreamPodGraph(job.name, job.namespace);
    const dependents = new Map<string, { namespace: string; name: string }>();

    for (const entry of downstream ?? []) {
      for (const d of entry.destinations) {
        if (this.runtime.config.namespaces.includes(d.destination_service_namespace)) {
          dependents.set(`${d.destination_service_namespace}/${d.destination_workload}`, {
            namespace: d.destination_service_namespace,
            name: d.destination_workload,
          });
        }
      }
    }

    for (const d of dependents.values()) {
      if (d.namespace === job.namespace && d.name === job.name) {
        continue;
      }

      try {
        const deployment = await this.runtime.api.apps.readNamespacedDeployment({
          namespace: d.namespace,
          name: d.name,
        });

        if (optedIn(deployment, 'balancing')) {
          await this.balance({
            cluster_id: job.cluster_id,
            namespace: d.namespace,
            name: d.name,
            uid: deployment.metadata!.uid!,
            revision: 0,
            attempts: 0,
            status: 'pending',
          });
        }
      } catch (error) {
        if (statusCode(error) !== 404) {
          throw error;
        }
      }
    }

    await this.balance(job);
  }

  /**
   * Recover or calculate one routing adjustment under the DestinationRule lock and durable
   * deadline.
   */
  async balance(job: Job): Promise<void> {
    const upstream = await this.prometheus.getUpstreamPodGraph(job.name, job.namespace);

    if (!upstream?.length) {
      return;
    }

    const services = new Set(
      upstream
        .flatMap((u) => u.destinations)
        .filter(
          (d) =>
            d.destination_workload === job.name &&
            d.destination_service_namespace === job.namespace,
        )
        .map((d) => d.destination_service_name)
        .filter((s) => s && s !== 'unknown'),
    );

    for (const service of services) {
      const key = JSON.stringify([job.cluster_id, job.namespace, service]);

      await this.runtime.db.lock(`routing:${key}`, async () => {
        this.runtime.leader.assert();

        const fingerprint = await this.kubernetes.fingerprint(
          job.namespace,
          job.name,
          job.uid,
          service,
        );
        let current = await this.kubernetes.read(job.namespace, service);
        const pending = await this.journal.pending(key);

        if (pending) {
          // A matching marker proves Kubernetes accepted the previous write before a crash.
          if (current?.metadata.annotations?.[decisionAnnotation] === pending.id) {
            await this.journal.finish(pending, 'applied', this.runtime.config.intervalMs);

            return;
          }

          if (
            pending.fingerprint !== fingerprint ||
            Date.now() - new Date(pending.created_at).getTime() > 600000 ||
            pending.resource_uid !== (current?.metadata.uid ?? null) ||
            pending.resource_version !== (current?.metadata.resourceVersion ?? null)
          ) {
            await this.journal.finish(pending, 'superseded', this.runtime.config.intervalMs);
          } else {
            await this.kubernetes.apply(pending, current);
            await this.journal.finish(pending, 'applied', this.runtime.config.intervalMs);

            return;
          }
        }

        // Event delivery can repeat; the persisted deadline still limits traffic-shift frequency.
        if (!(await this.journal.eligible(key))) {
          return;
        }

        // Events provide identity only. Live observations determine the next routing weights.
        const [allMetrics, nodesLatency, topology, responseTimes] = await Promise.all([
          this.observations.getDeploymentsMetrics(job.namespace),
          this.prometheus.getNodesLatency(),
          this.observations.getClusterTopology(),
          this.prometheus.getResponseTimeByNodeDeployment(job.name, job.namespace),
        ]);
        const metrics = await addMissingResources(
          allMetrics,
          job.namespace,
          Config.metrics.weights,
          this.prometheus,
        );
        const pods = metrics[job.name];

        if (!pods?.length || !nodesLatency?.length || !responseTimes?.length) {
          throw new Error('Fresh balancing metrics unavailable');
        }

        const relevantUpstream = upstream
          .map((u) => ({
            ...u,
            destinations: u.destinations.filter((d) => d.destination_service_name === service),
          }))
          .filter((u) => u.destinations.length);
        const calculated = this.engine.calculateTraffic(
          pods,
          relevantUpstream,
          nodesLatency,
          responseTimes.map((r) => ({
            node: r.node,
            responseTimeMs: r.responseTime,
          })),
        );
        const target = OptiBalancerMapper.toDestinationRule(
          calculated,
          job.namespace,
          service,
          topology,
        ).spec.trafficPolicy.loadBalancer.localityLbSetting.distribute;

        if (
          !target.length ||
          target.some(
            (t) =>
              !Object.keys(t.to).length ||
              Object.values(t.to).some((v) => !Number.isFinite(v) || v < 0),
          )
        ) {
          throw new Error('Invalid computed routing distribution');
        }

        const previous = current?.spec.trafficPolicy?.loadBalancer?.localityLbSetting?.distribute;
        // Step in Istio locality coordinates, rather than mixing node names with live locality strings.
        const desired = previous
          ? this.engine.stepTowardTarget(
              previous,
              target,
              Config.balancer.minStepSize,
              Config.balancer.maxStepSize,
              Config.balancer.urgencyThreshold,
              Config.balancer.epsilon,
            )
          : target;
        const delta = previous ? this.engine.l1Distance(previous, desired) : 100;

        this.runtime.gauges.routing_remaining_delta = previous
          ? this.engine.l1Distance(previous, target)
          : 100;

        if (delta < Config.balancer.minDeltaThreshold) {
          return;
        }

        const mutation = !this.runtime.config.dryRun && this.runtime.config.mutationsEnabled;
        const decision = await this.journal.decision(
          {
            resource_key: key,
            cluster_id: job.cluster_id,
            namespace: job.namespace,
            name: service,
            workload_name: job.name,
            workload_uid: job.uid,
            resource_uid: current?.metadata.uid ?? null,
            resource_version: current?.metadata.resourceVersion ?? null,
            fingerprint,
            desired,
            status: mutation ? 'pending' : 'dry-run',
          },
          {
            previous,
            load: pods.map((p) => ({
              pod: p.pod,
              node: p.node,
              usage: p.percentUsage,
            })),
            nodesLatency,
            responseTimes,
            delta,
          },
        );

        this.runtime.counters.decisions_total++;
        logger.info('Routing decision', {
          decisionId: decision.id,
          namespace: job.namespace,
          service,
          delta,
          dryRun: !mutation,
        });

        if (!mutation) {
          return;
        }

        if (
          (await this.kubernetes.fingerprint(job.namespace, job.name, job.uid, service)) !==
          fingerprint
        ) {
          throw new Error('Topology changed during decision');
        }

        current = await this.kubernetes.read(job.namespace, service);
        await this.kubernetes.apply(decision, current);
        await this.journal.finish(decision, 'applied', this.runtime.config.intervalMs);
      });
    }
  }
}
