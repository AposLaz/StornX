import test from 'node:test';
import assert from 'node:assert/strict';
import { Leader } from '@stornx/platform/leader.js';
test('overlapping replicas elect one leader and API failure immediately disables mutations', async () => {
  let lease,
    down = false;
  const notFound = () => Object.assign(new Error('not found'), { code: 404 });
  const api = {
    coordination: {
      async readNamespacedLease() {
        if (down) throw new Error('API unavailable');
        if (!lease) throw notFound();
        return structuredClone(lease);
      },
      async createNamespacedLease({ body }) {
        if (lease) throw Object.assign(new Error('conflict'), { code: 409 });
        lease = {
          ...structuredClone(body),
          metadata: { ...body.metadata, resourceVersion: 'a' },
        };
      },
      async replaceNamespacedLease({ body }) {
        if (body.metadata.resourceVersion !== lease.metadata.resourceVersion)
          throw Object.assign(new Error('conflict'), { code: 409 });
        lease = structuredClone(body);
      },
    },
  };
  const config = { leaseName: 'test', leaseNamespace: 'stornx' },
    a = new Leader(api, config),
    b = new Leader(api, config);
  await a.tick();
  await b.tick();
  assert.equal(a.active, true);
  assert.equal(b.active, false);
  down = true;
  await assert.rejects(() => a.tick());
  assert.throws(() => a.assert(), /Leadership/);
  down = false;
  lease.spec.renewTime = new Date(Date.now() - 30000);
  await b.tick();
  assert.equal(b.active, true);
  b.stop();
  assert.throws(() => b.assert());
});
