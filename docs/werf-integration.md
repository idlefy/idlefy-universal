# 🔄 Werf Integration

This guide explains how to integrate the idlefy-universal chart with [werf](https://werf.io) for CI/CD and secure secret management.

## 📑 Table of Contents
- [Overview](#overview)
- [Secret Management](#secret-management)
- [Setup](#setup)
- [Configuration Examples](#configuration-examples)

## 🔍 Overview

[Werf](https://werf.io) is a delivery tool that helps you implement CI/CD for your applications. It provides powerful features for:
- Building and publishing container images
- Deploying applications to Kubernetes
- Managing secrets securely in Git
- Seamless CI/CD integration

## 🔒 Secret Management

Werf is the recommended way to store secrets in Git when using this chart. It provides secure encryption mechanisms that allow you to safely commit sensitive data to your repository.

For detailed information about working with secrets in werf, please refer to:
- [Working with secret parameter files](https://werf.io/docs/latest/usage/deploy/values.html#working-with-secret-parameter-files)
- [Secret management guide](https://werf.io/documentation/v1.2/advanced/secret.html)

## ⚙️ Setup

### 1. Chart Dependencies

Add idlefy-universal as a dependency in your `Chart.yaml`:

```yaml
apiVersion: v2
dependencies:
  - name: idlefy-universal
    version: "v0.2.9"
    repository: https://idlefy.github.io/idlefy-universal
    export-values:
      - parent: werf
        child: werf
```

### 2. Update Dependencies
```bash
cd .helm
werf helm dependency update
```

## 📝 Configuration Examples

### Single Image Application

```yaml
# werf.yaml
project: simple-app
configVersion: 1
image: app
  dockerfile: Dockerfile

# values.yaml
idlefy-universal:
  deployments:
    web:
      containers:
        main:
          image: "{{ $.Values.werf.repo }}"
          imageTag: "{{ $.Values.werf.tag.app }}"
```

### Multi-image Application

```yaml
# werf.yaml
project: my-project
configVersion: 1
image: app
  dockerfile: Dockerfile
---
image: worker
  dockerfile: Dockerfile.worker

# values.yaml
idlefy-universal:
  deployments:
    app:
      containers:
        main:
          image: "{{ $.Values.werf.repo }}"
          imageTag: "{{ $.Values.werf.tag.app }}"

    worker:
      containers:
        main:
          image: "{{ $.Values.werf.repo }}"
          imageTag: "{{ $.Values.werf.tag.worker }}"
```

### Using Secrets

> **Important**: For storing sensitive data, we support two recommended approaches: werf's built-in secret management and SOPS. See [werf's documentation](https://werf.io/docs/latest/usage/deploy/values.html#working-with-secret-parameter-files) or [SOPS](https://github.com/getsops/sops) for detailed instructions.

### Secret Management Options

#### Using Werf Secret Management
Werf provides built-in functionality for managing secrets:
```bash
# Encrypt sensitive data
werf helm secret values edit .helm/secret-values.yaml
```

#### Using SOPS
[SOPS](https://github.com/getsops/sops) is a popular tool for encrypting files that supports various key management systems:

```bash
# Initialize SOPS with age
age-keygen -o key.txt
export SOPS_AGE_KEY_FILE=key.txt

# Create and encrypt secrets file
sops -e -i values.secrets.yaml

# Edit encrypted secrets
sops values.secrets.yaml

# Use with helm
helm upgrade my-release idlefy-universal/idlefy-universal \
  -f values.yaml \
  -f <(sops -d values.secrets.yaml)
```

Both approaches are well-supported and you can choose the one that better fits your workflow.

Example of encrypting secrets with werf:

```bash
# Encrypt sensitive data
werf helm secret values edit .helm/secret-values.yaml

# Using encrypted values in your configuration
idlefy-universal:
  configs:
    app-secrets:
      type: secret
      data: {{ $.Values.app.secrets | toYaml | nindent 8 }}
```

For more information about werf and its features, please visit [werf.io](https://werf.io).