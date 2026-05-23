# Add metrics

Building on [your first app](your-first-app.md): we will add a metrics
endpoint to the same `hello` deployment and let `idlefy-universal`
create a `ServiceMonitor` so Prometheus discovers it automatically.

## Prerequisites

- The kind cluster from the previous tutorial is still running.
- `kubectl get crd servicemonitors.monitoring.coreos.com` should succeed.
  If not, install the CRD:

  ```bash
  kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/v0.74.0/example/prometheus-operator-crd/monitoring.coreos.com_servicemonitors.yaml
  ```

## Step 1 — Add a metrics port

Extend `values.yaml` from the first tutorial:

```yaml
deployments:
  hello:
    replicas: 1
    containers:
      main:
        image: nginx
        imageTag: "1.27-alpine"
        ports:
          http:    {containerPort: 80,   servicePort: 80}
          metrics: {containerPort: 9113, servicePort: 9113}
      exporter:
        image: nginx/nginx-prometheus-exporter
        imageTag: "1.3"
        args:
          - -nginx.scrape-uri=http://localhost/stub_status
    autoCreateService: true
    autoCreateServiceMonitor: true
    serviceMonitor:
      endpoints:
        - port: metrics
          interval: 30s
```

The `exporter` sidecar exposes nginx stub_status as Prometheus metrics
on port 9113. `autoCreateServiceMonitor: true` produces a
`ServiceMonitor` whose selector matches the auto-created Service.

## Step 2 — Upgrade

```bash
helm upgrade demo oci://ghcr.io/idlefy/idlefy-universal \
  --version 1.0.0 -f values.yaml
```

## Step 3 — Verify

```bash
kubectl get servicemonitor -l app.kubernetes.io/instance=demo
```

Expected:

```
NAME         AGE
demo-hello   10s
```

```bash
kubectl get servicemonitor demo-hello -o yaml | grep -A4 endpoints:
```

Expected:

```yaml
  endpoints:
  - interval: 30s
    port: metrics
    scheme: http
```

## Step 4 — Confirm the target is scraped

(If Prometheus Operator stack is not installed, this step is optional —
the `ServiceMonitor` resource is the contract.)

```bash
kubectl -n monitoring port-forward svc/prometheus-operated 9090:9090
```

In a second terminal:

```bash
curl -s 'http://localhost:9090/api/v1/targets?state=active' \
  | jq -r '.data.activeTargets[] | select(.labels.job=="demo-hello") | "\(.scrapeUrl) -> \(.health)"'
```

Expected: `http://10.x.x.x:9113/metrics -> up`.

## Where to go next

- For production-grade scrape configs (relabelling, tls, basic auth) see
  [How-To → Monitoring](../how-to/monitoring.md).
- The full reference for `serviceMonitor.endpoints` is at
  [Reference → values](../reference/values.md#deploymentspec-servicemonitor).
