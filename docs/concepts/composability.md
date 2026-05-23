# Composability

`idlefy-universal` lets you set chart-wide defaults once and override
them per workload. This is implemented through `*General` blocks merged
into per-instance values.

## `*General` defaults

Every workload kind has a `<kind>General` sibling at the top level:

- `deploymentsGeneral`, `statefulSetsGeneral`, `daemonSetsGeneral`,
  `jobsGeneral`, `cronJobsGeneral`
- `generic.ingressesGeneral`, `generic.servicesGeneral`

`<kind>General` values are merged into every workload of that kind
before schema validation runs on the merged result. Per-instance
values win.

## Merge rules

| Type        | Rule                                                   |
|-------------|--------------------------------------------------------|
| Scalar      | Per-instance replaces general.                         |
| Map         | Recursive merge; per-instance keys win key-by-key.     |
| Array       | Per-instance **replaces** general (no concatenation).  |

The "array replaces" rule is deliberate. Concatenation would make it
impossible to *remove* an item from a general default, and array
ordering would surprise users.

## Why deep-merge over multi-file overlays

Helm already supports `-f values-base.yaml -f values-prod.yaml`.
Two reasons to layer `*General` inside one file instead:

1. **Validation surface.** Schema validates the *merged* result. With
   multi-file Helm overlays, each file is partial and cannot be
   schema-validated independently.
2. **Discoverability.** A reader of `values.yaml` sees defaults and
   exceptions in one place; with overlay files they must context-switch.

The two mechanisms are not exclusive — you can still use
`-f values-base.yaml -f values-prod.yaml`. Within each file
`*General` composes with per-workload values.

## Worked example

```yaml
deploymentsGeneral:
  nodeSelector:
    kubernetes.io/os: linux
  containers:
    main:
      resources:
        requests: {cpu: 10m, memory: 32Mi}
        limits:   {cpu: 100m, memory: 128Mi}

deployments:
  api:
    containers:
      main:
        image: example/api
        imageTag: "1.0"
        # inherits nodeSelector and resources from deploymentsGeneral
  worker:
    nodeSelector:
      kubernetes.io/os: linux
      workload-class: heavy   # overrides — wholesale map replace
    containers:
      main:
        image: example/worker
        imageTag: "1.0"
        resources:
          requests: {cpu: 100m, memory: 256Mi}
          limits:   {cpu: 500m, memory: 512Mi}
```

`api` inherits `nodeSelector` and `resources` from `deploymentsGeneral`.
`worker` overrides both: `nodeSelector` deep-merges (both keys present
because both maps are merged), `resources.requests` replaces (per-key
deep merge again).

## Pitfalls

- **Arrays don't merge.** Setting `args: [--quiet]` in `deploymentsGeneral`
  and `args: [--verbose]` per-instance results in `[--verbose]`, not
  `[--quiet, --verbose]`.
- **Empty per-instance map is "no override," not "set to empty."**
  Use `~` (YAML null) to unset a default.

## Reference

- [`deploymentsGeneral`](../reference/values.md)
- [`generic.ingressesGeneral`](../reference/values.md#ingressesgeneralconfig)
