{{/* Updated ServiceMonitor template with global settings */}}
{{- define "idlefy-universal.serviceMonitor" -}}
{{- $deploymentName := .deploymentName }}
{{- $deploymentConfig := .deploymentConfig }}
{{- $root := .root }}

{{/* Determine the port to monitor */}}
{{- $metricsPort := "" -}}
{{/* First try to find http-metrics port */}}
{{- range $containerName, $container := $deploymentConfig.containers -}}
  {{- range $portName, $port := $container.ports -}}
    {{- if eq $portName "http-metrics" -}}
      {{- $metricsPort = $portName -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{/* If http-metrics not found, use first available port */}}
{{- if not $metricsPort -}}
  {{- range $containerName, $container := $deploymentConfig.containers -}}
    {{- range $portName, $port := $container.ports -}}
      {{- if not $metricsPort -}}
        {{- $metricsPort = $portName -}}
      {{- end -}}
    {{- end -}}
  {{- end -}}
{{- end -}}

{{/* Get general settings */}}
{{- $generalSettings := dict }}
{{- if and $root.Values.generic $root.Values.generic.serviceMonitorGeneral }}
  {{- $generalSettings = $root.Values.generic.serviceMonitorGeneral }}
{{- end }}

{{/* Merge labels from global generic, serviceMonitorGeneral and local configs */}}
{{- $smLocalLabels := dict }}
{{/* First add serviceMonitorGeneral labels if they exist */}}
{{- if $generalSettings.labels }}
  {{- $smLocalLabels = merge $smLocalLabels $generalSettings.labels }}
{{- end }}
{{/* Then add local labels if they exist (they will override general ones) */}}
{{- if and $deploymentConfig.serviceMonitor $deploymentConfig.serviceMonitor.labels }}
  {{- $smLocalLabels = merge $smLocalLabels $deploymentConfig.serviceMonitor.labels }}
{{- end }}

apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ $deploymentName }}
  labels:
    {{- include "idlefy-universal.labels" (dict "Chart" $root.Chart "Release" $root.Release "name" $deploymentName) | nindent 4 }}
    {{- $extraLabels := include "idlefy-universal.mergeLabels" (dict "root" $root "resourceLabels" $smLocalLabels) }}
    {{- if $extraLabels }}
    {{- $extraLabels | nindent 4 }}
    {{- end }}
spec:
  selector:
    matchLabels:
      {{- include "idlefy-universal.componentLabels" (dict "name" $deploymentName "root" $root) | nindent 6 }}
  endpoints:
  {{- if and $deploymentConfig.serviceMonitor $deploymentConfig.serviceMonitor.endpoints }}
  {{- range $deploymentConfig.serviceMonitor.endpoints }}
  - port: {{ .port | default $metricsPort }}
    {{- if .path }}
    path: {{ .path }}
    {{- end }}
    {{- /* Use local interval if set, otherwise use general interval if available */}}
    {{- if .interval }}
    interval: {{ .interval }}
    {{- else if $generalSettings.interval }}
    interval: {{ $generalSettings.interval }}
    {{- end }}
    {{- /* Use local scrapeTimeout if set, otherwise use general scrapeTimeout if available */}}
    {{- if .scrapeTimeout }}
    scrapeTimeout: {{ .scrapeTimeout }}
    {{- else if $generalSettings.scrapeTimeout }}
    scrapeTimeout: {{ $generalSettings.scrapeTimeout }}
    {{- end }}
    {{- if .relabelings }}
    relabelings:
      {{- toYaml .relabelings | nindent 6 }}
    {{- end }}
    {{- if .metricRelabelings }}
    metricRelabelings:
      {{- toYaml .metricRelabelings | nindent 6 }}
    {{- end }}
    {{- if .honorLabels }}
    honorLabels: {{ .honorLabels }}
    {{- end }}
    {{- if .honorTimestamps }}
    honorTimestamps: {{ .honorTimestamps }}
    {{- end }}
    {{- if .scheme }}
    scheme: {{ .scheme }}
    {{- end }}
    {{- if .tlsConfig }}
    tlsConfig:
      {{- toYaml .tlsConfig | nindent 6 }}
    {{- end }}
  {{- end }}
  {{- else }}
  - port: {{ $metricsPort }}
    {{- if $deploymentConfig.serviceMonitor }}
    {{- with $deploymentConfig.serviceMonitor.path }}
    path: {{ . }}
    {{- end }}
    {{- /* For simple configuration, use local interval if set, otherwise use general interval */}}
    {{- if and $deploymentConfig.serviceMonitor $deploymentConfig.serviceMonitor.interval }}
    interval: {{ $deploymentConfig.serviceMonitor.interval }}
    {{- else if $generalSettings.interval }}
    interval: {{ $generalSettings.interval }}
    {{- end }}
    {{- /* For simple configuration, use local scrapeTimeout if set, otherwise use general scrapeTimeout */}}
    {{- if and $deploymentConfig.serviceMonitor $deploymentConfig.serviceMonitor.scrapeTimeout }}
    scrapeTimeout: {{ $deploymentConfig.serviceMonitor.scrapeTimeout }}
    {{- else if $generalSettings.scrapeTimeout }}
    scrapeTimeout: {{ $generalSettings.scrapeTimeout }}
    {{- end }}
    {{- with $deploymentConfig.serviceMonitor.relabelings }}
    relabelings:
      {{- toYaml . | nindent 6 }}
    {{- end }}
    {{- with $deploymentConfig.serviceMonitor.metricRelabelings }}
    metricRelabelings:
      {{- toYaml . | nindent 6 }}
    {{- end }}
    {{- end }}
  {{- end }}
  {{- if and $deploymentConfig.serviceMonitor $deploymentConfig.serviceMonitor.namespaceSelector }}
  namespaceSelector:
    {{- toYaml $deploymentConfig.serviceMonitor.namespaceSelector | nindent 4 }}
  {{- end }}
{{- end }}

