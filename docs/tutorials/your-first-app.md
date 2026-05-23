# Your first app

A 10-minute walkthrough: install `idlefy-universal`, deploy nginx, expose it via an in-cluster Service and an Ingress, and verify everything from `kubectl`.

You will use:

- `kind` to spin up a throwaway Kubernetes cluster
- `helm` (3.8+) to pull and install the chart from GHCR
- `kubectl` to inspect the result

## Prerequisites

| Tool      | Version  | Install                                              |
|-----------|----------|------------------------------------------------------|
| kind      | 0.23+    | <https://kind.sigs.k8s.io/docs/user/quick-start/>    |
| kubectl   | 1.31+    | <https://kubernetes.io/docs/tasks/tools/>            |
| helm      | 3.8+     | <https://helm.sh/docs/intro/install/>                |

Verify:

```bash
kind version
kubectl version --client
helm version --short
```

## Step 1 — Create a kind cluster

```bash
kind create cluster --name idlefy-tutorial
```

Expected: `Set kubectl context to "kind-idlefy-tutorial"`.

## Step 2 — Write a 4-line `values.yaml`

Save as `values.yaml`:

```yaml
deployments:
  hello:
    replicas: 1
    containers:
      main:
        image: nginx
        imageTag: "1.27-alpine"
        ports:
          http:
            containerPort: 80
            servicePort: 80
    autoCreateService: true
```

The schema validates this file at install time. `autoCreateService: true` tells the chart to derive a Kubernetes `Service` from the container port definitions — no separate `services:` block needed.

## Step 3 — Install the chart from GHCR

--8<-- "_snippets/install.md"

Expected output:

```
NAME: demo
LAST DEPLOYED: ...
NAMESPACE: default
STATUS: deployed
REVISION: 1
TEST SUITE: None
```

If you see `Error: INSTALLATION FAILED: values don't meet the specifications of the schema(s)`, the error message includes a JSON Pointer (e.g. `/deployments/hello/containers/main/imageTag`) showing exactly which field is wrong.

## Step 4 — Verify the workload

```bash
kubectl get deployment,service,pod -l app.kubernetes.io/instance=demo
```

Expected:

```
NAME                          READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/demo-hello    1/1     1            1           30s

NAME                    TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
service/demo-hello      ClusterIP   10.96.x.x      <none>        80/TCP    30s

NAME                              READY   STATUS    RESTARTS   AGE
pod/demo-hello-7f4cb6d8b9-abcde   1/1     Running   0          30s
```

## Step 5 — Port-forward and curl

```bash
kubectl port-forward svc/demo-hello 8080:80
```

In a second terminal:

```bash
curl -s http://localhost:8080 | head -1
```

Expected:

```
<!DOCTYPE html>
```

## Clean up

```bash
helm uninstall demo
kind delete cluster --name idlefy-tutorial
```

## Where to go next

- The full field catalogue is in the [values reference](../reference/values.md).
- Production patterns (Ingress + TLS, ServiceMonitor, NetworkPolicy, RBAC) live under **How-To** (added in Plan B).
- For the design rationale behind the schema-first approach, see **Concepts** (added in Plan B).
