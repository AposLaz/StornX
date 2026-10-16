# Independent OptiScaler and OptiBalancer services

StornX now builds two TypeScript services from one Yarn workspace. The combined
`scheduler/src/index.ts` refuses to start. The scheduler directory retains v1
source and historical fixtures for migration reference; neither service image
contains or imports it.

## Ownership and layout

| Package                                    | Responsibility                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `services/optiscaler`                      | Scaling policy, fault-tolerant node selection, Kubernetes scaling/placement, operation journal, event outbox |
| `services/optibalancer`                    | Traffic policy, event inbox, reconciliation jobs, routing decisions and gradual convergence                  |
| `packages/event-contracts`                 | Runtime-validated `workload.changed.v1` notification                                                         |
| `packages/platform`                        | Read-only telemetry adapters, logging, database/AMQP clients, leadership and health infrastructure           |
| `deploy/optiscaler`, `deploy/optibalancer` | Independent Helm charts and releases                                                                         |

No service imports another service's source or reads another service's tables.
`yarn check:boundaries` enforces source import boundaries. Service-specific
Kubernetes mutation clients are kept inside their owning service. The balancer's
RBAC cannot scale Deployments, delete Pods, or patch Nodes.

One installation manages a given cluster/workload set. Keep `CLUSTER_ID` stable
across restarts, releases, database restores and future event producers; use a
different ID for every cluster. Do not run parallel installations against the same
workloads using different IDs or databases. Namespace and workload UID are part of
every identity; resource versions are opaque equality tokens.

## Build and verification

Requirements: Node 22.23.3 or later supported Node LTS, Yarn 1.22.22, Helm 3.17.3.
The image runtime is pinned to Node 22.23.3. Kubernetes 1.30+ and Istio with the
`networking.istio.io/v1` DestinationRule API are the deployment baseline. This is a
development baseline, not a claim that every platform/version combination has
passed certification; validate your supported cluster versions before release.

```sh
corepack enable
yarn install --frozen-lockfile
yarn build
yarn test
yarn format:check
helm lint deploy/optiscaler --set config.clusterId=validation --set existingSecret=validation
helm lint deploy/optibalancer --set config.clusterId=validation --set existingSecret=validation
docker build -f services/optiscaler/Dockerfile -t stornx-optiscaler:1.0.0 .
docker build -f services/optibalancer/Dockerfile -t stornx-optibalancer:1.0.0 .
```

The Node tests exercise journal SQL using an embedded PostgreSQL engine, plus
Kubernetes failure doubles. The migrated Jest suites characterize the existing
algorithms. `tests/integration` requires actual, disposable PostgreSQL and RabbitMQ
instances; CI provisions these and runs the transport tests. Helm is required for
the chart tests. No production credentials are needed for the ordinary test suite.

For local integration dependencies:

```sh
docker compose -f deploy/infrastructure/compose.yaml up -d
export ENV=development CLUSTER_ID=integration
export BROKER_ADMIN_URL=amqp://local_admin:local-admin-only@localhost:5672
export TEST_RABBITMQ_URL="$BROKER_ADMIN_URL"
export TEST_DATABASE_URL=postgres://stornx_admin:local-admin-only@localhost:5432/stornx
node scripts/provision-broker.mjs
yarn test:integration
```

Compose binds to loopback and uses development credentials and one broker. It is
not a production topology. Set PowerShell environment variables using `$env:NAME`
instead of `export` on Windows. Integration tests write only to the explicitly
configured test dependencies and preserve journals for inspection.

## Production prerequisites and least privilege

Provision PostgreSQL with TLS, backups/PITR and a tested restore procedure. Use one
database with the `optiscaler` and `optibalancer` schemas initially. Migrations run
explicitly with an administrator/migration credential, before applications start:

```sh
# Set the common environment below, with DATABASE_URL using the migration role.
yarn workspace @stornx/optiscaler migrate
yarn workspace @stornx/optibalancer migrate
# Run deploy/infrastructure/roles.sql through psql, supplying two distinct passwords.
```

