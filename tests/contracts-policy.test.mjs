import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkloadChanged, workloadKey } from '@stornx/event-contracts';
import { settings } from '@stornx/platform/settings.js';
import { assertPolicy, matches, recoveryAction } from '../services/optiscaler/dist/policy.js';
import { routingPatch, BalancerKubernetes } from '../services/optibalancer/dist/kubernetes.js';
const event = {
  type: 'workload.changed.v1',
  schemaVersion: 1,
  id: 'event-1',
  correlationId: 'trace-1',
  occurredAt: '2026-10-15T12:00:00Z',
  producer: 'hpa-observer',
  clusterId: 'test',
  namespace: 'shop',
  workload: { kind: 'Deployment', name: 'api', uid: 'uid-a' },
  reason: 'serving-topology-changed',
};
const deployment = () => ({
  metadata: {
    uid: 'uid-a',
    generation: 2,
    labels: { 'stornx.io/scaling': 'enabled' },
  },
  spec: {
    replicas: 3,
    template: { metadata: { labels: { app: 'api', tier: 'web' } } },
  },
  status: {
    observedGeneration: 2,
    readyReplicas: 3,
    availableReplicas: 3,
    updatedReplicas: 3,
  },
});
test('provider-neutral contract accepts a future HPA observer and isolates namespace/UID keys', () => {
  assert.deepEqual(parseWorkloadChanged(event), event);
  assert.notEqual(workloadKey(event), workloadKey({ ...event, namespace: 'other' }));
  assert.notEqual(
    workloadKey(event),
    workloadKey({ ...event, workload: { ...event.workload, uid: 'uid-new' } }),
  );
});
test('contract rejects executable fields, unknown versions, invalid timestamps and replicas', () => {
  for (const change of [
    { command: 'scale' },
    { schemaVersion: 2 },
    { occurredAt: 'yesterday' },
    { desiredReplicas: -1 },
    { desiredReplicas: 1.5 },
    { workload: { ...event.workload, kind: 'Pod' } },
  ])
    assert.throws(() => parseWorkloadChanged({ ...event, ...change }));
});
test('production rejects cleartext broker configuration and invalid policy input', () => {
  const env = {
    DATABASE_URL: 'postgres://user:password@db/stornx',
    RABBITMQ_URL: 'amqp://broker',
    NAMESPACES: 'shop',
    CLUSTER_ID: 'test',
    PROMETHEUS_URL: 'http://metrics',
  };
  assert.throws(() => settings('optiscaler', env), /AMQPS/);
  assert.equal(settings('optiscaler', { ...env, ENV: 'development' }).dryRun, true);
  assert.throws(
    () => settings('optiscaler', { ...env, ENV: 'development', CPU_WEIGHT: '500' }),
    /sum/,
  );
  assert.throws(
    () => settings('optiscaler', { ...env, ENV: 'development', DRY_RUN: 'no' }),
    /true or false/,
  );
});
test('scaling fails closed for HPA, missing opt-in, unavailable rollout and bounds', () => {
  assert.throws(() => assertPolicy(deployment(), 4, 1, 10, [], true), /HPA/);
  const d = deployment();
  delete d.metadata.labels;
  assert.throws(() => assertPolicy(d, 4, 1, 10, [], false), /opted/);
  assert.throws(
    () => assertPolicy({ ...deployment(), status: {} }, 4, 1, 10, [], false),
    /available/,
  );
  assert.throws(() => assertPolicy(deployment(), 0, 1, 10, [], false), /bounds/);
});
test('PDB selectors and percentage budgets use actual labels and healthy counts', () => {
  const selector = {
    matchLabels: { app: 'api' },
    matchExpressions: [{ key: 'tier', operator: 'In', values: ['web'] }],
  };
  assert.equal(matches(selector, { app: 'api', tier: 'web' }), true);
  assert.equal(matches(selector, { app: 'api', tier: 'worker' }), false);
  const pdb = {
    metadata: { generation: 1 },
    spec: { selector, minAvailable: '80%' },
    status: { observedGeneration: 1, expectedPods: 3, currentHealthy: 3 },
  };
  assert.throws(() => assertPolicy(deployment(), 2, 1, 10, [pdb], false), /budget/);
  assert.doesNotThrow(() =>
    assertPolicy(
      deployment(),
      2,
      1,
      10,
      [{ ...pdb, spec: { ...pdb.spec, minAvailable: 2 } }],
      false,
    ),
  );
});
test('scale recovery observes an already applied absolute target without incrementing again', () => {
  const op = { uid: 'uid-a', original: 3, target: 4, generation: 2 };
  assert.equal(recoveryAction(op, deployment()), 'apply');
  assert.equal(recoveryAction(op, { ...deployment(), spec: { replicas: 4 } }), 'complete');
  assert.equal(
    recoveryAction(op, {
      ...deployment(),
      metadata: { uid: 'replacement', generation: 2 },
    }),
    'superseded',
  );
  assert.equal(
    recoveryAction(op, {
      ...deployment(),
      metadata: { uid: 'uid-a', generation: 3 },
    }),
    'superseded',
  );
});
test('routing patch preserves customer policies by changing only owned fields', () => {
  const rule = {
    metadata: {
      name: 'api',
      namespace: 'shop',
      uid: 'route-1',
      resourceVersion: 'opaque-rv',
    },
    spec: {
      host: 'api',
      trafficPolicy: {
        tls: { mode: 'ISTIO_MUTUAL' },
        connectionPool: { tcp: { maxConnections: 99 } },
      },
      subsets: [{ name: 'canary' }],
    },
  };
  const patch = routingPatch(rule, {
    id: 'decision-1',
    desired: [{ from: 'r/z/a', to: { 'r/z/b': 100 } }],
  });
  assert.equal(patch.metadata.resourceVersion, 'opaque-rv');
  assert.deepEqual(Object.keys(patch.spec.trafficPolicy), ['loadBalancer']);
  assert.equal('subsets' in patch.spec, false);
  assert.equal(rule.spec.trafficPolicy.tls.mode, 'ISTIO_MUTUAL');
});
test('balancer rejects a concurrent routing edit before mutating Kubernetes', async () => {
  let called = false;
  const adapter = new BalancerKubernetes({
    db: { async assertLocks() {} },
    assertMutation() {},
    api: {
      custom: {
        patchNamespacedCustomObject() {
          called = true;
        },
      },
    },
  });
  await assert.rejects(
    () =>
      adapter.apply(
        {
          resource_uid: 'route-1',
          resource_version: 'old',
          namespace: 'shop',
          name: 'api',
        },
        {
          metadata: { uid: 'route-1', resourceVersion: 'new' },
          spec: { host: 'api' },
        },
      ),
    /changed/,
  );
  assert.equal(called, false);
});
