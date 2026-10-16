# OptiScaler

`@stornx/optiscaler` is the scaling controller. It evaluates resource usage, chooses
scale-up nodes using service traffic and zone policy, and applies guarded replica changes.

It needs Kubernetes, Prometheus, its PostgreSQL journal and RabbitMQ. Before a
mutation it records an absolute replica target; successful changes produce
`workload.changed.v1` events through a durable outbox. HPA ownership, PDB availability,
cooldowns, leadership and workload opt-in gate its actions.

Important modules: `controller.ts` orchestrates decisions/recovery, `policy.ts`
checks safety, `kubernetes.ts` owns mutations, and `journal.ts` owns persistence.
The existing placement algorithms live in `src/core/optiScaler/`.

From the repository root, after `yarn install --frozen-lockfile` and `yarn build`:

```sh
yarn workspace @stornx/optiscaler test
yarn workspace @stornx/optiscaler migrate
yarn workspace @stornx/optiscaler start
```

Migration and start require configured dependencies. Mutations are disabled by
default. HPA can replace this service while OptiBalancer continues running.
See the [operations runbook](../../docs/service-split.md) and [Helm chart](../../deploy/optiscaler/README.md).

## Local environment

Copy [.env.example](.env.example) to `services/optiscaler/.env` and replace its
credential placeholders. Provision the database schema, runtime roles and broker
topology as described in the runbook. Compose creates setup accounts only; it does
not create the service runtime users. Kubernetes, the leadership namespace and
Prometheus must also be available.

The service reads process environment variables; it does not automatically load
`.env`. After building, load it explicitly from the repository root:

```sh
node --env-file=services/optiscaler/.env services/optiscaler/dist/index.js
```

For migrations, use the same command with `dist/migrate.js` and a separate migration
credential supplied as `DATABASE_URL` in the shell. Existing shell variables take
precedence over the env file. Keep the runtime `.env` scoped to the scaler role.
Local probes use port `3001`; production configuration comes from Helm and Secrets.
