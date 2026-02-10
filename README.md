<p align="center">
  <img src="images/logos/stornxLogo.png" alt="StornX Logo" width="280" />
</p>

<h1 align="center">StornX</h1>

<p align="center">
  <strong>Intelligent Kubernetes Traffic Optimization &amp; Pod Rescheduling</strong>
</p>

<p align="center">
  <a href="https://codecov.io/github/AposLaz/StornX"><img src="https://codecov.io/github/AposLaz/StornX/graph/badge.svg?token=AFP5DJ3CGH" alt="codecov" /></a>
  <a href="https://github.com/AposLaz/StornX/actions/workflows/ci.yaml"><img src="https://github.com/AposLaz/StornX/actions/workflows/ci.yaml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/AposLaz/StornX/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License" /></a>
  <a href="https://artifacthub.io/packages/helm/stornx/stornx"><img src="https://img.shields.io/endpoint?url=https://artifacthub.io/badge/repository/stornx" alt="Artifact Hub" /></a>
  <img src="https://img.shields.io/badge/kubernetes-%3E%3D1.19-326ce5?logo=kubernetes&logoColor=white" alt="Kubernetes" />
  <img src="https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node.js" />
</p>

<p align="center">
  StornX monitors your Kubernetes workloads and <strong>automatically reschedules pods to reduce inter-service latency</strong>, balance traffic across nodes, and maintain fault tolerance — all without downtime.
</p>

---

## Table of Contents

