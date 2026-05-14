{{/*
Common validation helpers
*/}}

{{/* Nil check helper */}}
{{- define "idlefy-universal.validateNotNil" -}}
{{- $value := .value -}}
{{- $field := .field -}}
{{- $context := .context -}}
{{- if eq ($value | toString) "<nil>" -}}
{{- fail (printf "%s: %s must not be nil" $context $field) -}}
{{- end -}}
{{- end -}}

{{/* Required field helper */}}
{{- define "idlefy-universal.validateRequired" -}}
{{- $object := .object -}}
{{- $field := .field -}}
{{- $context := .context -}}
{{- if not (hasKey $object $field) -}}
{{- fail (printf "%s: field '%s' is required" $context $field) -}}
{{- end -}}
{{- end -}}

{{/* Range validation helper */}}
{{- define "idlefy-universal.validateRange" -}}
{{- $value := .value -}}
{{- $min := .min -}}
{{- $max := .max -}}
{{- $field := .field -}}
{{- $context := .context -}}
{{- if and $value (or (lt $value $min) (gt $value $max)) -}}
{{- fail (printf "%s: %s must be between %d and %d" $context $field $min $max) -}}
{{- end -}}
{{- end -}}

{{/*
Context validation
*/}}
{{- define "idlefy-universal.validateContext" -}}
{{- $root := . -}}
{{- if not $root.Chart -}}
{{- fail "Root context must contain Chart information" -}}
{{- end -}}
{{- if not $root.Release -}}
{{- fail "Root context must contain Release information" -}}
{{- end -}}
{{- if not $root.Release.Name -}}
{{- fail "Release.Name must not be empty" -}}
{{- end -}}
{{- if not $root.Release.Service -}}
{{- fail "Release.Service must not be empty" -}}
{{- end -}}
{{- end -}}

{{/*
Ports validation
*/}}
{{/* SecretRefs validation */}}
{{- define "idlefy-universal.validateSecretRefs" -}}
{{- $secretRefs := .secretRefs -}}
{{- $context := .context -}}

{{- if not $secretRefs -}}
{{- fail (printf "%s: secretRefs configuration must not be empty" $context) -}}
{{- end -}}

{{- range $refName, $refConfig := $secretRefs -}}
{{- if not (kindIs "slice" $refConfig) -}}
{{- fail (printf "%s: secretRef %s must be a list of environment variables" $context $refName) -}}
{{- end -}}

{{- range $refConfig -}}
{{- if not .name -}}
{{- fail (printf "%s: name is required for secretRef %s" $context $refName) -}}
{{- end -}}
{{- if not .secretKeyRef -}}
{{- fail (printf "%s: secretKeyRef is required for secretRef %s env %s" $context $refName .name) -}}
{{- end -}}
{{- if not .secretKeyRef.name -}}
{{- fail (printf "%s: secretKeyRef.name is required for secretRef %s env %s" $context $refName .name) -}}
{{- end -}}
{{- if not .secretKeyRef.key -}}
{{- fail (printf "%s: secretKeyRef.key is required for secretRef %s env %s" $context $refName .name) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Container validation — cross-resource secretRef lookup */}}
{{- define "idlefy-universal.validateContainer" -}}
{{- $containerName := .containerName -}}
{{- $container := .container -}}
{{- $context := .context -}}
{{- $root := .root -}}

{{/* Validate secretRefs references exist in .Values.secretRefs */}}
{{- if and $container.secretRefs $root.Values.secretRefs -}}
{{- range $container.secretRefs -}}
{{- if not (hasKey $root.Values.secretRefs .) -}}
{{- fail (printf "%s - Container %s: referenced secretRef '%s' not found in .Values.secretRefs" $context $containerName .) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Certificate validation — cross-field: autoCreateCertificate requires autoCreateIngress
*/}}
{{- define "idlefy-universal.validateCertificate" -}}
{{- $deploymentConfig := . -}}
{{- if and $deploymentConfig.autoCreateCertificate (not $deploymentConfig.autoCreateIngress) -}}
{{- fail (printf "autoCreateCertificate requires autoCreateIngress to be enabled") -}}
{{- end -}}
{{- if and $deploymentConfig.autoCreateCertificate (not $deploymentConfig.ingress) -}}
{{- fail (printf "autoCreateCertificate requires ingress configuration") -}}
{{- end -}}
{{- end -}}

