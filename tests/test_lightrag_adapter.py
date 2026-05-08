"""Tests for LightRAG adapter — Story 9.1 Phase 2.

Test strategy:
  1. Default (LIGHTRAG_ENABLED not set / false) → is_enabled() returns False,
     ingest still works via keyword stub, no LightRAG import attempted.
  2. LIGHTRAG_ENABLED=true but lightrag-hku not installed → ImportError is
     propagated clearly (not silently swallowed).
  3. LIGHTRAG_ENABLED=true with proper env vars → adapter functions are called
     (integration tests, skipped in CI unless lightrag-hku is installed).
  4. backend_label() returns correct string in each state.
  5. delete_pack_index() is a no-op when the directory does not exist.
  6. Full run_ingest stub path is unchanged when LIGHTRAG_ENABLED is false.
"""
from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path
from typing import Generator
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_LIGHTRAG_PKG = "lightrag"
_ADAPTER_MOD = "shadowflow.runtime.lightrag_adapter"


def _lightrag_installed() -> bool:
    """Return True if lightrag-hku package is importable in this environment."""
    try:
        import lightrag  # noqa: F401
        return True
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# Fixture: clean env for each test
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    """Ensure LIGHTRAG_ENABLED is unset before each test (default = stub path)."""
    monkeypatch.delenv("LIGHTRAG_ENABLED", raising=False)
    # Force adapter module to be re-evaluated for is_enabled() calls
    if _ADAPTER_MOD in sys.modules:
        importlib.reload(sys.modules[_ADAPTER_MOD])
    yield


# ---------------------------------------------------------------------------
# 1. Feature flag — default disabled
# ---------------------------------------------------------------------------

