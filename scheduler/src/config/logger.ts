import figlet from 'figlet';
import winston from 'winston';

export const logger: winston.Logger = winston.createLogger({
  transports: [new winston.transports.Console()],
  level: process.env.LOG_LEVEL ?? 'debug',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD hh:mm:ss.SSS A', // 2022-01-25 03:23:10.350 PM
    }),
    winston.format.align(),
    winston.format.colorize({
      all: true,
      colors: {
        info: 'green',
        debug: 'blue',
        error: 'red',
        warn: 'yellow',
      },
    }),
    winston.format.printf((info) => {
      // Extract timestamp, level, message, and the rest of the metadata
      const { timestamp, level, message, ...meta } = info;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const splat = (info[Symbol.for('splat')] as any[]) || [];

      // Combine child logger metadata and splat arguments
      const combinedMeta = { ...meta, ...splat[0] };

      // Convert metadata to prettified JSON if it exists
      const metaString = Object.keys(combinedMeta).length
        ? JSON.stringify(combinedMeta, null, 2) // Prettify with indentation
        : '';

      return `[${timestamp}] ${level}: ${message} ${metaString}`;
    })
  ),
});

export const loggerOperationInfo = (info: string) => {
  logger.info(
    `##############################################################################################################`
  );
  logger.info(info);
  logger.info(
    `##############################################################################################################`
  );
};

export const loggerStartApp = () => {
  console.log(
    figlet.textSync('TrafOptScheduler', {
      font: 'Standard',
      whitespaceBreak: true,
    })
  );

  console.log(`
============================================
 Environment: ${process.env.ENV ?? 'development'}
 Start Time  : ${new Date().toLocaleString()}
============================================
  `);
};
