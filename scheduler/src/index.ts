import { app } from './app.js';
import { Config } from './config/config.js';
import { logger, loggerStartApp } from './config/logger.js';
import './config/setup.js';
import { AddLocalityLabelsToNodes, CronInit } from './cronjobs/index.js';

loggerStartApp();

const initRestApi = async () => {
  app.listen(Config.APP_PORT, () => {
    logger.info(`API is running in port: ${Config.APP_PORT}`);
  });
};

initRestApi().catch((error: unknown) => {
  const err = error as Error;
  logger.error(`Could not setup api: ${err.message}`);
});

CronInit(Config.CRONJOB_EXPRESSION);
AddLocalityLabelsToNodes();
