import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import amqp from 'amqplib';
import { Broker } from '@stornx/platform/broker.js';
import { Database } from '@stornx/platform/database.js';
import {
  ScalerJournal,
  migration as scalerMigration,
} from '../../services/optiscaler/dist/journal.js';
import {
  BalancerJournal,
  migration as balancerMigration,
} from '../../services/optibalancer/dist/journal.js';
if (!process.env.TEST_DATABASE_URL || !process.env.TEST_RABBITMQ_URL)
  throw new Error('Set TEST_DATABASE_URL and TEST_RABBITMQ_URL to disposable test dependencies');
const config = {
  databaseUrl: process.env.TEST_DATABASE_URL,
  rabbitmqUrl: process.env.TEST_RABBITMQ_URL,
  dbTls: false,
  clusterId: process.env.CLUSTER_ID ?? 'integration',
  namespaces: ['shop'],
  maxAttempts: 3,
};
const event = () => ({
  type: 'workload.changed.v1',
  schemaVersion: 1,
  id: randomUUID(),
  occurredAt: new Date().toISOString(),
  producer: 'hpa-observer',
  correlationId: randomUUID(),
  clusterId: config.clusterId,
  namespace: 'shop',
  workload: { kind: 'Deployment', name: 'api', uid: randomUUID() },
  reason: 'serving-topology-changed',
});
async function until(check) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Timed out waiting for integration result');
}
test(
  'real PostgreSQL and RabbitMQ: HPA events, duplicate delivery, reconnect and dead lettering',
  { timeout: 60000 },
  async () => {
    const db = new Database(config),
      broker = new Broker(config),
      admin = await amqp.connect(config.rabbitmqUrl),
      channel = await admin.createChannel();
    try {
      await db.transaction((tx) => tx.query(scalerMigration));
      await db.transaction((tx) => tx.query(balancerMigration));
      const journal = new BalancerJournal(db),
        e = event();
      await broker.consume(
        (value) => journal.accept(value),
        () => true,
      );
      await broker.publish(e);
      await broker.publish(e);
      await until(
        async () =>
          Number(
            (
              await db.pool.query('SELECT count(*) AS n FROM optibalancer.inbox WHERE id=$1', [
                e.id,
              ])
            ).rows[0].n,
          ) === 1,
      );
      const job = (
        await db.pool.query('SELECT revision FROM optibalancer.jobs WHERE uid=$1', [e.workload.uid])
      ).rows[0];
      assert.equal(job.revision, 1);
      await broker.close();
      await broker.ensure();
      const next = event();
      await broker.consume(
        (value) => journal.accept(value),
        () => true,
      );
      await broker.publish(next);
      await until(
        async () =>
          (await db.pool.query('SELECT 1 FROM optibalancer.inbox WHERE id=$1', [next.id]))
            .rowCount === 1,
      );
      await broker.send(Buffer.from(JSON.stringify({ ...event(), schemaVersion: 999 })));
      await until(async () => (await channel.checkQueue(`${broker.queue}.dead`)).messageCount > 0);
      await assert.rejects(
        () => broker.send(Buffer.from('{}'), 'unbound.workload.key'),
        /unroutable/,
      );
    } finally {
      await broker.close();
      await channel.close();
      await admin.close();
      await db.pool.end();
    }
  },
);
test(
  'real PostgreSQL: advisory lock excludes another replica and failed commit leaves operation pending',
  { timeout: 30000 },
  async () => {
    const db = new Database(config),
      other = new Database(config);
    try {
      const key = `lock-test:${randomUUID()}`;
      await db.lock(key, async () => {
        assert.equal(await other.lock(key, async () => true), undefined);
      });
      const journal = new ScalerJournal(db),
        id = randomUUID(),
        uid = randomUUID();
      await db.transaction((tx) => tx.query(scalerMigration));
      await db.transaction((tx) =>
        journal.create(tx, {
          id,
          cluster_id: config.clusterId,
          namespace: 'shop',
          name: 'api',
          uid,
          original: 2,
          target: 3,
          generation: 1,
          candidate: null,
          status: 'pending',
          input: {},
        }),
      );
      await assert.rejects(() =>
        db.transaction(async (tx) => {
          await tx.query("UPDATE optiscaler.operations SET status='applied' WHERE id=$1", [id]);
          throw new Error('Crash before commit');
        }),
      );
      assert.equal(
        (await db.pool.query('SELECT status FROM optiscaler.operations WHERE id=$1', [id])).rows[0]
          .status,
        'pending',
      );
    } finally {
      await other.pool.end();
      await db.pool.end();
    }
  },
);
