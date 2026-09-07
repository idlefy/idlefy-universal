# idlefy-universal Playground

Browser-only builder for `values.yaml`: real Helm rendering in WASM, schema-aware editor,
resource dependency graph. User-facing documentation lives at `docs/playground-guide.md` on the MkDocs site.

- `engine/` — slim Helm engine (Go). `go test ./...` runs the golden test against `helm template`
  (requires helm v3.19.x on PATH; skipped locally if absent, mandatory in CI).
- `web/` — Vite + React SPA. `npm test` (Vitest), `npm run e2e` (Playwright). Both need
  `public/helm.wasm` (`bash engine/build.sh`); the chart bundler refuses to run without it.
- `make playground-build` builds everything inside Docker; `make playground-dev` serves the SPA at
  <http://localhost:5173/playground/> (the Vite `base`, so the bare `/` is a 404).

## Inspector (Phase 2)

- `web/src/inspector/schema.ts` — `$ref`/`allOf` resolution, `schemaAt(path)`, widget classification.
- `web/src/inspector/form.ts` — `buildFields(schema, value, tier)`: basic tier = `x-ui-tier: basic`, required, or present in the document.
- `web/src/inspector/fields/*` — one widget per kind (boolean, number, string, list, keyvalue, object, map, yaml).
- `web/src/inspector/target.ts`, `Toggles.tsx`, `Inspector.tsx` — where a graph node opens, secondary-resource toggles, the panel.
- `web/src/graph/secondary.ts` — the one table of auto-created resources (kinds, on/off ops); `expectations.ts` reads it too.
- `web/src/canvas/groups.ts` — a workload and the resources it owns are drawn inside one container.

Field tiers come from the `x-ui-tier` vendor keyword in `values.schema.json`; see `docs/reference/agent-metadata.md`.

### UI

- `web/src/app/Panes.tsx`, `web/src/app/panes.ts` — the three-pane layout (`SplitHandle`, `Rail`, `usePanes`): resizable, collapsible editor and inspector panes around the canvas, sizes persisted to `localStorage`.
- `web/src/canvas/icons/` — official Kubernetes resource icons; regenerate with `node web/scripts/fetch-k8s-icons.mjs`, attribution in `web/src/canvas/icons/NOTICE`.
- `web/src/inspector/sections.ts` — groups inspector fields into Workload, Containers, Auto-created resources, Metadata and (advanced) Placement & security sections.
- `web/src/inspector/fields/*` — compound widgets (`ContainersField`, `ImageField`, `ResourcesField`, `PortsTable`, …) alongside the primitive ones.
- `web/src/inspector/AutoCreated.tsx`, `web/src/inspector/summary.ts` — the auto-created-resources switch list, its one-line summaries and `open ›` links.

## monaco-yaml coverage

Checked against `src/chart-bundle/schema.json` (draft-07, 156 `$defs`) with the editor from
Task 14, both in `npm run dev` and against the production build. monaco-yaml's diagnostics are a
convenience layer — the Helm engine remains authoritative — but they do cover more of the schema
than expected:

| Schema construct | Probe | Inline diagnostic before the engine ran? |
| --- | --- | --- |
| `if`/`then` (`DeploymentSpec`) | `autoCreateCertificate: true` with no `autoCreateIngress` | **yes** — `Missing property "autoCreateIngress".` on the workload node |
| `propertyNames` pattern | workload key `Web` (uppercase) | **yes** — `String does not match the pattern of "^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$".` |
| `type` | `replicas: "three"` | yes — `Incorrect type. Expected "integer".` |
| `additionalProperties: false` | unknown key inside a workload | yes — `Property <key> is not allowed.` |
| `required` | missing `containers` / `imageTag` | yes — `Missing property "…".` |
| completion | typing `dep` at the root | yes — offers `deployments`, `deploymentsGeneral` |
| hover | `replicas` | yes — description plus `examples` from the schema |

Engine diagnostics are published to the same model under the `engine` marker owner, so schema and
engine problems coexist without overwriting each other.

### Pinned dependency: `monaco-editor` 0.52.x

`monaco-yaml` 5.5.1 talks to monaco through `monaco-worker-manager` 2.0.1, which implements the
worker handshake monaco used up to 0.52. monaco 0.53 added an extra message hop
(`vs/internal/common/initialize.js`), which leaves the worker-manager one message out of sync: the
yaml worker starts but its language service is never installed, so every request fails with
`Missing requestHandler or method: doValidation`. monaco 0.56 additionally dropped `./esm/vs/*`
from its package `exports` map, which `monaco-worker-manager` still imports. Until monaco-yaml
ships support for the new bootstrap, `monaco-editor` must stay on `^0.52.2`.
