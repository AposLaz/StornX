# Legacy scheduler

This directory retains the combined v1 implementation and historical test fixtures
for migration reference. Its entrypoint intentionally refuses to start.

Current applications are [`services/optiscaler`](../services/optiscaler/README.md)
and [`services/optibalancer`](../services/optibalancer/README.md). Their images do
not include this directory. Run current builds and tests from the repository root.

See the [migration runbook](../docs/service-split.md) for moving an existing v1 installation.
