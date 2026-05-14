# 🛠️ Advanced Features

This guide covers advanced features and patterns available in the idlefy-universal chart.

## 📑 Table of Contents
- [Values Inheritance](#values-inheritance)
- [Complex Deployments](#complex-deployments)
- [Advanced Scheduling](#advanced-scheduling)
- [Security Features](#security-features)
  - [Service Account Configuration](#service-account-configuration)
  - [Pod Security Context](#pod-security-context)
  - [Network Policies](#network-policies)
- [Resource Management](#resource-management)
- [Advanced Networking](#advanced-networking)
  - [HTTPRoute (Gateway API)](#httproute-gateway-api)

## 🔄 Values Inheritance

<details>
<summary>Values Inheritance Configuration</summary>

```yaml
# Global settings
deploymentsGeneral:
  securityContext:
    runAsNonRoot: true
  priorityClassName: system-cluster-critical
  probes:
    livenessProbe:
      httpGet:
        path: /health
        port: http

# Generic settings
generic:
  ingressesGeneral:
    domain: example.com
    annotations:
      nginx.ingress.kubernetes.io/proxy-body-size: "10m"

# Specific deployment (inherits and overrides)
deployments:
  my-app:
    # Inherits global securityContext
    containers:
      main:
        # Override specific probe
        probes:
          livenessProbe:
            httpGet:
              path: /custom-health
```
</details>

## 📦 Complex Deployments

### Multi-container Pods

<details>
<summary>Multi-container Configuration</summary>

```yaml
deployments:
  complex-app:
    containers:
      main:
        image: main-app
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 8080
      
      # Sidecar containers
      cache:
        image: redis
        imageTag: "6.2"
        ports:
          redis:
            containerPort: 6379
        volumeMounts:
          - name: cache-data
            mountPath: /data
      
      # Metrics sidecar
      metrics:
        image: prometheus-exporter
        imageTag: v1.0.0
        ports:
          metrics:
            containerPort: 9090
        
    volumes:
      - name: cache-data
        emptyDir: {}
```
</details>

### Advanced Init Containers

<details>
<summary>Init Containers Configuration</summary>

```yaml
deployments:
  my-app:
    initContainers:
      setup:
        image: busybox
        command: ['sh', '-c', 'setup-script.sh']
        env:
          - name: SETUP_VAR
            value: "value"
        volumeMounts:
          - name: config
            mountPath: /config
      
      wait-for-deps:
        image: alpine
        command: 
          - '/bin/sh'
          - '-c'
          - |
            until nc -z service-name 5432; do
              echo "waiting for dependency"
              sleep 2
            done
```
</details>

## 🎯 Advanced Scheduling

### Node Affinity

<details>
<summary>Node Affinity Configuration</summary>

```yaml
deployments:
  my-app:
    affinity:
      nodeAffinity:
        requiredDuringSchedulingIgnoredDuringExecution:
          nodeSelectorTerms:
            - matchExpressions:
                - key: kubernetes.io/instance-type
                  operator: In
                  values:
                    - m5.large
                    - m5.xlarge

      podAntiAffinity:
        preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchLabels:
                  app.kubernetes.io/name: my-app
              topologyKey: kubernetes.io/hostname
```
</details>

### Topology Spread Constraints

<details>
<summary>Topology Spread Configuration</summary>

```yaml
deployments:
  my-app:
    topologySpreadConstraints:
      - maxSkew: 1
        topologyKey: topology.kubernetes.io/zone
        whenUnsatisfiable: ScheduleAnyway
        labelSelector:
          matchLabels:
            app.kubernetes.io/name: my-app
```
</details>

## 🔒 Security Features

### Service Account Configuration

<details>
<summary>Custom ServiceAccount Name Configuration</summary>

You can configure custom ServiceAccount names at two levels:

**Global Configuration** - applies to all deployments, jobs, and cronjobs:
```yaml
generic:
  serviceAccountName: global-service-account
```

**Per-Resource Configuration** - overrides global setting for specific resources:
```yaml
deployments:
  my-app:
    serviceAccountName: my-app-sa
    containers:
      main:
        image: my-app
        imageTag: v1.0.0

jobs:
  db-migration:
    serviceAccountName: migration-sa
    containers:
      main:
        image: migration-tool
        imageTag: v1.0.0

cronJobs:
  backup:
    schedule: "0 2 * * *"
    serviceAccountName: backup-sa
    containers:
      main:
        image: backup-tool
        imageTag: v1.0.0
```

**Priority Order:**
1. Per-resource `serviceAccountName` (highest priority)
2. Global `generic.serviceAccountName`
3. Resource name (default, only when `autoCreateServiceAccount` or `serviceAccount` is enabled)

**Note:** Setting `serviceAccountName` allows you to use an existing ServiceAccount without creating a new one. If you want the chart to create a ServiceAccount for you, use `autoCreateServiceAccount: true` instead.
</details>

### Pod Security Context

<details>
<summary>Security Context Configuration</summary>

```yaml
deployments:
  secure-app:
    securityContext:
      runAsUser: 1000
      runAsGroup: 3000
      fsGroup: 2000
      runAsNonRoot: true
      seccompProfile:
        type: RuntimeDefault

    # Priority class for critical workloads
    priorityClassName: high-priority

    containers:
      main:
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
              - ALL
```
</details>

### Network Policies

<details>
<summary>Network Policy Configuration</summary>

```yaml
networkPolicies:
  app:
    spec:
      podSelector:
        matchLabels:
          app.kubernetes.io/name: my-app
      policyTypes:
        - Ingress
        - Egress
      ingress:
        - from:
            - podSelector:
                matchLabels:
                  app.kubernetes.io/name: frontend
      egress:
        - to:
            - podSelector:
                matchLabels:
                  app.kubernetes.io/name: database
```
</details>

## 📊 Resource Management

### Advanced HPA Configuration

<details>
<summary>HPA with Custom Metrics</summary>

```yaml
deployments:
  my-app:
    hpa:
      minReplicas: 2
      maxReplicas: 10
      metrics:
        - type: Resource
          resource:
            name: cpu
            target:
              type: Utilization
              averageUtilization: 80
        - type: Resource
          resource:
            name: memory
            target:
              type: AverageValue
              averageValue: 500Mi
      behavior:
        scaleUp:
          stabilizationWindowSeconds: 300
          policies:
            - type: Percent
              value: 100
              periodSeconds: 15
        scaleDown:
          stabilizationWindowSeconds: 300
          policies:
            - type: Percent
              value: 50
              periodSeconds: 60
```
</details>

### Resource Quotas

<details>
<summary>Resource Quota Configuration</summary>

```yaml
resourceQuotas:
  app-quota:
    hard:
      requests.cpu: "4"
      requests.memory: 8Gi
      limits.cpu: "8"
      limits.memory: 16Gi
```
</details>

## 🌐 Advanced Networking

### Ingress Path Rules

<details>
<summary>Advanced Ingress Configuration</summary>

```yaml
deployments:
  my-app:
    autoCreateIngress: true
    ingress:
      annotations:
        nginx.ingress.kubernetes.io/rewrite-target: /$2
      hosts:
        - host: api.example.com
          paths:
            - path: /v1(/|$)(.*)
              pathType: Prefix
            - path: /v2(/|$)(.*)
              pathType: Prefix
```
</details>

### HTTPRoute (Gateway API)

<details>
<summary>HTTPRoute Configuration</summary>

Gateway API is the next-generation routing API for Kubernetes. Use HTTPRoute instead of Ingress when your cluster has a Gateway API controller (e.g., Cilium, Istio, Envoy Gateway).

```yaml
# Standalone HTTPRoute
generic:
  ingressesGeneral:
    domain: example.com
  httpRoutesGeneral:
    parentRefs:
      - name: shared-gateway
        namespace: gateway-system

httpRoutes:
  api:
    hostnames:
      - subdomain: api
    rules:
      - matches:
          - path:
              type: PathPrefix
              value: /v1
        backendRefs:
          - name: api-v1
            port: 8080
            weight: 90
          - name: api-v2
            port: 8080
            weight: 10
```

```yaml
# Auto-created HTTPRoute from deployment
deployments:
  my-app:
    autoCreateService: true
    autoCreateHttpRoute: true
    containers:
      main:
        image: my-app
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 8080
    httpRoute:
      hostnames:
        - subdomain: my-app
      rules:
        - matches:
            - path:
                type: PathPrefix
                value: /
```
</details>

### Custom Service Configuration

<details>
<summary>Advanced Service Configuration</summary>

```yaml
services:
  app-service:
    type: LoadBalancer
    annotations:
      service.beta.kubernetes.io/aws-load-balancer-type: nlb
    ports:
      - name: http
        port: 80
        targetPort: http
        protocol: TCP
      - name: https
        port: 443
        targetPort: https
        protocol: TCP
```
</details>

## 🔄 Advanced Use Cases

### Blue-Green Deployments

<details>
<summary>Blue-Green Configuration</summary>

```yaml
deployments:
  blue:
    replicas: 3
    containers:
      main:
        image: my-app
        imageTag: v1.0.0
  
  green:
    replicas: 0  # Start with 0 replicas
    containers:
      main:
        image: my-app
        imageTag: v2.0.0

services:
  app:
    type: ClusterIP
    selector:
      deployment: blue  # Switch to green for cutover
    ports:
      - name: http
        port: 80
        targetPort: http
```
</details>

### Canary Deployments

<details>
<summary>Canary Configuration</summary>

```yaml
deployments:
  stable:
    replicas: 9
    containers:
      main:
        image: my-app
        imageTag: v1.0.0
  
  canary:
    replicas: 1
    containers:
      main:
        image: my-app
        imageTag: v2.0.0
```
</details>

### Sidecar Patterns

<details>
<summary>Common Sidecar Patterns</summary>

```yaml
deployments:
  my-app:
    containers:
      main:
        image: my-app
        imageTag: v1.0.0
      
      # Logging sidecar
      logging:
        image: fluent-bit
        imageTag: v1.9.0
        volumeMounts:
          - name: logs
            mountPath: /var/log
      
      # Metrics sidecar
      metrics:
        image: prometheus-exporter
        imageTag: v1.0.0
        ports:
          metrics:
            containerPort: 9090
      
      # Cache sidecar
      cache:
        image: redis
        imageTag: "6.2"
        ports:
          redis:
            containerPort: 6379
    
    volumes:
      - name: logs
        emptyDir: {}
```
</details>

## 💡 Tips and Best Practices

1. **Resource Management**
   - Always specify resource requests and limits
   - Use HPA for dynamic scaling
   - Configure appropriate update strategies
   - Monitor resource usage

2. **Security**
   - Enable security contexts
   - Use non-root users
   - Implement network policies
   - Regular security audits

3. **Networking**
   - Use appropriate service types
   - Configure correct ingress paths
   - Implement proper health checks
   - Monitor network metrics

4. **High Availability**
   - Use pod anti-affinity
   - Configure appropriate update strategies
   - Implement proper health checks
   - Use PodDisruptionBudgets

## 🔍 Troubleshooting

For common issues and solutions, check our [FAQ](faq.md) and [Troubleshooting Guide](troubleshooting.md).