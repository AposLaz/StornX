# Event contracts

`@stornx/event-contracts` defines `workload.changed.v1`, its runtime validator and
the cluster/namespace/workload identity key. It has no runtime dependencies.

This library needs no environment variables or `.env` file.

Both producers and consumers use this package so messages remain compatible as
services are released independently. An event asks the consumer to inspect current
state; it does not instruct the consumer to execute a replica or routing mutation.
The future HPA observer can reuse the same contract.

```sh
yarn workspace @stornx/event-contracts build
```

Run this command from the repository root. Contract scenarios are covered by root
`yarn test`; schema changes must preserve supported consumer compatibility.
