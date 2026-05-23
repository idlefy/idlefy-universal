#!/usr/bin/env bash
# scripts/audit-doc-boundaries.sh
# Diátaxis boundary checks across docs/.
# Heuristics — false positives possible; review flagged hits manually.
set -euo pipefail

cd "$(dirname "$0")/.."
fail=0

# Check 1: Concepts pages must not contain large field-listing tables
# (heuristic: at least 3 contiguous lines starting with "| `..." indicating
# a multi-row reference-style table).
echo "Check 1: Concepts pages do not enumerate fields…"
for f in docs/concepts/*.md; do
  if awk '/^\| `/ {c++} !/^\| `/ {if(c>=3)print FILENAME":"NR-c-1":table found"; c=0} END{if(c>=3)print FILENAME":"NR-c":table found"}' "$f" | grep -q ':table found'; then
    echo "  FAIL: $f — looks like a field-listing table"
    fail=1
  fi
done

# Check 2: Reference pages must not contain motivational prose
# (heuristic: words like "philosophy", "why we chose"). "Rationale" is
# tolerated only when it appears inside a markdown link/cross-reference
# (a Reference page is allowed to link out to a Concepts page that holds
# the rationale).
echo "Check 2: Reference pages do not narrate motivation…"
hits=$(grep -Eni 'philosophy|why we chose|why this design' docs/reference/*.md \
  | grep -v 'reference/values.md' || true)
# "rationale" only flagged when NOT part of a cross-link (no surrounding "[" "]" or "see").
rationale_hits=$(grep -Eni 'rationale' docs/reference/*.md \
  | grep -v 'reference/values.md' \
  | grep -viE 'see (the )?\[|\[.*rationale|design rationale see' || true)
if [[ -n "$hits$rationale_hits" ]]; then
  printf '%s\n' "$hits" "$rationale_hits" | grep -v '^$' || true
  echo "  FAIL: reference/*.md contains motivational prose (see hits above)"
  fail=1
fi

# Check 3: Each tutorial links forward to at least one how-to.
echo "Check 3: Tutorials link to at least one how-to…"
for f in docs/tutorials/*.md; do
  if ! grep -q '../how-to/' "$f"; then
    echo "  FAIL: $f — no link to docs/how-to/*"
    fail=1
  fi
done

# Check 4: No surviving 'helm repo add' INSTRUCTIONS in published docs.
# CHANGELOG.md is excluded — it legitimately documents the removal of the
# legacy channel. superpowers/ holds internal artifacts.
echo "Check 4: No legacy helm repo add INSTRUCTIONS in user-facing docs…"
if grep -rn --include='*.md' \
     -e 'helm repo add' \
     docs/ examples/ README.md \
     | grep -v 'docs/superpowers/'; then
  echo "  FAIL: legacy 'helm repo add' references found"
  fail=1
fi

if [[ $fail -ne 0 ]]; then
  echo
  echo "Boundary audit FAILED — fix the issues above."
  exit 1
fi
echo
echo "Boundary audit passed."
