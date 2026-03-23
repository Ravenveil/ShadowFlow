import asyncio

from agentgraph.runtime import (
    InMemoryCheckpointStore,
    ReferenceWritebackAdapter,
    ResumeRequest,
    RuntimeRequest,
    RuntimeService,
    get_official_example,
    load_official_workflow,
)


def build_service_with_reference_adapter():
    checkpoint_store = InMemoryCheckpointStore()
    adapter = ReferenceWritebackAdapter(checkpoint_store=checkpoint_store)
    service = RuntimeService(writeback_adapter=adapter, checkpoint_store=checkpoint_store)
    return service, adapter, checkpoint_store


def test_reference_writeback_adapter_persists_docs_memory_and_graph_targets():
    service, adapter, checkpoint_store = build_service_with_reference_adapter()

    docs_example = get_official_example("docs-gap-review")
    docs_result = asyncio.run(
        service.run(
            RuntimeRequest(
                workflow=load_official_workflow(docs_example),
                input=docs_example.input,
                metadata={"source_system": "pytest-adapter", **docs_example.metadata},
            )
        )
    )

    parallel_example = get_official_example("parallel-synthesis")
    parallel_result = asyncio.run(
        service.run(
            RuntimeRequest(
                workflow=load_official_workflow(parallel_example),
                input=parallel_example.input,
                metadata={"source_system": "pytest-adapter", **parallel_example.metadata},
            )
        )
    )

    snapshot = adapter.snapshot()
    assert docs_result.run.metadata["writeback_receipts"]
    assert parallel_result.run.metadata["writeback_receipts"]
    assert "docs-gap-review-notes.md" in {
        payload["name"] for payload in snapshot["artifacts"]["docs"].values()
    }
    docs_payload = next(
        payload
        for payload in snapshot["artifacts"]["docs"].values()
        if payload["name"] == "docs-gap-review-notes.md"
    )
    assert docs_payload["content"] == "# Docs Gap Review Notes"
    assert checkpoint_store.list_run(docs_result.run.run_id)
    assert checkpoint_store.list_run(parallel_result.run.run_id)
    assert snapshot["checkpoints"]["memory"]
    assert snapshot["checkpoints"]["graph"]


def test_reference_writeback_adapter_respects_node_override_and_reference_modes():
    service, adapter, _ = build_service_with_reference_adapter()
    example = get_official_example("content-creation-phase1")
    result = asyncio.run(
        service.run(
            RuntimeRequest(
                workflow=load_official_workflow(example),
                input=example.input,
                metadata={"source_system": "pytest-adapter", **example.metadata},
            )
        )
    )

    snapshot = adapter.snapshot()
    docs_artifacts = {payload["name"]: payload for payload in snapshot["artifacts"]["docs"].values()}
    memory_artifacts = {payload["name"]: payload for payload in snapshot["artifacts"]["memory"].values()}

    assert "content-creation-final.md" in docs_artifacts
    assert docs_artifacts["content-creation-final.md"]["mode"] == "inline"
    assert docs_artifacts["content-creation-final.md"]["content"] == "# Content Creation Final\n\nThe final version is ready."
    assert "content-creation-draft.md" in memory_artifacts
    assert memory_artifacts["content-creation-draft.md"]["mode"] == "reference"
    assert memory_artifacts["content-creation-draft.md"]["content"] is None
    assert result.run.metadata["writeback_receipts"]


def test_checkpoint_store_supports_resume_across_runtime_instances_with_registered_request_context():
    checkpoint_store = InMemoryCheckpointStore()
    service1 = RuntimeService(checkpoint_store=checkpoint_store)

    example = get_official_example("research-review-loop")
    workflow = load_official_workflow(example)
    request = RuntimeRequest(
        workflow=workflow,
        input=example.input,
        metadata={"source_system": "pytest-store", **example.metadata},
    )

    initial = asyncio.run(service1.run(request))
    checkpoint = next(
        item for item in initial.checkpoints if item.state.current_node_id == example.resume_from_checkpoint_node_id
    )
    assert checkpoint_store.get_record(checkpoint.checkpoint_id) is not None

    service2 = RuntimeService(checkpoint_store=checkpoint_store)
    service2.register_request_context(initial.run.run_id, request)

    stored_checkpoint = service2.get_checkpoint(checkpoint.checkpoint_id)
    assert stored_checkpoint is not None
    assert stored_checkpoint.checkpoint_id == checkpoint.checkpoint_id

    resumed = asyncio.run(
        service2.resume(
            initial.run.run_id,
            ResumeRequest(
                checkpoint_id=checkpoint.checkpoint_id,
                metadata={"source_system": "pytest-store", "resume_case": example.id},
            ),
        )
    )

    assert resumed.run.status == "succeeded"
    assert resumed.run.metadata["resumed_from_checkpoint_id"] == checkpoint.checkpoint_id
    assert [step.node_id for step in resumed.steps] == example.expected_resumed_nodes
