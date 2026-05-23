# Validation

Two validation layers run on `helm install`:

1. **Schema layer** — JSON Schema 2020-12 with `additionalProperties: false`
   and `if/then/else` cross-field rules. Runs first; rejects typos and
   constraint violations before any template is rendered.
2. **Template layer** — `templates/_validation.tpl` runs cross-resource
   checks (Secret reference group lookup, computed-ingress host/subdomain
   regex). Runs during template rendering; fails the install with a
   readable message.

## Schema-enforced cross-field rules

| Rule                                                                                   | Trigger                                              |
|----------------------------------------------------------------------------------------|------------------------------------------------------|
| `autoCreateCertificate: true` requires `autoCreateIngress: true`                       | `/deployments/<n>/autoCreateCertificate`             |
| `autoCreateRbac: true` requires `autoCreateServiceAccount: true`                       | `/deployments/<n>/autoCreateRbac`                    |
| `serviceMonitor` requires `autoCreateService: true`                                    | `/deployments/<n>/serviceMonitor`                    |
| `ingress.hosts[].subdomain` requires `generic.ingressesGeneral.domain` to be set       | `/deployments/<n>/ingress/hosts`                     |
| `httpRoutes[].rules[].backendRefs[].name` must reference a known Service               | Template-layer (see below)                           |

Schema errors report a JSON Pointer path. Example:

```
Error: INSTALLATION FAILED: values don't meet the specifications of the schema(s):
- deployments.api.autoCreateCertificate: autoCreateCertificate requires autoCreateIngress
```

## Template-layer checks

`templates/_validation.tpl` performs (verify the current source before
expanding this list; the items below reflect the template at the time
this page was written):

- **`secretRefs` group lookup** — every group name listed in a
  container's `secretRefs:` array must exist as a key in the top-level
  `secretRefs:` map. Catches typos like `containers.main.secretRefs: [db-cred]`
  vs `secretRefs: {db-creds: …}`.
- **`secretRefs` group shape** — each top-level group must be a list of
  `{name, secretKeyRef: {name, key}}` entries; missing keys fail with a
  group-name-qualified error.
- **Root context sanity** — `Chart` and `Release` must be present;
  `Release.Name` and `Release.Service` must be non-empty.

Template-layer errors look like:

```
Error: execution error at (idlefy-universal/templates/_validation.tpl:101:7):
deployments.api - Container main: referenced secretRef 'db-cred' not found
in .Values.secretRefs.
```

Per-`env` `valueFrom.secretKeyRef` references are NOT validated at the
template layer — they are resolved by the Kubernetes API server at pod
admission time. To get install-time validation of secret usage, use the
top-level `secretRefs:` group mechanism instead.

## Pitfalls

- **Adding a new top-level key** — the schema's `additionalProperties: false`
  rejects unknown keys. Either contribute the field upstream or use
  Helm's `extraManifests` (raw YAML) escape hatch.
- **Disabling validation** — `helm install --skip-tests` does *not*
  disable schema validation; that's a different gate. Schema can only
  be bypassed by stripping `values.schema.json` from the packaged
  chart, which is unsupported.

## Reference

- [Schema design rationale](../concepts/schema-driven-values.md)
- [`values.md`](values.md)
