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

Every workload sits in a **group** on the canvas: a dashed frame with a header (`Deployment hello`) and a **+ Add resource** pill. Click the header or the frame to open the **group panel**: a **Workload** row that opens the workload itself, and **Created alongside it**, a switch per resource the chart can create for this workload (Service, Ingress, HPA, …) with a one-line summary and an **Open** button. A switch the chart cannot honour is greyed out with the reason in place of the summary — that includes switching one *off*: ServiceAccount stays on while Role + RoleBinding needs it. The **Open** button itself only appears once the switch is on or the block already holds a value; an untouched, switched-off resource has nothing yet to open. The **Manifests** tab shows every manifest in the group.

A **workload panel** shows only the workload: **Workload** (replicas and rollout settings), **Containers** (one card per container with `image:tag`, resources as a cpu/memory grid, ports as a table), **Metadata**, and, with **Show all fields** on, **Placement & security**. Sections hidden on the basic tier are named in a footer with a **Show all fields** link. Each auto-created resource opens its own panel: who it was created for, an **enabled** switch, and only its own settings (an Ingress shows routing, TLS and metadata; a Service shows the owner's service keys and the container ports). A configured block whose resource is not rendered (switch off, or blocked) still opens from the group panel.

A field only gets a control once it exists in values.yaml; everything else is an *Add* chip that inserts the schema's starter value. Clearing a control removes the key — except where the chart cannot render without it. A key the schema requires (`containers`, a StatefulSet's `serviceName`, a CronJob's `schedule`, a Config's `type`), a key only the chart's own validation requires (an Ingress's `hosts`, an HTTPRoute's `hostnames`, `parentRefs` and `rules`) and the last remaining half of an either/or pair have no × at all; emptying their box leaves the box as you typed it, marked invalid with a `required` note, and nothing is written until it is valid again. A list or map entry under a locked key keeps its ×, but disabled, with the reason in its place: "This list must keep at least one entry", "A workload needs at least one container", "the Service needs at least one container port", or "used by … — remove that reference first". Where a schema says "provide exactly one of" — `pdb.minAvailable` / `pdb.maxUnavailable`, an env row's `value` / `valueFrom` — the other half stays offered as a chip; picking it swaps the pair, and typing into one clears the other. A host row's `host` and `subdomain` boxes are both always visible, with no chip at all; filling one empties the other. The release panel's global domain (`generic.ingressesGeneral.domain`), and the block that holds it, cannot be cleared while any host anywhere uses a subdomain instead of a full hostname.

Lists edit as rows: plain string lists (`args`, `policyTypes`) one input per line, lists of objects (`env`, ingress `hosts`, `tolerations`) as a name plus its one or two main values, with a `…` button for the rest, or as a collapsible block when the item is larger. `secretRefs` is one card per group with a row per variable. Only Kubernetes passthrough objects (`affinity`, raw `volumes`, RBAC rules) stay YAML, shown as a two-line preview with an **Edit as YAML** button.

Icons are the official Kubernetes resource icons (© The Kubernetes Authors, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), from [kubernetes/community](https://github.com/kubernetes/community/tree/master/icons)), recolored per resource family.

IntOrString fields (for example `pdb.minAvailable`) accept either a percentage (`50%`) or a whole
number, and their *Add* chip seeds `1`. Number fields refuse a value outside the schema's range
(a container port is 1–65535, `replicas` is 0 or more): the box turns red and nothing is written.
Kubernetes label and annotation maps always store their values as strings, even when they look
numeric or boolean.

**Known limitation:** the inspector rewrites `values.yaml` through a YAML serializer, so flow
collections, quoting, block scalars and long lines round-trip byte-for-byte. The exception is the
very first inspector edit on a document that uses flush-left sequences (`- a` at the parent's
indentation), multiple spaces before a `# comment`, or a trailing comment with no blank line above
it — that first edit normalises those lines once (sequences get indented, comments get one leading
space). It happens once, lands as a single undo step, and never recurs after that.

### Adding and removing resources

Press **A** anywhere on the page (outside a text field), or click **＋ Add** at the top-left of the
canvas, to open the launcher. Type to filter the eleven things the chart can render at the top
level — the five workload kinds and the standalone Config, Service, Ingress, HTTPRoute, HPA and
PVC — pick one with the arrow keys or the mouse, and name it. The name is checked as you type
against the schema's key pattern (a DNS label for every entry today) and against the names already in
your document — for a workload that means all five workload maps at once, because the chart refuses a
key that appears in more than one of them; the panel previews the YAML the insert will produce.
**Enter** inserts it into `values.yaml`, selects the new node and opens the inspector on it.

Starter bodies come from the schema's own examples, with a few corrections so a from-scratch
document renders: a Deployment gets a container port (so its auto-created Service appears), an
Ingress and an HTTPRoute get `<name>.example.com` as their host, a Service gets a selector
matching its own name. The hostname correction applies to every *Add* chip and every "add item" button,
not just the launcher — adding a hostname anywhere writes a `host`, never a bare `subdomain` that
needs a global domain you have not set. A second container or a second Service port gets a port name
and number no sibling already uses, so the rendered Service never carries a duplicate. References
inside a starter (an HPA's target, a route's backend) are placeholders — edit them in the inspector.

The inspector header of a workload, a workload group or a standalone resource has a **🗑 Remove**
button. It deletes that entry from `values.yaml` (a workload's auto-created resources go with it);
**Ctrl+Z** restores it, from anywhere outside a text field. Auto-created resources have no Remove
button: switch them off from the group panel instead.

When the document renders nothing, the canvas shows a card with **Add a Deployment** and **Load an
example**. Inserts are always block-style, whether you start from an empty editor, from `{}`, or
from a `deployments: {}` left behind by a removal — and removing the last entry of a top-level map
takes the (uncommented) key with it.
