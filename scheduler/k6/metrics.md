CPU REQUESTS

```bash
sum by (namespace) (
  kube_pod_container_resource_requests{resource="cpu", unit="core"}
)
```

MEMORY REQUESTS

```bash
sum by (namespace) (kube_pod_container_resource_requests{resource="memory", unit="byte"})
```

CPU USAGE

```bash
sum by (namespace) (
  rate(container_cpu_usage_seconds_total{namespace="online-boutique", container!="", pod!~"frontend-.*"}[10m])
)
```

COST BYTES

```bash
0.01 * sum(increase(kubecost_pod_network_egress_bytes_total[40m])) / 1e9
```

RESPONSE TIME

```bash
histogram_quantile(0.90, sum by(le) (rate(istio_request_duration_milliseconds_bucket{node!="unknown", namespace="2-app"}[40m])))

histogram_quantile(0.99, sum by(le, source_workload, destination_workload) (rate(istio_request_duration_milliseconds_bucket{node!="unknown", reporter="source", namespace="2-app", destination_workload!="unknown", source_workload!="unknown"}[40m])))

histogram_quantile(0.99, sum by(le) (rate(istio_request_duration_milliseconds_bucket{node!="unknown", reporter="source", source_workload!="load-generator", source_workload!="otel-collector", destination_workload!="otel-collector", destination_workload!="frontend-proxy", namespace="otel-demo", destination_workload!="flagd", destination_workload!="unknown",source_workload!="unknown"}[5m])))

sum by () (
  rate(istio_request_duration_milliseconds_sum{
    reporter="source",
    namespace="2-app",
    node!="unknown",
    destination_workload!="unknown"
  }[30m])
)
/
sum by () (
  rate(istio_request_duration_milliseconds_count{
    reporter="source",
    namespace="2-app",
    node!="unknown",
    source_workload!="unknown",
    destination_workload!="unknown"
  }[30m])
)

sum by () (
  rate(istio_request_duration_milliseconds_count{
    reporter="source", namespace="online-boutique",
    node!="unknown", destination_workload!="unknown"
  }[30m])
)

```

sum by (destination_workload) (
rate(istio_request_duration_milliseconds_sum{
node!="unknown", reporter="source", source_workload!="load-generator", destination_workload!="otel-collector", destination_workload!="frontend-proxy", namespace="otel-demo", destination_workload!="unknown",source_workload!="unknown",destination_workload!="image-provider"
}[5m])
)
/
sum by (destination_workload) (
rate(istio_request_duration_milliseconds_count{
node!="unknown", reporter="source", source_workload!="load-generator", destination_workload!="otel-collector", destination_workload!="frontend-proxy", namespace="otel-demo", destination_workload!="unknown",source_workload!="unknown",destination_workload!="image-provider"
}[5m])
)

histogram_quantile(0.99, sum by(le, source_workload, destination_workload) (rate(istio_request_duration_milliseconds_bucket{ node!="unknown", reporter="source", source_workload!="load-generator", namespace="online-boutique", destination_workload!="unknown",source_workload!="unknown"
}[5m])))

sum by (destination_workload) (
rate(istio_request_duration_milliseconds_sum{
node!="unknown", reporter="source", source_workload!="load-generator", namespace="online-boutique", destination_workload!="unknown",source_workload!="unknown"
}[5m])
)
/
sum by (destination_workload) (
rate(istio_request_duration_milliseconds_count{
node!="unknown", reporter="source", source_workload!="load-generator", namespace="online-boutique", destination_workload!="unknown",source_workload!="unknown"
}[5m])
)
