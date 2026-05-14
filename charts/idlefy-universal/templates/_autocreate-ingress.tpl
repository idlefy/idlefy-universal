{{/* Helper for auto-creating ingress */}}
{{- define "idlefy-universal.autoIngress" -}}
{{- /* Prepare variables */ -}}
{{- $deploymentName := .deploymentName -}}
{{- $deploymentConfig := .deploymentConfig -}}
{{- $root := .root -}}
{{- $generic := $root.Values.generic | default dict -}}
{{- $ingressesGeneral := $generic.ingressesGeneral | default dict -}}
{{- $globalDomain := $ingressesGeneral.domain | default "" | trim -}}
{{- /* Apply ingress inheritance */ -}}
{{- $defaultedIngress := include "idlefy-universal.ingressDefaults" (dict "ingress" ($deploymentConfig.ingress | default dict) "general" $root.Values.generic.ingressesGeneral) | fromYaml -}}
{{- /* Collect ports from containers */ -}}
{{- $ports := list -}}
{{- range $containerName, $container := $deploymentConfig.containers -}}
  {{- range $portName, $port := $container.ports -}}
    {{- $ports = append $ports (dict "name" $portName "port" $port.containerPort) -}}
  {{- end -}}
{{- end -}}
{{- $firstPort := first $ports -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ $deploymentName }}
  labels:
{{ include "idlefy-universal.labels" (dict "Chart" $root.Chart "Release" $root.Release "name" $deploymentName) | nindent 4 | trimPrefix "\n"}}
    {{- $extraLabels := include "idlefy-universal.mergeLabels" (dict "root" $root "resourceLabels" $deploymentConfig.ingress.labels) }}
    {{- if $extraLabels }}
    {{- $extraLabels | nindent 4 }}
    {{- end }}
  {{- $mergedAnnotations := include "idlefy-universal.mergeAnnotations" (dict "root" $root "resourceAnnotations" $defaultedIngress.annotations) }}
  {{- if $mergedAnnotations }}
  annotations:
    {{- $mergedAnnotations | nindent 4 }}
  {{- end }}
spec:
{{- if $defaultedIngress.ingressClassName }}
  ingressClassName: {{ $defaultedIngress.ingressClassName }}
{{- end }}
{{- if or $defaultedIngress.tls $deploymentConfig.autoCreateCertificate }}
  tls:
{{- if $deploymentConfig.autoCreateCertificate }}
    - secretName: {{ printf "%s-tls" $deploymentName }}
      hosts:
{{- range $hostEntry := $defaultedIngress.hosts }}
        - {{ include "idlefy-universal.computedIngressHost" (dict "host" $hostEntry.host "subdomain" $hostEntry.subdomain "globalDomain" $globalDomain) | trim }}
{{- end }}
{{- else }}
{{ toYaml $defaultedIngress.tls | nindent 2 }}
{{- end }}
{{- end }}
  rules:
{{- range $hostEntry := $defaultedIngress.hosts }}
    - host: {{ include "idlefy-universal.computedIngressHost" (dict "host" $hostEntry.host "subdomain" $hostEntry.subdomain "globalDomain" $globalDomain) | trim }}
      http:
        paths:
{{- range $path := $hostEntry.paths }}
          - path: {{ $path.path }}
            pathType: {{ $path.pathType | default "Prefix" }}
            backend:
              service:
                name: {{ $deploymentName }}
                port:
{{- if $path.port }}
                  number: {{ $path.port }}
{{- else if $path.portName }}
                  name: {{ $path.portName }}
{{- else if $firstPort }}
{{- if $firstPort.name }}
                  name: {{ $firstPort.name }}
{{- else }}
                  number: {{ $firstPort.port }}
{{- end }}
{{- end }}
{{- end }}
{{- end }}
{{- end }}
