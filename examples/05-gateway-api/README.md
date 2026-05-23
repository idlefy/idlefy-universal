# 05 — gateway-api

A web workload routed by a Gateway API `HTTPRoute` rather than a
classic Ingress.

## What it shows

- The top-level `httpRoutes:` key.
- `backendRefs` pointing at an auto-created Service (`demo-web`).
- Gateway API v1.5.1 standard channel.

## Prerequisites

- Gateway API v1.5.1 CRDs:

  ```bash
  kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml
  ```

- A Gateway controller (e.g. Envoy Gateway, Cilium, Istio) — **only**
  needed for live traffic; not for schema/template validation.

## Try it

```bash
helm install demo oci://ghcr.io/idlefy/idlefy-universal \
  --version 1.0.0 \
  -f examples/05-gateway-api/values.yaml
```

Verify:

```bash
kubectl get httproute,svc,deploy -l app.kubernetes.io/instance=demo
```

## CI

Mirrored at `charts/idlefy-universal/ci/example-05-gateway-api-values.yaml`.
PR CI installs the Gateway API CRDs and confirms the chart renders +
applies; no controller is installed (out of scope for smoke tests).