{{/*
Computed Ingress Host
*/}}
{{- define "idlefy-universal.computedIngressHost" -}}
  {{- $host := .host | default "" | trim -}}
  {{- $subdomain := .subdomain | default "" | trim -}}
  {{- $globalDomain := .globalDomain | default "" | trim -}}
  {{- $domainRegex := "^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\\.(?:[a-zA-Z]{2,}))+$" -}}
  {{- $subdomainRegex := "^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$" -}}

  {{- if $host }}
    {{- if regexMatch $domainRegex $host }}
      {{ $host }}
    {{- else }}
      {{ fail (printf "Invalid host value: '%s'. Он должен соответствовать шаблону домена." $host) }}
    {{- end }}
  {{- else if $subdomain }}
    {{- if not $globalDomain }}
      {{ fail "Global domain должен быть указан, когда используется subdomain." }}
    {{- end }}
    {{- if regexMatch $subdomainRegex $subdomain }}
      {{ printf "%s.%s" $subdomain $globalDomain }}
    {{- else }}
      {{ fail (printf "Invalid subdomain value: '%s'. Допустимы только строчные буквы, цифры и дефисы." $subdomain) }}
    {{- end }}
  {{- else if $globalDomain }}
    {{- if regexMatch $domainRegex $globalDomain }}
      {{ $globalDomain }}
    {{- else }}
      {{ fail (printf "Invalid global domain value: '%s'" $globalDomain) }}
    {{- end }}
  {{- else }}
    {{ fail "Не указаны ни host, ни subdomain, ни global domain." }}
  {{- end }}
{{- end }}

{{/*
Ingress validation — computed-host regex.
*/}}
{{- define "idlefy-universal.validateIngress" -}}
  {{- $root := .root -}}
  {{- $name := .name -}}
  {{- $config := .config -}}
  {{- $generic := $root.Values.generic | default dict -}}
  {{- $ingressesGeneral := $generic.ingressesGeneral | default dict -}}
  {{- $globalDomain := $ingressesGeneral.domain | default "" | trim }}

  {{- if not $config -}}
    {{ fail (printf "Ingress %s: configuration must not be empty" $name) }}
  {{- end }}

  {{- range $hostEntry := $config.hosts }}
    {{- /* Compute the final host using our helper */ -}}
    {{- $computedHost := include "idlefy-universal.computedIngressHost" (dict "host" $hostEntry.host "subdomain" $hostEntry.subdomain "globalDomain" $globalDomain) | trim }}
    {{- if not $computedHost }}
      {{ fail (printf "Ingress %s: computed host is empty for entry %+v" $name $hostEntry) }}
    {{- end }}
  {{- end }}
{{- end }}

{{/*
Deployment validation — cross-field checks, secretRefs lookup, certificate cross-field
*/}}
{{- define "idlefy-universal.validateDeployment" -}}
{{- $deploymentName := .deploymentName -}}
{{- $deploymentConfig := .deploymentConfig -}}
{{- $root := .root -}}

{{- if not $deploymentConfig -}}
{{- fail (printf "Deployment %s: configuration must not be empty" $deploymentName) -}}
{{- end -}}

{{/* Container secretRef cross-resource validation */}}
{{- range $containerName, $container := $deploymentConfig.containers -}}
{{- include "idlefy-universal.validateContainer" (dict "containerName" $containerName "container" $container "context" (printf "Deployment %s" $deploymentName) "root" $root) -}}
{{- end -}}

{{/* Certificate cross-field validation */}}
{{- if $deploymentConfig.autoCreateCertificate -}}
{{- include "idlefy-universal.validateCertificate" $deploymentConfig -}}
{{- end -}}

{{/* NetworkPolicy validation (NP-1..NP-6) */}}
{{- $defaultedConfig := include "idlefy-universal.deploymentDefaults" (dict "deployment" $deploymentConfig "general" $root.Values.deploymentsGeneral) | fromYaml -}}
{{- include "idlefy-universal.validateNetworkPolicy" (dict "kind" "Deployment" "name" $deploymentName "config" $deploymentConfig "defaultedConfig" $defaultedConfig) -}}

