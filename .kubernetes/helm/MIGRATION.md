# Legacy chart migration

The independent service charts are in `deploy/optiscaler` and `deploy/optibalancer`.
This chart is retained for historical reference and local work in progress.
The existing local template deletions and values edits have not been restored or
overwritten. Do not deploy the retired combined scheduler from this workspace.

See [the migration and operations runbook](../../docs/service-split.md) for schema
migrations, broker provisioning, JSON handoff import, dry-run rollout and rollback.
