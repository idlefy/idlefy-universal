# Monitoring Configuration Example

This example demonstrates how to configure comprehensive monitoring for your applications using:
- Prometheus ServiceMonitors
- Custom metrics endpoints
- Different scraping configurations
- Common monitoring patterns

## Configuration
```yaml
# Global monitoring settings
generic:
  serviceMonitorGeneral:
    labels:
      prometheus: kube-prometheus  # Required for Prometheus Operator discovery
    interval: 30s       # Default scrape interval
    scrapeTimeout: 10s  # Default scrape timeout

# Application with basic monitoring
deployments:
  simple-app:
    autoCreateService: true
    autoCreateServiceMonitor: true
    containers:
      main:
        image: my-app
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 8080
          # Dedicated metrics port
          http-metrics:
            containerPort: 9090
    
    # Basic ServiceMonitor configuration
    serviceMonitor:
      path: /metrics
      interval: 15s

# Application with advanced monitoring
deployments:
  advanced-app:
    autoCreateService: true
    autoCreateServiceMonitor: true
    containers:
      main:
        image: advanced-app
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 8080
          metrics:
            containerPort: 9090
    
    # Advanced ServiceMonitor configuration
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
        # Additional endpoint for profile metrics
        - port: metrics
          interval: 30s
          path: /metrics/profile
          scrapeTimeout: 25s

# Batch job with monitoring
cronJobs:
  batch-job:
    schedule: "0 * * * *"
    containers:
      main:
        image: batch-processor
        imageTag: v1.0.0
        ports:
          metrics:
            containerPort: 9090
        # Push metrics to Pushgateway after job completion
        lifecycle:
          postStart:
            exec:
              command:
                - "/bin/sh"
                - "-c"
                - |
                  finish() {
                    echo "Pushing metrics to Pushgateway..."
                    curl -X POST http://pushgateway:9091/metrics/job/batch_processor \
                      --data-binary "@/metrics/final.prom"
                  }
                  trap finish EXIT
        volumeMounts:
          - name: metrics
            mountPath: /metrics
    volumes:
      - name: metrics
        emptyDir: {}

# Multi-container application with different metric endpoints
deployments:
  complex-app:
    autoCreateService: true
    autoCreateServiceMonitor: true
    containers:
      app:
        image: main-app
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 8080
          metrics:
            containerPort: 9090
      cache:
        image: redis
        imageTag: "6.2"
        ports:
          redis:
            containerPort: 6379
          metrics:
            containerPort: 9121
    
    # Monitor multiple containers
    serviceMonitor:
      endpoints:
        - port: metrics  # Main application metrics
          interval: 15s
          path: /metrics
        - port: metrics  # Redis metrics
          interval: 30s
          path: /metrics
          targetPort: 9121  # Redis exporter port
```

## Usage

1. Ensure Prometheus Operator is installed in your cluster
2. Update image references
3. Apply the configuration:

```bash
helm upgrade --install monitored-app idlefy-universal/idlefy-universal -f values.yaml
```

## Monitoring Features

### Basic Monitoring
- Automatic ServiceMonitor creation
- Standard metrics endpoint
- Default scraping configuration

### Advanced Monitoring
- Multiple metric endpoints
- Custom scraping intervals
- Metric relabeling
- Label management

### Batch Job Monitoring
- Pushgateway integration
- Lifecycle hooks for metric pushing
- Temporary metric storage

### Multi-container Monitoring
- Different metric endpoints per container
- Varied scraping configurations
- Container-specific targeting

## Best Practices

1. **Port Naming**:
   - Use `http-metrics` for standard metric ports
   - Prometheus Operator will automatically detect these ports

2. **Intervals**:
   - Use shorter intervals (15s) for critical metrics
   - Use longer intervals (30s+) for less critical or resource-intensive metrics

3. **Labels**:
   - Ensure proper `prometheus` label for ServiceMonitor discovery
   - Use relabeling to maintain consistent label schemas

4. **Resource Management**:
   - Consider the impact of scraping on your application
   - Adjust scraping intervals based on resource usage

5. **Metric Filtering**:
   - Use metricRelabelings to drop unnecessary metrics
   - Keep metric cardinality under control

## Common Patterns

### Standard Web Application
```yaml
deployments:
  web-app:
    autoCreateServiceMonitor: true
    containers:
      main:
        ports:
          http-metrics:
            containerPort: 9090
    serviceMonitor:
      path: /metrics
      interval: 15s
```

### High-Load Application
```yaml
deployments:
  high-load-app:
    autoCreateServiceMonitor: true
    containers:
      main:
        ports:
          metrics:
            containerPort: 9090
    serviceMonitor:
      endpoints:
        - port: metrics
          interval: 30s
          scrapeTimeout: 15s
          metricRelabelings:
            - sourceLabels: [__name__]
              regex: 'go_gc_.*'
              action: keep
```

### Database with Exporter
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