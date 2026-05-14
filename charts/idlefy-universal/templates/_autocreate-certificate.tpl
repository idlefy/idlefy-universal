{{/* Build a cert-manager Certificate resource from a config block. */}}
{{- define "idlefy-universal.certificate" -}}
{{- $certificateName := .certificateName }}
{{- $certificateConfig := .certificateConfig }}
{{- $root := .root }}
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: {{ $certificateName }}
  labels:
    {{- include "idlefy-universal.labels" (dict "Chart" $root.Chart "Release" $root.Release "name" $certificateName) | nindent 4 }}
    {{- $extraLabels := include "idlefy-universal.mergeLabels" (dict "root" $root "resourceLabels" $certificateConfig.labels) }}
    {{- if $extraLabels }}
    {{- $extraLabels | nindent 4 }}
    {{- end }}
  {{- $mergedAnnotations := include "idlefy-universal.mergeAnnotations" (dict "root" $root "resourceAnnotations" $certificateConfig.annotations) }}
  {{- if $mergedAnnotations }}
  annotations:
    {{- $mergedAnnotations | nindent 4 }}
  {{- end }}
spec:
  secretName: {{ printf "%s-tls" $certificateName }}
  issuerRef:
    {{- if $certificateConfig.clusterIssuer }}
    kind: ClusterIssuer
    name: {{ $certificateConfig.clusterIssuer }}
    {{- else if $certificateConfig.issuer }}
    kind: Issuer
    name: {{ $certificateConfig.issuer }}
    {{- else }}
    kind: ClusterIssuer
    name: letsencrypt
    {{- end }}
  dnsNames:
  {{- range $certificateConfig.domains }}
    - {{ . }}
  {{- end }}
{{- end }}

{{/* Build a Certificate for a deployment with autoCreateCertificate enabled. */}}
{{- define "idlefy-universal.autoCertificate" -}}
{{- $deploymentName := .deploymentName -}}
{{- $deploymentConfig := .deploymentConfig -}}
{{- $root := .root -}}
{{- $generic := $root.Values.generic | default dict -}}
{{- $ingressesGeneral := $generic.ingressesGeneral | default dict -}}
{{- $globalDomain := $ingressesGeneral.domain | default "" | trim -}}
{{- $defaultedIngress := include "idlefy-universal.ingressDefaults" (dict "ingress" ($deploymentConfig.ingress | default dict) "general" $root.Values.generic.ingressesGeneral) | fromYaml -}}
{{- $domains := list -}}
{{- range $hostEntry := $defaultedIngress.hosts -}}
  {{- $computed := include "idlefy-universal.computedIngressHost" (dict "host" $hostEntry.host "subdomain" $hostEntry.subdomain "globalDomain" $globalDomain) | trim -}}
  {{- $domains = append $domains $computed -}}
{{- end -}}
{{- $certificateConfig := dict -}}
{{- if $deploymentConfig.certificate -}}
  {{- $certificateConfig = $deploymentConfig.certificate -}}
{{- end -}}
{{- $_ := set $certificateConfig "domains" $domains -}}
{{ include "idlefy-universal.certificate" (dict "certificateName" $deploymentName "certificateConfig" $certificateConfig "root" $root) -}}
{{- end }}
