import { settings } from '@stornx/platform/settings.js';
import { Runtime } from '@stornx/platform/runtime.js';
import { logger } from '@stornx/platform/config/logger.js';
import { BalancerController } from './controller.js';

async function main() {
  const runtime = new Runtime(settings('optibalancer'));
  const controller = new BalancerController(runtime);

  await controller.journal.verify();
  await runtime.start();
  runtime.every(runtime.config.intervalMs, () => controller.scan());
  runtime.every(2000, async () => {
    await runtime.broker.consume(
      (event) => controller.journal.accept(event),
      () => runtime.leader.active,
    );
    await controller.work();
  });
}

main().catch((error) => {
  logger.error('OptiBalancer startup failed', { error: String(error) });
  process.exit(1);
});