Applications verify the schema at startup and never execute DDL. `roles.sql`
grants each runtime role SELECT/INSERT/UPDATE only in its own schema; do not use
the migration account as the runtime credential. Future migrations must preserve
those grants for new tables. Database TLS verifies hostnames and certificates in
production; mount a CA for private issuers.

Provision RabbitMQ with three quorum members across failure domains, durable
storage, AMQPS, metrics, resource alarms and tested member-failure recovery.
Use a dedicated vhost for each customer/cluster security boundary.
Run `scripts/provision-broker.mjs` with `CLUSTER_ID`, `BROKER_ADMIN_URL`, and
optionally `RABBITMQ_CA` pointing to a PEM CA. Operator credentials provision:

- Durable topic exchange `stornx.workloads`.
- Quorum queue `stornx.<cluster>.optibalancer` bound to `<cluster>.workload.changed.v1`.
- Quorum delayed-retry queues for 5, 30 and 120 seconds.
- A quorum dead-letter queue and at-least-once dead-letter transfer configuration.

The queue initial group size is three. Confirm three **actual online members** in
production; a one-node development broker does not provide that guarantee.
Runtime clients do not declare topology and need no configure permission.
Grant the scaler write access to `stornx.workloads`. Grant the balancer read access
to its main queue and write access to that exchange for delayed retries. Keep
dead-letter queue access and replay tools restricted to operators. Publisher
confirms and mandatory routing checks detect failed or unroutable publications.
Confirmations have a timeout; unconfirmed outbox rows remain available for retry.

## Configuration and deployment

Local environment templates live in `services/optiscaler/.env.example`,
`services/optibalancer/.env.example`, `scripts/.env.example` (broker provisioning),
and `tests/integration/.env.example`. Copy the relevant template to `.env` beside
it and follow that directory's README for `node --env-file` commands. Loading is
explicit, and existing shell variables take precedence. Real `.env` files are
ignored by Git. Shared packages run inside their host service and need no separate
environment files; Helm deployments receive configuration through values and Secrets.

Each runtime requires `DATABASE_URL`, `RABBITMQ_URL`, `CLUSTER_ID`, `NAMESPACES`,
and `PROMETHEUS_URL`. Production requires `amqps://`; use `ENV=development` only
for local testing with a kubeconfig and cleartext development dependencies.

| Setting                                                                  | Default        | Meaning                                                      |
| ------------------------------------------------------------------------ | -------------- | ------------------------------------------------------------ |
| `DRY_RUN`                                                                | `true`         | Journal decisions without workload/routing mutations         |
| `MUTATIONS_ENABLED`                                                      | `false`        | Additional mutation kill switch                              |
| `INTERVAL_SECONDS`                                                       | `300`          | Periodic scaling/balancing scan and routing adjustment limit |
| `MAX_METRIC_AGE_SECONDS`                                                 | `600`          | Reject old telemetry snapshots                               |
| `MAX_ATTEMPTS`                                                           | `12`           | Delivery/job retry limit before terminal recovery            |
| `CPU_WEIGHT`, `MEMORY_WEIGHT`                                            | `50`, `50`     | Percent weights; must sum to 100                             |
| `METRICS_TYPE`                                                           | `memory`       | `cpu`, `memory`, `cpu-memory`                                |
| `MIN_REPLICAS`, `MAX_REPLICAS`                                           | `1`, `100`     | Scaler bounds                                                |
| `SCALER_COOLDOWN_SECONDS`                                                | `60`           | Durable per-workload scale cooldown                          |
| `METRICS_LOWER_THRESHOLD`, `METRICS_UPPER_THRESHOLD`                     | `30`, `80`     | Scaler load percentages                                      |
| `TARGETED_PLACEMENT`                                                     | `true`         | Transitional node-taint placement during scale-up            |
| `FT_MAX_ZONES`                                                           | `3`            | Scaler zone-selection policy                                 |
| `RESPONSE_TIME_THRESHOLD`                                                | `100`          | Balancer target P95 milliseconds                             |
| `BALANCER_MIN_DELTA`, `BALANCER_MIN_STEP_SIZE`, `BALANCER_MAX_STEP_SIZE` | `5`, `5`, `20` | Gradual routing policy                                       |
| `BALANCER_URGENCY_THRESHOLD`, `BALANCER_EPSILON`                         | `50`, `1`      | Routing policy urgency and tolerance                         |

