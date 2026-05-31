Reduce response time between your microservices by using StornX.

# StornX

StornX is an application which is responsible to re-schedule replica Pods of a **Deployment**, **so as to reduce response time between applications that communicate**. Deployment in Kubernetes provides a high-level abstraction necessary for managing the desired state and lifecycle of Pods. Deployment is a way to create multiple replica Pods, ensuring that the desired number will maintain the same at all times.

# User Guide

### Environment

All environment variables and their default values

| Name                      | type     | Default Value  | Description                                                                                                                                                                                                   |
| ------------------------- | -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENV`                     | `string` | `production`   | Run mode: `production` or `development` (affects setup and logging)                                                                                                                                            |
| `APP_PORT`                | `string` | `3000`         | Port on which the app listens                                                                                                                                                                                  |
| `NAMESPACES`              | `string` | `default`      | Comma-separated namespaces to monitor (e.g. `ns1,ns2`)                                                                                                                                                        |
| `PROMETHEUS_URL`          | `string` | `http://storn-prometheus-server.stornx.svc.cluster.local` | Full URL to Prometheus used for metrics collection                                                                                               |
| `CRONJOB_EXPRESSION`      | `string` | `* * * * *`    | Cron expression controlling the scheduler run frequency                                                                                                                                                       |
| `LOCALITY_LABELS_CRON`    | `string` | `* * * * *`    | Cron expression for scraping locality/zone labels used by fault-tolerance calculations                                                                                                                        |
| `METRICS_TYPE`            | `string` | `memory`       | Metrics source type: `cpu` or `memory` (affects weighting and selection in OptiScaler)                                                                                                                        |
| `METRICS_UPPER_THRESHOLD` | `string` | `80`           | Upper threshold percentage (0-100) for triggering scale-up / rescheduling decisions                                                                                                                            |
| `METRICS_LOWER_THRESHOLD` | `string` | `20`           | Lower threshold percentage (0-100) for scale-down / conservative behavior                                                                                                                                     |
| `RESPONSE_TIME_THRESHOLD` | `number` | `100`          | Target response time (ms). Nodes/pods exceeding this are considered for rescheduling (used in Istio mode)                                                                                                     |
| `CPU_WEIGHT`              | `number` | `50`           | Weight (0-100) for CPU when computing combined metric score                                                                                                                                                  |
| `MEMORY_WEIGHT`           | `number` | `50`           | Weight (0-100) for Memory when computing combined metric score                                                                                                                                               |
| `BALANCER_MIN_DELTA`      | `number` | `5`            | Minimum L1 delta to trigger a traffic balancing (DestinationRule) update                                                                                                                                     |
| `BALANCER_MIN_STEP_SIZE`  | `number` | `5`            | Minimum step size for gradual traffic shifts                                                                                                                                                                 |
| `BALANCER_MAX_STEP_SIZE`  | `number` | `20`           | Maximum step size for urgent traffic shifts                                                                                                                                                                  |
| `BALANCER_URGENCY_THRESHOLD` | `number` | `50`        | Delta threshold at which max step is applied                                                                                                                                                                 |
| `BALANCER_EPSILON`        | `number` | `1`            | Epsilon for convergence in balancer calculations                                                                                                                                                             |
| `FT_MAX_ZONES`            | `number` | `3`            | Maximum number of zones to distribute replicas across for fault tolerance                                                                                                                                     |
| `SCALER_COOLDOWN_SECONDS` | `number` | `60`           | Minimum seconds between two scaling actions on the same Deployment                                                                                                                            |
| `SCALER_RESPECT_HPA`      | `boolean`| `true`         | Defer to an HPA if one targets the Deployment                                                                                                                                                 |
| `SCALER_RESPECT_PDB`      | `boolean`| `true`         | Block scale-down that would violate a PodDisruptionBudget                                                                                                                                     |

# Features

## Balancer Configuration (OptiBalancer)

The OptiBalancer gradually redistributes traffic across nodes by updating Istio **DestinationRules**. Instead of jumping to the ideal distribution in one shot, it applies **adaptive damping** - small corrections when the imbalance is minor, larger corrections when it is severe. Five parameters control this behaviour:

### How the algorithm works (simplified)

1. **`calculateTraffic()`** computes the ideal *target* distribution from latency, load, replica counts and P95 response times.
2. **`stepTowardTarget()`** moves the *current* distribution toward the target using an adaptive step size that scales with urgency.
3. If the resulting change is too small (below `BALANCER_MIN_DELTA`), the DestinationRule update is **skipped** to avoid Kubernetes API churn.

The adaptive step formula:

```
urgency = min(1, delta / BALANCER_URGENCY_THRESHOLD)
step    = BALANCER_MIN_STEP_SIZE + urgency × (BALANCER_MAX_STEP_SIZE − BALANCER_MIN_STEP_SIZE)
```

Each from→to route is then shifted by at most `step` percentage-points per cycle, unless the remaining difference is ≤ `BALANCER_EPSILON` (in which case the route is considered converged and left unchanged).

---

### `BALANCER_MIN_DELTA` - Dead-zone gate (default `5`)

