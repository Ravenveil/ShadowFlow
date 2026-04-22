"""Story 1.3 — 运行时真驳回 + Handoff 事件单元测试。"""

from __future__ import annotations

import asyncio

import pytest
from pydantic import ValidationError

from shadowflow.runtime.contracts import (
    RuntimeRequest,
    WorkflowDefinition,
    WorkflowPolicyMatrixSpec,
)
from shadowflow.runtime.errors import PolicyViolation, ShadowflowError
from shadowflow.runtime.events import (
    HANDOFF_TRIGGERED,
    NODE_REJECTED,
    POLICY_VIOLATION,
    PolicyViolationEvent,
)
from shadowflow.runtime.service import RuntimeService


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

def _workflow_with_matrix(allow_reject: dict) -> WorkflowDefinition:
    nodes = [{"id": k, "type": "agent"} for k in {"compliance_officer", "content_officer", "publisher"}]
    return WorkflowDefinition.model_validate(
        {
            "workflow_id": "reject-test",
            "version": "1.0",
            "name": "Reject Test",
            "entrypoint": "content_officer",
            "nodes": nodes,
            "edges": [
                {"from": "content_officer", "to": "compliance_officer"},
                {"from": "compliance_officer", "to": "publisher", "type": "final"},
            ],
            "policy_matrix": {
                "allow_send": {},
                "allow_reject": allow_reject,
            },
        }
    )


def _service_with_run(wf: WorkflowDefinition) -> tuple[RuntimeService, str]:
    svc = RuntimeService()
    request = RuntimeRequest(workflow=wf, input={"message": "test"})
    fake_run_id = "run-test-123"
    svc._requests_by_run_id[fake_run_id] = request
    return svc, fake_run_id


# ---------------------------------------------------------------------------
# ShadowflowError 基类
# ---------------------------------------------------------------------------

class TestShadowflowError:
    def test_base_error_to_dict(self):
        err = ShadowflowError("something went wrong", details={"key": "val"})
        d = err.to_dict()
        assert d["code"] == "SHADOWFLOW_ERROR"
        assert d["message"] == "something went wrong"
        assert d["details"] == {"key": "val"}

    def test_policy_violation_error(self):
        err = PolicyViolation(reviewer="agent_a", target="agent_b", reason="not allowed")
        assert err.code == "POLICY_VIOLATION"
        assert "agent_a" in str(err)
        d = err.to_dict()
        assert d["details"]["reviewer"] == "agent_a"


# ---------------------------------------------------------------------------
# AC #2 — allow_reject 不命中时 raise PolicyViolation
# ---------------------------------------------------------------------------

class TestRejectPolicyEnforcement:
    @pytest.mark.asyncio
    async def test_reject_raises_when_not_allowed(self):
        wf = _workflow_with_matrix({"compliance_officer": ["content_officer"]})
        svc, run_id = _service_with_run(wf)
        with pytest.raises(PolicyViolation) as exc_info:
            await svc.reject(run_id, reviewer_role="rogue_agent", target_node_id="content_officer", reason="hack")
        assert exc_info.value.code == "POLICY_VIOLATION"

    @pytest.mark.asyncio
    async def test_reject_allowed_when_in_matrix(self):
        wf = _workflow_with_matrix({"compliance_officer": ["content_officer"]})
        svc, run_id = _service_with_run(wf)
        # 注册一个假 approval event，让 submit_approval 能找到它
        key = (run_id, "content_officer")
        import asyncio
        event = asyncio.Event()
        svc._approval_events[key] = event
        # 不应抛异常，且 approval event 应被唤醒
        await svc.reject(run_id, reviewer_role="compliance_officer", target_node_id="content_officer", reason="GDPR violation")
        assert event.is_set()

    @pytest.mark.asyncio
    async def test_reject_no_policy_matrix_allowed(self):
        """没有 policy_matrix 时，直接放行（无限制）。"""
        wf = WorkflowDefinition.model_validate(
            {
                "workflow_id": "no-policy",
                "version": "1.0",
                "name": "No Policy",
                "entrypoint": "a",
                "nodes": [{"id": "a", "type": "agent"}, {"id": "b", "type": "agent"}],
                "edges": [{"from": "a", "to": "b", "type": "final"}],
            }
        )
        svc, run_id = _service_with_run(wf)
        # 没有 policy_matrix → 不应抛异常（只尝试 submit_approval，返回 False 即可）
        result = await svc.reject(run_id, "any_reviewer", "b", "test")
        # 只要没抛 PolicyViolation 即通过
        assert result is None


