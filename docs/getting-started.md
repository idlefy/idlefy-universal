# 🚀 Getting Started with Idlefy Universal

This guide will help you understand the basic concepts of the idlefy-universal chart and get your first application deployed.

## 📑 Table of Contents
- [Basic Concepts](#basic-concepts)
- [Installation](#installation)
- [First Deployment](#first-deployment)
- [Common Patterns](#common-patterns)
- [Next Steps](#next-steps)

## 🎯 Basic Concepts

The idlefy-universal chart is built around several key concepts:

1. **Resource Types**
   - Deployments as the main application unit
   - Supporting resources (Services, Ingresses, etc.)
   - Configuration resources (ConfigMaps, Secrets)

2. **Auto-creation**
   - Automatic creation of dependent resources
   - Smart defaults based on container configuration

3. **Inheritance**
   - Global settings (`deploymentsGeneral`)
   - Generic settings (`generic`)
   - Resource-specific settings

## 🛠️ Installation

1. Add the Helm repository:
```bash
helm repo add idlefy-universal https://idlefy.github.io/idlefy-universal
helm repo update
```

2. Install the chart:
```bash
helm install my-release idlefy-universal/idlefy-universal -f values.yaml
```

## 📦 First Deployment

Let's create a simple web application deployment:

<details>
<summary>Basic Web Application</summary>

```yaml
# values.yaml
deployments:
  web-app:
    # Enable automatic resource creation
    autoCreateService: true
    autoCreateIngress: true
    
    # Container configuration
    containers:
      main:
        image: nginx
        imageTag: 1.21
        ports:
          http:
            containerPort: 80
        
        # Basic resource limits
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi
    
    # Ingress configuration
    ingress:
      hosts:
        - host: myapp.example.com
          paths:
            - path: /
              pathType: Prefix
```
</details>

<details>
<summary>Application with Database</summary>

```yaml
deployments:
  app:
    autoCreateService: true
    autoCreateIngress: true
    containers:
      main:
        image: my-app
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 8080
        env:
          - name: DB_HOST
            value: postgresql
          - name: DB_NAME
            value: myapp
          - name: DB_USER
            valueFrom:
              secretKeyRef:
                name: db-secrets
                key: username

  postgresql:
    autoCreateService: true
    containers:
      main:
        image: postgres
        imageTag: "14-alpine"
        ports:
          postgresql:
            containerPort: 5432
        env:
          - name: POSTGRES_DB
            value: myapp
          - name: POSTGRES_USER
            valueFrom:
              secretKeyRef:
                name: db-secrets
                key: username
          - name: POSTGRES_PASSWORD
            valueFrom:
              secretKeyRef:
                name: db-secrets
                key: password
        volumeMounts:
          - name: data
            mountPath: /var/lib/postgresql/data
    volumes:
      - name: data
        persistentVolumeClaim:
          claimName: postgresql-data

configs:
  db-secrets:
    type: secret
    data:
      username: your-username
      password: your-password

persistentVolumeClaims:
  postgresql-data:
    accessModes:
      - ReadWriteOnce
    size: 10Gi
```
</details>

## 🔄 Common Patterns

### Web Application
```yaml
deployments:
  web-app:
    autoCreateService: true
    autoCreateIngress: true
    containers:
      main:
        image: web-app
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 8080
```

### Web Application (Gateway API)
```yaml
deployments:
  web-app:
    autoCreateService: true
    autoCreateHttpRoute: true
    containers:
      main:
        image: web-app
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 8080
    httpRoute:
      hostnames:
        - subdomain: web-app
      rules:
        - matches:
            - path:
                type: PathPrefix
                value: /
```

### API Service
```yaml
deployments:
  api:
    autoCreateService: true
    autoCreateIngress: true
    autoCreateServiceMonitor: true
    containers:
      main:
        image: api-service
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 8080
          metrics:
            containerPort: 9090
```

### Worker Service
```yaml
deployments:
  worker:
    # No ingress or service needed
    replicas: 2
    containers:
      main:
        image: worker
        imageTag: v1.0.0
        # No ports needed
        resources:
          requests:
            cpu: 200m
            memory: 256Mi
```

## 💡 Tips and Best Practices

1. **Start Simple**
   - Begin with basic deployment configuration
   - Add features incrementally
   - Use auto-creation for common resources

2. **Resource Management**
   - Always specify resource requests and limits
   - Use appropriate replica counts
   - Consider using HPA for scaling

3. **Configuration**
   - Use `deploymentsGeneral` for shared settings
   - Keep environment-specific values separate
   - Use secrets for sensitive data

4. **Health Checks**
   - Configure appropriate probes
   - Set reasonable timeout values
   - Use startup probes for slow-starting applications

## 🔜 Next Steps

After getting familiar with basic deployment, you might want to explore:

1. [Auto-creation Features](auto-creation.md) - Learn about automatic resource creation
2. [Monitoring](monitoring.md) - Set up Prometheus monitoring
3. [Database Migrations](database-migrations.md) - Handle database operations
4. [Advanced Features](advanced-features.md) - Explore advanced capabilities

## 🔍 Validation and Debugging

To validate your values before applying:
```bash
helm template my-release idlefy-universal/idlefy-universal -f values.yaml
```

To check the status of your deployment:
```bash
kubectl get all -l app.kubernetes.io/instance=my-release
```

## 🆘 Common Issues and Solutions

<details>
<summary>Service not accessible</summary>

1. Check if service is created:
```bash
kubectl get svc
```

2. Verify endpoints:
```bash
kubectl get endpoints
```

3. Common solutions:
- Ensure `autoCreateService: true` is set
- Check container port configuration
- Verify pod labels match service selector
</details>

<details>
<summary>Ingress not working</summary>

1. Check ingress configuration:
```bash
kubectl get ingress
kubectl describe ingress <name>
```

2. Common solutions:
- Verify DNS configuration
- Check SSL certificate status if using HTTPS
- Ensure ingress controller is installed
</details>