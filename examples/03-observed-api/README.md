# 03 — observed-api

A web app with Prometheus scrape coverage and a PodDisruptionBudget.

## What it shows

- Multi-container deployment (`main` + `exporter` sidecar).
- `autoCreateServiceMonitor` for Prometheus discovery.
- `autoCreatePdb` with `minAvailable: 1` for safe rolling drains.
- `replicas: 2` so the PDB is satisfiable.

## Prerequisites

- `monitoring.coreos.com/v1` CRDs installed (Prometheus Operator or
  kube-prometheus-stack).

## Try it

```bash
helm install demo oci://ghcr.io/idlefy/idlefy-universal \
  --version 1.0.0 \
  -f examples/03-observed-api/values.yaml
```

Verify:

```bash
kubectl get servicemonitor,pdb,svc,deploy \
  -l app.kubernetes.io/instance=demo
```

## CI

Mirrored at `charts/idlefy-universal/ci/example-03-observed-api-values.yaml`.