{{/* RBAC validation (RB-1..RB-6) — uses RAW config (autoCreateServiceAccount is per-instance) */}}
{{- include "idlefy-universal.validateRbac" (dict "kind" "Deployment" "name" $deploymentName "config" $deploymentConfig "root" $root) -}}
{{- end -}}

{{/*
CronJob validation — container secretRef cross-resource validation
*/}}
{{- define "idlefy-universal.validateCronJob" -}}
{{- $cronJobName := .cronJobName -}}
{{- $cronJobConfig := .cronJobConfig -}}
{{- $root := .root -}}

{{- if not $cronJobConfig -}}
{{- fail (printf "CronJob %s: configuration must not be empty" $cronJobName) -}}
{{- end -}}

{{/* Container secretRef cross-validation */}}
{{- range $containerName, $container := $cronJobConfig.containers -}}
{{- include "idlefy-universal.validateContainer" (dict "containerName" $containerName "container" $container "context" (printf "CronJob %s" $cronJobName) "root" $root) -}}
{{- end -}}

{{/* NetworkPolicy validation (NP-1..NP-6) */}}
{{- $defaultedConfig := include "idlefy-universal.deploymentDefaults" (dict "deployment" $cronJobConfig "general" $root.Values.deploymentsGeneral) | fromYaml -}}
{{- include "idlefy-universal.validateNetworkPolicy" (dict "kind" "CronJob" "name" $cronJobName "config" $cronJobConfig "defaultedConfig" $defaultedConfig) -}}

{{/* RBAC validation (RB-1..RB-6) — uses RAW config (autoCreateServiceAccount is per-instance) */}}
{{- include "idlefy-universal.validateRbac" (dict "kind" "CronJob" "name" $cronJobName "config" $cronJobConfig "root" $root) -}}
{{- end -}}

{{/*
Job validation — container secretRef cross-resource validation
*/}}
{{- define "idlefy-universal.validateJob" -}}
{{- $jobName := .jobName -}}
{{- $jobConfig := .jobConfig -}}
{{- $root := .root -}}

{{- if not $jobConfig -}}
{{- fail (printf "Job %s: configuration must not be empty" $jobName) -}}
{{- end -}}

{{/* Container secretRef cross-validation */}}
{{- range $containerName, $container := $jobConfig.containers -}}
{{- include "idlefy-universal.validateContainer" (dict "containerName" $containerName "container" $container "context" (printf "Job %s" $jobName) "root" $root) -}}
{{- end -}}

{{/* NetworkPolicy validation (NP-1..NP-6) */}}
{{- $defaultedConfig := include "idlefy-universal.deploymentDefaults" (dict "deployment" $jobConfig "general" $root.Values.deploymentsGeneral) | fromYaml -}}
{{- include "idlefy-universal.validateNetworkPolicy" (dict "kind" "Job" "name" $jobName "config" $jobConfig "defaultedConfig" $defaultedConfig) -}}

{{/* RBAC validation (RB-1..RB-6) — uses RAW config (autoCreateServiceAccount is per-instance) */}}
{{- include "idlefy-universal.validateRbac" (dict "kind" "Job" "name" $jobName "config" $jobConfig "root" $root) -}}
{{- end -}}

{{/*
Validate a single StatefulSet entry.
Parameters:
  stsName    — key in .Values.statefulSets
  stsConfig  — value at .Values.statefulSets[name]
  root       — chart root context for cross-resource lookups
*/}}
{{- define "idlefy-universal.validateStatefulSet" -}}
{{- $stsName := .stsName -}}
{{- $stsConfig := .stsConfig -}}
{{- $root := .root -}}

{{- if not $stsConfig -}}
{{- fail (printf "StatefulSet %s: configuration must not be empty" $stsName) -}}
{{- end -}}

{{/* Container secretRef cross-resource validation */}}
{{- range $containerName, $container := $stsConfig.containers -}}
{{- include "idlefy-universal.validateContainer" (dict "containerName" $containerName "container" $container "context" (printf "StatefulSet %s" $stsName) "root" $root) -}}
{{- end -}}

