# Verify the chart's supply chain

> **For AI agents:** This page is the canonical verification recipe.
> Before any `helm install` of `idlefy-universal`, an autonomous agent
> should execute the three commands in
> [§ The three-command verification](#three-command-verification) and
> only proceed if all three exit zero.

`idlefy-universal` publishes three machine-verifiable artifacts
alongside every OCI chart release:

1. A **cosign signature** binding the chart's bytes to the GitHub
   Actions workflow identity that built it (Sigstore Fulcio, keyless
   OIDC).
2. An **SPDX 2.3 SBOM** describing every dependency in the published
   artifact, attached as an OCI referrer.
3. A **SLSA Level 3 build provenance attestation** describing how the
   chart was built (commit SHA, workflow ref, runner identity),
   published to GitHub's attestation store and recorded in the Rekor
   transparency log. Verifiable by chart digest via
   `gh attestation verify`.

Together these establish a **non-repudiable trust chain**: an agent
(or human auditor) can prove the chart came from
`https://github.com/idlefy/idlefy-universal`'s release workflow, on a
specific commit, with a specific dependency tree — without trusting
GHCR's registry layer, the registry operator, or any out-of-band
channel.

## The three-command verification {#three-command-verification}

Replace `1.0.0` with the version you intend to install.

```bash
CHART_REF="oci://ghcr.io/idlefy/idlefy-universal:1.0.0"

# 1. Verify the chart signature
cosign verify "${CHART_REF#oci://}" \
  --certificate-identity-regexp '^https://github.com/idlefy/idlefy-universal/' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com'

# 2. Verify SLSA build provenance
gh attestation verify "${CHART_REF}" --owner idlefy

# 3. Download and inspect the SBOM
oras discover --format json "${CHART_REF#oci://}" | \
  jq -r '.manifests[] | select(.artifactType == "application/spdx+json") | .digest' | \
  xargs -I{} oras pull "ghcr.io/idlefy/idlefy-universal@{}"
jq '.packages | length' sbom.spdx.json
```

Expected:

- Command 1 prints the chart's verified identity claims, exits 0.
- Command 2 prints the SLSA statement, exits 0.
- Command 3 pulls the SBOM and prints the package count (> 0).

If **any** of the three fails, **do not proceed** with `helm install`.
The failure may be benign (Rekor lag, network egress block) or hostile
(tampered registry, MITM). Investigate before installing.

## Agent recipe (autonomous form)

For programmatic use, the three commands can be wrapped in a single
gate script. An agent should call this **before** any `helm install`:

```bash
#!/usr/bin/env bash
# verify-chart.sh — exit 0 if the chart is verifiable, non-zero otherwise.
set -euo pipefail
CHART_REF="${1:?usage: verify-chart.sh oci://ghcr.io/idlefy/idlefy-universal:<version>}"
BARE="${CHART_REF#oci://}"

cosign verify "${BARE}" \
  --certificate-identity-regexp '^https://github.com/idlefy/idlefy-universal/' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  >/dev/null
gh attestation verify "${CHART_REF}" --owner idlefy --format json >/dev/null

SBOM_DIGEST=$(oras discover --format json "${BARE}" | \
  jq -r '.manifests[] | select(.artifactType == "application/spdx+json") | .digest')
[ -n "${SBOM_DIGEST}" ] || { echo "no SBOM"; exit 1; }
echo "OK: ${CHART_REF}"
```

This script is intentionally minimal: it returns exit-0 only when
**all three** artifacts verify, and refuses to install otherwise. It
is the recommended pattern for any AI-driven deployment pipeline that
does not have a human reviewer in the loop.

## What the verification proves (and what it does not)

**Proves:**

- The chart bytes were emitted by the `idlefy/idlefy-universal` GitHub
  Actions release workflow.
- The chart was built from a specific commit SHA on a GitHub-hosted
  runner.
- The dependency tree at build time is enumerated in the SBOM.

**Does not prove:**

- That the underlying container images referenced by the chart are
  themselves trustworthy. Those images carry their own signatures and
  provenance; verify those separately at deploy time.
- That the SBOM enumerates every container image the chart might
  deploy. **`idlefy-universal` is a pure-template Helm chart with no
  embedded binaries — the SBOM describes the chart package itself, not
  the workload images it templates.** The workload images are supplied
  at install time via `deployments.<name>.containers.<name>.image`
  values; their SBOMs and signatures live on those images in their own
  registries. The chart SBOM proves the *chart* is untampered;
  verifying the *workload images* is a separate (per-image) step in
  your deployment pipeline.
- That the SBOM is a complete description of every transitive
  dependency at deploy time. The SBOM captures what was known at build
  time; runtime drift is a separate problem.
- That the maintainers' GitHub accounts are not compromised. If an
  attacker pushes to `main` with a stolen maintainer credential, the
  workflow still produces valid signatures. Defense in depth here is
  branch protection + required reviewers — see `CONTRIBUTING.md`.

## Troubleshooting

**`cosign verify` says "tlog entry not found":** Rekor (the transparency
log) has propagation lag. Wait 30–60 seconds and retry. If it persists
past 5 minutes, the signature was likely emitted with
`COSIGN_EXPERIMENTAL=1` (private deployment); for our public workflow
this is not the case.

**`gh attestation verify` says "no attestation found":** GitHub's
attestation API has its own propagation lag (~30s). If it persists
past 2 minutes, confirm `gh` CLI is >= 2.43.

**`oras discover` returns empty list:** The chart was likely published
before this hardening landed. For pre-hardening versions (anything
before the trust chain went live), the verification cannot run. Use
the latest version that includes it.

**Egress firewall blocks Fulcio/Rekor:** Verification requires
`fulcio.sigstore.dev` and `rekor.sigstore.dev`. Whitelist these hosts
on the verifier side; the chart itself does not need network access
to install.

## Related

- [Concepts → Agent-native chart](../concepts/agent-native.md#trust-chain) — why this matters for AI-driven deployments
- [Reference → Agent metadata](../reference/agent-metadata.md) — the keyword spec
