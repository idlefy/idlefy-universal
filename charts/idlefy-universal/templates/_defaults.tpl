{{/* Helper for deployment defaults */}}
{{- define "idlefy-universal.deploymentDefaults" -}}
{{- $deployment := .deployment }}
{{- $general := .general }}
{{- $result := deepCopy $deployment }}
{{- if $general }}
  {{- if $general.securityContext }}
    {{- $result = merge $result (dict "securityContext" $general.securityContext) }}
  {{- end }}
  {{- if $general.networkPolicy }}
    {{- $mergedNP := deepCopy $general.networkPolicy }}
    {{- $instanceNP := default dict $result.networkPolicy }}
    {{- range $k, $v := $instanceNP }}
      {{- $_ := set $mergedNP $k $v }}
    {{- end }}
    {{- $_ := set $result "networkPolicy" $mergedNP }}
  {{- end }}
  {{- if $general.priorityClassName }}
    {{- if not $result.priorityClassName }}
      {{- $result = merge $result (dict "priorityClassName" $general.priorityClassName) }}
    {{- end }}
  {{- end }}
  {{- if $general.nodeSelector }}
    {{- $result = merge $result (dict "nodeSelector" $general.nodeSelector) }}
  {{- end }}
  {{- if $general.tolerations }}
    {{- $result = merge $result (dict "tolerations" $general.tolerations) }}
  {{- end }}
  {{- if $general.affinity }}
    {{- $result = merge $result (dict "affinity" $general.affinity) }}
  {{- end }}
  {{- if $general.probes }}
    {{- range $containerName, $container := $result.containers }}
      {{- if not $container.probes }}
        {{- $_ := set $container "probes" $general.probes }}
      {{- end }}
    {{- end }}
  {{- end }}
  {{- if $general.strategy }}
    {{- if not $result.strategy }}
      {{- $result = merge $result (dict "strategy" $general.strategy) }}
    {{- end }}
  {{- end }}
  {{- if $general.parallelism }}
    {{- if not $result.parallelism }}
      {{- $result = merge $result (dict "parallelism" (int $general.parallelism)) }}
    {{- end }}
  {{- end }}
  {{- if $general.completions }}
    {{- if not $result.completions }}
      {{- $result = merge $result (dict "completions" (int $general.completions)) }}
    {{- end }}
  {{- end }}
  {{- if $general.labels }}
    {{- $result = merge $result (dict "labels" (merge (default dict $deployment.labels) $general.labels)) }}
  {{- end }}
  {{- if $general.annotations }}
    {{- $result = merge $result (dict "annotations" (merge (default dict $deployment.annotations) $general.annotations)) }}
  {{- end }}
  {{- if $general.initContainers }}
    {{- if not $deployment.initContainers }}
      {{- $result = merge $result (dict "initContainers" $general.initContainers) }}
    {{- end }}
  {{- end }}
  {{- if $general.hostAliases }}
    {{- if not $deployment.hostAliases }}
      {{- $result = merge $result (dict "hostAliases" $general.hostAliases) }}
    {{- end }}
  {{- end }}
  {{- if $general.dnsConfig }}
    {{- if not $deployment.dnsConfig }}
      {{- $result = merge $result (dict "dnsConfig" $general.dnsConfig) }}
    {{- end }}
  {{- end }}
  {{- if hasKey $general "terminationGracePeriodSeconds" }}
    {{- if not (hasKey $deployment "terminationGracePeriodSeconds") }}
      {{- $result = merge $result (dict "terminationGracePeriodSeconds" (int $general.terminationGracePeriodSeconds)) }}
    {{- end }}
  {{- end }}
  {{- if $general.topologySpreadConstraints }}
    {{- if not $deployment.topologySpreadConstraints }}
      {{- $result = merge $result (dict "topologySpreadConstraints" $general.topologySpreadConstraints) }}
    {{- end }}
  {{- end }}
{{- end }}
{{- toYaml $result }}
{{- end }}