{{/* Certificate cross-field validation (mirrors validateDeployment) */}}
{{- if $stsConfig.autoCreateCertificate -}}
{{- include "idlefy-universal.validateCertificate" $stsConfig -}}
{{- end -}}

{{/* serviceName required when autoCreateService=true */}}
{{- if $stsConfig.autoCreateService -}}
{{- if not $stsConfig.serviceName -}}
{{- fail (printf "StatefulSet %s: serviceName is required when autoCreateService=true" $stsName) -}}
{{- end -}}

{{/* At least one container port must exist */}}
{{- $portCount := 0 -}}
{{- range $containerName, $container := $stsConfig.containers -}}
{{- range $portName, $port := $container.ports -}}
{{- $portCount = add $portCount 1 -}}
{{- end -}}
{{- end -}}
{{- if eq $portCount 0 -}}
{{- fail (printf "StatefulSet %s: autoCreateService=true requires at least one container port" $stsName) -}}
{{- end -}}
{{- end -}}

{{/* volumeClaimTemplates name vs volumes name collision */}}
{{- if and $stsConfig.volumeClaimTemplates $stsConfig.volumes -}}
{{- $volumeNames := list -}}
{{- range $vol := $stsConfig.volumes -}}
{{- $volumeNames = append $volumeNames $vol.name -}}
{{- end -}}
{{- range $vct := $stsConfig.volumeClaimTemplates -}}
{{- $vctName := (default dict $vct.metadata).name -}}
{{- if not $vctName -}}
{{- fail (printf "StatefulSet %s: volumeClaimTemplates entry is missing metadata.name (required by Kubernetes)" $stsName) -}}
{{- end -}}
{{- if has $vctName $volumeNames -}}
{{- fail (printf "StatefulSet %s: volumeClaimTemplates name '%s' collides with volumes name" $stsName $vctName) -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* NetworkPolicy validation (NP-1..NP-6) */}}
{{- $defaultedConfig := include "idlefy-universal.statefulSetDefaults" (dict "statefulSet" $stsConfig "general" $root.Values.statefulSetsGeneral) | fromYaml -}}
{{- include "idlefy-universal.validateNetworkPolicy" (dict "kind" "StatefulSet" "name" $stsName "config" $stsConfig "defaultedConfig" $defaultedConfig) -}}

{{/* RBAC validation (RB-1..RB-6) — uses RAW config (autoCreateServiceAccount is per-instance) */}}
{{- include "idlefy-universal.validateRbac" (dict "kind" "StatefulSet" "name" $stsName "config" $stsConfig "root" $root) -}}

{{- end -}}

{{/*
HTTPRoute validation — parentRefs/hostnames/rules required (not in schema), computed-hostname checks
*/}}
{{- define "idlefy-universal.validateHttpRoute" -}}
  {{- $name := .name -}}
  {{- $config := .config -}}
  {{- $root := .root -}}
  {{- $generic := $root.Values.generic | default dict -}}
  {{- $httpRoutesGeneral := index $generic "httpRoutesGeneral" | default dict -}}
  {{- $ingressesGeneral := $generic.ingressesGeneral | default dict -}}
  {{- $globalDomain := $ingressesGeneral.domain | default "" | trim -}}

  {{- if not $config -}}
    {{ fail (printf "HTTPRoute %s: configuration must not be empty" $name) }}
  {{- end }}

  {{- /* parentRefs required: per-route or global */ -}}
  {{- if and (not $config.parentRefs) (not $httpRoutesGeneral.parentRefs) -}}
    {{ fail (printf "HTTPRoute %s: parentRefs must be specified either per-route or in generic.httpRoutesGeneral" $name) }}
  {{- end }}

  {{- /* hostnames required */ -}}
  {{- if not $config.hostnames -}}
    {{ fail (printf "HTTPRoute %s: hostnames is required" $name) }}
  {{- end }}

  {{- /* Validate each hostname */ -}}
  {{- range $hostname := $config.hostnames }}
    {{- $computedHost := include "idlefy-universal.computedIngressHost" (dict "host" $hostname.host "subdomain" $hostname.subdomain "globalDomain" $globalDomain) | trim }}
    {{- if not $computedHost }}
      {{ fail (printf "HTTPRoute %s: computed hostname is empty" $name) }}
    {{- end }}
  {{- end }}

  {{- /* rules required */ -}}
  {{- if not $config.rules -}}
    {{ fail (printf "HTTPRoute %s: at least one rule is required" $name) }}
  {{- end }}

  {{- /* Validate rules */ -}}
  {{- range $i, $rule := $config.rules }}
    {{- if not $rule.matches -}}
      {{ fail (printf "HTTPRoute %s: rule[%d] must have at least one match" $name $i) }}
    {{- end }}
  {{- end }}
{{- end }}

