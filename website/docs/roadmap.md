---
id: roadmap
title: Roadmap
sidebar_label: Roadmap
slug: /roadmap
---

# Roadmap

StornX has a clear opinion of what it **is** today and a clear list of what it should become next. Everything below is on the table; nothing is committed to a calendar date.

## Near-term

### Per-Deployment scaling policies
Today, thresholds and weights are global to the controller. The next step is annotation-driven overrides so a `cart` service can have a 70 % CPU upper threshold while `recommendations` keeps the default 80 %.

### Per-Deployment routing aggressiveness
Same idea, applied to OptiBalancer - let a critical service opt into faster step sizes and a smaller dead-zone, without changing the platform-wide defaults.

### StatefulSet support
Extend OptiScaler's placement logic to `StatefulSet`-managed Pods. The challenge is respecting ordered start/stop semantics and PVC topology - important for databases, brokers, and leader-elected systems.

### Prometheus metrics for StornX itself
Expose StornX's own decisions (cycle duration, decisions per cycle, skipped scale events, DestinationRule patches per minute) as Prometheus metrics so they can be alerted on and dashboarded.

## Mid-term

### Server-only mode (no Istio required)
A configuration in which StornX uses only `kube-state-metrics` + cAdvisor signals. OptiBalancer is naturally disabled in this mode; OptiScaler keeps the placement and autoscaling benefits. Lowers the barrier to adoption for clusters that have not committed to a service mesh.

### Predictive scaling from historical traffic
Use the time-series Prometheus already stores to **anticipate** load surges instead of reacting to them. Pre-warm replicas in the right zone before the spike arrives. The control loop stays deterministic; the trigger gains a predictive component.

### Multi-namespace service-graph discovery
A request that traverses several namespaces is partially invisible to today's per-namespace cycle. Treat the service graph as truly cluster-wide while keeping decisions per-namespace.

### Built-in web UI
A small Docusaurus-served (or embedded) dashboard that shows the live service graph, current weights, recent decisions, and the next planned actions - for operators who want to understand at a glance what StornX is doing.

## Long-term

### Multi-cluster placement
Extend the placement decision across federated clusters - same algorithm, larger search space. Especially attractive for global active-active deployments with regional fail-over.

### Edge / fog topologies
The same controller can place workloads across edge sites where the cost of "cross-zone" is dramatically higher. The locality math already supports an arbitrary distance function - the missing piece is the topology data plane.

### Cluster Autoscaler cooperation
Today StornX is a friendly neighbour to the Cluster Autoscaler. The next step is collaboration: ask CA for a node in a *specific* zone when placement would be optimal but no capacity is available. This requires extending CA's API or running an opinionated provisioner.

### Policy plug-ins
A pluggable interface for custom placement strategies - for teams that need to encode constraints StornX cannot generalise (regulatory data-residency, hardware affinity, licensing).

## What is explicitly **not** on the roadmap

- **A custom service mesh.** StornX will continue to use the standard Istio DestinationRule API.
- **A custom scheduler.** The default kube-scheduler does the binding; StornX picks the target node.
- **Owning the metric pipeline.** Prometheus is the source of truth; StornX consumes it.
- **A machine-learning placement model.** Decisions stay deterministic and explainable.

## How to influence the roadmap

- File an issue at [github.com/AposLaz/StornX/issues](https://github.com/AposLaz/StornX/issues) describing the problem you have, not the feature you want - the more concrete the scenario, the easier it is to design a clean solution.
- Open a discussion on the same repo if you have a design idea or want to validate an integration before implementing it.
- Contributions are welcome under Apache 2.0 - see the [CONTRIBUTING guide](https://github.com/AposLaz/StornX/blob/main/README.md#contributing).
