from __future__ import annotations

from pathlib import Path

import pytest


PHASE1_BASELINE_TEST_FILES = {
    "test_runtime_contract.py",
    "test_runtime_examples.py",
}


def pytest_ignore_collect(collection_path, config: pytest.Config) -> bool:
    if config.getoption("--run-legacy"):
        return False
    path = Path(str(collection_path))
    return path.name.startswith("test_") and path.name not in PHASE1_BASELINE_TEST_FILES


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    run_legacy = config.getoption("--run-legacy")
    if run_legacy:
        return

    skip_legacy = pytest.mark.skip(
        reason="legacy test baseline; excluded from Phase 1 contract baseline unless --run-legacy is set"
    )
    for item in items:
        path = Path(str(item.fspath)).name
        if path not in PHASE1_BASELINE_TEST_FILES:
            item.add_marker(skip_legacy)


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--run-legacy",
        action="store_true",
        default=False,
        help="include legacy tests that are not part of the Phase 1 contract baseline",
    )
