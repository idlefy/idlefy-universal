{{/*
Compute affinity for pod spec — merges affinity, nodeSelector (converted to
nodeAffinity), and optional softAntiAffinity.
Parameters:
  config         — defaulted resource config (must have .affinity, .nodeSelector,
                   and optionally .autoCreateSoftAntiAffinity)
  deploymentName — used as the labelSelector value for podAntiAffinity term
  general        — deploymentsGeneral block (read for inherited nodeSelector and
                   autoCreateSoftAntiAffinity)
  kind           — workload kind: "Deployment" | "StatefulSet" | "Job" | "CronJob" | "MigrationJob".
                   softAntiAffinity is emitted for Deployment and StatefulSet —
                   pod anti-affinity is semantically wrong for batch workloads.
*/}}
{{- define "idlefy-universal.processAffinity" -}}
{{- $config := .config }}
{{- $deploymentName := .deploymentName }}
{{- $general := .general | default dict }}
{{- $kind := .kind | default "Deployment" }}
{{- $result := dict }}

{{- $createSoftAntiAffinity := false }}
{{- if or (eq $kind "Deployment") (eq $kind "StatefulSet") }}
  {{- if hasKey $config "autoCreateSoftAntiAffinity" }}
    {{- $createSoftAntiAffinity = $config.autoCreateSoftAntiAffinity }}
  {{- else if hasKey $general "autoCreateSoftAntiAffinity" }}
    {{- $createSoftAntiAffinity = $general.autoCreateSoftAntiAffinity }}
  {{- end }}
{{- end }}

{{- $nodeSelectors := list }}

{{- if $config.affinity }}
    {{- $result = deepCopy $config.affinity }}
{{- end }}

{{- if $config.nodeSelector }}
    {{- range $key, $value := $config.nodeSelector }}
        {{- $nodeSelectors = append $nodeSelectors (dict "key" $key "operator" "In" "values" (list $value)) }}
    {{- end }}
{{- end }}

{{- if and $general.nodeSelector (not $config.nodeSelector) }}
    {{- range $key, $value := $general.nodeSelector }}
        {{- $nodeSelectors = append $nodeSelectors (dict "key" $key "operator" "In" "values" (list $value)) }}
    {{- end }}
{{- end }}

{{- if $nodeSelectors }}
    {{- if hasKey $result "nodeAffinity" }}
        {{- if hasKey $result.nodeAffinity "requiredDuringSchedulingIgnoredDuringExecution" }}
            {{- $nodeSelectorTerms := $result.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms }}
            {{- $newTerm := dict "matchExpressions" $nodeSelectors }}
            {{- $nodeSelectorTerms = append $nodeSelectorTerms $newTerm }}
            {{- $_ := set $result.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution "nodeSelectorTerms" $nodeSelectorTerms }}
        {{- else }}
            {{- $_ := set $result.nodeAffinity "requiredDuringSchedulingIgnoredDuringExecution" (dict "nodeSelectorTerms" (list (dict "matchExpressions" $nodeSelectors))) }}
        {{- end }}
    {{- else }}
        {{- $nodeAffinity := dict "requiredDuringSchedulingIgnoredDuringExecution" (dict "nodeSelectorTerms" (list (dict "matchExpressions" $nodeSelectors))) }}
        {{- $_ := set $result "nodeAffinity" $nodeAffinity }}
    {{- end }}
{{- end }}

{{- if and $createSoftAntiAffinity (not (hasKey $result "podAntiAffinity")) }}
    {{- $antiAffinity := dict "preferredDuringSchedulingIgnoredDuringExecution" (list (dict "weight" 100 "podAffinityTerm" (dict "labelSelector" (dict "matchLabels" (dict "app.kubernetes.io/component" $deploymentName)) "topologyKey" "kubernetes.io/hostname"))) }}
    {{- $_ := set $result "podAntiAffinity" $antiAffinity }}
{{- end }}

{{- toYaml $result }}
{{- end }}

