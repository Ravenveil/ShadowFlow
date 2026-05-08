from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """全局 limiter 隔离：每个测试前后清空 slowapi MemoryStorage 计数，
    防止跨测试文件的限速状态积累导致非限速测试误收 429。
    """
    try:
        from shadowflow.api._limiter import limiter
        limiter.reset()
    except Exception:
        pass
    yield
    try:
        from shadowflow.api._limiter import limiter
        limiter.reset()
    except Exception:
        pass


PHASE1_BASELINE_TEST_FILES = {
    "test_runtime_contract.py",
    "test_runtime_examples.py",
}

LEGACY_DIR_NAME = "legacy"


def pytest_ignore_collect(collection_path, config: pytest.Config) -> bool:
    if config.getoption("--run-legacy"):
        return False
    path = Path(str(collection_path))
    return LEGACY_DIR_NAME in path.parts


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    run_legacy = config.getoption("--run-legacy")
    if run_legacy:
        return

    skip_legacy = pytest.mark.skip(
        reason="legacy test baseline; excluded from Phase 1 contract baseline unless --run-legacy is set"
    )
    for item in items:
        path = Path(str(item.fspath))
        if LEGACY_DIR_NAME in path.parts:
            item.add_marker("legacy")
            item.add_marker(skip_legacy)


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--run-legacy",
        action="store_true",
        default=False,
        help="include legacy tests that are not part of the Phase 1 contract baseline",
    )
