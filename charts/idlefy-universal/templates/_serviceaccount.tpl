{{/*
Helper to resolve serviceAccountName with priority:
1. Per-resource serviceAccountName (if set)
2. Global generic.serviceAccountName (if set)
3. Resource name (default, only if serviceAccount or autoCreateServiceAccount is enabled)
*/}}
{{- define "idlefy-universal.serviceAccountName" -}}
{{- $resourceName := .resourceName -}}
{{- $resourceConfig := .resourceConfig -}}
{{- $root := .root -}}
{{- $result := "" -}}

{{/* Check per-resource serviceAccountName first */}}
{{- if $resourceConfig.serviceAccountName -}}
  {{- $result = $resourceConfig.serviceAccountName -}}
{{/* Then check global serviceAccountName */}}
{{- else if and $root.Values.generic $root.Values.generic.serviceAccountName -}}
  {{- $result = $root.Values.generic.serviceAccountName -}}
{{/* Default to resource name */}}
{{- else -}}
  {{- $result = $resourceName -}}
{{- end -}}

{{- $result -}}
{{- end -}}

{{/*
Helper to check if serviceAccountName should be set in pod spec.
Returns true if:
1. serviceAccountName is explicitly set (per-resource or global)
2. serviceAccount config exists (for manual SA creation)
3. autoCreateServiceAccount is enabled
*/}}
{{- define "idlefy-universal.shouldSetServiceAccountName" -}}
{{- $resourceConfig := .resourceConfig -}}
{{- $root := .root -}}
{{- $result := false -}}

{{- if $resourceConfig.serviceAccountName -}}
  {{- $result = true -}}
{{- else if and $root.Values.generic $root.Values.generic.serviceAccountName -}}
  {{- $result = true -}}
{{- else if $resourceConfig.serviceAccount -}}
  {{- $result = true -}}
{{- else if $resourceConfig.autoCreateServiceAccount -}}
  {{- $result = true -}}
{{- end -}}

{{- $result -}}
{{- end -}}
