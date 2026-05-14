import subprocess
import sys


def test_validate_fixtures_passes_on_valid(tmp_path, project_root):
    fixture_dir = tmp_path / "valid"
    fixture_dir.mkdir()
    (fixture_dir / "min.yaml").write_text(
        "deployments:\n  app:\n    containers:\n      main:\n        image: x\n        imageTag: v1\n"
    )
    invalid_dir = tmp_path / "invalid"
    invalid_dir.mkdir()
    (invalid_dir / "bad.yaml").write_text(
        "# expected_error: required\n"
        "deployments:\n  app:\n    containers:\n      main:\n        image: x\n"
    )

    result = subprocess.run(
        [sys.executable, "-m", "schema.build", "validate-fixtures",
         "--fixtures-dir", str(tmp_path)],
        cwd=project_root,
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr


def test_validate_fixtures_fails_when_invalid_doesnt_fail(tmp_path, project_root):
    invalid_dir = tmp_path / "invalid"
    invalid_dir.mkdir()
    valid_dir = tmp_path / "valid"
    valid_dir.mkdir()
    (invalid_dir / "actually-valid.yaml").write_text(
        "# expected_error: nothing\n"
        "deployments:\n  app:\n    containers:\n      main:\n        image: x\n        imageTag: v1\n"
    )

    result = subprocess.run(
        [sys.executable, "-m", "schema.build", "validate-fixtures",
         "--fixtures-dir", str(tmp_path)],
        cwd=project_root,
        capture_output=True, text=True,
    )
    assert result.returncode != 0
