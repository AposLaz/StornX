---
id: use-cases
title: Use Cases
sidebar_label: Use Cases
slug: /guides/use-cases
---

# Use Cases

StornX is opinionated, but its scope is narrow enough that it slots into a wide range of platforms. The patterns below are the ones it was designed for.

## 1. Multi-AZ microservices on EKS / GKE / AKS

**The situation.** A cluster spans 3 availability zones. Workloads were deployed with `topologySpreadConstraints` so that Pods are roughly evenly spread, but the service graph is dense - a single user request traverses 6–10 services. Cross-zone hops add up to dozens of milliseconds and inflate the monthly egress bill.

**How StornX helps.**

- OptiScaler keeps the fault-tolerance guarantee (replicas in ≥ N zones) but co-locates additional replicas next to their busiest neighbour.
- OptiBalancer biases traffic toward in-zone replicas, falling back gracefully when an in-zone replica is overloaded.
- Cross-AZ request rate drops, P95 drops, egress cost drops - **without** anyone editing `topologySpreadConstraints` by hand.

## 2. Replacing manual `DestinationRule` weight tuning

**The situation.** An SRE team manually maintains a `DestinationRule` with weighted subsets to keep "canary" or "preferred" zones receiving the right share of traffic. Every deployment, every scale event, every zone hiccup means a manual or scripted update - and a stale weight in production for as long as it takes humans to react.

**How StornX helps.** OptiBalancer continuously rewrites those weights based on live signals. The SRE team retains full ownership of the `DestinationRule` (subsets, TLS policy, outlier detection); only the **weights** are owned by StornX, and the change is **gradual** by design so a misbehaving signal cannot create a traffic cliff.

## 3. Reducing inter-AZ data-transfer cost

**The situation.** Finance flags inter-AZ data transfer as the second-largest line item on the cluster's cloud bill. The application team cannot reasonably collapse the service graph; placement is the only lever left.

**How StornX helps.** The combination of communication-aware placement (OptiScaler) and locality-preferring routing (OptiBalancer) directly attacks cross-AZ chatter. Validated reduction in the StornX benchmarks ranges from meaningful to dramatic depending on the chattiness of the graph - see [Validation & Benchmarks](../benchmarks/overview).

## 4. Stabilising a service with an HPA that "scales too much"

**The situation.** A Deployment with an HPA on CPU oscillates between 4 and 12 replicas during the day. The HPA is doing its job - the underlying problem is that **half** of those replicas are in the wrong zone and effectively useless because their downstream dependency is elsewhere.

**How StornX helps.** OptiScaler does not fight the HPA - it lets the HPA decide *how many* replicas. But it ensures the next replica created lands in the **right** zone, which means the HPA needs fewer of them to absorb the same load. The Deployment quietly converges to a smaller, well-placed replica count.

## 5. Graceful zone-degradation handling

**The situation.** An AZ experiences elevated latency (provider-side network event, noisy neighbour, infrastructure maintenance). Default Istio load-balancing keeps sending its share of traffic there until circuit breakers trip - at which point users see errors.

**How StornX helps.** OptiBalancer detects the rising P95 in the affected zone within one or two cycles and **gradually** shifts share toward the healthy zones. By the time circuit breakers would otherwise trip, traffic is already mostly diverted. When the zone recovers, weight is restored - also gradually.

## 6. Onboarding new microservices safely

**The situation.** A new microservice is rolled out and starts receiving production traffic. Its initial placement is whatever the default scheduler picked, which is often suboptimal compared to where its actual neighbours live.

**How StornX helps.** Within a few cycles, OptiScaler observes the new service's traffic pattern, and on the next scale event places its replicas correctly. No human action required, no day-2 retro-fit.

## 7. Cost-aware platforms (Kubecost, OpenCost users)

**The situation.** A platform team uses Kubecost to allocate cluster spend back to teams. They want to **reduce** the total bill without forcing every product team to refactor.

**How StornX helps.** StornX optimizes for one of the most expensive Kubernetes anti-patterns (cross-AZ chatter + over-provisioned replicas) at the platform layer. Product teams see no API or workflow change; the bill simply gets smaller. The repository even ships an opinionated [Kubecost values file](https://github.com/AposLaz/StornX/blob/main/addons/kubecost/values.yaml) to make before/after measurement straightforward.

## When **not** to use StornX

| Scenario                                       | Why                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Single-zone clusters                           | Placement value disappears; only adaptive routing remains.                |
| Stateful workloads (`StatefulSet`, leader-elected systems) | Not yet supported - on the [Roadmap](../roadmap).             |
| Batch / Job workloads                          | StornX targets long-running services.                                     |
| Hard pinning of every Pod                      | If your workloads use strict `nodeName` or rigid affinity, StornX has no degrees of freedom to use. |
| Clusters with no Prometheus                    | Required dependency.                                                      |

## Sample workloads in the repository

If you want to see StornX in action without bringing your own apps, the repo ships ready-to-deploy demos:

- **Google Online Boutique** - [`perf-tests/real_apps/online-boutique`](https://github.com/AposLaz/StornX/tree/main/perf-tests/real_apps/online-boutique) - classic 10-service e-commerce demo.
- **OpenTelemetry Demo** - [`perf-tests/real_apps/otel`](https://github.com/AposLaz/StornX/tree/main/perf-tests/real_apps/otel) - heavier microservice graph with observability built in.
- **`hello-world` sample** - [`addons/sample/app`](https://github.com/AposLaz/StornX/tree/main/addons/sample/app) - minimal app to validate the install.

Each comes with the matching `loadgenerator` and Istio configuration used in the validation tests.
