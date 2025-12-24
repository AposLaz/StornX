import { logger } from '../../../config/logger.js';
import { FaultMapper } from '../mappers.js';

import type { ClusterAzTopology, NodeMetrics, PodMetrics } from '../../../adapters/k8s/types.js';
import type { MetricsType } from '../../../enums.js';
import type { MetricWeights } from '../../../types.js';
import type { FaultNodesSumReplicas, FaultToleranceType, FaultZonesNodes } from '../types.js';

export class FaultTolerance {
  private readonly deployRs: PodMetrics[];
  private readonly nodesWithResources: NodeMetrics[];
  private readonly zonesNodes: ClusterAzTopology;
  private readonly loggerOperation = logger.child({ operation: 'FaultTolerance' });
  private readonly deploymentName: string;

  constructor(data: FaultToleranceType) {
    this.deploymentName = data.deployment;
    this.deployRs = data.replicaPods;
    this.nodesWithResources = data.nodeMetrics;
    this.zonesNodes = data.zonesNodes;

    this.loggerOperation.info(`Initialized FaultToleranceScheduler`, {
      deploymentName: this.deploymentName,
      deployRsCount: this.deployRs.length,
      nodesWithResourcesCount: this.nodesWithResources.length,
      zonesCount: Object.keys(this.zonesNodes).length,
    });
  }

  /**
   * Returns an array of unique candidate node names suitable for hosting pods.
   *
   * The `getCandidateNodes` function determines the fault-tolerant candidate nodes
   * for scheduling pods based on the current deployment replicas, node resources,
   * and cluster topology.
   *
   * It ensures that the candidate nodes have the capacity to host pods while
   * maintaining fault tolerance by distributing replicas across different zones
   * and nodes.
   *
   * @returns An array of unique candidate node names suitable for hosting pods.
   */
  public getCandidateNodesToAdd(): string[] {
    this.loggerOperation.info('Starting getCandidateNodesToAdd');
    /*
     * Step 1: Count the number of replicas for each node.
     */
    const currentNodeAssignments = this.replicaPodsPerNode(this.deployRs);
    this.loggerOperation.debug({
      deploymentName: this.deploymentName,
      message: 'Current node assignments',
      currentNodeAssignments,
    });

    /*
     * Step 2: Map the replica count to the nodes.
     */
    const assignReplicasToNodes = FaultMapper.toNodesReplicas(currentNodeAssignments);

    /*
     * Step 3: Map the replica count to the zones.
     */
    const assignReplicasToZones = FaultMapper.toZoneReplicas(this.zonesNodes, assignReplicasToNodes);

    /*
     * Step 4: Find the zones that have replicas.
     */
    const sizeFaultZones = Math.min(3, assignReplicasToZones.size);
    this.loggerOperation.debug({
      message: 'Calculated fault zones size',
      sizeFaultZones,
    });

    const maxFtZones = this.filterCandidateZones(sizeFaultZones, assignReplicasToZones);
    /*
     * Step 5: Filter the nodes that have available resources.
     */
    const zonesWithResources = this.getZonesWithSufficientResources(maxFtZones, this.nodesWithResources);
    /*
     * Step 6: Filter the zones that can host pods.
     */
    if (zonesWithResources.size === 0) {
      this.loggerOperation.warn(`No zones have sufficient resources to host pods.`);
      return [];
    }

    let candidateZones = zonesWithResources;

    if (this.deployRs.length < sizeFaultZones) {
      // If there are fewer deployments than zones, only consider zones with zero replicas.
      candidateZones =
        candidateZones.size === 1
          ? zonesWithResources
          : new Map(Array.from(zonesWithResources.entries()).filter(([, data]) => data.replicas === 0));

      this.loggerOperation.debug({
        message: 'Filtered candidate zones for fewer deployments',
        candidateZones: Array.from(candidateZones.keys()),
      });
    } else {
      // Otherwise, only consider zones with a replica count within one of the lowest replica counts.
      candidateZones = this.getZonesWithinSkew(zonesWithResources);
      this.loggerOperation.debug({
        message: 'Filtered candidate zones within skew',
        candidateZones: Array.from(candidateZones.keys()),
      });
    }

    // Get candidate Nodes With Resources
    const candidateNodes: string[] = [];

    candidateZones.forEach((data, zone) => {
      // Get the nodes for this zone.
      const nodesForZone = maxFtZones.get(zone)?.nodes || [];

      if (nodesForZone.length > 0) {
        // Get the nodes with resources for this zone.
        const newNodesWithResources = data.nodes.filter((n) => nodesForZone.find((node) => node.node === n.node));

        candidateNodes.push(...newNodesWithResources.map((n) => n.node));
      }
    });

    // Return the unique candidate nodes.
    const uniqueCandidateNodes = [...new Set(candidateNodes)];
    this.loggerOperation.info({
      deploymentName: this.deploymentName,
      message: 'Candidate nodes computed',
      uniqueCandidateNodes,
    });

    return uniqueCandidateNodes;
  }

