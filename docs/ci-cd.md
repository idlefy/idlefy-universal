# 🚀 CI/CD and Values Management

This guide explains how to effectively use the idlefy-universal chart in CI/CD pipelines and manage values across different environments.

## 📑 Table of Contents
- [Values Management](#values-management)
- [CI/CD Setup](#ci-cd-setup)
- [Best Practices](#best-practices)
- [Examples](#examples)

## 📊 Values Management

### Values Structure

Recommended values file organization:
```plaintext
/
├── values.yaml           # Base configuration
├── values.dev.yaml       # Development overrides
├── values.staging.yaml   # Staging overrides
├── values.prod.yaml      # Production overrides
└── secret-values.yaml    # Secret values
```

### Base Configuration (values.yaml)

<details>
<summary>Base Configuration Example</summary>

```yaml
# values.yaml
deploymentsGeneral:
  securityContext:
    runAsNonRoot: true
  probes:
    livenessProbe:
      httpGet:
        path: /health
        port: http

deployments:
  backend:
    replicas: 2
    containers:
      main:
        image: my-app
        imageTag: v1.0.0
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
```
</details>

### Environment Overrides

<details>
<summary>Environment-specific Configurations</summary>

```yaml
# values.dev.yaml
generic:
  ingressesGeneral:
    domain: dev.example.com

deployments:
  backend:
    replicas: 1  # Reduce replicas for dev
    containers:
      main:
        resources:
          requests:
            cpu: 50m
            memory: 64Mi

# values.prod.yaml
generic:
  ingressesGeneral:
    domain: example.com

deployments:
  backend:
    replicas: 3  # More replicas for production
    hpa:
      minReplicas: 3
      maxReplicas: 10
    containers:
      main:
        resources:
          requests:
            cpu: 200m
            memory: 256Mi
```
</details>

## 🛠️ CI/CD Setup

### GitHub Actions

<details>
<summary>Basic GitHub Actions Workflow</summary>

```yaml
# .github/workflows/deploy.yml
name: Deploy with Helm

on:
  push:
    branches: [ main ]
    paths-ignore:
      - 'docs/**'
      - '**.md'

env:
  ENVIRONMENT: production

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Helm
        uses: azure/setup-helm@v3
        
      - name: Add idlefy-universal repo
        run: |
          helm repo add idlefy-universal https://idlefy.github.io/idlefy-universal
          helm repo update
          
      - name: Deploy
        run: |
          helm upgrade --install my-release idlefy-universal/idlefy-universal \
            -f values.yaml \
            -f values.${{ env.ENVIRONMENT }}.yaml \
            --namespace my-namespace \
            --create-namespace \
            --atomic \
            --timeout 5m
```
</details>

### Advanced Multi-environment Setup

<details>
<summary>Multi-environment Workflow</summary>

```yaml
# .github/workflows/deploy.yml
name: Deploy with Helm

on:
  push:
    branches:
      - main
      - develop
  pull_request:
    branches: [ develop ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        include:
          - branch: main
            environment: production
            values_file: values.prod.yaml
          - branch: develop
            environment: staging
            values_file: values.staging.yaml
    
    environment:
      name: ${{ matrix.environment }}
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Helm
        uses: azure/setup-helm@v3
      
      - name: Add idlefy-universal repo
        run: |
          helm repo add idlefy-universal https://idlefy.github.io/idlefy-universal
          helm repo update
      
      - name: Validate Helm Chart
        run: |
          helm template my-release idlefy-universal/idlefy-universal \
            -f values.yaml \
            -f ${{ matrix.values_file }} \
            --namespace ${{ matrix.environment }}
      
      - name: Deploy
        if: github.event_name == 'push'
        run: |
          helm upgrade --install my-release idlefy-universal/idlefy-universal \
            -f values.yaml \
            -f ${{ matrix.values_file }} \
            --namespace ${{ matrix.environment }} \
            --create-namespace \
            --atomic \
            --timeout 5m
```
</details>

### GitLab CI

<details>
<summary>GitLab CI Pipeline</summary>

```yaml
# .gitlab-ci.yml
variables:
  HELM_VERSION: v3.12.0

.helm_deploy:
  before_script:
    - curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
    - helm repo add idlefy-universal https://idlefy.github.io/idlefy-universal
    - helm repo update

deploy_staging:
  extends: .helm_deploy
  script:
    - helm upgrade --install my-app idlefy-universal/idlefy-universal
      -f values.yaml
      -f values.staging.yaml
      --namespace staging
      --atomic
      --timeout 5m
  environment:
    name: staging

deploy_production:
  extends: .helm_deploy
  script:
    - helm upgrade --install my-app idlefy-universal/idlefy-universal
      -f values.yaml
      -f values.prod.yaml
      --namespace production
      --atomic
      --timeout 5m
  environment:
    name: production
  rules:
    - if: $CI_COMMIT_TAG
```
</details>

## 💡 Best Practices

### 1. Values Organization

- Keep common configuration in `values.yaml`
- Use environment-specific files for overrides
- Store sensitive data separately
- Use clear naming conventions

### 2. Environment Management

- Use separate namespaces for environments
- Configure resource limits appropriately
- Adjust replica counts per environment
- Set appropriate domain names

### 3. CI/CD Pipeline

- Validate templates before deployment
- Use atomic deployments
- Set appropriate timeouts
- Include rollback strategies
- Add proper health checks

### 4. Security

- Keep secrets in a separate file
- Use environment variables for sensitive data
- Implement proper RBAC
- Configure network policies per environment

## 📝 Examples

### Feature Branch Testing

<details>
<summary>Feature Branch Workflow</summary>

```yaml
# .github/workflows/feature.yml
name: Test Feature Branch

on:
  pull_request:
    branches: [ develop ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Helm
        uses: azure/setup-helm@v3
      
      - name: Deploy to feature namespace
        run: |
          NAMESPACE="feature-${GITHUB_HEAD_REF}"
          helm upgrade --install my-app idlefy-universal/idlefy-universal \
            -f values.yaml \
            -f values.dev.yaml \
            --set global.environment=feature \
            --namespace $NAMESPACE \
            --create-namespace
```
</details>

### Production Deployment

<details>
<summary>Production Deployment Workflow</summary>

```yaml
# .github/workflows/production.yml
name: Production Deploy

on:
  release:
    types: [published]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Helm
        uses: azure/setup-helm@v3
      
      - name: Deploy to production
        run: |
          helm upgrade --install my-app idlefy-universal/idlefy-universal \
            -f values.yaml \
            -f values.prod.yaml \
            --set global.environment=production \
            --namespace production \
            --atomic \
            --timeout 10m
```
</details>

### Canary Deployment

<details>
<summary>Canary Deployment Configuration</summary>

```yaml
# values.yaml
deployments:
  app-stable:
    replicas: 9
    containers:
      main:
        image: my-app
        imageTag: v1.0.0

  app-canary:
    replicas: 1
    containers:
      main:
        image: my-app
        imageTag: v1.1.0
```
</details>

## 🔍 Validation and Testing

### Pre-deployment Validation

<details>
<summary>Validation Steps</summary>

```bash
# Template validation
helm template my-app idlefy-universal/idlefy-universal -f values.yaml

# Lint check
helm lint .

# Dry run
helm upgrade --install my-app idlefy-universal/idlefy-universal \
  -f values.yaml \
  --dry-run
```
</details>

### Post-deployment Verification

<details>
<summary>Verification Steps</summary>

```bash
# Check deployment status
kubectl get deployments -n my-namespace

# View logs
kubectl logs -l app.kubernetes.io/instance=my-app -n my-namespace

# Check resources
kubectl get all,ing,pvc -l app.kubernetes.io/instance=my-app -n my-namespace
```
</details>