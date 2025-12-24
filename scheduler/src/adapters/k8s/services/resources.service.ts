import * as k8s from '@kubernetes/client-node';

import { readYamlK8sFilesFromPath } from '../../../common/helpers.js';
import { logger } from '../../../config/logger.js';

export class ResourceService {
  private readonly client: k8s.KubernetesObjectApi;
  private readonly customClient: k8s.CustomObjectsApi;

  constructor(client: k8s.KubernetesObjectApi, customClient: k8s.CustomObjectsApi) {
    this.client = client;
    this.customClient = customClient;
  }

  async apply(resources: k8s.KubernetesObject[]): Promise<k8s.KubernetesObject[]> {
    const created: string[] = [];
    const notCreated: k8s.KubernetesObject[] = [];

    for (const resource of resources) {
      try {
        if (!resource.metadata?.name) {
          logger.error(`Failed to apply resource: ${JSON.stringify(resource, null, 2)}. Metadata or name is undefined`);
          notCreated.push(resource);
          continue;
        }

        // This is to convince the old version of TypeScript that metadata exists even though we already filtered specs
        // without metadata out
        resource.metadata.annotations = resource.metadata.annotations || {};
        delete resource.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'];
        resource.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'] = JSON.stringify(resource);

        // Construct a valid resource header
        const resourceHeader = {
          apiVersion: resource.apiVersion,
          kind: resource.kind,
          metadata: {
            name: resource.metadata.name,
            namespace: resource.metadata.namespace ?? 'default',
          },
        };

        // Check if the resource exists
        await this.client.read(resourceHeader);

        // Resource exists, patch it
        const response = await this.client.patch(resource);
        created.push(`${response.metadata!.name!}:${response.kind}`);
      } catch (error: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = error as any;
        const statusCode = err.statusCode ?? err.code ?? err.response?.statusCode ?? err.response?.status;

        if (Number(statusCode) === 404) {
          // If resource does not exist, create it
          const response = await this.client.create(resource);
          created.push(`${response.metadata!.name!}:${response.kind}`);
        } else {
          logger.error(
            `Error creating resource: ${JSON.stringify(resource, null, 2)} / ${JSON.stringify(err.body, null, 2)}`
          );
          notCreated.push(resource);
        }
      }
    }

    logger.info(
      `All resources created/updated: ${created.join(', ')} / ${notCreated.length} not created because metadata name is undefined`
    );
    return notCreated;
  }

  /**
   * Replicate the functionality of `kubectl apply`.  That is, create the resources defined in the `specFile` if they do
   * not exist, patch them if they do exist.
   *
   * @param specPath File system path to a YAML Kubernetes spec.
   * @return Array of resources created
   */

  async applyFromFile(specPath: string): Promise<k8s.KubernetesObject[]> {
    const yamlFiles = readYamlK8sFilesFromPath(specPath);

    const flatYamlFiles = Object.values(yamlFiles).flat();

    const resources = await this.apply(flatYamlFiles);
    return resources;
  }

  async applyCustomObject(resource: k8s.KubernetesObject): Promise<void> {
    try {
      if (!resource.metadata?.name) {
        throw new Error(`Resource metadata or name is missing: ${JSON.stringify(resource)}`);
      }

      // Extract API information
      const [group, version] = resource.apiVersion ? resource.apiVersion.split('/') : ['', ''];
      const kind = resource.kind ?? '';
      const namespace = resource.metadata.namespace ?? 'default';
      const name = resource.metadata.name;
      const plural = this.getPluralName(kind); // Get the plural form for CRD

      // Ensure annotations are properly set
      resource.metadata.annotations = resource.metadata.annotations || {};
      delete resource.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'];
      resource.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'] = JSON.stringify(resource);

      try {
        await this.customClient.getNamespacedCustomObject({ group, version, namespace, plural, name });

        const response = await this.customClient.patchNamespacedCustomObject(
          {
            group,
            version,
            namespace,
            plural,
            name,
            body: resource,
          },
          k8s.setHeaderOptions('Content-Type', k8s.PatchStrategy.MergePatch)
        );
        // console.log(JSON.stringify(response, null, 2));
        logger.info(`Custom Object updated: ${response.metadata.name}`);
      } catch (error: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = error as any;
        const statusCode = err.statusCode ?? err.code ?? err.response?.statusCode ?? err.response?.status;

        if (Number(statusCode) === 404) {
          // Step 3: If not found, CREATE the resource
          const response = await this.customClient.createNamespacedCustomObject({
            group,
            version,
            namespace,
            plural,
            body: resource,
          });
          logger.info(`Custom Object created: ${response.metadata.name}`);
        } else {
          logger.error(`Error applying Custom Object: ${resource.metadata.name} - }`);
        }
      }
    } catch (error) {
      logger.error(`Failed to apply Custom Object: ${error}`);
    }
  }

  async readCustomObject(group: string, version: string, namespace: string, plural: string, name: string) {
    try {
      const res = await this.customClient.getNamespacedCustomObject({ group, version, namespace, plural, name });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (res as any).body ?? null;
    } catch (error) {
      logger.error(`Failed to Fetch Custom Object: ${error}`);
    }
  }

  // Utility function to get the plural name of the Custom Resource
  private getPluralName(kind: string): string {
    return kind.toLowerCase() + 's'; // Basic pluralization logic
  }
}
