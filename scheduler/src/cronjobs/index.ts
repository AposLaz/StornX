import cron from 'node-cron';

import { KubernetesAdapterImpl } from '../adapters/k8s/index.js';
import { logger } from '../config/logger.js';
import { TrafficScheduler } from '../core/index.js';

let isRunning = false;
let jobInitialized = false;

export const CronInit = (timer: string) => {
  if (jobInitialized) {
    logger.warn('TrafficScheduler cron is already initialized. Skipping re-init.');
    return;
  }

  jobInitialized = true;

  cron.schedule(timer, async () => {
    if (isRunning) {
      logger.warn('Previous cron job is still running. Skipping this cycle.');
      return;
    }

    isRunning = true;
    try {
      logger.info('Starting TrafficScheduler cron job');
      const startDate = new Date();

      await TrafficScheduler();
      const endDate = new Date();

      logger.info(
        `************************* TIME DATE ****************************** ==========Finished TrafficScheduler cron job in ${endDate.getTime() - startDate.getTime()}ms`
      );
    } catch (error: unknown) {
      logger.error('Error running TrafficScheduler');
      logger.error(error as Error);
    } finally {
      isRunning = false;
    }
  });

  logger.info('TrafficScheduler cron initialized.');
};

export const AddLocalityLabelsToNodes = () => {
  cron.schedule('* * * * *', async () => {
    try {
      logger.info('Starting addLocalityLabelsToNodes cron job');
      const k8sAdapter = new KubernetesAdapterImpl();
      // do not block
      await k8sAdapter.addLocalityLabels();
      logger.info('Finished addLocalityLabelsToNodes cron job');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Error running addLocalityLabelsToNodes');
      logger.error(err);
    }
  });
};
