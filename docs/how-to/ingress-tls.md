# Ingress TLS

Terminate TLS for a workload using cert-manager. Setting
`autoCreateCertificate: true` requires `autoCreateIngress: true`
(enforced by schema cross-field rules).

## Prerequisites

- cert-manager v1.15.0+:

  ```bash
  kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.0/cert-manager.yaml
  ```

- A `ClusterIssuer` (Let's Encrypt staging shown here for safety):

  ```yaml
  apiVersion: cert-manager.io/v1
  kind: ClusterIssuer
  metadata: {name: letsencrypt-staging}
  spec:
    acme:
      email: ops@example.com
      server: https://acme-staging-v02.api.letsencrypt.org/directory
      privateKeySecretRef: {name: letsencrypt-staging}
      solvers:
        - http01: {ingress: {class: nginx}}
  ```

## Recipe A — basic

```yaml
generic:
  ingressesGeneral:
    domain: example.com
    ingressClassName: nginx

deployments:
  api:
    containers:
      main:
        image: example/api
        imageTag: "1.0"
        ports: {http: {containerPort: 8080, servicePort: 8080}}
    autoCreateService: true
    autoCreateIngress: true
    ingress:
      hosts:
        - subdomain: api
          paths: [{path: /, pathType: Prefix}]
    autoCreateCertificate: true
    certificate:
      clusterIssuer: letsencrypt-staging
```

The chart derives the host as `<subdomain>.<generic.ingressesGeneral.domain>`
(`api.example.com`), wires the cert-manager annotation onto the Ingress,
and creates a matching `Certificate` resource.

## Recipe B — multi-host

```yaml
    ingress:
      hosts:
        - subdomain: api
          paths: [{path: /, pathType: Prefix}]
        - subdomain: admin
          paths: [{path: /, pathType: Prefix}]
```

One `Certificate` per host is created automatically.

## Pitfalls

- **Use staging first.** Let's Encrypt production has tight rate limits
  per registered domain. Validate end-to-end on staging, then switch
  `clusterIssuer:` to `letsencrypt-prod`.
- **`secretName` collisions.** Each `Certificate` writes to a Secret.
  If two charts request the same `secretName` the second overwrite
  invalidates the first.

## Reference

- [`autoCreateIngress`](../reference/values.md#deploymentspec-autocreateingress)
- [`ingress`](../reference/values.md#deploymentspec-ingress)
- [`autoCreateCertificate`](../reference/values.md#deploymentspec-autocreatecertificate)
- [`certificate`](../reference/values.md#deploymentspec-certificate)
- [`generic.ingressesGeneral`](../reference/values.md#ingressesgeneralconfig)
