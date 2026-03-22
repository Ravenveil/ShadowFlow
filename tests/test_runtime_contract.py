import asyncio

from fastapi.testclient import TestClient

from agentgraph.runtime import ResumeRequest, RuntimeRequest, RuntimeService, WorkflowDefinition
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
