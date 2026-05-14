from pathlib import Path

import pytest
import yaml

from schema.build import load_docs, load_structure


def test_load_structure_returns_defs_and_properties(tmp_structure: Path):
    (tmp_structure / "shared.yaml").write_text(
        yaml.safe_dump({
            "$defs": {"ContainerSpec": {"type": "object", "additionalProperties": False}},
        })
    )
    (tmp_structure / "deployments.yaml").write_text(
        yaml.safe_dump({
            "properties": {"deployments": {"type": "object", "additionalProperties": True}},
        })
    )

    result = load_structure(tmp_structure)

    assert "ContainerSpec" in result["$defs"]
    assert "deployments" in result["properties"]


def test_load_structure_merges_multiple_defs(tmp_structure: Path):
    (tmp_structure / "shared.yaml").write_text(
        yaml.safe_dump({"$defs": {"A": {"type": "string"}}})
    )
    (tmp_structure / "deployments.yaml").write_text(
        yaml.safe_dump({"$defs": {"B": {"type": "integer"}}})
    )

    result = load_structure(tmp_structure)

    assert set(result["$defs"].keys()) == {"A", "B"}


def test_load_structure_duplicate_def_raises(tmp_structure: Path):
    (tmp_structure / "shared.yaml").write_text(
        yaml.safe_dump({"$defs": {"A": {"type": "string"}}})
    )
    (tmp_structure / "deployments.yaml").write_text(
        yaml.safe_dump({"$defs": {"A": {"type": "integer"}}})
    )

    with pytest.raises(ValueError, match="duplicate"):
        load_structure(tmp_structure)


def test_load_docs_returns_defs_and_properties(tmp_docs: Path):
    (tmp_docs / "shared.yaml").write_text(
        yaml.safe_dump({
            "$defs": {"ContainerSpec": {"image": {"description": "Image name."}}},
        })
    )
    (tmp_docs / "deployments.yaml").write_text(
        yaml.safe_dump({
            "properties": {"deployments": {"description": "Deployment map."}},
        })
    )

    result = load_docs(tmp_docs)

    assert result["$defs"]["ContainerSpec"]["image"]["description"] == "Image name."
    assert result["properties"]["deployments"]["description"] == "Deployment map."


def test_load_docs_empty_dir_returns_empty(tmp_docs: Path):
    result = load_docs(tmp_docs)
    assert result == {"$defs": {}, "properties": {}}
