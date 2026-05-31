---
id: prerequisites
title: Prerequisites
sidebar_label: Prerequisites
slug: /getting-started/prerequisites
---

# Prerequisites

StornX is a thin layer on top of components most production Kubernetes clusters already run. Before installing, make sure the following are in place.

## Cluster requirements

| Item                       | Minimum                          | Recommended                                   |
| -------------------------- | -------------------------------- | --------------------------------------------- |
| Kubernetes                 | 1.19                             | 1.27 or newer                                 |
| Cluster size               | 2 nodes                          | 3+ nodes spread across **at least 2 AZs**     |
| Helm                       | 3.2                              | 3.14 or newer                                 |
| Per-Pod CPU/memory requests on workloads | Yes - StornX uses requests as the % baseline | Yes                                  |
| Well-known zone labels on nodes (`topology.kubernetes.io/zone`) | Yes | Yes - every managed K8s sets these automatically |

> Single-AZ clusters are supported but most of StornX's placement value disappears. Adaptive traffic balancing still works.

## Required software

### 1. Prometheus

Any Prometheus that scrapes:

- **Istio sidecars** (for the service-graph and P95 metrics), and
- **cAdvisor** on every kubelet (for CPU/memory).

The Istio addons ship a ready-to-use Prometheus - see [`addons/istio/addons/prometheus.yaml`](https://github.com/AposLaz/StornX/blob/main/addons/istio/addons/prometheus.yaml). The Prometheus Operator / kube-prometheus-stack is equally fine.

### 2. Istio _(recommended)_

Istio is required for the **OptiBalancer** engine. Without Istio, OptiBalancer disables itself and only **OptiScaler** runs (autoscaling + placement).

Validated against **Istio 1.24.x**. Any reasonably recent release (1.20+) should work - the only API surface StornX uses is the stable v1 `DestinationRule`.

The repository ships an opinionated Istio install:

```bash
# from the repo root
helm install istio-base istio-helm/base -n istio-system --create-namespace
helm install istiod   istio-helm/istiod -n istio-system
helm install istio-ingress istio-helm/gateway -n istio-ingress --create-namespace
```

### 3. Kube-NetLag _(optional)_

[Kube-NetLag](https://github.com/AposLaz/kube-netlag) gives StornX precise node-to-node latency numbers. Without it, StornX still works using a "same zone = low latency" heuristic.

```bash
helm install kube-netlag oci://ghcr.io/aposlaz/charts/kube-netlag -n kube-netlag --create-namespace
```

## Required permissions

The Helm chart creates a `ClusterRole` with the minimum verbs StornX needs:

| Resource                   | Verbs                                |
| -------------------------- | ------------------------------------ |
| `pods`                     | `get`, `list`, `delete`, `create`    |
| `deployments` / `deployments/scale` | `get`, `list`, `patch`      |
| `nodes`                    | `get`, `list`                        |
| `horizontalpodautoscalers` | `get`, `list`                        |
| `poddisruptionbudgets`     | `get`, `list`                        |
| `destinationrules` (`networking.istio.io`) | `get`, `list`, `patch`  |
| `services` / `endpoints`   | `get`, `list`                        |

If your organisation requires a stricter policy, you can scope the `ClusterRole` to specific namespaces by switching to a `Role` + `RoleBinding` per monitored namespace.

## Workload requirements

For StornX to make accurate decisions, your monitored Deployments should:

1. **Declare resource requests.** `cpu` and `memory` requests are the baseline against which utilisation percentages are computed. Pods with no requests are treated as "unknown" and skipped.
2. **Be reachable through Istio** (if you want OptiBalancer to manage them) - typically meaning their namespace has `istio-injection=enabled`.
3. **Have a `Service`** in front of them - OptiBalancer routes through Services, not directly to Pods.

There is **no requirement** to add custom annotations, labels, sidecars, init-containers, or finalizers to your workloads.

## Optional but recommended

- **PodDisruptionBudgets** on your critical Deployments - StornX honours them automatically during scale-down.
- **kube-state-metrics** - improves the accuracy of HPA/PDB awareness checks.
- **A logging stack** (Loki, ELK, Cloud-native logging) - StornX produces structured JSON logs that are easy to query.

When all of this is in place, continue with [Installation](./installation).
