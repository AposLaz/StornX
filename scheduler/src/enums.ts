export enum ThresholdValues {}

export enum TaintEffects {
  NO_SCHEDULE = 'NoSchedule',
  NO_EXECUTE = 'NoExecute',
  PREFER_NO_SCHEDULE = 'PreferNoSchedule',
}

export enum Operators {
  EQUAL = 'Equal',
  EXISTS = 'Exists',
}

// Data storage paths - can be overridden via DATA_PATH environment variable
const DATA_BASE_PATH = process.env.DATA_PATH ?? '/opt/data';

export const SetupFolderFiles = {
  DEFAULT_PATH: DATA_BASE_PATH,
  DEPLOYS_PATH: 'deploys',
  QUEUE_PATH: 'queue',
  DEPLOYS_FILE: 'deploys.json',
} as const;

export enum SemaphoreConcLimits {
  MAX_CONCURRENCY = 20,
}

export enum MetricsType {
  CPU = 'cpu',
  MEMORY = 'memory',
  CPU_MEMORY = 'cpu-memory',
}
