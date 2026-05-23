"""Build tool for idlefy-universal values.schema.json.

Reads layered YAML sources from schema/structure/ and schema/docs/,
merges them into a draft-07 JSON Schema, and writes the result to
charts/idlefy-universal/values.schema.json.
"""
from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import jsonschema
import yaml


# Keys allowed only from the docs layer
DOC_KEYS = frozenset({
    "description",
    "examples",
    "x-agent-when-to-use",
    "x-agent-related-fields",
    "x-agent-common-mistakes",
    "x-agent-example-use-case",
})


def load_structure(
    structure_dir: Path,
    seed: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Load and merge all YAML files in structure_dir.

    shared.yaml is loaded first if present so its $defs anchor the pool.
    The optional `seed` dict is merged into $defs BEFORE the file loop runs,
    so duplicate-key collisions with structure files still raise ValueError.
    Returns a dict with keys $defs and properties.
    """
    files = sorted(structure_dir.glob("*.yaml"))
    files.sort(key=lambda p: (p.name != "shared.yaml", p.name))

    defs: dict[str, Any] = dict(seed or {})
    properties: dict[str, Any] = {}

    for path in files:
        data = yaml.safe_load(path.read_text()) or {}
        for name, body in (data.get("$defs") or {}).items():
            if name in defs:
                raise ValueError(
                    f"duplicate $defs key '{name}' (file: {path.name})"
                )
            defs[name] = body
        for name, body in (data.get("properties") or {}).items():
            if name in properties:
                raise ValueError(
                    f"duplicate top-level property '{name}' (file: {path.name})"
                )
            properties[name] = body

    return {"$defs": defs, "properties": properties}


def _rewrite_ref_prefix(node: Any, old: str, new: str) -> Any:
    """Replace every '$ref' value starting with `old` to start with `new`."""
    if isinstance(node, dict):
        out: dict[str, Any] = {}
        for k, v in node.items():
            if k == "$ref" and isinstance(v, str) and v.startswith(old):
                out[k] = new + v[len(old):]
            else:
                out[k] = _rewrite_ref_prefix(v, old, new)
        return out
    if isinstance(node, list):
        return [_rewrite_ref_prefix(v, old, new) for v in node]
    return node


def load_k8s_primitives(k8s_dir: Path) -> dict[str, Any]:
    """Load vendored K8s JSON Schema types as a seed for the $defs pool.

    Reads schema/k8s/manifest.yaml (to discover the k8s version) and
    schema/k8s/<version>/definitions.json. Every key in the JSON file
    is returned, with internal '#/definitions/' $ref values rewritten
    to '#/$defs/' so they resolve in our merged schema.

    Returns {} if manifest is absent, version is unset, or
    definitions.json is absent.
    """
    manifest_path = k8s_dir / "manifest.yaml"
    if not manifest_path.exists():
        return {}
    manifest = yaml.safe_load(manifest_path.read_text()) or {}
    version = (manifest.get("upstream") or {}).get("k8s_version", "")
    if not version:
        return {}
    defs_path = k8s_dir / version / "definitions.json"
    if not defs_path.exists():
        return {}
    raw = json.loads(defs_path.read_text())
    upstream_defs = raw.get("definitions") or {}
    return {
        k: _rewrite_ref_prefix(v, "#/definitions/", "#/$defs/")
        for k, v in upstream_defs.items()
    }


def load_docs(docs_dir: Path) -> dict[str, Any]:
    """Load and merge all YAML files in docs_dir.

    Docs files mirror the structure of structure/ files but contain
    description/examples/x-agent-* fields at each node. No duplicate-key
    check is needed for $defs because docs only describes existing
    structure nodes.
    """
    files = sorted(docs_dir.glob("*.yaml"))
    files.sort(key=lambda p: (p.name != "shared.yaml", p.name))

    defs: dict[str, Any] = {}
    properties: dict[str, Any] = {}

    for path in files:
        data = yaml.safe_load(path.read_text()) or {}
        _deep_merge(defs, data.get("$defs") or {})
        _deep_merge(properties, data.get("properties") or {})

    return {"$defs": defs, "properties": properties}


def load_agent_recipes(path: Path) -> list[dict[str, Any]]:
    """Load the curated agent-recipes YAML file.

    Returns the list under the top-level `recipes:` key. Each entry must
    have `id`, `summary`, `snippet` (the loader does not validate the
    shape — emit_agent_index does).
    """
    data = yaml.safe_load(path.read_text()) or {}
    recipes = data.get("recipes") or []
    if not isinstance(recipes, list):
        raise ValueError(f"{path}: top-level `recipes:` must be a list")
    return recipes


def _build_structure_manifest(structure_dir: Path) -> dict[str, str]:
    """Return {top_level_key: 'schema/structure/<file>.yaml'} by scanning the dir once."""
    manifest: dict[str, str] = {}
    for path in sorted(structure_dir.glob("*.yaml")):
        data = yaml.safe_load(path.read_text()) or {}
        for key in (data.get("properties") or {}):
            manifest.setdefault(key, f"schema/structure/{path.name}")
    return manifest


def _summary(text: str | None, cap: int = 120) -> str:
    """First line/sentence of `text`, truncated to `cap` chars."""
    if not text:
        return ""
    first_line = text.strip().split("\n", 1)[0]
    if len(first_line) <= cap:
        return first_line
    return first_line[: cap - 1].rstrip() + "…"


def _resolve_ref(ref_str: Any, full_schema: dict[str, Any]) -> dict[str, Any]:
    """Resolve a '#/$defs/Foo' pointer against full_schema['$defs']."""
    if not isinstance(ref_str, str) or not ref_str.startswith("#/$defs/"):
        return {}
    name = ref_str[len("#/$defs/"):]
    return (full_schema.get("$defs") or {}).get(name, {})


def _child_keys(
    prop_schema: dict[str, Any],
    full_schema: dict[str, Any],
) -> tuple[list[str], list[str]]:
    """Return (required_keys, common_keys) for a top-level property.

    Handles four shapes seen in values.schema.json:
    - Map of $ref values (deployments, jobs, …): resolve $ref, peek there.
    - Map of inline objects: peek into additionalProperties directly.
    - Top-level $ref (deploymentsGeneral): resolve $ref, peek there.
    - Plain object with inline properties (generic): peek prop_schema.
    """
    if "$ref" in prop_schema:
        item_schema = _resolve_ref(prop_schema["$ref"], full_schema)
    else:
        add_props = prop_schema.get("additionalProperties")
        if isinstance(add_props, dict) and "$ref" in add_props:
            item_schema = _resolve_ref(add_props["$ref"], full_schema)
        elif isinstance(add_props, dict) and add_props.get("type") == "object":
            item_schema = add_props
        else:
            item_schema = prop_schema

    properties = item_schema.get("properties") or {}
    required = list(item_schema.get("required") or [])
    all_keys = list(properties.keys())
    common = required + [k for k in all_keys if k not in required]
    return required, common[:10]


def emit_agent_index(
    schema: dict[str, Any],
    recipes: list[dict[str, Any]],
    structure_dir: Path,
) -> dict[str, Any]:
    """Build the compact agent-index dict from a fully-merged schema.

    Pure function: takes the merged schema dict (with `$defs` intact for
    ref resolution), the curated recipes list, and the path to
    schema/structure/ (for resolving lookupHint per key). Returns a plain
    dict ready for json.dumps with sort_keys=True.
    """
    structure_manifest = _build_structure_manifest(structure_dir)
    top_level_keys: dict[str, Any] = {}
    for key in sorted((schema.get("properties") or {}).keys()):
        prop = schema["properties"][key]
        required, common = _child_keys(prop, schema)
        when_to_use_raw = prop.get("x-agent-when-to-use")
        struct_file = structure_manifest.get(key, "schema/structure/")
        entry: dict[str, Any] = {
            "type": prop.get("type", "object"),
            "summary": _summary(prop.get("description")),
            "requiredChildKeys": required,
            "commonChildKeys": common,
            "lookupHint": f"{struct_file} + schema/docs/{Path(struct_file).name}",
            "fullSchemaPath": f"#/properties/{key}",
        }
        if when_to_use_raw:
            entry["whenToUse"] = _summary(when_to_use_raw)
        top_level_keys[key] = entry

    return {
        "$schemaVersion": "1",
        "generatedFrom": "values.schema.json",
        "topLevelKeys": top_level_keys,
        "recipes": [
            {
                "id": r["id"],
                "summary": r["summary"],
                "snippet": r["snippet"],
            }
            for r in recipes
        ],
    }


def merge_layers(structure: dict[str, Any], docs: dict[str, Any]) -> dict[str, Any]:
    """Merge docs metadata into the structure tree.

    For each node in structure, if a matching node exists in docs,
    docs contributes only the DOC_KEYS fields. Structure-defined keys
    (type, properties, $ref, required, etc.) are never overwritten.

    Returns a new merged dict; inputs are not mutated.
    """
    merged: dict[str, Any] = {
        "$defs": {},
        "properties": {},
    }

    for name, struct_node in structure["$defs"].items():
        merged["$defs"][name] = _merge_node(
            struct_node, docs["$defs"].get(name, {})
        )

    for name, struct_node in structure["properties"].items():
        merged["properties"][name] = _merge_node(
            struct_node, docs["properties"].get(name, {})
        )

    return merged


def _merge_node(struct_node: Any, doc_node: Any) -> Any:
    """Inject DOC_KEYS from doc_node into struct_node (recursively).

    Walks structure-known keys: properties, items, $defs, additionalProperties,
    oneOf/anyOf/allOf arrays, if/then/else.
    """
    if not isinstance(struct_node, dict):
        return struct_node

    out: dict[str, Any] = copy.deepcopy(struct_node)

    if isinstance(doc_node, dict):
        for k in DOC_KEYS:
            if k in doc_node:
                out[k] = doc_node[k]

        if "properties" in out and isinstance(out["properties"], dict):
            for pname, pnode in out["properties"].items():
                # docs may use either {properties: {x: {...}}} OR {x: {...}}
                # to describe properties of an object. Try both.
                doc_pnode = (
                    (doc_node.get("properties") or {}).get(pname)
                    if isinstance(doc_node.get("properties"), dict)
                    else None
                )
                if doc_pnode is None:
                    doc_pnode = doc_node.get(pname) if isinstance(doc_node, dict) else None
                if doc_pnode is None:
                    continue
                out["properties"][pname] = _merge_node(pnode, doc_pnode)

        if "additionalProperties" in out and isinstance(out["additionalProperties"], dict):
            out["additionalProperties"] = _merge_node(
                out["additionalProperties"],
                doc_node.get("additionalProperties") or {},
            )

        if "items" in out and isinstance(out["items"], dict):
            out["items"] = _merge_node(out["items"], doc_node.get("items") or {})

    return out


def _deep_merge(dst: dict[str, Any], src: dict[str, Any]) -> None:
    """Recursively merge src into dst. dst is mutated in place.

    On scalar conflicts, src wins. On dict conflicts, recurse.
    On list conflicts, src replaces dst.
    """
    for k, v in src.items():
        if (
            k in dst
            and isinstance(dst[k], dict)
            and isinstance(v, dict)
        ):
            _deep_merge(dst[k], v)
        else:
            dst[k] = v


def write_schema(schema: dict[str, Any], path: Path) -> None:
    """Self-validate the schema against draft-07 meta-schema and write to path.

    Output: 2-space indent, sorted keys, trailing newline.
    """
    # Validate against the draft-07 meta-schema
    meta = jsonschema.Draft7Validator.META_SCHEMA
    jsonschema.Draft7Validator(meta).validate(schema)

    text = json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False)
    path.write_text(text + "\n")


SCHEMA_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT = SCHEMA_DIR.parent / "charts" / "idlefy-universal" / "values.schema.json"


@dataclass(frozen=True)
class LintError:
    level: str   # "error" | "warning"
    path: str
    message: str


def load_lint_config(path: Path | None = None) -> dict[str, Any]:
    """Read lint config from YAML. If path is None, use the default location.

    Normalises two keys so callers can always rely on them being present:
    - ``allow_additional_properties_true``: list of JSON-pointer paths where
      ``additionalProperties: true`` is permitted (rule 4 whitelist).
    - ``deployment_defaults_parity_exempt``: list of property names skipped by
      rule 9 ("DeploymentSpec keys == DeploymentDefaultsSpec keys").
    """
    if path is None:
        path = SCHEMA_DIR / "lint-config.yaml"
    if not path.exists():
        return {"allow_additional_properties_true": []}
    data = yaml.safe_load(path.read_text()) or {}
    data.setdefault("allow_additional_properties_true", [])
    data.setdefault("deployment_defaults_parity_exempt", [])
    return data


def _has_root_docs(doc_node: Any) -> bool:
    """Return True if doc_node provides root-level description+examples."""
    if not isinstance(doc_node, dict):
        return False
    desc = doc_node.get("description", "")
    if not isinstance(desc, str) or len(desc.strip()) < 20:
        return False
    examples = doc_node.get("examples")
    return isinstance(examples, list) and len(examples) >= 1


def lint(
    structure: dict[str, Any],
    docs: dict[str, Any],
    lint_config: dict[str, Any] | None = None,
) -> list[LintError]:
    """Run all lint rules. Returns errors and warnings.

    Rules implemented:
      1. Every $ref resolves to an existing $defs/<Name>.
      2. No cyclic $ref chains.
      3. Every object with 'properties' declares 'additionalProperties'.
      4. additionalProperties: true requires a whitelist entry in lint-config.yaml.
    """
    if lint_config is None:
        lint_config = load_lint_config()
    whitelist = set(lint_config.get("allow_additional_properties_true", []))

    errors: list[LintError] = []
    def_names = set(structure["$defs"].keys())

    def walk(node: Any, path: str, ref_stack: tuple[str, ...] = ()) -> None:
        if not isinstance(node, dict):
            if isinstance(node, list):
                for i, v in enumerate(node):
                    walk(v, f"{path}[{i}]", ref_stack)
            return

        ref = node.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/$defs/"):
            target = ref[len("#/$defs/"):]
            if target not in def_names:
                errors.append(LintError(
                    level="error",
                    path=path,
                    message=f"dangling $ref: '{ref}' (no $defs/{target})",
                ))
            elif target in ref_stack:
                errors.append(LintError(
                    level="error",
                    path=path,
                    message=f"$ref cycle detected: {' -> '.join(ref_stack + (target,))}",
                ))
            else:
                walk(structure["$defs"][target], f"#/$defs/{target}", ref_stack + (target,))

        # Rule: object with 'properties' must declare 'additionalProperties'.
        # Exception: if/then/else branches are constraint schemas, not full objects.
        if "properties" in node and isinstance(node["properties"], dict):
            in_conditional = (
                path.endswith("/if") or path.endswith("/then") or path.endswith("/else")
            )
            if "additionalProperties" not in node and not in_conditional:
                errors.append(LintError(
                    level="error",
                    path=path,
                    message="object with 'properties' is missing 'additionalProperties'",
                ))

        if node.get("additionalProperties") is True and path not in whitelist:
            errors.append(LintError(
                level="error",
                path=path,
                message=(
                    "additionalProperties: true requires whitelist entry in "
                    "schema/lint-config.yaml"
                ),
            ))

        for k, v in node.items():
            if k == "$ref":
                continue
            walk(v, f"{path}/{k}", ref_stack)

    for name, body in structure["properties"].items():
        walk(body, f"/properties/{name}")
    for name, body in structure["$defs"].items():
        walk(body, f"#/$defs/{name}")

    # Warning rules: missing description / examples on non-leaf nodes
    def is_non_leaf(node: dict) -> bool:
        return (
            isinstance(node, dict)
            and ("properties" in node or "items" in node or "additionalProperties" in node)
        )

    def walk_docs(struct_node: Any, doc_node: Any, path: str) -> None:
        if not isinstance(struct_node, dict):
            return
        if is_non_leaf(struct_node) and path:  # skip root (path=="") to avoid spurious warnings
            doc_dict = doc_node if isinstance(doc_node, dict) else {}
            desc = doc_dict.get("description", "")
            if not isinstance(desc, str) or len(desc.strip()) < 20:
                errors.append(LintError(
                    level="warning",
                    path=path,
                    message="non-leaf field missing description (>=20 chars)",
                ))
            examples = doc_dict.get("examples")
            if not isinstance(examples, list) or len(examples) < 1:
                errors.append(LintError(
                    level="warning",
                    path=path,
                    message="non-leaf field missing examples (>=1 entry)",
                ))
        if isinstance(struct_node.get("properties"), dict):
            for pname, pnode in struct_node["properties"].items():
                doc_pnode = (
                    (doc_node.get("properties") or {}).get(pname)
                    if isinstance(doc_node, dict) and isinstance(doc_node.get("properties"), dict)
                    else None
                )
                if doc_pnode is None and isinstance(doc_node, dict):
                    doc_pnode = doc_node.get(pname)
                walk_docs(pnode, doc_pnode, f"{path}/properties/{pname}")
        if isinstance(struct_node.get("additionalProperties"), dict):
            doc_ap = doc_node.get("additionalProperties") if isinstance(doc_node, dict) else None
            walk_docs(
                struct_node["additionalProperties"], doc_ap,
                f"{path}/additionalProperties",
            )
        if isinstance(struct_node.get("items"), dict):
            doc_items = doc_node.get("items") if isinstance(doc_node, dict) else None
            walk_docs(struct_node["items"], doc_items, f"{path}/items")

    walk_docs(
        {"properties": structure["properties"], "additionalProperties": False},
        {"properties": docs["properties"]},
        "",
    )
    for name, body in structure["$defs"].items():
        doc_node = docs["$defs"].get(name)
        if name.startswith("k8s.io.") and _has_root_docs(doc_node):
            # Vendored K8s type with adequate root-level docs:
            # treat the whole subtree as documented to avoid
            # demanding description+examples on every nested array
            # or inline object (e.g. PodAffinityTerm.namespaces).
            continue
        walk_docs(body, doc_node, f"#/$defs/{name}")

    # Error rule: orphan docs paths (docs without structure twin)
    def collect_struct_paths(node: Any, path: str) -> set[str]:
        out: set[str] = set()
        if isinstance(node, dict):
            out.add(path)
            for k, v in node.items():
                out |= collect_struct_paths(v, f"{path}/{k}")
        return out

    struct_paths = collect_struct_paths(structure, "")

    def check_doc_paths(node: Any, path: str) -> None:
        if not isinstance(node, dict):
            return
        for k, v in node.items():
            child = f"{path}/{k}"
            if child not in struct_paths and k not in DOC_KEYS:
                errors.append(LintError(
                    level="error",
                    path=child,
                    message=f"docs path '{k}' has no matching structure node",
                ))
            check_doc_paths(v, child)

    check_doc_paths(docs, "")

    # Rule 9: DeploymentSpec property keys ≡ DeploymentDefaultsSpec property keys
    # Keys listed under `deployment_defaults_parity_exempt` in lint-config.yaml
    # are excluded from this check (e.g. per-instance-only features that
    # intentionally have no global default counterpart).
    spec = structure["$defs"].get("DeploymentSpec")
    defaults = structure["$defs"].get("DeploymentDefaultsSpec")
    parity_exempt = set(lint_config.get("deployment_defaults_parity_exempt", []) or [])
    if isinstance(spec, dict) and isinstance(defaults, dict):
        spec_keys = set((spec.get("properties") or {}).keys()) - parity_exempt
        defaults_keys = set((defaults.get("properties") or {}).keys()) - parity_exempt
        for k in sorted(spec_keys - defaults_keys):
            errors.append(LintError(
                level="error",
                path="#/$defs/DeploymentDefaultsSpec",
                message=f"property '{k}' present in DeploymentSpec but missing from DeploymentDefaultsSpec",
            ))
        for k in sorted(defaults_keys - spec_keys):
            errors.append(LintError(
                level="error",
                path="#/$defs/DeploymentSpec",
                message=f"property '{k}' present in DeploymentDefaultsSpec but missing from DeploymentSpec",
            ))

    return errors


def cmd_lint(args: argparse.Namespace) -> int:
    k8s_defs = load_k8s_primitives(SCHEMA_DIR / "k8s")
    structure = load_structure(SCHEMA_DIR / "structure", seed=k8s_defs)
    docs = load_docs(SCHEMA_DIR / "docs")
    errors = lint(structure, docs)

    blocking = 0
    for e in errors:
        print(f"[{e.level}] {e.path}: {e.message}", file=sys.stderr)
        if e.level == "error":
            blocking += 1
    if blocking:
        print(f"\n{blocking} error(s) found", file=sys.stderr)
        return 1
    print(f"lint OK ({len(errors)} warning(s))")
    return 0


_EXPECTED_RE = re.compile(r"^#\s*expected_error\s*:\s*(.+?)\s*$", re.MULTILINE)


@dataclass(frozen=True)
class FixtureResult:
    path: str
    ok: bool
    message: str


def validate_fixtures(schema: dict, fixtures_dir: Path) -> list[FixtureResult]:
    results: list[FixtureResult] = []
    validator = jsonschema.Draft7Validator(schema)

    for p in sorted((fixtures_dir / "valid").glob("*.yaml")):
        data = yaml.safe_load(p.read_text()) or {}
        errs = list(validator.iter_errors(data))
        if errs:
            results.append(FixtureResult(
                str(p), False,
                f"valid fixture failed: {errs[0].message}",
            ))
        else:
            results.append(FixtureResult(str(p), True, "OK"))

    for p in sorted((fixtures_dir / "invalid").glob("*.yaml")):
        text = p.read_text()
        m = _EXPECTED_RE.search(text)
        if not m:
            results.append(FixtureResult(
                str(p), False,
                "invalid fixture missing '# expected_error: <substring>' comment",
            ))
            continue
        expected = m.group(1)
        data = yaml.safe_load(text) or {}
        errs = list(validator.iter_errors(data))
        if not errs:
            results.append(FixtureResult(
                str(p), False,
                f"invalid fixture passed validation (expected_error: {expected})",
            ))
            continue
        haystack = " | ".join(e.message for e in errs)
        if expected not in haystack:
            results.append(FixtureResult(
                str(p), False,
                f"invalid fixture failed but error '{haystack}' missing expected '{expected}'",
            ))
        else:
            results.append(FixtureResult(str(p), True, "OK"))

    return results


def cmd_validate_fixtures(args: argparse.Namespace) -> int:
    k8s_defs = load_k8s_primitives(SCHEMA_DIR / "k8s")
    structure = load_structure(SCHEMA_DIR / "structure", seed=k8s_defs)
    docs = load_docs(SCHEMA_DIR / "docs")
    merged = merge_layers(structure, docs)
    schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "Idlefy Universal Chart values",
        "type": "object",
        "additionalProperties": True,
        "$defs": merged["$defs"],
        "properties": merged["properties"],
    }
    fixtures_dir = Path(args.fixtures_dir) if args.fixtures_dir else SCHEMA_DIR / "fixtures"

    if args.values:
        validator = jsonschema.Draft7Validator(schema)
        data = yaml.safe_load(Path(args.values).read_text()) or {}
        errs = list(validator.iter_errors(data))
        if errs:
            for e in errs:
                print(f"[error] {'/'.join(str(p) for p in e.absolute_path)}: {e.message}", file=sys.stderr)
            return 1
        print(f"{args.values}: OK")
        return 0

    results = validate_fixtures(schema, fixtures_dir)
    failed = 0
    for r in results:
        if r.ok:
            print(f"[ok] {r.path}")
        else:
            print(f"[FAIL] {r.path}: {r.message}", file=sys.stderr)
            failed += 1
    return 1 if failed else 0


def _format_example(value: Any) -> str:
    """Format an example for the Markdown YAML code-block."""
    if isinstance(value, (dict, list)):
        return yaml.safe_dump(value, default_flow_style=False).rstrip()
    if isinstance(value, str):
        return value
    return json.dumps(value)


def _render_metadata(node: dict[str, Any], lines: list[str]) -> None:
    """Append description, when-to-use, related-fields, common-mistakes, example."""
    if "description" in node:
        lines.append(node["description"].strip())
        lines.append("")
    if "x-agent-when-to-use" in node:
        lines.append("**When to use:** " + node["x-agent-when-to-use"].strip())
        lines.append("")
    if "x-agent-related-fields" in node:
        lines.append("**Related fields:**")
        for f in node["x-agent-related-fields"]:
            lines.append(f"- `{f}`")
        lines.append("")
    if "x-agent-common-mistakes" in node:
        lines.append("**Common mistakes:**")
        for m in node["x-agent-common-mistakes"]:
            lines.append(f"- {m}")
        lines.append("")
    if "x-agent-example-use-case" in node:
        lines.append("_Example use case:_ " + node["x-agent-example-use-case"].strip())
        lines.append("")
    examples = node.get("examples", [])
    if examples:
        lines.append("**Example:**")
        lines.append("")
        lines.append("```yaml")
        lines.append(_format_example(examples[0]))
        lines.append("```")
        lines.append("")


def _render_properties(node: dict[str, Any], lines: list[str], heading_level: int) -> None:
    """Render nested properties of an object type."""
    props = node.get("properties") or {}
    if not props:
        return
    prefix = "#" * heading_level
    for pname in sorted(props.keys()):
        pnode = props[pname]
        lines.append(f"{prefix} {pname}")
        lines.append("")
        if isinstance(pnode, dict) and "type" in pnode:
            lines.append(f"_Type:_ `{pnode['type']}`")
            if "enum" in pnode:
                lines.append(f", _enum:_ `{pnode['enum']}`")
            lines.append("")
        _render_metadata(pnode if isinstance(pnode, dict) else {}, lines)


def render_docs(schema: dict[str, Any], out_path: Path) -> None:
    """Render the merged schema as a human-readable Markdown reference."""
    lines: list[str] = []
    lines.append("# Idlefy Universal Chart — Values Reference")
    lines.append("")
    lines.append(
        "_Auto-generated by `python -m schema.build render-docs`. Do not edit "
        "this file directly — modify `schema/structure/` or `schema/docs/` instead._"
    )
    lines.append("")
    lines.append("## Top-level fields")
    lines.append("")

    for name in sorted(schema.get("properties", {}).keys()):
        node = schema["properties"][name]
        lines.append(f"## {name}")
        lines.append("")
        _render_metadata(node, lines)

    defs = schema.get("$defs", {})
    if defs:
        lines.append("## $defs")
        lines.append("")
        for name in sorted(defs.keys()):
            node = defs[name]
            lines.append(f"### {name}")
            lines.append("")
            _render_metadata(node, lines)
            _render_properties(node, lines, heading_level=4)

    out_path.write_text("\n".join(lines))


def cmd_render_docs(args: argparse.Namespace) -> int:
    k8s_defs = load_k8s_primitives(SCHEMA_DIR / "k8s")
    structure = load_structure(SCHEMA_DIR / "structure", seed=k8s_defs)
    docs = load_docs(SCHEMA_DIR / "docs")
    merged = merge_layers(structure, docs)
    schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "Idlefy Universal Chart values",
        "type": "object",
        "additionalProperties": False,
        "$defs": merged["$defs"],
        "properties": merged["properties"],
    }
    out = Path(args.output) if args.output else SCHEMA_DIR.parent / "docs" / "reference" / "values.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    render_docs(schema, out)
    print(f"wrote {out}")
    return 0


def cmd_agent_index(args: argparse.Namespace) -> int:
    k8s_defs = load_k8s_primitives(SCHEMA_DIR / "k8s")
    structure = load_structure(SCHEMA_DIR / "structure", seed=k8s_defs)
    docs = load_docs(SCHEMA_DIR / "docs")
    schema = merge_layers(structure, docs)
    recipes = load_agent_recipes(SCHEMA_DIR / "agent-recipes.yaml")
    idx = emit_agent_index(schema, recipes, SCHEMA_DIR / "structure")
    out = (
        Path(args.output)
        if args.output
        else SCHEMA_DIR.parent / "charts" / "idlefy-universal" / "agent-index.json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(idx, sort_keys=True, indent=2) + "\n"
    out.write_text(serialized)
    print(f"wrote {out} ({len(serialized.encode('utf-8'))} bytes)")
    return 0


def cmd_build(args: argparse.Namespace) -> int:
    k8s_defs = load_k8s_primitives(SCHEMA_DIR / "k8s")
    structure = load_structure(SCHEMA_DIR / "structure", seed=k8s_defs)
    docs = load_docs(SCHEMA_DIR / "docs")
    merged = merge_layers(structure, docs)

    schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "Idlefy Universal Chart values",
        "type": "object",
        "additionalProperties": True,
        "$defs": merged["$defs"],
        "properties": merged["properties"],
    }

    out = Path(args.output) if args.output else DEFAULT_OUTPUT
    write_schema(schema, out)
    print(f"wrote {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="schema.build")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_build = sub.add_parser("build", help="merge layers and write values.schema.json")
    p_build.add_argument("--output", "-o", default=None)
    p_build.set_defaults(func=cmd_build)

    p_lint = sub.add_parser("lint", help="run lint rules over schema sources")
    p_lint.set_defaults(func=cmd_lint)

    p_vf = sub.add_parser("validate-fixtures", help="validate fixtures or a single file")
    p_vf.add_argument("--fixtures-dir", default=None)
    p_vf.add_argument("--values", default=None, help="path to a single values file to validate")
    p_vf.set_defaults(func=cmd_validate_fixtures)

    p_doc = sub.add_parser("render-docs", help="generate docs/reference/values.md")
    p_doc.add_argument("--output", "-o", default=None)
    p_doc.set_defaults(func=cmd_render_docs)

    p_ai = sub.add_parser("agent-index", help="emit agent-index.json")
    p_ai.add_argument("--output", "-o", default=None)
    p_ai.set_defaults(func=cmd_agent_index)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
