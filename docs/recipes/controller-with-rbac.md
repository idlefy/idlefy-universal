# Recipe: Controller with namespaced RBAC

A deployment that needs to watch ConfigMaps + manage leader-election leases
in its own namespace. No cluster-scope permissions.

## Goal

Render:
- A `ServiceAccount` named `api` (via autoCreate)
- A `Role` named `api` with two least-privilege rules
- A `RoleBinding` named `api` that binds the Role to the SA

## Values

```yaml
deployments:
  api:
    containers:
      main:
        image: registry.example.com/api
        imageTag: "1.0"
        ports:
          http:
            containerPort: 8080
    autoCreateServiceAccount: true
    autoCreateRbac: true
    rbac:
      rules:
        - apiGroups: [""]
          resources: [configmaps]
          verbs: [get, list, watch]
        - apiGroups: ["coordination.k8s.io"]
          resources: [leases]
          verbs: [create]
        - apiGroups: ["coordination.k8s.io"]
          resources: [leases]
          resourceNames: [api-leader]
          verbs: [get, update, patch]
```

## Rendered (excerpt)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: api
rules:
  - apiGroups: [""]
    resources: [configmaps]
    verbs: [get, list, watch]
  - apiGroups: ["coordination.k8s.io"]
    resources: [leases]
    verbs: [create]
  - apiGroups: ["coordination.k8s.io"]
    resources: [leases]
    resourceNames: [api-leader]
    verbs: [get, update, patch]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: api
subjects:
  - kind: ServiceAccount
    name: api
    namespace: <release-namespace>
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: api
```

The Role's `metadata` carries only `name` — namespace is injected by Helm via `--namespace` at install/upgrade time (chart convention). The RoleBinding's `subjects[0].namespace` is rendered to the release namespace, so the binding always targets the SA in the same namespace as the Role. Standard chart labels (`app.kubernetes.io/*`) are emitted in `metadata.labels` on both objects and are omitted here for brevity.

## ServiceAccount resolution

`autoCreateRbac: true` requires a resolvable ServiceAccount. Any **one** of the following satisfies the requirement. Listed in evaluation precedence (highest first):

1. `serviceAccountName: <name>` (explicit per-workload — chart trusts the SA exists)
2. `generic.serviceAccountName: <name>` (global default — applies when no per-resource value is set)
3. `serviceAccount: { annotations: {...} }` (explicit SA block — chart creates it)
4. `autoCreateServiceAccount: true` (recommended for most cases — chart creates the SA named after the workload key)

Without any of these, validation fails with `RB-3`: `autoCreateRbac=true requires a ServiceAccount — set autoCreateServiceAccount: true or specify serviceAccountName`.

**Jobs and CronJobs**: only paths 1 (`serviceAccountName`) and 2 (`generic.serviceAccountName`) are available — `JobSpec` and `CronJobSpec` schemas do not include `autoCreateServiceAccount` or the `serviceAccount:` block. To pair RBAC with a Job/CronJob, pre-create the SA or use an explicit `serviceAccountName`.

## Not supported in v1

- `ClusterRole` / `ClusterRoleBinding` — namespaced only. If you need cluster-scope, render manifests manually outside this chart.
- Binding to an externally-owned Role (e.g., a cluster-installed Role like `edit`). The chart always renders its own Role and binds to that.
- Multi-SA bindings. One workload = one SA = one binding.

## Least-privilege checklist

Before merging:
- Pin `resourceNames` where the controller only needs access to specific named objects (e.g., a single leader-election lease). **Note**: `resourceNames` does NOT apply to the `create` verb — Kubernetes RBAC ignores it because the object name is not known at authorization time. Split into two rules: one with `verbs: [create]` (no pin) and one with `resourceNames` + `verbs: [get, update, patch]`.
- Avoid `resources: ["*"]` and `verbs: ["*"]`. Both are anti-patterns for namespaced RBAC.
- Avoid `apiGroups: ["*"]`. Specify the actual group (`""` for core, `"coordination.k8s.io"` for leases, etc.).
- Validation guards (RB-5, RB-6) reject empty `verbs` and missing `resources`/`nonResourceURLs` per rule.
