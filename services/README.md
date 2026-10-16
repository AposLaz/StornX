# Services

These are independent application processes in the StornX Yarn workspace:

- [OptiScaler](optiscaler/README.md) decides when and where to add replicas.
- [OptiBalancer](optibalancer/README.md) adjusts traffic after workload or load changes.

Each owns its code, image, configuration, database schema and Helm release. Services
communicate through versioned events; source imports between services are prohibited.

Run workspace commands from the repository root. Shared infrastructure lives in
[`packages/`](../packages/README.md); deployment assets live in [`deploy/`](../deploy/README.md).
