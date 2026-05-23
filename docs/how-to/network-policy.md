# Network policy

Isolate a workload using `autoCreateNetworkPolicy`. The chart emits a
`NetworkPolicy` whose `podSelector` is derived from the workload key
(`app.kubernetes.io/component: <key>`).

## Prerequisites

Your cluster must run a CNI that implements NetworkPolicy. `kindnet` —
the default in `kind create cluster` — does **not**. For local testing
recreate the cluster with Calico:

```bash
kind create cluster --config - <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  disableDefaultCNI: true
nodes:
  - role: control-plane
EOF
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.0/manifests/calico.yaml
```

## Recipe A — default deny

```yaml
deployments:
  api:
    containers:
      main: {image: example/api, imageTag: "1.0"}
    autoCreateNetworkPolicy: true
    networkPolicy:
      policyTypes: [Ingress, Egress]
      ingress: []
      egress: []
```

Empty `ingress: []` + `policyTypes: [Ingress]` denies all ingress.
Empty `egress: []` + `policyTypes: [Egress]` denies all egress.

## Recipe B — allow only from a labelled peer

```yaml
    networkPolicy:
      policyTypes: [Ingress]
      ingress:
        - from:
            - podSelector:
                matchLabels:
                  app.kubernetes.io/component: gateway
          ports:
            - protocol: TCP
              port: 80
```

## Recipe C — allow egress to kube-dns only

```yaml
    networkPolicy:
      policyTypes: [Egress]
      egress:
        - to:
            - namespaceSelector:
                matchLabels:
                  kubernetes.io/metadata.name: kube-system
              podSelector:
                matchLabels:
                  k8s-app: kube-dns
          ports:
            - protocol: UDP
              port: 53
            - protocol: TCP
              port: 53
```

## Recipe D — combine

```yaml
    networkPolicy:
      policyTypes: [Ingress, Egress]
      ingress:
        - from:
            - podSelector: {matchLabels: {app.kubernetes.io/component: gateway}}
          ports: [{protocol: TCP, port: 80}]
      egress:
        - to:
            - namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: kube-system}}
          ports: [{protocol: UDP, port: 53}]
```

## Pitfalls

- **Pods become isolated** the moment a NetworkPolicy selects them.
  Allow-list every legitimate peer before applying.
- **Egress to DNS is almost always required** — most apps break without
  it.

## Reference

- [`autoCreateNetworkPolicy`](../reference/values.md#deploymentspec-autocreatenetworkpolicy)
- [`networkPolicy`](../reference/values.md#deploymentspec-networkpolicy)
