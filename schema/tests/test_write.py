import json
from pathlib import Path

import pytest

from schema.build import write_schema


def test_write_schema_emits_valid_draft07(tmp_path: Path):
    schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "Test",
        "type": "object",
        "additionalProperties": False,
        "properties": {"x": {"type": "integer"}},
    }
    out = tmp_path / "out.json"

    write_schema(schema, out)

    loaded = json.loads(out.read_text())
    assert loaded["title"] == "Test"
    assert loaded["properties"]["x"]["type"] == "integer"


def test_write_schema_sorted_keys_stable(tmp_path: Path):
    schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "additionalProperties": False,
        "properties": {"b": {"type": "string"}, "a": {"type": "integer"}},
    }
    out = tmp_path / "out.json"

    write_schema(schema, out)
    text = out.read_text()
    idx_a = text.index('"a"')
    idx_b = text.index('"b"')
    assert idx_a < idx_b


def test_write_schema_invalid_raises(tmp_path: Path):
    schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "additionalProperties": 42,
    }
    out = tmp_path / "out.json"

    with pytest.raises(Exception):
        write_schema(schema, out)
