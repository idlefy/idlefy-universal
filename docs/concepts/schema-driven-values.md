# Schema-driven values

`idlefy-universal` rejects malformed `values.yaml` at `helm install`
time, before any manifest reaches Kubernetes. This page explains why
that choice was made and what falls out of it. For the field catalogue
see [Reference → values](../reference/values.md).

## Why a typed contract

A traditional Helm chart treats `values.yaml` as opaque YAML. Typos
(`replicaCount` vs `replicas`), deprecated keys, and silent schema
drift make it to the cluster and surface as confusing apply errors —
or worse, as a working but wrong manifest. The fix is upstream
validation: a JSON Schema attached to the chart so Helm refuses to
install when the values file is wrong.

## `additionalProperties: false`

Every chart-owned object sets `additionalProperties: false`. The
consequence: an unknown field is a hard error. `replicaCount: 3` (the
common typo for `replicas: 3`) fails with a path-precise message:

```
deployments.api.replicaCount: Additional property replicaCount is not allowed
```

This costs almost nothing to maintain and eliminates a whole class of
silent-misconfiguration bugs.

## Why JSON Schema 2020-12

Three reasons:

1. **Helm's built-in.** Helm has supported JSON Schema in charts since
   3.0; no plugin or wrapper required.
2. **`if/then/else` is native.** 2020-12 introduced first-class
   conditional schemas. Cross-field rules (`autoCreateCertificate`
   requires `autoCreateIngress`) compile directly to schema, with no
   custom validator code.
3. **Tooling is everywhere.** Editors, agents, doc generators, and
   linters all speak JSON Schema. Adopting CUE or Dhall would gain
   expressiveness but lose the ecosystem.

## Layered schema sources

The schema is not authored by hand — that would conflate types with
documentation and produce a 10k-line `values.schema.json` no human can
read. Instead two source layers feed `schema/build.py`:

- `schema/structure/*.yaml` — pure types. Required fields,
  `additionalProperties: false`, enum constraints, `if/then/else`. No
  prose.
- `schema/docs/*.yaml` — descriptions, examples, `x-agent-*` metadata.
  Joined by JSON Pointer at build time.

`schema/build.py` merges them, lints (no orphan docs without types, no
types without docs), and emits three artefacts:

```
schema/structure/*.yaml  ┐
schema/docs/*.yaml       ├──> values.schema.json (Helm consumes)
                         ├──> agent-index.json  (agents consume)
                         └──> docs/reference/values.md (humans consume)
```

A CI gate (`.github/workflows/schema.yaml`) re-runs the build and fails
if any of the three artefacts drift from the committed version.

## What this is not

- **Not a substitute for Kubernetes admission control.** The schema
  checks the *chart input*. Admission controllers (PodSecurity, OPA,
  Kyverno) check the *resulting manifests*. Both layers are
  complementary; neither is sufficient alone.
- **Not a runtime validator.** Once `helm install` succeeds, the chart
  has no further say in what happens to the live resources.

## Reference

- [`values.md`](../reference/values.md) — the catalogue
- [`agent-metadata`](../reference/agent-metadata.md) — the agent shape
- [`validation`](../reference/validation.md) — cross-field rules listing
