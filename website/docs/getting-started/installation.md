---
id: installation
title: Installation
sidebar_label: Installation
slug: /getting-started/installation
---

# Installation

StornX is distributed as a Helm chart on [Artifact Hub](https://artifacthub.io/packages/helm/stornx/stornx). A single command brings up the controller.

## 1. Add the Helm repository

```bash
helm repo add stornx https://aposlaz.github.io/StornX
helm repo update
```

## 2. Create the namespace

```bash
kubectl create namespace stornx
```

## 3. Install with defaults

```bash
helm install stornx stornx/stornx -n stornx
```

The defaults monitor the `default` namespace, talk to the in-cluster Prometheus at `http://storn-prometheus-server.stornx.svc.cluster.local`, and run the optimization loop every minute.

## 4. Install with custom settings

A more realistic install - monitor two business namespaces, point at your platform Prometheus, and pick CPU as the primary scaling metric:

```bash
helm install stornx stornx/stornx -n stornx \
  --set config.namespaces="online-boutique,otel-demo" \
  --set config.prometheusUrl="http://prometheus.monitoring.svc:9090" \
  --set config.metricsType="cpu" \
  --set config.metricsUpperThreshold="80" \
  --set config.metricsLowerThreshold="20"
```

Or, with a values file:

```yaml
# stornx-values.yaml
config:
  namespaces: "online-boutique,otel-demo"
  prometheusUrl: "http://prometheus.monitoring.svc:9090"
  metricsType: "cpu"
  metricsUpperThreshold: "80"
  metricsLowerThreshold: "20"
  responseTimeThreshold: 100
  cronjobExpression: "*/1 * * * *"
faultTolerance:
  maxZones: 3
balancer:
  minDelta: 5
  minStepSize: 5
  maxStepSize: 20
  urgencyThreshold: 50
  epsilon: 1
```

```bash
helm install stornx stornx/stornx -n stornx -f stornx-values.yaml
```

## 5. Verify the install

```bash
kubectl get pods -n stornx
# NAME                      READY   STATUS    RESTARTS   AGE
# stornx-7f8b6d8c8c-abcde   1/1     Running   0          12s

kubectl logs -n stornx -l app.kubernetes.io/name=stornx -f
```

A healthy first cycle looks like this:

```
INFO  startup    config-namespaces=online-boutique,otel-demo
INFO  startup    prometheus=ok  istio=detected  kube-netlag=detected
INFO  cycle      tick
INFO  scaler     deployment=cart       metric=mem  pct=23   action=none
INFO  scaler     deployment=checkout   metric=mem  pct=84   action=scale-up   zone=eu-central-1b  strategy=upstream-Um
INFO  balancer   destinationrule=cart  l1-delta=3   action=skip  reason=below-min-delta
INFO  balancer   destinationrule=ratings  l1-delta=18  action=patch  step=8
INFO  cycle      done duration=1.2s
```

## 6. Uninstall

```bash
helm uninstall stornx -n stornx
kubectl delete namespace stornx
```

Uninstalling **does not** revert any DestinationRule weights that StornX has already written - those persist as-is. Your applications continue to receive traffic according to the last computed distribution. If you want to reset them, roll back the chart that owns each DestinationRule.

## Running locally (for development)

If you want to run StornX against a local cluster (kind, minikube, Docker Desktop, or a remote kubeconfig):

```bash
cd scheduler
yarn install
ENV=development \
NAMESPACES=default \
PROMETHEUS_URL=http://localhost:9090 \
yarn start
```

In `development` mode, StornX picks up your local `~/.kube/config` and talks to Prometheus over a `kubectl port-forward`.

## Next steps

- Tune the controller through the [Configuration Reference](./configuration).
- Read [Use Cases](../guides/use-cases) to see how teams typically deploy StornX.
- If you hit anything strange, jump to [Troubleshooting](../guides/troubleshooting).
