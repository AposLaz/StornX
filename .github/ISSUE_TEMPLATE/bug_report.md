---
name: Bug Report
about: Report a bug to help us improve StornX
title: "[BUG] "
labels: bug
assignees: ''

---

## Describe the Bug

A clear and concise description of what the bug is.

## To Reproduce

Steps to reproduce the behavior:

1. Deploy StornX with the following values: `...`
2. Wait for the cron job to trigger (or describe the action)
3. Observe the error in `...`

## Expected Behavior

A clear and concise description of what you expected to happen.

## Actual Behavior

What actually happened instead.

## Logs / Error Output

<details>
<summary>StornX pod logs</summary>

```
# Paste output of: kubectl logs -n stornx -l app.kubernetes.io/name=stornx --tail=100
```

</details>

## Environment

- **Kubernetes version** (`kubectl version --short`): 
- **Kubernetes distribution** (e.g. EKS, GKE, AKS, k3s, kind, minikube): 
- **StornX version / Helm chart version**: 
- **Istio version** (if applicable): 
- **Prometheus URL**: 
- **Node count**: 
- **Helm values overrides** (non-default values only):

<details>
<summary>Helm values</summary>

```yaml
# Paste relevant values here
```

</details>

## Additional Context

Add any other context about the problem here (screenshots, metric graphs, etc.).
