# Vendored Kubernetes JSON Schema subset

This directory holds a pinned subset of upstream
[yannh/kubernetes-json-schema](https://github.com/yannh/kubernetes-json-schema)
used to type-validate Kubernetes passthrough zones in `values.schema.json`.

## Layout

- `manifest.yaml` — pin (upstream SHA, k8s version, fetch date) and the
  list of `(upstream, local)` type-name mappings.
- `v<X.Y.Z>/definitions.json` — extracted subset: every type in
  `manifest.yaml types` plus its transitive `$ref` closure.

## Refresh procedure

1. Edit `manifest.yaml`:
   - Bump `upstream.ref` to the new pinned commit SHA (NOT a tag — tags are
     theoretically mutable).
   - Bump `upstream.k8s_version` if upgrading K8s.
   - Update `upstream.fetched_at` to today's date.
2. Run the extractor:
   ```
   docker run --rm -v "$(pwd)":/work -w /work ks-schema-builder \
     python -m schema.extract_k8s_subset
   ```
3. Run the full verification stack:
   ```
   make schema-build
   make schema-lint
   make schema-validate
   make schema-test
   make helm-test
   ```
4. Review the diff in `definitions.json` and `values.schema.json`. Upstream
   shape changes show up here — bump the local docs/examples if any newly
   removed or renamed fields are mentioned.
5. Commit `manifest.yaml`, `v<X.Y.Z>/definitions.json`, and the regenerated
   `values.schema.json` together. The extraction script is idempotent: a
   re-run produces a byte-identical file unless upstream changed.

## Adding a new type

1. Append a `{upstream, local}` entry to `manifest.yaml types`.
2. Re-run the extractor (closure includes new transitive deps).
3. Add a `description` (≥20 chars) and `examples: [{}]` entry in
   `schema/docs/k8s_primitives.yaml` so `make schema-lint` stays at 0
   warnings.

## What this directory does NOT cover

- CRDs from third-party operators (cert-manager, prometheus-operator,
  gateway-api). These each have their own release cadence and source
  repos. Their fields stay under `additionalProperties: true`.
- Live fetches at build time. The vendored file is the source of truth.
