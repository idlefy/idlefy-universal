# Use the deploy wizard

`idlefy-deploy` is a SKILL.md that walks a human (you) through producing
a validated `values.yaml` for the `idlefy-universal` Helm chart, with
the AI agent of your choice handling the conversation. It scans your
project, drafts a values.yaml from what it finds, asks only the
gap-filling questions that can't be inferred, validates with
`helm template`, and hands off — stopping short of `helm install` so
you review the diff yourself.

## Invoke it

Paste a sentence like this into Claude Code, Cursor, Cline, or any other
agent that can fetch a URL and run shell commands:

> Using <https://raw.githubusercontent.com/idlefy/idlefy-universal/main/skills/idlefy-deploy/SKILL.md>, help me deploy this project to Kubernetes via idlefy-universal.

The agent fetches the file and follows it. No install step, no `curl`,
no `~/.claude/skills/` directory required.

## What you'll be asked

23 questions total, grouped into 8 blocks. Each one explains WHY and
gives a sensible default — most you can accept and move on:

- **Identity** — workload kind, namespace, image tag, imagePullSecrets, replicas.
- **Exposure** — Service, Ingress, cert-manager TLS (with a precondition gate).
- **Resources** — CPU / memory presets (starter / web / heavy).
- **Storage** — PVC size and class (only for stateful workloads).
- **Security** — RBAC, ServiceAccount, NetworkPolicy.
- **Observability** — ServiceMonitor, PodDisruptionBudget, HPA.
- **Repo & multi-env** — save path, single- vs multi-env layout.
- **Secrets** — `secretRefs` for sensitive env vars (never written into values.yaml).

The agent skips any question already answered by the scan.

## Failure modes

- **HTTP 429 from `raw.githubusercontent.com`.** Unauthenticated reads
  are rate-limited per IP (~60/hr). A single human user never hits this;
  multi-tenant CI does. Mirror the file to your own bucket, or fall
  back to the `git clone` path below.
- **Air-gapped / offline.** `git clone https://github.com/idlefy/idlefy-universal`
  and point the agent at the local file path.
- **Agent without `WebFetch` / equivalent.** Paste the SKILL.md contents
  directly into the conversation as a one-time message. Functionally
  identical, just verbose.

## Related

- [Verify the chart's supply chain](verify-supply-chain.md) — recommended before any `helm install`.
- [Your first app](../tutorials/your-first-app.md) — manual walk-through if you'd rather not use an agent.
- [Reference → Values](../reference/values.md) — the full schema surface the wizard navigates.