{{/*
Validate a single DaemonSet entry.
Parameters:
  dsName    — key in .Values.daemonSets
  dsConfig  — value at .Values.daemonSets[name]
  root      — chart root context for cross-resource lookups
*/}}
{{- define "idlefy-universal.validateDaemonSet" -}}
{{- $dsName := .dsName -}}
{{- $dsConfig := .dsConfig -}}
{{- $root := .root -}}

{{- if not $dsConfig -}}
{{- fail (printf "DaemonSet %s: configuration must not be empty" $dsName) -}}
{{- end -}}

{{/* Container secretRef cross-resource validation */}}
{{- range $containerName, $container := $dsConfig.containers -}}
{{- include "idlefy-universal.validateContainer" (dict "containerName" $containerName "container" $container "context" (printf "DaemonSet %s" $dsName) "root" $root) -}}
{{- end -}}

{{/* NetworkPolicy validation (NP-1..NP-6) */}}
{{- $defaultedConfig := include "idlefy-universal.daemonSetDefaults" (dict "daemonSet" $dsConfig "general" $root.Values.daemonSetsGeneral) | fromYaml -}}
{{- include "idlefy-universal.validateNetworkPolicy" (dict "kind" "DaemonSet" "name" $dsName "config" $dsConfig "defaultedConfig" $defaultedConfig) -}}

{{/* RBAC validation (RB-1..RB-6) — uses RAW config (autoCreateServiceAccount is per-instance) */}}
{{- include "idlefy-universal.validateRbac" (dict "kind" "DaemonSet" "name" $dsName "config" $dsConfig "root" $root) -}}

{{- end -}}

{{/*
NetworkPolicy validation — strict explicit-only.
Parameters:
  kind            — workload kind label for error messages (Deployment / StatefulSet / etc.)
  name            — workload key
  config          — raw per-instance config (used for NP-6 only)
  defaultedConfig — general-merged config (used for NP-1..NP-5)
*/}}
{{- define "idlefy-universal.validateNetworkPolicy" -}}
{{- $kind := .kind -}}
{{- $name := .name -}}
{{- $config := .config -}}
{{- $defaultedConfig := .defaultedConfig -}}

{{/* NP-6: instance-level block without instance-level autoCreate (RAW config). */}}
{{- if and $config.networkPolicy (not $config.autoCreateNetworkPolicy) -}}
{{- fail (printf "%s %s: 'networkPolicy' block is defined but autoCreateNetworkPolicy is not true — block will be ignored, set autoCreateNetworkPolicy: true to enable" $kind $name) -}}
{{- end -}}

