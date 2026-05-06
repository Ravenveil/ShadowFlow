"""Trajectory assembly helpers for Story 1.5.

Builds RunTrajectory (summary format) and TrajectoryBundle (0G-archival format)
from a completed RunResult without touching any existing store contracts.
"""

from __future__ import annotations

import logging
from typing import Optional

import yaml

from shadowflow.runtime.contracts import (
    RunResult,
    RunTrajectory,
    TrajectoryBundle,
    WorkflowDefinition,
)

logger = logging.getLogger("shadowflow.trajectory")


def build_run_trajectory(result: RunResult) -> RunTrajectory:
    """Assemble a structured trajectory from a RunResult."""
    final_artifacts = [
        art for art in result.artifacts
        if art.metadata.get("final", False)
    ]

    sorted_steps = sorted(
        result.steps,
        key=lambda s: (s.index, s.started_at),
    )
    sorted_handoffs = sorted(
        result.handoffs,
        key=lambda h: h.created_at,
    )
    sorted_checkpoints = sorted(
        result.checkpoints,
        key=lambda c: c.created_at,
    )

    exported_at = result.run.ended_at or result.run.started_at

    return RunTrajectory(
        run=result.run,
        steps=sorted_steps,
        handoffs=sorted_handoffs,
        checkpoints=sorted_checkpoints,
        final_artifacts=final_artifacts,
        exported_at=exported_at,
    )


def build_trajectory_bundle(
    result: RunResult,
    workflow: Optional[WorkflowDefinition] = None,
) -> TrajectoryBundle:
    """Assemble a full bundle suitable for 0G Storage archival."""
    trajectory = build_run_trajectory(result)

    workflow_yaml: Optional[str] = None
    policy_matrix = None

    if workflow is not None:
        try:
            wf_dict = workflow.model_dump(mode="json", exclude_none=True)
            workflow_yaml = yaml.dump(wf_dict, allow_unicode=True, sort_keys=False)
        except Exception:
            logger.error("Failed to serialize workflow to YAML for run=%s", result.run.run_id, exc_info=True)
            workflow_yaml = None
        policy_matrix = workflow.policy_matrix

    return TrajectoryBundle(
        trajectory=trajectory,
        workflow_yaml=workflow_yaml,
        policy_matrix=policy_matrix,
        exported_at=trajectory.exported_at,
        metadata={
            "run_id": result.run.run_id,
            "workflow_id": result.run.workflow_id,
            "status": result.run.status,
        },
    )
