import fs from 'node:fs';
import * as fsSync from 'node:fs/promises';

import { jest } from '@jest/globals';

import { KubernetesAdapterImpl } from '../../src/adapters/k8s/index';
import { PrometheusAdapterImpl } from '../../src/adapters/prometheus/index';
import { setup } from '../../src/config/setup';
import { SetupFolderFiles } from '../../src/enums';

let k8s: KubernetesAdapterImpl;
let prometheus: PrometheusAdapterImpl;

beforeAll(async () => {
  k8s = new KubernetesAdapterImpl();
  prometheus = new PrometheusAdapterImpl();

  // create the folder and the file for deployments
  await setup();
});

beforeEach(async () => {
  const filePath = `${SetupFolderFiles.DEFAULT_PATH}/${SetupFolderFiles.DEPLOYS_PATH}/${SetupFolderFiles.DEPLOYS_FILE}`;
  const fileExists = await fsSync
    .access(filePath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);

  if (!fileExists) {
    await setup();
  }

  await fsSync.writeFile(
    filePath,
    JSON.stringify([
      {
        deployment: 'loadgenerator',
        namespace: 'online-boutique',
      },
      {
        deployment: 'loadgenerator',
        namespace: 'online-boutique',
      },
      {
        deployment: 'loadgenerator',
        namespace: 'online-boutique',
      },
      {
        deployment: 'loadgenerator',
        namespace: 'online-boutique',
      },
      {
        deployment: 'frontend',
        namespace: 'online-boutique',
      },
      {
        deployment: 'checkoutservice',
        namespace: 'online-boutique',
      },
    ])
  );
});

afterAll(() => {
  // remove the filesystem
  // fs.rmSync(SetupFolderFiles.DEFAULT_PATH, { recursive: true, force: true });
});

