{{/* Helper for auto-creating HTTPRoute from deployment */}}
{{- define "idlefy-universal.autoHttpRoute" -}}
{{- $deploymentName := .deploymentName -}}
{{- $deploymentConfig := .deploymentConfig -}}
{{- $root := .root -}}
{{- $generic := $root.Values.generic | default dict -}}
{{- $httpRoutesGeneral := index $generic "httpRoutesGeneral" | default dict -}}
{{- $ingressesGeneral := $generic.ingressesGeneral | default dict -}}
{{- $globalDomain := $ingressesGeneral.domain | default "" | trim -}}
{{- $httpRouteConfig := $deploymentConfig.httpRoute | default dict -}}

{{- /* Apply defaults */ -}}
{{- $defaultedRoute := include "idlefy-universal.httpRouteDefaults" (dict "httpRoute" $httpRouteConfig "general" $httpRoutesGeneral) | fromYaml -}}

{{- /* Collect ports from containers (same logic as autoIngress) */ -}}
{{- $ports := list -}}
{{- range $containerName, $container := $deploymentConfig.containers -}}
  {{- range $portName, $port := $container.ports -}}
    {{- $ports = append $ports (dict "name" $portName "port" $port.containerPort) -}}
  {{- end -}}
{{- end -}}
{{- $firstPort := first $ports -}}
{{- $backendPort := 80 -}}
{{- if $firstPort -}}
  {{- $backendPort = $firstPort.port -}}
{{- end -}}

{{- /* Resolve hostnames: use provided or default to deploymentName as subdomain */ -}}
{{- $hostnames := list -}}
{{- if $defaultedRoute.hostnames -}}
  {{- range $defaultedRoute.hostnames -}}
    {{- $hostnames = append $hostnames (include "idlefy-universal.computedIngressHost" (dict "host" .host "subdomain" .subdomain "globalDomain" $globalDomain) | trim) -}}
  {{- end -}}
{{- else -}}
  {{- $hostnames = append $hostnames (include "idlefy-universal.computedIngressHost" (dict "subdomain" $deploymentName "globalDomain" $globalDomain) | trim) -}}
{{- end -}}

apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: {{ $deploymentName }}
  labels:
{{ include "idlefy-universal.labels" (dict "Chart" $root.Chart "Release" $root.Release "name" $deploymentName) | nindent 4 | trimPrefix "\n"}}
    {{- $extraLabels := include "idlefy-universal.mergeLabels" (dict "root" $root "resourceLabels" $httpRouteConfig.labels) }}
    {{- if $extraLabels }}
    {{- $extraLabels | nindent 4 }}
    {{- end }}
  {{- $mergedAnnotations := include "idlefy-universal.mergeAnnotations" (dict "root" $root "resourceAnnotations" $defaultedRoute.annotations) }}
  {{- if $mergedAnnotations }}
  annotations:
    {{- $mergedAnnotations | nindent 4 }}
  {{- end }}
spec:
  parentRefs:
    {{- toYaml $defaultedRoute.parentRefs | nindent 4 }}
  hostnames:
    {{- range $hostnames }}
    - {{ . | quote }}
    {{- end }}
  rules:
    {{- range $rule := $defaultedRoute.rules }}
    - matches:
        {{- range $match := $rule.matches }}
        - path:
            type: {{ $match.path.type | default "PathPrefix" }}
            value: {{ $match.path.value | default "/" }}
          {{- if $match.headers }}
          headers:
            {{- range $header := $match.headers }}
            - name: {{ $header.name }}
              value: {{ $header.value | quote }}
              {{- if $header.type }}
              type: {{ $header.type }}
              {{- end }}
            {{- end }}
          {{- end }}
          {{- if $match.queryParams }}
          queryParams:
            {{- range $qp := $match.queryParams }}
            - name: {{ $qp.name }}
              value: {{ $qp.value | quote }}
              {{- if $qp.type }}
              type: {{ $qp.type }}
              {{- end }}
            {{- end }}
          {{- end }}
        {{- end }}
      backendRefs:
        {{- if $rule.backendRefs }}
        {{- range $ref := $rule.backendRefs }}
        - name: {{ $ref.name | default $deploymentName }}
          port: {{ $ref.port | default $backendPort }}
          {{- if $ref.weight }}
          weight: {{ $ref.weight }}
          {{- end }}
        {{- end }}
        {{- else }}
        - name: {{ $deploymentName }}
          port: {{ $backendPort }}
        {{- end }}
    {{- end }}
{{- end }}
