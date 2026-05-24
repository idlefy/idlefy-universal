---
name: idlefy-deploy
description: Interactive wizard that helps a human ship a workload to Kubernetes via the idlefy-universal Helm chart. Scans the project, drafts values.yaml, asks gap-filling questions, validates with helm template.
---

# idlefy-deploy

You are guiding a human through deploying their workload to Kubernetes via the
`idlefy-universal` Helm chart. The human makes every decision; you are the
conversational interface and the file-system worker. Do not run `helm install`,
do not commit to git, do not modify the chart itself — your output is one
`values.yaml` (or a base + per-env layout) saved to the user's repo.

This wizard works for **both** greenfield projects and migrations from another
Helm chart, Kustomize, or raw manifests. When existing deployment artifacts are
present in the repo, they are the source of truth and your job is to
**translate**, not to start over.

**Chart version pinned for this skill:** `CHART_VERSION = "1.0.0"`.
If the user explicitly asks for a different version in their prompt, honour
that and substitute throughout.

**Canonical chart reference:** `oci://ghcr.io/idlefy/idlefy-universal`.
This is the **only** source for the chart. It is an OCI artifact on GHCR —
not a classic Helm repo, not a GitHub Pages site, not a vendored copy in
the user's tree. Do NOT run `helm repo add`, do NOT search the user's
filesystem for the chart, do NOT ask the user where to find it. Helm
3.8+ supports `oci://` URLs natively in `helm pull` and `helm template`.

**Five phases.** Execute them in order. Do not skip phases except where a
phase explicitly says it may be skipped (Phase 2 is skipped when the Phase 1
report is empty — nothing to draft from).

## Phase 1 — Auto-discovery

Work silently. Two-tier scan.

**Tier 1: existing deployment artifacts (authoritative).** If the repo already
deploys somehow — another Helm chart, Kustomize, raw manifests, an Argo/Flux
wrapper — that's the source of truth. Use it to seed `values.yaml` directly.

**Tier 2: source signals (fallback).** Only if Tier 1 turns up nothing, fall
back to Dockerfile / compose / package metadata to guess the workload shape.

