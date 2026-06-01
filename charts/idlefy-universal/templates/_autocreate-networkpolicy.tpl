{{/* Helper for auto-creating a NetworkPolicy from a workload's networkPolicy block. */}}
{{- define "idlefy-universal.autoNetworkPolicy" -}}
{{- $deploymentName := .deploymentName }}
{{- $deploymentConfig := .deploymentConfig }}
{{- $root := .root }}

apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  {{- include "idlefy-universal.resourceMetadata" (dict "name" $deploymentName "root" $root "labels" $deploymentConfig.networkPolicy.labels "annotations" $deploymentConfig.networkPolicy.annotations) | nindent 2 }}
spec:
  podSelector:
    matchLabels:
      {{- include "idlefy-universal.componentLabels" (dict "name" $deploymentName "root" $root) | nindent 6 }}
  policyTypes:
    {{- toYaml $deploymentConfig.networkPolicy.policyTypes | nindent 4 }}
  {{- if and (hasKey $deploymentConfig.networkPolicy "ingress") (ne (index $deploymentConfig.networkPolicy "ingress") nil) }}
  ingress:
    {{- toYaml $deploymentConfig.networkPolicy.ingress | nindent 4 }}
  {{- end }}
  {{- if and (hasKey $deploymentConfig.networkPolicy "egress") (ne (index $deploymentConfig.networkPolicy "egress") nil) }}
  egress:
    {{- toYaml $deploymentConfig.networkPolicy.egress | nindent 4 }}
  {{- end }}
{{- end -}}
