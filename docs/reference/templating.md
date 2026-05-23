# Templating

A subset of chart fields accept Go template expressions. This page lists
which fields, what values are in scope, and how evaluation interacts
with schema validation.

## Template-evaluated fields

| Pointer                                                  | Notes                                  |
|----------------------------------------------------------|----------------------------------------|
| `/deployments/<name>/containers/<id>/image`              | Whole string is templated.             |
| `/deployments/<name>/containers/<id>/imageTag`           | Whole string is templated.             |
| `/deployments/<name>/containers/<id>/env/<index>/value`  | The `value` of each env var is templated; nested `valueFrom` objects are not. `env` is an array of `{name, value\|valueFrom}` items, not a map. |
| `/deployments/<name>/containers/<id>/args`               | Each array element templated.          |

Other fields are **not** templated. Putting `{{ .Release.Name }}` into a
non-templated field passes schema validation but produces a literal
string in the rendered manifest.

## Available template values

Standard Helm built-ins:

- `.Release.Name`, `.Release.Namespace`, `.Release.Revision`
- `.Chart.Name`, `.Chart.Version`, `.Chart.AppVersion`
- `.Values.<any-values-path>`
- `.Files.Get "<relative-path>"`

## Evaluation order vs schema validation

```
helm install
    │
    ▼
1. JSON Schema validates `values.yaml` (no template expansion)
    │
    ▼
2. Helm renders templates with .Values, .Release, .Chart
    │
    ▼
3. Output manifests applied to cluster
```

Schema validation runs **before** template expansion. Consequence: a
field typed `integer` cannot be supplied via `{{ .Values.replicas }}` —
schema sees a string. Use the typed value directly:

```yaml
deployments:
  api:
    replicas: 3   # not {{ .Values.replicas }}
```

## Pitfalls

- **Quote template expressions in YAML.** `imageTag: {{ .Chart.AppVersion }}`
  parses as a YAML mapping if `AppVersion` starts with a digit. Quote:
  `imageTag: "{{ .Chart.AppVersion }}"`.
- **Escape literal `{{` in strings.** Use `{{ "{{" }}` to emit two open
  braces verbatim.

## Reference

- [Helm built-in template values](https://helm.sh/docs/chart_template_guide/builtin_objects/)
- [`containers`](values.md#deploymentspec-containers)
