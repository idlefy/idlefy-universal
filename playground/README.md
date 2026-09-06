# idlefy-universal Playground

Browser-only builder for `values.yaml`: real Helm rendering in WASM, schema-aware editor,
resource dependency graph. User-facing documentation lives at `docs/playground.md` on the MkDocs site.

- `engine/` — slim Helm engine (Go). `go test ./...` runs the golden test against `helm template`
  (requires helm v3.19.x on PATH; skipped locally if absent, mandatory in CI).
- `web/` — Vite + React SPA. `npm test` (Vitest), `npm run e2e` (Playwright).
- `make playground-build` builds everything inside Docker; `make playground-dev` serves on :5173.

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
