import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
  ScalerJournal,
  migration as scalerMigration,
} from '../services/optiscaler/dist/journal.js';
import {
  BalancerJournal,
  migration as balancerMigration,
} from '../services/optibalancer/dist/journal.js';
import { ScalerController } from '../services/optiscaler/dist/controller.js';
import { BalancerController } from '../services/optibalancer/dist/controller.js';
const query = (client) => async (sql, args) => {
  const r = await client.query(sql, args);
  return { ...r, rowCount: r.rows.length || r.affectedRows || 0 };
};
async function database() {
  const sql = new PGlite();
  await sql.exec(scalerMigration);
  await sql.exec(balancerMigration);
  return {
    sql,
    pool: { query: query(sql) },
    transaction: (run) => sql.transaction((tx) => run({ query: query(tx) })),
    lock: async (_key, run) => run({ query: query(sql) }),
  };
}
const op = () => ({
  id: randomUUID(),
  cluster_id: 'test',
  namespace: 'shop',
  name: 'api',
  uid: 'uid-a',
  original: 3,
  target: 4,
  generation: 2,
  candidate: null,
  status: 'pending',
  created_at: new Date(),
  input: { load: 0.9 },
});
const event = (id = randomUUID()) => ({
  type: 'workload.changed.v1',
  schemaVersion: 1,
  id,
  correlationId: 'trace',
  occurredAt: new Date().toISOString(),
  producer: 'hpa-observer',
  clusterId: 'test',
  namespace: 'shop',
  workload: { kind: 'Deployment', name: 'api', uid: 'uid-a' },
  reason: 'replica-target-changed',
  desiredReplicas: 4,
});
test('journals recover scaling after Kubernetes succeeded and retry an ambiguous broker confirmation', async () => {
  const db = await database();
  try {
    const journal = new ScalerJournal(db),
      operation = op();
    await journal.create({ query: db.pool.query }, operation);
    let scaleCalls = 0;
    const runtime = {
      db,
      config: {
        clusterId: 'test',
        namespaces: ['shop'],
        dryRun: false,
        mutationsEnabled: true,
      },
      api: {},
      assertMutation() {},
      leader: { assert() {} },
      counters: {},
    };
    const controller = new ScalerController(runtime);
    controller.kubernetes.read = async () => ({
      metadata: { uid: 'uid-a', resourceVersion: 'rv-after', generation: 3 },
      spec: { replicas: 4 },
    });
    controller.kubernetes.scale = async () => {
      scaleCalls++;
    };
    await controller.execute(operation);
    assert.equal(scaleCalls, 0, 'a response loss must not cause another increment');
    assert.equal(
      (await db.pool.query('SELECT status FROM optiscaler.operations')).rows[0].status,
      'applied',
    );
    let deliveries = 0;
    await assert.rejects(() =>
      journal.publish('test', async () => {
        deliveries++;
        throw new Error('Confirmation lost');
      }),
    );
    assert.equal(
      (await db.pool.query('SELECT published_at FROM optiscaler.outbox')).rows[0].published_at,
      null,
    );
    const balancer = new BalancerJournal(db);
    await journal.publish('test', async (e) => {
      deliveries++;
      await balancer.accept(e);
      await balancer.accept(e);
    });
    assert.equal(deliveries, 2);
    assert.equal(
      (await db.pool.query('SELECT count(*)::int AS n FROM optibalancer.jobs')).rows[0].n,
      1,
    );
    assert.equal(
      (await db.pool.query('SELECT revision FROM optibalancer.jobs')).rows[0].revision,
      1,
    );
    const foreign = { ...op(), cluster_id: 'another-cluster' };
    await journal.create({ query: db.pool.query }, foreign);
    await journal.finish(foreign, 'applied', {
      ...event(foreign.id),
      clusterId: 'another-cluster',
    });
    await journal.publish('test', async () => {
      assert.fail('Must not publish another cluster outbox');
    });
    assert.equal(
      (await db.pool.query('SELECT published_at FROM optiscaler.outbox WHERE id=$1', [foreign.id]))
        .rows[0].published_at,
      null,
    );
  } finally {
    await db.sql.close();
  }
});
test('failed database commit rolls back both operation outcome and outbox', async () => {
  const db = await database();
  try {
    const journal = new ScalerJournal(db),
      operation = op();
    await journal.create({ query: db.pool.query }, operation);
    const invalid = event('invalid-uuid');
    await assert.rejects(() =>
      db.transaction(async (tx) => {
        await tx.query("UPDATE optiscaler.operations SET status='applied' WHERE id=$1", [
          operation.id,
        ]);
        await tx.query('INSERT INTO optiscaler.outbox(id,payload) VALUES($1,$2)', [
          invalid.id,
          JSON.stringify(invalid),
        ]);
      }),
    );
    assert.equal((await journal.pending('test')).length, 1);
    assert.equal((await db.pool.query('SELECT * FROM optiscaler.outbox')).rows.length, 0);
  } finally {
    await db.sql.close();
  }
});
test('inbox acceptance is atomic and does not lose an event arriving during reconciliation', async () => {
  const db = await database();
  try {
    const journal = new BalancerJournal(db),
      first = event();
    await journal.accept(first);
    const job = (await journal.due('test'))[0];
    await journal.accept(event());
    await journal.done(job);
    assert.equal((await journal.due('test')).length, 1, 'newer revision remains pending');
    await assert.rejects(() => journal.accept({ ...first, desiredReplicas: 5 }), /reused/);
    assert.equal(
      (await db.pool.query('SELECT count(*)::int AS n FROM optibalancer.inbox')).rows[0].n,
      2,
    );
  } finally {
    await db.sql.close();
  }
});
test('jobs isolate same-named workloads across namespaces and send repeated failures to a durable terminal state', async () => {
  const db = await database();
  try {
    const journal = new BalancerJournal(db);
    await journal.accept(event());
    await journal.accept({
      ...event(),
      namespace: 'other',
      workload: { kind: 'Deployment', name: 'api', uid: 'uid-b' },
    });
    const jobs = await journal.due('test');
    assert.equal(jobs.length, 2);
    await journal.retry(jobs[0], new Error('Metrics unavailable'), 1);
    const row = (
      await db.pool.query('SELECT status,error FROM optibalancer.jobs WHERE uid=$1', [jobs[0].uid])
    ).rows[0];
    assert.equal(row.status, 'dead-letter');
    assert.match(row.error, /Metrics/);
  } finally {
    await db.sql.close();
  }
});
test('routing recovers a successful Kubernetes patch without applying a second gradual step', async () => {
  const db = await database();
  try {
    const journal = new BalancerJournal(db);
    const key = JSON.stringify(['test', 'shop', 'api']);
    const decision = await journal.decision(
      {
        resource_key: key,
        cluster_id: 'test',
        namespace: 'shop',
        name: 'api',
        workload_name: 'api',
        workload_uid: 'uid-a',
        resource_uid: 'rule-a',
        resource_version: 'before',
        fingerprint: 'topology',
        desired: [{ from: 'r/z/a', to: { 'r/z/a': 80, 'r/z/b': 20 } }],
        status: 'pending',
      },
      { delta: 20 },
    );
    let applied = 0;
    const runtime = {
      db,
      config: {
        clusterId: 'test',
        namespaces: ['shop'],
        intervalMs: 300000,
        dryRun: false,
        mutationsEnabled: true,
      },
      api: {},
      leader: { assert() {} },
      counters: {},
      gauges: {},
    };
    const controller = new BalancerController(runtime);
    controller.prometheus.getUpstreamPodGraph = async () => [
      {
        node: 'a',
        destinations: [
          {
            destination_workload: 'api',
            destination_service_namespace: 'shop',
            destination_service_name: 'api',
          },
        ],
      },
    ];
    controller.kubernetes.fingerprint = async () => 'topology';
    controller.kubernetes.read = async () => ({
      metadata: {
        uid: 'rule-a',
        resourceVersion: 'after',
        annotations: { 'stornx.io/routing-decision': decision.id },
      },
      spec: {},
    });
    controller.kubernetes.apply = async () => {
      applied++;
    };
    await controller.balance({
      cluster_id: 'test',
      namespace: 'shop',
      name: 'api',
      uid: 'uid-a',
    });
    assert.equal(applied, 0);
    assert.equal(await journal.eligible(key), false);
    assert.equal(
      (await db.pool.query('SELECT status FROM optibalancer.decisions')).rows[0].status,
      'applied',
    );
  } finally {
    await db.sql.close();
  }
});
test('HPA observer events reconcile current traffic with no scaler running, including stale notifications', async () => {
  const db = await database();
  try {
    const runtime = {
      db,
      config: {
        clusterId: 'test',
        namespaces: ['shop'],
        intervalMs: 300000,
        dryRun: false,
        mutationsEnabled: true,
        maxAttempts: 12,
      },
      api: {},
      leader: { assert() {} },
      counters: { decisions_total: 0, failures_total: 0 },
      gauges: {},
    };
    const controller = new BalancerController(runtime);
    const pods = ['node-a', 'node-b'].map((node, i) => ({
      node,
      pod: `api-${i}`,
      usage: { cpu: 10, memory: 10 },
      requested: { cpu: 20, memory: 20 },
      limits: { cpu: 100, memory: 100 },
      percentUsage: { cpu: 0.1, memory: 0.1, cpuAndMemory: 0.1 },
    }));
    controller.kubernetes.workload = async (_ns, _name, uid) =>
      uid === 'uid-a' ? { metadata: { uid }, spec: { replicas: 2 } } : undefined;
    controller.kubernetes.fingerprint = async () => 'live-topology';
    controller.kubernetes.read = async () => undefined;
    controller.observations.getDeploymentsMetrics = async () => ({ api: pods });
    controller.observations.getClusterTopology = async () =>
      ['node-a', 'node-b', 'source'].map((node, i) => ({
        node,
        region: 'region',
        zone: `zone-${i}`,
      }));
    controller.prometheus.getNodesLatency = async () => [
      { from: 'source', to: 'node-a', latency: 1 },
      { from: 'source', to: 'node-b', latency: 2 },
    ];
    controller.prometheus.getResponseTimeByNodeDeployment = async () =>
      pods.map((p) => ({
        node: p.node,
        responseTime: 20,
        deployment: 'api',
        namespace: 'shop',
      }));
    controller.prometheus.getDownstreamPodGraph = async () => [];
    controller.prometheus.getUpstreamPodGraph = async () => [
      {
        node: 'source',
        destinations: [
          {
            destination_workload: 'api',
            destination_service_namespace: 'shop',
            destination_service_name: 'api',
            rps: 10,
          },
        ],
      },
    ];
    const applied = [];
    controller.kubernetes.apply = async (decision) => {
      applied.push(decision);
    };
    await controller.journal.accept({ ...event(), desiredReplicas: 99 });
    await controller.work();
    assert.equal(applied.length, 1);
    assert.equal(runtime.counters.failures_total, 0);
    assert.equal(
      Object.values(applied[0].desired[0].to).reduce((a, b) => a + b, 0),
      100,
    );
    assert.deepEqual(
      (await db.pool.query('SELECT status FROM optibalancer.jobs')).rows.map((r) => r.status),
      ['done'],
    );
    await controller.journal.accept({ ...event(), desiredReplicas: 1 });
    await controller.journal.accept({
      ...event(),
      workload: { kind: 'Deployment', name: 'api', uid: 'deleted-uid' },
    });
    await controller.work();
    assert.equal(applied.length, 1, 'stale events cannot bypass the routing adjustment deadline');
    assert.equal(
      (await db.pool.query('SELECT count(*)::int AS n FROM optiscaler.operations')).rows[0].n,
      0,
    );
  } finally {
    await db.sql.close();
  }
});

test('database runtime roles cannot read the other service journal', async () => {
  const db = await database();
  try {
    await db.sql.exec(
      'CREATE ROLE test_scaler; REVOKE ALL ON SCHEMA optiscaler,optibalancer FROM PUBLIC; GRANT USAGE ON SCHEMA optiscaler TO test_scaler; GRANT SELECT ON ALL TABLES IN SCHEMA optiscaler TO test_scaler; SET ROLE test_scaler;',
    );
    await db.pool.query('SELECT * FROM optiscaler.operations');
    await assert.rejects(
      () => db.pool.query('SELECT * FROM optibalancer.inbox'),
      /permission denied/,
    );
  } finally {
    await db.sql.close();
  }
});
