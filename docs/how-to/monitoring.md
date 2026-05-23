# Monitoring

Add Prometheus scrape coverage to a workload via `autoCreateServiceMonitor`.

## Prerequisites

- Prometheus Operator (or the kube-prometheus-stack) installed in the
  cluster.
- The `monitoring.coreos.com/v1` CRDs present:
  `kubectl get crd servicemonitors.monitoring.coreos.com`.

## Recipe A — single scrape endpoint

```yaml
deployments:
  api:
    containers:
      main:
        image: ghcr.io/example/api
        imageTag: "1.0"
        ports:
          metrics: {containerPort: 9090, servicePort: 9090}
    autoCreateService: true
    autoCreateServiceMonitor: true
    serviceMonitor:
      endpoints:
        - port: metrics
          interval: 30s
```

## Recipe B — multiple endpoints

```yaml
deployments:
  api:
    containers:
      main:
        image: ghcr.io/example/api
        imageTag: "1.0"
        ports:
          metrics:        {containerPort: 9090, servicePort: 9090}
          health-metrics: {containerPort: 9091, servicePort: 9091}
    autoCreateService: true
    autoCreateServiceMonitor: true
    serviceMonitor:
      endpoints:
        - port: metrics
          interval: 30s
        - port: health-metrics
          interval: 60s
```

## Recipe C — relabel by service

```yaml
    serviceMonitor:
      endpoints:
        - port: metrics
          interval: 30s
          relabelings:
            - sourceLabels: [__meta_kubernetes_service_name]
              targetLabel: service
```

## Recipe D — chart-wide defaults via `serviceMonitorGeneral`

```yaml
deploymentsGeneral:
  serviceMonitor:
    endpoints:
      - port: metrics
        interval: 30s

deployments:
  api:
    containers:
      main: {image: example/api, imageTag: "1.0", ports: {metrics: {containerPort: 9090, servicePort: 9090}}}
    autoCreateService: true
    autoCreateServiceMonitor: true
  worker:
    containers:
      main: {image: example/worker, imageTag: "1.0", ports: {metrics: {containerPort: 9090, servicePort: 9090}}}
    autoCreateService: true
    autoCreateServiceMonitor: true
```

Both workloads inherit the endpoint config; either can override it
locally.

## Pitfalls

- **ServiceMonitor namespace selector** — Prometheus Operator must be
  watching the namespace your workload lives in. Check
  `Prometheus.spec.serviceMonitorNamespaceSelector`.
- **Label collision** — if you set `extraLabels` on the ServiceMonitor,
  do not override `app.kubernetes.io/instance` — that label drives
  Prometheus' target labels.

## Reference

- [`autoCreateServiceMonitor`](../reference/values.md#deploymentspec-autocreateservicemonitor)
- [`serviceMonitor`](../reference/values.md#deploymentspec-servicemonitor)