describe('OptiBalancer => applyOptiBalancerForWrittenData', () => {
  // it('should skip if no data found', async () => {
  //   jest.spyOn(fileSystem, 'readData').mockResolvedValue([]);

  //   const result = await applyOptiBalancerForWrittenData([], []);

  //   expect(result).toEqual([]);
  // });

  // it('should handle unhealthy deployment and delete it', async () => {
  //   const fakeDeployment = { deployment: 'web', namespace: 'default' };
  //   const optiBalancer = new OptiBalancer(k8s, prometheus, MetricsType.CPU);
  //   jest.spyOn(fileSystem, 'readData').mockResolvedValue([fakeDeployment]);
  //   jest.spyOn(k8s, 'checkDeploymentHealthy').mockResolvedValue(new Error('not found'));
  //   jest.spyOn(fileSystem, 'deleteData').mockResolvedValue(undefined);
  //   jest.spyOn(prometheus, 'getDownstreamPodGraph').mockResolvedValue([]);
  //   jest.spyOn(k8s, 'getDeploymentsMetrics').mockResolvedValue({});
  //   jest.spyOn(optiBalancer, 'Execute').mockResolvedValue();

  //   await applyOptiBalancerForWrittenData([], []);

  //   expect(fileSystem.deleteData).toHaveBeenCalledWith(expect.any(Function));
  // });

  it('should skip unhealthy deployments', async () => {
    jest
      .spyOn(k8s, 'checkDeploymentHealthy')
      .mockImplementationOnce(async () => false) // 1st deployment: unhealthy
      .mockImplementationOnce(async () => true) // 2nd deployment: healthy
      .mockImplementationOnce(async () => true); // 3rd deployment: healthy

    jest
      .spyOn(prometheus, 'getDownstreamPodGraph')
      .mockImplementationOnce(async () => [
        {
          node: 'node2',
          destinations: [
            {
              rps: 0.1111111111111111,
              node: 'node2',
              pod: 'checkoutservice-694758bddf-qm76n',
              source_workload: 'frontend',
              source_version: 'unknown',
              source_workload_namespace: 'online-boutique',
              destination_service_name: 'checkoutservice',
              destination_service_namespace: 'online-boutique',
              destination_version: 'unknown',
              destination_workload: 'checkoutservice',
            },
          ],
        },
        {
          node: 'node1',
          destinations: [
            {
              rps: 17.466666666666665,
              node: 'node1',
              pod: 'currencyservice-75d6599b9-7rhfg',
              source_workload: 'frontend',
              source_version: 'unknown',
              source_workload_namespace: 'online-boutique',
              destination_service_name: 'currencyservice',
              destination_service_namespace: 'online-boutique',
              destination_version: 'unknown',
              destination_workload: 'currencyservice',
            },
            {
              rps: 1.0666666666666664,
              node: 'node1',
              pod: 'shippingservice-85ddd6cdbc-ml9hv',
              source_workload: 'frontend',
              source_version: 'unknown',
              source_workload_namespace: 'online-boutique',
              destination_service_name: 'shippingservice',
              destination_service_namespace: 'online-boutique',
              destination_version: 'unknown',
              destination_workload: 'shippingservice',
            },
            {
              rps: 3.333333333333333,
              node: 'node1',
              pod: 'recommendationservice-75b8b64bdc-77jsk',
              source_workload: 'frontend',
              source_version: 'unknown',
              source_workload_namespace: 'online-boutique',
              destination_service_name: 'recommendationservice',
              destination_service_namespace: 'online-boutique',
              destination_version: 'unknown',
              destination_workload: 'recommendationservice',
            },
            {
              rps: 4.377777777777777,
              node: 'node1',
              pod: 'cartservice-6f4fc7c4c4-qhn9l',
              source_workload: 'frontend',
              source_version: 'unknown',
              source_workload_namespace: 'online-boutique',
              destination_service_name: 'cartservice',
              destination_service_namespace: 'online-boutique',
              destination_version: 'unknown',
              destination_workload: 'cartservice',
            },
          ],
        },
        {
          node: 'node3',
          destinations: [
            {
              rps: 3.0222222222222217,
              node: 'node3',
              pod: 'adservice-7fd58465b7-cx9jz',
              source_workload: 'frontend',
              source_version: 'unknown',
              source_workload_namespace: 'online-boutique',
              destination_service_name: 'adservice',
              destination_service_namespace: 'online-boutique',
              destination_version: 'unknown',
              destination_workload: 'adservice',
            },
            {
              rps: 22.111111111111107,
              node: 'node3',
              pod: 'productcatalogservice-54cf845bc5-6xzs2',
              source_workload: 'frontend',
              source_version: 'unknown',
              source_workload_namespace: 'online-boutique',
              destination_service_name: 'productcatalogservice',
              destination_service_namespace: 'online-boutique',
              destination_version: 'unknown',
              destination_workload: 'productcatalogservice',
            },
          ],
        },
      ])
      .mockImplementationOnce(async () => [
        {
          node: 'node1',
          destinations: [
            {
              rps: 0.39999999999999997,
              node: 'node1',
              pod: 'currencyservice-75d6599b9-7rhfg',
              source_workload: 'checkoutservice',
              source_version: 'unknown',
              source_workload_namespace: 'online-boutique',
              destination_service_name: 'currencyservice',
              destination_service_namespace: 'online-boutique',
              destination_version: 'unknown',
              destination_workload: 'currencyservice',
            },
            {
              rps: 0.2222222222222222,
              node: 'node1',
              pod: 'shippingservice-85ddd6cdbc-ml9hv',
              source_workload: 'checkoutservice',
              source_version: 'unknown',
              source_workload_namespace: 'online-boutique',
              destination_service_name: 'shippingservice',
              destination_service_namespace: 'online-boutique',
              destination_version: 'unknown',
              destination_workload: 'shippingservice',
            },
            {
              rps: 0.1111111111111111,
              node: 'node1',
              pod: 'paymentservice-7d969fdc57-7nw9l',
              source_workload: 'checkoutservice',
              source_version: 'unknown',
              source_workload_namespace: 'online-boutique',
              destination_service_name: 'paymentservice',
              destination_service_namespace: 'online-boutique',
              destination_version: 'unknown',
              destination_workload: 'paymentservice',
            },
            {
              rps: 0.1111111111111111,
              node: 'node1',
              pod: 'emailservice-b964694b9-ck5sc',
              source_workload: 'checkoutservice',
              source_version: 'unknown',
              source_workload_namespace: 'online-boutique',
              destination_service_name: 'emailservice',
              destination_service_namespace: 'online-boutique',
              destination_version: 'unknown',
              destination_workload: 'emailservice',
            },
            {
              rps: 0.2222222222222222,
              node: 'node1',
              pod: 'cartservice-6f4fc7c4c4-qhn9l',
              source_workload: 'checkoutservice',
              source_version: 'unknown',
              source_workload_namespace: 'online-boutique',
              destination_service_name: 'cartservice',
              destination_service_namespace: 'online-boutique',
              destination_version: 'unknown',
              destination_workload: 'cartservice',
            },
          ],
        },
        {
          node: 'node3',
          destinations: [
            {
              rps: 0.28888888888888886,
              node: 'node3',
              pod: 'productcatalogservice-54cf845bc5-6xzs2',
              source_workload: 'checkoutservice',
              source_version: 'unknown',
              source_workload_namespace: 'online-boutique',
              destination_service_name: 'productcatalogservice',
              destination_service_namespace: 'online-boutique',
              destination_version: 'unknown',
              destination_workload: 'productcatalogservice',
            },
          ],
        },
      ]);

    jest.spyOn(k8s, 'getDeploymentsMetrics').mockResolvedValue({
      adservice: [
        {
          node: 'node1',
          pod: 'adservice-7fd58465b7-cx9jz',
          usage: {
            cpu: 11.777878,
            memory: 157.265625,
          },
          percentUsage: {
            cpu: 0.03099441578947368,
            memory: 0.3674430490654206,
            cpuAndMemory: 0.19921873242744714,
          },
          requested: {
            cpu: 240.00000000000003,
            memory: 244,
          },
          limits: {
            cpu: 380,
            memory: 428,
          },
        },
      ],
      cartservice: [
        {
          node: 'node3',
          pod: 'cartservice-6f4fc7c4c4-qhn9l',
          usage: {
            cpu: 34.320537,
            memory: 77.29296875,
          },
          percentUsage: {
            cpu: 0.09031720263157896,
            memory: 0.3019256591796875,
            cpuAndMemory: 0.19612143090563322,
          },
          requested: {
            cpu: 240.00000000000003,
            memory: 128,
          },
          limits: {
            cpu: 380,
            memory: 256,
          },
        },
      ],
      checkoutservice: [
        {
          node: 'node1',
          pod: 'checkoutservice-694758bddf-k8nsm',
          usage: {
            cpu: 8.863935999999999,
            memory: 62.32421875,
          },
          percentUsage: {
            cpu: 0.03165691428571428,
            memory: 0.2434539794921875,
            cpuAndMemory: 0.13755544688895088,
          },
          requested: {
            cpu: 140,
            memory: 128,
          },
          limits: {
            cpu: 280,
            memory: 256,
          },
        },
        {
          node: 'node2',
          pod: 'checkoutservice-694758bddf-qm76n',
          usage: {
            cpu: 8.126254,
            memory: 53.78125,
          },
          percentUsage: {
            cpu: 0.029022335714285714,
            memory: 0.2100830078125,
            cpuAndMemory: 0.11955267176339286,
          },
          requested: {
            cpu: 140,
            memory: 128,
          },
          limits: {
            cpu: 280,
            memory: 256,
          },
        },
      ],
      currencyservice: [
        {
          node: 'node3',
          pod: 'currencyservice-75d6599b9-7rhfg',
          usage: {
            cpu: 57.18538600000001,
            memory: 134.640625,
          },
          percentUsage: {
            cpu: 0.20423352142857146,
            memory: 0.52593994140625,
            cpuAndMemory: 0.3650867314174107,
          },
          requested: {
            cpu: 140,
            memory: 128,
          },
          limits: {
            cpu: 280,
            memory: 256,
          },
        },
      ],
      emailservice: [
        {
          node: 'node3',
          pod: 'emailservice-b964694b9-ck5sc',
          usage: {
            cpu: 5.049431,
            memory: 78.890625,
          },
          percentUsage: {
            cpu: 0.018033682142857145,
            memory: 0.30816650390625,
            cpuAndMemory: 0.16310009302455358,
          },
          requested: {
            cpu: 140,
            memory: 128,
          },
          limits: {
            cpu: 280,
            memory: 256,
          },
        },
      ],
      frontend: [
        {
          node: 'node1',
          pod: 'frontend-7b7c5f56d9-44zp6',
          usage: {
            cpu: 98.217319,
            memory: 59.85546875,
          },
          percentUsage: {
            cpu: 0.5456517722222223,
            memory: 0.2338104248046875,
            cpuAndMemory: 0.3897310985134549,
          },
          requested: {
            cpu: 90,
            memory: 128,
          },
          limits: {
            cpu: 180,
            memory: 256,
          },
        },
        {
          node: 'node3',
          pod: 'frontend-7b7c5f56d9-sq248',
          usage: {
            cpu: 62.63352799999999,
            memory: 64.51171875,
          },
          percentUsage: {
            cpu: 0.3479640444444444,
            memory: 0.2519989013671875,
            cpuAndMemory: 0.29998147290581595,
          },
          requested: {
            cpu: 90,
            memory: 128,
          },
          limits: {
            cpu: 180,
            memory: 256,
          },
        },
      ],
      loadgenerator: [
        {
          node: 'node1',
          pod: 'loadgenerator-56f46dff65-4w7w7',
          usage: {
            cpu: 12.115521000000001,
            memory: 87.73046875,
          },
          percentUsage: {
            cpu: 0.1514440125,
            memory: 0.685394287109375,
            cpuAndMemory: 0.41841914980468753,
          },
          requested: {
            cpu: 40,
            memory: 64,
          },
          limits: {
            cpu: 80,
            memory: 128,
          },
        },
        {
          node: 'node1',
          pod: 'loadgenerator-56f46dff65-gfzd7',
          usage: {
            cpu: 11.591189,
            memory: 95.29296875,
          },
          percentUsage: {
            cpu: 0.1448898625,
            memory: 0.744476318359375,
            cpuAndMemory: 0.4446830904296875,
          },
          requested: {
            cpu: 40,
            memory: 64,
          },
          limits: {
            cpu: 80,
            memory: 128,
          },
        },
        {
          node: 'node1',
          pod: 'loadgenerator-56f46dff65-htcj7',
          usage: {
            cpu: 9.466055,
            memory: 1769.80859375,
          },
          percentUsage: {
            cpu: 0.11832568750000001,
            memory: 13.826629638671875,
            cpuAndMemory: 6.972477663085938,
          },
          requested: {
            cpu: 40,
            memory: 64,
          },
          limits: {
            cpu: 80,
            memory: 128,
          },
        },
        {
          node: 'node3',
          pod: 'loadgenerator-56f46dff65-mb9g4',
          usage: {
            cpu: 11.194823999999999,
            memory: 423.19921875,
          },
          percentUsage: {
            cpu: 0.13993529999999998,
            memory: 3.306243896484375,
            cpuAndMemory: 1.7230895982421874,
          },
          requested: {
            cpu: 40,
            memory: 64,
          },
          limits: {
            cpu: 80,
            memory: 128,
          },
        },
        {
          node: 'node1',
          pod: 'loadgenerator-56f46dff65-nfhp9',
          usage: {
            cpu: 0,
            memory: 0,
          },
          percentUsage: {
            cpu: 0,
            memory: 0,
            cpuAndMemory: 0,
          },
          requested: {
            cpu: 40,
            memory: 64,
          },
          limits: {
            cpu: 80,
            memory: 128,
          },
        },
      ],
      paymentservice: [
        {
          node: 'node3',
          pod: 'paymentservice-7d969fdc57-7nw9l',
          usage: {
            cpu: 4.195643,
            memory: 162.21875,
          },
          percentUsage: {
            cpu: 0.014984439285714284,
            memory: 0.6336669921875,
            cpuAndMemory: 0.3243257157366071,
          },
          requested: {
            cpu: 140,
            memory: 128,
          },
          limits: {
            cpu: 280,
            memory: 256,
          },
        },
      ],
      productcatalogservice: [
        {
          node: 'node1',
          pod: 'productcatalogservice-54cf845bc5-6xzs2',
          usage: {
            cpu: 75.007929,
            memory: 56.5390625,
          },
          percentUsage: {
            cpu: 0.2678854607142857,
            memory: 0.220855712890625,
            cpuAndMemory: 0.24437058680245535,
          },
          requested: {
            cpu: 140,
            memory: 128,
          },
          limits: {
            cpu: 280,
            memory: 256,
          },
        },
      ],
      recommendationservice: [
        {
          node: 'node3',
          pod: 'recommendationservice-75b8b64bdc-77jsk',
          usage: {
            cpu: 33.980442,
            memory: 82.37109375,
          },
          percentUsage: {
            cpu: 0.12135872142857142,
            memory: 0.1425105428200692,
            cpuAndMemory: 0.1319346321243203,
          },
          requested: {
            cpu: 140,
            memory: 284,
          },
          limits: {
            cpu: 280,
            memory: 578,
          },
        },
      ],
      'redis-cart': [
        {
          node: 'node2',
          pod: 'redis-cart-7ff8f4d6ff-pthlm',
          usage: {
            cpu: 12.901124999999999,
            memory: 35.04296875,
          },
          percentUsage: {
            cpu: 0.06293231707317072,
            memory: 0.09125773111979167,
            cpuAndMemory: 0.0770950240964812,
          },
          requested: {
            cpu: 110.00000000000001,
            memory: 264,
          },
          limits: {
            cpu: 205.00000000000003,
            memory: 384,
          },
        },
      ],
      shippingservice: [
        {
          node: 'node3',
          pod: 'shippingservice-85ddd6cdbc-ml9hv',
          usage: {
            cpu: 7.344091,
            memory: 47.34375,
          },
          percentUsage: {
            cpu: 0.026228896428571426,
            memory: 0.1849365234375,
            cpuAndMemory: 0.10558270993303571,
          },
          requested: {
            cpu: 140,
            memory: 128,
          },
          limits: {
            cpu: 280,
            memory: 256,
          },
        },
      ],
    });
    // TODO continue with execute
  });
});
