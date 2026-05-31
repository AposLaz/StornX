---
id: tuning
title: Tuning Guide
sidebar_label: Tuning
slug: /guides/tuning
---

# Tuning Guide

The defaults shipped in the Helm chart converge on every workload we have tested. This guide is for the day you want to push StornX further - to react faster, write less often, or trade resilience for efficiency more aggressively.

## Tuning principles

1. **Change one value at a time.** Behaviour is coupled; changing two values together makes regressions hard to attribute.
2. **Observe at least one full hour.** OptiBalancer is a converging controller - a single cycle is not enough to judge the effect.
3. **Watch `DestinationRule` patch rate.** If it spikes after a change, you over-tuned.
4. **Keep `RESPONSE_TIME_THRESHOLD` realistic.** Setting it lower than your application's actual P95 will keep OptiBalancer permanently in "urgent" mode.

## Knob → effect cheat-sheet

### Reacting faster to a degraded replica

| Change                                       | Effect                                                  |
| -------------------------------------------- | ------------------------------------------------------- |
| `BALANCER_URGENCY_THRESHOLD` ↓ (e.g. `30`)   | Step size saturates sooner - bigger corrections earlier |
| `BALANCER_MAX_STEP_SIZE` ↑ (e.g. `30`)       | Larger maximum correction per cycle                     |
| `CRONJOB_EXPRESSION` more frequent (e.g. `*/30 * * * * *`) | More chances to react per minute        |

### Cutting `DestinationRule` API churn

| Change                                       | Effect                                                  |
| -------------------------------------------- | ------------------------------------------------------- |
| `BALANCER_MIN_DELTA` ↑ (e.g. `10`)           | Larger dead-zone before a write is applied              |
| `BALANCER_EPSILON` ↑ (e.g. `2`)              | Each route converges with looser tolerance              |
| `BALANCER_MIN_STEP_SIZE` ↑ (e.g. `8`)        | Small imbalances are corrected in one or two steps      |

### Spreading replicas across more zones

| Change                                       | Effect                                                  |
| -------------------------------------------- | ------------------------------------------------------- |
| `FT_MAX_ZONES` ↑                             | Replicas are spread across more zones before co-locating |

### Letting the HPA drive replica count alone

| Change                                       | Effect                                                  |
| -------------------------------------------- | ------------------------------------------------------- |
| `SCALER_RESPECT_HPA=true` (default)          | StornX never scales a Deployment with an HPA            |
| Avoid creating a custom HPA                  | StornX is free to scale based on the metric of your choice |

### Avoiding scaling thrash

| Change                                       | Effect                                                  |
| -------------------------------------------- | ------------------------------------------------------- |
| `SCALER_COOLDOWN_SECONDS` ↑ (e.g. `180`)     | Longer settle time between two scale actions            |
| Wider band between `METRICS_LOWER_THRESHOLD` and `METRICS_UPPER_THRESHOLD` | Larger healthy zone - fewer scale events |

## Choosing the right primary metric

`METRICS_TYPE` picks the **trigger** signal for scaling:

- **`cpu`** for compute-heavy services (encoders, image processors, ML inference) - Pods crash on CPU starvation long before they run out of memory.
- **`memory`** for caches, JVM/Node runtimes with large heaps, and services with bursty memory profiles.

`CPU_WEIGHT` and `MEMORY_WEIGHT` decide how the **node-scoring** function blends the two signals once a scale-up is triggered. Set them equal (`50` / `50`) unless one signal is meaningless on your nodes (e.g. nodes with huge over-provisioned RAM and tight CPU).

## Tuning for cost vs. tuning for latency

| Goal                          | What to bias                                                                |
| ----------------------------- | --------------------------------------------------------------------------- |
| **Lowest possible P95**       | Wider thresholds (scale up at 65 %), smaller cooldown, lower urgency threshold |
| **Lowest possible bill**      | Narrower thresholds (scale up only at 85 %), longer cooldown, `FT_MAX_ZONES=2` if your SLO allows |
| **Balanced (recommended)**    | Keep all defaults                                                            |

## A realistic high-throughput preset

For a busy production cluster with chatty microservices and an aggressive SLO:

```yaml
config:
  cronjobExpression: "*/30 * * * * *"   # every 30 s
  metricsType: "cpu"
  metricsUpperThreshold: "70"
  metricsLowerThreshold: "25"
  responseTimeThreshold: 80
balancer:
  minDelta: 4
  minStepSize: 6
  maxStepSize: 25
  urgencyThreshold: 30
  epsilon: 1
scaler:
  cooldownSeconds: 90
faultTolerance:
  maxZones: 3
```

## A conservative cost-optimised preset

For a cost-sensitive backend with relaxed SLOs:

```yaml
config:
  cronjobExpression: "*/2 * * * *"      # every 2 min
  metricsType: "memory"
  metricsUpperThreshold: "85"
  metricsLowerThreshold: "30"
balancer:
  minDelta: 10
  minStepSize: 8
  maxStepSize: 18
  urgencyThreshold: 60
  epsilon: 2
scaler:
  cooldownSeconds: 180
faultTolerance:
  maxZones: 2
```

Always re-run your load test after applying a preset.
