# Recipe: Network-isolated API

Restrict a backend deployment to only accept ingress from a known gateway
component and only initiate egress to DNS + a database component. Everything
else is denied at the L4 level.

## Goal

A `kind: NetworkPolicy` that:
- selects the `api` deployment's pods by label
- allows TCP/8080 ingress from pods labeled `app.kubernetes.io/component=gateway`
- allows UDP/53 egress to `kube-system` (DNS resolution)
- allows TCP/5432 egress to pods labeled `app.kubernetes.io/component=postgres`
- blocks all other traffic in both directions

## Values

```yaml
deployments:
  api:
    containers:
      main:
        image: registry.example.com/api
        imageTag: "1.0"
        ports:
          http:
            containerPort: 8080
    autoCreateNetworkPolicy: true
    networkPolicy:
      policyTypes: [Ingress, Egress]
      ingress:
        - from:
            - podSelector:
                matchLabels:
                  app.kubernetes.io/component: gateway
          ports:
            - {protocol: TCP, port: 8080}
      egress:
        - to:
            - namespaceSelector:
                matchLabels: {kubernetes.io/metadata.name: kube-system}
          ports:
            - {protocol: UDP, port: 53}
        - to:
            - podSelector:
                matchLabels:
                  app.kubernetes.io/component: postgres
          ports:
            - {protocol: TCP, port: 5432}
```

## Rendered (excerpt)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: api
      app.kubernetes.io/instance: <release-name>
      app.kubernetes.io/component: api
  policyTypes: [Ingress, Egress]
  ingress: ...
  egress: ...
```

The `podSelector` is auto-derived from the workload key — never user-set. The chart emits three labels (`name`, `instance`, `component`); `instance` is the Helm release name.

## Notes

- **Deny patterns:** explicit `ingress: []` or `egress: []` means "deny this direction." You cannot omit them while still listing the direction in `policyTypes` (validation NP-3/NP-4 will fail).
- **`*General` merge semantics:** if you set `deploymentsGeneral.networkPolicy.egress: [DNS]` globally and then override `egress` per-deployment, the per-deployment list **replaces** the global one entirely. There is no list union. Always include any rules you want to keep from `*General` explicitly in the per-instance block. Empty list `[]` at the instance level wins over a non-empty general value — explicit deny is honored.
- **CronJob/Job timing:** the NetworkPolicy is applied at chart install/upgrade time. For CronJobs, the NP exists before any Job pod runs and will take effect on the first packet. A `helm upgrade` that adds the NP to an already-running Job pod does not retroactively patch that pod — the next firing will inherit the policy.
- **Cross-workload references:** the `app.kubernetes.io/component` label is stamped on every workload's pods by this chart automatically. Refer to other workloads by their key (e.g. `app.kubernetes.io/component: postgres` selects the `statefulSets.postgres` or `deployments.postgres` pods).
