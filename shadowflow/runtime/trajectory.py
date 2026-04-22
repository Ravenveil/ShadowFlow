"""Trajectory assembly helpers for Story 1.5.

Builds RunTrajectory (summary format) and TrajectoryBundle (0G-archival format)
from a completed RunResult without touching any existing store contracts.
"""

from __future__ import annotations

from typing import Optional

import yaml

from shadowflow.runtime.contracts import (
    RunResult,
    RunTrajectory,
    TrajectoryBundle,
    WorkflowDefinition,
)


def build_run_trajectory(result: RunResult) -> RunTrajectory:
    """Assemble a structured trajectory from a RunResult.

    Only `final_artifacts` (artifacts without a parent step — i.e., top-level outputs)
    are included under that key; all artifacts live in `steps` context.
    """
    final_artifacts = [
        art for art in result.artifacts
        if art.metadata.get("final", False) or art.producer_step_id in {
            s.step_id for s in result.steps if s.status == "succeeded"
        }
    ]

    return RunTrajectory(
        run=result.run,
        steps=result.steps,
        handoffs=result.handoffs,
        checkpoints=result.checkpoints,
        final_artifacts=final_artifacts,
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
            workflow_yaml = None
        policy_matrix = workflow.policy_matrix

    return TrajectoryBundle(
        trajectory=trajectory,
        workflow_yaml=workflow_yaml,
        policy_matrix=policy_matrix,
        metadata={
            "run_id": result.run.run_id,
            "workflow_id": result.run.workflow_id,
            "status": result.run.status,
        },
    )
