# ❓ Frequently Asked Questions

## 📑 Table of Contents
- [General Questions](#general-questions)
- [Deployment Questions](#deployment-questions)
- [Configuration Questions](#configuration-questions)
- [Monitoring Questions](#monitoring-questions)
- [Scaling Questions](#scaling-questions)
- [Security Questions](#security-questions)
- [Integration Questions](#integration-questions)
- [Troubleshooting](#troubleshooting)

## 🌟 General Questions

<details>
<summary>How do I upgrade the chart version?</summary>

```bash
# Update repository
helm repo update

# Upgrade your release
helm upgrade my-release idlefy-universal/idlefy-universal -f values.yaml
```
</details>

<details>
<summary>Can I use this chart with multiple environments?</summary>

Yes, you can maintain separate value files for different environments:

```yaml
# values.prod.yaml
generic:
  ingressesGeneral:
    domain: prod.example.com

# values.staging.yaml
generic:
  ingressesGeneral:
    domain: staging.example.com
```

Then use them accordingly:
```bash
# For production
helm upgrade -f values.yaml -f values.prod.yaml

# For staging
helm upgrade -f values.yaml -f values.staging.yaml
```
</details>

<details>
<summary>How can I validate my values.yaml before applying?</summary>

```bash
# Using helm template
helm template my-release idlefy-universal/idlefy-universal -f values.yaml

# Using helm lint
helm lint .

# Using helm upgrade with dry-run
helm upgrade --install my-release idlefy-universal/idlefy-universal -f values.yaml --dry-run
```
</details>

## 🚀 Deployment Questions

<details>
<summary>How do I expose my application externally?</summary>

Use autoCreateIngress with appropriate host configuration:
```yaml
deployments:
  my-app:
    autoCreateIngress: true
    autoCreateCertificate: true  # If you need HTTPS
    ingress:
      hosts:
        - host: myapp.example.com
          paths:
            - path: /
              pathType: Prefix
```

Or use a subdomain with a global domain:
```yaml
generic:
  ingressesGeneral:
    domain: example.com

deployments:
  myapp:
    autoCreateIngress: true
    ingress:
      hosts:
        - subdomain: api  # Will be api.example.com
          paths:
            - path: /
              pathType: Prefix
```
</details>

<details>
<summary>How do I expose my application via Gateway API (HTTPRoute)?</summary>

Use autoCreateHttpRoute with a Gateway API controller (Cilium, Istio, Envoy Gateway):
```yaml
generic:
  ingressesGeneral:
    domain: example.com
  httpRoutesGeneral:
    parentRefs:
      - name: shared-gateway
        namespace: gateway-system

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

HTTPRoute is the modern replacement for Ingress. TLS is handled at the Gateway level, not on the HTTPRoute.
</details>

<details>
<summary>How do I configure SSL/TLS for my ingress?</summary>

Enable autoCreateCertificate and configure certificate settings:
```yaml
deployments:
  my-app:
    autoCreateIngress: true
    autoCreateCertificate: true
    certificate:
      clusterIssuer: letsencrypt-prod
```
</details>

<details>
<summary>How do I configure resource limits?</summary>

```yaml
deployments:
  my-app:
    containers:
      main:
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi
```
</details>

## ⚙️ Configuration Questions

<details>
<summary>How do I share configuration between deployments?</summary>

Use deploymentsGeneral for shared settings:
```yaml
deploymentsGeneral:
  securityContext:
    runAsNonRoot: true
  probes:
    livenessProbe:
      httpGet:
        path: /health
        port: http
```
</details>

<details>
<summary>How do I manage secrets?</summary>

Use the configs section with type: secret:
```yaml
configs:
  app-secrets:
    type: secret
    data:
      API_KEY: your-api-key
      DB_PASSWORD: your-db-password
```

For storing secrets in git, we support two recommended approaches:

1. Using [werf secret management](https://werf.io/docs/latest/usage/deploy/values.html#working-with-secret-parameter-files):
```bash
# Encrypt sensitive data with werf
werf helm secret values edit .helm/secret-values.yaml
```

2. Using [SOPS](https://github.com/getsops/sops):
```bash
# Create a new encrypted secrets file
sops -e -i values.secrets.yaml

# Edit encrypted secrets
sops values.secrets.yaml
```

Example of using SOPS with helm:
```bash
# Deploy with decrypted secrets
helm upgrade my-release idlefy-universal/idlefy-universal \
  -f values.yaml \
  -f <(sops -d values.secrets.yaml)
```
</details>

<details>
<summary>How do I configure database migrations?</summary>

Enable migrations in your deployment:
```yaml
deployments:
  my-app:
    migrations:
      enabled: true
      args: ["migrate", "up"]
      backoffLimit: 3
```
</details>

## 📊 Monitoring Questions

<details>
<summary>How do I enable Prometheus monitoring?</summary>

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
</details>

<details>
<summary>How do I configure custom metrics?</summary>

```yaml
serviceMonitor:
  endpoints:
    - port: http-metrics
      interval: 15s
      path: /custom-metrics
```
</details>

## 📈 Scaling Questions

<details>
<summary>How do I configure automatic scaling?</summary>

Use HPA configuration:
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
```
</details>

<details>
<summary>How do I ensure high availability?</summary>

1. Enable PDB:
```yaml
deployments:
  my-app:
    autoCreatePdb: true
    pdb:
      minAvailable: 1
```

2. Use anti-affinity:
```yaml
deployments:
  my-app:
    autoCreateSoftAntiAffinity: true
```
</details>

## 🔒 Security Questions

<details>
<summary>How do I configure pod security?</summary>

```yaml
deployments:
  my-app:
    securityContext:
      runAsNonRoot: true
      runAsUser: 1000
    containers:
      main:
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
              - ALL
```
</details>

<details>
<summary>How do I restrict network access?</summary>

Use network policies:
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
```
</details>

## 🔄 Integration Questions

<details>
<summary>How do I use this chart with Werf?</summary>

Add dependency in Chart.yaml:
```yaml
dependencies:
  - name: idlefy-universal
    version: "v0.2.9"
    repository: https://idlefy.github.io/idlefy-universal
    export-values:
      - parent: werf
        child: werf
```

Then in values.yaml:
```yaml
deployments:
  my-app:
    containers:
      main:
        image: "{{ $.Values.werf.repo }}"
        imageTag: "{{ $.Values.werf.tag.myImage }}"
```

See our [Werf Integration Guide](werf-integration.md) for more details.
</details>

<details>
<summary>How do I use custom domains with ingress?</summary>

You can use either global domain or specific hosts:
```yaml
generic:
  ingressesGeneral:
    domain: example.com

deployments:
  my-app:
    ingress:
      hosts:
        - subdomain: api    # Will be api.example.com
        - host: custom.domain.com  # Custom domain
```
</details>

## 🔧 Troubleshooting

<details>
<summary>Common Issues</summary>

### 1. Service not accessible
- Check service creation:
```yaml
deployments:
  my-app:
    autoCreateService: true
    containers:
      main:
        ports:
          http:
            containerPort: 8080
```
- Verify port configurations match
- Check endpoints exist

### 2. Certificates not being created
- Ensure cert-manager is installed
- Check clusterIssuer exists
- Verify ingress configuration

### 3. Resource issues
- Check resource requests and limits
- Use `kubectl describe pod` to check events
- Review container logs
</details>

<details>
<summary>Debug Commands</summary>

```bash
# Check pod status
kubectl get pods -l app.kubernetes.io/instance=my-release

# Check logs
kubectl logs -l app.kubernetes.io/instance=my-release

# Check events
kubectl get events --sort-by=.metadata.creationTimestamp

# Check service endpoints
kubectl get endpoints my-service

# Check ingress status
kubectl describe ingress my-ingress
```
</details>

## 💡 Best Practices

<details>
<summary>Recommended Practices</summary>

1. **Always use autoCreateService with autoCreateIngress**:
```yaml
deployments:
  my-app:
    autoCreateService: true    # Required for ingress
    autoCreateIngress: true
```

2. **Organize values files by environment**:
- Base configuration (values.yaml)
- Environment-specific (values.prod.yaml, values.staging.yaml)
- Secret configuration (values.secrets.yaml)

3. **Use resource limits and requests**
4. **Enable monitoring for important services**
5. **Configure proper health checks**
6. **Use proper security contexts**
</details>