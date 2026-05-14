import yaml
from schema.build import lint, LintError, load_lint_config


def test_lint_detects_dangling_ref():
    structure = {
        "$defs": {"A": {"type": "string"}},
        "properties": {
            "x": {"$ref": "#/$defs/NonExistent"},
        },
    }
    docs = {"$defs": {}, "properties": {}}

    errors = lint(structure, docs)

    assert any(
        e.level == "error" and "NonExistent" in e.message
        for e in errors
    )


def test_lint_no_errors_for_clean_schema():
    structure = {
        "$defs": {"A": {"type": "string"}},
        "properties": {
            "x": {"$ref": "#/$defs/A"},
        },
    }
    docs = {"$defs": {}, "properties": {}}

    errors = lint(structure, docs)
    assert not any(e.level == "error" and "$ref" in e.message for e in errors)


def test_lint_detects_missing_additional_properties():
    structure = {
        "$defs": {},
        "properties": {
            "x": {"type": "object", "properties": {"y": {"type": "string"}}},
        },
    }
    docs = {"$defs": {}, "properties": {}}
    errors = lint(structure, docs, lint_config={"allow_additional_properties_true": []})
    assert any(
        e.level == "error" and "additionalProperties" in e.message
        for e in errors
    )


def test_lint_detects_cyclic_ref():
    structure = {
        "$defs": {
            "A": {"type": "object", "properties": {"b": {"$ref": "#/$defs/B"}}, "additionalProperties": False},
            "B": {"type": "object", "properties": {"a": {"$ref": "#/$defs/A"}}, "additionalProperties": False},
        },
        "properties": {},
    }
    docs = {"$defs": {}, "properties": {}}
    errors = lint(structure, docs, lint_config={"allow_additional_properties_true": []})
    assert any(e.level == "error" and "cycle" in e.message for e in errors)


def test_lint_flags_unauthorized_additional_properties_true():
    structure = {
        "$defs": {},
        "properties": {
            "deployments": {"type": "object", "additionalProperties": True},
        },
    }
    docs = {"$defs": {}, "properties": {}}
    errors = lint(structure, docs, lint_config={"allow_additional_properties_true": []})
    assert any(e.level == "error" and "/properties/deployments" in e.path for e in errors)


def test_lint_allows_whitelisted_additional_properties_true():
    structure = {
        "$defs": {},
        "properties": {
            "deployments": {"type": "object", "additionalProperties": True},
        },
    }
    docs = {"$defs": {}, "properties": {}}
    cfg = {"allow_additional_properties_true": ["/properties/deployments"]}
    errors = lint(structure, docs, lint_config=cfg)
    assert not any(
        e.level == "error" and "additionalProperties" in e.message
        for e in errors
    )


def test_load_lint_config_reads_yaml(tmp_path):
    p = tmp_path / "lint-config.yaml"
    p.write_text(yaml.safe_dump({"allow_additional_properties_true": ["/x"]}))
    cfg = load_lint_config(p)
    assert cfg["allow_additional_properties_true"] == ["/x"]


def test_lint_warns_missing_description():
    structure = {
        "$defs": {},
        "properties": {
            "x": {"type": "object", "additionalProperties": False, "properties": {"y": {"type": "string"}}},
        },
    }
    docs = {"$defs": {}, "properties": {}}
    errors = lint(structure, docs, lint_config={"allow_additional_properties_true": []})
    assert any(
        e.level == "warning" and "description" in e.message
        for e in errors
    )


def test_lint_errors_orphan_docs_path():
    structure = {
        "$defs": {},
        "properties": {
            "x": {"type": "string"},
        },
    }
    docs = {
        "$defs": {},
        "properties": {
            "x": {"description": "X."},
            "nonexistent": {"description": "should be flagged"},
        },
    }
    errors = lint(structure, docs, lint_config={"allow_additional_properties_true": []})
    assert any(
        e.level == "error" and "nonexistent" in e.message and "no matching structure" in e.message
        for e in errors
    )


def test_lint_warns_missing_examples_on_non_leaf():
    structure = {
        "$defs": {},
        "properties": {
            "x": {"type": "object", "additionalProperties": False, "properties": {"y": {"type": "string"}}},
        },
    }
    docs = {
        "$defs": {},
        "properties": {"x": {"description": "X object describes structure."}},
    }
    errors = lint(structure, docs, lint_config={"allow_additional_properties_true": []})
    assert any(
        e.level == "warning" and "examples" in e.message and "/properties/x" in e.path
        for e in errors
    )


