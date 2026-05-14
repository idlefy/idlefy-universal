# 🔄 Database Migrations

This guide explains how to handle database migrations using the idlefy-universal chart.

## 📑 Table of Contents
- [Overview](#overview)
- [Basic Configuration](#basic-configuration)
- [Advanced Configuration](#advanced-configuration)
- [Best Practices](#best-practices)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

## 🔍 Overview

The chart provides built-in support for database migrations through:
- Pre-deployment migration jobs
- Shared configuration and secrets
- Container reuse
- Failure handling
- Multiple migration steps

## 🚀 Basic Configuration

<details>
<summary>Simple Migration Setup</summary>

```yaml
deployments:
  my-app:
    # Enable migrations
    migrations:
      enabled: true
      args:
        - "migrate"
        - "up"
      backoffLimit: 3    # Number of retries
    
    # Main application configuration
    containers:
      main:
        image: my-app
        imageTag: v1.0.0
        env:
          - name: DB_HOST
            value: postgresql
          - name: DB_NAME
            value: myapp
          - name: DB_USER
            valueFrom:
              secretKeyRef:
                name: db-secrets
                key: DB_USER
```
</details>

<details>
<summary>Complete Migration Example</summary>

```yaml
configs:
  db-secrets:
    type: secret
    data:
      DB_PASSWORD: your-db-password
      DB_USER: your-db-user

deployments:
  my-app:
    # Migration configuration
    migrations:
      enabled: true
      args: ["migrate", "up"]
      backoffLimit: 3
    
    # Main application
    containers:
      main:
        image: my-app
        imageTag: v1.0.0
        env:
          - name: DB_HOST
            value: postgresql
          - name: DB_NAME
            value: myapp
        # Use shared secrets
        envFrom:
          - type: secret
            configName: db-secrets
        
        # Optional: specify migration command
        command:
          - "/app/my-app"
```
</details>

## ⚙️ Advanced Configuration

### Multiple Migration Steps

<details>
<summary>Multi-step Migration Configuration</summary>

```yaml
deployments:
  my-app:
    migrations:
      enabled: true
      steps:
        - name: schema
          args: ["migrate", "schema"]
          backoffLimit: 2
        - name: data
          args: ["migrate", "data"]
          backoffLimit: 3
```
</details>

### Custom Environment for Migrations

<details>
<summary>Migration-specific Environment Variables</summary>

```yaml
deployments:
  my-app:
    migrations:
      enabled: true
      args: ["migrate", "up"]
      env:
        - name: MIGRATION_TIMEOUT
          value: "300"
        - name: MIGRATION_LOCK_TIMEOUT
          value: "60"
```
</details>

### Migration with Dependencies

<details>
<summary>Waiting for Dependencies</summary>

```yaml
deployments:
  my-app:
    migrations:
      enabled: true
      args: ["migrate", "up"]
      initContainers:
        - name: wait-for-db
          image: alpine
          command: 
            - sh 
            - -c
            - |
              until nc -z postgresql 5432; do
                echo "waiting for db"
                sleep 1
              done
```
</details>

## 💡 Best Practices

### 1. Error Handling
- Set appropriate `backoffLimit`
- Use initialization containers
- Monitor migration logs
- Implement retry logic

### 2. Security
- Use secrets for credentials
- Consider read-only filesystem
- Limit permissions
- Use secure connections

### 3. Performance
- Optimize migration scripts
- Use appropriate resource limits
- Consider database load
- Implement timeouts

### 4. Operations
- Keep migrations idempotent
- Version control migrations
- Plan for rollbacks
- Document changes

## 🔄 Common Patterns

### Simple Migration

<details>
<summary>Basic Migration Job</summary>

```yaml
migrations:
  enabled: true
  args: ["migrate", "up"]
  backoffLimit: 3
```
</details>

### Complex Migration

<details>
<summary>Advanced Migration Setup</summary>

```yaml
migrations:
  enabled: true
  args: ["migrate", "up"]
  backoffLimit: 3
  env:
    - name: MIGRATION_TIMEOUT
      value: "300"
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi
```
</details>

### Migration with Health Check

<details>
<summary>Health Check Configuration</summary>

```yaml
migrations:
  enabled: true
  args: ["migrate", "up"]
  initContainers:
    - name: db-ready
      image: alpine
      command: 
        - sh 
        - -c
        - |
          until nc -z postgresql 5432; do
            echo "waiting for db"
            sleep 1
          done
```
</details>

## 🔍 Troubleshooting

### Common Issues

<details>
<summary>Migration Failures</summary>

1. **Database Connectivity**
   - Check network connectivity
   - Verify credentials
   - Check database status

2. **Timeout Issues**
   - Increase job timeout
   - Check database performance
   - Monitor resource usage

3. **Lock Conflicts**
   - Implement lock timeout
   - Check concurrent migrations
   - Review database locks
</details>

### Debugging

<details>
<summary>Debug Commands</summary>

View migration logs:
```bash
kubectl logs job/my-app-migrations -n my-namespace
```

Check job status:
```bash
kubectl describe job/my-app-migrations -n my-namespace
```

Check pod events:
```bash
kubectl get events -n my-namespace --sort-by='.lastTimestamp'
```
</details>

## 🔒 Security Considerations

### 1. Credentials Management
- Use Kubernetes secrets
- Rotate credentials regularly
- Limit access permissions
- Use secure environment variables

### 2. Network Security
- Use network policies
- Secure database connections
- Consider VPC security
- Enable SSL/TLS

### 3. Audit and Monitoring
- Log migration operations
- Track schema changes
- Monitor access patterns
- Set up alerts for failures

### 4. Role-Based Access Control (RBAC)

<details>
<summary>RBAC Configuration</summary>

```yaml
deployments:
  my-app:
    autoCreateServiceAccount: true
    serviceAccount:
      annotations: {}
    migrations:
      enabled: true
      serviceAccount:
        create: true
        annotations:
          eks.amazonaws.com/role-arn: "arn:aws:iam::123456789012:role/migration-role"
```
</details>

## 📝 Real-World Examples

### Full Application Stack

<details>
<summary>Complete Application with Migrations</summary>

```yaml
# Database secrets
configs:
  db-secrets:
    type: secret
    data:
      DB_PASSWORD: "your-password"
      DB_USER: "your-username"

# Main application with migrations
deployments:
  app:
    migrations:
      enabled: true
      args: ["migrate", "up"]
      backoffLimit: 3
      initContainers:
        - name: db-ready
          image: alpine
          command: ["sh", "-c", "until nc -z postgresql 5432; do sleep 1; done"]
    
    containers:
      main:
        image: my-app
        imageTag: v1.0.0
        env:
          - name: DB_HOST
            value: postgresql
          - name: DB_NAME
            value: myapp
        envFrom:
          - type: secret
            configName: db-secrets

  # PostgreSQL database
  postgresql:
    containers:
      main:
        image: postgres:14-alpine
        env:
          - name: POSTGRES_DB
            value: myapp
        envFrom:
          - type: secret
            configName: db-secrets
        volumeMounts:
          - name: data
            mountPath: /var/lib/postgresql/data
    volumes:
      - name: data
        persistentVolumeClaim:
          claimName: postgresql-data

# Storage configuration
persistentVolumeClaims:
  postgresql-data:
    accessModes:
      - ReadWriteOnce
    size: 10Gi
```
</details>