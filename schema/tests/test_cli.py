import json
import subprocess
import sys
from pathlib import Path


def test_cli_build_produces_valid_schema(tmp_path: Path, project_root: Path):
    out = tmp_path / "values.schema.json"
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "schema.build",
            "build",
            "--output",
            str(out),
        ],
        cwd=project_root,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr

    schema = json.loads(out.read_text())
    assert schema["$schema"] == "http://json-schema.org/draft-07/schema#"
    assert "deployments" in schema["properties"]
    assert "deploymentsGeneral" in schema["properties"]


def test_cli_build_unknown_command_exits_nonzero(project_root: Path):
    result = subprocess.run(
        [sys.executable, "-m", "schema.build", "nope"],
        cwd=project_root,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
