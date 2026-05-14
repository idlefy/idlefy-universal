"""Extract a subset of yannh/kubernetes-json-schema definitions.

Reads schema/k8s/manifest.yaml, fetches the upstream _definitions.json at
the pinned SHA, computes the transitive $ref closure of each requested
type, renames keys per the manifest's local-name mapping, and writes the
result to schema/k8s/<version>/definitions.json.

Idempotent: running with no manifest changes produces a byte-identical
definitions.json.

Usage: python -m schema.extract_k8s_subset
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path
from typing import Any

import yaml


SCHEMA_DIR = Path(__file__).resolve().parent
K8S_DIR = SCHEMA_DIR / "k8s"


def _fetch_upstream_defs(source: str, ref: str, version: str) -> dict[str, Any]:
    """Fetch _definitions.json from the upstream repo at the pinned SHA."""
    if "github.com/" not in source:
        raise ValueError(f"unsupported source URL: {source}")
    repo = source.split("github.com/", 1)[1].rstrip("/")
    url = f"https://raw.githubusercontent.com/{repo}/{ref}/{version}-standalone/_definitions.json"
    with urllib.request.urlopen(url, timeout=30) as resp:  # noqa: S310
        return json.loads(resp.read().decode("utf-8"))


def _ref_target(ref: str) -> str | None:
    """Return the bare definition name from '#/definitions/<Name>', else None."""
    prefix = "#/definitions/"
    if isinstance(ref, str) and ref.startswith(prefix):
        return ref[len(prefix):]
    return None


def _collect_closure(seed: set[str], upstream: dict[str, Any]) -> set[str]:
    """BFS over $ref edges to collect every reachable definition name."""
    seen: set[str] = set()
    stack = list(seed)
    while stack:
        name = stack.pop()
        if name in seen:
            continue
        if name not in upstream:
            raise ValueError(f"upstream definition '{name}' not found")
        seen.add(name)
        for child in _walk_refs(upstream[name]):
            if child not in seen:
                stack.append(child)
    return seen


def _walk_refs(node: Any):
    """Yield every $ref target name reachable in node (no cycle protection needed)."""
    if isinstance(node, dict):
        ref = node.get("$ref")
        target = _ref_target(ref) if isinstance(ref, str) else None
        if target is not None:
            yield target
        for v in node.values():
            yield from _walk_refs(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk_refs(v)


def _to_local_name(upstream_name: str, explicit_map: dict[str, str]) -> str:
    """Translate upstream definition name to our local convention.

    Explicit manifest overrides win. Otherwise, names starting with
    'io.k8s.' get rewritten to 'k8s.io.' (swap of the first two segments
    so closure-pulled types like 'io.k8s.apimachinery.pkg.apis.meta.v1.
    LabelSelector' show up uniformly).
    """
    if upstream_name in explicit_map:
        return explicit_map[upstream_name]
    if upstream_name.startswith("io.k8s."):
        return "k8s.io." + upstream_name[len("io.k8s."):]
    return upstream_name


def main() -> int:
    manifest_path = K8S_DIR / "manifest.yaml"
    manifest = yaml.safe_load(manifest_path.read_text()) or {}
    upstream_meta = manifest.get("upstream") or {}
    source = upstream_meta.get("source", "")
    ref = upstream_meta.get("ref", "")
    version = upstream_meta.get("k8s_version", "")
    types = manifest.get("types") or []

    if not (source and ref and version):
        print("manifest.yaml is missing upstream.source / ref / k8s_version", file=sys.stderr)
        return 1
    if not types:
        print("manifest.yaml has empty types list; nothing to extract", file=sys.stderr)
        return 0

    print(f"fetching {source}@{ref} ({version}) ...")
    upstream = _fetch_upstream_defs(source, ref, version).get("definitions") or {}

    requested = {e["upstream"] for e in types}
    closure = _collect_closure(requested, upstream)
    print(f"closure: {len(requested)} requested -> {len(closure)} total types")

    explicit_map = {e["upstream"]: e["local"] for e in types}
    full_map = {name: _to_local_name(name, explicit_map) for name in closure}

    extracted: dict[str, Any] = {}
    for name in sorted(closure):
        local = full_map[name]
        extracted[local] = _seal_objects(_remap_refs(upstream[name], full_map))

    out_path = K8S_DIR / version / "definitions.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"definitions": extracted}, indent=2, sort_keys=True) + "\n")
    print(f"wrote {out_path} ({out_path.stat().st_size} bytes)")
    return 0


def _seal_objects(node: Any) -> Any:
    """Recursively inject additionalProperties: false on every object node
    that declares 'properties' but has no explicit additionalProperties.

    Preserves nodes whose additionalProperties is already set (e.g. the
    map-value-schema variant `additionalProperties: {<schema>}` from upstream
    on fields like ObjectMeta.annotations, LabelSelector.matchLabels)."""
    if isinstance(node, dict):
        out = {k: _seal_objects(v) for k, v in node.items()}
        if (
            "properties" in out
            and isinstance(out["properties"], dict)
            and "additionalProperties" not in out
        ):
            out["additionalProperties"] = False
        return out
    if isinstance(node, list):
        return [_seal_objects(v) for v in node]
    return node


def _remap_refs(node: Any, name_map: dict[str, str]) -> Any:
    """Rewrite every '#/definitions/<upstream>' ref to the matching local name.

    `name_map` MUST cover every upstream name reachable via $ref from `node`.
    A KeyError-style miss is an extractor bug — closure should have been
    complete. We fail loud instead of silently passing through.
    """
    if isinstance(node, dict):
        out: dict[str, Any] = {}
        for k, v in node.items():
            if k == "$ref":
                target = _ref_target(v)
                if target is not None:
                    if target not in name_map:
                        raise KeyError(
                            f"$ref target '{target}' is not in the resolved name map "
                            f"(closure should have included it)"
                        )
                    out[k] = f"#/definitions/{name_map[target]}"
                    continue
            out[k] = _remap_refs(v, name_map)
        return out
    if isinstance(node, list):
        return [_remap_refs(v, name_map) for v in node]
    return node


if __name__ == "__main__":
    sys.exit(main())
