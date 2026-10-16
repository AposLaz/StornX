import test from 'node:test';
import assert from 'node:assert/strict';
import { ScalerController } from '../services/optiscaler/dist/controller.js';
import { ScalerKubernetes } from '../services/optiscaler/dist/kubernetes.js';
import { BalancerController } from '../services/optibalancer/dist/controller.js';
import { BalancerKubernetes } from '../services/optibalancer/dist/kubernetes.js';
import { Runtime } from '@stornx/platform/runtime.js';
function runtime() {
  return {
    db: { async assertLocks() {} },
    api: {},
    config: {
      clusterId: 'test',
      namespaces: ['shop'],
      dryRun: false,
      mutationsEnabled: true,
      intervalMs: 300000,
    },
    leader: { assert() {} },
    assertMutation() {},
    counters: { failures_total: 0 },
    gauges: {},
  };
}
const operation = {
  id: 'op-a',
  cluster_id: 'test',
  namespace: 'shop',
  name: 'api',
  uid: 'uid-a',
  original: 3,
  target: 4,
  generation: 2,
  candidate: 'node-a',
};
const deployment = {
  metadata: { uid: 'uid-a', generation: 2, resourceVersion: 'rv' },
  spec: { replicas: 3 },
};
test('taints are cleaned when scaling fails after placement started', async () => {
  const controller = new ScalerController(runtime()),
    calls = [];
  controller.kubernetes.read = async () => deployment;
  controller.kubernetes.guard = async () => deployment;
  controller.kubernetes.taint = async () => {
    calls.push('taint');
  };
  controller.kubernetes.scale = async () => {
    throw new Error('Scale API unavailable');
  };
  controller.kubernetes.cleanup = async (id) => {
    calls.push(`cleanup:${id}`);
  };
  controller.journal.error = async () => {};
  await assert.rejects(() => controller.execute(operation), /unavailable/);
  assert.deepEqual(calls, ['taint', 'cleanup:op-a']);
});
test('recovery does not scale a recreated Deployment', async () => {
  const controller = new ScalerController(runtime());
  let writes = 0,
    finished;
  controller.kubernetes.read = async () => ({
    ...deployment,
    metadata: { ...deployment.metadata, uid: 'new-uid' },
  });
  controller.kubernetes.scale = async () => {
    writes++;
  };
  controller.journal.finish = async (_op, status) => {
    finished = status;
  };
  await controller.execute(operation);
  assert.equal(writes, 0);
  assert.equal(finished, 'superseded');
});
test('failed HPA/policy reads block the scaling path before any write', async () => {
  const r = runtime();
  let writes = 0;
  r.api = {
    apps: {
      async readNamespacedDeployment() {
        return deployment;
      },
      async patchNamespacedDeploymentScale() {
        writes++;
      },
    },
    autoscaling: {
      async listNamespacedHorizontalPodAutoscaler() {
        throw new Error('HPA permissions denied');
      },
    },
    policy: {
      async listNamespacedPodDisruptionBudget() {
        return { items: [] };
      },
    },
  };
  const adapter = new ScalerKubernetes(r, 1, 100);
  await assert.rejects(() => adapter.guard('shop', 'api', 4), /permissions/);
  assert.equal(writes, 0);
});
test('cleanup preserves unrelated taints and another operation owner', async () => {
  const r = runtime();
  let patch;
  r.api = {
    core: {
      async listNode() {
        return {
          items: [
            {
              metadata: { name: 'node-a', resourceVersion: 'rv' },
              spec: {
                taints: [
                  { key: 'customer', value: 'keep', effect: 'NoSchedule' },
                  {
                    key: 'stornx.io/placement-operation',
                    value: 'op-a',
                    effect: 'NoSchedule',
                  },
                  {
                    key: 'stornx.io/placement-operation',
                    value: 'op-b',
                    effect: 'NoSchedule',
                  },
                ],
              },
            },
          ],
        };
      },
      async patchNode(request) {
        patch = request.body;
      },
    },
  };
  await new ScalerKubernetes(r, 1, 100).cleanup('op-a');
  assert.deepEqual(
    patch.spec.taints.map((t) => t.value),
    ['keep', 'op-b'],
  );
  assert.equal(patch.metadata.resourceVersion, 'rv');
});
test('dry-run, kill switch and leadership loss gate recovery mutations', () => {
  for (const config of [
    { dryRun: true, mutationsEnabled: true },
    { dryRun: false, mutationsEnabled: false },
  ])
    assert.throws(
      () =>
        Runtime.prototype.assertMutation.call({
          config,
          leader: { assert() {} },
          stopping: false,
        }),
      /disabled/,
    );
  assert.throws(
    () =>
      Runtime.prototype.assertMutation.call({
        config: { dryRun: false, mutationsEnabled: true },
        leader: {
          assert() {
            throw new Error('Leadership lost');
          },
        },
        stopping: false,
      }),
    /Leadership/,
  );
});
test('balancer refuses stale workload UIDs and not-ready endpoint state', async () => {
  const r = runtime();
  r.api = {
    apps: {
      async readNamespacedDeployment() {
        return { ...deployment, metadata: { uid: 'replacement' } };
      },
    },
  };
  assert.equal(await new BalancerKubernetes(r).workload('shop', 'api', 'uid-a'), undefined);
  const adapter = new BalancerKubernetes(r);
  adapter.workload = async () => deployment;
  r.api.discovery = {
    async listNamespacedEndpointSlice() {
      return {
        items: [
          {
            endpoints: [{ conditions: { ready: false }, addresses: ['10.1.0.1'] }],
          },
        ],
      };
    },
  };
  r.api.apps.listNamespacedReplicaSet = async () => ({ items: [] });
  r.api.core = {
    async listNamespacedPod() {
      return { items: [] };
    },
    async listNode() {
      return { items: [] };
    },
  };
  await assert.rejects(
    () => adapter.fingerprint('shop', 'api', 'uid-a', 'api'),
    /ready service endpoints/,
  );
});
test('periodic balancer scan relists current UIDs after interruption or workload replacement', async () => {
  const r = runtime();
  let uid = 'old',
    requests = [];
  r.api.apps = {
    async listNamespacedDeployment() {
      return {
        items: [
          {
            metadata: {
              name: 'api',
              uid,
              labels: { 'stornx.io/balancing': 'enabled' },
            },
          },
        ],
      };
    },
  };
  r.counters.cycles_total = 0;
  const controller = new BalancerController(r);
  controller.journal.request = async (job) => requests.push(job);
  await controller.scan();
  uid = 'new';
  await controller.scan();
  assert.deepEqual(
    requests.map((j) => j.uid),
    ['old', 'new'],
  );
});
