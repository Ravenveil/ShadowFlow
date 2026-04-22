"""Story 1.2 — Approval Gate 节点类型单元测试。"""

from __future__ import annotations

import asyncio
from typing import Any, Dict

import pytest
from pydantic import ValidationError

from shadowflow.runtime.contracts import (
    ApprovalGateConfig,
    EdgeDefinition,
    NodeDefinition,
    RuntimeRequest,
    WorkflowDefinition,
)
from shadowflow.runtime.service import RuntimeService


# ---------------------------------------------------------------------------
# 工具函数：构造含 approval_gate 节点的合法工作流
# ---------------------------------------------------------------------------

def _approval_workflow(
    on_reject: str = "halt",
    timeout_seconds: int = 300,
) -> WorkflowDefinition:
    return WorkflowDefinition.model_validate(
        {
            "workflow_id": "approval-test",
            "version": "1.0",
            "name": "Approval Test",
            "entrypoint": "prepare",
            "nodes": [
                {"id": "prepare", "type": "agent"},
                {
                    "id": "gate",
                    "type": "approval_gate",
                    "approval": {
                        "approver": "compliance_officer",
                        "on_reject": on_reject,
                        "timeout_seconds": timeout_seconds,
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


def _make_request(wf: WorkflowDefinition) -> RuntimeRequest:
    return RuntimeRequest(
        workflow=wf,
        input={"message": "test content"},
    )


# ---------------------------------------------------------------------------
# ApprovalGateConfig 模型测试
# ---------------------------------------------------------------------------

class TestApprovalGateConfig:
    def test_default_values(self):
        cfg = ApprovalGateConfig(approver="manager")
        assert cfg.on_reject == "halt"
        assert cfg.timeout_seconds == 300
        assert cfg.on_approve is None

    def test_custom_values(self):
        cfg = ApprovalGateConfig(
            approver="legal",
            on_reject="retry",
            timeout_seconds=60,
            on_approve="fast_path",
        )
        assert cfg.on_reject == "retry"
        assert cfg.timeout_seconds == 60

    def test_invalid_on_reject(self):
        with pytest.raises(ValidationError):
            ApprovalGateConfig(approver="x", on_reject="unknown_action")


# ---------------------------------------------------------------------------
# NodeDefinition approval_gate 校验
# ---------------------------------------------------------------------------

class TestNodeDefinitionApprovalGate:
    def test_approval_gate_requires_approval_config(self):
        with pytest.raises(ValidationError, match="approval"):
            NodeDefinition(id="gate", type="approval_gate")

    def test_approval_gate_valid(self):
        node = NodeDefinition(
            id="gate",
            type="approval_gate",
            approval=ApprovalGateConfig(approver="manager"),
        )
        assert node.approval.approver == "manager"

    def test_non_approval_gate_no_approval_needed(self):
        node = NodeDefinition(id="agent1", type="agent")
        assert node.approval is None


# ---------------------------------------------------------------------------
# approve 后下游节点执行
# ---------------------------------------------------------------------------

class TestApprovalGateApprove:
    @pytest.mark.asyncio
    async def test_approve_allows_downstream(self):
        service = RuntimeService()
        wf = _approval_workflow()
        request = _make_request(wf)

        async def approve_later():
            await asyncio.sleep(0.05)
            service.submit_approval("dummy", "gate", "approve")

        # 需要在 run 开始后，先找到 run_id
        result_holder: Dict[str, Any] = {}

        async def run_and_capture():
            result = await service.run(request)
            result_holder["result"] = result

        run_task = asyncio.create_task(run_and_capture())
        # 等待 run 启动并注册 approval event
        await asyncio.sleep(0.02)
        # 找到正确的 run_id（通过 approval_events）
        key = next(iter(service._approval_events.keys()), None)
        if key:
            run_id, node_id = key
            service.submit_approval(run_id, node_id, "approve")

        await run_task
        result = result_holder.get("result")
        assert result is not None
        assert result.run.status == "succeeded"

    @pytest.mark.asyncio
    async def test_reject_sets_rejected_state(self):
        service = RuntimeService()
        wf = _approval_workflow(on_reject="halt")
        request = _make_request(wf)

        result_holder: Dict[str, Any] = {}

        async def run_and_capture():
            result = await service.run(request)
            result_holder["result"] = result

        run_task = asyncio.create_task(run_and_capture())
        await asyncio.sleep(0.02)
        key = next(iter(service._approval_events.keys()), None)
        if key:
            run_id, node_id = key
            service.submit_approval(run_id, node_id, "reject", "policy violation")

        await run_task
        result = result_holder.get("result")
        assert result is not None
        # reject 后 on_reject=halt 意味着工作流继续尝试但走 reject 分支
        gate_steps = [s for s in result.steps if s.node_id == "gate"]
        assert gate_steps, "should have a step for the gate node"
        gate_step = gate_steps[0]
        assert gate_step.output.get("approval_status") == "rejected"


# ---------------------------------------------------------------------------
# 超时 → paused 状态 + checkpoint
# ---------------------------------------------------------------------------

class TestApprovalGateTimeout:
    @pytest.mark.asyncio
    async def test_timeout_causes_paused(self):
        service = RuntimeService()
        wf = _approval_workflow(timeout_seconds=1)  # 1s 超时
        request = _make_request(wf)

        result = await service.run(request)
        assert result.run.status == "paused"

    @pytest.mark.asyncio
    async def test_timeout_saves_checkpoint(self):
        service = RuntimeService()
        wf = _approval_workflow(timeout_seconds=1)
        request = _make_request(wf)

        result = await service.run(request)
        assert result.run.status == "paused"
        # 超时前的节点（prepare）应有 checkpoint
        assert len(result.checkpoints) >= 1


# ---------------------------------------------------------------------------
# submit_approval 信号机制
# ---------------------------------------------------------------------------

class TestSubmitApproval:
    def test_submit_no_waiter_returns_false(self):
        service = RuntimeService()
        ok = service.submit_approval("no-such-run", "no-such-node", "approve")
        assert ok is False

    @pytest.mark.asyncio
    async def test_submit_valid_returns_true(self):
        service = RuntimeService()
        # 手动注册一个 event
        key = ("run-abc", "gate-1")
        event = asyncio.Event()
        service._approval_events[key] = event

        ok = service.submit_approval("run-abc", "gate-1", "approve")
        assert ok is True
        assert event.is_set()
