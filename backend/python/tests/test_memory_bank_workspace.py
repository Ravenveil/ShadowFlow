"""GET /api/memory-bank/packs 的 workspace 过滤（BE-02，T02 空间隔离缺口）。

Contract:
- 不传 ?workspace_id= → 不过滤（向后兼容，返回全量）
- ?workspace_id=<id> → 严格过滤 metadata.workspace_id == id
- metadata 缺失 / 无 workspace_id 键的 pack 不被任何过滤命中
"""

from __future__ import annotations

import pytest

from shadowflow.memory.memory_bank import (
    MemoryBank,
    create_memory_router,
)


@pytest.fixture()
def bank(tmp_path):
    b = MemoryBank(root=tmp_path / "knowledge")
    b.create_pack("无归属包", metadata={})
    b.create_pack("无归属键包", metadata={"other": 1})
    b.create_pack("空间A包", metadata={"workspace_id": "ws-a"})
    b.create_pack("空间B包", metadata={"workspace_id": "ws-b"})
    return b


@pytest.fixture()
def client(bank):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(create_memory_router(bank))
    return TestClient(app)


def _names(payload):
    return {p["name"] for p in payload["data"]["packs"]}


def test_list_packs_without_filter_returns_all(client):
    response = client.get("/api/memory-bank/packs")
    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["count"] == 4
    assert len(_names(payload)) == 4


def test_list_packs_filters_by_workspace_id(client):
    response = client.get("/api/memory-bank/packs", params={"workspace_id": "ws-a"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["count"] == 1
    assert _names(payload) == {"空间A包"}
    # 过滤命中的 pack 归属可回溯
    assert payload["data"]["packs"][0]["metadata"]["workspace_id"] == "ws-a"


def test_list_packs_workspace_filter_excludes_unattributed(client):
    response = client.get("/api/memory-bank/packs", params={"workspace_id": "ws-missing"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["count"] == 0
    assert payload["data"]["packs"] == []


def test_list_packs_no_metadata_key_never_matches(client):
    # metadata={} / metadata 无 workspace_id 的 pack 不被任何具体过滤命中
    response = client.get("/api/memory-bank/packs", params={"workspace_id": "ws-b"})
    assert response.json()["meta"]["count"] == 1
    for name in ("无归属包", "无归属键包"):
        assert name not in _names(response.json())


def test_list_packs_bank_level_unfiltered(client, bank):
    # bank.list_packs() 本身保持全量语义（过滤只在发现口路由层做）
    assert len(bank.list_packs()) == 4
