# 04 — isolated-workload

A controller workload that:

- Has its own ServiceAccount + RBAC to read ConfigMaps in the namespace.
- Allows only DNS egress to `kube-system` plus Kubernetes API egress
  via the `controller` component selector.
- Denies all ingress (`ingress: []` with `policyTypes: [Ingress]`).

## What it shows

- `autoCreateServiceAccount` paired with `autoCreateRbac`.
- Workload-level `NetworkPolicy` with realistic egress rules.
- Default-deny ingress.

## Prerequisites

For policy enforcement: a CNI that implements NetworkPolicy
(Calico, Cilium, or kube-router). `kindnet` ignores policies — the
resources are created but rules don't take effect.

## Try it

```bash
helm install demo oci://ghcr.io/idlefy/idlefy-universal \
  --version 1.0.0 \
  -f examples/04-isolated-workload/values.yaml
```

Verify:

```bash
kubectl get sa,role,rolebinding,networkpolicy,deploy \
  -l app.kubernetes.io/instance=demo

# RBAC check
kubectl auth can-i list configmaps \
  --as=system:serviceaccount:default:demo-controller
```

Expected: `yes`.

## CI

Mirrored at `charts/idlefy-universal/ci/example-04-isolated-workload-values.yaml`.
PR CI runs under kindnet — NetworkPolicy resources are created but not
enforced. The example is still a valid smoke test of schema + template.
