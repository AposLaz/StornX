import * as k8s from '@kubernetes/client-node';

/** Create API clients from in-cluster credentials or the local development kubeconfig. */
export function clients(production = process.env.ENV !== 'development') {
  const config = new k8s.KubeConfig();

  if (production) {
    config.loadFromCluster();
  } else {
    config.loadFromDefault();
  }

  return {
    core: config.makeApiClient(k8s.CoreV1Api),
    apps: config.makeApiClient(k8s.AppsV1Api),
    custom: config.makeApiClient(k8s.CustomObjectsApi),
    autoscaling: config.makeApiClient(k8s.AutoscalingV2Api),
    policy: config.makeApiClient(k8s.PolicyV1Api),
    discovery: config.makeApiClient(k8s.DiscoveryV1Api),
    coordination: config.makeApiClient(k8s.CoordinationV1Api),
    metrics: new k8s.Metrics(config),
  };
}

export type Clients = ReturnType<typeof clients>;

/** Normalize the error shapes exposed by Kubernetes client operations. */
export const statusCode = (e: unknown): number | undefined => {
  const v = e as {
    code?: number;

    statusCode?: number;
    response?: {
      statusCode?: number;
      status?: number;
    };
  };

  return v?.code ?? v?.statusCode ?? v?.response?.statusCode ?? v?.response?.status;
};

export const mergePatch = k8s.setHeaderOptions('Content-Type', k8s.PatchStrategy.MergePatch);

/** Reject a deleted-and-recreated workload even when its name is unchanged. */
export function assertIdentity(deployment: k8s.V1Deployment, uid: string): void {
  if (deployment.metadata?.uid !== uid) {
    throw new Error('Workload identity changed');
  }
}

/** Require the current Deployment generation and all desired replicas to be serving. */
export function available(deployment: k8s.V1Deployment): boolean {
  const count = deployment.spec?.replicas ?? 0;

  return (
    count > 0 &&
    (deployment.status?.observedGeneration ?? 0) >= (deployment.metadata?.generation ?? 0) &&
    (deployment.status?.readyReplicas ?? 0) === count &&
    (deployment.status?.availableReplicas ?? 0) === count &&
    (deployment.status?.updatedReplicas ?? 0) === count
  );
}

/** Check the independent workload label authorizing this controller component. */
export const optedIn = (deployment: k8s.V1Deployment, component: string): boolean =>
  deployment.metadata?.labels?.[`stornx.io/${component}`] === 'enabled';
