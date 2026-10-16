import test from 'node:test';
import assert from 'node:assert/strict';
import { Broker } from '@stornx/platform/broker.js';
const event = {
  type: 'workload.changed.v1',
  schemaVersion: 1,
  id: 'event-a',
  occurredAt: '2026-10-15T12:00:00Z',
  producer: 'hpa-observer',
  correlationId: 'trace-a',
  clusterId: 'test',
  namespace: 'shop',
  workload: { kind: 'Deployment', name: 'api', uid: 'uid-a' },
  reason: 'serving-topology-changed',
};
function fixture(value = event) {
  const broker = new Broker({
      clusterId: 'test',
      namespaces: ['shop'],
      maxAttempts: 3,
    }),
    calls = [];
  const channel = {
    ack: () => calls.push('ack'),
    nack: (_msg, _all, requeue) => calls.push(`nack:${requeue}`),
    reject: (_msg, requeue) => calls.push(`reject:${requeue}`),
    async close() {
      calls.push('close');
    },
  };
  const message = {
    content: Buffer.from(JSON.stringify(value)),
    properties: { headers: {} },
  };
  return { broker, channel, message, calls };
}
test('broker acknowledgement waits until durable acceptance completes', async () => {
  const f = fixture();
  let commit;
  const transaction = new Promise((resolve) => {
    commit = resolve;
  });
  const delivery = f.broker.receive(
    f.channel,
    f.message,
    async () => {
      await transaction;
    },
    () => true,
  );
  assert.deepEqual(f.calls, []);
  commit();
  await delivery;
  assert.deepEqual(f.calls, ['ack']);
});
test('failed acceptance is acknowledged only after confirmed delayed retry publication', async () => {
  const f = fixture();
  f.broker.send = async (_body, route, headers) => {
    assert.equal(headers['stornx-attempt'], 1);
    assert.match(route, /retry\.5$/);
    f.calls.push('confirmed-retry');
  };
  await f.broker.receive(
    f.channel,
    f.message,
    async () => {
      throw new Error('Database unavailable');
    },
    () => true,
  );
  assert.deepEqual(f.calls, ['confirmed-retry', 'ack']);
});
test('a failed retry publish closes the channel without acknowledging the original', async () => {
  const f = fixture();
  f.broker.send = async () => {
    throw new Error('Broker unavailable');
  };
  await f.broker.receive(
    f.channel,
    f.message,
    async () => {
      throw new Error('Database unavailable');
    },
    () => true,
  );
  assert.deepEqual(f.calls, ['close']);
});
test('malformed and out-of-scope events are dead-lettered without invoking service code', async () => {
  for (const value of [
    { ...event, schemaVersion: 2 },
    { ...event, clusterId: 'other' },
    { ...event, namespace: 'other' },
    { ...event, command: 'patch' },
  ]) {
    const f = fixture(value);
    let accepted = false;
    await f.broker.receive(
      f.channel,
      f.message,
      async () => {
        accepted = true;
      },
      () => true,
    );
    assert.equal(accepted, false);
    assert.deepEqual(f.calls, ['reject:false']);
  }
});
test('standby consumers requeue delivery and exhausted retries go to the dead-letter queue', async () => {
  const standby = fixture();
  await standby.broker.receive(
    standby.channel,
    standby.message,
    async () => {},
    () => false,
  );
  assert.deepEqual(standby.calls, ['nack:true']);
  const exhausted = fixture();
  exhausted.message.properties.headers['stornx-attempt'] = 2;
  await exhausted.broker.receive(
    exhausted.channel,
    exhausted.message,
    async () => {
      throw new Error('Still unavailable');
    },
    () => true,
  );
  assert.deepEqual(exhausted.calls, ['reject:false']);
});
