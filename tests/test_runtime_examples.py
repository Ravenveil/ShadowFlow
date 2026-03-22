from pathlib import Path
import asyncio

import yaml

from agentgraph.runtime import RuntimeRequest, RuntimeService, WorkflowDefinition


ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = [
    ROOT / "examples" / "runtime-contract" / "docs-gap-review.yaml",
    ROOT / "examples" / "runtime-contract" / "research-review-loop.yaml",
]


def test_runtime_contract_examples_validate_and_run():
    service = RuntimeService()

    for example_path in EXAMPLES:
        with example_path.open("r", encoding="utf-8") as handle:
            payload = yaml.safe_load(handle)

        workflow = WorkflowDefinition.model_validate(payload)
        validation = service.validate_workflow(workflow)
        assert validation.valid is True

        result = asyncio.run(
            service.run(
                RuntimeRequest(
                    workflow=workflow,
                    input={"goal": f"Run example {example_path.stem}"},
                    metadata={"source_system": "pytest-example"},
                )
            )
        )

        assert result.run.status == "succeeded"
        assert result.run.workflow_id == workflow.workflow_id
        assert len(result.steps) >= 1
        assert result.final_output["node_id"] == result.steps[-1].node_id