{{/*
Compute defaulted config for a statefulSets.* entry. Mirrors
deploymentDefaults, plus:
  - serviceHeadless defaults to true when autoCreateService=true and
    serviceHeadless is not explicitly set on the per-instance config.
*/}}
{{- define "idlefy-universal.statefulSetDefaults" -}}
{{- $sts := .statefulSet }}
{{- $general := .general }}
{{- $result := deepCopy $sts }}
{{- if $general }}
  {{- if $general.securityContext }}
    {{- $result = merge $result (dict "securityContext" $general.securityContext) }}
  {{- end }}
  {{- if $general.networkPolicy }}
    {{- $mergedNP := deepCopy $general.networkPolicy }}
    {{- $instanceNP := default dict $result.networkPolicy }}
    {{- range $k, $v := $instanceNP }}
      {{- $_ := set $mergedNP $k $v }}
    {{- end }}
    {{- $_ := set $result "networkPolicy" $mergedNP }}
  {{- end }}
  {{- if $general.priorityClassName }}
    {{- if not $result.priorityClassName }}
      {{- $result = merge $result (dict "priorityClassName" $general.priorityClassName) }}
    {{- end }}
  {{- end }}
  {{- if $general.nodeSelector }}
    {{- $result = merge $result (dict "nodeSelector" $general.nodeSelector) }}
  {{- end }}
  {{- if $general.tolerations }}
    {{- $result = merge $result (dict "tolerations" $general.tolerations) }}
  {{- end }}
  {{- if $general.affinity }}
    {{- $result = merge $result (dict "affinity" $general.affinity) }}
  {{- end }}
  {{- if $general.probes }}
    {{- range $containerName, $container := $result.containers }}
      {{- if not $container.probes }}
        {{- $_ := set $container "probes" $general.probes }}
      {{- end }}
    {{- end }}
  {{- end }}
  {{- if $general.labels }}
    {{- $result = merge $result (dict "labels" (merge (default dict $sts.labels) $general.labels)) }}
  {{- end }}
  {{- if $general.annotations }}
    {{- $result = merge $result (dict "annotations" (merge (default dict $sts.annotations) $general.annotations)) }}
  {{- end }}
  {{- if $general.initContainers }}
    {{- if not $sts.initContainers }}
      {{- $result = merge $result (dict "initContainers" $general.initContainers) }}
    {{- end }}
  {{- end }}
  {{- if $general.hostAliases }}
    {{- if not $sts.hostAliases }}
      {{- $result = merge $result (dict "hostAliases" $general.hostAliases) }}
    {{- end }}
  {{- end }}
  {{- if $general.dnsConfig }}
    {{- if not $sts.dnsConfig }}
      {{- $result = merge $result (dict "dnsConfig" $general.dnsConfig) }}
    {{- end }}
  {{- end }}
  {{- if hasKey $general "terminationGracePeriodSeconds" }}
    {{- if not (hasKey $sts "terminationGracePeriodSeconds") }}
      {{- $result = merge $result (dict "terminationGracePeriodSeconds" (int $general.terminationGracePeriodSeconds)) }}
    {{- end }}
  {{- end }}
  {{- if $general.topologySpreadConstraints }}
    {{- if not $sts.topologySpreadConstraints }}
      {{- $result = merge $result (dict "topologySpreadConstraints" $general.topologySpreadConstraints) }}
    {{- end }}
  {{- end }}
{{- end }}
{{- if and $result.autoCreateService (not (hasKey $result "serviceHeadless")) }}
  {{- $_ := set $result "serviceHeadless" true }}
{{- end }}
{{- toYaml $result }}
{{- end }}