  /**
   * Identifies the most loaded node suitable for pod removal to maintain
   * fault tolerance across zones.
   *
   * This function analyzes the distribution of replicas across nodes and zones,
   * aiming to select a node for pod removal that would least impact fault tolerance.
   * It first checks if all zones with replicas have only one replica, in which case
   * it selects the most loaded node among them. Otherwise, it identifies zones
   * with the maximum replica count and selects the most loaded node within those zones.
   *
   * @returns The name of the node that is most loaded and suitable for pod removal.
   */

  public getCandidateNodeToRemove(metricType: MetricsType, weights: MetricWeights): string[] {
    // Create an array of loaded nodes with their names and zones
    const sortNodesByLoad = FaultMapper.toMostHighLoadedNodes(this.nodesWithResources, metricType, weights);

    const loadedNodes = sortNodesByLoad.map(({ name, zone }) => ({
      node: name,
      zone,
    }));

    /*
     * Step 1: Count the number of replicas for each node.
     */
    const currentNodeAssignments = this.replicaPodsPerNode(this.deployRs);

    /*
     * Step 2: Map the replica count to the nodes.
     */
    const assignReplicasToNodes = FaultMapper.toNodesReplicas(currentNodeAssignments);

    /*
     * Step 3: Map the replica count to the zones.
     */
    const assignReplicasToZones = FaultMapper.toZoneReplicas(this.zonesNodes, assignReplicasToNodes);

    // Filter out zones that have at least one replica
    const zonesWithReplicas = Array.from(assignReplicasToZones.entries()).filter(([, data]) => data.replicas > 0);

    // Check if all zones with replicas only have a single replica
    const allHaveOneReplica = zonesWithReplicas.every(([, data]) => data.replicas === 1);

    if (allHaveOneReplica) {
      // If all zones have one replica, find the most loaded node among them
      const mostLoaded = this.getMostLoadedNode(
        zonesWithReplicas.map(([zone, data]) => [
          zone,
          { ...data, nodes: [data.nodes[0]] }, // Consider the first node in each zone
        ]),
        loadedNodes
      );
      return [mostLoaded]; // Return the node name of the most loaded node
    }

    // Find the maximum replica count present in any zone
    const maxReplicaCount = Math.max(...zonesWithReplicas.map(([, data]) => data.replicas));

    // Identify zones with the most replicas
    const zonesWithMostReplicas = zonesWithReplicas.filter(([, data]) => data.replicas === maxReplicaCount);

    // Find the most loaded node within the zones with the most replicas
    const mostLoadedNode = this.getMostLoadedNode(zonesWithMostReplicas, loadedNodes);

    // Return the node name of the most loaded node
    return [mostLoadedNode];
  }

  /**
   * Filter zones that already have replicas and return a new Map with the given
   * number of zones.
   *
   * @param maxFt - The maximum number of zones to return.
   * @param zones - A FaultZonesNodes map of zones to their replica counts and node lists.
   *
   * @returns A new FaultZonesNodes map with the given number of zones.
   *          If the number of zones with replicas is fewer than maxFt, the returned map
   *          will also include zones that don't have replicas but aren't already in the
   *          returned map.
   */
  private filterCandidateZones(maxFt: number, zones: FaultZonesNodes): FaultZonesNodes {
    // Create a new Map from zones that already have replicas
    const zonesWithReplicas: FaultZonesNodes = new Map(
      Array.from(zones.entries()).filter(([, data]) => data.replicas > 0)
    );

    // If the filtered Map has fewer zones than required, add more from zonesNodes
    if (zonesWithReplicas.size < maxFt) {
      const needed = maxFt - zonesWithReplicas.size;
      // Get additional zones that don't have replicas and aren't already in zonesWithReplicas
      const additionalEntries = Array.from(zones.entries())
        .filter(([zone, data]) => data.replicas === 0 && !zonesWithReplicas.has(zone))
        .slice(0, needed);

      additionalEntries.forEach(([zone, data]) => {
        zonesWithReplicas.set(zone, data);
      });
    }

    return zonesWithReplicas;
  }

