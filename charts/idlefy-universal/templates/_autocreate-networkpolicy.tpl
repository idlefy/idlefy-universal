{{/* Helper for auto-creating a NetworkPolicy from a workload's networkPolicy block. */}}
{{- define "idlefy-universal.autoNetworkPolicy" -}}
{{- $deploymentName := .deploymentName }}
{{- $deploymentConfig := .deploymentConfig }}
{{- $root := .root }}

apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ $deploymentName }}
  labels:
    {{- include "idlefy-universal.labels" (dict "Chart" $root.Chart "Release" $root.Release "name" $deploymentName) | nindent 4 }}
    {{- $extraLabels := include "idlefy-universal.mergeLabels" (dict "root" $root "resourceLabels" $deploymentConfig.networkPolicy.labels) }}
    {{- if $extraLabels }}
    {{- $extraLabels | nindent 4 }}
    {{- end }}
  {{- $mergedAnnotations := include "idlefy-universal.mergeAnnotations" (dict "root" $root "resourceAnnotations" $deploymentConfig.networkPolicy.annotations) }}
  {{- if $mergedAnnotations }}
  annotations:
    {{- $mergedAnnotations | nindent 4 }}
  {{- end }}
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