{{/* NP-1..NP-5 use the defaulted config so *General inheritance is honored. */}}
{{- if $defaultedConfig.autoCreateNetworkPolicy -}}
  {{- if not $defaultedConfig.networkPolicy -}}
  {{- fail (printf "%s %s: autoCreateNetworkPolicy=true requires a 'networkPolicy' block" $kind $name) -}}
  {{- end -}}

  {{- if or (not $defaultedConfig.networkPolicy.policyTypes) (eq (len $defaultedConfig.networkPolicy.policyTypes) 0) -}}
  {{- fail (printf "%s %s: networkPolicy.policyTypes is required and must be non-empty (e.g. [Ingress, Egress])" $kind $name) -}}
  {{- end -}}

  {{- range $defaultedConfig.networkPolicy.policyTypes -}}
    {{- if not (or (eq . "Ingress") (eq . "Egress")) -}}
    {{- fail (printf "%s %s: networkPolicy.policyTypes may only contain 'Ingress' or 'Egress', got: %s" $kind $name .) -}}
    {{- end -}}
  {{- end -}}

  {{- if has "Ingress" $defaultedConfig.networkPolicy.policyTypes -}}
    {{- if or (not (hasKey $defaultedConfig.networkPolicy "ingress")) (eq (index $defaultedConfig.networkPolicy "ingress") nil) -}}
    {{- fail (printf "%s %s: policyTypes contains 'Ingress' but 'networkPolicy.ingress' is not defined (use [] for explicit deny)" $kind $name) -}}
    {{- end -}}
  {{- end -}}

  {{- if has "Egress" $defaultedConfig.networkPolicy.policyTypes -}}
    {{- if or (not (hasKey $defaultedConfig.networkPolicy "egress")) (eq (index $defaultedConfig.networkPolicy "egress") nil) -}}
    {{- fail (printf "%s %s: policyTypes contains 'Egress' but 'networkPolicy.egress' is not defined (use [] for explicit deny)" $kind $name) -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- end -}}

{{/*
RBAC validation — strict explicit-only, namespaced only.
Parameters:
  kind   — workload kind label (Deployment / StatefulSet / etc.)
  name   — workload key
  config — workload config (NOT defaulted — autoCreateServiceAccount is per-instance)
  root   — chart root for `shouldSetServiceAccountName` helper
*/}}
{{- define "idlefy-universal.validateRbac" -}}
{{- $kind := .kind -}}
{{- $name := .name -}}
{{- $config := .config -}}
{{- $root := .root -}}

{{/* RB-4: block present but autoCreate not enabled */}}
{{- if and $config.rbac (not $config.autoCreateRbac) -}}
{{- fail (printf "%s %s: 'rbac' block is defined but autoCreateRbac is not true — block will be ignored, set autoCreateRbac: true to enable" $kind $name) -}}
{{- end -}}

{{- if $config.autoCreateRbac -}}
  {{/* RB-1: autoCreate without block */}}
  {{- if not $config.rbac -}}
  {{- fail (printf "%s %s: autoCreateRbac=true requires an 'rbac' block" $kind $name) -}}
  {{- end -}}

  {{/* RB-2: rules missing or empty */}}
  {{- if or (not $config.rbac.rules) (eq (len $config.rbac.rules) 0) -}}
  {{- fail (printf "%s %s: rbac.rules is required and must be non-empty" $kind $name) -}}
  {{- end -}}

  {{/* RB-3: no resolvable SA */}}
  {{- $shouldSetSA := include "idlefy-universal.shouldSetServiceAccountName" (dict "resourceConfig" $config "root" $root) -}}
  {{- if ne $shouldSetSA "true" -}}
  {{- fail (printf "%s %s: autoCreateRbac=true requires a ServiceAccount — set autoCreateServiceAccount: true or specify serviceAccountName" $kind $name) -}}
  {{- end -}}

  {{/* RB-5 / RB-6: per-rule shape */}}
  {{- range $i, $rule := $config.rbac.rules -}}
    {{- if or (not $rule.verbs) (eq (len $rule.verbs) 0) -}}
    {{- fail (printf "%s %s: rbac.rules[%d] requires non-empty 'verbs'" $kind $name $i) -}}
    {{- end -}}
    {{- if and (not $rule.resources) (not $rule.nonResourceURLs) -}}
    {{- fail (printf "%s %s: rbac.rules[%d] requires at least one of 'resources' or 'nonResourceURLs'" $kind $name $i) -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- end -}}

{{/*
Main validation entrypoint
*/}}
{{- define "idlefy-universal.validate" -}}
{{- $root := . -}}

{{/* Validate global secretRefs if defined */}}
{{- if .Values.secretRefs -}}
{{- include "idlefy-universal.validateSecretRefs" (dict "secretRefs" .Values.secretRefs "context" "Global") -}}
{{- end -}}

{{/* Context validation */}}
{{- include "idlefy-universal.validateContext" $root -}}

