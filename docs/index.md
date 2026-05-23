---
hide:
  - navigation
  - toc
---

![idlefy-universal — schema-first universal Helm chart for Kubernetes workloads](assets/hero.webp){ .idlefy-hero }

# idlefy-universal

> Schema-driven, agent-native Helm chart for any Kubernetes workload.

[Get started](tutorials/your-first-app.md){ .md-button .md-button--primary }
[Reference](reference/values.md){ .md-button }
[GitHub](https://github.com/idlefy/idlefy-universal){ .md-button }

## Why idlefy-universal

- **Typed values contract.** A strict JSON Schema (2020-12) rejects typos and cross-field mistakes before the chart reaches the cluster. `helm install` and `helm template` both validate. Errors include the JSON Pointer path to the failing field.
- **Agent-native metadata.** First-class `x-agent-*` keywords on every schema node plus a machine-readable `agent-index.json` — designed for skills, docs generators, and MCP-style tooling. No separate "agent SDK" required.
- **Batteries-included auto-creation.** One flag each for Service, Ingress, Certificate, ServiceMonitor, PodDisruptionBudget, NetworkPolicy, RBAC (Role + RoleBinding), and ServiceAccount. Defaults wire through `*General` for chart-wide composition.
- **Modern Kubernetes.** Gateway API HTTPRoute alongside classic Ingress. StatefulSet and DaemonSet are first-class workload kinds. Requires Kubernetes 1.31+; CI-tested on 1.35.

## Quickstart

A four-line `values.yaml`:

```yaml
deployments:
  hello:
    replicas: 1
    containers:
      main: {image: nginx, imageTag: "1.27-alpine"}
```

Install:

--8<-- "_snippets/install.md"

For a guided walkthrough, see [your first app](tutorials/your-first-app.md).

## Stack

[![Helm 3.8+](https://img.shields.io/badge/helm-%E2%89%A53.8-blue?logo=helm)](https://helm.sh)
[![Kubernetes 1.31+](https://img.shields.io/badge/kubernetes-%E2%89%A51.31-blue?logo=kubernetes)](https://kubernetes.io)
[![JSON Schema 2020-12](https://img.shields.io/badge/json--schema-2020--12-blue)](https://json-schema.org)
[![Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-green)](https://github.com/idlefy/idlefy-universal/blob/main/LICENSE)

---

_schema-driven · agent-native_
