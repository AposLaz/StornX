Reduce response time between your microservices by using ExScheduler.

# ExScheduler

ExScheduler is an application which is responsible to re-schedule replica Pods of a **Deployment**, **so as to reduce response time between applications that communicate**. Deployment in Kubernetes provides a high-level abstraction necessary for managing the desired state and lifecycle of Pods. Deployment is a way to create multiple replica Pods, ensuring that the desired number will maintain the same at all times.

# User Guide

### Environment

All environment variables and their default values

| Name                      | type     | Default Value  | Description                                                                                                                                                                                                        |
| ------------------------- | -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ENV`                     | `string` | `production`   | use different value from `production` only if you want to run ExScheduler in development mode using the kubeconfig from you local machine                                                                          |
| `APP_PORT`                | `string` | `3000`         | the port on which the app runs                                                                                                                                                                                     |
| `NAMESPACES`              | `string` | `default`      | the app will watch and apply rescheduling strategies only on these namespaces. Use comma-separated namespaces, e.g., `my-namespace-1, my-namespace-2,...`                                                          |
| `PROMETHEUS_SVC`          | `string` | `prometheus`   | the name of the Prometheus kubernetes service                                                                                                                                                                      |
| `PROMETHEUS_NAMESPACE`    | `string` | `istio-system` | the name of namespace that the Prometheus service runs                                                                                                                                                             |
| `CRONJOB_TIME`            | `string` | `* * * * *`    | by default ExScheduler runs every 1 minute and takes approximately 30 seconds to complete its process for 3 namespaces. You can modify this value and provide a cron job with an interval greater than one minute. |
| `RESPONSE_TIME_THRESHOLD` | `number` | `100`          | define a response time threshold. Rescheduling replica Pods with value bigger than this number. This value is using only in `Istio` mode                                                                           |

# Features

- Currently, ExScheduler supports only the rescheduling of **Deployments**.
- Preserve fault-tolerance by ensuring that replica Pods are located in different Zones and Nodes, and avoiding placing all replica Pods in the same Zone or Node.
- Currently, ExScheduler moves replica Pods to specific Nodes by collecting response time metrics from Istio using Prometheus. In [ROADMAP](#ROADMAP) is the user to have the option to use only metrics from _kube-state-metrics_, without the needed to install Istio.
- When rescheduling happens wait until `new replica` is on State running and after delete the `old replica` Pod, ensuring **zero downtime**

# How ExScheduler works?

Definition table

| Variables                 | Definitions                                         |
| ------------------------- | --------------------------------------------------- |
| `Upstream` or `Um` Pods   | the pods that send requests                         |
| `Downstream` or `Dm` Pods | the pods that receive requests from `Upstream` Pods |

### Limitations

- probes and healthchecks may need more time than usual. Probes is a proble that the exchange of recent pods may take longer time than usual. We have to get it into account.

### The problem

### Solution

ExScheduler collects metrics from Prometheus to determine if a replica Pod needs to be moved to another Node. If it finds replica Pods with a response time higher than the defined `RESPONSE_TIME_THRESHOLD` threshold, these Pods will be rescheduled. Sometimes, having multiple replica Pods for microservices is crucial to maintaining communication in the different components of the applications.

# ROADMAP

## 1. ReScheduling using istio

-

## 2. From the kiali graph read more namespaces than one

An application could connect with many microservices in different namespaces. THis feature should be TODO

## 2. Rescheduling using only k8s server metrics

- User will have the option to use only Istio mode or Server mode. With the server mode all metrics will be collected by **kube-state-metrics**

# Scope

Scope of this application is to reschedule pods to specific nodes, in case that 2 pods communicates a lot.
