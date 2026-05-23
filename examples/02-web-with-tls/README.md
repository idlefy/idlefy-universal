# 02 — web-with-tls

A web app exposed via Ingress with TLS terminated by cert-manager.

## What it shows

- `generic.ingressesGeneral.domain` as a chart-wide host suffix.
- `autoCreateIngress` deriving an Ingress from `ingress.hosts`.
- `autoCreateCertificate` requesting a TLS cert from a `ClusterIssuer`.
- The schema cross-field rule: `autoCreateCertificate` is rejected
  without `autoCreateIngress`.

## Prerequisites

- cert-manager v1.15+ installed.
- A `ClusterIssuer` named `selfsigned` (for local testing) or
  `letsencrypt-staging` (for end-to-end).

## Try it

```bash
helm install demo oci://ghcr.io/idlefy/idlefy-universal \
  --version 1.0.0 \
  -f examples/02-web-with-tls/values.yaml
```

Verify:

```bash
kubectl get ingress,certificate -l app.kubernetes.io/instance=demo
```

## CI

Mirrored at `charts/idlefy-universal/ci/example-02-web-with-tls-values.yaml`.
