# Platform infrastructure

`@stornx/platform` supplies shared infrastructure for the two controllers:

- Kubernetes clients and read-only workload/telemetry observations.
- PostgreSQL transactions and advisory locks.
- RabbitMQ confirmed publication, consumption, retries and shutdown handling.
- Lease leadership, configuration validation, logging, health checks and metrics.

Scaling and routing policies stay in their services. Each service also owns its
mutation adapter and journal schema; this package does not read across those schemas.

This is a library, so it has no separate `.env` file or process. It reads settings
from the service that imports it. See the [scaler example](../../services/optiscaler/.env.example)
and [balancer example](../../services/optibalancer/.env.example) for shared settings.

```sh
yarn workspace @stornx/event-contracts build
yarn workspace @stornx/platform build
```

Run commands from the repository root. The root test suite covers transport,
leadership, persistence and observation scenarios. See the [runbook](../../docs/service-split.md)
for PostgreSQL, RabbitMQ and Kubernetes requirements.
