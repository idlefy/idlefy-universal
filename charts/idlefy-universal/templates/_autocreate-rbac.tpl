{{/* Helper for auto-creating a namespaced Role + RoleBinding from a workload's rbac block. */}}
{{- define "idlefy-universal.autoRbac" -}}
{{- $deploymentName := .deploymentName }}
{{- $deploymentConfig := .deploymentConfig }}
{{- $root := .root }}
{{- $saName := include "idlefy-universal.serviceAccountName" (dict "resourceName" $deploymentName "resourceConfig" $deploymentConfig "root" $root) }}

apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  {{- include "idlefy-universal.resourceMetadata" (dict "name" $deploymentName "root" $root "labels" $deploymentConfig.rbac.labels "annotations" $deploymentConfig.rbac.annotations) | nindent 2 }}
rules:
  {{- toYaml $deploymentConfig.rbac.rules | nindent 2 }}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  {{- include "idlefy-universal.resourceMetadata" (dict "name" $deploymentName "root" $root "labels" $deploymentConfig.rbac.labels "annotations" $deploymentConfig.rbac.annotations) | nindent 2 }}
subjects:
  - kind: ServiceAccount
    name: {{ $saName }}
    namespace: {{ $root.Release.Namespace }}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: {{ $deploymentName }}
{{- end -}}
