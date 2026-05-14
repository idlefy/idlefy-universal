from pathlib import Path

from schema.build import render_docs


def test_render_docs_emits_section_per_top_level(tmp_path: Path):
    schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "Test",
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "deployments": {
                "type": "object",
                "description": "Map of deployments.",
                "examples": [{"app": {"replicas": 1}}],
                "x-agent-when-to-use": "Long-running workloads.",
            },
            "configs": {
                "type": "object",
                "description": "ConfigMaps and Secrets.",
            },
        },
        "$defs": {
            "ContainerSpec": {
                "type": "object",
                "description": "A container.",
            },
        },
    }
    out = tmp_path / "values-reference.md"
    render_docs(schema, out)
    text = out.read_text()

    assert "# Idlefy Universal Chart — Values Reference" in text
    assert "## deployments" in text
    assert "## configs" in text
    assert "Map of deployments." in text
    assert "Long-running workloads." in text
    assert "## $defs" in text
    assert "### ContainerSpec" in text


def test_render_docs_includes_examples_as_yaml_blocks(tmp_path: Path):
    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "deployments": {
                "type": "object",
                "description": "...",
                "examples": [{"app": {"replicas": 2}}],
            },
        },
        "$defs": {},
    }
    out = tmp_path / "out.md"
    render_docs(schema, out)
    text = out.read_text()
    assert "```yaml" in text
    assert "replicas: 2" in text


def test_render_docs_emits_all_agent_metadata(tmp_path: Path):
    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "x": {
                "type": "object",
                "description": "X.",
                "x-agent-when-to-use": "When X applies.",
                "x-agent-related-fields": ["/y", "/z"],
                "x-agent-common-mistakes": ["forgetting to set X"],
                "x-agent-example-use-case": "Setting X to enable feature Y",
            },
        },
        "$defs": {},
    }
    out = tmp_path / "out.md"
    render_docs(schema, out)
    text = out.read_text()
    assert "When X applies." in text
    assert "/y" in text and "/z" in text
    assert "forgetting to set X" in text
    assert "Setting X to enable feature Y" in text


def test_render_docs_recurses_into_def_properties(tmp_path: Path):
    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {},
        "$defs": {
            "ContainerSpec": {
                "type": "object",
                "description": "A container.",
                "properties": {
                    "image": {"type": "string", "description": "Image name."},
                    "imageTag": {"type": "string", "description": "Image tag."},
                },
            },
        },
    }
    out = tmp_path / "out.md"
    render_docs(schema, out)
    text = out.read_text()
    assert "#### image" in text
    assert "#### imageTag" in text
    assert "Image name." in text


def test_render_docs_handles_scalar_examples(tmp_path: Path):
    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "version": {
                "type": "string",
                "description": "...",
                "examples": ["v1.0.0"],
            },
        },
        "$defs": {},
    }
    out = tmp_path / "out.md"
    render_docs(schema, out)
    text = out.read_text()
    assert "v1.0.0" in text
