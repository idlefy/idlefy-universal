{{/* Helper for auto-creating PDB */}}
{{- define "idlefy-universal.autoPdb" -}}
{{- $deploymentName := .deploymentName }}
{{- $deploymentConfig := .deploymentConfig }}
{{- $root := .root }}
{{- /* autoCreatePdb without a pdb block is legal (the spec branch below defaults maxUnavailable);
       `.pdb.labels` on a nil block is a template error, so default it once here. */}}
{{- $pdbConfig := $deploymentConfig.pdb | default dict }}

apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  {{- include "idlefy-universal.resourceMetadata" (dict "name" $deploymentName "root" $root "labels" $pdbConfig.labels "annotations" $pdbConfig.annotations) | nindent 2 }}
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
