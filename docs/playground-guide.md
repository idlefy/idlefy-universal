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

Every workload sits in a **group** on the canvas: a dashed frame with a header (`Deployment hello`) and a **+ Add resource** pill. Click the header or the frame to open the **group panel**: a **Workload** row that opens the workload itself, and **Created alongside it**, a switch per resource the chart can create for this workload (Service, Ingress, HPA, …) with a one-line summary and an **Open** button. The **Manifests** tab shows every manifest in the group.

A **workload panel** shows only the workload: **Workload** (replicas and rollout settings), **Containers** (one card per container with `image:tag`, resources as a cpu/memory grid, ports as a table), **Metadata**, and, with **Show all fields** on, **Placement & security**. Sections hidden on the basic tier are named in a footer with a **Show all fields** link. Each auto-created resource opens its own panel: who it was created for, an **enabled** switch, and only its own settings (an Ingress shows routing, TLS and metadata; a Service shows the owner's service keys and the container ports). A configured block whose resource is not rendered (switch off, or blocked) still opens from the group panel.

A field only gets a control once it exists in values.yaml; everything else is an *Add* chip that inserts the schema's starter value. Clearing a control removes the key.

Lists edit as rows: plain string lists (`args`, `policyTypes`) one input per line, lists of objects (`env`, ingress `hosts`, `tolerations`) as a name plus its one or two main values, with a `…` button for the rest, or as a collapsible block when the item is larger. `secretRefs` is one card per group with a row per variable. Only Kubernetes passthrough objects (`affinity`, raw `volumes`, RBAC rules) stay YAML, shown as a two-line preview with an **Edit as YAML** button.

Icons are the official Kubernetes resource icons (© The Kubernetes Authors, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), from [kubernetes/community](https://github.com/kubernetes/community/tree/master/icons)), recolored per resource family.

IntOrString fields (for example `pdb.minAvailable`) accept either a percentage (`50%`) or a whole
number. Kubernetes label and annotation maps always store their values as strings, even when they
look numeric or boolean.

**Known limitation:** the inspector rewrites `values.yaml` through a YAML serializer, so flow
collections, quoting, block scalars and long lines round-trip byte-for-byte. The exception is the
very first inspector edit on a document that uses flush-left sequences (`- a` at the parent's
indentation), multiple spaces before a `# comment`, or a trailing comment with no blank line above
it — that first edit normalises those lines once (sequences get indented, comments get one leading
space). It happens once, lands as a single undo step, and never recurs after that.
