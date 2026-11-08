"""Tests for Groups API — Story 7.3 (AC3 backend).

Covers:
  - POST /api/groups  → 201 on success
  - POST /api/groups  → 400 when name is empty
  - POST /api/groups  → 201 even for an unknown template_id (template
    requirement was intentionally dropped 2026-05-19; see groups.py History)
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from shadowflow.server import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

_VALID_TEMPLATE_ID = "academic-paper"  # seed template present in /templates


def _body(**kwargs) -> dict:
    base = {
        "template_id": _VALID_TEMPLATE_ID,
        "group_template_id": "default-group",
        "name": "Test Group",
        "agent_ids": ["agent-a", "agent-b"],
        "member_emails": [],
        "policy_matrix": {},
    }
    base.update(kwargs)
    return base


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestCreateGroup:
    def test_create_success_returns_201(self, client: TestClient):
        res = client.post("/api/groups", json=_body())
        assert res.status_code == 201
        data = res.json()
        assert data["name"] == "Test Group"
        assert data["template_id"] == _VALID_TEMPLATE_ID
        assert "group_id" in data
        assert "created_at" in data
        assert data["agents"] == ["agent-a", "agent-b"]

    def test_create_returns_unique_group_ids(self, client: TestClient):
        r1 = client.post("/api/groups", json=_body(name="Group A"))
        r2 = client.post("/api/groups", json=_body(name="Group B"))
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json()["group_id"] != r2.json()["group_id"]

    def test_create_trims_whitespace_name(self, client: TestClient):
        res = client.post("/api/groups", json=_body(name="  Trimmed  "))
        assert res.status_code == 201
        assert res.json()["name"] == "Trimmed"

    def test_create_empty_name_returns_400(self, client: TestClient):
        res = client.post("/api/groups", json=_body(name=""))
        assert res.status_code == 400

    def test_create_whitespace_only_name_returns_400(self, client: TestClient):
        res = client.post("/api/groups", json=_body(name="   "))
        assert res.status_code == 400

    def test_create_unknown_template_still_succeeds(self, client: TestClient):
        """Template requirement was intentionally dropped on 2026-05-19 so that
        groups created ad-hoc from a run-session blueprint (no template) persist.
        An unknown template_id must therefore create the group (201), not 404 —
        the id is stored verbatim. See groups.py module History."""
        res = client.post("/api/groups", json=_body(template_id="no-such-template-xyz"))
        assert res.status_code == 201
        assert res.json()["template_id"] == "no-such-template-xyz"

    def test_create_minimal_body(self, client: TestClient):
        """Only required fields — agent_ids, member_emails, policy_matrix default to empty."""
        res = client.post(
            "/api/groups",
            json={
                "template_id": _VALID_TEMPLATE_ID,
                "group_template_id": "g1",
                "name": "Minimal",
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert data["agents"] == []


class TestGroupUpdatedAt:
    """2026-11-08 · updated_at 生命周期（「最近对话」排序/时间列的真源）：
    建群初始化 == created_at；发消息 bump 到消息时间；存量旧记录在列表响应层
    兜底（末条消息时间 → created_at），不落盘。"""

    @pytest.fixture(autouse=True)
    def _isolated_groups_dir(self, tmp_path, monkeypatch):
        import shadowflow.api.groups.groups as groups_mod

        monkeypatch.setattr(groups_mod, "_GROUPS_DIR", tmp_path / "groups")

    def test_create_initializes_updated_at(self, client: TestClient):
        res = client.post("/api/groups", json=_body(name="UT Create", agent_ids=[]))
        assert res.status_code == 201
        gid = res.json()["group_id"]
        rec = client.get(f"/api/groups/{gid}").json()["data"]
        assert rec["updated_at"] == rec["created_at"]

    def test_post_message_bumps_updated_at(self, client: TestClient):
        res = client.post("/api/groups", json=_body(name="UT Bump", agent_ids=[]))
        gid = res.json()["group_id"]
        m = client.post(
            f"/api/groups/{gid}/messages",
            json={"sender_name": "u", "sender_kind": "user", "content": "hello"},
        )
        assert m.status_code in (200, 201)
        rec = client.get(f"/api/groups/{gid}").json()["data"]
        assert rec["updated_at"] == rec["messages"][-1]["timestamp"]
        assert rec["updated_at"] >= rec["created_at"]

    def test_list_backfills_legacy_record_with_messages(self, client: TestClient):
        import shadowflow.api.groups.groups as groups_mod

        legacy = {
            "group_id": "legacy-ut-msg",
            "name": "Legacy",
            "kind": "group",
            "created_at": "2026-01-01T00:00:00+00:00",
            "messages": [
                {
                    "sender_name": "a",
                    "sender_kind": "agent",
                    "content": "x",
                    "timestamp": "2026-01-02T00:00:00+00:00",
                }
            ],
        }
        groups_mod._GROUPS_DIR.mkdir(parents=True, exist_ok=True)
        (groups_mod._GROUPS_DIR / "legacy-ut-msg.json").write_text(
            json.dumps(legacy), encoding="utf-8"
        )
        rows = client.get("/api/groups").json()["data"]
        row = next(r for r in rows if r["group_id"] == "legacy-ut-msg")
        assert row["updated_at"] == "2026-01-02T00:00:00+00:00"
        # 兜底只在响应层补值，不落盘
        on_disk = json.loads(
            (groups_mod._GROUPS_DIR / "legacy-ut-msg.json").read_text(encoding="utf-8")
        )
        assert "updated_at" not in on_disk

    def test_list_backfills_legacy_record_without_messages(self, client: TestClient):
        import shadowflow.api.groups.groups as groups_mod

        legacy = {
            "group_id": "legacy-ut-no-msg",
            "name": "Legacy2",
            "kind": "group",
            "created_at": "2026-01-03T00:00:00+00:00",
            "messages": [],
        }
        groups_mod._GROUPS_DIR.mkdir(parents=True, exist_ok=True)
        (groups_mod._GROUPS_DIR / "legacy-ut-no-msg.json").write_text(
            json.dumps(legacy), encoding="utf-8"
        )
        rows = client.get("/api/groups").json()["data"]
        row = next(r for r in rows if r["group_id"] == "legacy-ut-no-msg")
        assert row["updated_at"] == "2026-01-03T00:00:00+00:00"
