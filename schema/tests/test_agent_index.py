"""Unit tests for emit_agent_index."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from schema.build import (
    emit_agent_index,
    load_agent_recipes,
    load_docs,
    load_k8s_primitives,
    load_structure,
    merge_layers,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
STRUCTURE_DIR = REPO_ROOT / "schema" / "structure"
DOCS_DIR = REPO_ROOT / "schema" / "docs"
K8S_DIR = REPO_ROOT / "schema" / "k8s" / "v1.35.0"
RECIPES_FILE = REPO_ROOT / "schema" / "agent-recipes.yaml"


@pytest.fixture(scope="module")
def merged_schema() -> dict:
    seed = load_k8s_primitives(K8S_DIR)
    structure = load_structure(STRUCTURE_DIR, seed=seed)
    docs = load_docs(DOCS_DIR)
    return merge_layers(structure, docs)


@pytest.fixture(scope="module")
def recipes() -> list[dict]:
    return load_agent_recipes(RECIPES_FILE)


def test_shape(merged_schema, recipes):
    idx = emit_agent_index(merged_schema, recipes, STRUCTURE_DIR)
    assert idx["$schemaVersion"] == "1"
    assert idx["generatedFrom"] == "values.schema.json"
    assert "topLevelKeys" in idx
    assert "recipes" in idx
    assert isinstance(idx["topLevelKeys"], dict)
    assert isinstance(idx["recipes"], list)


def test_top_level_keyset_matches_schema(merged_schema, recipes):
    idx = emit_agent_index(merged_schema, recipes, STRUCTURE_DIR)
    schema_keys = set(merged_schema["properties"].keys())
    index_keys = set(idx["topLevelKeys"].keys())
    assert index_keys == schema_keys


def test_top_level_entry_shape(merged_schema, recipes):
    idx = emit_agent_index(merged_schema, recipes, STRUCTURE_DIR)
    entry = idx["topLevelKeys"]["deployments"]
    assert "type" in entry
    assert "summary" in entry
    assert "lookupHint" in entry
    assert "fullSchemaPath" in entry
    assert entry["fullSchemaPath"] == "#/properties/deployments"
    # deployments uses additionalProperties: {$ref: '#/$defs/DeploymentSpec'}.
    # The generator must resolve the $ref to surface its required keys.
    assert entry["requiredChildKeys"] == ["containers"], (
        f"deployments.requiredChildKeys should be ['containers'], got: "
        f"{entry['requiredChildKeys']}"
    )
    assert "containers" in entry["commonChildKeys"]


def test_when_to_use_omitted_when_absent(merged_schema, recipes):
    # cronJobs lacks `x-agent-when-to-use` at the top level; emit must
    # OMIT the `whenToUse` key entirely rather than emit an empty string.
    idx = emit_agent_index(merged_schema, recipes, STRUCTURE_DIR)
    assert "whenToUse" not in idx["topLevelKeys"]["cronJobs"]


def test_summary_handles_none_and_empty():
    from schema.build import _summary
    assert _summary(None) == ""
    assert _summary("") == ""
    assert _summary("  ") == ""
    long = "a" * 200
    assert len(_summary(long, cap=120)) == 120
    assert _summary(long, cap=120).endswith("…")
    assert _summary("first line\nsecond line") == "first line"


def test_recipes_passed_through(merged_schema, recipes):
    idx = emit_agent_index(merged_schema, recipes, STRUCTURE_DIR)
    assert len(idx["recipes"]) >= 3
    ids = {r["id"] for r in idx["recipes"]}
    assert "web-service" in ids
    for recipe in idx["recipes"]:
        assert set(recipe.keys()) == {"id", "summary", "snippet"}


def test_size_cap(merged_schema, recipes):
    idx = emit_agent_index(merged_schema, recipes, STRUCTURE_DIR)
    serialized = json.dumps(idx, sort_keys=True, indent=2) + "\n"
    assert len(serialized.encode("utf-8")) <= 20_480, (
        f"agent-index.json exceeded 20 KB cap: {len(serialized.encode('utf-8'))} bytes"
    )


def test_byte_determinism(merged_schema, recipes):
    a = emit_agent_index(merged_schema, recipes, STRUCTURE_DIR)
    b = emit_agent_index(merged_schema, recipes, STRUCTURE_DIR)
    serialized_a = json.dumps(a, sort_keys=True, indent=2) + "\n"
    serialized_b = json.dumps(b, sort_keys=True, indent=2) + "\n"
    assert serialized_a.encode("utf-8") == serialized_b.encode("utf-8")


def test_statefulsets_and_daemonsets_present(merged_schema, recipes):
    idx = emit_agent_index(merged_schema, recipes, STRUCTURE_DIR)
    assert "statefulSets" in idx["topLevelKeys"]
    assert "daemonSets" in idx["topLevelKeys"]
    sts_entry = idx["topLevelKeys"]["statefulSets"]
    ds_entry = idx["topLevelKeys"]["daemonSets"]
    assert "serviceName" in sts_entry["requiredChildKeys"]
    assert "containers" in sts_entry["requiredChildKeys"]
    assert ds_entry["requiredChildKeys"] == ["containers"]


def test_new_recipes_present(merged_schema, recipes):
    idx = emit_agent_index(merged_schema, recipes, STRUCTURE_DIR)
    ids = {r["id"] for r in idx["recipes"]}
    assert "stateful-app" in ids
    assert "node-agent" in ids


def test_lookup_hint_resolves_to_existing_files(merged_schema, recipes):
    idx = emit_agent_index(merged_schema, recipes, STRUCTURE_DIR)
    for key, entry in idx["topLevelKeys"].items():
        hint = entry["lookupHint"]
        for part in hint.split(" + "):
            assert (REPO_ROOT / part).is_file(), (
                f"lookupHint for {key!r} points to missing file: {part}"
            )
