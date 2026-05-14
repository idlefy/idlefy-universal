{{/* Helper for auto-creating a namespaced Role + RoleBinding from a workload's rbac block. */}}
{{- define "idlefy-universal.autoRbac" -}}
{{- $deploymentName := .deploymentName }}
{{- $deploymentConfig := .deploymentConfig }}
{{- $root := .root }}
{{- $saName := include "idlefy-universal.serviceAccountName" (dict "resourceName" $deploymentName "resourceConfig" $deploymentConfig "root" $root) }}

apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: {{ $deploymentName }}
  labels:
    {{- include "idlefy-universal.labels" (dict "Chart" $root.Chart "Release" $root.Release "name" $deploymentName) | nindent 4 }}
    {{- $extraLabels := include "idlefy-universal.mergeLabels" (dict "root" $root "resourceLabels" $deploymentConfig.rbac.labels) }}
    {{- if $extraLabels }}
    {{- $extraLabels | nindent 4 }}
    {{- end }}
  {{- $mergedAnnotations := include "idlefy-universal.mergeAnnotations" (dict "root" $root "resourceAnnotations" $deploymentConfig.rbac.annotations) }}
  {{- if $mergedAnnotations }}
  annotations:
    {{- $mergedAnnotations | nindent 4 }}
  {{- end }}
rules:
  {{- toYaml $deploymentConfig.rbac.rules | nindent 2 }}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: {{ $deploymentName }}
  labels:
    {{- include "idlefy-universal.labels" (dict "Chart" $root.Chart "Release" $root.Release "name" $deploymentName) | nindent 4 }}
    {{- $extraLabels := include "idlefy-universal.mergeLabels" (dict "root" $root "resourceLabels" $deploymentConfig.rbac.labels) }}
    {{- if $extraLabels }}
    {{- $extraLabels | nindent 4 }}
    {{- end }}
  {{- $mergedAnnotations := include "idlefy-universal.mergeAnnotations" (dict "root" $root "resourceAnnotations" $deploymentConfig.rbac.annotations) }}
  {{- if $mergedAnnotations }}
  annotations:
    {{- $mergedAnnotations | nindent 4 }}
  {{- end }}
subjects:
  - kind: ServiceAccount
    name: {{ $saName }}
    namespace: {{ $root.Release.Namespace }}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: {{ $deploymentName }}
{{- end -}}