Create a separate Kubernetes Secret per service with `database-url` and
`rabbitmq-url` keys. An optional CA Secret has `database-ca.crt` and
`rabbitmq-ca.crt` keys. Never put credentials in committed values files.

```sh
helm upgrade --install stornx-optibalancer deploy/optibalancer -n stornx --create-namespace \
  --set config.clusterId=production-eu --set existingSecret=optibalancer-credentials \
  --set tls.existingSecret=stornx-ca --set 'config.namespaces[0]=online-boutique'
helm upgrade --install stornx-optiscaler deploy/optiscaler -n stornx \
  --set config.clusterId=production-eu --set existingSecret=optiscaler-credentials \
  --set tls.existingSecret=stornx-ca --set 'config.namespaces[0]=online-boutique'
```

Adjust the Prometheus URL and network-policy destinations to your environment.
The default API-server egress CIDR is broad to render on different cluster
networks: replace it with the actual API endpoint CIDRs before production use.
For external managed PostgreSQL/RabbitMQ/Prometheus, configure `extraEgress` with
their approved destinations. Create managed workload namespaces beforehand.
The charts do not install cluster-wide monitoring or mesh dependencies.

Workloads opt in independently:

```sh
kubectl label deployment api -n online-boutique stornx.io/balancing=enabled
kubectl label deployment api -n online-boutique stornx.io/scaling=enabled
```

Leave both services in dry run until comparing journal decisions to baseline
traffic and load. Enable mutations per service with `config.dryRun=false` **and**
`config.mutationsEnabled=true`. Set either back to its safe value to disable
future mutations. This also gates recovery of unfinished operations. Routine
Node-taint cleanup belonging to an already-started operation still runs in its
`finally` path.

Every process participates in a service-specific Kubernetes Lease. The default
replica count is one; setting it to two adds a standby and a service PDB. Only the
leader performs work; mutation paths check leadership again. Advisory locks
serialize placement and routing work across overlapping processes using the same
journal. Standby readiness reports dependency health; `/metrics` reports leadership.

## Recovery semantics and changes from v1

**Scaler:** journal an operation before changing Kubernetes. Record an absolute
replica target and the workload generation/UID. After an ambiguous response,
re-read live state: an already-reached target completes without another increment;
replacement or superseded workloads terminate the old operation. Successful
operation completion and outbox insertion commit together. Publishing can repeat
after a lost confirmation; the balancer inbox deduplicates the event ID.

HPA/policy API failures block scaling. HPA targets always take precedence. PDB
selectors include label expressions and percent budgets; availability checks are
explicit because ordinary replica reductions do not automatically honor PDBs.
Ordinary scale-down uses the scale subresource, and Kubernetes chooses the victim.
The v1 delete-pod-then-decrement behavior is retired. A chosen scale-down node is
an audit hint, not an enforced victim-placement guarantee. Configure Kubernetes
topology policies for workload scheduling and validate zone behavior separately.

Temporary scale-up taints use a dedicated operation ID, a cluster-wide journal
lock, optimistic Node updates, a bounded scheduling wait and `finally` cleanup.
After restart, the leader cleans stale StornX operation taints before recovery.
This mechanism can temporarily block unrelated pods and is transitional. Use
`TARGETED_PLACEMENT=false` if cluster policy prohibits it; Kubernetes then chooses
the new replica's node. Exact placement requires validating workload tolerations,
affinity and other scheduler constraints. No unconditional zero-downtime guarantee
is made by this mechanism.

