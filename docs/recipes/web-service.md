# Recipe: Web Service

Minimal service with Ingress.

```yaml
# values.yaml
deployments:
  web:
    autoCreateService: true
    autoCreateIngress: true
    containers:
      main:
        image: nginx
        imageTag: "1.25"
        ports:
          http:
            containerPort: 80
    ingress:
      hosts:
        - host: web.example.com
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

Apply:
```bash
helm upgrade --install web idlefy-universal/idlefy-universal -f values.yaml
```
