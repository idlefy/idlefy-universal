# Microservices Architecture Example

This example demonstrates how to deploy a microservices-based application with:
- Frontend service
- Backend API
- Redis cache
- Prometheus monitoring
- Inter-service communication

## Configuration
```yaml
# Global settings
deploymentsGeneral:
  securityContext:
    runAsNonRoot: true
  probes:
    livenessProbe:
      httpGet:
        path: /health
        port: http
      initialDelaySeconds: 30
    readinessProbe:
      httpGet:
        path: /ready
        port: http
      initialDelaySeconds: 5

generic:
  ingressesGeneral:
    domain: example.com
    ingressClassName: nginx
  serviceMonitorGeneral:
    labels:
      prometheus: kube-prometheus

# Redis cache service
deployments:
  redis:
    replicas: 1
    autoCreateService: true
    autoCreatePdb: true
    pdbConfig:
      minAvailable: 1
    containers:
      main:
        image: redis
        imageTag: "6.2-alpine"
        ports:
          redis:
            containerPort: 6379
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi
        volumeMounts:
          - name: redis-data
            mountPath: /data
    volumes:
      - name: redis-data
        persistentVolumeClaim:
          claimName: redis-data

  # Backend API service
  backend-api:
    replicas: 3
    autoCreateService: true
    autoCreateIngress: true
    autoCreateServiceMonitor: true
    containers:
      main:
        image: backend-api  # Replace with your image
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 8080
          metrics:
            containerPort: 9090
        env:
          - name: REDIS_HOST
            value: redis
          - name: API_KEY
            valueFrom:
              secretKeyRef:
                name: api-secrets
                key: api-key
        resources:
          requests:
            cpu: 200m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
    ingress:
      hosts:
        - subdomain: api  # Will become api.example.com
          paths:
            - path: /
              pathType: Prefix
    hpa:
      minReplicas: 3
      maxReplicas: 10
      metrics:
        - type: Resource
          resource:
            name: cpu
            target:
              type: Utilization
              averageUtilization: 80

  # Frontend service
  frontend:
    replicas: 2
    autoCreateService: true
    autoCreateIngress: true
    autoCreateCertificate: true
    containers:
      main:
        image: frontend  # Replace with your image
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 80
        env:
          - name: API_URL
            value: https://api.example.com
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi
    ingress:
      hosts:
        - host: example.com
          paths:
            - path: /
              pathType: Prefix

# Secrets configuration
configs:
  api-secrets:
    type: secret
    data:
      api-key: your-api-key-here

# Storage configuration
persistentVolumeClaims:
  redis-data:
    accessModes:
      - ReadWriteOnce
    size: 10Gi
```

## Usage

1. Replace domain names and image references
2. Update secret values
3. Apply the configuration:

```bash
helm upgrade --install my-app idlefy-universal/idlefy-universal -f values.yaml
```

## Architecture Overview

This configuration creates:
- Frontend accessible at example.com
- Backend API at api.example.com
- Internal Redis service
- Automatic SSL certificates
- Prometheus monitoring for the backend
- Horizontal Pod Autoscaling for the backend
- Persistent storage for Redis