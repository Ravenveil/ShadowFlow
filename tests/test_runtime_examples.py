import asyncio
import json
import subprocess
import sys
from pathlib import Path

import pytest

from agentgraph.runtime import (
    OFFICIAL_EXAMPLES_MANIFEST,
    RuntimeRequest,
    RuntimeService,
    list_official_examples,
    load_official_workflow,
)


ROOT = Path(__file__).resolve().parents[1]
OFFICIAL_EXAMPLES = list_official_examples()


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
