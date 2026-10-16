export const eventType = 'workload.changed.v1' as const;

/**
 * A provider-neutral notification to inspect current workload state, not execute a supplied
 * command.
 */
export interface WorkloadChanged {
  type: typeof eventType;
  schemaVersion: 1;
  id: string;
  occurredAt: string;
  producer: string;
  correlationId: string;
  clusterId: string;
  namespace: string;
  workload: { kind: 'Deployment'; name: string; uid: string };
  reason: 'replica-target-changed' | 'serving-topology-changed' | 'migration';
  desiredReplicas?: number;
  resourceVersion?: string;
}

/**
 * Validate untrusted broker data against the supported v1 contract.
 *
 * @param input - Decoded payload from any event producer.
 * @returns A detached copy so later caller mutations cannot alter the original payload.
 * @throws Error if the version, shape, values, or allowed fields do not match the contract.
 */
export function parseWorkloadChanged(input: unknown): WorkloadChanged {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Event must be an object');
  }

  const event = input as Record<string, unknown>;
  const allowedFields = [
    'type',
    'schemaVersion',
    'id',
    'occurredAt',
    'producer',
    'correlationId',
    'clusterId',
    'namespace',
    'workload',
    'reason',
    'desiredReplicas',
    'resourceVersion',
  ];

  if (Object.keys(event).some((key) => !allowedFields.includes(key))) {
    throw new Error('Unknown event field');
  }

  for (const key of ['id', 'producer', 'correlationId', 'clusterId', 'namespace', 'occurredAt']) {
    if (
      typeof event[key] !== 'string' ||
      !(event[key] as string).trim() ||
      (event[key] as string).length > 512
    ) {
      throw new Error(`Invalid ${key}`);
    }
  }

  if (event.type !== eventType || event.schemaVersion !== 1) {
    throw new Error('Unsupported event version');
  }

  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(event.occurredAt as string) ||
    !Number.isFinite(Date.parse(event.occurredAt as string))
  ) {
    throw new Error('Invalid timestamp');
  }

  const workload = event.workload as Record<string, unknown> | undefined;

  if (
    !workload ||
    workload.kind !== 'Deployment' ||
    Object.keys(workload).some((key) => !['kind', 'name', 'uid'].includes(key))
  ) {
    throw new Error('Invalid workload');
  }

  for (const key of ['name', 'uid']) {
    if (
      typeof workload[key] !== 'string' ||
      !workload[key] ||
      (workload[key] as string).length > 253
    ) {
      throw new Error(`Invalid workload ${key}`);
    }
  }

  if (
    !['replica-target-changed', 'serving-topology-changed', 'migration'].includes(
      event.reason as string,
    )
  ) {
    throw new Error('Invalid change reason');
  }

  if (
    event.desiredReplicas !== undefined &&
    (!Number.isSafeInteger(event.desiredReplicas) || Number(event.desiredReplicas) < 0)
  ) {
    throw new Error('Invalid replicas');
  }

  if (
    event.resourceVersion !== undefined &&
    (typeof event.resourceVersion !== 'string' || !event.resourceVersion)
  ) {
    throw new Error('Invalid resourceVersion');
  }

  return structuredClone(event) as unknown as WorkloadChanged;
}

/**
 * Identify a workload by cluster, namespace, and UID, including across name reuse.
 * Resource versions are deliberately excluded: they identify observations, not workloads.
 */
export const workloadKey = (
  event: Pick<WorkloadChanged, 'clusterId' | 'namespace' | 'workload'>,
): string => JSON.stringify([event.clusterId, event.namespace, event.workload.uid]);
