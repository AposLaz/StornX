---
id: configuration
title: Configuration Reference
sidebar_label: Configuration
slug: /getting-started/configuration
---

# Configuration Reference

StornX is configured entirely through environment variables, all exposed as Helm chart values. This page is the **single source of truth** for what each variable does, what its default is, and when you would change it.

> If you are not sure how a value affects behaviour, **keep the default**. Every default has been validated on multi-AZ production-like workloads.

## Core runtime

| Variable               | Default      | What it controls                                                |
| ---------------------- | ------------ | --------------------------------------------------------------- |
| `ENV`                  | `production` | `production` (in-cluster) or `development` (local kubeconfig)   |
| `APP_PORT`             | `3000`       | HTTP port for health endpoints                                  |
| `NAMESPACES`           | `default`    | Comma-separated namespaces to monitor                           |
| `PROMETHEUS_URL`       | `http://storn-prometheus-server.stornx.svc.cluster.local` | Prometheus endpoint StornX queries |
| `CRONJOB_EXPRESSION`   | `* * * * *`  | Cron schedule of the optimization loop                          |
| `LOCALITY_LABELS_CRON` | `* * * * *`  | Cron schedule for refreshing node zone labels                   |

## Metrics & thresholds

| Variable                  | Default | What it controls                                                          |
| ------------------------- | ------- | ------------------------------------------------------------------------- |
| `METRICS_TYPE`            | `memory`| Primary scaling signal: `cpu` or `memory`                                |
| `METRICS_UPPER_THRESHOLD` | `80`    | Utilisation % above which scale-up / rescheduling is considered           |
| `METRICS_LOWER_THRESHOLD` | `20`    | Utilisation % below which scale-down is considered                        |
| `RESPONSE_TIME_THRESHOLD` | `100`   | Target P95 response time in ms - drives rerouting urgency                 |
| `CPU_WEIGHT`              | `50`    | Weight (0–100) of CPU when ranking candidate nodes                        |
| `MEMORY_WEIGHT`           | `50`    | Weight (0–100) of memory when ranking candidate nodes                     |

Setting `METRICS_TYPE=cpu` is the right default for compute-bound services (encoders, image processors). Use `memory` for caches, databases-in-a-box, and language runtimes with large heaps.

## OptiBalancer tuning

These five values control how aggressively traffic weights are rewritten. The defaults are safe for production. See the [Tuning guide](../guides/tuning) for when to change them.

| Variable                       | Default | What it controls                                                       |
| ------------------------------ | ------- | ---------------------------------------------------------------------- |
| `BALANCER_MIN_DELTA`           | `5`     | Minimum L1 delta (in percentage points, summed across routes) to apply a DestinationRule patch |
| `BALANCER_MIN_STEP_SIZE`       | `5`     | Floor of the per-cycle correction (pp) when imbalance is small         |
| `BALANCER_MAX_STEP_SIZE`       | `20`    | Ceiling of the per-cycle correction (pp) when imbalance is severe      |
| `BALANCER_URGENCY_THRESHOLD`   | `50`    | L1 delta at which the step size saturates to `MAX_STEP_SIZE`           |
| `BALANCER_EPSILON`             | `1`     | Per-route convergence tolerance (pp) - below this, a route is "done"   |

### Rule of thumb

| Symptom                                       | Try                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------- |
| Traffic oscillates between replicas           | Increase `MIN_STEP_SIZE` floor, increase `MIN_DELTA` dead-zone      |
| Slow to react to a degraded replica           | Decrease `URGENCY_THRESHOLD`, increase `MAX_STEP_SIZE`              |
| Too many `DestinationRule` patches per minute | Increase `MIN_DELTA`                                                |
| Distribution never converges precisely        | Decrease `EPSILON`                                                  |

## Fault tolerance

| Variable        | Default | What it controls                                                |
| --------------- | ------- | --------------------------------------------------------------- |
| `FT_MAX_ZONES`  | `3`     | Maximum number of zones across which replicas are spread        |

The setting acts as both a **floor** (StornX spreads replicas until this many zones are covered) and a **ceiling** (it never spreads further than this even if more zones exist).

## Scaler safety guards

| Variable                  | Default | What it controls                                                |
| ------------------------- | ------- | --------------------------------------------------------------- |
| `SCALER_COOLDOWN_SECONDS` | `60`    | Minimum seconds between two scaling actions on the same Deployment |
| `SCALER_RESPECT_HPA`      | `true`  | Defer to an HPA if one targets the Deployment                   |
| `SCALER_RESPECT_PDB`      | `true`  | Block scale-down that would violate a PodDisruptionBudget       |

## Helm chart values

The full chart values (resources, probes, RBAC, image, tolerations) live in [`.kubernetes/helm/values.yaml`](https://github.com/AposLaz/StornX/blob/main/.kubernetes/helm/values.yaml). The `config:` block of values maps **1:1** to the environment variables on this page.

Example:

```yaml
config:
  namespaces: "shop,checkout"
  metricsType: "cpu"
  metricsUpperThreshold: "75"
  metricsLowerThreshold: "25"
balancer:
  minDelta: 8
  minStepSize: 3
  maxStepSize: 25
faultTolerance:
  maxZones: 3
scaler:
  cooldownSeconds: 90
  respectHpa: true
  respectPdb: true
resources:
  requests: { cpu: "50m", memory: "128Mi" }
  limits:   { cpu: "200m", memory: "256Mi" }
```

## What you should monitor in your own dashboards

Even though StornX does not yet expose Prometheus metrics of its own, you can build a complete picture from existing signals:

- **Istio P95 per service** - should trend down or stay flat after install.
- **Cross-AZ request rate** (`istio_requests_total` filtered by source/destination zone label) - should drop.
- **Replica counts per Deployment** - should be stable, no thrashing.
- **`DestinationRule` patch rate** - should be low (a handful per minute at most).
- **StornX Pod logs** - every decision is one structured line.

Continue with the [Use Cases](../guides/use-cases) guide to map these values to real scenarios.
