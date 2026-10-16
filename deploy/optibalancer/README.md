# OptiBalancer Helm chart

Installs the traffic controller with its own image, ServiceAccount, routing
permissions, probes and network policy. Its RBAC does not allow replica or Node mutations.

Supply `config.clusterId`, `config.namespaces`, `config.prometheusUrl` and
`existingSecret`. The existing Secret must contain `database-url` and `rabbitmq-url`.
Private CA certificates can be supplied through `tls.existingSecret`.

This chart can run independently of OptiScaler. Dry run is enabled and mutations
are disabled until explicitly changed.

```sh
helm lint deploy/optibalancer --set config.clusterId=validation --set existingSecret=validation
```

Run from the repository root. See the [runbook](../../docs/service-split.md) for
migrations, Istio requirements, exact network destinations and installation.
