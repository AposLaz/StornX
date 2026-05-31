---
id: load-tests
title: Load Tests
sidebar_label: Load Tests
slug: /benchmarks/load-tests
---

# Load Tests

Load tests apply **sustained, realistic traffic** to a healthy cluster and measure how StornX behaves over time on the four axes that matter: **latency, cost, replica count, resource use**.

Two workloads were exercised - the same on both: Online Boutique and the OpenTelemetry Demo.

## Online Boutique under load

<p align="center">
  <img src="/StornX/img/results/rps-ob.png" alt="Online Boutique request rate during load test" width="720" />
</p>

End-to-end **latency** drops with StornX once the controller has had a few cycles to re-place replicas toward their busiest neighbours:

<p align="center">
  <img src="/StornX/img/results/load-ob/latency.png" alt="OB latency under load" width="720" />
</p>

The **cost** picture (cross-AZ egress bytes) drops in proportion to the locality improvement:

<p align="center">
  <img src="/StornX/img/results/load-ob/egress.png" alt="OB egress under load" width="720" />
</p>

<p align="center">
  <img src="/StornX/img/results/load-ob/cost.png" alt="OB total cost under load" width="720" />
</p>

StornX achieves this without inflating the **replica count** - in fact, it keeps the cluster steadier:

<p align="center">
  <img src="/StornX/img/results/load-ob/replicas.png" alt="OB replica count under load" width="720" />
</p>

<p align="center">
  <img src="/StornX/img/results/load-ob/cpu.png" alt="OB CPU utilisation under load" width="720" />
</p>

## OpenTelemetry Demo under load

The OpenTelemetry Demo has a denser service graph, so the locality optimization has more to chew on.

<p align="center">
  <img src="/StornX/img/results/rps-otel.png" alt="OTel demo request rate" width="720" />
</p>

<p align="center">
  <img src="/StornX/img/results/concurrent-users-otel.png" alt="OTel demo concurrent users" width="720" />
</p>

Latency:

<p align="center">
  <img src="/StornX/img/results/load-otel/latency.png" alt="OTel latency under load" width="720" />
</p>

Cost / egress:

<p align="center">
  <img src="/StornX/img/results/load-otel/egress.png" alt="OTel egress under load" width="720" />
</p>

<p align="center">
  <img src="/StornX/img/results/load-otel/cost.png" alt="OTel cost under load" width="720" />
</p>

Replicas + CPU:

<p align="center">
  <img src="/StornX/img/results/load-otel/replicas.png" alt="OTel replicas under load" width="720" />
</p>

<p align="center">
  <img src="/StornX/img/results/load-otel/cpu.png" alt="OTel CPU under load" width="720" />
</p>

## How to read these plots

- **Lower latency at the same replica count** is the strongest evidence that StornX's placement is doing useful work - the application is the same, the load is the same, only *where* the Pods live changed.
- **Lower egress at the same throughput** is the strongest evidence that locality preservation in OptiBalancer is doing useful work - the traffic was already there, it just stopped crossing AZ boundaries.
- **Flatter replica curves** mean less HPA thrash, which means less cold-start tax in your real applications.

Continue with [Stress Tests](./stress-tests) to see how the controller behaves at the saturation limit, and [Availability](./availability) to see how it behaves during zone degradation.
