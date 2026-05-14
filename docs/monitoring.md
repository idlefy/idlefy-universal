# 📊 Monitoring with Idlefy Universal

This document provides a detailed overview of the monitoring capabilities in the idlefy-universal chart.

## 📑 Table of Contents
- [Overview](#overview)
- [Quick Start](#quick-start)
- [Configuration Options](#configuration-options)
- [Use Cases](#use-cases)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## 🔍 Overview

The idlefy-universal chart provides comprehensive monitoring support through Prometheus ServiceMonitors. Key features include:
- Automatic ServiceMonitor creation
- Multi-container monitoring
- Custom metric endpoints
- Flexible scraping configurations
- Integration with Prometheus Operator

## 🚀 Quick Start

<details>
<summary>Basic Monitoring Setup</summary>

```yaml
# Enable monitoring for a simple application
deployments:
  my-app:
    autoCreateServiceMonitor: true
    containers:
      main:
        ports:
          http-metrics:
            containerPort: 9090
```
</details>

## ⚙️ Configuration Options

### Global Settings

<details>
<summary>Global ServiceMonitor Configuration</summary>

```yaml
generic:
  serviceMonitorGeneral:
    labels:
      prometheus: kube-prometheus  # Required for Prometheus Operator discovery
    interval: 30s                 # Default scrape interval
    scrapeTimeout: 10s           # Default scrape timeout
```
</details>

### Per-Deployment Settings

<details>
<summary>Basic ServiceMonitor Configuration</summary>

```yaml
deployments:
  my-app:
    autoCreateServiceMonitor: true
    serviceMonitor:
      path: /metrics           # Metrics path
      interval: 15s           # Override global interval
```
</details>

<details>
<summary>Advanced ServiceMonitor Configuration</summary>

```yaml
serviceMonitor:
  endpoints:
    - port: metrics
      interval: 15s
      path: /metrics
      scrapeTimeout: 10s
      # Relabeling configuration
      relabelings:
        - sourceLabels: [__meta_kubernetes_pod_label_app_kubernetes_io_component]
          targetLabel: component
      # Metric relabeling
      metricRelabelings:
        - sourceLabels: [__name__]
          regex: 'go_.*'
          action: drop
```
</details>

## 🎯 Use Cases

### Standard Web Application

<details>
<summary>Basic Web App Monitoring</summary>

```yaml
deployments:
  web-app:
    autoCreateServiceMonitor: true
    containers:
      main:
        ports:
          http-metrics:
            containerPort: 9090
```
</details>

### High-Performance Application

<details>
<summary>Advanced Monitoring Configuration</summary>

```yaml
deployments:
  high-load-app:
    autoCreateServiceMonitor: true
    containers:
      main:
        ports:
          basic-metrics:
            containerPort: 9090
          detailed-metrics:
            containerPort: 9091
    serviceMonitor:
      endpoints:
        - port: basic-metrics
          interval: 10s
          path: /metrics/basic
        - port: detailed-metrics
          interval: 30s
          path: /metrics/detailed
```
</details>

### Database Monitoring

<details>
<summary>Database with Exporter</summary>

```yaml
deployments:
  database:
    autoCreateServiceMonitor: true
    containers:
      db:
        image: postgres
        ports:
          postgres:
            containerPort: 5432
      exporter:
        image: postgres-exporter
        ports:
          http-metrics:
            containerPort: 9187
    serviceMonitor:
      endpoints:
        - port: http-metrics
          interval: 20s
```
</details>

## 💡 Best Practices

### 1. Port Naming Conventions
- Use `http-metrics` for automatic discovery
- Use descriptive names for additional ports
- Document port purposes

### 2. Resource Considerations
- Adjust intervals based on resource usage
- Use longer intervals for resource-intensive metrics
- Consider scrapeTimeout for slow metrics

### 3. Label Management
- Use consistent labeling schemes
- Leverage relabeling for better organization
- Keep cardinality under control

### 4. Multi-Container Setup
- Separate concerns between containers
- Use dedicated exporters when needed
- Configure appropriate intervals per container

## 🔍 Troubleshooting

### Common Issues

<details>
<summary>ServiceMonitor Not Found</summary>

1. **Check labels match Prometheus Operator configuration**
```yaml
generic:
  serviceMonitorGeneral:
    labels:
      prometheus: kube-prometheus  # Must match your Prometheus Operator configuration
```

2. **Verify ServiceMonitor CRD is installed**
```bash
kubectl get crd servicemonitors.monitoring.coreos.com
```
</details>

<details>
<summary>Metrics Not Scraped</summary>

1. **Verify port names match ServiceMonitor configuration**
2. **Check endpoint accessibility**
```bash
kubectl port-forward svc/your-service 9090:9090
curl localhost:9090/metrics
```
3. **Validate metrics path**
</details>

<details>
<summary>High Resource Usage</summary>

1. **Adjust scraping intervals**
```yaml
serviceMonitor:
  endpoints:
    - port: metrics
      interval: 30s  # Increase for less critical metrics
```

2. **Use metric filtering**
```yaml
metricRelabelings:
  - sourceLabels: [__name__]
    regex: 'go_gc_.*'
    action: keep  # Only keep relevant metrics
```
</details>

### Debugging Steps

<details>
<summary>Monitoring Debug Commands</summary>

1. Check ServiceMonitor creation:
```bash
kubectl get servicemonitor -n your-namespace
kubectl describe servicemonitor your-servicemonitor
```

2. Verify endpoint discovery:
```bash
kubectl get endpoints -n your-namespace
```

3. Check Prometheus targets:
```bash
kubectl port-forward svc/prometheus-k8s 9090:9090 -n monitoring
# Open http://localhost:9090/targets in your browser
```
</details>

## 📈 Integration Examples

### Grafana Dashboard Integration

<details>
<summary>Grafana Integration</summary>

```yaml
podAnnotations:
  grafana-dashboard: "true"

serviceMonitor:
  endpoints:
    - port: metrics
      interval: 15s
      metricRelabelings:
        - sourceLabels: [__name__]
          regex: 'error_.*'
          action: keep
```
</details>

### Alert Manager Integration

<details>
<summary>AlertManager Rules</summary>

```yaml
# In your Prometheus Rules configuration
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: my-app-alerts
spec:
  groups:
    - name: my-app
      rules:
        - alert: HighErrorRate
          expr: |
            sum(rate(http_requests_total{status=~"5.."}[5m])) 
            / 
            sum(rate(http_requests_total[5m])) > 0.1
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: High error rate detected
```
</details>

### Custom Metrics Example

<details>
<summary>Application with Custom Metrics</summary>

```yaml
deployments:
  custom-app:
    autoCreateServiceMonitor: true
    containers:
      main:
        ports:
          http-metrics:
            containerPort: 9090
    serviceMonitor:
      endpoints:
        - port: http-metrics
          interval: 15s
          metricRelabelings:
            - sourceLabels: [__name__]
              regex: '^myapp_.*'
              action: keep
```
</details>