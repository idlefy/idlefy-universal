{{/* Helper for auto-creating PDB */}}
{{- define "idlefy-universal.autoPdb" -}}
{{- $deploymentName := .deploymentName }}
{{- $deploymentConfig := .deploymentConfig }}
{{- $root := .root }}

apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  {{- include "idlefy-universal.resourceMetadata" (dict "name" $deploymentName "root" $root "labels" $deploymentConfig.pdb.labels "annotations" $deploymentConfig.pdb.annotations) | nindent 2 }}
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
