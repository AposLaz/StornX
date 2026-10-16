# OptiBalancer

`@stornx/optibalancer` is the traffic controller. It observes ready workload endpoints
and current telemetry, then gradually adjusts Istio DestinationRule locality weights.

It needs Kubernetes/Istio, Prometheus, RabbitMQ and its own PostgreSQL journal.
The inbox deduplicates events, durable jobs retry reconciliation, and routing
decisions record what must be recovered after a crash. Periodic scans continue
optimization without scaling events. OptiScaler is not required to run this service;
a future HPA observer can publish the same notification contract.

Important modules: `controller.ts` orchestrates reconciliation, `kubernetes.ts`
checks live topology and patches routing, and `journal.ts` owns persistence.
The traffic algorithm lives in `src/core/optiBalancer/engine.ts`.

From the repository root, after `yarn install --frozen-lockfile` and `yarn build`:

```sh
yarn workspace @stornx/optibalancer test
yarn workspace @stornx/optibalancer migrate
yarn workspace @stornx/optibalancer start
```

Migration and start require configured dependencies. Mutations are disabled by
default. See the [operations runbook](../../docs/service-split.md) and [Helm chart](../../deploy/optibalancer/README.md).

## Local environment

Copy [.env.example](.env.example) to `services/optibalancer/.env` and replace its
credential placeholders. Provision this service's schema, runtime roles and broker
topology using the runbook. Compose creates setup accounts only; it does not create
the service runtime users. Kubernetes/Istio, the leadership namespace and Prometheus
must also be available. Use the same `CLUSTER_ID` as the event producer and broker
provisioning profile.

The service does not automatically load `.env`. After building, run from the
repository root:

```sh
node --env-file=services/optibalancer/.env services/optibalancer/dist/index.js
```

For migrations, use `dist/migrate.js` with a separate migration credential supplied
as `DATABASE_URL` in the shell; it overrides the file value. Keep the runtime `.env`
scoped to the balancer role. Local probes use port `3002`, allowing both services to
run together. Production configuration comes from Helm and Secrets.
