<p align="center">
  <img src="docs/assets/hero.webp" alt="idlefy-universal — schema-first universal Helm chart for Kubernetes workloads" width="820"/>
</p>

# idlefy-universal

Universal Helm chart for Kubernetes workloads — typed JSON Schema, agent-native metadata, auto-creation, Gateway API.

[![Helm 3.8+](https://img.shields.io/badge/helm-%E2%89%A53.8-blue?logo=helm)](https://helm.sh)
[![Kubernetes 1.31+](https://img.shields.io/badge/kubernetes-%E2%89%A51.31-blue?logo=kubernetes)](https://kubernetes.io)
[![License Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-idlefy.github.io-blue)](https://idlefy.github.io/idlefy-universal/)
[![Helm Chart CI](https://github.com/idlefy/idlefy-universal/actions/workflows/helm.yaml/badge.svg)](https://github.com/idlefy/idlefy-universal/actions/workflows/helm.yaml)

## What this is

- **Typed values.** Strict JSON Schema 2020-12 validates `values.yaml` at install time; typos and cross-field violations fail fast with a JSON Pointer path.
- **Agent-native.** Every schema node carries `x-agent-*` metadata. The machine-readable `agent-index.json` ships inside the chart for skills and docs generators.
- **Auto-creation.** One flag each for Service, Ingress, Certificate, ServiceMonitor, PodDisruptionBudget, NetworkPolicy, RBAC, and ServiceAccount.
- **Modern Kubernetes.** Gateway API HTTPRoute alongside Ingress; StatefulSet and DaemonSet as first-class workload kinds.

## Install

The chart is distributed via OCI on GitHub Container Registry. Helm 3.8+ required.

```bash
helm install demo oci://ghcr.io/idlefy/idlefy-universal \
  --version 1.0.0 \
  -f values.yaml
```

Prefer a guided experience? Hand the [deploy wizard](https://idlefy.github.io/idlefy-universal/how-to/wizard/)
to an AI agent and it'll author a validated `values.yaml` for you.

A minimal `values.yaml`:

```yaml
deployments:
  hello:
    replicas: 1
    containers:
      main: {image: nginx, imageTag: "1.27-alpine"}
```

## Documentation

- Site: <https://idlefy.github.io/idlefy-universal/>
- Tutorial: [your first app](https://idlefy.github.io/idlefy-universal/tutorials/your-first-app/)
- Reference: [all values](https://idlefy.github.io/idlefy-universal/reference/values/)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)

## License

Apache-2.0 — see [LICENSE](LICENSE).
