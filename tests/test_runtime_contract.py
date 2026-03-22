import asyncio

from fastapi.testclient import TestClient

from agentgraph.runtime import (
    ResumeRequest,
    RuntimeRequest,
    RuntimeService,
    WorkflowDefinition,
    get_official_example,
    load_official_workflow,
)
from agentgraph.server import app


WORKFLOW_PAYLOAD = {
    "workflow_id": "docs-gap-review",
    "version": "0.1",
    "name": "Docs Gap Review",
    "entrypoint": "planner",
    "nodes": [
        {
            "id": "planner",
            "kind": "agent",
            "type": "planning.analyze",
            "config": {
                "role": "planner",
                "message_template": "[planner] reviewed docs gap",
                "emit": {"gap_count": 2},
                "set_state": {"gap_count": 2},
            },
        },
        {
            "id": "reviewer",
            "kind": "agent",
            "type": "review.summarize",
            "config": {
                "role": "reviewer",
                "message_template": "[reviewer] created notes",
                "copy_input": ["goal"],
                "artifact": {
                    "kind": "report",
                    "name": "review-notes.md",
                    "content": "# notes",
                },
            },
        },
    ],
    "edges": [
        {"from": "planner", "to": "reviewer", "type": "conditional", "condition": "result.gap_count > 0"},
        {"from": "reviewer", "to": "END", "type": "final"},
    ],
}

PARALLEL_WORKFLOW_PAYLOAD = {
    "workflow_id": "parallel-synthesis",
    "version": "0.1",
    "name": "Parallel Synthesis",
    "entrypoint": "fanout",
    "nodes": [
        {
            "id": "fanout",
            "kind": "node",
            "type": "control.parallel",
            "config": {
                "role": "dispatcher",
                "message_template": "[dispatcher] scheduled research branches.",
                "branches": ["research_a", "research_b"],
                "barrier": "merge",
            },
        },
        {
            "id": "research_a",
            "kind": "agent",
            "type": "research.collect",
            "config": {
                "role": "researcher-a",
                "message_template": "[researcher-a] collected product signals.",
                "emit": {"topic": "product", "confidence": 7},
            },
        },
        {
            "id": "research_b",
            "kind": "agent",
            "type": "research.collect",
            "config": {
                "role": "researcher-b",
                "message_template": "[researcher-b] collected engineering signals.",
                "emit": {"topic": "engineering", "confidence": 8},
            },
        },
        {
            "id": "merge",
            "kind": "node",
            "type": "control.barrier",
            "config": {
                "role": "synthesizer",
                "source_parallel": "fanout",
                "message_template": "[synthesizer] joined branch outputs and prepared synthesis context.",
            },
        },
        {
            "id": "writer",
            "kind": "agent",
            "type": "review.summarize",
            "config": {
                "role": "writer",
                "message_template": "[writer] produced the synthesis summary.",
            },
        },
    ],
    "edges": [
        {"from": "merge", "to": "writer", "type": "conditional", "condition": "result.branch_count >= 2"},
        {"from": "writer", "to": "END", "type": "final"},
    ],
}


def test_runtime_service_returns_contract_shape():
    service = RuntimeService()
    request = RuntimeRequest(
        workflow=WorkflowDefinition.model_validate(WORKFLOW_PAYLOAD),
        input={"goal": "Analyze docs gap and produce notes"},
        metadata={"source_system": "pytest"},
    )

    result = asyncio.run(service.run(request))

    assert result.run.status == "succeeded"
    assert result.run.workflow_id == "docs-gap-review"
    assert len(result.steps) == 2
    assert result.steps[0].output["gap_count"] == 2
    assert result.final_output["message"] == "[reviewer] created notes"
    assert result.final_output["copied_input"]["goal"] == "Analyze docs gap and produce notes"
    assert result.artifacts[0].name == "review-notes.md"
    assert result.artifacts[0].writeback.channel == "artifact"
    assert result.artifacts[0].writeback.host_action == "persist_artifact_ref"
    assert result.checkpoints[0].writeback.channel == "checkpoint"
    assert result.checkpoints[0].writeback.host_action == "persist_checkpoint_ref"
    assert len(result.checkpoints) == 2


