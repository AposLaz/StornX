import winston from 'winston';

export const logger = winston.createLogger({
  silent: process.env.NODE_ENV === 'test',
  level: process.env.LOG_LEVEL ?? 'info',
  defaultMeta: { service: process.env.SERVICE_NAME ?? 'stornx' },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});

export const loggerOperationInfo = (message: string): void => {
  logger.info(message);
};
