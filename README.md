# 🚀 Idlefy Universal Helm Chart

> Universal Helm chart for deploying any type of application to Kubernetes with batteries included

> ⚠️ **IMPORTANT: DEVELOPMENT STATUS** ⚠️
> 
> This Helm chart is currently under active development. Backward compatibility between versions is not guaranteed. For production use, we recommend creating a fork of this chart to ensure stability. Please be aware that breaking changes may occur between releases.

[![Helm Version](https://img.shields.io/badge/helm-v3-blue)](https://helm.sh)
[![Kubernetes Version](https://img.shields.io/badge/kubernetes-%3E%3D%201.19-blue)](https://kubernetes.io)
[![License](https://img.shields.io/badge/license-Apache%202.0-green)](LICENSE)

## Table of Contents
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Validating your values](#-validating-your-values)
- [Chart Structure](#chart-structure)
- [Configuration Reference](#configuration-reference)
- [Auto-creation Features](#auto-creation-features)
- [Advanced Features](#advanced-features)
- [Documentation](#documentation)

## ✨ Features

- 📦 **Resource Types**: Deployments, CronJobs, Jobs, Services, Ingresses, HTTPRoutes (Gateway API), ConfigMaps/Secrets, PVCs
- 🤖 **Auto-creation**: Automatic creation of associated resources
- 📊 **Monitoring**: Native Prometheus support via ServiceMonitors
- 🔒 **Security**: SSL certificate management via cert-manager
- 🔄 **CI/CD**: Native Werf support
- 🛠️ **Multi-container**: Support for sidecar patterns
- ⚙️ **Configuration**: Flexible environment and secret management
- 🎯 **Validation**: Built-in configuration validation

## 📋 Prerequisites

- Kubernetes 1.19+
- **Helm 3.6+** (required for the typed schema's `if/then/else` cross-field rules)
- cert-manager (optional, for SSL certificates)
- Prometheus Operator (optional, for monitoring)

## 🚀 Quick Start

1. Add the Helm repository:
```bash
helm repo add idlefy-universal https://idlefy.github.io/idlefy-universal
helm repo update
```

2. Create a basic values.yaml:
```yaml
deployments:
  my-app:
    replicas: 2
    autoCreateService: true
    autoCreateIngress: true
    containers:
      main:
        image: my-app
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 8080
```

3. Install the chart:
```bash
helm install my-release idlefy-universal/idlefy-universal -f values.yaml
```

## ✅ Validating your values

The chart ships with a strict JSON Schema. To validate `my-values.yaml`
before deploying:

```bash
helm lint ./path/to/idlefy-universal -f my-values.yaml
```

Validation runs automatically on `helm install`, `helm upgrade`, and
`helm template`. Errors include a JSON Pointer path to the failing field.

See [docs/values-reference.md](docs/values-reference.md) for the full,
auto-generated field reference.

## 📑 Chart Structure

<details>
<summary>Full Chart Structure</summary>

```yaml
# Global deployment settings
deploymentsGeneral:
  securityContext: {}      # Pod security context
  nodeSelector: {}         # Node selection constraints
  tolerations: []         # Pod tolerations
  affinity: {}            # Pod affinity rules
  probes: {}              # Default probe configurations
  lifecycle: {}           # Default lifecycle hooks
  autoCreateServiceMonitor: false  # Enable ServiceMonitor creation
  autoCreateSoftAntiAffinity: false  # Enable soft anti-affinity

# Generic settings
generic:
  extraImagePullSecrets: []  # Global image pull secrets for all deployments, jobs, and cronjobs
  ingressesGeneral: {}       # Global ingress configurations
  httpRoutesGeneral: {}      # Global HTTPRoute (Gateway API) configurations
  serviceMonitorGeneral: {}  # Global ServiceMonitor settings

# Deployments
deployments:
  deployment-name:
    replicas: 1           # Number of pod replicas
    containers:           # Container configurations
      container-name:
        image: nginx      # Container image
        imageTag: latest  # Image tag
        ports:           # Container ports
          portName:
            containerPort: 80
            protocol: TCP
        resources: {}     # Resource requests and limits
        probes: {}       # Container probes
        env: []          # Environment variables (supports Go template)
        envFrom: []      # Environment from ConfigMaps/Secrets
        volumeMounts: [] # Volume mounts
        lifecycle: {}    # Container lifecycle hooks
        command: []      # Container command
        args: []         # Command arguments
        securityContext: {} # Container security context
    
    # Deployment features
    autoCreateService: false        # Create Service automatically
    autoCreateIngress: false        # Create Ingress automatically
    autoCreateHttpRoute: false      # Create HTTPRoute (Gateway API) automatically
    autoCreateServiceMonitor: false # Create ServiceMonitor
    autoCreatePdb: false           # Create PDB
    autoCreateCertificate: false   # Create Certificate
    autoCreateServiceAccount: false # Create ServiceAccount
    autoCreateSoftAntiAffinity: false # Enable soft anti-affinity
    
    # Additional configurations
    serviceType: ClusterIP    # Service type when autoCreateService is true
    ingress: {}              # Ingress configuration
    httpRoute: {}            # HTTPRoute configuration (Gateway API)
    certificate: {}          # Certificate configuration
    serviceMonitor: {}       # ServiceMonitor configuration
    pdbConfig: {}           # PDB configuration
    serviceAccount: {}       # ServiceAccount configuration
    
    # Scaling and availability
    hpa:                     # HPA configuration
      minReplicas: 1
      maxReplicas: 10
      metrics: []
    
    # Database migrations
    migrations:
      enabled: false
      args: []
      backoffLimit: 1
    
    # Resources
    volumes: []             # Pod volumes
    nodeSelector: {}        # Node selection
    tolerations: []        # Pod tolerations
    affinity: {}           # Pod affinity rules
    annotations: {}        # Deployment annotations
    podAnnotations: {}     # Pod annotations

# CronJobs
cronJobs:
  cronjob-name:
    schedule: "* * * * *"
    timezone: ""
    successfulJobsHistoryLimit: 3
    failedJobsHistoryLimit: 1
    concurrencyPolicy: Allow
    containers: {}     # Same structure as deployment containers
    volumes: []
    nodeSelector: {}
    tolerations: []
    affinity: {}

# One-time Jobs
jobs:
  job-name:
    activeDeadlineSeconds: null
    backoffLimit: 6
    containers: {}     # Same structure as deployment containers
    volumes: []
    nodeSelector: {}
    tolerations: []
    affinity: {}

# Configurations
configs:
  config-name:
    type: configMap    # or "secret"
    data: {}          # Key-value pairs

# Standalone Services
services:
  service-name:
    type: ClusterIP
    ports:
      - name: http
        port: 80
        targetPort: 80
        protocol: TCP

# PersistentVolumeClaims
persistentVolumeClaims:
  pvc-name:
    accessModes: []
    storageClassName: ""
    size: 1Gi

# Standalone Ingresses
ingresses:
  ingress-name:
    annotations: {}
    ingressClassName: ""
    tls: []
    hosts: []

# Standalone HTTPRoutes (Gateway API)
httpRoutes:
  route-name:
    parentRefs: []           # Gateway references (or set globally)
    hostnames: []            # Hostnames (host or subdomain)
    rules: []                # Routing rules with matches and backendRefs
    annotations: {}
    labels: {}
```
</details>

## 🌟 Key Features Explained

### 🔄 Auto-creation Features

The chart can automatically create associated resources based on your configuration:

| Feature | Description | Activation |
|---------|-------------|------------|
| Service | Creates Service based on container ports | `autoCreateService: true` |
| Ingress | Creates Ingress with optional SSL | `autoCreateIngress: true` |
| HTTPRoute | Creates Gateway API HTTPRoute | `autoCreateHttpRoute: true` |
| Certificate | Manages SSL certificates via cert-manager | `autoCreateCertificate: true` |
| ServiceMonitor | Creates Prometheus ServiceMonitor | `autoCreateServiceMonitor: true` |
| PDB | Creates PodDisruptionBudget | `autoCreatePdb: true` |
| ServiceAccount | Creates dedicated ServiceAccount | `autoCreateServiceAccount: true` |

### 🔐 Secret Management

Advanced secret management with secret references:

```yaml
secretRefs:
  shared-secrets:
    - name: API_KEY
      secretKeyRef:
        name: app-secrets
        key: api-key

deployments:
  my-app:
    containers:
      main:
        secretRefs:
          - shared-secrets  # Reference shared secrets
```

#### Please look at the [werf website](https://werf.io/docs/latest/usage/deploy/values.html#secret-parameters-werf-only) for a safe way to store secrets in the git. And our [integration guide](docs/werf-integration.md)

### 📊 Monitoring Integration

Native Prometheus monitoring support:

```yaml
deployments:
  my-app:
    autoCreateServiceMonitor: true
    containers:
      main:
        ports:
          http-metrics:
            containerPort: 9090
```

### 🔄 Database Migrations

Built-in support for database migrations:

```yaml
deployments:
  my-app:
    migrations:
      enabled: true
      args: ["migrate", "up"]
```

### 🎨 Go Template Support

The chart supports Go template expressions in various fields for dynamic values:

```yaml
deployments:
  my-app:
    containers:
      main:
        image: '{{ .Values.global.registry }}/my-app'
        imageTag: '{{ .Chart.Version }}'
        env:
          - name: BUILD_TIME
            value: '{{ now | unixEpoch }}'
          - name: RELEASE_NAME  
            value: '{{ .Release.Name }}'
```

Supported in: `image`, `imageTag`, and `env` values.

## 📚 Documentation

Detailed documentation is available in the [docs](docs) directory:

- [Values Reference (auto-generated)](docs/values-reference.md)
- [Getting Started](docs/getting-started.md)
- [Auto-creation Features](docs/auto-creation.md)
- [Monitoring](docs/monitoring.md)
- [Database Migrations](docs/database-migrations.md)
- [Advanced Features](docs/advanced-features.md)
- [FAQ](docs/faq.md)

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md).

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Special thanks to the Kubernetes and Helm communities for inspiration and best practices.