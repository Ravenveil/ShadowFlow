"""Story 4.5 + 4.6 — runtime policy hot-swap + reconfigure tests."""

from __future__ import annotations

import pytest

from shadowflow.runtime.contracts import RuntimeRequest, WorkflowDefinition
from shadowflow.runtime.events import RunEventBus, POLICY_UPDATED, RUN_RECONFIGURED
from shadowflow.runtime.service import RuntimeService


def _make_workflow() -> dict:
    return {
        "workflow_id": "wf-4.5",
        "version": "1.0",
        "name": "Test",
        "entrypoint": "agent_a",
        "nodes": [
            {"id": "agent_a", "type": "agent"},
            {"id": "agent_b", "type": "agent"},
        ],
        "edges": [{"from": "agent_a", "to": "agent_b", "type": "final"}],
    }


def _service_with_run(run_id: str = "run-4.5-test"):
    bus = RunEventBus()
    svc = RuntimeService(event_bus=bus)
    wf = WorkflowDefinition.model_validate(_make_workflow())
    svc._requests_by_run_id[run_id] = RuntimeRequest(workflow=wf, input={"goal": "x"})
    return svc, bus


class TestUpdatePolicy:
    """Story 4.5 AC2 — POST /workflow/runs/{id}/policy runtime update."""

    def test_returns_status_updated(self):
        svc, _ = _service_with_run()
        result = svc.update_policy("run-4.5-test", {"allow_send": {"agent_a": ["agent_b"]}})
        assert result["status"] == "updated"
        assert "affected_downstream_nodes" in result

    def test_publishes_policy_updated_event(self):
        svc, bus = _service_with_run()
        svc.update_policy("run-4.5-test", {"allow_send": {"agent_a": ["agent_b"]}})
        events = bus.get_events("run-4.5-test")
        assert len(events) == 1
        _, evt = events[0]
        assert evt["type"] == POLICY_UPDATED
        assert evt["run_id"] == "run-4.5-test"

    def test_affected_downstream_excludes_completed(self):
        svc, _ = _service_with_run()
        # With no completed steps yet, every node in workflow is "affected"
        result = svc.update_policy("run-4.5-test", {})
        assert set(result["affected_downstream_nodes"]) == {"agent_a", "agent_b"}

    def test_raises_value_error_for_unknown_run(self):
        svc, _ = _service_with_run()
        with pytest.raises(ValueError):
            svc.update_policy("no-such-run", {})


class TestReconfigure:
    """Story 4.6 AC2 — POST /workflow/runs/{id}/reconfigure."""

    def test_returns_reused_and_new_nodes(self):
        svc, _ = _service_with_run()
        new_def = {
            "agents": [
                {"id": "agent_a"},
                {"id": "agent_b"},
                {"id": "fact_checker"},
            ],
            "edges": [],
            "policy_matrix": {},
        }
        result = svc.reconfigure("run-4.5-test", new_def)
        assert result["status"] == "reconfigured"
        assert "fact_checker" in result["new_nodes"]
        assert "agent_a" not in result["new_nodes"]

    def test_publishes_run_reconfigured(self):
        svc, bus = _service_with_run()
        new_def = {"agents": [{"id": "agent_a"}], "edges": [], "policy_matrix": {}}
        svc.reconfigure("run-4.5-test", new_def)
        events = bus.get_events("run-4.5-test")
        types = [e[1].get("type") for e in events]
        assert RUN_RECONFIGURED in types

    def test_detects_removed_nodes(self):
        svc, _ = _service_with_run()
        # Remove agent_b
        new_def = {"agents": [{"id": "agent_a"}], "edges": [], "policy_matrix": {}}
        result = svc.reconfigure("run-4.5-test", new_def)
        assert "agent_b" in result["removed_nodes"]

    def test_raises_value_error_for_unknown_run(self):
        svc, _ = _service_with_run()
        with pytest.raises(ValueError):
            svc.reconfigure("missing", {"agents": []})
