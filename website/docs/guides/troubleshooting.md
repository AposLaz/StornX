---
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
slug: /guides/troubleshooting
---

# Troubleshooting

StornX is designed to fail **safely** - a misbehaving cycle simply produces no decision. The patterns below cover the questions support gets most often.

## "Nothing is happening"

**Symptoms.** The StornX Pod is `Running`, the logs look like cycles are ticking, but no replica counts or DestinationRule weights ever change.

**Common causes.**

1. **Your workloads are in a namespace that is not in `NAMESPACES`.** Check `kubectl get cm -n stornx -o yaml | grep NAMESPACES` and confirm the right namespaces are listed.
2. **Your monitored Deployments have no resource requests.** StornX cannot compute a utilisation percentage without a baseline. Add `resources.requests.cpu` and/or `memory` to your Pod templates.
3. **Your workloads are below thresholds.** All utilisation is between `METRICS_LOWER_THRESHOLD` and `METRICS_UPPER_THRESHOLD` - nothing to do.
4. **Every Deployment has an HPA.** With `SCALER_RESPECT_HPA=true` (default), StornX defers. OptiBalancer should still write - check its log lines.
5. **`BALANCER_MIN_DELTA` is too large.** Lower it to confirm OptiBalancer is computing distributions correctly.

## "StornX is too aggressive"

**Symptoms.** DestinationRules get patched every cycle, replica counts oscillate, application metrics look noisy.

**Common causes & fixes.**

| Cause                                       | Fix                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| Cycle is too frequent                       | Change `CRONJOB_EXPRESSION` to `*/2 * * * *` or longer                       |
| Cooldown too short                          | Raise `SCALER_COOLDOWN_SECONDS` to 120 or 180                                |
| Thresholds too close                        | Widen the gap between `METRICS_UPPER_THRESHOLD` and `METRICS_LOWER_THRESHOLD` |
| Balancer dead-zone too small                | Raise `BALANCER_MIN_DELTA` to 8–10                                           |
| Urgency too eager                           | Raise `BALANCER_URGENCY_THRESHOLD` (e.g. 70)                                |

## "Prometheus errors in the logs"

```
WARN  prometheus  query failed  error=connect ECONNREFUSED ...
```

- Confirm `PROMETHEUS_URL` is reachable **from inside the StornX Pod**:
  ```bash
  kubectl run curl --rm -it --image=curlimages/curl -n stornx -- \
    curl -s http://prometheus.monitoring.svc:9090/-/healthy
  ```
- Make sure the Service name resolves in the StornX namespace (cross-namespace Service DNS is the most common gotcha).
- If you use a Prometheus Operator, the Service might be `prometheus-k8s` or `prometheus-operated` - not just `prometheus`.

## "Istio metrics are missing"

`istio_requests_total` and `istio_request_duration_milliseconds_bucket` must be present in Prometheus.

```bash
kubectl exec -n stornx deploy/stornx -- \
  wget -qO- "$PROMETHEUS_URL/api/v1/query?query=istio_requests_total" | head
```

If the result is empty:

- The application namespace is **not labelled** `istio-injection=enabled`.
- The sidecars are present but the Prometheus scrape config does not include them.
- Telemetry v2 has been disabled in Istio config - re-enable it.

## "Replicas keep landing in the wrong zone"

**Probable causes.**

1. **Nodes are missing the `topology.kubernetes.io/zone` label.** Confirm with `kubectl get nodes --show-labels | grep zone`.
2. **The target zone has no nodes with enough free CPU/memory.** Check the StornX log line for `reason=no-capacity-in-zone`.
3. **A `nodeAffinity` on your Pod template excludes the chosen zone.** StornX honours affinities; if your manifest forbids a zone, OptiScaler will avoid it.

## "Scale-down never happens"

**Probable causes.**

1. **A `PodDisruptionBudget` blocks it.** Check the log line `Skipping scale down - would violate Pod Disruption Budget`.
2. **An HPA is managing the Deployment.** StornX defers to it.
3. **Metric never drops below `METRICS_LOWER_THRESHOLD`.** Verify the actual utilisation in Prometheus.

## "I want to disable StornX without uninstalling"

Scale it to zero:

```bash
kubectl scale -n stornx deploy/stornx --replicas=0
```

The Pod stops, cycles stop, no changes are made. Scale back to `1` to resume. Already-written DestinationRule weights remain in place.

## "I want to revert a DestinationRule that StornX modified"

StornX patches `DestinationRule` weights but never removes the resource. Either:

```bash
# inspect what StornX wrote
kubectl get destinationrule -n my-app my-dr -o yaml

# revert manually
kubectl apply -f ./my-original-dr.yaml

# or roll back the chart that owns the DR
helm rollback my-app <prev-revision>
```

## Collecting a support bundle

If you need help on the issue tracker, include:

```bash
# StornX state
kubectl get pods,svc,cm -n stornx
helm get values stornx -n stornx > stornx-values.yaml
kubectl logs -n stornx -l app.kubernetes.io/name=stornx --tail=500 > stornx.log

# Cluster context
kubectl get nodes --show-labels > nodes.txt
kubectl get destinationrule -A > dr.txt
kubectl get deployments -A -o wide > deployments.txt
```

Open an issue at [github.com/AposLaz/StornX/issues](https://github.com/AposLaz/StornX/issues) with the bundle attached.
