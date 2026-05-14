# Recipe: HTTPRoute (Gateway API)

Modern alternative to Ingress using Gateway API. Requires a Gateway controller (Cilium, Istio, Envoy Gateway, etc.).

## Basic HTTPRoute

```yaml
# values.yaml
generic:
  ingressesGeneral:
    domain: example.com
  httpRoutesGeneral:
    parentRefs:
      - name: shared-gateway
        namespace: gateway-system

deployments:
  web:
    autoCreateService: true
    autoCreateHttpRoute: true
    containers:
      main:
        image: nginx
        imageTag: "1.25"
        ports:
          http:
            containerPort: 80
    httpRoute:
      hostnames:
        - subdomain: web
      rules:
        - matches:
            - path:
                type: PathPrefix
                value: /
```

## Traffic Splitting (Canary)

```yaml
generic:
  ingressesGeneral:
    domain: example.com
  httpRoutesGeneral:
    parentRefs:
      - name: shared-gateway
        namespace: gateway-system

httpRoutes:
  app:
    hostnames:
      - subdomain: app
    rules:
      - matches:
          - path:
              type: PathPrefix
              value: /
        backendRefs:
          - name: app-stable
            port: 8080
            weight: 90
          - name: app-canary
            port: 8080
            weight: 10
```

## Header-based Routing

```yaml
httpRoutes:
  api:
    hostnames:
      - subdomain: api
    rules:
      - matches:
          - path:
              type: PathPrefix
              value: /api
            headers:
              - name: x-version
                value: "2"
                type: Exact
        backendRefs:
          - name: api-v2
            port: 8080
      - matches:
          - path:
              type: PathPrefix
              value: /api
        backendRefs:
          - name: api-v1
            port: 8080
```

Apply:
```bash
helm upgrade --install app idlefy-universal/idlefy-universal -f values.yaml
```
