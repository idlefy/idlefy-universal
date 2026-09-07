# Playground

Author `values.yaml` in the browser and see the Kubernetes resources it produces as a live
dependency graph. Rendering runs a real Helm template engine compiled to WebAssembly, so
what you see is what `helm template` would print. Nothing leaves your browser.

[Open the playground](https://idlefy.github.io/idlefy-universal/playground/){ .md-button .md-button--primary }

- Every rendered object appears as a node, with edges for selectors, backends, mounts, RBAC and TLS.
- Dashed nodes are dependencies the release references but does not create.
- Click a node to select it: the inspector opens, and the editor jumps to the values that
  produced it.

### Layout

The playground is three panes: **values.yaml** on the left, the **resource graph** in the middle, the **inspector** on the right. Drag the dividers to resize; the left and right panes collapse into a narrow rail (click it, or use the **YAML** / **Inspector** buttons in the header, to bring them back). The YAML pane starts collapsed; sizes are remembered in your browser. Selecting a node always opens the inspector.

The editor folds YAML blocks by indentation (chevrons in the gutter), shows indentation guides, pins the parent keys at the top while you scroll inside a block, and marks the whole values block of the selected node.

### Object Inspector

Click a node. The panel header shows the object's icon, name, kind, namespace and the values.yaml line it comes from. **Fields** edits the object; **Manifest** shows the rendered YAML.

Workload panels are grouped: **Workload** (replicas and rollout settings), **Containers** (one card per container with `image:tag`, resources as a cpu/memory grid, ports as a table), **Auto-created resources** (a switch per resource the chart can create for this workload, with a one-line summary and an *open ›* link to its node), **Metadata**, and, with **show all fields** on, **Placement & security**. A field only gets a control once it exists in values.yaml; everything else is an *Add* chip that inserts the schema's starter value. Clearing a control removes the key.

Icons are the official Kubernetes resource icons (© The Kubernetes Authors, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), from [kubernetes/community](https://github.com/kubernetes/community/tree/master/icons)), recolored per resource family.

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