**Balancer:** acknowledge an event only after the inbox and pending job commit.
Jobs coalesce by cluster/namespace/UID. A new event arriving during reconciliation
increments a revision so completion cannot erase newer work. Workers re-read
Deployments, Ready Pods, EndpointSlices, telemetry and topology. Pending readiness
or missing metrics retries with backoff. A periodic full list recovers missed
notifications, without relying on a Kubernetes watch cursor.

Routing writes preserve customer TLS, subsets, connection pools and other fields:
only StornX locality distribution fields and a decision annotation are patched.
UID/resource-version checks detect replacement and concurrent edits. Both target
and live distributions use Istio locality coordinates for gradual steps.
Persisted decisions and the Kubernetes annotation distinguish an applied write
from a response lost before database commit. A durable adjustment deadline stops
duplicate events from accelerating routing. An existing DestinationRule must use
the service name and match its host; balancing opt-in authorizes StornX ownership
of locality distribution on that rule.

## Migration, rollback and HPA roadmap

1. Back up the legacy `deploys.json`, capture scaling outcomes/P95/error-rate and
   routing baselines, and provision broker/database resources.
2. Build/scan images, migrate schemas, grant runtime roles, and deploy both services
   in dry run for one allowlisted namespace.
3. Stop legacy writers. The uncommitted legacy Helm deletions/values edits are
   deliberately preserved; deploy using the independent charts, not that chart.
4. With balancer environment set, run
   `node scripts/import-legacy.mjs /path/to/deploys.json --legacy-stopped`.
   It resolves live UIDs, deduplicates records and preserves the source file.
   Resolve deleted/out-of-scope records before rerunning a failed import.
5. Enable balancer writes, then scaler writes, for the test workloads. Expand only
   after the failure drills below and a baseline comparison pass.
6. Before rollback, disable/stop the new writers and verify termination. Roll back
   to a separately retained v1 release/image/chart if required; the source guard
   in this workspace intentionally cannot start the combined scheduler.

For future HPA adoption, disable OptiScaler ownership for each target before
enabling HPA. Disable/uninstall the scaler release only after transferring node
locality-label maintenance to cluster provisioning. Keep the balancer enabled.
The future observer will watch/relist workload, HPA and serving-endpoint resources
and publish the same contract. HPA events alone do not establish readiness;
the balancer independently checks live serving state. HPA takes over replica
count, and custom OptiScaler node selection ceases unless supplied separately.

## Operations and release gates

Probe `/health/live`, `/health/ready` and scrape `/metrics` per process. Install the
sample Prometheus rules in `deploy/infrastructure/alerts.yaml`; also alert on broker
dead-letter backlog, quorum loss, database errors and absence of an active leader.
Decision IDs correlate structured logs, inbox/outbox records and Kubernetes writes.

- Inspect unpublished `optiscaler.outbox` rows and pending `operations` before retrying
  a failed scaling action. Never manually increase replicas to compensate for a
  missing broker confirmation.
- Inspect `optibalancer.jobs` with status `dead-letter`. After repairing the cause,
  an authorized operator can set `status='pending', attempts=0, next_attempt_at=now()`
  for the specific cluster/namespace/UID. Broker dead letters require operator
  validation and confirmed republishing to the workload exchange.
- Inspect operation-owned node taints after a crash; the next enabled leader
  removes them under the placement lock. Do not remove unrelated node taints.
- Keep journal/inbox/outbox retention under an explicit archive policy. Do not drop
  deduplication records while corresponding deliveries can still be replayed.

Before commercial rollout, exercise actual broker-member loss, database restart
and point-in-time restore, Kubernetes conflicts/outages, pod readiness delays,
leadership transfer, taint cleanup, stale telemetry and the mutation kill switch
on an isolated cluster. Run a representative load/latency comparison and set
product SLOs from those results. Embedded SQL tests do not certify a live cluster.

GitHub CI builds/scans both images independently and validates shared changes
against both services. Manual release workflows validate the selected package
version; image publication defaults off. Chart packaging produces an artifact
without committing to a branch. Service versions/images/charts are independent.
Event schema changes must remain compatible with an independently upgraded peer.
No workflow has been dispatched as part of this implementation.
