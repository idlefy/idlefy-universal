# 01 — hello-world

Smallest possible deployment using `idlefy-universal`: one nginx pod plus an auto-created `ClusterIP` Service. No CRDs required.

## What it shows

- Defining a single Deployment under `deployments:` with one container.
- `autoCreateService: true` deriving a Service from `containers.main.ports`.
- The `servicePort` field controlling the service's port number.

## Try it

```bash
helm install demo oci://ghcr.io/idlefy/idlefy-universal \
  --version 1.0.0 \
  -f examples/01-hello-world/values.yaml
```

Verify:

```bash
kubectl get deploy,svc -l app.kubernetes.io/instance=demo
```

## CI

This example is exercised by `ct install` in PR CI via `charts/idlefy-universal/ci/example-01-hello-world-values.yaml`, a pinned copy. Update both files together when the example changes.
