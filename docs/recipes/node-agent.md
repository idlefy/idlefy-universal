# Recipe: Node-Level Agent

DaemonSet log shipper with hostNetwork and tolerations for every node.

```yaml
# values.yaml
daemonSets:
  log-shipper:
    hostNetwork: true
    autoCreateServiceMonitor: true
    tolerations:
      - operator: Exists
    containers:
      main:
        image: fluent/fluent-bit
        imageTag: "3.0"
        ports:
          http-metrics:
            containerPort: 2020
        volumeMounts:
          - name: varlog
            mountPath: /var/log
            readOnly: true
    volumes:
      - name: varlog
        hostPath:
          path: /var/log
```

Apply:
```bash
helm upgrade --install log-shipper idlefy-universal/idlefy-universal -f values.yaml
```

## Notes

- `tolerations: [{operator: Exists}]` makes the pod tolerate every node taint (control-plane, GPU, NoSchedule). Narrow this when you only need a subset of nodes.
- `hostNetwork: true` shares the host's network namespace — required for some CNI plugins and host-metric scrapers. Only DaemonSets accept this field; schema rejects it on other workloads.
- `autoCreateServiceMonitor: true` works for DaemonSets too — Prometheus scrapes each pod IP via the container port.
- `replicas` is not allowed on DaemonSets; pod count is managed by node count.
