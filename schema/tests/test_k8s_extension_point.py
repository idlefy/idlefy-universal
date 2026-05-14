"""Tests for the K8s primitives extension point in build.py."""
from __future__ import annotations

import json
import pytest

from schema.build import load_k8s_primitives, load_structure


def test_returns_empty_when_manifest_absent(tmp_path):
    # k8s/ dir without manifest.yaml
    assert load_k8s_primitives(tmp_path) == {}


def test_returns_empty_when_version_missing(tmp_path):
    (tmp_path / "manifest.yaml").write_text("upstream: {}\n")
    assert load_k8s_primitives(tmp_path) == {}


def test_returns_empty_when_definitions_json_absent(tmp_path):
    (tmp_path / "manifest.yaml").write_text(
        "upstream:\n  source: x\n  ref: abc\n  k8s_version: v1.35.0\n  fetched_at: '2026-05-12'\n"
    )
    # No v1.35.0/definitions.json file
    assert load_k8s_primitives(tmp_path) == {}


def test_loads_all_defs_from_json(tmp_path):
    (tmp_path / "manifest.yaml").write_text(
        "upstream:\n  source: x\n  ref: abc\n  k8s_version: v1.35.0\n  fetched_at: '2026-05-12'\n"
    )
    (tmp_path / "v1.35.0").mkdir()
    (tmp_path / "v1.35.0" / "definitions.json").write_text(json.dumps({
        "definitions": {
            "k8s.io.api.core.v1.Toleration": {"type": "object", "properties": {"key": {"type": "string"}}},
            "k8s.io.apimachinery.pkg.apis.meta.v1.LabelSelector": {"type": "object"},
        }
    }))
    out = load_k8s_primitives(tmp_path)
    assert "k8s.io.api.core.v1.Toleration" in out
    assert "k8s.io.apimachinery.pkg.apis.meta.v1.LabelSelector" in out


def test_seed_is_merged_into_load_structure(tmp_path):
    structure_dir = tmp_path / "structure"
    structure_dir.mkdir()
    (structure_dir / "test.yaml").write_text(
        "properties:\n  foo: {type: string}\n"
    )
    seed = {"k8s.io.api.core.v1.Toleration": {"type": "object", "additionalProperties": True}}
    out = load_structure(structure_dir, seed=seed)
    assert "k8s.io.api.core.v1.Toleration" in out["$defs"]


def test_duplicate_key_between_seed_and_structure_raises(tmp_path):
    structure_dir = tmp_path / "structure"
    structure_dir.mkdir()
    (structure_dir / "test.yaml").write_text(
        "$defs:\n  k8s.io.api.core.v1.Toleration: {type: object, additionalProperties: true}\n"
    )
    seed = {"k8s.io.api.core.v1.Toleration": {"type": "object", "additionalProperties": True}}
    with pytest.raises(ValueError, match="duplicate"):
        load_structure(structure_dir, seed=seed)


def test_has_root_docs_threshold():
    from schema.build import _has_root_docs
    assert _has_root_docs(None) is False
    assert _has_root_docs({}) is False
    assert _has_root_docs({"description": "short"}) is False
    assert _has_root_docs({"description": "x" * 20}) is False  # no examples
    assert _has_root_docs({"description": "x" * 20, "examples": []}) is False
    assert _has_root_docs({"description": "x" * 20, "examples": [{}]}) is True


def test_lint_skips_descendant_warnings_for_documented_k8s_root(tmp_path, monkeypatch):
    """A documented k8s.io.* root suppresses nested-non-leaf warnings."""
    from schema.build import lint
    structure = {
        "$defs": {
            "k8s.io.api.core.v1.Affinity": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "deeply": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
            },
        },
        "properties": {},
    }
    docs = {
        "$defs": {
            "k8s.io.api.core.v1.Affinity": {
                "description": "A documented vendored type at root.",
                "examples": [{}],
            },
        },
        "properties": {},
    }
    errs = lint(structure, docs)
    # No warnings about nested 'deeply' field
    warnings = [e for e in errs if e.level == "warning"]
    deeply_warnings = [w for w in warnings if "deeply" in w.path]
    assert deeply_warnings == [], f"unexpected nested warnings: {deeply_warnings}"


def test_seal_objects_injects_ap_false_recursively():
    from schema.extract_k8s_subset import _seal_objects
    inp = {
        "type": "object",
        "properties": {
            "nested": {
                "type": "object",
                "properties": {"field": {"type": "string"}},
            },
            "with_map": {
                "type": "object",
                "additionalProperties": {"type": "string"},
            },
            "leaf": {"type": "string"},
            "in_array": {
                "type": "array",
                "items": {"type": "object", "properties": {"k": {"type": "integer"}}},
            },
        },
    }
    out = _seal_objects(inp)
    # Top level got sealed
    assert out["additionalProperties"] is False
    # Nested object got sealed
    assert out["properties"]["nested"]["additionalProperties"] is False
    # Map-value-schema preserved (not clobbered to False)
    assert out["properties"]["with_map"]["additionalProperties"] == {"type": "string"}
    # Array's items object got sealed
    assert out["properties"]["in_array"]["items"]["additionalProperties"] is False
    # No spurious AP on the leaf string
    assert "additionalProperties" not in out["properties"]["leaf"]


def test_rewrites_internal_refs(tmp_path):
    (tmp_path / "manifest.yaml").write_text(
        "upstream:\n  source: x\n  ref: abc\n  k8s_version: v1.35.0\n  fetched_at: '2026-05-12'\n"
    )
    (tmp_path / "v1.35.0").mkdir()
    (tmp_path / "v1.35.0" / "definitions.json").write_text(json.dumps({
        "definitions": {
            "k8s.io.api.core.v1.Affinity": {
                "type": "object",
                "properties": {
                    "nodeAffinity": {"$ref": "#/definitions/k8s.io.api.core.v1.NodeAffinity"}
                },
            },
        }
    }))
    out = load_k8s_primitives(tmp_path)
    affinity = out["k8s.io.api.core.v1.Affinity"]
    assert affinity["properties"]["nodeAffinity"]["$ref"] == "#/$defs/k8s.io.api.core.v1.NodeAffinity"


def test_definitions_json_is_byte_identical_after_load(tmp_path):
    """The vendored definitions.json must round-trip through json.loads/dumps.

    If the file format ever drifts from the extractor's output convention,
    this test catches it before Phase 2 migrations land.
    """
    from pathlib import Path
    repo_root = Path(__file__).resolve().parents[2]
    defs_path = repo_root / "schema" / "k8s" / "v1.35.0" / "definitions.json"
    original = defs_path.read_text()
    data = json.loads(original)
    canonical = json.dumps(data, indent=2, sort_keys=True) + "\n"
    assert original == canonical, "schema/k8s/v1.35.0/definitions.json is not extractor-canonical"