def test_lint_rule9_deployment_spec_keys_match_defaults():
    structure = {
        "$defs": {
            "DeploymentSpec": {
                "type": "object",
                "additionalProperties": False,
                "required": ["containers"],
                "properties": {"replicas": {"type": "integer"}, "containers": {"type": "object", "additionalProperties": True}},
            },
            "DeploymentDefaultsSpec": {
                "type": "object",
                "additionalProperties": False,
                "properties": {"replicas": {"type": "integer"}},  # MISSING containers
            },
        },
        "properties": {},
    }
    docs = {"$defs": {}, "properties": {}}
    cfg = {"allow_additional_properties_true": []}
    errors = lint(structure, docs, lint_config=cfg)
    assert any(
        e.level == "error" and "containers" in e.message and "DeploymentDefaultsSpec" in e.message
        for e in errors
    )


def test_lint_rule9_passes_when_keys_match():
    common_props = {"replicas": {"type": "integer"}, "containers": {"type": "object", "additionalProperties": True}}
    structure = {
        "$defs": {
            "DeploymentSpec": {"type": "object", "additionalProperties": False, "required": ["containers"], "properties": common_props},
            "DeploymentDefaultsSpec": {"type": "object", "additionalProperties": False, "properties": common_props},
        },
        "properties": {},
    }
    cfg = {"allow_additional_properties_true": [
        "#/$defs/DeploymentSpec/properties/containers",
        "#/$defs/DeploymentDefaultsSpec/properties/containers",
    ]}
    errors = lint(structure, {"$defs": {}, "properties": {}}, lint_config=cfg)
    assert not any(e.level == "error" and "DeploymentDefaultsSpec" in e.message for e in errors)


def test_lint_rule9_exempt_key_skipped():
    """Exempted key in DeploymentSpec but absent from DeploymentDefaultsSpec must not error."""
    structure = {
        "$defs": {
            "DeploymentSpec": {
                "type": "object",
                "additionalProperties": False,
                "required": ["containers"],
                "properties": {
                    "containers": {"type": "object", "additionalProperties": True},
                    "autoCreateRbac": {"type": "boolean"},
                    "rbac": {"type": "object", "additionalProperties": True},
                },
            },
            "DeploymentDefaultsSpec": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "containers": {"type": "object", "additionalProperties": True},
                },
            },
        },
        "properties": {},
    }
    cfg = {
        "allow_additional_properties_true": [
            "#/$defs/DeploymentSpec/properties/containers",
            "#/$defs/DeploymentSpec/properties/rbac",
            "#/$defs/DeploymentDefaultsSpec/properties/containers",
        ],
        "deployment_defaults_parity_exempt": ["autoCreateRbac", "rbac"],
    }
    errors = lint(structure, {"$defs": {}, "properties": {}}, lint_config=cfg)
    assert not any(e.level == "error" and "DeploymentDefaultsSpec" in e.message for e in errors)


def test_lint_rule9_non_exempt_key_still_flagged_alongside_exempt():
    """Non-exempted missing key is still flagged when an exempt list is present."""
    structure = {
        "$defs": {
            "DeploymentSpec": {
                "type": "object",
                "additionalProperties": False,
                "required": ["containers"],
                "properties": {
                    "containers": {"type": "object", "additionalProperties": True},
                    "autoCreateRbac": {"type": "boolean"},
                    "replicas": {"type": "integer"},
                },
            },
            "DeploymentDefaultsSpec": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "containers": {"type": "object", "additionalProperties": True},
                },
            },
        },
        "properties": {},
    }
    cfg = {
        "allow_additional_properties_true": [
            "#/$defs/DeploymentSpec/properties/containers",
            "#/$defs/DeploymentDefaultsSpec/properties/containers",
        ],
        "deployment_defaults_parity_exempt": ["autoCreateRbac"],
    }
    errors = lint(structure, {"$defs": {}, "properties": {}}, lint_config=cfg)
    assert any(
        e.level == "error" and "replicas" in e.message and "DeploymentDefaultsSpec" in e.message
        for e in errors
    )
