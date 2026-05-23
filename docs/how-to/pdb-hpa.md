# PDB & HPA

Pair a `PodDisruptionBudget` with autoscaling for safe rolling updates
and node drains.

## Recipe A — `minAvailable`

```yaml
deployments:
  api:
    replicas: 3
    containers:
      main: {image: example/api, imageTag: "1.0"}
    autoCreatePdb: true
    pdb:
      minAvailable: 2
```

At least 2 pods stay up during voluntary disruptions (node drain,
upgrade).

## Recipe B — `maxUnavailable`

```yaml
    autoCreatePdb: true
    pdb:
      maxUnavailable: 1
```

At most 1 pod may be unavailable at a time.

## Recipe C — inline HPA bound to a deployment

The chart exposes per-deployment HPA via `deployments.<name>.hpa`.
Setting it both enables the HPA and defines its parameters.

```yaml
deployments:
  api:
    replicas: 2
    containers:
      main: {image: example/api, imageTag: "1.0"}
    hpa:
      minReplicas: 2
      maxReplicas: 10
      metrics:
        - type: Resource
          resource:
            name: cpu
            target: {type: Utilization, averageUtilization: 70}
```

The chart creates one `HorizontalPodAutoscaler` named after the
deployment. `replicas:` on the deployment seeds the initial count;
HPA takes over once metrics are available.

## Pitfalls

- **`pdb.minAvailable: 1` with `replicas: 1`** blocks node drains
  forever. Either raise replicas or relax to `pdb.maxUnavailable: 1`.
- **HPA min < PDB minAvailable** can cause HPA scale-down to fail.
  Keep `hpa.minReplicas >= pdb.minAvailable + 1`.
- **Setting `replicas:` after enabling `hpa:`** — HPA owns the
  replica count once it takes effect; `helm upgrade` re-applying a
  fixed `replicas:` will trigger HPA-vs-Helm churn. Once HPA is
  enabled, either drop `replicas:` from values or accept the value as
  the seed only.

## Reference

- [`autoCreatePdb`](../reference/values.md#deploymentspec-autocreatepdb)
- [`pdb`](../reference/values.md#deploymentspec-pdb)
- [`hpa`](../reference/values.md#deploymentspec-hpa)
