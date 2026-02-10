import { CooldownManager, getCooldownManager, resetCooldownManager } from '../../src/core/optiScaler/cooldown';

describe('CooldownManager', () => {
  let cooldownManager: CooldownManager;

  beforeEach(() => {
    // Use a short cooldown for testing (5 seconds)
    cooldownManager = new CooldownManager(5);
  });

  afterEach(() => {
    resetCooldownManager();
  });

  describe('isInCooldown', () => {
    it('should return false when no scaling has occurred', () => {
      expect(cooldownManager.isInCooldown('frontend', 'default')).toBe(false);
    });

    it('should return true immediately after scaling', () => {
      cooldownManager.recordScaling('frontend', 'default', 'up');
      expect(cooldownManager.isInCooldown('frontend', 'default')).toBe(true);
    });

    it('should return false after cooldown period expires', async () => {
      // Use 1-second cooldown for faster test
      const shortCooldown = new CooldownManager(1);
      shortCooldown.recordScaling('frontend', 'default', 'up');

      expect(shortCooldown.isInCooldown('frontend', 'default')).toBe(true);

      // Wait for cooldown to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(shortCooldown.isInCooldown('frontend', 'default')).toBe(false);
    });

    it('should track different deployments independently', () => {
      cooldownManager.recordScaling('frontend', 'default', 'up');
      cooldownManager.recordScaling('backend', 'default', 'down');

      expect(cooldownManager.isInCooldown('frontend', 'default')).toBe(true);
      expect(cooldownManager.isInCooldown('backend', 'default')).toBe(true);
      expect(cooldownManager.isInCooldown('other', 'default')).toBe(false);
    });

    it('should track same deployment in different namespaces independently', () => {
      cooldownManager.recordScaling('frontend', 'production', 'up');

      expect(cooldownManager.isInCooldown('frontend', 'production')).toBe(true);
      expect(cooldownManager.isInCooldown('frontend', 'staging')).toBe(false);
    });
  });

  describe('recordScaling', () => {
    it('should record scale up action', () => {
      cooldownManager.recordScaling('frontend', 'default', 'up');
      const lastAction = cooldownManager.getLastAction('frontend', 'default');

      expect(lastAction).not.toBeNull();
      expect(lastAction?.lastAction).toBe('up');
    });

    it('should record scale down action', () => {
      cooldownManager.recordScaling('frontend', 'default', 'down');
      const lastAction = cooldownManager.getLastAction('frontend', 'default');

      expect(lastAction).not.toBeNull();
      expect(lastAction?.lastAction).toBe('down');
    });

    it('should update timestamp on repeated scaling', async () => {
      cooldownManager.recordScaling('frontend', 'default', 'up');
      const firstAction = cooldownManager.getLastAction('frontend', 'default');

      await new Promise((resolve) => setTimeout(resolve, 100));

      cooldownManager.recordScaling('frontend', 'default', 'down');
      const secondAction = cooldownManager.getLastAction('frontend', 'default');

      expect(secondAction?.lastScaleTime).toBeGreaterThan(firstAction!.lastScaleTime);
      expect(secondAction?.lastAction).toBe('down');
    });
  });

  describe('getRemainingCooldown', () => {
    it('should return 0 when no scaling has occurred', () => {
      expect(cooldownManager.getRemainingCooldown('frontend', 'default')).toBe(0);
    });

    it('should return remaining time after scaling', () => {
      cooldownManager.recordScaling('frontend', 'default', 'up');
      const remaining = cooldownManager.getRemainingCooldown('frontend', 'default');

      // Should be close to 5 seconds (our cooldown period)
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(5);
    });

    it('should return 0 after cooldown expires', async () => {
      const shortCooldown = new CooldownManager(1);
      shortCooldown.recordScaling('frontend', 'default', 'up');

      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(shortCooldown.getRemainingCooldown('frontend', 'default')).toBe(0);
    });
  });

  describe('clearCooldown', () => {
    it('should clear cooldown for specific deployment', () => {
      cooldownManager.recordScaling('frontend', 'default', 'up');
      cooldownManager.recordScaling('backend', 'default', 'up');

      cooldownManager.clearCooldown('frontend', 'default');

      expect(cooldownManager.isInCooldown('frontend', 'default')).toBe(false);
      expect(cooldownManager.isInCooldown('backend', 'default')).toBe(true);
    });
  });

  describe('clearAll', () => {
    it('should clear all cooldowns', () => {
      cooldownManager.recordScaling('frontend', 'default', 'up');
      cooldownManager.recordScaling('backend', 'default', 'up');
      cooldownManager.recordScaling('api', 'production', 'down');

      cooldownManager.clearAll();

      expect(cooldownManager.isInCooldown('frontend', 'default')).toBe(false);
      expect(cooldownManager.isInCooldown('backend', 'default')).toBe(false);
      expect(cooldownManager.isInCooldown('api', 'production')).toBe(false);
    });
  });

  describe('getCooldownPeriod', () => {
    it('should return configured cooldown period', () => {
      expect(cooldownManager.getCooldownPeriod()).toBe(5);

      const longCooldown = new CooldownManager(120);
      expect(longCooldown.getCooldownPeriod()).toBe(120);
    });
  });

  describe('Global singleton', () => {
    it('should return same instance on subsequent calls', () => {
      resetCooldownManager();
      const first = getCooldownManager(60);
      const second = getCooldownManager(120); // Different value should be ignored

      expect(first).toBe(second);
      expect(first.getCooldownPeriod()).toBe(60);
    });

    it('should create new instance after reset', () => {
      const first = getCooldownManager(60);
      first.recordScaling('test', 'default', 'up');

      resetCooldownManager();

      const second = getCooldownManager(30);
      expect(second.getCooldownPeriod()).toBe(30);
      expect(second.isInCooldown('test', 'default')).toBe(false);
    });
  });
});