def test_runtime_service_validates_entrypoint():
    invalid_payload = {
        **WORKFLOW_PAYLOAD,
        "entrypoint": "missing-node",
    }

    try:
        WorkflowDefinition.model_validate(invalid_payload)
    except Exception as exc:
        assert "entrypoint must reference an existing node" in str(exc)
    else:
        raise AssertionError("expected workflow validation to fail")


def test_fastapi_contract_endpoints():
    client = TestClient(app)

    validate_response = client.post("/workflow/validate", json=WORKFLOW_PAYLOAD)
    assert validate_response.status_code == 200
    assert validate_response.json()["valid"] is True

    run_response = client.post(
        "/workflow/run",
        json={
            "workflow": WORKFLOW_PAYLOAD,
            "input": {"goal": "Analyze docs gap and produce notes"},
            "context": {"source_system": "api-test"},
            "metadata": {"source_system": "api"},
        },
    )
    assert run_response.status_code == 200
    run_result = run_response.json()
    assert run_result["run"]["status"] == "succeeded"
    assert len(run_result["steps"]) == 2

    run_id = run_result["run"]["run_id"]
    get_response = client.get(f"/runs/{run_id}")
    assert get_response.status_code == 200
    assert get_response.json()["run"]["run_id"] == run_id

    checkpoint_id = run_result["checkpoints"][0]["checkpoint_id"]
    checkpoint_response = client.get(f"/checkpoints/{checkpoint_id}")
    assert checkpoint_response.status_code == 200
    assert checkpoint_response.json()["checkpoint_id"] == checkpoint_id
    assert checkpoint_response.json()["writeback"]["channel"] == "checkpoint"
    assert checkpoint_response.json()["writeback"]["host_action"] == "persist_checkpoint_ref"


def test_runtime_service_can_resume_from_checkpoint():
    service = RuntimeService()
    request = RuntimeRequest(
        workflow=WorkflowDefinition.model_validate(WORKFLOW_PAYLOAD),
        input={"goal": "Analyze docs gap and produce notes"},
        metadata={"source_system": "pytest"},
    )

    result = asyncio.run(service.run(request))
    checkpoint_id = result.checkpoints[0].checkpoint_id

    resumed = asyncio.run(
        service.resume(
            result.run.run_id,
            ResumeRequest(checkpoint_id=checkpoint_id, metadata={"source_system": "resume-test"}),
        )
    )

    assert resumed.run.status == "succeeded"
    assert resumed.run.metadata["resumed_from_checkpoint_id"] == checkpoint_id
    assert resumed.steps[0].node_id == "reviewer"
    assert resumed.final_output["message"] == "[reviewer] created notes"


def test_runtime_service_supports_parallel_barrier():
    service = RuntimeService()
    request = RuntimeRequest(
        workflow=WorkflowDefinition.model_validate(PARALLEL_WORKFLOW_PAYLOAD),
        input={"goal": "Synthesize two research branches"},
        metadata={"source_system": "pytest"},
    )

    result = asyncio.run(service.run(request))

    assert result.run.status == "succeeded"
    assert [step.node_id for step in result.steps] == ["fanout", "research_a", "research_b", "merge", "writer"]
    assert result.steps[3].output["branch_count"] == 2
    assert sorted(result.steps[3].output["branch_outputs"].keys()) == ["research_a", "research_b"]
    assert result.final_output["message"] == "[writer] produced the synthesis summary."


def test_parallel_workflow_can_resume_after_first_branch():
    service = RuntimeService()
    request = RuntimeRequest(
        workflow=WorkflowDefinition.model_validate(PARALLEL_WORKFLOW_PAYLOAD),
        input={"goal": "Resume parallel synthesis"},
        metadata={"source_system": "pytest"},
    )

    result = asyncio.run(service.run(request))
    branch_checkpoint = next(checkpoint for checkpoint in result.checkpoints if checkpoint.state.current_node_id == "research_a")

    resumed = asyncio.run(
        service.resume(
            result.run.run_id,
            ResumeRequest(checkpoint_id=branch_checkpoint.checkpoint_id, metadata={"source_system": "resume-test"}),
        )
    )

    assert resumed.run.status == "succeeded"
    assert resumed.run.metadata["resumed_from_checkpoint_id"] == branch_checkpoint.checkpoint_id
    assert [step.node_id for step in resumed.steps] == ["research_b", "merge", "writer"]
    assert resumed.steps[1].output["branch_count"] == 2


