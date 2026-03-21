# StornX Helm Chart

A Helm chart for deploying StornX - Kubernetes Resource Optimization and Balancing Controller.

## Prerequisites

- Kubernetes ≥ 1.19
- Helm ≥ 3.2.0
- **Istio base CRDs** - Must be installed prior to deploying StornX. Follow the [official Istio base chart documentation](https://artifacthub.io/packages/helm/istio-official/base) for installation instructions.
- **Istiod** - Required for traffic management (sidecar injection, mTLS, DestinationRules).
- **Prometheus** - Required for metrics collection.
- **kube-netlag** - Required for inter-node network latency measurements.
- **Metrics Server** - Required for node and pod resource usage metrics (`kubectl top`). Follow the [official installation guide](https://github.com/kubernetes-sigs/metrics-server#installation).
- Kiali (optional) - Service mesh observability dashboard.

## Bundled Dependencies

The StornX chart includes the following components as optional sub-chart dependencies. Each can be independently enabled or disabled depending on your cluster's existing infrastructure.

| Component | Condition | Required | Description |
|-----------|-----------|----------|-------------|
| [istiod](https://artifacthub.io/packages/helm/istio-official/istiod) | `istiod.enabled` | Yes | Istio control plane - sidecar injection, traffic routing, mTLS |
| [prometheus](https://artifacthub.io/packages/helm/prometheus-community/prometheus) | `prometheus.enabled` | Yes | Metrics server - scrapes Envoy, istiod, cAdvisor, kube-netlag |
| [kube-netlag](https://artifacthub.io/packages/helm/kube-netlag/kube-netlag) | `kube-netlag.enabled` | Yes | DaemonSet for measuring inter-node network latency |
| [kiali](https://artifacthub.io/packages/helm/kiali/kiali-server) | `kiali.enabled` | No | Service mesh observability dashboard |

> **Selective installation:** If your cluster already has Prometheus or Istiod deployed, disable the corresponding sub-chart to avoid conflicts:
>
> ```bash
> helm install stornx stornx/stornx -n stornx \
>   --set istiod.enabled=false \
>   --set prometheus.enabled=false
> ```
>
> **Custom configuration:** Each sub-chart accepts its full set of upstream values. You can override any parameter by prefixing it with the dependency name. For the complete list of available options, refer to the official documentation of each component linked above.
>
> For example, to customize the Prometheus retention period:
>
> ```bash
> helm install stornx stornx/stornx -n stornx \
>   --set prometheus.server.retention="7d"
> ```

## Important Note

**StornX must run as a single replica** to prevent duplicate scheduling and optimization decisions. The deployment is designed for exactly 1 pod.

## Installation

```bash
# Add the StornX Helm repository
helm repo add stornx https://aposlaz.github.io/StornX
helm repo update

# Create the namespace
kubectl create namespace stornx

# Install with default values (all dependencies enabled)
helm install stornx stornx/stornx -n stornx

# Install with custom application settings
helm install stornx stornx/stornx -n stornx \
  --set config.namespaces="namespace1,namespace2" \
  --set config.prometheusUrl="http://your-prometheus:9090"

# Install with an external values file
helm install stornx stornx/stornx -n stornx -f values-production.yaml
```

> The chart is also available on [Artifact Hub](https://artifacthub.io/packages/helm/stornx/stornx).

## Upgrading

```bash
helm repo update
helm upgrade stornx stornx/stornx -n stornx
```

## Uninstallation

```bash
helm uninstall stornx -n stornx
kubectl delete namespace stornx
```

## Configuration

### Global Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas (keep at 1) | `1` |
| `namespace` | Namespace to deploy | `stornx` |
| `nameOverride` | Override chart name | `""` |
| `fullnameOverride` | Override full name | `""` |

### Image Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.repository` | Image repository | `alazidis/stornx` |
| `image.pullPolicy` | Image pull policy | `Always` |
| `image.tag` | Image tag | `latest` |
| `imagePullSecrets` | Image pull secrets | `[{name: regcred}]` |

### Application Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `config.env` | Environment mode | `production` |
| `config.appPort` | Application port | `3000` |
| `config.namespaces` | Namespaces to monitor (comma-separated) | `online-boutique` |
| `config.prometheusUrl` | Prometheus URL | `http://prometheus.istio-system.svc.cluster.local:9090` |
| `config.cronjobExpression` | Cron schedule for optimization | `* * * * *` |
| `config.metricsType` | Metrics type (cpu/memory) | `memory` |
| `config.metricsUpperThreshold` | Upper threshold % for scaling | `70` |
| `config.metricsLowerThreshold` | Lower threshold % for scaling | `20` |
| `extraEnv` | Additional environment variables | `[]` |

### RBAC Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `serviceAccount.create` | Create service account | `true` |
| `serviceAccount.name` | Service account name | `stornx-sa` |
| `serviceAccount.annotations` | Service account annotations | `{}` |
| `rbac.create` | Create RBAC resources | `true` |
| `rbac.clusterRoleName` | ClusterRole name | `stornx-role` |
| `rbac.clusterRoleBindingName` | ClusterRoleBinding name | `stornx-binding` |

### Pod Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `podAnnotations` | Pod annotations | `{}` |
| `podLabels` | Additional pod labels | `{}` |
| `podSecurityContext` | Pod security context | `{}` |
| `securityContext` | Container security context | `{}` |

### Resource Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `resources.limits.cpu` | CPU limit | `500m` |
| `resources.limits.memory` | Memory limit | `512Mi` |
| `resources.requests.cpu` | CPU request | `100m` |
| `resources.requests.memory` | Memory request | `128Mi` |

### Health Probes

| Parameter | Description | Default |
|-----------|-------------|---------|
| `livenessProbe.enabled` | Enable liveness probe | `true` |
| `livenessProbe.httpGet.path` | Health check path | `/health` |
| `livenessProbe.initialDelaySeconds` | Initial delay | `10` |
| `readinessProbe.enabled` | Enable readiness probe | `true` |
| `readinessProbe.initialDelaySeconds` | Initial delay | `5` |
| `startupProbe.enabled` | Enable startup probe | `false` |

### Persistence Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `persistence.enabled` | Enable persistence | `false` |
| `persistence.storageClassName` | Storage class | `""` |
| `persistence.accessModes` | Access modes | `[ReadWriteOnce]` |
| `persistence.size` | Storage size | `1Gi` |
| `persistence.mountPath` | Mount path | `/data` |
| `persistence.existingClaim` | Use existing PVC | `""` |

### Additional Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `volumes` | Additional volumes | `[]` |
| `volumeMounts` | Additional volume mounts | `[]` |

## Chart Templates

This chart includes the following Kubernetes resources:

- **Deployment** - Single replica StornX application
- **ServiceAccount** - For RBAC authentication
- **ClusterRole** - Permissions for pod/node management
- **ClusterRoleBinding** - Binds role to service account
- **PersistentVolumeClaim** (optional) - For data persistence

## Testing

Run Helm tests after installation:

```bash
helm test stornx -n stornx
```

## Troubleshooting

### Check pod status

```bash
kubectl get pods -n stornx -l app.kubernetes.io/name=stornx
```

### Check logs

```bash
kubectl logs -n stornx -l app.kubernetes.io/name=stornx -f
```

### Check RBAC permissions

```bash
kubectl auth can-i list pods --as=system:serviceaccount:stornx:stornx-sa
kubectl auth can-i update deployments --as=system:serviceaccount:stornx:stornx-sa
```

### Validate chart

```bash
helm template stornx stornx/stornx --debug
```

### Dry run installation

```bash
helm install stornx stornx/stornx -n stornx --dry-run
```

## Values Files

- `values.yaml` - Default values for general use
- `values-production.yaml` - Production-optimized settings (pinned version, higher resources)
- `values-development.yaml` - Development settings (lower resources, faster polling)

## License

This project is licensed under the terms specified in the LICENSE file.
