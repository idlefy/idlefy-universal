# Multi-container

Multiple containers under one workload key map to multiple containers in
the same Pod.

## Recipe A — sidecar

```yaml
deployments:
  api:
    replicas: 1
    containers:
      main:
        image: example/api
        imageTag: "1.0"
        ports: {http: {containerPort: 8080, servicePort: 8080}}
      log-shipper:
        image: fluent/fluent-bit
        imageTag: "3.0"
        args: ["-c", "/etc/fluentbit/fluent-bit.conf"]
```

## Recipe B — initContainer (DB migration)

```yaml
deployments:
  api:
    initContainers:
      migrate:
        image: example/migrator
        imageTag: "1.0"
        env:
          - name: DATABASE_URL
            value: "postgres://api@db/api"
    containers:
      main:
        image: example/api
        imageTag: "1.0"
        ports: {http: {containerPort: 8080, servicePort: 8080}}
```

InitContainers run sequentially before any container in `containers:`
starts; failure prevents pod start.

## Recipe C — shared volume

```yaml
deployments:
  api:
    volumes:
      - name: cache
        emptyDir: {}
    containers:
      main:
        image: example/api
        imageTag: "1.0"
        volumeMounts:
          - {name: cache, mountPath: /var/cache/app}
      cache-warmer:
        image: example/warmer
        imageTag: "1.0"
        volumeMounts:
          - {name: cache, mountPath: /shared}
```

## Recipe D — native sidecar (K8s 1.29+)

Set `restartPolicy: Always` on an initContainer to make it a *native
sidecar* — it starts before the main container, runs for the lifetime
of the pod, and counts toward readiness.

```yaml
    initContainers:
      otel-agent:
        image: otel/opentelemetry-collector
        imageTag: "0.105.0"
        restartPolicy: Always
```

## Reference

- [`containers`](../reference/values.md#deploymentspec-containers)
- [`initContainers`](../reference/values.md#deploymentspec-initcontainers)
