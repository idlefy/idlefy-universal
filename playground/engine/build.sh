#!/usr/bin/env bash
# Builds helm.wasm and copies wasm_exec.js next to it. Requires go and wasm-opt.
set -euo pipefail
cd "$(dirname "$0")"
OUT_DIR="../web/public"
mkdir -p "$OUT_DIR"
command -v wasm-opt >/dev/null || { echo "wasm-opt (binaryen) is required" >&2; exit 1; }
GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o "$OUT_DIR/helm.wasm" ./cmd/wasm
wasm-opt -Oz --enable-bulk-memory --enable-nontrapping-float-to-int "$OUT_DIR/helm.wasm" -o "$OUT_DIR/helm.wasm"
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" "$OUT_DIR/wasm_exec.js"
SIZE=$(gzip -9 -c "$OUT_DIR/helm.wasm" | wc -c)
echo "helm.wasm gzip size: $SIZE bytes"
if [ "$SIZE" -gt $((6 * 1024 * 1024)) ]; then
  echo "size gate: helm.wasm gzip exceeds 6 MB" >&2
  exit 1
fi
