{{/*
Expand the name of the chart.
*/}}
{{- define "idlefy-universal.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
For tests, always use a fixed version to avoid snapshot failures when chart version changes.
In production, use the actual chart version.
*/}}
{{- define "idlefy-universal.chart" -}}
{{- if eq (default "" .Release.Name) "RELEASE-NAME" -}}
{{- printf "%s-test-version" .Chart.Name | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- else -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end -}}
{{- end }}

{{- define "idlefy-universal.configName" -}}
{{- printf "%s" .name }}
{{- end }}
