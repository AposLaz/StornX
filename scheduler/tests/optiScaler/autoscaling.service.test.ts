import { jest } from '@jest/globals';

import { AutoscalingService } from '../../src/adapters/k8s/services/autoscaling.service';

import type * as k8s from '@kubernetes/client-node';

// Mock the logger
jest.mock('../../src/config/logger', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('AutoscalingService', () => {
  let autoscalingService: AutoscalingService;
  let mockAutoscalingClient: jest.Mocked<k8s.AutoscalingV2Api>;
  let mockPolicyClient: jest.Mocked<k8s.PolicyV1Api>;

  beforeEach(() => {
    mockAutoscalingClient = {
      listNamespacedHorizontalPodAutoscaler: jest.fn(),
    } as unknown as jest.Mocked<k8s.AutoscalingV2Api>;

    mockPolicyClient = {
      listNamespacedPodDisruptionBudget: jest.fn(),
    } as unknown as jest.Mocked<k8s.PolicyV1Api>;

    autoscalingService = new AutoscalingService(mockAutoscalingClient, mockPolicyClient);
  });

  describe('hasHPA', () => {
    it('should return true when HPA exists for deployment', async () => {
      const mockHPAs: k8s.V2HorizontalPodAutoscaler[] = [
        {
          metadata: { name: 'frontend-hpa', namespace: 'default' },
          spec: {
            scaleTargetRef: {
              kind: 'Deployment',
              name: 'frontend',
              apiVersion: 'apps/v1',
            },
            maxReplicas: 10,
          },
        },
      ];

      mockAutoscalingClient.listNamespacedHorizontalPodAutoscaler.mockResolvedValue({
        items: mockHPAs,
      } as k8s.V2HorizontalPodAutoscalerList);

      const result = await autoscalingService.hasHPA('frontend', 'default');
      expect(result).toBe(true);
      expect(mockAutoscalingClient.listNamespacedHorizontalPodAutoscaler).toHaveBeenCalledWith({
        namespace: 'default',
      });
    });

    it('should return false when no HPA exists for deployment', async () => {
      const mockHPAs: k8s.V2HorizontalPodAutoscaler[] = [
        {
          metadata: { name: 'backend-hpa', namespace: 'default' },
          spec: {
            scaleTargetRef: {
              kind: 'Deployment',
              name: 'backend', // Different deployment
              apiVersion: 'apps/v1',
            },
            maxReplicas: 10,
          },
        },
      ];

      mockAutoscalingClient.listNamespacedHorizontalPodAutoscaler.mockResolvedValue({
        items: mockHPAs,
      } as k8s.V2HorizontalPodAutoscalerList);

      const result = await autoscalingService.hasHPA('frontend', 'default');
      expect(result).toBe(false);
    });

    it('should return false when HPA list is empty', async () => {
      mockAutoscalingClient.listNamespacedHorizontalPodAutoscaler.mockResolvedValue({
        items: [],
      } as k8s.V2HorizontalPodAutoscalerList);

      const result = await autoscalingService.hasHPA('frontend', 'default');
      expect(result).toBe(false);
    });

    it('should return false and handle API errors gracefully', async () => {
      mockAutoscalingClient.listNamespacedHorizontalPodAutoscaler.mockRejectedValue(new Error('API connection failed'));

      const result = await autoscalingService.hasHPA('frontend', 'default');
      expect(result).toBe(false);
    });

    it('should match HPA targeting specific deployment among multiple HPAs', async () => {
      const mockHPAs: k8s.V2HorizontalPodAutoscaler[] = [
        {
          metadata: { name: 'backend-hpa' },
          spec: {
            scaleTargetRef: { kind: 'Deployment', name: 'backend', apiVersion: 'apps/v1' },
            maxReplicas: 5,
          },
        },
        {
          metadata: { name: 'frontend-hpa' },
          spec: {
            scaleTargetRef: { kind: 'Deployment', name: 'frontend', apiVersion: 'apps/v1' },
            maxReplicas: 10,
          },
        },
        {
          metadata: { name: 'api-hpa' },
          spec: {
            scaleTargetRef: { kind: 'Deployment', name: 'api', apiVersion: 'apps/v1' },
            maxReplicas: 8,
          },
        },
      ];

      mockAutoscalingClient.listNamespacedHorizontalPodAutoscaler.mockResolvedValue({
        items: mockHPAs,
      } as k8s.V2HorizontalPodAutoscalerList);

      expect(await autoscalingService.hasHPA('frontend', 'default')).toBe(true);
      expect(await autoscalingService.hasHPA('backend', 'default')).toBe(true);
      expect(await autoscalingService.hasHPA('database', 'default')).toBe(false);
    });
  });

  describe('getHPA', () => {
    it('should return HPA when found', async () => {
      const mockHPA: k8s.V2HorizontalPodAutoscaler = {
        metadata: { name: 'frontend-hpa', namespace: 'default' },
        spec: {
          scaleTargetRef: { kind: 'Deployment', name: 'frontend', apiVersion: 'apps/v1' },
          minReplicas: 2,
          maxReplicas: 10,
        },
      };

      mockAutoscalingClient.listNamespacedHorizontalPodAutoscaler.mockResolvedValue({
        items: [mockHPA],
      } as k8s.V2HorizontalPodAutoscalerList);

      const result = await autoscalingService.getHPA('frontend', 'default');
      expect(result).toEqual(mockHPA);
    });

    it('should return null when HPA not found', async () => {
      mockAutoscalingClient.listNamespacedHorizontalPodAutoscaler.mockResolvedValue({
        items: [],
      } as k8s.V2HorizontalPodAutoscalerList);

      const result = await autoscalingService.getHPA('frontend', 'default');
      expect(result).toBeNull();
    });

    it('should return null on API error', async () => {
      mockAutoscalingClient.listNamespacedHorizontalPodAutoscaler.mockRejectedValue(new Error('API error'));

      const result = await autoscalingService.getHPA('frontend', 'default');
      expect(result).toBeNull();
    });
  });

  describe('canScaleDown', () => {
    it('should return true when no PDB exists', async () => {
      mockPolicyClient.listNamespacedPodDisruptionBudget.mockResolvedValue({
        items: [],
      } as unknown as k8s.V1PodDisruptionBudgetList);

      const result = await autoscalingService.canScaleDown('frontend', 'default', 3);
      expect(result).toBe(true);
    });

    it('should return true when PDB allows scale down', async () => {
      const mockPDB: k8s.V1PodDisruptionBudget = {
        metadata: { name: 'frontend-pdb' },
        spec: {
          selector: { matchLabels: { app: 'frontend' } },
          minAvailable: 2, // Min 2 available
        },
      };

      mockPolicyClient.listNamespacedPodDisruptionBudget.mockResolvedValue({
        items: [mockPDB],
      } as unknown as k8s.V1PodDisruptionBudgetList);

      // 4 replicas, min 2 -> can scale down to 3
      const result = await autoscalingService.canScaleDown('frontend', 'default', 4);
      expect(result).toBe(true);
    });

    it('should return false when scale down would violate minAvailable PDB', async () => {
      const mockPDB: k8s.V1PodDisruptionBudget = {
        metadata: { name: 'frontend-pdb' },
        spec: {
          selector: { matchLabels: { app: 'frontend' } },
          minAvailable: 2,
        },
      };

      mockPolicyClient.listNamespacedPodDisruptionBudget.mockResolvedValue({
        items: [mockPDB],
      } as unknown as k8s.V1PodDisruptionBudgetList);

      // 2 replicas, min 2 -> cannot scale down to 1
      const result = await autoscalingService.canScaleDown('frontend', 'default', 2);
      expect(result).toBe(false);
    });

    it('should return false when maxUnavailable is 0', async () => {
      const mockPDB: k8s.V1PodDisruptionBudget = {
        metadata: { name: 'frontend-pdb' },
        spec: {
          selector: { matchLabels: { app: 'frontend' } },
          maxUnavailable: 0,
        },
      };

      mockPolicyClient.listNamespacedPodDisruptionBudget.mockResolvedValue({
        items: [mockPDB],
      } as unknown as k8s.V1PodDisruptionBudgetList);

      const result = await autoscalingService.canScaleDown('frontend', 'default', 5);
      expect(result).toBe(false);
    });

    it('should match PDB using app.kubernetes.io/name label', async () => {
      const mockPDB: k8s.V1PodDisruptionBudget = {
        metadata: { name: 'frontend-pdb' },
        spec: {
          selector: { matchLabels: { 'app.kubernetes.io/name': 'frontend' } },
          minAvailable: 3,
        },
      };

      mockPolicyClient.listNamespacedPodDisruptionBudget.mockResolvedValue({
        items: [mockPDB],
      } as unknown as k8s.V1PodDisruptionBudgetList);

      // 3 replicas, min 3 -> cannot scale down
      const result = await autoscalingService.canScaleDown('frontend', 'default', 3);
      expect(result).toBe(false);
    });

    it('should return true (fail-open) on API error', async () => {
      mockPolicyClient.listNamespacedPodDisruptionBudget.mockRejectedValue(new Error('API connection failed'));

      const result = await autoscalingService.canScaleDown('frontend', 'default', 3);
      expect(result).toBe(true);
    });

    it('should skip PDB without selector', async () => {
      const mockPDB: k8s.V1PodDisruptionBudget = {
        metadata: { name: 'empty-pdb' },
        spec: {
          minAvailable: 1,
          // No selector
        },
      };

      mockPolicyClient.listNamespacedPodDisruptionBudget.mockResolvedValue({
        items: [mockPDB],
      } as unknown as k8s.V1PodDisruptionBudgetList);

      const result = await autoscalingService.canScaleDown('frontend', 'default', 1);
      expect(result).toBe(true);
    });

    it('should handle string minAvailable values', async () => {
      const mockPDB: k8s.V1PodDisruptionBudget = {
        metadata: { name: 'frontend-pdb' },
        spec: {
          selector: { matchLabels: { app: 'frontend' } },
          minAvailable: '3' as unknown as number, // String value
        },
      };

      mockPolicyClient.listNamespacedPodDisruptionBudget.mockResolvedValue({
        items: [mockPDB],
      } as unknown as k8s.V1PodDisruptionBudgetList);

      // 4 replicas, min 3 -> can scale down to 3
      expect(await autoscalingService.canScaleDown('frontend', 'default', 4)).toBe(true);
      // 3 replicas, min 3 -> cannot scale down to 2
      expect(await autoscalingService.canScaleDown('frontend', 'default', 3)).toBe(false);
    });
  });

  describe('getPDB', () => {
    it('should return PDB when found by app label', async () => {
      const mockPDB: k8s.V1PodDisruptionBudget = {
        metadata: { name: 'frontend-pdb', namespace: 'default' },
        spec: {
          selector: { matchLabels: { app: 'frontend' } },
          minAvailable: 2,
        },
      };

      mockPolicyClient.listNamespacedPodDisruptionBudget.mockResolvedValue({
        items: [mockPDB],
      } as unknown as k8s.V1PodDisruptionBudgetList);

      const result = await autoscalingService.getPDB('frontend', 'default');
      expect(result).toEqual(mockPDB);
    });

    it('should return null when PDB not found', async () => {
      mockPolicyClient.listNamespacedPodDisruptionBudget.mockResolvedValue({
        items: [],
      } as unknown as k8s.V1PodDisruptionBudgetList);

      const result = await autoscalingService.getPDB('frontend', 'default');
      expect(result).toBeNull();
    });

    it('should return null on API error', async () => {
      mockPolicyClient.listNamespacedPodDisruptionBudget.mockRejectedValue(new Error('API error'));

      const result = await autoscalingService.getPDB('frontend', 'default');
      expect(result).toBeNull();
    });

    it('should match partial deployment name containing app label', async () => {
      const mockPDB: k8s.V1PodDisruptionBudget = {
        metadata: { name: 'frontend-pdb' },
        spec: {
          selector: { matchLabels: { app: 'frontend' } },
          minAvailable: 2,
        },
      };

      mockPolicyClient.listNamespacedPodDisruptionBudget.mockResolvedValue({
        items: [mockPDB],
      } as unknown as k8s.V1PodDisruptionBudgetList);

      // Deployment name contains the app label
      const result = await autoscalingService.getPDB('frontend-service', 'default');
      expect(result).toEqual(mockPDB);
    });
  });
});