{{/*
Compute defaulted config for a daemonSets.* entry. Mirrors
deploymentDefaults minus strategy/replicas/parallelism fields, which
do not apply to DaemonSets.
*/}}
{{- define "idlefy-universal.daemonSetDefaults" -}}
{{- $ds := .daemonSet }}
{{- $general := .general | default dict }}
{{- $result := deepCopy $ds }}
{{- if $general.securityContext }}
  {{- $result = merge $result (dict "securityContext" $general.securityContext) }}
{{- end }}
{{- if $general.networkPolicy }}
  {{- $mergedNP := deepCopy $general.networkPolicy }}
  {{- $instanceNP := default dict $result.networkPolicy }}
  {{- range $k, $v := $instanceNP }}
    {{- $_ := set $mergedNP $k $v }}
  {{- end }}
  {{- $_ := set $result "networkPolicy" $mergedNP }}
{{- end }}
{{- if $general.priorityClassName }}
  {{- if not $result.priorityClassName }}
    {{- $result = merge $result (dict "priorityClassName" $general.priorityClassName) }}
  {{- end }}
{{- end }}
{{- if $general.nodeSelector }}
  {{- $result = merge $result (dict "nodeSelector" $general.nodeSelector) }}
{{- end }}
{{- if $general.tolerations }}
  {{- $result = merge $result (dict "tolerations" $general.tolerations) }}
{{- end }}
{{- if $general.affinity }}
  {{- $result = merge $result (dict "affinity" $general.affinity) }}
{{- end }}
{{- if $general.probes }}
  {{- range $containerName, $container := $result.containers }}
    {{- if not $container.probes }}
      {{- $_ := set $container "probes" $general.probes }}
    {{- end }}
  {{- end }}
{{- end }}
{{- toYaml $result }}
{{- end -}}

{{- define "idlefy-universal.ingressDefaults" -}}
  {{- $ingress := .ingress | default dict }}
  {{- $general := .general | default dict }}
  {{- $result := deepCopy $ingress }}

  {{- /* Inherit general annotations, ingressClassName and tls */ -}}
  {{- if $general.annotations }}
    {{- $result = merge $result (dict "annotations" (merge (default dict $ingress.annotations) $general.annotations)) }}
  {{- end }}
  {{- if $general.ingressClassName }}
    {{- if not $ingress.ingressClassName }}
      {{- $result = merge $result (dict "ingressClassName" $general.ingressClassName) }}
    {{- end }}
  {{- end }}
  {{- if $general.tls }}
    {{- if not $ingress.tls }}
      {{- $result = merge $result (dict "tls" $general.tls) }}
    {{- end }}
  {{- end }}

  {{- /* Resolve global domain and subdomain into computed host */ -}}
  {{- $globalDomain := $general.domain | default "" }}
  {{- if and $globalDomain (hasKey $result "hosts") }}
    {{- $newHosts := list }}
    {{- range $index, $hostEntry := $result.hosts }}
      {{- $newHost := $hostEntry }}
      {{- if not (hasKey $hostEntry "host") }}
        {{- if hasKey $hostEntry "subdomain" }}
          {{- /* Compose host as subdomain + "." + globalDomain */ -}}
          {{- $newHost = merge $hostEntry (dict "host" (printf "%s.%s" $hostEntry.subdomain $globalDomain)) }}
        {{- end }}
      {{- end }}
      {{- $newHosts = append $newHosts $newHost }}
    {{- end }}
    {{- $_ := set $result "hosts" $newHosts }}
  {{- end }}

  {{- toYaml $result }}
{{- end }}

{{- define "idlefy-universal.httpRouteDefaults" -}}
  {{- $httpRoute := .httpRoute | default dict }}
  {{- $general := .general | default dict }}
  {{- $result := deepCopy $httpRoute }}

  {{- /* Inherit global annotations (merge, resource-level wins) */ -}}
  {{- if $general.annotations }}
    {{- $result = merge $result (dict "annotations" (merge (default dict $httpRoute.annotations) $general.annotations)) }}
  {{- end }}

  {{- /* parentRefs: route-level fully replaces global, not a merge */ -}}
  {{- if and (not $httpRoute.parentRefs) $general.parentRefs }}
    {{- $_ := set $result "parentRefs" $general.parentRefs }}
  {{- end }}

  {{- toYaml $result }}
{{- end }}
