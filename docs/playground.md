<!--
  Deploy note: this page builds to `site/playground/index.html`, which is the
  exact path the playground SPA is unpacked to by the `build` job of
  .github/workflows/docs.yaml (Vite `base: '/playground/'`). The SPA's
  index.html therefore REPLACES this page on the deployed site: the nav entry
  "Playground" opens the app directly, and this prose survives only in the
  MkDocs search index. Moving the landing page to its own URL requires a
  product decision (which URL, and what the nav label points at) — see the
  Task 17 report.
-->
# Playground

Author `values.yaml` in the browser and see the Kubernetes resources it produces as a live
dependency graph. Rendering runs a real Helm template engine compiled to WebAssembly, so
what you see is what `helm template` would print. Nothing leaves your browser.

[Open the playground](https://idlefy.github.io/idlefy-universal/playground/){ .md-button .md-button--primary }

- Left: a schema-aware YAML editor with completion and inline validation.
- Right: every rendered object, with edges for selectors, backends, mounts, RBAC and TLS.
- Dashed nodes are dependencies the release references but does not create.
- Click a node to see its manifest; the editor jumps to the values that produced it.
