// a test that will retrieve all pods from the online-boutique namespace.
// The result must be an array with all the pods that are running in the namespace.
// get the resources
// scale the replica pods of the generator
// get the resources again
// get the resources that the pods have reached the limit of 80% CPU

// import path from 'path';

// import { KubernetesAdapterImpl } from '../src/adapters/k8s';
import { logger } from '../src/config/logger';

// import type { KubernetesAdapter } from '../src/adapters/kubernetes.interface';
// import { PrometheusManager } from '../src/prometheus/manager';

// jest.setTimeout(120000);

// let k8sManager: KubernetesAdapter; // Declare k8sManager in the outer scope
// let promManager: PrometheusManager;

// let namespace = 'online-boutique';
// connect to the client
// deploy the app to the namespace
beforeAll(async () => {
  logger.info('set up the environment');
  // k8sManager = new KubernetesAdapterImpl();
  // promManager = new PrometheusManager();

  // create namespace
  // await k8sManager.createNamespace(namespace, {
  //   'istio-injection': 'enabled',
  // });

  // deploy the application from the yaml files
  // const yamlPath = path.join(__dirname, 'data', namespace);
  // const res = await k8sManager.applyResourcesFromFile(yamlPath);

  // expect(res.length).toBe(0);
});

// disconnect from the client
// delete the app from the namespace
afterAll(() => {
  // TODO delete the namespace
  // TODO delete the application in this namespace
  console.log('tearDown the app');
});

describe('getPodsResourcesAndCritical', () => {
  test('get pods by deployments', async () => {
    // const deploy = await k8sManager.getPodsOfEachDeploymentByNs(namespace);
    // console.log(deploy);
  });

  // let podMetrics = [];

  test('get pod metrics memory threshold', async () => {
    // const podMetrics = await promManager.getPodThresholds(
    //   MetricsType.MEMORY,
    //   namespace
    // );
    //console.log(podMetrics);
    //   await k8sManager.getClassifiedPodsByThreshold('online-boutique');
    // console.log(podMetrics.aboveThreshold);
    // console.log(podMetrics.belowThreshold);
    //TODO compare the list request and limit resources with the json dummy data
    // check if metrics reached the limit of 80%
    // If pods not have request and limits, set up as the limit the 80% of the left space in Node
  });
});

test('Calculator Tests', () => {
  console.log('we are ok');
});
