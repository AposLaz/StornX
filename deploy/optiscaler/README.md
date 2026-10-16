# OptiScaler Helm chart

Installs the scaling controller with its own image, ServiceAccount, namespace
permissions, Node mutation permissions, probes and network policy.

Supply `config.clusterId`, `config.namespaces`, `config.prometheusUrl` and
`existingSecret`. The existing Secret must contain `database-url` and `rabbitmq-url`.
Private CA certificates can be supplied through `tls.existingSecret`.

`values-production.yaml` provides conservative resource and scheduling defaults.
Dry run is enabled and mutations are disabled until explicitly changed.

```sh
helm lint deploy/optiscaler --set config.clusterId=validation --set existingSecret=validation
```

Run from the repository root. See the [runbook](../../docs/service-split.md) for
migrations, exact network destinations, placement precautions and installation.