{{/* Cross-workload duplicate-name guard — every kind that stamps a
     'app.kubernetes.io/component: <name>' label is included. Jobs and
     CronJobs use the same label scheme, so a collision with a
     Deployment/StatefulSet/DaemonSet produces ambiguous selectors. */}}
{{- $allKeys := dict -}}
{{- range $name, $_ := ($root.Values.deployments | default dict) -}}
{{- $_ := set $allKeys $name (append (default (list) (get $allKeys $name)) "deployments") -}}
{{- end -}}
{{- range $name, $_ := ($root.Values.statefulSets | default dict) -}}
{{- $_ := set $allKeys $name (append (default (list) (get $allKeys $name)) "statefulSets") -}}
{{- end -}}
{{- range $name, $_ := ($root.Values.daemonSets | default dict) -}}
{{- $_ := set $allKeys $name (append (default (list) (get $allKeys $name)) "daemonSets") -}}
{{- end -}}
{{- range $name, $_ := ($root.Values.jobs | default dict) -}}
{{- $_ := set $allKeys $name (append (default (list) (get $allKeys $name)) "jobs") -}}
{{- end -}}
{{- range $name, $_ := ($root.Values.cronJobs | default dict) -}}
{{- $_ := set $allKeys $name (append (default (list) (get $allKeys $name)) "cronJobs") -}}
{{- end -}}
{{- range $name, $where := $allKeys -}}
{{- if gt (len $where) 1 -}}
{{- fail (printf "Workload key '%s' appears in multiple top-level keys: %s. Same-named keys produce colliding component labels." $name (join ", " $where)) -}}
{{- end -}}
{{- end -}}

{{/* Deployments validation */}}
{{- if $root.Values.deployments -}}
{{- range $deploymentName, $deploymentConfig := $root.Values.deployments -}}
{{- include "idlefy-universal.validateDeployment" (dict "deploymentName" $deploymentName "deploymentConfig" $deploymentConfig "root" $root) -}}
{{- end -}}
{{- end -}}

{{/* CronJobs validation */}}
{{- if $root.Values.cronJobs -}}
{{- range $cronJobName, $cronJobConfig := $root.Values.cronJobs -}}
{{- include "idlefy-universal.validateCronJob" (dict "cronJobName" $cronJobName "cronJobConfig" $cronJobConfig "root" $root) -}}
{{- end -}}
{{- end -}}

{{/* Jobs validation */}}
{{- if $root.Values.jobs -}}
{{- range $jobName, $jobConfig := $root.Values.jobs -}}
{{- include "idlefy-universal.validateJob" (dict "jobName" $jobName "jobConfig" $jobConfig "root" $root) -}}
{{- end -}}
{{- end -}}

{{/* StatefulSets validation */}}
{{- if $root.Values.statefulSets -}}
{{- range $stsName, $stsConfig := $root.Values.statefulSets -}}
{{- include "idlefy-universal.validateStatefulSet" (dict "stsName" $stsName "stsConfig" $stsConfig "root" $root) -}}
{{- end -}}
{{- end -}}

{{/* DaemonSets validation */}}
{{- if $root.Values.daemonSets -}}
{{- range $dsName, $dsConfig := $root.Values.daemonSets -}}
{{- include "idlefy-universal.validateDaemonSet" (dict "dsName" $dsName "dsConfig" $dsConfig "root" $root) -}}
{{- end -}}
{{- end -}}

{{/* Ingresses validation */}}
{{- if $root.Values.ingresses -}}
{{- range $ingressName, $ingressConfig := $root.Values.ingresses -}}
{{- include "idlefy-universal.validateIngress" (dict "name" $ingressName "config" $ingressConfig "root" $root) }}
{{- end -}}
{{- end -}}

{{/* HTTPRoutes validation */}}
{{- if $root.Values.httpRoutes -}}
{{- range $routeName, $routeConfig := $root.Values.httpRoutes -}}
{{- include "idlefy-universal.validateHttpRoute" (dict "name" $routeName "config" $routeConfig "root" $root) -}}
{{- end -}}
{{- end -}}
{{- end -}}
