# Agent metadata

`idlefy-universal` ships first-class JSON Schema metadata for AI agents:
four `x-agent-*` vendor keywords on every schema node, plus a
machine-readable `agent-index.json` bundled inside the chart.

This page is the consumer-side contract. For the design rationale see
[Concepts → agent-native](../concepts/agent-native.md).

## `x-agent-when-to-use`

Type: string. Plain-prose explanation of *when* a user should set the
field, written for an agent that has the schema but not the docs.

Example, from `/deployments/<name>/autoCreateRbac`:

```yaml
x-agent-when-to-use: |
  Set true when the workload calls the Kubernetes API and needs RBAC.
  Always combine with autoCreateServiceAccount: true; the chart binds
  the auto-created Role to that ServiceAccount.
```

## `x-agent-related-fields`

Type: array of JSON Pointer strings. Fields whose values constrain or
are constrained by this one.

```yaml
x-agent-related-fields:
  - /deployments/{name}/autoCreateServiceAccount
  - /deployments/{name}/rbac/rules
```

`{name}` is a path template marker — the actual workload key
substitutes.

## `x-agent-common-mistakes`

Type: array of strings. Failure modes an agent should pre-check.

```yaml
x-agent-common-mistakes:
  - Setting autoCreateRbac: true without autoCreateServiceAccount: true (validation will fail).
  - Using wildcard verbs ("*") — rejected by the schema.
```

## `x-agent-example-use-case`

Type: string. One realistic scenario where setting this field is the
right choice.

```yaml
x-agent-example-use-case: |
  Controller that watches ConfigMaps in its own namespace to react to
  configuration changes.
```

## `agent-index.json`

A flat machine-readable index shipped at `charts/idlefy-universal/agent-index.json`.
Generated alongside `values.schema.json` by `python -m schema.build`.

Shape:

```json
{
  "$schemaVersion": "1.0.0",
  "chart": "idlefy-universal",
  "chartVersion": "1.0.0",
  "fields": [
    {
      "pointer": "/deployments/{name}/autoCreateRbac",
      "type": "boolean",
      "default": false,
      "whenToUse": "...",
      "relatedFields": ["..."],
      "commonMistakes": ["..."],
      "exampleUseCase": "..."
    }
  ]
}
```

A consuming agent loads this single JSON to learn the full surface area
without parsing the schema.

## `$schemaVersion` policy

`$schemaVersion` follows SemVer for the *agent-index shape*, not for
the chart:

- **PATCH** — added optional fields per entry. Consumers can ignore.
- **MINOR** — added required fields per entry. Consumers must update.
- **MAJOR** — restructured shape (e.g. `fields[]` becomes `byPointer{}`).
  Consumers must migrate.

The chart version is in `chartVersion`, separate from `$schemaVersion`.

## Reference

- [Schema source layout](../concepts/schema-driven-values.md)
- [`values.md`](values.md) — the human-readable view of the same data
