# idlefy-universal Playground

Browser-only builder for `values.yaml`: real Helm rendering in WASM, schema-aware editor,
resource dependency graph. Design: `docs/superpowers/specs/2026-09-05-playground-design.md`.

- `engine/` — slim Helm engine (Go). `go test ./...` runs the golden test against `helm template`
  (requires helm v3.19.x on PATH; skipped locally if absent, mandatory in CI).
- `web/` — Vite + React SPA. `npm test` (Vitest), `npm run e2e` (Playwright).
- `make playground-build` builds everything inside Docker; `make playground-dev` serves on :5173.
