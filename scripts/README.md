# Repository scripts

- `audit-runtime.mjs`: summarize the dependency audit and fail on high/critical runtime findings.
- `check-boundaries.mjs`: prevent service-to-service source imports.
- `provision-broker.mjs`: create exchanges and quorum queues using operator credentials.
- `import-legacy.mjs`: import the old JSON handoff into balancer reconciliation jobs.
- `validate-release.mjs`: check the selected service and package version before an image release.

Run these from the repository root. Provisioning and import scripts write to their
configured external systems; use the [runbook](../docs/service-split.md) for required
environment variables. Formatting uses the root `.prettierrc.json`; `yarn format`
and `yarn format:check` cover the workspace code and its documentation.

Copy [.env.example](.env.example) to `scripts/.env` for local broker provisioning.
After starting the Compose dependencies, run from the repository root:

```sh
node --env-file=scripts/.env scripts/provision-broker.mjs
```

For the legacy import, load the balancer's environment instead:

```sh
node --env-file=services/optibalancer/.env scripts/import-legacy.mjs /path/to/deploys.json --legacy-stopped
```

The release validator gets `SERVICE` and `VERSION` from workflow inputs. Audit and
boundary checks need no `.env` file.
