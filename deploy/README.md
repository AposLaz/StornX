# Deployment assets

[optiscaler](optiscaler/README.md) and [optibalancer](optibalancer/README.md) are
independent Helm charts. They configure separate images, credentials, RBAC,
network policies, probes and leader-election permissions.

[infrastructure](infrastructure/README.md) contains development dependencies,
database-role provisioning and sample alerts. Application charts use existing
PostgreSQL/RabbitMQ installations and do not provision those dependencies.

Follow the [migration and operations runbook](../docs/service-split.md) before enabling mutations.
