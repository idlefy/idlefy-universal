# Auto-creation

`idlefy-universal` derives 8 resource types from a single workload
definition: Service, Ingress, Certificate, ServiceMonitor,
PodDisruptionBudget, NetworkPolicy, RBAC (Role + RoleBinding), and
ServiceAccount. This page explains why.

## The cost of explicit resources

A production workload typically needs:

- 1 Deployment / StatefulSet / DaemonSet
- 1 Service
- 1 Ingress (or HTTPRoute)
- 1 Certificate
- 1 ServiceMonitor
- 1 PodDisruptionBudget
- 1 NetworkPolicy
- 1 ServiceAccount
- 1 Role + 1 RoleBinding

That's 10 manifests. Names must agree across all of them, labels must
match selectors, port numbers must be consistent. Maintaining the
agreement by hand is where most production-config bugs live: a typo in
the Service selector that nobody notices for months.

## How `autoCreate*` resolves it

One input, derived outputs:

```yaml
deployments:
  api:
    containers:
      main:
        image: example/api
        imageTag: "1.0"
        ports: {http: {containerPort: 8080, servicePort: 80}}
    autoCreateService: true
    autoCreateIngress: true
    ingress: {hosts: [{subdomain: api, paths: [{path: /, pathType: Prefix}]}]}
    autoCreateCertificate: true
    certificate: {clusterIssuer: letsencrypt-prod}
    autoCreatePdb: true
    pdb: {minAvailable: 1}
```

The chart computes consistent names (`demo-api`), selectors
(`app.kubernetes.io/component: api`), port references, and Certificate
host lists. The relationships between resources are encoded in the
template, not in `values.yaml`. Renaming the workload renames every
derived resource together.

## The escape hatch

`autoCreate*` covers the common path. For everything else — a
`PersistentVolumeClaim`, a `CronJob` not modelled by the chart, a
vendor-specific CRD — `extraManifests` accepts raw YAML appended to
the template output:

```yaml
extraManifests:
  - apiVersion: v1
    kind: PersistentVolumeClaim
    metadata: {name: demo-data}
    spec:
      accessModes: [ReadWriteOnce]
      resources: {requests: {storage: 10Gi}}
```

`extraManifests` content is **not** schema-validated by the chart —
it's a deliberate escape hatch.

## Pitfalls

- **`helm uninstall` removes everything auto-created.** Including
  PersistentVolumeClaims auto-derived for StatefulSet templates and
  the auto-created ServiceAccount. If you need data to outlive the
  release, mount a pre-provisioned PVC via `extraManifests`.
- **Auto-creation hides resources.** `kubectl get all` does not show
  `ServiceMonitor`, `NetworkPolicy`, or `Certificate`. To audit, use
  the chart's label selector:

  ```bash
  kubectl get all,sm,np,cert -l app.kubernetes.io/instance=demo
  ```

## Reference

- [`autoCreateService`](../reference/values.md#deploymentspec-autocreateservice) and friends
- [`extraManifests`](../reference/values.md) — search for the keyword
