from pathlib import Path

from schema.build import (
    _schema_leaf_paths,
    drift_errors,
    load_lint_config,
    load_k8s_primitives,
    load_structure,
)

SCHEMA_DIR = Path(__file__).resolve().parents[1]
TEMPLATES = SCHEMA_DIR.parent / "charts" / "idlefy-universal" / "templates"


def _real_structure():
    k8s = load_k8s_primitives(SCHEMA_DIR / "k8s")
    return load_structure(SCHEMA_DIR / "structure", seed=k8s)


def test_synthetic_unconsumed_leaf_is_flagged(tmp_path):
    structure = {
        "properties": {
            "widgets": {
                "type": "object",
                "additionalProperties": {"$ref": "#/$defs/Widget"},
            }
        },
        "$defs": {
            "Widget": {
                "type": "object",
                "additionalProperties": False,
                "properties": {"frobnicateLevel": {"type": "integer"}},
            }
        },
    }
    empty = tmp_path / "templates"
    empty.mkdir()
    errs = drift_errors(structure, {"reserved_leaf_paths": []}, empty)
    assert any("frobnicateLevel" in e.path for e in errs)


def test_real_schema_has_no_drift():
    structure = _real_structure()
    errs = drift_errors(structure, load_lint_config(), TEMPLATES)
    assert errs == [], "unwired schema leaves:\n" + "\n".join(
        f"{e.path}: {e.message}" for e in errs
    )
