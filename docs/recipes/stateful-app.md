# Recipe: Stateful App

Single-replica Postgres-like StatefulSet with one PVC and a headless Service.

```yaml
# values.yaml
statefulSets:
  postgres:
    serviceName: postgres-headless
    replicas: 1
    autoCreateService: true
    autoCreatePdb: true
    volumeClaimTemplates:
      - metadata:
          name: data
        spec:
          accessModes: [ReadWriteOnce]
          resources:
            requests:
              storage: 20Gi
    containers:
      main:
        image: postgres
        imageTag: "16.2"
        ports:
          postgres:
            containerPort: 5432
        env:
          - name: POSTGRES_PASSWORD
            valueFrom:
              secretKeyRef:
                name: postgres-creds
                key: password
        volumeMounts:
          - name: data
            mountPath: /var/lib/postgresql/data
```

Apply:
```bash
helm upgrade --install postgres idlefy-universal/idlefy-universal -f values.yaml
```

## Notes

- `serviceName` is required and becomes the headless Service name (`autoCreateService: true` emits a `clusterIP: None` Service with `publishNotReadyAddresses: true`).
- `volumeClaimTemplates[].metadata.name` must match a `containers.<c>.volumeMounts[].name`. The chart guards against collisions with `volumes[]`.
- `autoCreatePdb: true` with no `pdb:` block defaults to `maxUnavailable: 1`.
- For multi-replica clusters with stable identity, set `replicas: N` and consider `podManagementPolicy: Parallel` for faster rollouts (default is `OrderedReady`).
