export type ServiceName = 'optiscaler' | 'optibalancer';

/** Read an integer setting and reject values outside its minimum bound. */
export function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, min = 1): number {
  const value = Number(env[key] ?? fallback);

  if (!Number.isSafeInteger(value) || value < min) {
    throw new Error(`${key} must be an integer >= ${min}`);
  }

  return value;
}

/** Accept only explicit true/false values so invalid input cannot accidentally enable mutations. */
export function boolean(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const value = env[key];

  if (value === undefined) {
    return fallback;
  }

  if (value !== 'true' && value !== 'false') {
    throw new Error(`${key} must be true or false`);
  }

  return value === 'true';
}

/** Validate shared configuration before opening connections or starting controller work. */
export function settings(service: ServiceName, env = process.env) {
  const required = (key: string): string => {
    const value = env[key]?.trim();

    if (!value) {
      throw new Error(`${key} is required`);
    }

    return value;
  };

  // Production credentials must use verified transports; development can use local dependencies.
  const databaseUrl = required('DATABASE_URL');
  const rabbitmqUrl = required('RABBITMQ_URL');
  const databaseAddress = new URL(databaseUrl);

  if (!['postgres:', 'postgresql:'].includes(databaseAddress.protocol)) {
    throw new Error('Invalid database URL');
  }

  const production = env.ENV !== 'development';

  if (
    production &&
    databaseAddress.searchParams.has('sslmode') &&
    databaseAddress.searchParams.get('sslmode') !== 'verify-full'
  ) {
    throw new Error('Production requires verified database TLS');
  }

  const brokerAddress = new URL(rabbitmqUrl);

  if (!['amqp:', 'amqps:'].includes(brokerAddress.protocol)) {
    throw new Error('Invalid broker URL');
  }

  if (production && brokerAddress.protocol !== 'amqps:') {
    throw new Error('Production requires AMQPS');
  }

  const namespaces = required('NAMESPACES')
    .split(',')
    .map((s) => s.trim());

  if (namespaces.some((s) => !s || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(s))) {
    throw new Error('Invalid namespaces');
  }

  const cpu = Number(env.CPU_WEIGHT ?? 50);
  const memory = Number(env.MEMORY_WEIGHT ?? 50);

  if (
    !Number.isFinite(cpu) ||
    !Number.isFinite(memory) ||
    cpu < 0 ||
    memory < 0 ||
    Math.abs(cpu + memory - 100) > 0.001
  ) {
    throw new Error('CPU_WEIGHT and MEMORY_WEIGHT must sum to 100');
  }

  if (!['cpu', 'memory', 'cpu-memory'].includes(env.METRICS_TYPE ?? 'memory')) {
    throw new Error('Invalid METRICS_TYPE');
  }

  const prometheusUrl = required('PROMETHEUS_URL');

  if (!['http:', 'https:'].includes(new URL(prometheusUrl).protocol)) {
    throw new Error('Invalid Prometheus URL');
  }

  const intervalMs = integer(env, 'INTERVAL_SECONDS', 300) * 1000;

  integer(env, 'MAX_METRIC_AGE_SECONDS', 600);

  // Validate identity separately so returned settings remain a plain, readable data object.
  const clusterId = required('CLUSTER_ID');

  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(clusterId)) {
    throw new Error('CLUSTER_ID must contain letters, digits, underscores or hyphens');
  }

  return {
    service,
    production,
    databaseUrl,
    rabbitmqUrl,
    prometheusUrl,
    namespaces,
    intervalMs,
    clusterId,
    port: integer(env, 'APP_PORT', 3000),
    leaseNamespace: env.POD_NAMESPACE ?? 'stornx',
    leaseName: `stornx-${service}`,
    dryRun: boolean(env, 'DRY_RUN', true),
    mutationsEnabled: boolean(env, 'MUTATIONS_ENABLED', false),
    dbTls: production,
    dbCa: env.DATABASE_CA,
    brokerCa: env.RABBITMQ_CA,
    maxAttempts: integer(env, 'MAX_ATTEMPTS', 12),
  };
}

export type Settings = ReturnType<typeof settings>;
