import { MetricsType } from '../enums.js';

// Observation settings only. Domain policies belong to the owning service.
export const Config = {
  CRONJOB_EXPRESSION: process.env.CRONJOB_EXPRESSION ?? '*/5 * * * *',
  prometheusUrl: process.env.PROMETHEUS_URL ?? 'http://prometheus:9090',
  metrics: {
    type: (process.env.METRICS_TYPE ?? 'memory') as MetricsType,
    weights: {
      CPU: Number(process.env.CPU_WEIGHT ?? 50) / 100,
      Memory: Number(process.env.MEMORY_WEIGHT ?? 50) / 100,
    },
  },
};
