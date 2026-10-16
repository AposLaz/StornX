# System tests

Root Node tests cover event validation, journals, crash recovery, broker delivery,
leadership, Kubernetes safety, Helm rendering and standalone HPA-event handling.
Journal tests use an embedded PostgreSQL engine; Kubernetes effects use test doubles.
Service/package directories also contain the migrated Jest algorithm scenarios.

After installing dependencies and building, run `yarn test` from the repository root.
Helm must be installed for chart rendering checks.

`yarn test:integration` needs disposable real PostgreSQL and RabbitMQ instances,
configured through `TEST_DATABASE_URL` and `TEST_RABBITMQ_URL`. It writes to those
instances. See the [runbook](../docs/service-split.md) for local setup and CI coverage.

For local integration tests, copy [integration/.env.example](integration/.env.example)
to `tests/integration/.env`. Start the Compose dependencies and provision the broker
using `scripts/.env`, keeping the same `CLUSTER_ID` in both files. After building,
run from the repository root:

```sh
node --env-file=tests/integration/.env --test tests/integration/*.test.mjs
```

Ordinary `yarn test` needs no environment file or live database/broker.
