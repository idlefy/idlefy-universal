# Gateway API

`idlefy-universal` supports the modern Gateway API alongside classic
Ingress. This walkthrough swaps the Ingress from the first tutorial for
an `HTTPRoute` attached to a `Gateway`.

## Prerequisites

- The kind cluster from previous tutorials.
- Gateway API v1.5.1 standard CRDs:

  ```bash
  kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml
  ```

- A Gateway controller. We use Envoy Gateway:

  ```bash
  helm install eg oci://docker.io/envoyproxy/gateway-helm \
    --version v1.2.0 \
    -n envoy-gateway-system --create-namespace
  ```

## Step 1 — Create a Gateway

Save as `gateway.yaml`:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: eg
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: eg
  namespace: default
spec:
  gatewayClassName: eg
  listeners:
    - name: http
      protocol: HTTP
      port: 80
```

```bash
kubectl apply -f gateway.yaml
```

## Step 2 — Update chart values

```yaml
deployments:
  hello:
    replicas: 1
    containers:
      main:
        image: nginx
        imageTag: "1.27-alpine"
        ports:
          http: {containerPort: 80, servicePort: 80}
    autoCreateService: true

httpRoutes:
  hello:
    parentRefs:
      - name: eg
        namespace: default
    hostnames:
      - host: hello.example.com
    rules:
      - matches:
          - path: {type: PathPrefix, value: /}
        backendRefs:
          - name: demo-hello
            port: 80
```

`hostnames` is an array of objects (`{host}` for FQDN or `{subdomain}`
for a name combined with `generic.ingressesGeneral.domain`). Plain
strings are rejected by the schema.

Note `autoCreateIngress` is gone. `httpRoutes` is the new top-level key
documented in [Reference → values](../reference/values.md#httproutes).

## Step 3 — Upgrade

```bash
helm upgrade demo oci://ghcr.io/idlefy/idlefy-universal \
  --version 1.0.0 -f values.yaml
```

## Step 4 — Verify

```bash
kubectl get httproute,gateway
```

Expected:

```
NAME                                            HOSTNAMES                 AGE
httproute.gateway.networking.k8s.io/demo-hello  ["hello.example.com"]     10s

NAME                                  CLASS   ADDRESS       PROGRAMMED   AGE
gateway.gateway.networking.k8s.io/eg  eg      10.96.x.x     True         5m
```

## Step 5 — Curl through the gateway

```bash
GATEWAY=$(kubectl get gateway eg -o jsonpath='{.status.addresses[0].value}')
curl -sH "Host: hello.example.com" "http://$GATEWAY/" | head -1
```

Expected: `<!DOCTYPE html>`.

## Where to go next

- For per-route patterns (header matching, weighted backends, redirects)
  see the [HTTPRoute spec on gateway-api.sigs.k8s.io](https://gateway-api.sigs.k8s.io/api-types/httproute/).
- For TLS termination with cert-manager, see
  [How-To → Ingress TLS](../how-to/ingress-tls.md) (Ingress-based; Gateway
  TLS uses Listener configuration on the Gateway resource itself).
- The full reference for `httpRoutes` is at
  [Reference → values](../reference/values.md#httproutes).
