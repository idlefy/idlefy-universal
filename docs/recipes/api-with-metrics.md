# Recipe: API with Prometheus Metrics

Expose a metrics port and auto-create ServiceMonitor.

```yaml
# values.yaml
generic:
  serviceMonitorGeneral:
    labels:
      prometheus: kube-prometheus

deployments:
  api:
    autoCreateService: true
    autoCreateIngress: true
    autoCreateServiceMonitor: true
    containers:
      main:
        image: my-api
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 8080
          http-metrics:
            containerPort: 9090
    ingress:
      hosts:
        - host: api.example.com
          paths:
            - path: /
              pathType: Prefix
```

## With Gateway API (HTTPRoute)

```yaml
# values.yaml
generic:
  ingressesGeneral:
    domain: example.com
  httpRoutesGeneral:
    parentRefs:
      - name: shared-gateway
        namespace: gateway-system
  serviceMonitorGeneral:
    labels:
      prometheus: kube-prometheus

deployments:
  api:
    autoCreateService: true
    autoCreateHttpRoute: true
    autoCreateServiceMonitor: true
    containers:
      main:
        image: my-api
        imageTag: v1.0.0
        ports:
          http:
            containerPort: 8080
          http-metrics:
            containerPort: 9090
    httpRoute:
      hostnames:
        - subdomain: api
      rules:
        - matches:
            - path:
                type: PathPrefix
                value: /
```

Apply:
```bash
helm upgrade --install api idlefy-universal/idlefy-universal -f values.yaml
```
