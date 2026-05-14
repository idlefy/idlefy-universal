from schema.build import merge_layers


def test_merge_inserts_description_into_property():
    structure = {
        "$defs": {},
        "properties": {
            "replicas": {"type": "integer", "minimum": 0},
        },
    }
    docs = {
        "$defs": {},
        "properties": {
            "replicas": {"description": "Number of replicas.", "examples": [1]},
        },
    }

    result = merge_layers(structure, docs)

    rep = result["properties"]["replicas"]
    assert rep["type"] == "integer"
    assert rep["description"] == "Number of replicas."
    assert rep["examples"] == [1]


def test_merge_inserts_into_defs():
    structure = {
        "$defs": {
            "ContainerSpec": {
                "type": "object",
                "properties": {"image": {"type": "string"}},
            },
        },
        "properties": {},
    }
    docs = {
        "$defs": {
            "ContainerSpec": {
                "image": {"description": "Container image name."},
            },
        },
        "properties": {},
    }

    result = merge_layers(structure, docs)

    image = result["$defs"]["ContainerSpec"]["properties"]["image"]
    assert image["type"] == "string"
    assert image["description"] == "Container image name."


def test_merge_preserves_agent_keywords():
    structure = {
        "$defs": {},
        "properties": {"deployments": {"type": "object"}},
    }
    docs = {
        "$defs": {},
        "properties": {
            "deployments": {
                "description": "Map.",
                "x-agent-when-to-use": "Use for long-running workloads.",
                "x-agent-related-fields": ["/services"],
            },
        },
    }

    result = merge_layers(structure, docs)
    dep = result["properties"]["deployments"]
    assert dep["x-agent-when-to-use"] == "Use for long-running workloads."
    assert dep["x-agent-related-fields"] == ["/services"]


def test_merge_does_not_overwrite_structure_type():
    structure = {"$defs": {}, "properties": {"x": {"type": "integer"}}}
    docs = {"$defs": {}, "properties": {"x": {"description": "X.", "type": "string"}}}

    result = merge_layers(structure, docs)
    # docs cannot override structure's type
    assert result["properties"]["x"]["type"] == "integer"
    assert result["properties"]["x"]["description"] == "X."
