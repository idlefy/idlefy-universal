---
name: idlefy-universal-authoring
description: Use when authoring or modifying values.yaml for the idlefy-universal Helm chart. Provides field lookup, common recipes, and source-of-truth pointers without loading the full 117k-token values.schema.json into context.
---

# idlefy-universal-authoring

Helps you write a correct `values.yaml` for the `idlefy-universal` chart. Use this skill whenever the user wants to deploy, modify, or troubleshoot a workload that targets this chart.

## When to use

Trigger on phrases like:
- "deploy X with idlefy-universal", "add a deployment to the chart"
- "values.yaml for idlefy-universal", "configure ingress / cron / job in the chart"
- "what fields does idlefy-universal support for X?"
- "schema-validate failed, fix my values"

## Decision tree

1. **What kind of workload?**
   - Long-running stateless → `deployments`
   - Stateful with persistent storage or stable DNS → `statefulSets`
   - Node-level agent (log shipper, monitoring, CNI) → `daemonSets`
   - Scheduled recurring → `cronJobs`
   - One-off (migration, seed) → `jobs`
   - Standalone Service/Ingress/HTTPRoute → `services` / `ingresses` / `httpRoutes`
   - HPA only → `hpas`
   - PVC only → `persistentVolumeClaims`
   - ConfigMap/Secret → `configs`
   - Reusable env-var groups → `secretRefs`
   - Chart-wide defaults → `generic` / `deploymentsGeneral` / `statefulSetsGeneral` / `daemonSetsGeneral`

2. **Is there a recipe?** Check `agent-index.json` → `recipes[]`. If `id` matches the intent, copy `snippet` and adapt. Don't read schema files unnecessarily.

3. **Need a specific field?** Use the lookup algorithm below.

## Lookup algorithm

**Step 1.** Read `charts/idlefy-universal/agent-index.json` once per session.

**Step 2.** Identify the top-level key (`deployments`, `jobs`, etc.) from user intent.

**Step 3.** Check `recipes[]`. Exact-ish match → copy snippet and customize.

**Step 4.** For fields not in any recipe, follow `topLevelKeys.<key>.lookupHint` and `Read` just that file. The `*.yaml` files in `schema/docs/` contain full descriptions, examples, and `x-agent-*` metadata for every field — that's the right grain.

**Step 5.** Only if the structural detail (types, enums, patterns) is needed and not in the docs file, extract just the relevant slice from `charts/idlefy-universal/values.schema.json` via a one-shot shell command — for example:

```bash
python3 -c "import json, pathlib; print(json.dumps(json.loads(pathlib.Path('charts/idlefy-universal/values.schema.json').read_text())['properties']['deployments'], indent=2))"
```

Discard the output once you have what you need. Do NOT `Read` the file in full.

## Source-of-truth pointers

| Concept | File |
|---|---|
| Top-level shape | `charts/idlefy-universal/values.schema.json` (read by path only) |
| Per-domain types | `schema/structure/<domain>.yaml` (small, ~3 KB each) |
| Field descriptions, examples, agent metadata | `schema/docs/<domain>.yaml` |
| K8s primitive types ($ref targets) | `schema/docs/k8s_primitives.yaml` (large — grep first) |
| Auto-creation features | `docs/how-to/auto-creation.md` |
| Hand-written recipes (longer than what's in the index) | `docs/how-to/*.md` |
| Full reference | `docs/reference/values.md` (large — do not Read whole) |

## Anti-patterns

- **Reading `values.schema.json` in full.** It's 458 KB / ~117 k tokens. Use `agent-index.json` for navigation, slice the schema only when needed.
- **Reading `docs/reference/values.md` in full.** Same — use the index, grep for the field name.
- **Inventing field names.** Every chart-owned property is in the schema with `additionalProperties: false`. If you guess and the field doesn't exist, `helm install` will reject it. When unsure, grep `schema/docs/` first.
- **Skipping `imageTag`.** This chart never relies on `:latest`; `imageTag` is required on every container.
- **Mixing `pdb.minAvailable` and `pdb.maxUnavailable`.** Pick exactly one — the schema rejects both.
- **Same workload name in two top-level keys.** A `deployments.foo` and `statefulSets.foo` will be rejected at template-time — component labels would collide.
- **StatefulSet without `serviceName`.** Required by Kubernetes; schema rejects.
- **DaemonSet with `replicas`.** Pod count is managed by node count; schema rejects.

## Verification

After authoring or modifying `values.yaml`, always validate. The repo runs Python tooling inside a Docker image — `make schema-shell` drops you in, then:

```bash
python -m schema.build validate-fixtures --values path/to/values.yaml
```

For the canonical fixtures suite (no file argument), `make schema-validate` runs the full set.

If validation passes, optionally render:

```bash
helm template my-release ./charts/idlefy-universal -f path/to/values.yaml
```

## Common gotchas

- `autoCreateCertificate: true` requires `autoCreateIngress: true` (schema enforces).
- `autoCreateServiceMonitor: true` works best with a port named `http-metrics`.
- `httpRoutes` and `ingresses` can both coexist — pick one per route.
- `secretRefs` are reusable groups consumed via `envFrom` in container specs.