- [Why StornX?](#why-stornx)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Documentation](#documentation)
- [Development](#development)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Why StornX?

In distributed microservice architectures, Kubernetes schedules pods once — at creation time. As traffic patterns change, pods that communicate frequently may end up on distant nodes, increasing latency and wasting bandwidth.

**StornX fixes this by continuously optimizing pod placement and traffic routing based on real-time metrics.**

| Without StornX | With StornX |
|---|---|
| Pods placed randomly across zones | Communicating pods co-located for lower latency |
| Static Istio routing weights | Adaptive traffic balancing based on load & latency |
| Manual scaling decisions | Zone-aware autoscaling that preserves fault tolerance |
| No visibility into cross-service latency | Prometheus-driven, data-informed decisions every cycle |

---

## Key Features

- **OptiBalancer** — Gradually rebalances Istio DestinationRule traffic weights based on latency, load, and replica count. Uses adaptive step sizing with configurable urgency scaling to avoid oscillation.

- **OptiScaler** — Intelligent pod autoscaling that selects the optimal node for new replicas using service-graph analysis (upstream/downstream relationships) and falls back to resource-based (LFU) selection when no graph data is available.

- **Fault Tolerance** — Ensures replicas are distributed across availability zones. Respects PodDisruptionBudgets and coordinates with existing HPAs.

- **Zero-Downtime Rescheduling** — New pods reach `Running` state before old pods are removed, guaranteeing uninterrupted service.

- **Single-Instance Design** — Runs as exactly one replica to prevent duplicate scheduling decisions.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                            StornX                                     │
│                                                                       │
│  ┌──────────────┐    ┌───────────────┐     ┌───────────────────────┐  │
│  │  Cron Engine │───▶│  OptiBalancer  │───▶│  Istio DestinationRule│  │
│  │  (node-cron) │    │  Traffic       │    │  Updates              │  │
│  │              │    │  Optimization  │    └───────────────────────┘  │
│  │              │    └───────────────┘                                │
│  │              │    ┌───────────────┐     ┌───────────────────────┐  │
│  │              │───▶│  OptiScaler    │───▶│  Pod Create / Delete  │  │
│  │              │    │  Autoscaling   │    │  (kubectl)            │  │
│  └──────────────┘    └───────────────┘     └───────────────────────┘  │
│         │                    │                                        │
│         ▼                    ▼                                        │
│  ┌──────────────────────────────────────┐                             │
│  │         Prometheus Adapter           │                             │
│  │  • P95 response times (Istio)        │                             │
│  │  • CPU / Memory utilization          │                             │
│  │  • Request rates & service graph     │                             │
│  └──────────────────────────────────────┘                             │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

| Component | Version | Required |
|---|---|---|
| Kubernetes | ≥ 1.19 | Yes |
| Helm | ≥ 3.2 | Yes |
| Prometheus | any | Yes |
| Istio | any | Recommended (for traffic balancing) |

### Install with Helm

```bash
# Add the namespace
kubectl create namespace stornx

# Install with default values
helm install stornx ./.kubernetes/helm -n stornx

# Or with production values
helm install stornx ./.kubernetes/helm -n stornx \
  -f ./.kubernetes/helm/values-production.yaml

# Customize inline
helm install stornx ./.kubernetes/helm -n stornx \
  --set config.namespaces="my-app,my-api" \
  --set config.prometheusUrl="http://prometheus.monitoring.svc:9090"
```

### Verify

```bash
kubectl get pods -n stornx
kubectl logs -n stornx -l app.kubernetes.io/name=stornx -f
```

### Uninstall

```bash
helm uninstall stornx -n stornx
kubectl delete namespace stornx
```

---

## Configuration

StornX is configured entirely via environment variables, all exposed through the Helm chart values.

### Core Settings

| Variable | Default | Description |
|---|---|---|
| `ENV` | `production` | Run mode (`production` / `development`) |
| `APP_PORT` | `3000` | HTTP server port |
| `NAMESPACES` | `default` | Comma-separated namespaces to monitor |
| `PROMETHEUS_URL` | `http://prometheus.prometheus.svc.cluster.local:9090` | Prometheus endpoint |
| `CRONJOB_EXPRESSION` | `* * * * *` | Cron schedule for the optimization loop |
| `LOCALITY_LABELS_CRON` | `* * * * *` | Cron for zone-label discovery |

### Metrics & Thresholds

| Variable | Default | Description |
|---|---|---|
| `METRICS_TYPE` | `memory` | Primary metric: `cpu` or `memory` |
| `METRICS_UPPER_THRESHOLD` | `70` | Upper % to trigger scale-up / rescheduling |
| `METRICS_LOWER_THRESHOLD` | `20` | Lower % to trigger scale-down |
| `RESPONSE_TIME_THRESHOLD` | `100` | Target P95 response time in ms |
| `CPU_WEIGHT` | `50` | Weight (0–100) for CPU in combined score |
| `MEMORY_WEIGHT` | `50` | Weight (0–100) for Memory in combined score |

### OptiBalancer Tuning

These control the adaptive traffic-shifting algorithm. **Leave defaults if you are unsure** — see [`docs/README.md`](docs/README.md#balancer-configuration-optibalancer) for a deep dive.

| Variable | Default | Description |
|---|---|---|
| `BALANCER_MIN_DELTA` | `5` | Minimum L1 delta to apply a DestinationRule update |
| `BALANCER_MIN_STEP_SIZE` | `5` | Floor of the adaptive step (% points per cycle) |
| `BALANCER_MAX_STEP_SIZE` | `20` | Ceiling of the adaptive step |
| `BALANCER_URGENCY_THRESHOLD` | `50` | L1 delta at which max step is used |
| `BALANCER_EPSILON` | `1` | Per-route convergence tolerance |

### Fault Tolerance

| Variable | Default | Description |
|---|---|---|
| `FT_MAX_ZONES` | `3` | Maximum zones across which replicas are spread |

> For full Helm chart parameters (RBAC, probes, resources, persistence, etc.) see the [Helm Chart README](.kubernetes/helm/README.md).

---

## Documentation

| Document | Description |
|---|---|
| [Main README](docs/README.md) | Environment variables, balancer deep-dive |
| [OptiScaler Docs](docs/OptiScaler.md) | Autoscaling algorithm, decision trees, fault tolerance |
| [Helm Chart README](.kubernetes/helm/README.md) | Full chart parameters, installation variants |
| [Istio Setup](istio-helm/README.md) | Istio Helm installation notes |
| [Addons](addons/istio/addons/README.md) | Prometheus, Grafana, Jaeger, Kiali manifests |

---

## Development

### Requirements

- Node.js ≥ 22
- Yarn

### Setup

```bash
cd scheduler
yarn install
```

### Run locally

```bash
# Development mode (uses local kubeconfig)
ENV=development yarn start
```

### Lint & Test

```bash
yarn lint          # TypeScript check + ESLint + Prettier
yarn test          # Jest with coverage
```

### Build & Push Docker Image

```bash
docker build -f .docker/Dockerfile -t alazidis/stornx:latest scheduler
docker push alazidis/stornx:latest
```

### Project Structure

```
StornX/
├── scheduler/              # Core application (TypeScript / Node.js)
│   ├── src/
│   │   ├── config/         # Environment config, logger, K8s client
│   │   ├── core/
│   │   │   ├── optiBalancer/   # Traffic weight optimization engine
│   │   │   └── optiScaler/     # Pod autoscaling logic
│   │   ├── adapters/
│   │   │   ├── k8s/            # Kubernetes API services
│   │   │   └── prometheus/     # Prometheus query layer
│   │   └── cronjobs/       # Cron-based scheduling orchestrator
│   └── tests/              # Jest unit + scenario tests
├── .kubernetes/helm/       # Helm chart
├── .docker/                # Dockerfile (multi-stage)
├── .github/workflows/      # CI pipeline (GitHub Actions)
├── addons/                 # Istio addons, Kubecost, sample apps
├── docs/                   # Extended documentation
└── istio-helm/             # Istio Helm setup
```

---

## Roadmap

- [ ] **Reduce inter-service response time** — Continuously optimize pod placement so that frequently communicating services are co-located, minimizing network hops and P95 latency
- [ ] **Per-deployment autoscaling** — Scale each Deployment independently based on its own metrics, thresholds, and traffic patterns instead of a single global policy
- [ ] **Per-deployment traffic routing** — Apply fine-grained Istio DestinationRule weight adjustments per Deployment, allowing each service to have its own balancing strategy
- [ ] **StatefulSet support** — Extend rescheduling and autoscaling to StatefulSets (currently only Deployments are supported)
- [ ] **Predictive decisions from historical traffic** — Use historical metrics to forecast traffic patterns and proactively scale / rebalance before demand spikes occur
- [ ] **Dashboard** — Built-in web UI for visualizing decisions, traffic distributions, and historical trends

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'feat: add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

Please ensure all tests pass (`yarn test`) and linting is clean (`yarn lint`) before submitting.

---

## License

This project is licensed under the **Apache License 2.0** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built by <a href="https://github.com/AposLaz">Apostolos Lazidis</a>
</p>
