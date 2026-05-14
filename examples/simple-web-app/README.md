# Simple Web Application Example

This example demonstrates how to deploy a basic web application with the following features:
- Frontend deployment with Nginx
- SSL/TLS support
- Basic health checks
- Resource limits

## Configuration
```yaml
deployments:
  web-app:
    replicas: 2
    autoCreateService: true
    autoCreateIngress: true
    autoCreateCertificate: true
    
    containers:
      main:
        image: nginx  # Replace with your image
        imageTag: 1.21
        ports:
          http:
            containerPort: 80
            servicePort: 80
        
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi
        
        # Basic health checks
        probes:
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10

    # Ingress configuration
    ingress:
      annotations:
        nginx.ingress.kubernetes.io/proxy-body-size: "10m"
      hosts:
        - host: myapp.example.com
          paths:
            - path: /
              pathType: Prefix

    # SSL Certificate configuration
    certificate:
      clusterIssuer: letsencrypt-prod
```

## Usage

1. Replace `myapp.example.com` with your domain
2. Update the image and imageTag to match your application
3. Adjust resource limits based on your needs
4. Apply the configuration:

```bash
helm upgrade --install my-web-app idlefy-universal/idlefy-universal -f values.yaml
```