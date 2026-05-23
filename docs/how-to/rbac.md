# RBAC

Grant a workload least-privilege access to a Kubernetes API resource via
`autoCreateRbac` + `rbac.rules`. The chart emits a `Role` plus a
`RoleBinding` bound to the workload's `ServiceAccount`.

## Prerequisites

`autoCreateRbac` requires `autoCreateServiceAccount: true` (the
RoleBinding's subject is the auto-created SA).

## Recipe A — read configmaps

```yaml
deployments:
  api:
    containers:
      main: {image: example/api, imageTag: "1.0"}
    autoCreateServiceAccount: true
    autoCreateRbac: true
    rbac:
      rules:
        - apiGroups: [""]
          resources: [configmaps]
          verbs: [get, list, watch]
```

Verify after install:

```bash
kubectl auth can-i list configmaps \
  --as=system:serviceaccount:default:demo-api
```

Expected: `yes`.

## Recipe B — read pods, watch deployments

```yaml
    rbac:
      rules:
        - apiGroups: [""]
          resources: [pods]
          verbs: [get, list, watch]
        - apiGroups: [apps]
          resources: [deployments]
          verbs: [get, list, watch]
```

## Recipe C — patch a specific resource by name

```yaml
    rbac:
      rules:
        - apiGroups: [""]
          resources: [configmaps]
          resourceNames: [api-config]
          verbs: [patch, update]
```

`resourceNames` is a whitelist: the workload may patch
`configmap/api-config` and nothing else.

## Pitfalls

- **Wildcard verbs are rejected by validation** — list verbs
  explicitly (e.g. `[get, list, watch]`, not `["*"]`).
- **Cluster-scoped resources require ClusterRole** — `autoCreateRbac`
  only emits namespace-scoped `Role`/`RoleBinding`. For cluster-scoped
  resources, ship a separate `ClusterRole` and `ClusterRoleBinding`
  outside the chart.

## Reference

- [`autoCreateRbac`](../reference/values.md#deploymentspec-autocreaterbac)
- [`rbac`](../reference/values.md#deploymentspec-rbac)
