import * as dotenv from 'dotenv';

import { MetricsType } from '../enums.js';

dotenv.config();

// required environment variables
const requiredEnvVariables: Array<string> = [
  'ENV',
  'APP_PORT',
  'CRONJOB_EXPRESSION',
  'PROMETHEUS_URL',
  'NAMESPACES',
  'METRICS_TYPE',
  'METRICS_UPPER_THRESHOLD',
  'METRICS_LOWER_THRESHOLD',
];

requiredEnvVariables.forEach((envVarName: string) => {
  if (!process.env[envVarName]) {
    console.log(`Environment variable ${envVarName} is missing`);
  }
});

export const Config = {
  ENV: process.env.ENV ?? 'production',
  APP_PORT: process.env.APP_PORT ?? '3000',
  NAMESPACES: process.env.NAMESPACES?.split(',') ?? ['default'], // default is the default namespace
  CRONJOB_EXPRESSION: process.env.CRONJOB_EXPRESSION ?? '* * * * *',
  LOCALITY_LABELS_CRON: process.env.LOCALITY_LABELS_CRON ?? '* * * * *',
  metrics: {
    upperThreshold: process.env.METRICS_UPPER_THRESHOLD ? Number(process.env.METRICS_UPPER_THRESHOLD) / 100 : 0.8,
    lowerThreshold: process.env.METRICS_LOWER_THRESHOLD ? Number(process.env.METRICS_LOWER_THRESHOLD) / 100 : 0.2,
    type: (process.env.METRICS_TYPE as MetricsType) ?? MetricsType.MEMORY,
    weights: {
      CPU: process.env.CPU_WEIGHT ? Number(process.env.CPU_WEIGHT) : 0.5,
      Memory: process.env.MEMORY_WEIGHT ? Number(process.env.MEMORY_WEIGHT) : 0.5,
    },
  },
  prometheusUrl: process.env.PROMETHEUS_URL ?? 'http://prometheus.prometheus.svc.cluster.local:9090',
  // OptiBalancer settings
  balancer: {
    /** Minimum L1 distance delta to trigger a DestinationRule update */
    minDeltaThreshold: process.env.BALANCER_MIN_DELTA ? Number(process.env.BALANCER_MIN_DELTA) : 10,
    /** Step size for gradual traffic shift */
    stepSize: process.env.BALANCER_STEP_SIZE ? Number(process.env.BALANCER_STEP_SIZE) : 5,
    /** Epsilon for convergence */
    epsilon: process.env.BALANCER_EPSILON ? Number(process.env.BALANCER_EPSILON) : 1,
  },
  // Fault tolerance settings
  faultTolerance: {
    /** Maximum number of zones to distribute replicas across for fault tolerance */
    maxZones: process.env.FT_MAX_ZONES ? Number(process.env.FT_MAX_ZONES) : 3,
  },
};