  /**
   * Determines the most loaded node from the provided zones and loaded nodes.
   *
   * This function iterates through each zone and its nodes, identifying the node
   * with the highest load based on the order of nodes in the loadedNodes array.
   * The node with the lowest index (indicating highest load) is selected as the
   * most loaded candidate.
   *
   * @param zones - An array of tuples containing zone identifiers and their corresponding
   *                FaultNodesSumReplicas data, which includes nodes and their replica information.
   * @param loadedNodes - An array of objects representing nodes and their associated zones,
   *                      used to determine the load order of nodes.
   * @returns An object containing the node identifier and its load index, representing
   *          the most loaded node based on the provided loadedNodes order.
   */
  private getMostLoadedNode(
    zones: [string, FaultNodesSumReplicas][],
    loadedNodes: { node: string; zone: string }[]
  ): string {
    let mostLoadedCandidate: { node: string; load: number } | null = null;
    // Iterate through each zone and each node within it
    zones.forEach(([, data]) => {
      data.nodes.forEach((n) => {
        const nodeLoad = loadedNodes.findIndex((ln) => ln.node === n.node);
        const candidate = { node: n.node, load: nodeLoad };
        if (nodeLoad !== -1 && (!mostLoadedCandidate || candidate.load < mostLoadedCandidate.load)) {
          mostLoadedCandidate = candidate;
        }
      });
    });
    return mostLoadedCandidate!.node;
  }

  /**
   * Given an array of PodMetrics objects, each of which represents a pod
   * running in a Kubernetes cluster and contains information about the pod,
   * including its name and the node it is running on, return a map where each
   * key is a node name and the value is the number of replicas on that node.
   *
   * @param deployRs - An array of PodMetrics objects, each of which represents
   *                  a pod running in a Kubernetes cluster.
   * @returns A map where each key is a node name and the value is the number of
   *          replicas on that node.
   */
  private replicaPodsPerNode(deployRs: PodMetrics[]): Record<string, number> {
    return deployRs.reduce(
      (acc, pod) => {
        // Increment the replica count for the node that the pod is on.
        acc[pod.node] = (acc[pod.node] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  /**
   * Given a map of zone names to their nodes and replica counts, and an array of
   * NodeMetrics objects, returns a new map of zone names to their nodes and replica
   * counts, but only including zones that have at least one node with sufficient
   * resources to create a new replica pod.
   *
   * @param zoneNodes - A FaultZonesNodes map of zone names to their nodes and replica
   *                    counts.
   * @param nodes - An array of NodeMetrics objects, each of which contains information
   *                about a node in the Kubernetes cluster, including its name, and the
   *                amount of CPU and memory that is currently available on the node.
   *
   * @returns A new FaultZonesNodes map that only includes zones that have at least one
   *          node with sufficient resources to create a new replica pod. If no such
   *          zones exist, the returned map is empty.
   */
  private getZonesWithSufficientResources(zoneNodes: FaultZonesNodes, nodes: NodeMetrics[]): FaultZonesNodes {
    const zonesWithResources: FaultZonesNodes = new Map();

    zoneNodes.forEach((data, zone) => {
      const nodesInZone = data.nodes.filter((n) => nodes.some((nr) => nr.name === n.node));

      if (nodesInZone.length > 0) {
        zonesWithResources.set(zone, {
          nodes: nodesInZone,
          replicas: data.replicas,
        });
      }
    });

    return zonesWithResources;
  }

  /**
   * Filter zones that have a replica count within a certain "skew" from the
   * lowest replica count across all zones.
   *
   * @param zones - A FaultZonesNodes map of zones to their replica counts and
   *                node lists.
   * @param maxSkew - The maximum skew from the lowest replica count that a zone
   *                 can have and still be included in the result. Defaults to 5.
   * @returns A new FaultZonesNodes map that only includes zones that are within
   *          the specified skew from the lowest replica count. If no zones are
   *          within the specified skew, the original map is returned.
   */
  private getZonesWithinSkew(zones: FaultZonesNodes, maxSkew: number = 3): FaultZonesNodes {
    // Get an array of all the replica counts in the zones map
    const rsCount = Array.from(zones.values()).map((data) => data.replicas);

    // Find the minimum replica count across all zones
    const minRs = Math.min(...rsCount);

    // Create a new map that only includes zones that are within the specified
    // skew from the lowest replica count
    const skewZones = new Map(Array.from(zones.entries()).filter(([, data]) => data.replicas - minRs < maxSkew));

    // If no zones are within the specified skew, return the original map
    if (skewZones.size === 0) return zones;

    // Otherwise, return the filtered map
    return skewZones;
  }
}
