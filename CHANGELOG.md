# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-14

Initial release of `idlefy-universal` — a universal Helm chart with a typed,
JSON-Schema-driven values contract.

### Highlights

- **Typed values schema.** `values.schema.json` is fully typed with
  `additionalProperties: false` across every chart-owned field. `helm install`
  and `helm template` reject unrecognised fields (typos, deprecated keys,
  non-whitelisted custom fields) before they reach the cluster.
- **Layered schema sources.** Schema lives in `schema/structure/*.yaml` (types)
  and `schema/docs/*.yaml` (descriptions, examples, `x-agent-*` metadata).
  Python build tool `schema/build.py` merges, lints, and emits both
  `values.schema.json` and `docs/values-reference.md`.
- **Agent-facing metadata.** Custom JSON-Schema keywords for AI agents
  (delivery-agnostic — consumed by skills, docs, or future MCP):
  `x-agent-when-to-use`, `x-agent-related-fields`, `x-agent-common-mistakes`,
  `x-agent-example-use-case`.
- **Lean validation templates.** `templates/_validation.tpl` focuses on
  cross-resource checks (`secretRefs` lookup, name length) and computed logic
  (subdomain + global domain regex); schema owns type/required/enum/pattern.
- **Cross-field schema rules.** Example: `autoCreateCertificate: true` requires
  `autoCreateIngress: true`, enforced at schema layer.
- **Namespaced RBAC.** Per-workload `autoCreateRbac: true` + `rbac.rules`
  emits least-privilege `Role` + `RoleBinding` bound to the workload's
  ServiceAccount. Available on `deployments`, `statefulSets`, `daemonSets`,
  `jobs`, `cronJobs`.
- **NetworkPolicy.** Per-workload `autoCreateNetworkPolicy: true` +
  `networkPolicy.{ingress,egress,policyTypes}` emits a `NetworkPolicy` whose
  `podSelector` is auto-derived from the workload key. `*General` defaults
  merge into per-instance values.
- **Gateway API HTTPRoute.** First-class support alongside classic Ingress.
- **CI guardrails.** `.github/workflows/schema.yaml` enforces source-of-truth
  consistency: committed schema, docs, and agent-index must match a rebuild.
  `.github/workflows/helm.yaml` runs `ct lint` + `helm-unittest` on every PR.

### Requirements

- **Helm 3.6.0+.** Schema uses `if/then/else`; Helm 3.0-3.5 silently skip
  those constructs and validation will not run.
- **Kubernetes 1.19+.**

### Install

```bash
helm repo add idlefy https://idlefy.github.io/idlefy-universal
helm repo update
helm install my-release idlefy/idlefy-universal -f my-values.yaml
```
