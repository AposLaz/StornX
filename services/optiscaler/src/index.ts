import { settings } from '@stornx/platform/settings.js';
import { Runtime } from '@stornx/platform/runtime.js';
import { logger } from '@stornx/platform/config/logger.js';
import { ScalerController } from './controller.js';

async function main() {
  const runtime = new Runtime(settings('optiscaler'));
  const controller = new ScalerController(runtime);

  await controller.journal.verify();
  await runtime.start();
  runtime.every(runtime.config.intervalMs, () => controller.cycle());
  runtime.every(3000, async () => {
    const rows = await runtime.db.pool.query(
      `
        SELECT
          count(*)::int AS count,
          COALESCE(EXTRACT(EPOCH FROM now() - min(o.created_at)), 0)::float AS age
        FROM optiscaler.outbox o
        JOIN optiscaler.operations p ON p.id = o.id
        WHERE o.published_at IS NULL
          AND p.cluster_id = $1
      `,
      [runtime.config.clusterId],
    );

    runtime.gauges.outbox_pending = rows.rows[0].count;
    runtime.gauges.outbox_oldest_seconds = rows.rows[0].age;

    const pending = await runtime.db.pool.query(
      `
        SELECT
          count(*)::int AS count,
          COALESCE(EXTRACT(EPOCH FROM now() - min(created_at)), 0)::float AS age
        FROM optiscaler.operations
        WHERE status = 'pending'
          AND cluster_id = $1
      `,
      [runtime.config.clusterId],
    );

    runtime.gauges.operations_pending = pending.rows[0].count;
    runtime.gauges.operations_oldest_seconds = pending.rows[0].age;
    await controller.journal.publish(runtime.config.clusterId, async (event) => {
      runtime.leader.assert();
      await runtime.broker.publish(event);
    });
  });
}

main().catch((error) => {
  logger.error('OptiScaler startup failed', { error: String(error) });
  process.exit(1);
});
