{{/*
Build a YAML-encoded port list from a workload's container port declarations.
Each container port becomes one list entry: {name, port, targetPort, protocol}.
`servicePort` on a container port overrides `containerPort` as the Service-facing
port while keeping the pod's `containerPort` as `targetPort`.

Parameters:
  workloadConfig — any workload config that has .containers (map of containerName ->
                   {ports: {portName -> {containerPort, servicePort?, protocol?}}})

Returns: YAML string suitable for `fromYamlArray`. Empty list when no ports declared.
*/}}
{{- define "idlefy-universal.autoCreateServicePortsList" -}}
{{- $workloadConfig := .workloadConfig -}}
{{- $ports := list -}}
{{- range $containerName, $container := $workloadConfig.containers -}}
{{- range $portName, $port := $container.ports -}}
{{- $servicePort := $port.containerPort -}}
{{- if $port.servicePort -}}
  {{- $servicePort = $port.servicePort -}}
{{- end -}}
{{- $ports = append $ports (dict "name" $portName "port" $servicePort "targetPort" $port.containerPort "protocol" (default "TCP" $port.protocol)) -}}
{{- end -}}
{{- end -}}
{{- toYaml $ports -}}
{{- end -}}
