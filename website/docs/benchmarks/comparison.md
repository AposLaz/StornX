---
id: comparison
title: Comparison Summary
sidebar_label: Comparison
slug: /benchmarks/comparison
---

# Comparison Summary

The side-by-side a platform team usually wants for an internal review. Each row is the *direction* of the change observed in the benchmark workloads, not a single magic number - the numbers depend on the chattiness of your specific service graph, the number of AZs, and the cloud provider.

| Dimension                                | HPA + default scheduler + Istio random | HPA + Istio locality only (OptTraffic) | **StornX** (OptiScaler + OptiBalancer) |
| ---------------------------------------- | -------------------------------------- | -------------------------------------- | -------------------------------------- |
| End-to-end P95 under load                | Baseline                               | Slightly better                        | **Best**                               |
| Behaviour at saturation                  | Oscillation                            | Oscillation                            | **Graceful degradation**               |
| Cross-AZ data-transfer bytes             | Highest                                | Lower                                  | **Lowest**                             |
| Replica count needed for the same SLO    | Highest                                | Similar                                | **Lower**                              |
| Replica-hour cost                        | Highest                                | Similar                                | **Lower**                              |
| Error rate during zone degradation       | Visible spike                          | Visible spike                          | **Near-zero**                          |
| Time to recover after Pod kills          | Long                                   | Long                                   | **Short**                              |
| Configuration surface                    | Many (HPA per service)                 | Many                                   | **One Helm release**                   |
| Application changes required             | None                                   | None                                   | **None**                               |

## Where each option still makes sense

- **HPA + random LB** is a perfectly reasonable starting point for a small cluster, a single AZ, or a workload with a flat graph (one or two services). The benefit StornX adds is proportional to the **complexity** of the service graph and the **distance** between zones.
- **OptTraffic-style locality routing** is a strict subset of what StornX does. If you cannot run any control loop in your cluster but you *can* tune `DestinationRule` weights by hand, this gets you part of the way.
- **StornX** is the right default when the cluster is multi-AZ, the service graph is non-trivial, and you have already accepted Istio + Prometheus as platform building blocks.

## What StornX gives you that the alternatives cannot

- **One coordinated decision** for placement *and* routing - the two are inextricably linked, but no other Kubernetes-native tool treats them together.
- **Adaptive damping** - the controller is fast enough to react and slow enough not to oscillate. This property emerges from the algorithm; it is not something you can recreate by chaining HPAs.
- **Honest deference** to existing primitives - HPA, PDB, default scheduler. StornX does not fight them; it fills the gaps they leave.
- **A single Helm chart, no application changes, no custom CRDs**. Operationally cheap to adopt and cheap to remove.

Browse the detailed plots one more time on the [Load](./load-tests), [Stress](./stress-tests), and [Availability](./availability) pages, then jump to [Installation](../getting-started/installation) when you are ready to try it on a cluster of your own.
