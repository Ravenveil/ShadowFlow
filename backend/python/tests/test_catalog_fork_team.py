"""tests/test_catalog_fork_team.py — T04 团队模板一键 fork 落库（第二轮黄金路径）

覆盖：
  - 内置模板种子：ensure_builtin_templates 幂等注册，summary 带 mode="team"
  - POST /catalog/apps/{app_id}/fork（team 模板）→ 6 agents + team 真实落库
    （.shadowflow/agents/*.json + teams/team-*.json，含 workflow DAG / approve 审批门边）
  - fork 可选 body workspace_id 透传到落库记录
  - single 模式 fork 行为不变（不落 agents/team）
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import shadowflow.api.agents.agents as agents_api
import shadowflow.api.agents.teams as teams_api
import shadowflow.runtime.catalog_service as catalog_service
from shadowflow.runtime.catalog_service import (
    CatalogService,
    RegisterPublishedAppRequest,
)
from shadowflow.runtime.catalog_templates import (
    ARC_APP_ID,
    T04_APP_ID,
    build_auto_research_cloud_blueprint,
    build_t04_hydrogen_team_blueprint,
    ensure_builtin_templates,
)
from shadowflow.runtime.contracts_builder import AgentBlueprint, RoleProfile
from shadowflow.server import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_stores(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """catalog / agents / teams 三个存储目录全部隔离到 tmp_path。"""
    svc = CatalogService(storage_dir=tmp_path / "catalog")
    catalog_service.set_service(svc)
    monkeypatch.setattr(agents_api, "_AGENTS_DIR", tmp_path / "agents")
    monkeypatch.setattr(teams_api, "_TEAMS_DIR", tmp_path / "teams")
    try:
        yield svc, tmp_path
    finally:
        catalog_service.set_service(CatalogService())


def _register_t04(svc: CatalogService):
    return svc.register_published_app(
        RegisterPublishedAppRequest(
            blueprint=build_t04_hydrogen_team_blueprint(),
            author="ShadowFlow 模板库",
            kit_type="custom",
            app_id=T04_APP_ID,
        )
    )


def _agent_files(tmp_path: Path):
    d = tmp_path / "agents"
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in d.glob("*.json")}


def _team_files(tmp_path: Path):
    d = tmp_path / "teams"
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in d.glob("*.json")}


# ---------------------------------------------------------------------------
# 内置模板种子
# ---------------------------------------------------------------------------


def test_seed_builtin_templates_idempotent(_isolated_stores):
    svc, _ = _isolated_stores
    seeded = ensure_builtin_templates(svc)
    assert seeded == [T04_APP_ID, ARC_APP_ID]
    # 第二次调用幂等跳过
    assert ensure_builtin_templates(svc) == []

    listing = svc.list_apps()
    assert listing["total"] == 2
    by_id = {a["app_id"]: a for a in listing["apps"]}
    assert by_id[T04_APP_ID]["mode"] == "team"
    assert "氢能获客" in by_id[T04_APP_ID]["name"]
    assert by_id[ARC_APP_ID]["mode"] == "team"
    assert "论文专家团" in by_id[ARC_APP_ID]["name"]


def test_t04_template_blueprint_valid_team_dag(_isolated_stores):
    bp = build_t04_hydrogen_team_blueprint()
    assert bp.mode == "team"
    assert len(bp.role_profiles) == 6
    for role in bp.role_profiles:
        # persona 是真实中文 system prompt，且携带业务背景
        assert "氢璞创能" in role.persona
        assert role.executor_provider == "zhipu"
        assert role.executor_model.startswith("glm-")
    dag = bp.metadata["team_dag"]
    assert len(dag["nodes"]) == 6
    modes = {(e["source"], e["target"]): e["mode"] for e in dag["edges"]}
    # L6 人工审批门 + 驳回回炉边
    assert modes[("reviewer", "verifier")] == "approve"
    assert modes[("reviewer", "strategist")] == "conditional"


def test_arc_blueprint_valid_team_dag(_isolated_stores):
    bp = build_auto_research_cloud_blueprint()
    assert bp.mode == "team"
    assert len(bp.role_profiles) == 9
    ids = [r.role_id for r in bp.role_profiles]
    assert "role-coordinator" in ids and "role-verifier" in ids
    for role in bp.role_profiles:
        # persona 是真实中文 system prompt，且携带 ARC 团队使命
        assert "Auto Research Cloud" in role.persona
        assert "学术诚信" in role.persona
        assert role.executor_provider == "zhipu"
        assert role.executor_model.startswith("glm-")
    dag = bp.metadata["team_dag"]
    assert len(dag["nodes"]) == 9
    modes = {(e["source"], e["target"]): e["mode"] for e in dag["edges"]}
    # 两道人工审批门 + 审稿驳回回炉边
    assert modes[("methodologist", "experimenter")] == "approve"
    assert modes[("reviewer", "verifier")] == "approve"
    assert modes[("reviewer", "writer")] == "conditional"


def test_arc_fork_materializes_9_agents_and_team(_isolated_stores):
    svc, tmp_path = _isolated_stores
    svc.register_published_app(
        RegisterPublishedAppRequest(
            blueprint=build_auto_research_cloud_blueprint(),
            author="ShadowFlow 模板库",
            kit_type="custom",
            app_id=ARC_APP_ID,
        )
    )
    resp = client.post(f"/catalog/apps/{ARC_APP_ID}/fork")
    assert resp.status_code == 200
    data = resp.json()["data"]
    team = data["team"]
    assert len(data["agents"]) == 9
    assert len(team["agent_ids"]) == 9

    agents = _agent_files(tmp_path)
    assert set(agents.keys()) == set(team["agent_ids"])
    for rec in agents.values():
        assert rec["source"] == "catalog_fork"
        assert "Auto Research Cloud" in rec["soul"]

    stored = _team_files(tmp_path)[team["team_id"]]
    node_agent_ids = [n["data"]["agentId"] for n in stored["workflow"]["nodes"]]
    assert sorted(node_agent_ids) == sorted(team["agent_ids"])
    edge_modes = {
        (e["source"], e["target"]): e["data"]["mode"]
        for e in stored["workflow"]["edges"]
    }
    assert edge_modes[("methodologist", "experimenter")] == "approve"
    assert edge_modes[("reviewer", "writer")] == "conditional"


# ---------------------------------------------------------------------------
# fork → agents + team 落库
# ---------------------------------------------------------------------------


def test_fork_team_template_materializes_agents_and_team(_isolated_stores):
    svc, tmp_path = _isolated_stores
    _register_t04(svc)

    resp = client.post(f"/catalog/apps/{T04_APP_ID}/fork")
    assert resp.status_code == 200
    data = resp.json()["data"]

    # 响应带 fork 产物
    assert data["forked_from"] == T04_APP_ID
    assert len(data["agents"]) == 6
    team = data["team"]
    assert team["team_id"].startswith("team-")
    assert len(team["agent_ids"]) == 6

    # 6 个 agent 真实落库，soul = 模板 persona（中文 system prompt）
    agents = _agent_files(tmp_path)
    assert set(agents.keys()) == set(team["agent_ids"])
    for rec in agents.values():
        assert rec["source"] == "catalog_fork"
        assert "氢璞创能" in rec["soul"]
        role0 = rec["blueprint"]["role_profiles"][0]
        assert role0["executor_provider"] == "zhipu"

    # team 真实落库，workflow 节点引用新 agent_id，边含审批门/回炉
    teams = _team_files(tmp_path)
    assert team["team_id"] in teams
    stored = teams[team["team_id"]]
    node_agent_ids = [n["data"]["agentId"] for n in stored["workflow"]["nodes"]]
    assert sorted(node_agent_ids) == sorted(team["agent_ids"])
    edge_modes = {
        (e["source"], e["target"]): e["data"]["mode"]
        for e in stored["workflow"]["edges"]
    }
    assert edge_modes[("reviewer", "verifier")] == "approve"
    assert edge_modes[("reviewer", "strategist")] == "conditional"


def test_fork_team_template_honours_workspace_id(_isolated_stores):
    svc, tmp_path = _isolated_stores
    _register_t04(svc)

    resp = client.post(
        f"/catalog/apps/{T04_APP_ID}/fork",
        json={"workspace_id": "ws-demo"},
    )
    assert resp.status_code == 200
    team = resp.json()["data"]["team"]
    assert team["workspace_id"] == "ws-demo"
    for rec in _agent_files(tmp_path).values():
        assert rec["workspace_id"] == "ws-demo"


def test_fork_team_template_twice_creates_independent_copies(_isolated_stores):
    svc, tmp_path = _isolated_stores
    _register_t04(svc)

    r1 = client.post(f"/catalog/apps/{T04_APP_ID}/fork").json()["data"]
    r2 = client.post(f"/catalog/apps/{T04_APP_ID}/fork").json()["data"]
    assert r1["team"]["team_id"] != r2["team"]["team_id"]
    assert len(_agent_files(tmp_path)) == 12
    assert len(_team_files(tmp_path)) == 2


def test_fork_single_mode_app_unchanged_no_materialization(_isolated_stores):
    svc, tmp_path = _isolated_stores
    svc.register_published_app(
        RegisterPublishedAppRequest(
            blueprint=AgentBlueprint(
                name="solo",
                goal="single agent",
                mode="single",
                role_profiles=[RoleProfile(name="agent")],
            ),
            kit_type="custom",
        )
    )
    app_id = svc.list_apps()["apps"][0]["app_id"]
    resp = client.post(f"/catalog/apps/{app_id}/fork")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "agents" not in data
    assert "team" not in data
    assert _agent_files(tmp_path) == {}
    assert _team_files(tmp_path) == {}