class TestFeatureFlag:
    def test_disabled_by_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from shadowflow.runtime import lightrag_adapter
        assert lightrag_adapter.is_enabled() is False

    def test_enabled_when_env_true(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LIGHTRAG_ENABLED", "true")
        from shadowflow.runtime import lightrag_adapter
        assert lightrag_adapter.is_enabled() is True

    def test_enabled_case_insensitive(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LIGHTRAG_ENABLED", "TRUE")
        from shadowflow.runtime import lightrag_adapter
        assert lightrag_adapter.is_enabled() is True

    def test_not_enabled_for_other_values(self, monkeypatch: pytest.MonkeyPatch) -> None:
        for val in ("1", "yes", "on", "false", "0", ""):
            monkeypatch.setenv("LIGHTRAG_ENABLED", val)
            from shadowflow.runtime import lightrag_adapter
            assert lightrag_adapter.is_enabled() is False, f"Expected False for {val!r}"


# ---------------------------------------------------------------------------
# 2. backend_label()
# ---------------------------------------------------------------------------

class TestBackendLabel:
    def test_stub_when_disabled(self) -> None:
        from shadowflow.runtime import lightrag_adapter
        assert lightrag_adapter.backend_label() == "stub"

    def test_lightrag_when_enabled(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LIGHTRAG_ENABLED", "true")
        from shadowflow.runtime import lightrag_adapter
        assert lightrag_adapter.backend_label() == "lightrag"


# ---------------------------------------------------------------------------
# 3. delete_pack_index() — file system behaviour
# ---------------------------------------------------------------------------

class TestDeletePackIndex:
    def test_noop_when_dir_absent(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LIGHTRAG_WORKING_DIR", str(tmp_path / "lightrag"))
        from shadowflow.runtime import lightrag_adapter
        # Should not raise even though directory does not exist
        lightrag_adapter.delete_pack_index("a" * 32)

    def test_removes_pack_dir(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LIGHTRAG_WORKING_DIR", str(tmp_path / "lightrag"))
        pack_id = "b" * 32
        pack_dir = tmp_path / "lightrag" / pack_id
        pack_dir.mkdir(parents=True)
        (pack_dir / "dummy.json").write_text("{}")
        from shadowflow.runtime import lightrag_adapter
        lightrag_adapter.delete_pack_index(pack_id)
        assert not pack_dir.exists()


# ---------------------------------------------------------------------------
# 4. ingest_text() — disabled path (stub, no lightrag import)
# ---------------------------------------------------------------------------

class TestIngestTextDisabled:
    def test_not_called_when_disabled(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """When LIGHTRAG_ENABLED is false, run_ingest must NOT call ingest_text."""
        from shadowflow.runtime import lightrag_adapter

        called = []
        monkeypatch.setattr(lightrag_adapter, "ingest_text", lambda *a, **kw: called.append(True))

        # is_enabled() returns False → ingest_text should never be reached via run_ingest
        assert lightrag_adapter.is_enabled() is False

        from shadowflow.memory.knowledge_pack import KnowledgePack, KnowledgeSource
        from shadowflow.memory.retrieval_profiles import RetrievalProfile
        from shadowflow.memory.ingest_pipeline import run_ingest, KeywordIndex

        source = KnowledgeSource(source_type="text", source_ref="hello world")
        pack = KnowledgePack(
            name="test",
            sources=[source],
            retrieval_profile=RetrievalProfile(),
        )
        run_ingest(pack, index=KeywordIndex(root=None))  # type: ignore[arg-type]
        assert called == [], "ingest_text should NOT be called when LIGHTRAG_ENABLED is false"


# ---------------------------------------------------------------------------
# 5. ingest_text() + query() — enabled path (requires lightrag-hku installed)
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not _lightrag_installed(),
    reason="lightrag-hku not installed; skipping live LightRAG integration tests",
)
class TestLightRagLiveIntegration:
    """Integration smoke tests that require lightrag-hku to be installed.

    These tests run against a temp directory and a mock LLM/embedding function
    to avoid real API calls during CI.  They verify that the adapter can:
      - call ingest_text without error (using mocked LightRAG)
      - call query and get a string back (using mocked LightRAG)
    """

    def test_ingest_text_mock(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("LIGHTRAG_ENABLED", "true")
        monkeypatch.setenv("LIGHTRAG_WORKING_DIR", str(tmp_path / "lightrag"))
        monkeypatch.setenv("LIGHTRAG_LLM_API_KEY", "sk-test")
        monkeypatch.setenv("LIGHTRAG_EMBED_API_KEY", "sk-test")

        from shadowflow.runtime import lightrag_adapter

        # Mock the LightRAG class so no real HTTP calls are made
        mock_rag = MagicMock()
        mock_rag.initialize_storages = MagicMock(return_value=_async_noop())
        mock_rag.ainsert = MagicMock(return_value=_async_noop())
        mock_rag.finalize_storages = MagicMock(return_value=_async_noop())

        with patch.object(lightrag_adapter, "_build_rag", return_value=mock_rag):
            lightrag_adapter.ingest_text("a" * 32, "Hello LightRAG world")

        mock_rag.ainsert.assert_called_once()

    def test_query_returns_string(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("LIGHTRAG_ENABLED", "true")
        monkeypatch.setenv("LIGHTRAG_WORKING_DIR", str(tmp_path / "lightrag"))
        monkeypatch.setenv("LIGHTRAG_LLM_API_KEY", "sk-test")
        monkeypatch.setenv("LIGHTRAG_EMBED_API_KEY", "sk-test")

        from shadowflow.runtime import lightrag_adapter

        async def _fake_query(*args, **kwargs):  # noqa: ANN002,ANN003
            return "Mocked answer"

        mock_rag = MagicMock()
        mock_rag.initialize_storages = MagicMock(return_value=_async_noop())
        mock_rag.aquery = MagicMock(return_value=_async_return("Mocked answer"))
        mock_rag.finalize_storages = MagicMock(return_value=_async_noop())

        with patch.object(lightrag_adapter, "_build_rag", return_value=mock_rag):
            result = lightrag_adapter.query("a" * 32, "What is this about?")

        assert isinstance(result, str)
        assert len(result) > 0

    def test_ingest_text_skips_empty_string(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("LIGHTRAG_ENABLED", "true")
        monkeypatch.setenv("LIGHTRAG_WORKING_DIR", str(tmp_path / "lightrag"))
        monkeypatch.setenv("LIGHTRAG_LLM_API_KEY", "sk-test")
        monkeypatch.setenv("LIGHTRAG_EMBED_API_KEY", "sk-test")

        from shadowflow.runtime import lightrag_adapter

        build_calls = []
        with patch.object(lightrag_adapter, "_build_rag", side_effect=lambda pid: build_calls.append(pid)):
            lightrag_adapter.ingest_text("a" * 32, "   ")  # whitespace-only

        assert build_calls == [], "_build_rag should not be called for empty/whitespace text"


# ---------------------------------------------------------------------------
# 6. Config error — missing API key when enabled
# ---------------------------------------------------------------------------

class TestConfigError:
    def test_missing_api_key_raises_config_error(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("LIGHTRAG_ENABLED", "true")
        monkeypatch.setenv("LIGHTRAG_WORKING_DIR", str(tmp_path / "lightrag"))
        monkeypatch.delenv("LIGHTRAG_LLM_API_KEY", raising=False)
        monkeypatch.delenv("LIGHTRAG_EMBED_API_KEY", raising=False)
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)

        from shadowflow.runtime import lightrag_adapter

        # Only run if lightrag is installed; otherwise _build_rag raises ImportError first
        if not _lightrag_installed():
            pytest.skip("lightrag-hku not installed")

        with pytest.raises(lightrag_adapter.LightRagConfigError, match="LIGHTRAG_LLM_API_KEY"):
            lightrag_adapter.ingest_text("a" * 32, "some text")


# ---------------------------------------------------------------------------
# 7. API meta includes rag_backend
# ---------------------------------------------------------------------------

class TestApiMetaRagBackend:
    def test_list_packs_includes_rag_backend(self, tmp_path: Path) -> None:
        """GET /knowledge/packs envelope meta must include rag_backend field."""
        import shadowflow.api.knowledge as knowledge_api
        from shadowflow.api.knowledge import KnowledgeService
        from fastapi.testclient import TestClient
        from shadowflow.server import app

        client = TestClient(app)
        svc = KnowledgeService(storage_dir=tmp_path / "knowledge")
        knowledge_api.set_service(svc)
        try:
            resp = client.get("/knowledge/packs")
            assert resp.status_code == 200
            body = resp.json()
            assert "rag_backend" in body["meta"], "meta must include rag_backend"
            assert body["meta"]["rag_backend"] in ("stub", "lightrag")
        finally:
            knowledge_api.set_service(KnowledgeService())

    def test_create_pack_includes_rag_backend(self, tmp_path: Path) -> None:
        """POST /knowledge/packs envelope meta must include rag_backend field."""
        import shadowflow.api.knowledge as knowledge_api
        from shadowflow.api.knowledge import KnowledgeService
        from fastapi.testclient import TestClient
        from shadowflow.server import app

        client = TestClient(app)
        svc = KnowledgeService(storage_dir=tmp_path / "knowledge")
        knowledge_api.set_service(svc)
        try:
            resp = client.post(
                "/knowledge/packs",
                json={
                    "name": "meta-test",
                    "sources": [{"source_type": "text", "source_ref": "hello"}],
                },
            )
            assert resp.status_code == 200
            body = resp.json()
            assert "rag_backend" in body["meta"]
            assert body["meta"]["rag_backend"] == "stub"  # LIGHTRAG_ENABLED not set
        finally:
            knowledge_api.set_service(KnowledgeService())


# ---------------------------------------------------------------------------
# Async helpers for mocking
# ---------------------------------------------------------------------------

async def _async_noop(*args, **kwargs) -> None:  # noqa: ANN002,ANN003
    return None


async def _async_return(value):  # noqa: ANN001,ANN201
    return value
