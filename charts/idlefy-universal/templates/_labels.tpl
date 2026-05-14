{{/*
Common labels — included in metadata.labels of every resource.
*/}}
{{- define "idlefy-universal.labels" -}}
helm.sh/chart: {{ include "idlefy-universal.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- if .name }}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: {{ .name }}
{{- end }}
{{- end }}

{{/*
Per-component selector labels (app.kubernetes.io/name, instance, component).
Used in spec.selector.matchLabels and spec.template.metadata.labels.
Pass dict with "name" and "root" (root context for Release.Name).
*/}}
{{- define "idlefy-universal.componentLabels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .name }}
{{- end }}

{{/*
Merge global labels (generic.labels) with resource-specific labels.
Resource labels win over global on key conflict.
*/}}
{{- define "idlefy-universal.mergeLabels" -}}
{{- $root := .root -}}
{{- $resourceLabels := .resourceLabels | default dict -}}
{{- $globalLabels := dict -}}
{{- if and $root.Values.generic $root.Values.generic.labels -}}
  {{- $globalLabels = $root.Values.generic.labels -}}
{{- end -}}
{{- $merged := merge $resourceLabels $globalLabels -}}
{{- if $merged }}
{{- toYaml $merged }}
{{- end -}}
{{- end -}}

{{/*
Merge global annotations (generic.annotations) with resource-specific annotations.
Resource annotations win over global on key conflict.
*/}}
{{- define "idlefy-universal.mergeAnnotations" -}}
{{- $root := .root -}}
{{- $resourceAnnotations := .resourceAnnotations | default dict -}}
{{- $globalAnnotations := dict -}}
{{- if and $root.Values.generic $root.Values.generic.annotations -}}
  {{- $globalAnnotations = $root.Values.generic.annotations -}}
{{- end -}}
{{- $merged := merge $resourceAnnotations $globalAnnotations -}}
{{- if $merged }}
{{- toYaml $merged }}
{{- end -}}
{{- end -}}
