import { Config as observations } from '@stornx/platform/config/config.js';

export const Config = {
  ...observations,
  metrics: {
    ...observations.metrics,
    responseTimeThreshold: Number(process.env.RESPONSE_TIME_THRESHOLD ?? 100),
  },
  balancer: {
    minDeltaThreshold: Number(process.env.BALANCER_MIN_DELTA ?? 5),
    minStepSize: Number(process.env.BALANCER_MIN_STEP_SIZE ?? 5),
    maxStepSize: Number(process.env.BALANCER_MAX_STEP_SIZE ?? 20),
    urgencyThreshold: Number(process.env.BALANCER_URGENCY_THRESHOLD ?? 50),
    epsilon: Number(process.env.BALANCER_EPSILON ?? 1),
  },
};
