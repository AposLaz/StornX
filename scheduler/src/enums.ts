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

export enum SetupFolderFiles {
  DEFAULT_PATH = '/opt/data', // TODO add the app path
  DEPLOYS_PATH = 'deploys',
  QUEUE_PATH = 'queue',
  DEPLOYS_FILE = 'deploys.json',
}

export enum SemaphoreConcLimits {
  MAX_CONCURRENCY = 20,
}

export enum MetricsType {
  CPU = 'cpu',
  MEMORY = 'memory',
  CPU_MEMORY = 'cpu-memory',
}
