# Troubleshooting

This page lists common issues and quick fixes when using the Idlefy Universal chart.

## 1) Service not accessible

- Ensure your deployment exposes ports and `autoCreateService: true` is set
- Verify endpoints exist and selectors match

```bash
kubectl get svc
kubectl get endpoints
```

Minimal example:
```yaml
deployments:
  app:
    autoCreateService: true
    containers:
      main:
        image: nginx
        imageTag: latest
        ports:
          http:
            containerPort: 80
```

## 2) Ingress not working

- Use `autoCreateIngress: true` and configure hosts
- Make sure an ingress controller is installed
- If using TLS, install cert-manager and set a valid issuer

```bash
kubectl get ingress
kubectl describe ingress <name>
```

Minimal example:
```yaml
deployments:
  app:
    autoCreateService: true
    autoCreateIngress: true
    ingress:
      hosts:
        - host: app.example.com
          paths:
            - path: /
              pathType: Prefix
```

## 3) HTTPRoute not working

- Ensure a Gateway API controller is installed (Cilium, Istio, Envoy Gateway)
- Check that `parentRefs` is configured (per-route or in `generic.httpRoutesGeneral`)
- Verify the referenced Gateway exists and is ready

```bash
kubectl get httproutes
kubectl describe httproute <name>
kubectl get gateways -A
```

Minimal example:
```yaml
generic:
  ingressesGeneral:
    domain: example.com
  httpRoutesGeneral:
    parentRefs:
      - name: shared-gateway
        namespace: gateway-system

deployments:
  app:
    autoCreateService: true
    autoCreateHttpRoute: true
    httpRoute:
      hostnames:
        - subdomain: app
      rules:
        - matches:
            - path:
                type: PathPrefix
                value: /
```

## 4) Certificate not created or pending

- Install cert-manager
- Set `autoCreateCertificate: true` and a valid `issuer` or `clusterIssuer`

```yaml
deployments:
  app:
    autoCreateIngress: true
    autoCreateCertificate: true
    certificate:
      clusterIssuer: letsencrypt-prod
```

Check CRD and status:
```bash
kubectl get crd certificates.cert-manager.io
kubectl get certificate
kubectl describe certificate <name>
```

## 5) ServiceMonitor not discovered (Prometheus)

- Ensure Prometheus Operator is installed
- Labels must match your Prometheus selector
- Expose a metrics port (e.g., `http-metrics`)

```yaml
generic:
  serviceMonitorGeneral:
    labels:
      prometheus: kube-prometheus

deployments:
  api:
    autoCreateService: true
    autoCreateServiceMonitor: true
    containers:
      main:
        image: my-api
        imageTag: v1
        ports:
          http-metrics:
            containerPort: 9090
```

## 6) Validation errors (required fields, ports)

- Every container needs `image` and `imageTag`
- Ports must be in 1..65535 and port names must be unique

```bash
helm template my-release idlefy-universal/idlefy-universal -f values.yaml --debug
```

## 7) Domain construction confusion

- If you set `generic.ingressesGeneral.domain`, you can use `subdomain:` to auto-build hostnames

```yaml
generic:
  ingressesGeneral:
    domain: example.com

deployments:
  app:
    autoCreateIngress: true
    ingress:
      hosts:
        - subdomain: api   # becomes api.example.com
```

## Useful debug commands

```bash
kubectl get all -l app.kubernetes.io/instance=my-release
kubectl get events --sort-by=.metadata.creationTimestamp
kubectl logs -l app.kubernetes.io/instance=my-release
helm lint charts/idlefy-universal
```
