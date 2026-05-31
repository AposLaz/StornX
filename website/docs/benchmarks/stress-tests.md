---
id: stress-tests
title: Stress Tests
sidebar_label: Stress Tests
slug: /benchmarks/stress-tests
---

# Stress Tests

Stress tests push the cluster toward the **saturation limit**. The intent is not to find the maximum RPS - it is to characterise *how* the system behaves when it cannot serve all requests on time: does it degrade smoothly, oscillate, or fail noisily?

## Online Boutique under stress

End-to-end latency tail under stress:

<p align="center">
  <img src="/StornX/img/results/stress-ob/latency.png" alt="OB stress latency" width="720" />
</p>

Egress bytes (the cost dimension stays meaningful under stress because chatty graphs amplify):

<p align="center">
  <img src="/StornX/img/results/stress-ob/egress-traffic.png" alt="OB stress egress" width="720" />
</p>

<p align="center">
  <img src="/StornX/img/results/stress-ob/cost.png" alt="OB stress cost" width="720" />
</p>

Replicas + CPU - note the smoother curves under StornX, indicating the OptiBalancer is absorbing imbalance instead of pushing it into the autoscaler:

<p align="center">
  <img src="/StornX/img/results/stress-ob/replicas.png" alt="OB stress replicas" width="720" />
</p>

<p align="center">
  <img src="/StornX/img/results/stress-ob/cpu.png" alt="OB stress CPU" width="720" />
</p>

## OpenTelemetry Demo under stress

Latency:

<p align="center">
  <img src="/StornX/img/results/stress-otel/latency.png" alt="OTel stress latency" width="720" />
</p>

Egress + cost:

<p align="center">
  <img src="/StornX/img/results/stress-otel/egress-traffic.png" alt="OTel stress egress" width="720" />
</p>

<p align="center">
  <img src="/StornX/img/results/stress-otel/cost.png" alt="OTel stress cost" width="720" />
</p>

Replicas + CPU:

<p align="center">
  <img src="/StornX/img/results/stress-otel/replicas.png" alt="OTel stress replicas" width="720" />
</p>

<p align="center">
  <img src="/StornX/img/results/stress-otel/cpu.png" alt="OTel stress CPU" width="720" />
</p>

## Reading the stress curves

When a system is pushed past its sweet spot, three failure modes are common:

1. **Cliff** - throughput collapses suddenly when one component saturates.
2. **Oscillation** - the autoscaler over-corrects, replica counts swing wildly, latency follows.
3. **Graceful degradation** - latency rises smoothly, throughput plateaus, no errors.

StornX consistently produces **graceful degradation** in both benchmark applications. The reason is the architectural choice that runs through everything: OptiBalancer **steps** toward the target distribution rather than jumping to it, and OptiScaler enforces a cooldown after every scale action. Together, those guards prevent the oscillation pattern that the HPA-only baseline exhibits as load rises.
