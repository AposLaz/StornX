---
id: faq
title: FAQ
sidebar_label: FAQ
slug: /faq
---

# Frequently Asked Questions

### Does StornX replace the Horizontal Pod Autoscaler?

No. When a Deployment already has an HPA, StornX **defers** to it - the HPA controls the replica count, and StornX only influences placement of the Pods it creates plus the traffic distribution between them. If a Deployment has no HPA, StornX's own scaler takes over.

### Does StornX replace the default `kube-scheduler`?

No. StornX picks the **target node** for a new replica and patches the Pod template with a `nodeName`/affinity hint. The default scheduler still does the binding. Two roles, one cooperative result.

### Do I need Istio?

For **OptiBalancer**, yes - it patches Istio `DestinationRule` objects. **OptiScaler** (autoscaling and placement) works without Istio, using only Prometheus + kube-state-metrics signals.

### Do I need to change my applications?

No. Applications run unmodified. They do not need to know StornX is in the cluster. No annotations, no sidecars, no init-containers, no labels are required on your workloads.

### Will StornX work on a single-AZ cluster?

Yes, but the placement value is limited. The biggest wins come from cross-AZ latency and cost reduction. Adaptive traffic balancing within a single zone is still valuable but smaller in magnitude.

### How safe is it to run in production?

StornX is built around **safety guards**: cooldown, HPA awareness, PDB awareness, minimum-delta gating, gradual step-shifts, zero-downtime rescheduling. The worst-case outcome of a misbehaving cycle is *no decision*, never a destructive one. It runs as a single replica so there is no split-brain risk.

### What happens if the StornX Pod crashes?

Kubernetes restarts it. While it is down, no optimization happens - but applications continue to serve traffic exactly as before, using the last computed DestinationRule weights and the last Pod layout. Recovery is automatic.

### Does StornX work with KEDA / VPA / Cluster Autoscaler?

Yes. KEDA is treated as an HPA. VPA can adjust requests concurrently - StornX reads requests fresh every cycle. Cluster Autoscaler is fully compatible and StornX does not block node scale-from-zero or consolidation.

### How does StornX decide *when* to write a DestinationRule?

It computes the L1 distance between the **current** weight distribution and the **proposed** one. If the distance is below `BALANCER_MIN_DELTA` (default 5 percentage-points), the write is skipped. This prevents API churn from sub-noise corrections.

### Can I roll back the changes StornX makes?

DestinationRule patches persist as-is after uninstall - they are normal Kubernetes resources. Roll back the Helm chart that owns each DR, or apply your original manifests. Pod placement changes are not "rolled back" in the traditional sense - they are just the current state of the cluster, no different from any other scheduling decision.

### What permissions does StornX require?

A `ClusterRole` with `get/list` on most resources, `patch` on `deployments/scale` and `destinationrules`, `create/delete` on `pods`, and read-only access to `hpa` and `pdb`. The Helm chart ships this exactly scoped.

### How much resource does the controller itself need?

A single Pod with `100m` CPU / `256Mi` memory is comfortable for the workloads we have tested. A cycle typically completes in 1–2 seconds.

### How is StornX licensed?

Apache 2.0. Full text in the [LICENSE](https://github.com/AposLaz/StornX/blob/main/LICENSE) file.

### Who builds StornX?

StornX is built and maintained by [Apostolos Lazidis](https://github.com/AposLaz). It is the practical outcome of the Master's thesis *"Latency Optimized Node and Traffic Scheduling in Kubernetes"* (Technical University of Crete), and continues to evolve as an open-source project.

### Where do I get help?

- Documentation - you are reading it.
- GitHub Issues - [github.com/AposLaz/StornX/issues](https://github.com/AposLaz/StornX/issues)
- Artifact Hub - [artifacthub.io/packages/helm/stornx/stornx](https://artifacthub.io/packages/helm/stornx/stornx)
