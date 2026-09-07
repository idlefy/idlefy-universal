# Playground

Author `values.yaml` in the browser and see the Kubernetes resources it produces as a live
dependency graph. Rendering runs a real Helm template engine compiled to WebAssembly, so
what you see is what `helm template` would print. Nothing leaves your browser.

[Open the playground](https://idlefy.github.io/idlefy-universal/playground/){ .md-button .md-button--primary }

- Left: a schema-aware YAML editor with completion and inline validation.
- Right: every rendered object, with edges for selectors, backends, mounts, RBAC and TLS.
- Dashed nodes are dependencies the release references but does not create.
- Click a node to see its manifest; the editor jumps to the values that produced it.

## Object Inspector

Select any node and open the **Inspector** tab in the detail panel:

- **Basic / Advanced** — Basic shows the fields most values files set (marked `x-ui-tier: basic`
  in the schema) plus anything already present; Advanced shows every field.
- **Secondary resources** — one toggle per resource the chart can auto-create for that workload
  (Service, Ingress, HTTPRoute, Certificate, HPA, migrations Job, PDB, ServiceMonitor,
  NetworkPolicy, RBAC, ServiceAccount). Turning one on writes the flag and a minimal valid block;
  turning it off applies the same edits `helm` would need to stop rendering it. Toggles the chart
  cannot honour for a kind are not shown.
- Kubernetes passthrough fields (affinity, volumes, tolerations, …) are edited as YAML.
- Every change lands in the editor as a single undoable edit — `Ctrl+Z` in the editor reverts it.

Workloads and the resources they auto-create are drawn inside a dashed container on the canvas.

IntOrString fields (for example `pdb.minAvailable`) accept either a percentage (`50%`) or a whole
number. Kubernetes label and annotation maps always store their values as strings, even when they
look numeric or boolean.

**Known limitation:** the inspector rewrites `values.yaml` through a YAML serializer, so flow
collections, quoting, block scalars and long lines round-trip byte-for-byte. The exception is the
very first inspector edit on a document that uses flush-left sequences (`- a` at the parent's
indentation), multiple spaces before a `# comment`, or a trailing comment with no blank line above
it — that first edit normalises those lines once (sequences get indented, comments get one leading
space). It happens once, lands as a single undo step, and never recurs after that.
