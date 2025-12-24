import * as k8s from '@kubernetes/client-node';

import { Config } from './config.js';
import { K8sClientTypeApi } from '../adapters/k8s/enums.js';

// use Singleton Pattern
class K8sClientConfig {
  private static instance: k8s.KubeConfig;

  private constructor() {}

  public static getInstance(): k8s.KubeConfig {
    if (!K8sClientConfig.instance) {
      K8sClientConfig.instance = new k8s.KubeConfig();

      // choose client based on the environment
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      Config.ENV === 'production'
        ? K8sClientConfig.instance.loadFromCluster() // runs in the Cluster
        : K8sClientConfig.instance.loadFromDefault(); // runs in development mode
    }
    return K8sClientConfig.instance;
  }
}

// use Factory Pattern for K8s Clients
export class K8sClientApiFactory {
  static getClient(
    type: K8sClientApiFactory
  ): k8s.AppsV1Api | k8s.CoreV1Api | k8s.KubernetesObjectApi | k8s.Metrics | k8s.CustomObjectsApi {
    const kc = K8sClientConfig.getInstance();

    switch (type) {
      case K8sClientTypeApi.APPS:
        return kc.makeApiClient(k8s.AppsV1Api);
      case K8sClientTypeApi.CORE:
        return kc.makeApiClient(k8s.CoreV1Api);
      case K8sClientTypeApi.OBJECTS:
        return k8s.KubernetesObjectApi.makeApiClient(kc);
      case K8sClientTypeApi.METRICS:
        return new k8s.Metrics(kc);
      case K8sClientTypeApi.CUSTOM_OBJECTS:
        return kc.makeApiClient(k8s.CustomObjectsApi);
      default:
        throw new Error(
          `Invalid Kubernetes API type provided. Expected one of ${Object.values(K8sClientTypeApi).join(', ')}`
        );
    }
  }
}