{{/*
Unified pod spec — renders the content of spec.template.spec for any workload kind.
The output is unindented; the caller controls indent via nindent.

Parameters:
  config         — defaulted resource config (output of deploymentDefaults)
  resourceConfig — original (non-defaulted) resource config, used for SA lookup
                   so that explicit serviceAccountName at config level overrides
                   inherited general one. Defaults to config when omitted.
  kind           — "Deployment" | "StatefulSet" | "DaemonSet" | "Job" | "CronJob" | "MigrationJob"
  Root           — root chart context (.) — used for Release, Values, Chart
  name           — workload name; used for SA name default and anti-affinity selector
  general        — caller-supplied general block (e.g. deploymentsGeneral). Must be
                   passed explicitly; defaults to empty dict, which suppresses
                   inherited nodeSelector / softAntiAffinity / podSecurityContext.
  migrationArgs  — only for kind=MigrationJob; replaces every container's args

Behavior:
  - restartPolicy emitted only for Job, CronJob, and MigrationJob kinds
    (k8s rejects it on Deployment/StatefulSet/DaemonSet pods).
  - serviceAccountName via existing helpers when applicable.
  - imagePullSecrets from generic.extraImagePullSecrets.
  - securityContext / priorityClassName / tolerations / volumes — passthrough.
  - affinity is always processed via processAffinity:
      * nodeSelector is converted into nodeAffinity (consistent across kinds).
      * softAntiAffinity is only emitted for Deployment and StatefulSet.
  - containers go through the existing container helper. For MigrationJob,
    each container's args is overwritten with migrationArgs.
*/}}
{{- define "idlefy-universal.podSpec" -}}
{{- $config := .config -}}
{{- $resourceConfig := .resourceConfig | default $config -}}
{{- $kind := .kind -}}
{{- $root := .Root -}}
{{- $name := .name -}}
{{- $general := .general | default dict -}}
{{- $migrationArgs := .migrationArgs -}}
{{- $shouldSetSA := include "idlefy-universal.shouldSetServiceAccountName" (dict "resourceConfig" $resourceConfig "root" $root) -}}
{{- $affinity := include "idlefy-universal.processAffinity" (dict "config" $config "deploymentName" $name "general" $general "kind" $kind) | fromYaml -}}
{{- if has $kind (list "Job" "CronJob" "MigrationJob") -}}
restartPolicy: {{ $config.restartPolicy | default "Never" }}
{{ end -}}
{{- if eq $shouldSetSA "true" -}}
serviceAccountName: {{ include "idlefy-universal.serviceAccountName" (dict "resourceName" $name "resourceConfig" $resourceConfig "root" $root) }}
{{ end -}}
{{- if and $root.Values.generic (hasKey $root.Values.generic "extraImagePullSecrets") -}}
imagePullSecrets:
  {{- toYaml $root.Values.generic.extraImagePullSecrets | nindent 2 }}
{{ end -}}
{{- if $config.securityContext -}}
securityContext:
  {{- toYaml $config.securityContext | nindent 2 }}
{{ end -}}
{{- if eq $kind "DaemonSet" -}}
{{- if $config.hostNetwork -}}
hostNetwork: {{ $config.hostNetwork }}
{{ end -}}
{{- if $config.hostPID -}}
hostPID: {{ $config.hostPID }}
{{ end -}}
{{- if $config.hostIPC -}}
hostIPC: {{ $config.hostIPC }}
{{ end -}}
{{- end -}}
{{- if $config.priorityClassName -}}
priorityClassName: {{ $config.priorityClassName }}
{{ end -}}
{{- if $affinity -}}
affinity:
  {{- toYaml $affinity | nindent 2 }}
{{ end -}}
{{- if $config.tolerations -}}
tolerations:
  {{- toYaml $config.tolerations | nindent 2 }}
{{ end -}}
{{- if $config.topologySpreadConstraints -}}
topologySpreadConstraints:
  {{- toYaml $config.topologySpreadConstraints | nindent 2 }}
{{ end -}}
{{- if $config.hostAliases -}}
hostAliases:
  {{- toYaml $config.hostAliases | nindent 2 }}
{{ end -}}
{{- if $config.dnsConfig -}}
dnsConfig:
  {{- toYaml $config.dnsConfig | nindent 2 }}
{{ end -}}
{{- if hasKey $config "terminationGracePeriodSeconds" -}}
terminationGracePeriodSeconds: {{ $config.terminationGracePeriodSeconds }}
{{ end -}}
{{- if $config.initContainers -}}
initContainers:
{{ include "idlefy-universal.containers" (dict "root" $root "containers" $config.initContainers) | trim }}
{{ end -}}
{{- $containers := $config.containers -}}
{{- if and (eq $kind "MigrationJob") $migrationArgs -}}
  {{- $containers = dict -}}
  {{- range $cName, $cConfig := $config.containers -}}
    {{- $_ := set $containers $cName (mustMergeOverwrite (deepCopy $cConfig) (dict "args" $migrationArgs)) -}}
  {{- end -}}
{{- end -}}
containers:
{{ include "idlefy-universal.containers" (dict "root" $root "containers" $containers) | trim }}
{{- if $config.volumes }}
volumes:
  {{- toYaml $config.volumes | nindent 2 }}
{{- end }}
{{- end }}

