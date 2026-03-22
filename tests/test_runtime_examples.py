import asyncio
import json
import subprocess
import sys
from pathlib import Path

import pytest

from agentgraph.runtime import (
    OFFICIAL_EXAMPLES_MANIFEST,
    ResumeRequest,
    RuntimeRequest,
    RuntimeService,
    list_official_examples,
    load_official_workflow,
)


ROOT = Path(__file__).resolve().parents[1]
OFFICIAL_EXAMPLES = list_official_examples()
RESUMABLE_OFFICIAL_EXAMPLES = [
    example for example in OFFICIAL_EXAMPLES if example.resume_from_checkpoint_node_id is not None
]


def assert_run_result_adapter_boundary(result) -> None:
    assert result.run.run_id.startswith("run-")
    assert result.run.request_id.startswith("req-")
    assert result.run.status in {"succeeded", "failed", "cancelled", "checkpointed", "waiting"}
    assert isinstance(result.final_output, dict)
    assert isinstance(result.trace, list)
    assert isinstance(result.artifacts, list)
    assert isinstance(result.checkpoints, list)
    assert isinstance(result.errors, list)

    for step in result.steps:
        assert step.run_id == result.run.run_id
        assert step.step_id.startswith("step-")
        assert step.status in {"pending", "running", "succeeded", "failed", "skipped", "cancelled"}
        assert isinstance(step.input, dict)
        assert isinstance(step.output, dict)
        assert isinstance(step.trace, list)
        assert isinstance(step.artifacts, list)

    for checkpoint in result.checkpoints:
        assert checkpoint.run_id == result.run.run_id
        assert checkpoint.checkpoint_id.startswith("ckpt-")
        assert checkpoint.state.current_node_id is not None
        assert isinstance(checkpoint.state.visited_nodes, list)
        assert isinstance(checkpoint.state.last_output, dict)
        assert checkpoint.writeback.channel == "checkpoint"
        assert checkpoint.writeback.host_action == "persist_checkpoint_ref"
        assert checkpoint.writeback.target == "host"
        assert checkpoint.writeback.mode == "reference"
        assert checkpoint.writeback.resume_supported == (checkpoint.state.next_node_id is not None)
        assert checkpoint.writeback.next_node_id == checkpoint.state.next_node_id
        assert checkpoint.metadata["workflow_id"] == result.run.workflow_id

    for artifact in result.artifacts:
        assert artifact.artifact_id.startswith("artifact-")
        assert artifact.producer_step_id.startswith("step-")
        assert artifact.kind in {"text", "json", "document", "report", "patch", "log"}
        assert artifact.writeback.channel == "artifact"
        assert artifact.writeback.host_action == "persist_artifact_ref"
        assert artifact.writeback.target == "host"
        assert artifact.writeback.mode == "reference"
        assert artifact.writeback.content_field == ("metadata.content" if artifact.metadata.get("content") else None)
        assert artifact.metadata["workflow_id"] == result.run.workflow_id


def test_official_examples_manifest_is_consistent():
    example_ids = [example.id for example in OFFICIAL_EXAMPLES]
    workflow_paths = [example.workflow_path for example in OFFICIAL_EXAMPLES]

    assert OFFICIAL_EXAMPLES_MANIFEST.exists()
    assert len(OFFICIAL_EXAMPLES) >= 6
    assert len(example_ids) == len(set(example_ids))
    assert len(workflow_paths) == len(set(workflow_paths))

    for example in OFFICIAL_EXAMPLES:
        assert example.workflow_path.exists()
        workflow = load_official_workflow(example)
        assert workflow.workflow_id == example.id
        for legacy_path in example.source_legacy_paths:
            assert (ROOT / legacy_path).exists()


@pytest.mark.parametrize("example", OFFICIAL_EXAMPLES, ids=lambda example: example.id)
def test_official_examples_validate_and_run(example):
    service = RuntimeService()
    workflow = load_official_workflow(example)

    validation = service.validate_workflow(workflow)
    assert validation.valid is True

    result = asyncio.run(
        service.run(
            RuntimeRequest(
                workflow=workflow,
                input=example.input,
                metadata={"source_system": "pytest-example", **example.metadata},
            )
        )
    )

    assert_run_result_adapter_boundary(result)
    assert result.run.status == "succeeded"
    assert result.run.workflow_id == workflow.workflow_id
    assert len(result.steps) >= example.min_steps
    assert result.final_output["node_id"] == example.expected_terminal_node

    actual_artifacts = [artifact.name for artifact in result.artifacts]
    for artifact_name in example.expected_artifact_names:
        assert artifact_name in actual_artifacts

    if example.expected_parallel_branch_count is not None:
        barrier_steps = [step for step in result.steps if "branch_count" in step.output]
        assert barrier_steps
        assert barrier_steps[-1].output["branch_count"] == example.expected_parallel_branch_count


@pytest.mark.parametrize("example", RESUMABLE_OFFICIAL_EXAMPLES, ids=lambda example: example.id)
def test_official_examples_resume_from_manifest_checkpoint(example):
    service = RuntimeService()
    workflow = load_official_workflow(example)

    initial = asyncio.run(
        service.run(
            RuntimeRequest(
                workflow=workflow,
                input=example.input,
                metadata={"source_system": "pytest-resume", **example.metadata},
            )
        )
    )
    checkpoint = next(
        item for item in initial.checkpoints if item.state.current_node_id == example.resume_from_checkpoint_node_id
    )

    resumed = asyncio.run(
        service.resume(
            initial.run.run_id,
            ResumeRequest(
                checkpoint_id=checkpoint.checkpoint_id,
                metadata={"source_system": "pytest-resume", "resume_case": example.id},
            ),
        )
    )

    assert_run_result_adapter_boundary(resumed)
    assert resumed.run.status == "succeeded"
    assert resumed.run.metadata["resumed_from_checkpoint_id"] == checkpoint.checkpoint_id
    assert resumed.run.metadata["resumed_from_run_id"] == initial.run.run_id
    assert [step.node_id for step in resumed.steps] == example.expected_resumed_nodes
    assert resumed.final_output["node_id"] == example.expected_resumed_terminal_node

    actual_resume_artifacts = [artifact.name for artifact in resumed.artifacts]
    for artifact_name in example.expected_resume_artifact_names:
        assert artifact_name in actual_resume_artifacts


@pytest.mark.parametrize("example", OFFICIAL_EXAMPLES, ids=lambda example: example.id)
def test_official_examples_cli_validate(example):
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "agentgraph.cli",
            "validate",
            "-w",
            str(example.workflow_path),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(completed.stdout)
    assert payload["valid"] is True
    assert payload["workflow_id"] == example.id
