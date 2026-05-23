#!/usr/bin/env bash
# scripts/check-example-mirrors.sh
#
# Verifies every examples/<N>-<name>/values.yaml has an identical
# charts/idlefy-universal/ci/example-<N>-<name>-values.yaml mirror.
# Plan A creates one example (01-hello-world); Plan B adds 02-05.

set -euo pipefail

EXAMPLES_DIR="examples"
CI_DIR="charts/idlefy-universal/ci"
fail=0

if [[ ! -d "$EXAMPLES_DIR" ]]; then
  echo "no examples/ directory — nothing to check"
  exit 0
fi

# Make the glob expand to nothing (not a literal) when examples/ is empty,
# so the loop doesn't silently pass on an empty examples directory.
shopt -s nullglob

for ex in "$EXAMPLES_DIR"/*/; do
  name=$(basename "$ex")
  src="$ex/values.yaml"
  dst="$CI_DIR/example-${name}-values.yaml"
  if [[ ! -f "$src" ]]; then
    continue
  fi
  if [[ ! -f "$dst" ]]; then
    echo "::error::missing CI mirror: $dst (expected to mirror $src)"
    fail=1
    continue
  fi
  if ! diff -q "$src" "$dst" >/dev/null; then
    echo "::error::mirror drift: $src vs $dst"
    diff -u "$src" "$dst" || true
    fail=1
  fi
done

if [[ "$fail" -ne 0 ]]; then
  echo "::error::Example mirrors are out of sync. Copy the updated examples/<N>-<name>/values.yaml to charts/idlefy-universal/ci/example-<N>-<name>-values.yaml."
  exit 1
fi
echo "All example mirrors in sync."
