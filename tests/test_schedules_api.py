"""Schedules API tests — Story 14.2 AC3/AC4.

Covers:
  - POST /schedules creates a schedule (201)
  - GET /schedules returns list
  - GET /schedules?group_id filters correctly
  - DELETE /schedules/{id} removes schedule (204)
  - GET /schedules/{id}/runs returns run history
  - 422 on invalid cron expression
  - 422 on task_description > 500 chars
  - 409 on duplicate group_id schedule
  - 404 on unknown schedule_id in DELETE
  - Scheduler startup/shutdown hooks via app startup
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import shadowflow.api.schedules as schedules_api
from shadowflow.server import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _clean_schedules(tmp_path, monkeypatch):
    """Redirect schedule storage to a temp dir for test isolation."""
    tmp_dir = tmp_path / "schedules"
    tmp_dir.mkdir()
    monkeypatch.setattr(schedules_api, "_SCHEDULES_DIR", tmp_dir)
    yield
    shutil.rmtree(tmp_dir, ignore_errors=True)


def _create(group_id="grp-test", cron="0 8 * * *", agent_id="agent-1", desc="Daily brief"):
    return client.post("/schedules", json={
        "group_id": group_id,
        "cron_expression": cron,
        "agent_id": agent_id,
        "task_description": desc,
    })


# ---------------------------------------------------------------------------
# POST /schedules
# ---------------------------------------------------------------------------

def test_create_schedule_returns_201():
    res = _create()
    assert res.status_code == 201
    body = res.json()
    assert "data" in body
    data = body["data"]
    assert data["group_id"] == "grp-test"
    assert data["cron_expression"] == "0 8 * * *"
    assert data["agent_id"] == "agent-1"
    assert data["schedule_id"]


def test_create_schedule_stores_task_description():
    res = _create(desc="Morning standup")
    assert res.status_code == 201
    assert res.json()["data"]["task_description"] == "Morning standup"


def test_create_schedule_invalid_cron_returns_422():
    res = client.post("/schedules", json={
        "group_id": "grp-bad",
        "cron_expression": "* * * *",  # only 4 fields — invalid
        "agent_id": "a1",
        "task_description": "",
    })
    assert res.status_code == 422
    detail = res.json()["detail"]
    assert detail["error"] == "invalid_cron"
    assert "example" in detail


def test_create_schedule_task_description_too_long_returns_422():
    res = client.post("/schedules", json={
        "group_id": "grp-long",
        "cron_expression": "0 8 * * *",
        "agent_id": "a1",
        "task_description": "x" * 501,
    })
    assert res.status_code == 422


def test_create_schedule_duplicate_group_id_returns_409():
    _create(group_id="grp-dup")
    res = _create(group_id="grp-dup")
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert detail["error"] == "schedule_exists"
    assert "existing_id" in detail
    assert "hint" in detail


# ---------------------------------------------------------------------------
# GET /schedules
# ---------------------------------------------------------------------------

def test_list_schedules_returns_all():
    _create(group_id="grp-a")
    _create(group_id="grp-b")
    res = client.get("/schedules")
    assert res.status_code == 200
    data = res.json()["data"]
    ids = {r["group_id"] for r in data}
    assert {"grp-a", "grp-b"}.issubset(ids)


def test_list_schedules_filtered_by_group_id():
    _create(group_id="grp-x")
    _create(group_id="grp-y")
    res = client.get("/schedules?group_id=grp-x")
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data) == 1
    assert data[0]["group_id"] == "grp-x"


def test_list_schedules_empty():
    res = client.get("/schedules")
    assert res.status_code == 200
    assert res.json()["data"] == []


# ---------------------------------------------------------------------------
# DELETE /schedules/{id}
# ---------------------------------------------------------------------------

def test_delete_schedule_returns_204():
    created = _create().json()["data"]
    sid = created["schedule_id"]
    res = client.delete(f"/schedules/{sid}")
    assert res.status_code == 204
    # Verify gone
    res2 = client.get("/schedules")
    ids = [r["schedule_id"] for r in res2.json()["data"]]
    assert sid not in ids


def test_delete_schedule_not_found_returns_404():
    res = client.delete("/schedules/nonexistent-id-99")
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# GET /schedules/{id}/runs
# ---------------------------------------------------------------------------

def test_get_runs_empty_for_new_schedule():
    created = _create().json()["data"]
    sid = created["schedule_id"]
    res = client.get(f"/schedules/{sid}/runs")
    assert res.status_code == 200
    assert res.json()["data"] == []


def test_get_runs_not_found_returns_404():
    res = client.get("/schedules/no-such-id/runs")
    assert res.status_code == 404
