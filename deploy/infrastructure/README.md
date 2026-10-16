# Infrastructure examples

- `compose.yaml`: loopback-only PostgreSQL and RabbitMQ for local integration tests.
- `roles.sql`: separate database runtime roles and schema grants, applied after migrations.
- `alerts.yaml`: sample Prometheus rules for failed or delayed controller work.

The Compose setup uses development credentials and one broker; it does not provide
production TLS or broker high availability. Production needs separately managed
dependencies, three RabbitMQ quorum members, backups and tested recovery.

See the [runbook](../../docs/service-split.md) for provisioning and security requirements.
