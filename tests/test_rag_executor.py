"""RagExecutor (kind="rag") — knowledge-grounded retrieval in the execution flow.

Contract (MemoryBank backend):
- missing pack / retrieval error → graceful degradation (empty context + note)
  unless required=true
- pack present → MemoryBank.query passthrough (answer/contexts/hits)
- missing pack_id/query → hard error regardless of degradation policy
"""

from __future__ import annotations

import asyncio

import pytest

from shadowflow.memory.memory_bank import MemoryBank, MemoryBankError
from shadowflow.runtime.executors import RagExecutor


def _exec(config: dict, payload: dict | None = None):
    return asyncio.run(RagExecutor().execute(config=config, payload=payload or {}))


def _bank(tmp_path, monkeypatch) -> MemoryBank:
    root = tmp_path / "knowledge"
    monkeypatch.setenv("SHADOWFLOW_KNOWLEDGE_DIR", str(root))
    return MemoryBank(root=root)


def test_missing_query_raises(monkeypatch):
    monkeypatch.delenv("SHADOWFLOW_KNOWLEDGE_DIR", raising=False)
    with pytest.raises(ValueError, match="non-empty query"):
        _exec({"pack_id": "p1", "query": "   "})


def test_degrades_when_pack_missing(tmp_path, monkeypatch):
    _bank(tmp_path, monkeypatch)
    result = _exec({"pack_id": "f" * 32, "query": "what is river memory?"})
    assert result["executor"]["backend"] == "memory-bank"
    assert result["answer"] == ""
    assert result["contexts"] == []
    assert "not found" in result["note"]


def test_required_true_fails_when_pack_missing(tmp_path, monkeypatch):
    _bank(tmp_path, monkeypatch)
    with pytest.raises(MemoryBankError, match="not found"):
        _exec({"pack_id": "f" * 32, "query": "q", "required": True})


def test_query_passthrough(tmp_path, monkeypatch):
    bank = _bank(tmp_path, monkeypatch)
    pack_id = bank.create_pack("测试")["pack_id"]
    bank.ingest_text(pack_id, "River Memory 是跨 run 的分层记忆。", source_name="memory.md")

    result = _exec({"pack_id": pack_id, "top_k": 3}, {"prompt": "什么是 River Memory？"})

    assert result["executor"] == {"kind": "rag", "pack_id": pack_id, "backend": "memory-bank"}
    assert "分层记忆" in result["answer"]
    assert result["contexts"] and "分层记忆" in result["contexts"][0]
    assert result["hits"][0]["source"] == "memory.md"
    assert result["rag_backend"] in ("keyword+structure", "hybrid")


def test_query_failure_degrades_unless_required(tmp_path, monkeypatch):
    bank = _bank(tmp_path, monkeypatch)
    pack_id = bank.create_pack("测试")["pack_id"]

    def boom(*args, **kwargs):
        raise MemoryBankError("EMBEDDING_FAILED", "boom")

    monkeypatch.setattr(MemoryBank, "query", boom)

    degraded = _exec({"pack_id": pack_id, "query": "q"})
    assert degraded["answer"] == ""
    assert "boom" in degraded["note"]

    with pytest.raises(MemoryBankError, match="boom"):
        _exec({"pack_id": pack_id, "query": "q", "required": True})
