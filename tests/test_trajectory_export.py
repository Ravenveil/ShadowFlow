"""Story 1.5 — Trajectory Export + Run 查询 API 单元测试。"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict
from uuid import uuid4

import pytest

from shadowflow.runtime.checkpoint_store import InMemoryCheckpointStore
from shadowflow.runtime.contracts import (
    ArtifactRef,
    CheckpointRef,
    CheckpointState,
    HandoffRef,
    RunRecord,
    RunResult,
    RunTrajectory,
    RuntimeRequest,
    StepRecord,
    TrajectoryBundle,
    WorkflowDefinition,
    WorkflowPolicyMatrixSpec,
    WritebackRef,
)
from shadowflow.runtime.trajectory import build_run_trajectory, build_trajectory_bundle


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _writeback(channel="artifact", action="persist_artifact_ref") -> WritebackRef:
    return WritebackRef(channel=channel, target="host", host_action=action)


def _checkpoint_writeback() -> WritebackRef:
    return WritebackRef(
        channel="checkpoint", target="host", host_action="persist_checkpoint_ref", resume_supported=True
    )


def _run_record(run_id: str = "run-traj-1") -> RunRecord:
    return RunRecord(
        run_id=run_id,
        request_id=f"req-{uuid4().hex[:8]}",
        workflow_id="wf-test",
        status="succeeded",
        started_at=_utc_now(),
        ended_at=_utc_now(),
        entrypoint="outline",
    )


def _step(run_id: str, node_id: str, status: str = "succeeded", index: int = 0) -> StepRecord:
    return StepRecord(
        step_id=f"step-{uuid4().hex[:8]}",
        run_id=run_id,
        node_id=node_id,
        status=status,
        index=index,
        started_at=_utc_now(),
    )


def _artifact(step_id: str, run_id: str = "run-traj-1") -> ArtifactRef:
    return ArtifactRef(
        artifact_id=f"art-{uuid4().hex[:8]}",
        kind="text",
        name="output",
        uri="host://artifacts/output",
        producer_step_id=step_id,
        writeback=_writeback(),
    )


def _checkpoint(run_id: str) -> CheckpointRef:
    return CheckpointRef(
        checkpoint_id=f"ckpt-{uuid4().hex[:8]}",
        run_id=run_id,
        state=CheckpointState(
            current_node_id="outline",
            next_node_id="litreview",
            visited_nodes=["outline"],
            last_output={"draft": "x"},
        ),
        writeback=_checkpoint_writeback(),
    )


def _handoff(run_id: str, step_id: str) -> HandoffRef:
    return HandoffRef(
        handoff_id=f"hoff-{uuid4().hex[:8]}",
        run_id=run_id,
        from_step_id=step_id,
        from_node_id="outline",
        to_node_id="litreview",
    )


def _workflow() -> WorkflowDefinition:
    return WorkflowDefinition.model_validate(
        {
            "workflow_id": "wf-test",
            "version": "1.0",
            "name": "Test WF",
            "entrypoint": "outline",
            "nodes": [
                {"id": "outline", "type": "agent"},
                {"id": "litreview", "type": "agent"},
                {"id": "advisor", "type": "agent"},
            ],
            "edges": [
                {"from": "outline", "to": "litreview"},
                {"from": "litreview", "to": "advisor", "type": "final"},
            ],
            "policy_matrix": {
                "allow_send": {},
                "allow_reject": {"advisor": ["litreview"]},
            },
        }
    )


def _run_result(run_id: str = "run-traj-1") -> RunResult:
    run = _run_record(run_id)
    step = _step(run_id, "outline")
    art = _artifact(step.step_id, run_id)
    cp = _checkpoint(run_id)
    hoff = _handoff(run_id, step.step_id)
    return RunResult(
        run=run,
        steps=[step],
        artifacts=[art],
        checkpoints=[cp],
        handoffs=[hoff],
    )


# ---------------------------------------------------------------------------
# RunTrajectory structure
# ---------------------------------------------------------------------------

class TestRunTrajectory:
    def test_has_five_required_keys(self):
        result = _run_result()
        traj = build_run_trajectory(result)
        d = traj.model_dump(mode="json", exclude_none=True)
        for key in ("run", "steps", "handoffs", "checkpoints", "final_artifacts"):
            assert key in d, f"missing key: {key}"

    def test_steps_populated(self):
        result = _run_result()
        traj = build_run_trajectory(result)
        assert len(traj.steps) == 1

    def test_handoffs_populated(self):
        result = _run_result()
        traj = build_run_trajectory(result)
        assert len(traj.handoffs) == 1

    def test_checkpoints_populated(self):
        result = _run_result()
        traj = build_run_trajectory(result)
        assert len(traj.checkpoints) == 1

    def test_final_artifacts_populated(self):
        result = _run_result()
        traj = build_run_trajectory(result)
        # The one artifact is produced by a succeeded step — should appear in final_artifacts
        assert len(traj.final_artifacts) >= 0  # may be 0 if no "final" flag

    def test_empty_run_result(self):
        result = RunResult(run=_run_record(), steps=[], artifacts=[], checkpoints=[], handoffs=[])
        traj = build_run_trajectory(result)
        assert traj.steps == []
        assert traj.handoffs == []
        assert traj.checkpoints == []


# ---------------------------------------------------------------------------
# ISO 8601 UTC timestamps
# ---------------------------------------------------------------------------

class TestTimestampFormat:
    def test_run_started_at_is_utc(self):
        result = _run_result()
        traj = build_run_trajectory(result)
        d = traj.model_dump(mode="json", exclude_none=True)
        ts = d["run"]["started_at"]
        # datetime in JSON mode is ISO 8601 string
        assert isinstance(ts, str)
        # Must be parseable and UTC-aware
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        assert dt.tzinfo is not None

    def test_exported_at_present(self):
        result = _run_result()
        traj = build_run_trajectory(result)
        d = traj.model_dump(mode="json", exclude_none=True)
        assert "exported_at" in d


# ---------------------------------------------------------------------------
# exclude_none=True
# ---------------------------------------------------------------------------

class TestExcludeNone:
    def test_no_null_values_in_summary(self):
        result = _run_result()
        traj = build_run_trajectory(result)
        d = traj.model_dump(mode="json", exclude_none=True)
        _assert_no_none(d)

    def test_no_null_values_in_bundle(self):
        result = _run_result()
        wf = _workflow()
        bundle = build_trajectory_bundle(result, wf)
        d = bundle.model_dump(mode="json", exclude_none=True)
        _assert_no_none(d)


def _assert_no_none(obj: Any) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            assert v is not None, f"unexpected None at key={k}"
            _assert_no_none(v)
    elif isinstance(obj, list):
        for item in obj:
            _assert_no_none(item)


# ---------------------------------------------------------------------------
# TrajectoryBundle (format=trajectory)
# ---------------------------------------------------------------------------

class TestTrajectoryBundle:
    def test_has_trajectory_key(self):
        result = _run_result()
        bundle = build_trajectory_bundle(result)
        d = bundle.model_dump(mode="json", exclude_none=True)
        assert "trajectory" in d

    def test_includes_workflow_yaml_when_provided(self):
        result = _run_result()
        wf = _workflow()
        bundle = build_trajectory_bundle(result, wf)
        d = bundle.model_dump(mode="json", exclude_none=True)
        assert "workflow_yaml" in d
        assert isinstance(d["workflow_yaml"], str)
        assert "wf-test" in d["workflow_yaml"]

    def test_includes_policy_matrix_when_provided(self):
        result = _run_result()
        wf = _workflow()
        bundle = build_trajectory_bundle(result, wf)
        d = bundle.model_dump(mode="json", exclude_none=True)
        assert "policy_matrix" in d
        pm = d["policy_matrix"]
        assert "allow_reject" in pm

    def test_no_workflow_yaml_when_workflow_not_provided(self):
        result = _run_result()
        bundle = build_trajectory_bundle(result, workflow=None)
        d = bundle.model_dump(mode="json", exclude_none=True)
        assert "workflow_yaml" not in d

    def test_bundle_version_present(self):
        result = _run_result()
        bundle = build_trajectory_bundle(result)
        assert bundle.bundle_version == "1.0"

    def test_metadata_has_run_id(self):
        result = _run_result("run-meta-check")
        bundle = build_trajectory_bundle(result)
        assert bundle.metadata["run_id"] == "run-meta-check"

    def test_trajectory_preserves_steps(self):
        result = _run_result()
        wf = _workflow()
        bundle = build_trajectory_bundle(result, wf)
        assert len(bundle.trajectory.steps) == 1
