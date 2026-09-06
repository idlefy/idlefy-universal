# Playground

Author `values.yaml` in the browser and see the Kubernetes resources it produces as a live
dependency graph. Rendering runs a real Helm template engine compiled to WebAssembly, so
what you see is what `helm template` would print. Nothing leaves your browser.

[Open the playground](https://idlefy.github.io/idlefy-universal/playground/){ .md-button .md-button--primary }

- Left: a schema-aware YAML editor with completion and inline validation.
- Right: every rendered object, with edges for selectors, backends, mounts, RBAC and TLS.
- Dashed nodes are dependencies the release references but does not create.
- Click a node to see its manifest; the editor jumps to the values that produced it.
