import { ScaleAction } from './enums.js';
import { OptiScalerMapper } from './mappers.js';
import { FaultTolerance } from './services/faultTolerance.service.js';
import { calculateWeightsDm, calculateWeightsUm } from './utils.js';
import { logger } from '../../config/logger.js';

import type { FaultToleranceType, OptiScalerHandlers, OptiScalerType } from './types.js';
import type { FileSystemHandler } from '../../adapters/filesystem/index.js';
import type { KubernetesAdapterImpl } from '../../adapters/k8s/index.js';
import type { PrometheusAdapterImpl } from '../../adapters/prometheus/index.js';
import type { GraphDataRps } from '../../adapters/prometheus/types.js';
import type { MetricsType } from '../../enums.js';
import type { MetricWeights } from '../../types.js';

export class OptiScaler {
  private readonly scaleAction: ScaleAction;
  private readonly optiData: OptiScalerType;
  private readonly ft: FaultTolerance;
  private readonly prom: PrometheusAdapterImpl;
  private readonly k8s: KubernetesAdapterImpl;
  private readonly fileSystem: FileSystemHandler;
  private readonly loggerOperation = logger.child({ operation: 'OptiScaler' });

  constructor(action: ScaleAction, data: OptiScalerType, handles: OptiScalerHandlers) {
    this.optiData = data;
    this.scaleAction = action;
    const ftData = this.optiData as FaultToleranceType;
    this.ft = new FaultTolerance(ftData);
    this.prom = handles.prom;
    this.k8s = handles.k8s;
    this.fileSystem = handles.fileSystem;
  }

  async Execute(metricType: MetricsType, weight: MetricWeights) {
    // apply the fault tolerance rules
    const ftNodes = this.getFaultToleranceNodes(metricType, weight);
    // get the candidate node
    if (ftNodes.length === 0) return;

    if (this.scaleAction === ScaleAction.UP) {
      let cNode = ftNodes[0];

      // if the candidate nodes are more than one, find the candidate nodes from the graph
      if (ftNodes.length > 1) {
        // get the candidate node by Um and Dm
        cNode = await this.getCandidateNodeByGraph(ftNodes, metricType, weight);
      }

      const taintNodes = Object.values(this.optiData.zonesNodes).flatMap((n) => {
        const nodes = n.nodes.filter((node) => node !== cNode);
        return nodes;
      });

      this.loggerOperation.info(`Add replica pod of deployment ${this.optiData.deployment} to the node: ${cNode}`);
      await this.k8s.createReplicaPodToSpecificNode(this.optiData.deployment, this.optiData.namespace, taintNodes);

      const writeData = {
        deployment: this.optiData.deployment,
        namespace: this.optiData.namespace,
      };
      this.loggerOperation.info(
        `In the next cycle apply traffic distribution rules on deployment ${this.optiData.deployment}`
      );
      this.fileSystem.appendData(writeData);
    }

    if (this.scaleAction === ScaleAction.DOWN) {
      const cNode = ftNodes[0];

      const deleteNode = this.optiData.replicaPods.filter((node) => node.node === cNode);
      console.log(deleteNode);

      const removeRandomPod = Math.floor(Math.random() * deleteNode.length);
      const deletePod = deleteNode[removeRandomPod].pod;

      await this.k8s.removeReplicaPodToSpecificNode(this.optiData.deployment, deletePod, this.optiData.namespace);
      const writeData = {
        deployment: this.optiData.deployment,
        namespace: this.optiData.namespace,
      };

      this.fileSystem.appendData(writeData);
    }
  }

  async getCandidateNodeByGraph(ftNodes: string[], metricType: MetricsType, weight: MetricWeights) {
    const upstream = await this.prom.getUpstreamPodGraph(this.optiData.deployment, this.optiData.namespace);

    const downstream = await this.prom.getDownstreamPodGraph(this.optiData.deployment, this.optiData.namespace);

    if (upstream && upstream.length > 0) {
      return this.getCandidateNodeByUm(upstream, ftNodes);
    }

    if (downstream && downstream.length > 0) {
      return this.getCandidateNodeByDm(downstream, ftNodes);
    }

    return this.getCandidateNodeByLFU(ftNodes, metricType, weight);
  }

  getCandidateNodeByLFU(nodes: string[], metricType: MetricsType, weight: MetricWeights) {
    const ftNodes = this.optiData.nodeMetrics.filter((node) => nodes.some((n) => n === node.name));

    const nodeLFU = OptiScalerMapper.toLFUNodes(ftNodes, metricType, weight);
    return nodeLFU[0].name;
  }

  getCandidateNodeByUm(upstream: GraphDataRps[], ftNodes: string[]) {
    // check if the upstream rs pods nodes is candidate node
    let upstreamNodes = upstream.filter((node) => ftNodes.includes(node.node));

    // if do not be candidate node then choose the cNode by the node that has the lower latency
    if (upstreamNodes.length === 0) {
      upstreamNodes = upstream.map((node) => node);
    }

    // get nodes latency from the candidate nodes
    const nodesLatency = ftNodes
      .map((node) => {
        // Find the latency where the upstream node sends traffic to this node
        const latency = this.optiData.nodesLatency.filter(
          (n) => n.to === node && upstreamNodes.some((um) => um.node === n.from)
        );

        return latency;
      })
      .flatMap((n) => n);

    console.log(nodesLatency);

    const weights = calculateWeightsUm(upstreamNodes, ftNodes, nodesLatency);

    // Filter out edges with zero weight unless the 'to' node is in upstreamNodes,
    // effectively prioritizing zero-weight edges that lead to upstream nodes
    const upstreamNodeSet = new Set(upstreamNodes.map((n) => n.node));
    const prioritizedWeights = weights.filter((w) => upstreamNodeSet.has(w.from));

    const sortByLowestWeight = prioritizedWeights.toSorted((a, b) => a.weight - b.weight);

    console.log(sortByLowestWeight);

    // return the node with the lowest weight
    return sortByLowestWeight[0].to;
  }

  getCandidateNodeByDm(downstream: GraphDataRps[], ftNodes: string[]) {
    // check if the downstream rs pods nodes is candidate node
    let dmNodes = downstream.filter((node) => ftNodes.includes(node.node));

    // if do not be candidate node then choose the cNode by LFU
    if (dmNodes.length === 0) {
      dmNodes = downstream.map((node) => node);
    }

    // get nodes latency from the candidate nodes
    const nodesLatency = ftNodes
      .map((node) => {
        // Find the latency where the upstream node sends traffic to this node
        const latency = this.optiData.nodesLatency.filter(
          (n) => n.to === node && dmNodes.some((dm) => dm.node === n.from)
        );

        return latency;
      })
      .flatMap((n) => n);

    console.log(nodesLatency);

    const weights = calculateWeightsDm(dmNodes, ftNodes, nodesLatency);
    console.log(weights);
    // Filter out edges with zero weight unless the 'to' node is in dmNodes,
    // effectively prioritizing zero-weight edges that lead to dowsntream nodes
    const dmNodeSet = new Set(dmNodes.map((n) => n.node));
    const prioritizedWeights = weights.filter((w) => dmNodeSet.has(w.from));

    const sortByLowestWeight = prioritizedWeights.toSorted((a, b) => a.weight - b.weight);

    // return the node with the lowest weight
    return sortByLowestWeight[0].to;
  }

  getFaultToleranceNodes(metricType: MetricsType, weight: MetricWeights) {
    if (this.scaleAction === ScaleAction.UP) {
      return this.ft.getCandidateNodesToAdd();
    } else {
      return this.ft.getCandidateNodeToRemove(metricType, weight);
    }
  }
}
