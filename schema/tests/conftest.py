from pathlib import Path

import pytest


SCHEMA_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = SCHEMA_DIR.parent


@pytest.fixture
def schema_dir() -> Path:
    return SCHEMA_DIR


@pytest.fixture
def project_root() -> Path:
    return PROJECT_ROOT


@pytest.fixture
def tmp_structure(tmp_path: Path) -> Path:
    d = tmp_path / "structure"
    d.mkdir()
    return d


@pytest.fixture
def tmp_docs(tmp_path: Path) -> Path:
    d = tmp_path / "docs"
    d.mkdir()
    return d