After computing the next stepped distribution, the **L1 distance** (sum of absolute percentage-point differences across all routes) between the *current live DestinationRule* and the *proposed* one is calculated. If the distance is **less than this value**, the update is **skipped entirely**.

This prevents writing trivially different DestinationRules every cycle.

| Value | Effect |
|---|---|
| Too low (0–1) | Every micro-change triggers a DR update → excessive Istio API writes and potential traffic oscillation. |
| Too high (30+) | The balancer rarely applies updates → traffic stays stale even when conditions have meaningfully changed. |

### `BALANCER_MIN_STEP_SIZE` - Minimum step (default `5`)

The **floor** of the adaptive step size. When the imbalance (delta) is very small and urgency is near zero, each route can still shift by up to this many percentage-points per cycle.

| Value | Effect |
|---|---|
| Too low (1) | Convergence is extremely slow - many cycles needed to correct even moderate imbalances. |
| Too high (≥ `MAX_STEP_SIZE`) | Adaptive scaling is disabled - the system always makes large jumps, risking oscillation. |

### `BALANCER_MAX_STEP_SIZE` - Maximum step (default `20`)

The **ceiling** of the adaptive step size, used when urgency saturates to 1.0 (i.e. delta ≥ `URGENCY_THRESHOLD`). This is the largest percentage-point shift any single route can undergo in one cycle.

| Value | Effect |
|---|---|
| Too low (same as `MIN_STEP_SIZE`) | The system cannot react quickly to sudden load shifts or node degradation. |
| Too high (50+) | Aggressive one-shot rerouting under high urgency → possible over-correction and load spikes. |

### `BALANCER_URGENCY_THRESHOLD` - Urgency ramp (default `50`)

The L1 delta value at which urgency saturates to 1.0. Below this, the step is linearly interpolated between `MIN_STEP_SIZE` and `MAX_STEP_SIZE`.

**Example** (with defaults `minStep=5`, `maxStep=20`, `urgencyThreshold=50`):

| L1 Delta | Urgency | Effective Step |
|---|---|---|
| 10 | 0.20 | 8.0 |
| 25 | 0.50 | 12.5 |
| 50+ | 1.00 | 20.0 |

| Value | Effect |
|---|---|
| Too low (5–10) | Almost any delta saturates urgency → the system always jumps at `MAX_STEP_SIZE`, losing gradual convergence. |
| Too high (200+) | Urgency rarely reaches 1.0 → even severe imbalances are corrected sluggishly at near-`MIN_STEP_SIZE`. |

### `BALANCER_EPSILON` - Per-route convergence tolerance (default `1`)

When the absolute difference between the current and target percentage for a **single** route is ≤ epsilon, that route is left unchanged. This prevents rounding jitter at the tail end of convergence (e.g. toggling 33% ↔ 34% forever).

| Value | Effect |
|---|---|
| Too low (0) | Sub-1% rounding artefacts trigger changes every cycle → perpetual micro-oscillation. |
| Too high (10+) | Differences of several percentage-points are silently ignored → the distribution never fully converges. |

---

> **Tip:** If you are not sure how these affect your system, **keep the defaults**. Tuning is advanced and should be done gradually while monitoring application latency, error rates and Istio DestinationRule update frequency.

- Currently, StornX supports only the rescheduling of **Deployments**.
- Preserve fault-tolerance by ensuring that replica Pods are located in different Zones and Nodes, and avoiding placing all replica Pods in the same Zone or Node.
- Currently, StornX moves replica Pods to specific Nodes by collecting response time metrics from Istio using Prometheus. In [ROADMAP](#ROADMAP) is the user to have the option to use only metrics from _kube-state-metrics_, without the needed to install Istio.
- When rescheduling happens wait until `new replica` is on State running and after delete the `old replica` Pod, ensuring **zero downtime**

# How StornX works?

Definition table

| Variables                 | Definitions                                         |
| ------------------------- | --------------------------------------------------- |
| `Upstream` or `Um` Pods   | the pods that send requests                         |
| `Downstream` or `Dm` Pods | the pods that receive requests from `Upstream` Pods |

### Limitations

- probes and healthchecks may need more time than usual. Probes is a proble that the exchange of recent pods may take longer time than usual. We have to get it into account.

### The problem

### Solution

StornX collects metrics from Prometheus to determine if a replica Pod needs to be moved to another Node. If it finds replica Pods with a response time higher than the defined `RESPONSE_TIME_THRESHOLD` threshold, these Pods will be rescheduled. Sometimes, having multiple replica Pods for microservices is crucial to maintaining communication in the different components of the applications.

# ROADMAP

## 1. ReScheduling using istio

-

## 2. From the kiali graph read more namespaces than one

An application could connect with many microservices in different namespaces. THis feature should be TODO

## 2. Rescheduling using only k8s server metrics

- User will have the option to use only Istio mode or Server mode. With the server mode all metrics will be collected by **kube-state-metrics**

# Scope

Scope of this application is to reschedule pods to specific nodes, in case that 2 pods communicates a lot.
