/**
 * Cooldown manager for OptiScaler to prevent rapid scale up/down thrashing.
 *
 * Tracks the last scaling action time per deployment and enforces a minimum
 * cooldown period between scaling operations.
 */

import { logger } from '../../config/logger.js';

export type CooldownEntry = {
  lastScaleTime: number;
  lastAction: 'up' | 'down';
};

export class CooldownManager {
  private readonly cooldownMap: Map<string, CooldownEntry> = new Map();
  private readonly cooldownPeriodMs: number;
  private readonly loggerOperation = logger.child({ operation: 'CooldownManager' });

  /**
   * Create a new CooldownManager
   * @param cooldownPeriodSeconds - Cooldown period in seconds (default: 60)
   */
  constructor(cooldownPeriodSeconds: number = 60) {
    this.cooldownPeriodMs = cooldownPeriodSeconds * 1000;
  }

  /**
   * Generate a unique key for a deployment
   */
  private getKey(deployment: string, namespace: string): string {
    return `${namespace}/${deployment}`;
  }

  /**
   * Check if a deployment is in cooldown period
   * @param deployment - Name of the deployment
   * @param namespace - Namespace of the deployment
   * @returns true if cooldown is active (should NOT scale), false if scaling is allowed
   */
  isInCooldown(deployment: string, namespace: string): boolean {
    const key = this.getKey(deployment, namespace);
    const entry = this.cooldownMap.get(key);

    if (!entry) {
      return false;
    }

    const elapsed = Date.now() - entry.lastScaleTime;
    const inCooldown = elapsed < this.cooldownPeriodMs;

    if (inCooldown) {
      const remainingSeconds = Math.ceil((this.cooldownPeriodMs - elapsed) / 1000);
      this.loggerOperation.info(
        `Deployment "${deployment}" is in cooldown (${remainingSeconds}s remaining). Last action: ${entry.lastAction}`
      );
    }

    return inCooldown;
  }

  /**
   * Record a scaling action for a deployment
   * @param deployment - Name of the deployment
   * @param namespace - Namespace of the deployment
   * @param action - The scaling action performed ('up' or 'down')
   */
  recordScaling(deployment: string, namespace: string, action: 'up' | 'down'): void {
    const key = this.getKey(deployment, namespace);
    this.cooldownMap.set(key, {
      lastScaleTime: Date.now(),
      lastAction: action,
    });
    this.loggerOperation.debug(`Recorded scale ${action} for "${deployment}" in namespace "${namespace}"`);
  }

  /**
   * Get the remaining cooldown time for a deployment
   * @param deployment - Name of the deployment
   * @param namespace - Namespace of the deployment
   * @returns Remaining cooldown time in seconds, or 0 if not in cooldown
   */
  getRemainingCooldown(deployment: string, namespace: string): number {
    const key = this.getKey(deployment, namespace);
    const entry = this.cooldownMap.get(key);

    if (!entry) {
      return 0;
    }

    const elapsed = Date.now() - entry.lastScaleTime;
    const remaining = this.cooldownPeriodMs - elapsed;

    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  /**
   * Clear cooldown for a specific deployment (useful for testing or manual override)
   * @param deployment - Name of the deployment
   * @param namespace - Namespace of the deployment
   */
  clearCooldown(deployment: string, namespace: string): void {
    const key = this.getKey(deployment, namespace);
    this.cooldownMap.delete(key);
    this.loggerOperation.debug(`Cleared cooldown for "${deployment}" in namespace "${namespace}"`);
  }

  /**
   * Clear all cooldowns (useful for testing)
   */
  clearAll(): void {
    this.cooldownMap.clear();
    this.loggerOperation.debug('Cleared all cooldowns');
  }

  /**
   * Get the last scaling action for a deployment
   * @param deployment - Name of the deployment
   * @param namespace - Namespace of the deployment
   * @returns The last scaling action or null if none recorded
   */
  getLastAction(deployment: string, namespace: string): CooldownEntry | null {
    const key = this.getKey(deployment, namespace);
    return this.cooldownMap.get(key) ?? null;
  }

  /**
   * Get the configured cooldown period in seconds
   */
  getCooldownPeriod(): number {
    return this.cooldownPeriodMs / 1000;
  }

  /**
   * Clean up expired cooldown entries to prevent memory leaks.
   * Removes entries that are older than the cooldown period.
   * @returns Number of entries removed
   */
  cleanupExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cooldownMap.entries()) {
      const elapsed = now - entry.lastScaleTime;
      if (elapsed >= this.cooldownPeriodMs) {
        this.cooldownMap.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.loggerOperation.debug(`Cleaned up ${removed} expired cooldown entries`);
    }

    return removed;
  }

  /**
   * Get the current number of tracked deployments
   */
  getTrackedCount(): number {
    return this.cooldownMap.size;
  }
}

// Singleton instance for global cooldown tracking
let globalCooldownManager: CooldownManager | null = null;

/**
 * Get or create the global cooldown manager instance
 * @param cooldownPeriodSeconds - Cooldown period in seconds (only used on first call)
 */
export function getCooldownManager(cooldownPeriodSeconds?: number): CooldownManager {
  if (!globalCooldownManager) {
    globalCooldownManager = new CooldownManager(cooldownPeriodSeconds ?? 60);
  }
  return globalCooldownManager;
}

/**
 * Reset the global cooldown manager (useful for testing)
 */
export function resetCooldownManager(): void {
  globalCooldownManager = null;
}
