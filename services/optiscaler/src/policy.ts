import type { V1Deployment, V1LabelSelector, V1PodDisruptionBudget } from '@kubernetes/client-node';
import { optedIn, available } from '@stornx/platform/kube.js';

/** Evaluate PDB label selectors against the Deployment pod-template labels. */
export function matches(selector: V1LabelSelector, labels: Record<string, string>): boolean {
  if (!Object.entries(selector.matchLabels ?? {}).every(([k, v]) => labels[k] === v)) {
    return false;
  }

  return (selector.matchExpressions ?? []).every((e) => {
    const present = e.key in labels;
    const values = e.values ?? [];

    if (e.operator === 'In') {
      return present && values.includes(labels[e.key]);
    }

    if (e.operator === 'NotIn') {
      return !present || !values.includes(labels[e.key]);
    }

    if (e.operator === 'Exists') {
      return present;
    }

    if (e.operator === 'DoesNotExist') {
      return !present;
    }

    throw new Error('Unsupported PDB selector');
  });
}

/** Convert integer or percentage PDB values using Kubernetes-style rounding up. */
function percentage(value: number | string, total: number): number {
  if (typeof value === 'number') {
    return value;
  }

  if (!/^\d+%$/.test(value)) {
    throw new Error('Invalid PDB value');
  }

  return Math.ceil((Number(value.slice(0, -1)) * total) / 100);
}

/**
 * Require opt-in, exclusive scaling ownership, and availability before a replica change.
 * Scale-down also checks matching PDBs explicitly because replica changes bypass eviction.
 *
 * @param requireReady - Require a fully observed, available rollout; defaults to true.
 * @throws Error when ownership, policy bounds, readiness, or disruption budgets block the target.
 */
export function assertPolicy(
  deployment: V1Deployment,
  target: number,
  min: number,
  max: number,
  pdbs: V1PodDisruptionBudget[],
  hpa: boolean,
  requireReady = true,
): void {
  if (!optedIn(deployment, 'scaling')) {
    throw new Error('Workload has not opted in to scaling');
  }

  if (hpa) {
    throw new Error('HPA owns workload replicas');
  }

  if (deployment.metadata?.deletionTimestamp || deployment.spec?.paused) {
    throw new Error('Workload unavailable or paused');
  }

  if (target < min || target > max) {
    throw new Error('Replica target outside policy bounds');
  }

  if (requireReady && !available(deployment)) {
    throw new Error('Workload rollout is not available');
  }

  const current = deployment.spec?.replicas ?? 0;

  if (target >= current) {
    return;
  }

  for (const pdb of pdbs) {
    if (
      !pdb.spec?.selector ||
      !matches(pdb.spec.selector, deployment.spec?.template.metadata?.labels ?? {})
    ) {
      continue;
    }

    if ((pdb.status?.observedGeneration ?? 0) < (pdb.metadata?.generation ?? 0)) {
      throw new Error('PDB status not current');
    }

    // Percentage budgets refer to the current expected pod count. Re-evaluate on every operation.
    const expected = pdb.status?.expectedPods ?? current;
    const required =
      pdb.spec.minAvailable !== undefined
        ? percentage(pdb.spec.minAvailable, expected)
        : expected - percentage(pdb.spec.maxUnavailable ?? 0, expected);

    if (target < required || (pdb.status?.currentHealthy ?? 0) - (current - target) < required) {
      throw new Error('Scale-down violates availability budget');
    }
  }
}

/**
 * Compare a journaled absolute target with live state after an ambiguous API outcome.
 *
 * @returns "complete" when the target is already present, "apply" when original state still
 * matches, or "superseded" when workload identity or its decision basis has changed.
 */
export function recoveryAction(
  op: { uid: string; original: number; target: number; generation: number },
  deployment: V1Deployment,
): 'apply' | 'complete' | 'superseded' {
  if (deployment.metadata?.uid !== op.uid) {
    return 'superseded';
  }

  if (deployment.spec?.replicas === op.target) {
    return 'complete';
  }

  if (
    deployment.spec?.replicas !== op.original ||
    Number(deployment.metadata?.generation) !== Number(op.generation)
  ) {
    return 'superseded';
  }

  return 'apply';
}