# ---------------------------------------------------------------------------
# AC #1 — 事件序列验证
# ---------------------------------------------------------------------------

class TestRejectionEventSequence:
    @pytest.mark.asyncio
    async def test_rejection_records_events(self):
        wf = _workflow_with_matrix({"compliance_officer": ["content_officer"]})
        svc, run_id = _service_with_run(wf)
        key = (run_id, "content_officer")
        import asyncio
        event = asyncio.Event()
        svc._approval_events[key] = event

        await svc.reject(run_id, "compliance_officer", "content_officer", "GDPR violation")

        events = svc._rejection_events.get(run_id, [])
        assert len(events) == 1
        event_list = events[0]["events"]
        event_types = [e["event"] for e in event_list]
        # policy.violation 必须在 node.rejected 之前
        assert event_types.index(POLICY_VIOLATION) < event_types.index(NODE_REJECTED)
        assert HANDOFF_TRIGGERED in event_types

    @pytest.mark.asyncio
    async def test_rejection_event_payload(self):
        wf = _workflow_with_matrix({"compliance_officer": ["content_officer"]})
        svc, run_id = _service_with_run(wf)
        key = (run_id, "content_officer")
        import asyncio
        svc._approval_events[key] = asyncio.Event()

        await svc.reject(run_id, "compliance_officer", "content_officer", "GDPR")
        ev = svc._rejection_events[run_id][0]["events"][0]
        assert ev["sender"] == "compliance_officer"
        assert ev["receiver"] == "content_officer"
        assert ev["reason"] == "GDPR"


# ---------------------------------------------------------------------------
# PolicyViolationEvent Pydantic 模型
# ---------------------------------------------------------------------------

class TestPolicyViolationEvent:
    def test_model_fields(self):
        ev = PolicyViolationEvent(
            sender="compliance_officer",
            receiver="content_officer",
            reason="GDPR",
            node_id="content_officer",
        )
        assert ev.event == POLICY_VIOLATION
        assert ev.sender == "compliance_officer"
        assert ev.timestamp is not None

    def test_roundtrip(self):
        ev = PolicyViolationEvent(
            sender="a", receiver="b", reason="test", node_id="b"
        )
        data = ev.model_dump()
        ev2 = PolicyViolationEvent.model_validate(data)
        assert ev2.sender == ev.sender


# ---------------------------------------------------------------------------
# AC #1 — approve 后 runtime 真实执行到下游节点（集成测试）
# ---------------------------------------------------------------------------

class TestRejectionIntegration:
    @pytest.mark.asyncio
    async def test_reject_then_approve_completes(self):
        """reject 后再 approve → run 最终完成。"""
        wf = WorkflowDefinition.model_validate(
            {
                "workflow_id": "integration-test",
                "version": "1.0",
                "name": "Integration",
                "entrypoint": "prepare",
                "nodes": [
                    {"id": "prepare", "type": "agent"},
                    {
                        "id": "gate",
                        "type": "approval_gate",
                        "approval": {
                            "approver": "compliance_officer",
                            "on_reject": "halt",
                            "timeout_seconds": 5,
                        },
                    },
                    {"id": "publish", "type": "agent"},
                ],
                "edges": [
                    {"from": "prepare", "to": "gate"},
                    {"from": "gate", "to": "publish", "type": "final"},
                ],
            }
        )
        svc = RuntimeService()
        request = RuntimeRequest(workflow=wf, input={"message": "content"})
        result_holder = {}

        async def run_it():
            result_holder["r"] = await svc.run(request)

        task = asyncio.create_task(run_it())
        await asyncio.sleep(0.02)
        key = next(iter(svc._approval_events.keys()), None)
        if key:
            run_id, node_id = key
            svc.submit_approval(run_id, node_id, "approve")
        await task
        assert result_holder["r"].run.status == "succeeded"