{{/* Helper for processing dynamic values */}}
{{- define "idlefy-universal.tplValue" -}}
    {{- if typeIs "string" .value }}
        {{- tpl .value .context }}
    {{- else }}
        {{- tpl (.value | toYaml) .context }}
    {{- end }}
{{- end }}

{{/* Helper for generating containers */}}
{{- define "idlefy-universal.containers" -}}
{{- $root := .root -}}
{{- $containers := .containers -}}
{{- range $containerName, $container := $containers }}
- {{ include "idlefy-universal.container" (dict "containerName" $containerName "container" $container "root" $root) | nindent 2 | trim }}
{{- end }}
{{- end }}

{{/* Helper for generating container */}}
{{- define "idlefy-universal.container" -}}
{{- $containerName := .containerName -}}
{{- $container := .container -}}
{{- $root := .root -}}
name: {{ $containerName }}
image: {{ include "idlefy-universal.tplValue" (dict "value" $container.image "context" $root) }}:{{ include "idlefy-universal.tplValue" (dict "value" $container.imageTag "context" $root) }}
{{- if $container.args }}
args:
  {{- toYaml $container.args | nindent 2 }}
{{- end }}
{{- if $container.command }}
command:
  {{- toYaml $container.command | nindent 2 }}
{{- end }}
{{- if $container.ports }}
ports:
  {{- range $portName, $port := $container.ports }}
  - name: {{ $portName }}
    containerPort: {{ $port.containerPort }}
    protocol: {{ $port.protocol | default "TCP" }}
  {{- end }}
{{- end }}
{{- if $container.volumeMounts }}
volumeMounts:
  {{- range $container.volumeMounts }}
  - name: {{ .name }}
    mountPath: {{ .mountPath }}
    {{- if .subPath }}
    subPath: {{ .subPath }}
    {{- end }}
    {{- if .readOnly }}
    readOnly: {{ .readOnly }}
    {{- end }}
  {{- end }}
{{- end -}}
{{/* Process environment variables */}}
{{- $envVars := list -}}
{{/* Add regular env vars if they exist */}}
{{- if $container.env -}}
  {{- range $container.env -}}
    {{- $envVars = append $envVars . -}}
  {{- end -}}
{{- end -}}
{{/* Process secretRefs if they exist */}}
{{- if and $container.secretRefs $root.Values.secretRefs -}}
  {{- range $refName := $container.secretRefs -}}
    {{- if hasKey $root.Values.secretRefs $refName -}}
      {{- range $env := index $root.Values.secretRefs $refName -}}
        {{- $envVars = append $envVars $env -}}
      {{- end -}}
    {{- end -}}
  {{- end -}}
{{- end -}}

{{/* Output all environment variables */}}
{{- if $envVars }}
env:
  {{- range $envVars }}
  - name: {{ .name }}
    {{- if .value }}
    value: {{ include "idlefy-universal.tplValue" (dict "value" .value "context" $root) | quote }}
    {{- else if .valueFrom }}
    valueFrom:
      {{- toYaml .valueFrom | nindent 6 }}
    {{- else if .secretKeyRef }}
    valueFrom:
      secretKeyRef:
        name: {{ .secretKeyRef.name }}
        key: {{ .secretKeyRef.key }}
    {{- end }}
  {{- end }}
{{- end }}

{{- if $container.envFrom }}
envFrom:
  {{- range $container.envFrom }}
  - {{ .type }}Ref:
      name: {{ include "idlefy-universal.configName" (dict "root" $root "name" .configName) }}
  {{- end }}
{{- end }}
{{- with $container.resources }}
resources:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- if $container.securityContext }}
securityContext:
  {{- toYaml $container.securityContext | nindent 2 }}
{{- end }}
{{- if $container.probes }}
{{- if $container.probes.livenessProbe }}
livenessProbe:
  {{- toYaml $container.probes.livenessProbe | nindent 2 }}
{{- end }}
{{- if $container.probes.readinessProbe }}
readinessProbe:
  {{- toYaml $container.probes.readinessProbe | nindent 2 }}
{{- end }}
{{- if $container.probes.startupProbe }}
startupProbe:
  {{- toYaml $container.probes.startupProbe | nindent 2 }}
{{- end }}
{{- end }}
{{- with $container.lifecycle }}
lifecycle:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}
