{{/* Helper for auto-creating PDB */}}
{{- define "idlefy-universal.autoPdb" -}}
{{- $deploymentName := .deploymentName }}
{{- $deploymentConfig := .deploymentConfig }}
{{- $root := .root }}

apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ $deploymentName }}
  labels:
    {{- include "idlefy-universal.labels" (dict "Chart" $root.Chart "Release" $root.Release "name" $deploymentName) | nindent 4 }}
    {{- $extraLabels := include "idlefy-universal.mergeLabels" (dict "root" $root "resourceLabels" $deploymentConfig.pdb.labels) }}
    {{- if $extraLabels }}
    {{- $extraLabels | nindent 4 }}
    {{- end }}
  {{- $mergedAnnotations := include "idlefy-universal.mergeAnnotations" (dict "root" $root "resourceAnnotations" $deploymentConfig.pdb.annotations) }}
  {{- if $mergedAnnotations }}
  annotations:
    {{- $mergedAnnotations | nindent 4 }}
  {{- end }}
spec:
  selector:
    matchLabels:
      {{- include "idlefy-universal.componentLabels" (dict "name" $deploymentName "root" $root) | nindent 6 }}
  {{- if $deploymentConfig.pdb }}
    {{- if $deploymentConfig.pdb.minAvailable }}
  minAvailable: {{ $deploymentConfig.pdb.minAvailable }}
    {{- end }}
    {{- if $deploymentConfig.pdb.maxUnavailable }}
  maxUnavailable: {{ $deploymentConfig.pdb.maxUnavailable }}
    {{- end }}
  {{- else }}
  maxUnavailable: 1
  {{- end }}
{{- end }}
