# Secrets

Inject secrets into a workload without committing them to git.

## Recipe A — environment variables from an existing Secret

Two equivalent shapes. Use the `secretRefs` group when several env vars
come from the same Secret (most common case); use per-`env` `valueFrom`
for one-off references.

```yaml
# Top-level: declare a named group of env-var-to-Secret-key mappings.
# Each group is referenced by name from a container's `secretRefs:`.
secretRefs:
  api-credentials:
    - name: DATABASE_PASSWORD
      secretKeyRef:
        name: api-credentials
        key: db_password
    - name: API_KEY
      secretKeyRef:
        name: api-credentials
        key: api_key

deployments:
  api:
    containers:
      main:
        image: example/api
        imageTag: "1.0"
        secretRefs:
          - api-credentials
```

For one-off references, use `env` with `valueFrom`:

```yaml
deployments:
  api:
    containers:
      main:
        image: example/api
        imageTag: "1.0"
        env:
          - name: DATABASE_PASSWORD
            valueFrom:
              secretKeyRef:
                name: api-credentials
                key: db_password
```

Both shapes produce the same result on the rendered Pod. The
`secretRefs` group is preferred when a container needs several env vars
from the same Secret, AND for install-time validation: the chart's
template-layer check (see [Validation](../reference/validation.md))
asserts every group name listed in `containers.<n>.secretRefs:`
exists in the top-level `secretRefs:` map. Per-`env` `valueFrom`
references are resolved by the API server at pod admission, not by the
chart, so typos surface later.

## Recipe B — Secret mounted as file

```yaml
deployments:
  api:
    volumes:
      - name: tls-cert
        secret:
          secretName: api-tls
    containers:
      main:
        image: example/api
        imageTag: "1.0"
        volumeMounts:
          - {name: tls-cert, mountPath: /etc/tls, readOnly: true}
```

The `secretRefs` mechanism applies only to env var injection. For
Secret-backed volumes the Secret must exist in the namespace before
install — there is no chart-level lookup.

## Recipe C — external secret managers

External Secrets Operator (or similar) creates K8s Secrets from an
external store. The chart consumes the resulting Secret exactly as in
Recipe A:

```yaml
# Operator-managed; not part of this chart:
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata: {name: api-credentials}
spec:
  refreshInterval: 1h
  secretStoreRef: {name: vault, kind: ClusterSecretStore}
  target: {name: api-credentials}
  data:
    - secretKey: db_password
      remoteRef: {key: secret/data/api, property: db_password}
```

## Reference

- [`secretRefs`](../reference/values.md#secretrefs)
- For `env` shape: [`containers`](../reference/values.md#deploymentspec-containers)
