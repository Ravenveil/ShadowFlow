"""内置秘书「影」播种测试（2026-11-06）。

覆盖：
  - ensure_secretary 幂等：首次播种成功、二次调用返回 None 不覆盖
  - server startup hook 调用（monkeypatch _AGENTS_DIR 隔离）
  - DM resolve 对影的新会话预置「Hello World!」问候（仅新建；老会话/普通
    agent 零变化）
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

import shadowflow.api.agents as agents_mod
import shadowflow.api.groups as groups_mod
import shadowflow.services.secretary_seed as seed_mod
from shadowflow.server import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    # agents.py / secretary_seed.py 各持一份 _AGENTS_DIR 副本（同一真实路径），
    # 测试隔离时两边必须 patch 到同一致（否则 seed 写进 tmp、API 读真实目录）。
    monkeypatch.setattr(agents_mod, "_AGENTS_DIR", tmp_path / "agents")
    monkeypatch.setattr(seed_mod, "_AGENTS_DIR", tmp_path / "agents")
    monkeypatch.setattr(groups_mod, "_GROUPS_DIR", tmp_path / "groups")
    # TestClient(app) 不进 with 上下文时不触发 startup 事件，这里显式播种
    # （等价于 server.py hook 的调用，确定性不依赖 TestClient 语义）。
    seed_mod.ensure_secretary()
    return TestClient(app)


class TestSecretarySeed:
    def test_seeds_agent_record(self, client):
        """首次播种：agent-shadow-secretary 记录落盘，name=影，source=secretary。"""
        r = client.get("/api/agents")
        assert r.status_code == 200
        agents = r.json()["data"]
        rec = next((a for a in agents if a["agent_id"] == "agent-shadow-secretary"), None)
        assert rec is not None
        assert rec["name"] == "影"
        assert rec["source"] == "secretary"
        assert rec["avatar_seed"] == "shadow-secretary"

    def test_seed_is_idempotent(self, client):
        """二次启动不覆盖：用户改名后重启，名字保持用户版本。"""
        # 模拟用户改名
        r = client.patch(
            "/api/agents/agent-shadow-secretary",
            json={"name": "我的秘书"},
        )
        assert r.status_code == 200
        # 重启（再次调用 ensure_secretary，经由 startup 已在 TestClient 构造时跑过；
        # 这里显式再跑一次模拟下次启动）
        result = seed_mod.ensure_secretary()
        assert result is None  # 已存在 → 不动
        r2 = client.get("/api/agents/agent-shadow-secretary")
        assert r2.status_code == 200
        assert r2.json()["data"]["name"] == "我的秘书"

    def test_dm_resolve_presets_greeting_for_new_conversation(self, client):
        """影的新 DM 预置 Hello World!（sender=影）。"""
        r = client.post("/api/chat/dm/agent-shadow-secretary/resolve")
        assert r.status_code == 200
        gid = r.json()["group_id"]
        assert r.json()["created"] is True
        msgs = client.get(f"/api/groups/{gid}/messages").json()["messages"]
        assert len(msgs) == 1
        assert msgs[0]["content"] == "Hello World!"
        assert msgs[0]["sender_kind"] == "agent"
        assert msgs[0]["agent_id"] == "agent-shadow-secretary"

    def test_dm_resolve_no_duplicate_greeting_on_existing(self, client):
        """老会话再次 resolve 不重复插入问候（幂等）。"""
        gid1 = client.post("/api/chat/dm/agent-shadow-secretary/resolve").json()["group_id"]
        r2 = client.post("/api/chat/dm/agent-shadow-secretary/resolve")
        assert r2.json()["group_id"] == gid1
        assert r2.json()["created"] is False
        msgs = client.get(f"/api/groups/{gid1}/messages").json()["messages"]
        assert len(msgs) == 1  # 仍是播种那一条

    def test_dm_resolve_backfills_greeting_for_legacy_empty_conversation(self, client):
        """存量老会话（播种功能上线前建、零消息）resolve 时补种问候。"""
        # 手工造一条「老」影 DM：kind=dm、零消息——模拟播种功能之前建的会话。
        gid = "legacy0" + "0" * 27
        groups_mod._save_group(
            {
                "group_id": gid,
                "name": "影",
                "template_id": "",
                "group_template_id": "",
                "agent_ids": ["agent-shadow-secretary"],
                "member_emails": [],
                "policy_matrix": {},
                "workspace_id": None,
                "team_id": None,
                "kind": "dm",
                "created_at": "2026-11-01T00:00:00+00:00",
                "messages": [],
            }
        )
        r = client.post("/api/chat/dm/agent-shadow-secretary/resolve")
        assert r.json()["group_id"] == gid
        assert r.json()["created"] is False
        msgs = client.get(f"/api/groups/{gid}/messages").json()["messages"]
        assert len(msgs) == 1
        assert msgs[0]["content"] == "Hello World!"
        assert msgs[0]["sender_kind"] == "agent"
        assert msgs[0]["agent_id"] == "agent-shadow-secretary"
        # 再次 resolve 幂等：不重复补种
        client.post("/api/chat/dm/agent-shadow-secretary/resolve")
        assert len(client.get(f"/api/groups/{gid}/messages").json()["messages"]) == 1

    def test_dm_resolve_backfill_skips_conversation_with_history(self, client):
        """已有消息的老会话 resolve 时零变化（绝不覆盖用户聊天）。"""
        gid = "legacy1" + "0" * 27
        groups_mod._save_group(
            {
                "group_id": gid,
                "name": "影",
                "template_id": "",
                "group_template_id": "",
                "agent_ids": ["agent-shadow-secretary"],
                "member_emails": [],
                "policy_matrix": {},
                "workspace_id": None,
                "team_id": None,
                "kind": "dm",
                "created_at": "2026-11-01T00:00:00+00:00",
                "messages": [
                    {
                        "sender_name": "用户",
                        "sender_kind": "user",
                        "content": "在吗",
                        "timestamp": "2026-11-01T00:00:01+00:00",
                    }
                ],
            }
        )
        r = client.post("/api/chat/dm/agent-shadow-secretary/resolve")
        assert r.json()["group_id"] == gid
        msgs = client.get(f"/api/groups/{gid}/messages").json()["messages"]
        assert len(msgs) == 1
        assert msgs[0]["content"] == "在吗"

    def test_dm_resolve_normal_agent_no_greeting(self, client):
        """普通 agent 的 DM 不带问候（零回归）。"""
        ra = client.post("/api/agents", json={"name": "小艾", "soul": "研究"})
        aid = ra.json()["data"]["agent_id"]
        r = client.post(f"/api/chat/dm/{aid}/resolve")
        gid = r.json()["group_id"]
        msgs = client.get(f"/api/groups/{gid}/messages").json()["messages"]
        assert msgs == []