def test_fastapi_adapter_boundary_supports_run_checkpoint_and_resume():
    client = TestClient(app)
    example = get_official_example("research-review-loop")
    workflow = load_official_workflow(example)

    run_response = client.post(
        "/workflow/run",
        json={
            "workflow": workflow.model_dump(mode="json"),
            "input": example.input,
            "metadata": {"source_system": "adapter-boundary-test", **example.metadata},
        },
    )

    assert run_response.status_code == 200
    payload = run_response.json()
    assert sorted(payload.keys()) == ["artifacts", "checkpoints", "errors", "final_output", "run", "steps", "trace"]
    assert payload["run"]["workflow_id"] == example.id
    assert payload["run"]["status"] == "succeeded"
    assert isinstance(payload["steps"], list) and payload["steps"]
    assert isinstance(payload["artifacts"], list)
    assert isinstance(payload["checkpoints"], list)
    assert isinstance(payload["trace"], list)
    assert isinstance(payload["final_output"], dict)

    run_id = payload["run"]["run_id"]
    get_run_response = client.get(f"/runs/{run_id}")
    assert get_run_response.status_code == 200
    assert get_run_response.json()["run"]["run_id"] == run_id

    checkpoint = next(
        item for item in payload["checkpoints"] if item["state"]["current_node_id"] == example.resume_from_checkpoint_node_id
    )
    checkpoint_response = client.get(f"/checkpoints/{checkpoint['checkpoint_id']}")
    assert checkpoint_response.status_code == 200
    checkpoint_payload = checkpoint_response.json()
    assert checkpoint_payload["run_id"] == run_id
    assert checkpoint_payload["state"]["current_node_id"] == example.resume_from_checkpoint_node_id
    assert checkpoint_payload["state"]["next_node_id"] == example.expected_resumed_nodes[0]

    resume_response = client.post(
        f"/runs/{run_id}/resume",
        json={
            "checkpoint_id": checkpoint["checkpoint_id"],
            "metadata": {"source_system": "adapter-boundary-test", "resume_case": example.id},
        },
    )
    assert resume_response.status_code == 200
    resumed_payload = resume_response.json()
    assert resumed_payload["run"]["metadata"]["resumed_from_checkpoint_id"] == checkpoint["checkpoint_id"]
    assert resumed_payload["run"]["metadata"]["resumed_from_run_id"] == run_id
    assert [step["node_id"] for step in resumed_payload["steps"]] == example.expected_resumed_nodes
    assert resumed_payload["final_output"]["node_id"] == example.expected_resumed_terminal_node
    assert checkpoint_payload["writeback"]["resume_supported"] is True
    assert checkpoint_payload["writeback"]["next_node_id"] == example.expected_resumed_nodes[0]
    assert resumed_payload["artifacts"][0]["writeback"]["channel"] == "artifact"
    assert resumed_payload["artifacts"][0]["writeback"]["host_action"] == "persist_artifact_ref"


def test_parallel_example_exposes_adapter_boundary_branch_outputs():
    example = get_official_example("parallel-synthesis")
    workflow = load_official_workflow(example)
    service = RuntimeService()

    result = asyncio.run(
        service.run(
            RuntimeRequest(
                workflow=workflow,
                input=example.input,
                metadata={"source_system": "adapter-boundary-test", **example.metadata},
            )
        )
    )

    barrier_step = next(step for step in result.steps if step.node_id == "merge")
    assert barrier_step.output["parallel_group"] == "fanout"
    assert barrier_step.output["branch_count"] == example.expected_parallel_branch_count
    assert sorted(barrier_step.output["branch_outputs"].keys()) == ["research_a", "research_b"]
    assert barrier_step.output["branches_completed"] == ["research_a", "research_b"]
    assert result.checkpoints[0].writeback.channel == "checkpoint"