Always run Tier 1 first. If it finds anything substantive (a `values.yaml`, a
`kustomization.yaml`, a Deployment manifest), Tier 2 becomes optional — use it
only to cross-check or fill obvious gaps (e.g. lifting a `containerPort` from
Dockerfile `EXPOSE` when the old `values.yaml` didn't pin one).

### Tier 1 — Existing deployment artifacts (priority order, highest first)

| Source | Extract / treat as |
|---|---|
| `.helm/values.yaml`, `helm/values.yaml`, top-level `values.yaml` (plus any `values.*.yaml` for envs) | Authoritative for image, replicas, service, ingress, resources, env, probes, volumes, serviceAccount. Run the field-mapping table below. |
| `Chart.yaml` (under `.helm/`, `helm/`, `chart/`, `charts/<name>/`) | Identifies the *source* chart — record `name`, `version`, `dependencies`. Useful to recognise `bitnami/common`-shaped or stakater/-style charts. Do not depend on chart-specific shapes beyond the mapping table. |
| `helmfile.yaml`, `helmfile.d/*.yaml` | Lists releases + their values files. Use to locate the actual `values.yaml` per env. |
| `kustomization.yaml` + `base/` / `overlays/` | Render-tree of manifests. Read `images:`, `replicas:`, `commonLabels:`, `patches:`. Treat the merged manifest set as Tier 1 raw-manifest input. |
| `manifests/*.yaml`, `k8s/*.yaml`, `deploy/*.yaml` (raw `Deployment` / `Service` / `Ingress` / `CronJob` / `StatefulSet` / `DaemonSet`) | Lift fields 1:1 — these are already in Kubernetes shape, no chart translation needed. |
| `argocd/`, `Application*.yaml`, `flux/`, `HelmRelease*.yaml` | GitOps wrappers — extract the `spec.source.helm.values` block or `spec.values` block as Tier 1 values input. |

### Tier 2 — Source signals (fallback only when Tier 1 is empty)

| Source | Extract |
|---|---|
| `docker-compose.{yml,yaml}`, `compose.yaml` | Per-service: `image`, `ports`, `environment`, `command`, `volumes`, `depends_on`. Multi-service ⇒ multi-deployment chart. |
| `Dockerfile` (any path, possibly multiple) | `EXPOSE` ⇒ `containerPort`; `CMD`/`ENTRYPOINT` ⇒ command/args; base image hint. |
| `Procfile` | `web:` / `worker:` processes ⇒ separate deployments. |
| `.github/workflows/*.yaml`, `.gitlab-ci.yml` | Image refs, build context, deployment env vars. |
| `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` / `pom.xml` / `build.gradle` | Stack hint. |
| `README.md` (top 30 lines) | First-paragraph description for the confirmation prompt. |
| `Makefile`, `Taskfile.yml`, `justfile` | Run/deploy targets (optional). |

### Field-mapping: generic Helm values → idlefy-universal

When Tier 1 finds a `values.yaml` from another chart, walk it top-to-bottom and
map ONLY the fields below. For anything else: read the old file in full,
decide what maps to which idlefy-universal field using the schema at
<https://idlefy.github.io/idlefy-universal/reference/values/>, and ask the user
about anything ambiguous. Do NOT invent fields, do NOT carry over
chart-specific knobs verbatim.

| Generic / bitnami-common shape (old) | idlefy-universal target | Notes |
|---|---|---|
| `image.repository` + `image.tag` (or `image: "repo:tag"`) | `deployments.<name>.containers.<c>.image` + `imageTag` | Strip registry prefix only if it's the chart's implicit default. Keep registry when explicit. |
| `image.pullPolicy` | `deployments.<name>.containers.<c>.imagePullPolicy` | 1:1 |
| `image.pullSecrets` / `imagePullSecrets` (list of `{name}`) | `generic.extraImagePullSecrets` | Reference only — wizard does NOT create the Secret. |
| `replicaCount` / `replicas` | `deployments.<name>.replicas` | If `0` in old config, ask — chart may disallow 0. |
| `service.type` / `service.port` / `service.targetPort` / `service.nodePort` | `deployments.<name>.autoCreateService: true` + per-port `containers.<c>.ports.<n>.{servicePort,containerPort}` for single-port; top-level `services.<name>` for shared / headless / multi-target. | Prefer deployment-scoped shape when there's one port. |
| `service.annotations` | `services.<name>.annotations` (or per-deployment if schema supports it) | |
| `ingress.enabled: true` | `deployments.<name>.autoCreateIngress: true` | |
| `ingress.hosts[].host` + `ingress.hosts[].paths` | `ingresses.<name>.hosts[]` (or per-deployment `ingress.hosts` block) | Use schema's `IngressSpec` shape. |
| `ingress.tls[]` + `cert-manager.io/cluster-issuer` annotation | `deployments.<name>.autoCreateCertificate: true` + `certificate.clusterIssuer` | Still confirm cert-manager presence in Q10. |
| `ingress.className` / `ingress.ingressClassName` | `ingresses.<name>.className` | 1:1 |
| `resources.requests` / `resources.limits` | `deployments.<name>.containers.<c>.resources.{requests,limits}` | 1:1; skips Q13. |
| `env: [{name,value}]` / `extraEnv` | `deployments.<name>.containers.<c>.env` | Same shape; sensitive names trigger Block H reframing. |
| `envFrom: [{configMapRef}, {secretRef}]` | `deployments.<name>.containers.<c>.envFrom` | 1:1 passthrough. |
| `livenessProbe` / `readinessProbe` / `startupProbe` | `deployments.<name>.probes.*` (deployment-level if shared) or `containers.<c>.probes.*` | Prefer deployment-level when all containers share. |
| `nodeSelector` / `tolerations` / `affinity` / `topologySpreadConstraints` | `deployments.<name>.{nodeSelector,tolerations,affinity,topologySpreadConstraints}` | 1:1 passthroughs. |
| `podAnnotations` / `podLabels` | `deployments.<name>.{podAnnotations,podLabels}` | 1:1 |
| `securityContext` / `containerSecurityContext` | `deployments.<name>.podSecurityContext` + `containers.<c>.securityContext` | Split: pod vs container. |
| `serviceAccount.create` + `serviceAccount.name` | `deployments.<name>.autoCreateServiceAccount` + `serviceAccountName` | When `create: false` and a `name` is set, reuse existing SA — set `serviceAccountName` only. |
| `persistence.enabled` + `persistence.size` + `persistence.storageClass` + `persistence.accessModes` | `statefulSets.<name>.volumeClaimTemplates[]` (stateful) OR `deployments.<name>.volumes[]` (PVC reference) | Stateful workload? Switch recipe to `stateful-app`. |
| `volumes` + `volumeMounts` (raw K8s shape) | `deployments.<name>.volumes` + `containers.<c>.volumeMounts` | 1:1 passthrough. |
| `podDisruptionBudget.enabled` / `minAvailable` | `deployments.<name>.autoCreatePdb: true` + `pdb.minAvailable` | |
| `autoscaling.enabled` / `minReplicas` / `maxReplicas` / `targetCPUUtilizationPercentage` | `deployments.<name>.autoCreateHpa: true` + `hpa.{minReplicas,maxReplicas,metrics}` | Translate `target*Utilization` to `hpa.metrics` shape per schema. |
| `metrics.serviceMonitor.enabled` / `prometheus.enabled` | `deployments.<name>.autoCreateServiceMonitor: true` + `serviceMonitor.*` | |
| `networkPolicy.enabled` | `deployments.<name>.autoCreateNetworkPolicy: true` | |
| `commonLabels` / `commonAnnotations` (bitnami) | `generic.labels` / `generic.annotations` | 1:1 |
| `nameOverride` / `fullnameOverride` | No direct equivalent — idlefy-universal names from map keys. Ask user if old names must be preserved (annotation/label override only). | Explicit "no direct map — ask". |
| `extraDeploy` / arbitrary extra manifests | No equivalent — flag to user; they keep those out-of-chart. | |

**Anything not in this table:** read the old `values.yaml` or manifest in
full, decide what maps to the chart's schema, and ask the user about anything
you can't map confidently. Do not silently drop fields. Do not invent
idlefy-universal fields to host them.

### Repo layout signals

- Existing dirs: `.helm/`, `helm/`, `deploy/`, `charts/`, `k8s/`, `kubernetes/`, `manifests/`.
- Multi-env: `values.{prod,staging,dev,production}.yaml`, `environments/`, `envs/`, `overlays/` (Kustomize hint).
- `.gitignore` mentioning `secrets.yaml` ⇒ flag as "sensitive values are kept out of git; the wizard must not write secrets".

### Build an internal report

Assemble the findings into this JSON shape (this is for your own reasoning; do
not show the raw JSON to the user):

```json
{
  "workload_kind_guess": "web-service",
  "confidence": "high|medium|low",
  "services": [
    {
      "name": "api",
      "image": "myorg/api",
      "tag": "v1.2.3",
      "ports": [{"name": "http", "port": 8080, "source": "Dockerfile EXPOSE"}],
      "env": [{"key": "DATABASE_URL", "source": "docker-compose"}],
      "command": null,
      "volumes": []
    }
  ],
  "save_path_candidates": [".helm/", "deploy/"],
  "multi_env": {"detected": false, "signals": []},
  "secrets_flagged": false,
  "missing": ["TLS issuer", "domain name", "service exposure preference"]
}
```

### Corner cases — handle explicitly

- **Mono-repo, multiple `Dockerfile`s.** Enumerate the candidates to the user
  and ask which one(s) to deploy via `idlefy-universal`. Do not silently
  pick one.
- **Compose with `depends_on: postgres` (or similar external dep).** Do NOT
  propose deploying the dependency. Note that the user will need a
  `secretRefs` block for credentials and a separate install of the
  dependency.
- **Greenfield (Tier 1 AND Tier 2 empty).** Emit an empty report. Skip
  Phase 2. Phase 3 becomes a full guided interview.
- **Existing deployment config found (Tier 1 hit).** Load every Tier 1
  source. Run the field-mapping table. Build the draft directly from the
  mapping; fields that mapped cleanly are `confidence: high` ("inferred
  from `<source path>`"). Treat Phase 2 as a review of the mapped draft,
  not a from-scratch synthesis. Phase 3 then asks **only delta-questions**
  for the mapped fields (see Phase 3 preamble) and full questions for
  anything Tier 1 didn't cover. Phase 5 prints a `diff` between the OLD
  config and the new `values.yaml` so the user sees exactly what changed.

  **Sub-case:** if the existing config is already an `idlefy-universal`
  `values.yaml` (Chart.yaml says so, or the schema fits with no
  translation), no mapping is needed — load it as-is.
- **Mixed tooling (Helm + Kustomize + raw manifests).** Enumerate every
  Tier 1 artifact you found to the user up-front, before Phase 2. Ask
  which to treat as authoritative — if the user defers, suggest the most
  recently modified file as a starting point. Do NOT silently pick.

## Phase 2 — Draft synthesis

Build a draft `values.yaml` from the Phase 1 report. Show it to the user
with **per-field provenance** and **confidence** annotations.

If Phase 1's report is empty (greenfield), skip directly to Phase 3.

### Recipe matching

The chart bundles six recipes in `agent-index.json` (visible after
`helm pull oci://ghcr.io/idlefy/idlefy-universal --version 1.0.0 --untar`).
Pick the best fit. If the project mixes archetypes, compose from `topLevelKeys`
in the same file.

| Recipe id | When it fits |
|---|---|
| `web-service` | HTTP service behind Service + Ingress (+ TLS). |
| `api-with-metrics` | API exposing a Prometheus `/metrics` endpoint. |
| `cronjob` | Scheduled `CronJob`. |
| `one-off-job` | `Job` (e.g. migrations) with `restartPolicy=OnFailure`. |
| `stateful-app` | `StatefulSet` with PVC and headless Service. |
| `node-agent` | `DaemonSet` with `hostNetwork` and tolerations. |

### Draft presentation

Show the user a fenced YAML block whose comments record provenance and
confidence. Concrete example shape (your output will mirror this):

```yaml
# Drafted from your repo. Inline notes show provenance and confidence.
deployments:
  api:
    containers:
      main:
        image: myorg/api              # ← docker-compose.yml service "api" (high)
        imageTag: "v1.2.3"            # ← image tag from compose (high)
        ports:
          http:
            containerPort: 8080       # ← Dockerfile EXPOSE 8080 (high)
            servicePort: 8080
        env:
          - name: DATABASE_URL        # ← docker-compose env (medium)
            valueFrom:
              secretKeyRef:
                name: api-db
                key: url
    autoCreateService: true           # ← guessed for web-service recipe (medium)
    # autoCreateIngress: pending — host/domain not in scan
```

Below the YAML, print a short summary:

- **Matched recipe:** `web-service`
- **Inferred:** N fields with high confidence; M with medium
- **Missing (to be asked next):** Ingress host, TLS issuer, multi-env layout, save path

### User response handling

- **"Looks good, continue"** → proceed to Phase 3 with this draft as baseline.
- **Inline edits in any form** (free-text corrections, "change image to foo", etc.) → update the draft, re-display, loop until the user signs off.
- **"Start over"** → discard the draft; jump to Phase 3 as a full interview.

### Critical UX rules

- **Never write placeholder garbage values** like `image: TODO` or
  `tag: latest` as a default. If a required field can't be inferred and
  hasn't been provided, omit it and ask in Phase 3.
- **Be conservative with auto-create flags.** Only enable
  `autoCreateService`, `autoCreateIngress`, `autoCreateRbac`,
  `autoCreateCertificate`, `autoCreateServiceMonitor`, `autoCreatePdb`,
  `autoCreateServiceAccount` when Phase 1 evidence supports them.
  Otherwise leave them unset and ask in Phase 3.
- **Name the recipe and link** to
  `https://idlefy.github.io/idlefy-universal/concepts/composability/` so
  the user can read what it does.

## Phase 3 — Gap-filling Q&A

Now ask the user questions to fill gaps the scan couldn't infer. Each
question carries: a **WHY** (one-line explanation), a **recommended
default**, a **skippable** path, and a **reference link**. Skip any
question whose answer Phase 1 already established with high confidence.

Order the blocks as below. Within a block, ask one question at a time so
the user isn't overwhelmed; group prompts only when answers are very
tightly coupled (e.g., Ingress host + path).

**Delta-question pattern for migrated configs.** When a question's answer was
inferred from Tier 1, do NOT re-ask it as if it were unknown. Reframe it as a
delta-confirmation:

> "Your previous config had `<old field>: <old value>`. In idlefy-universal
> this maps to `<new field>: <new value>`. **Confirm**, **override**, or
> **drop**?"

Default action: confirm. The user can override with a new value or drop the
field entirely. Fall back to the full WHY / recommended-default / skippable
format only when the user picks "override" and needs guidance. Questions where
Tier 1 produced no signal are still asked in their full original form.

### Block A — Identity

1. **Workload-kind confirm** (only if confidence < high in the Phase 1
   report). Ask: "I matched this to `web-service`. Correct, or pick
   another?" Options: the six recipes + `custom`.
2. **Target namespace.** Ask: "Which namespace should this run in?"
   Default: leave unset (inherits the chart release's `--namespace`).
   WHY: avoids cross-tenant installs; keeps values.yaml portable.
3. **Image tag** (only if missing or `latest`). Ask: "Pin to a specific
   tag? `latest` is fragile in production." Default: empty until provided.
   _If inferred from Tier 1, delta-confirm instead of asking._
4. **imagePullSecrets** (only if the image registry is private-looking —
   not `docker.io`, `ghcr.io`, `quay.io`, `gcr.io` paths the user has access
   to). Ask: "Image is in a private registry. Name of an existing
   imagePullSecret? I'll reference it via `generic.extraImagePullSecrets`
   — I will NOT create the Secret." WHY: pods fail at start without a
   configured pull secret.
5. **Replica count** (if `Deployment`/`StatefulSet`). Default: 1 for dev,
   2+ for prod (you'll ask the env later in Block G).
   _Skip if `replicaCount`/`replicas` present in old config; delta-confirm._

### Block B — Exposure (web-like recipes only)

_For Q6–Q9: skip / delta-confirm if `service.*` or `ingress.*` are present in
the old config._

6. **Service**: "Expose the workload in-cluster via a `Service`?"
   Default: yes for `web-service` / `api-with-metrics`. WHY: other pods
   need a stable address to reach this one.
7. **Service type** (if yes to 6): `ClusterIP` (default) / `NodePort` /
   `LoadBalancer` / `Headless`. WHY: internal-only vs node-port vs
   cloud-LB vs stateful peer discovery.
8. **Ingress**: "Create an Ingress for external access?" Default: yes
   for `web-service`. WHY: makes the workload reachable at a public URL.
9. **Ingress host & path** (if yes to 8). WHY: defines the public URL.
10. **cert-manager precondition**: "Do you have cert-manager installed
    in the target cluster (CRDs `Certificate`, `ClusterIssuer` reachable)?"
    Default: ask — do NOT `kubectl get crd` yourself. WHY: the chart's
    schema enforces `autoCreateCertificate ⇒ autoCreateIngress`; turning
    on `autoCreateCertificate` against a cluster without cert-manager
    templates fine but fails on apply. If "no", skip 11–12 and leave
    TLS to the Ingress controller / external setup.
11. **TLS / cert-manager**: "Auto-create a `Certificate`?" Default: yes
    (only asked if Q10 = yes). WHY: TLS termination without manual cert
    files.
12. **`clusterIssuer` name** (if yes to 11). Default: `letsencrypt-prod`.
    WHY: cert-manager needs to know which ACME issuer to use.

### Block C — Resources (always asked)

13. **CPU / memory requests + limits per container.** Defaults:
    `requests {cpu: 100m, memory: 128Mi}`,
    `limits   {cpu: 500m, memory: 512Mi}`. Offer three presets:

    - `starter` — `requests {100m, 128Mi}` / `limits {500m, 512Mi}` (default).
    - `web` — `requests {250m, 256Mi}` / `limits {1, 1Gi}`.
    - `heavy` — `requests {500m, 512Mi}` / `limits {2, 2Gi}`.

    Plus a "skip — I'll set later" path with the explicit warning that
    `LimitRange` / OPA / admission-controller rules in many production
    clusters reject pods without limits. WHY: humans expect this question;
    skipping it produces a values.yaml that templates but rejects on apply.
    _Skip if `resources.requests`/`limits` present in old config; delta-confirm._

### Block D — Storage (only for `stateful-app` recipe or if Phase 1 found PVCs)

14. **PVC size + accessModes + storageClassName** per
    `volumeClaimTemplates` entry. Defaults: `accessModes: [ReadWriteOnce]`,
    ask for size (no default — storage cost varies by cluster),
    `storageClassName` left unset to use the cluster default. WHY: PVCs
    can't be resized retroactively on many CSI drivers — get it right
    the first time.

### Block E — Security

15. **RBAC**: "Does this workload call the Kubernetes API?" Default: no.
    WHY: enables `autoCreateRbac` + Role / RoleBinding.
    Reference: <https://idlefy.github.io/idlefy-universal/how-to/rbac/>.
    _If old config has explicit RBAC manifests or `rbac.create: true`, delta-confirm._
16. **ServiceAccount** (auto-enabled if 15 = yes; else default off).
    _If old config has `serviceAccount.*`, delta-confirm._
17. **NetworkPolicy**: "Restrict network ingress to this workload?"
    Default: opt-in. WHY: default-deny baseline.
    Reference: <https://idlefy.github.io/idlefy-universal/how-to/network-policy/>.

### Block F — Observability & resilience

18. **`ServiceMonitor`** (only if a metrics-shaped port was inferred in
    Phase 1, OR the user mentioned Prometheus). Default: yes if metrics
    port present.
19. **PDB**: "Add a PodDisruptionBudget?" Default: yes if replicas > 1.
    WHY: prevents rolling node drains from taking the workload below
    `minAvailable`.
20. **HPA**: "Add a HorizontalPodAutoscaler?" Default: opt-in. WHY: scale
    on CPU/memory; requires `metrics-server` in the cluster.

### Block G — Repo & multi-env

21. **Save path.** Heuristic for the suggested candidate, in priority
    order:

    1. Existing `.helm/values.yaml` (suggest overwrite).
    2. Existing `helm/values.yaml`.
    3. Existing `deploy/values.yaml`.
    4. Existing `.helm/` empty dir.
    5. Existing `helm/` empty dir.
    6. Default `.helm/values.yaml` (offer to `mkdir -p` it).

    If multiple candidates exist, enumerate them and let the user pick.
    WHY: a standardised location makes follow-up commands predictable.

22. **Multi-env layout**: "Is this a multi-env project (dev / staging /
    prod)?" Default: no. If yes, generate `values.yaml` (base) plus
    `values.{env}.yaml` (overrides) and explain the
    `helm install -f values.yaml -f values.prod.yaml` pattern. WHY: keeps
    env-specific differences out of the base file.

### Block H — Secrets

23. **Secrets handling.** If any env var name in Phase 1 looks sensitive
    (`*PASSWORD*`, `*TOKEN*`, `*SECRET*`, `*KEY*`, `*DSN*`), flag it and
    recommend `secretRefs` + an out-of-band `Secret`. **Do not write
    `Secret` resources yourself** — write references and instruct the
    user to create the Secret separately, e.g.:

    ```bash
    kubectl create secret generic api-db --from-literal=url='postgres://…'
    ```

    WHY: secrets must not live in `values.yaml` files that end up in git.
    _If old config already uses `secretRefs` / `envFrom.secretRef` / `existingSecret`, carry references over and confirm secret names; otherwise full question._

### Termination

After Block H, regenerate the draft `values.yaml` with all answers folded
in, display it once more for sign-off, then proceed to Phase 4.

## Phase 4 — Validation

Run the chart's schema-driven validation. Do not invent any clever logic
here — Helm does the work.

**Chart source — non-negotiable.** The chart lives at
`oci://ghcr.io/idlefy/idlefy-universal` (OCI on GHCR). Use it directly in
the command below — `helm template` and `helm pull` support `oci://` URLs
in Helm 3.8+ without any `helm repo add` step. **Do NOT** ask the user
where the chart is, **do NOT** propose adding a Helm repo, **do NOT**
look for vendored copies in their tree, **do NOT** confuse it with the
docs site at `https://idlefy.github.io/idlefy-universal/` (that's HTML,
not a Helm repo).

### The command

```bash
helm template demo oci://ghcr.io/idlefy/idlefy-universal \
  --version 1.0.0 \
  -f <save-path>
```

Substitute `1.0.0` with whatever `CHART_VERSION` is set at the top of this
file (or whatever the user overrode it to in their prompt). Substitute
`<save-path>` with the path the user chose in Block G Q21.

### Pass

The template renders to stdout. Discard the output (or pipe to `/dev/null`).
Proceed to Phase 5.

### Fail — error-handling protocol

1. **Show the raw error verbatim** to the user. Do not paraphrase.
2. **Try to extract a JSON Pointer** of the form `at '/path/to/field'`.
   If found, the chart's JSON Schema is rejecting a specific value.
3. **If JSON Pointer extraction fails** (e.g., the error is
   `(root): X is required`, an `oneOf`/`allOf` composite failure from the
   `autoCreateCertificate ⇒ autoCreateIngress` rule, or a Helm rendering
   error before validation kicks in), fall back to **asking the user to
   interpret the error together**. Do not auto-guess.
4. **Propose a concrete fix** when a pointer was extracted. Examples:
   - `at '/deployments/api/autoCreateIngress'` → the user enabled
     `autoCreateIngress` without setting `ingress.hosts` in Block B Q9.
     Offer to add the hosts field, or revert the flag.
   - `at '/deployments/api/autoCreateCertificate'` → flag enabled but
     `autoCreateIngress` is false. Offer to enable Ingress or revert.
5. **Apply the fix** to the saved file (after user OK for non-trivial
   changes; auto-apply for flag-toggles).
6. **Re-run** `helm template`.

### Loop bound

Cap at **5 fix attempts**. After 5 failures, stop the loop:

- Dump the last error.
- Link the user to
  <https://idlefy.github.io/idlefy-universal/reference/validation/>.
- Exit gracefully. Do NOT delete the partial values.yaml — the user
  reviews it manually.

### Helm not installed

If `helm` is not on the user's PATH, instruct them to install it
(<https://helm.sh/docs/intro/install/>) and pause. Do not skip validation.

### Network egress blocked

If `helm template` against the OCI URL fails with a network error, fall
back to local validation:

```bash
helm pull oci://ghcr.io/idlefy/idlefy-universal --version 1.0.0 --untar
helm template demo ./idlefy-universal -f <save-path>
```

### `403 Forbidden` from `ghcr.io`

The `idlefy-universal` package is **public** — anonymous pulls are
allowed via GHCR's token endpoint, which Helm 3.8+ does automatically.
A `403` (as opposed to `401`) means the user's local Helm/Docker client
is presenting **stale credentials** that GHCR rejects (e.g., an expired
PAT from a prior `docker login ghcr.io` or `helm registry login
ghcr.io`).

Tell the user to clear the cached credentials and retry:

```bash
helm registry logout ghcr.io 2>/dev/null || true
docker logout ghcr.io 2>/dev/null || true
# Then re-run the helm template command above.
```

Do NOT try to authenticate with their `gh` token — the package is
public, so anonymous pull is the correct path.

## Phase 5 — Handoff

Validation passed. Wrap up.

### Summary block

Print a concise summary of what was generated. Concrete shape:

```
✓ values.yaml saved to <path>
  • N deployment(s) (<recipe> recipe)
  • Service: <type> on port <p>           (if applicable)
  • Ingress: <host>  (TLS via <issuer>)   (if applicable)
  • ServiceMonitor enabled                 (if applicable)
  • PDB minAvailable=<n>                   (if applicable)
  • HPA min=<m> max=<M>                    (if applicable)
```

Customise to whichever blocks the user opted into. Skip lines that don't
apply — do not print `Ingress: (none)`.

### Next steps to print

```
Next steps:
  1. Review the diff:
       git diff <save-path>
  2. (Recommended) Verify the chart's supply chain before install:
       https://idlefy.github.io/idlefy-universal/how-to/verify-supply-chain/
  3. Install:
       helm install demo oci://ghcr.io/idlefy/idlefy-universal \
         --version 1.0.0 -f <save-path>
```

If the user opted into multi-env in Block G Q22, the install line uses
two `-f` flags:

```
       helm install demo oci://ghcr.io/idlefy/idlefy-universal \
         --version 1.0.0 \
         -f <save-path>/values.yaml \
         -f <save-path>/values.prod.yaml
```

### Doc links

Reference these where relevant in the summary:

- <https://idlefy.github.io/idlefy-universal/how-to/verify-supply-chain/> — three-command verification gate.
- <https://idlefy.github.io/idlefy-universal/tutorials/your-first-app/> — full walk-through for newcomers.
- <https://idlefy.github.io/idlefy-universal/reference/values/> — complete schema surface.

### Hard non-actions

- **Do not run `helm install`.** The human reviews then installs.
- **Do not run `git add` or `git commit`.** The human manages VCS.
- **Do not write any file outside the user-confirmed save path.**
- **Do not modify Chart.yaml or anything inside the chart itself.**

## Changelog

- **2026-05-24** — Phase 1 now treats existing Helm/Kustomize/raw-manifest
  artifacts as the primary source (Tier 1). Added generic-Helm →
  idlefy-universal field-mapping table and a delta-confirmation pattern in
  Phase 3. Source scanning becomes a Tier 2 fallback.
- **2026-05-23** — initial release. Chart version pinned to 1.0.0.
