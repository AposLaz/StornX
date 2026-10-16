// Run once with broker operator credentials; app identities only use existing topology.
import amqp from 'amqplib';
import { readFileSync } from 'node:fs';

const cluster = process.env.CLUSTER_ID;

if (!cluster || !/^[a-zA-Z0-9_-]{1,128}$/.test(cluster)) {
  throw new Error('Valid CLUSTER_ID required');
}

if (!process.env.BROKER_ADMIN_URL) {
  throw new Error('BROKER_ADMIN_URL required');
}

const connection = await amqp.connect(
  process.env.BROKER_ADMIN_URL,
  process.env.RABBITMQ_CA
    ? { ca: [readFileSync(process.env.RABBITMQ_CA)], rejectUnauthorized: true }
    : {},
);

try {
  const channel = await connection.createChannel();
  const exchange = 'stornx.workloads';
  const route = `${cluster}.workload.changed.v1`;
  const queue = `stornx.${cluster}.optibalancer`;

  await channel.assertExchange(exchange, 'topic', { durable: true });
  await channel.assertExchange('stornx.dead-letter', 'direct', {
    durable: true,
  });
  await channel.assertQueue(`${queue}.dead`, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-quorum-initial-group-size': 3,
      'x-delivery-limit': -1,
      'x-max-length-bytes': 268435456,
      'x-overflow': 'reject-publish',
    },
  });
  await channel.bindQueue(`${queue}.dead`, 'stornx.dead-letter', queue);
  await channel.assertQueue(queue, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-quorum-initial-group-size': 3,
      'x-max-length-bytes': 268435456,
      'x-overflow': 'reject-publish',
      'x-dead-letter-strategy': 'at-least-once',
      'x-dead-letter-exchange': 'stornx.dead-letter',
      'x-dead-letter-routing-key': queue,
    },
  });
  await channel.bindQueue(queue, exchange, route);

  for (const seconds of [5, 30, 120]) {
    const name = `${queue}.retry.${seconds}`;

    await channel.assertQueue(name, {
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-quorum-initial-group-size': 3,
        'x-max-length-bytes': 268435456,
        'x-message-ttl': seconds * 1000,
        'x-overflow': 'reject-publish',
        'x-dead-letter-strategy': 'at-least-once',
        'x-dead-letter-exchange': exchange,
        'x-dead-letter-routing-key': route,
      },
    });
    await channel.bindQueue(name, exchange, `${route}.retry.${seconds}`);
  }

  console.log(`Provisioned workload topology for ${cluster}`);
} finally {
  await connection.close();
}
