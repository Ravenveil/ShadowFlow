from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional
from uuid import uuid4

from agentgraph.runtime.checkpoint_store import BaseCheckpointStore
from agentgraph.runtime.contracts import (
    ArtifactRef,
    CheckpointRef,
    CheckpointState,
    NodeDefinition,
    ResumeRequest,
    RunRecord,
    RunResult,
    RuntimeRequest,
    StepRecord,
    WritebackRef,
    WorkflowDefinition,
    WorkflowValidationResult,
    utc_now,
)
from agentgraph.runtime.host_adapter import BaseWritebackAdapter


class RuntimeService:
    def __init__(
        self,
        writeback_adapter: Optional[BaseWritebackAdapter] = None,
        checkpoint_store: Optional[BaseCheckpointStore] = None,
    ) -> None:
        self._runs: Dict[str, RunResult] = {}
        self._requests_by_run_id: Dict[str, RuntimeRequest] = {}
        self._checkpoints: Dict[str, CheckpointRef] = {}
        self._writeback_adapter = writeback_adapter
        self._checkpoint_store = checkpoint_store or getattr(writeback_adapter, "checkpoint_store", None)

    def validate_workflow(self, workflow: WorkflowDefinition) -> WorkflowValidationResult:
        warnings: List[str] = []
        outgoing_nodes = {edge.from_id for edge in workflow.edges}
        final_edges = [edge for edge in workflow.edges if edge.type == "final" or edge.to_id == "END"]
        nodes_by_id = {node.id: node for node in workflow.nodes}
        entrypoint_node = nodes_by_id.get(workflow.entrypoint)

        if (
            workflow.entrypoint not in outgoing_nodes
            and len(workflow.nodes) > 1
            and (entrypoint_node is None or entrypoint_node.type != "control.parallel")
        ):
            warnings.append("entrypoint has no outgoing edges; workflow may stop after first node")
        if not final_edges:
            warnings.append("workflow has no explicit final edge; execution stops when no edge matches")

        return WorkflowValidationResult(
            valid=True,
            workflow_id=workflow.workflow_id,
            warnings=warnings,
        )

    async def run(self, request: RuntimeRequest) -> RunResult:
        self.validate_workflow(request.workflow)
        result = await self._execute(
            request=request,
            start_node_id=request.workflow.entrypoint,
            resumed_from=None,
            restored_state=None,
            initial_output=request.input.copy(),
        )
        self._requests_by_run_id[result.run.run_id] = request
        return result

    async def resume(self, run_id: str, resume_request: ResumeRequest) -> RunResult:
        original_request = self._requests_by_run_id.get(run_id)
        if original_request is None:
            raise ValueError(f"run not found for resume: {run_id}")

        checkpoint = self.get_checkpoint(resume_request.checkpoint_id)
        if checkpoint is None:
            raise ValueError(f"checkpoint not found: {resume_request.checkpoint_id}")
        if checkpoint.run_id != run_id:
            raise ValueError("checkpoint does not belong to run")

        next_node_id = checkpoint.state.next_node_id
        if next_node_id is None:
            raise ValueError("checkpoint has no resumable next node")

        resumed_request = RuntimeRequest.model_validate(
            {
                **original_request.model_dump(),
                "request_id": f"req-{uuid4().hex[:12]}",
                "metadata": {
                    **original_request.metadata,
                    **resume_request.metadata,
                    "resume_from_run_id": run_id,
                    "resume_from_checkpoint_id": checkpoint.checkpoint_id,
                },
            }
        )

        result = await self._execute(
            request=resumed_request,
            start_node_id=next_node_id,
            resumed_from=checkpoint,
            restored_state=checkpoint.state.state,
            initial_output=checkpoint.state.last_output or original_request.input.copy(),
        )
        self._requests_by_run_id[result.run.run_id] = resumed_request
        return result

    def get_checkpoint(self, checkpoint_id: str) -> Optional[CheckpointRef]:
        checkpoint = self._checkpoints.get(checkpoint_id)
        if checkpoint is not None:
            return checkpoint
        if self._checkpoint_store is not None:
            return self._checkpoint_store.get(checkpoint_id)
        return None

    def register_request_context(self, run_id: str, request: RuntimeRequest) -> None:
        self._requests_by_run_id[run_id] = request

    async def _execute(
        self,
        request: RuntimeRequest,
        start_node_id: str,
        resumed_from: Optional[CheckpointRef],
        restored_state: Optional[Dict[str, Any]],
        initial_output: Dict[str, Any],
    ) -> RunResult:
        run_id = f"run-{uuid4().hex[:12]}"
        metadata = {
            "execution_mode": request.execution_mode,
            "memory_scope": request.memory_scope,
            **request.metadata,
        }
        if resumed_from is not None:
            metadata["resumed_from_checkpoint_id"] = resumed_from.checkpoint_id
            metadata["resumed_from_run_id"] = resumed_from.run_id
        run = RunRecord(
            run_id=run_id,
            request_id=request.request_id,
            workflow_id=request.workflow.workflow_id,
            status="running",
            started_at=utc_now(),
            entrypoint=start_node_id,
            metadata=metadata,
        )

        state: Dict[str, Any] = {
            "input": request.input,
            "context": request.context,
            "workflow_id": request.workflow.workflow_id,
            "root_input": request.input.copy(),
            "visited_nodes": [],
            "step_outputs": {},
            "parallel": {},
            "active_parallel": None,
        }
        if restored_state:
            state.update(restored_state.get("shared_state", {}))
            state["step_outputs"] = restored_state.get("step_outputs", {})
            if "root_input" not in state:
                state["root_input"] = request.input.copy()
            if "parallel" not in state:
                state["parallel"] = {}
            if "active_parallel" not in state:
                state["active_parallel"] = None
            if resumed_from is not None:
                state["visited_nodes"] = list(resumed_from.state.visited_nodes)

        steps: List[StepRecord] = []
        artifacts: List[ArtifactRef] = []
        checkpoints: List[CheckpointRef] = []
        trace: List[Dict[str, Any]] = []
        errors: List[Dict[str, Any]] = []

        nodes_by_id = {node.id: node for node in request.workflow.nodes}
        current_node_id: Optional[str] = start_node_id
        max_steps = max(len(request.workflow.nodes) * 3, 1)
        current_output: Dict[str, Any] = initial_output.copy()

        for index in range(1, max_steps + 1):
            if current_node_id is None or current_node_id == "END":
                break

            node = nodes_by_id[current_node_id]
            step_started_at = utc_now()
            run.current_step_id = f"step-{index:03d}"
            state["visited_nodes"].append(current_node_id)

            step_trace = [
                {
                    "event": "reasoning",
                    "node_id": current_node_id,
                    "message": f"Executing node {current_node_id} ({node.type})",
                    "timestamp": step_started_at.isoformat(),
                }
            ]
            step_output = self._execute_node(node, current_output, state, request.context)
            step_artifacts = self._build_artifacts(
                request=request,
                run_id=run_id,
                workflow_id=request.workflow.workflow_id,
                index=index,
                node=node,
                node_id=current_node_id,
                step_output=step_output,
            )
            step_trace.extend(
                {
                    "event": "tool_result",
                    "node_id": current_node_id,
                    "message": f"{key}={value!r}",
                    "timestamp": utc_now().isoformat(),
                }
                for key, value in step_output.items()
                if key not in {"message", "state"}
            )

            step = StepRecord(
                step_id=f"step-{index:03d}",
                run_id=run_id,
                node_id=current_node_id,
                status="succeeded",
                index=index,
                input=current_output,
                output=step_output,
                trace=step_trace,
                artifacts=step_artifacts,
                started_at=step_started_at,
                ended_at=utc_now(),
                metadata={"node_kind": node.kind, "node_type": node.type},
            )
            steps.append(step)
            artifacts.extend(step_artifacts)
            trace.extend(step_trace)

            self._apply_runtime_transitions(node, step_output, state)
            state["step_outputs"][current_node_id] = step_output
            state.update(step_output.get("state", {}))
            current_output = {**state["root_input"], **step_output}
            self._finalize_runtime_transitions(node, state)

            checkpoint = CheckpointRef(
                checkpoint_id=f"ckpt-{uuid4().hex[:10]}",
                run_id=run_id,
                step_id=step.step_id,
                state_ref=f"checkpoint://{run_id}/{step.step_id}",
                state=CheckpointState(
                    current_node_id=current_node_id,
                    next_node_id=None,
                    visited_nodes=list(state["visited_nodes"]),
                    last_output=current_output,
                    state={
                        "step_outputs": state["step_outputs"],
                        "shared_state": {k: v for k, v in state.items() if k not in {"visited_nodes", "step_outputs"}},
                    },
                ),
                writeback=WritebackRef(
                    channel="checkpoint",
                    target=self._resolve_writeback_config(request, "checkpoint").get("target", "host"),
                    mode=self._resolve_writeback_config(request, "checkpoint").get("mode", "reference"),
                    host_action="persist_checkpoint_ref",
                ),
                metadata={
                    "workflow_id": request.workflow.workflow_id,
                    "entrypoint": request.workflow.entrypoint,
                },
            )
            checkpoints.append(checkpoint)

            next_node_id = self._resolve_next_node(request.workflow, node, step_output, state)
            checkpoint.state.next_node_id = next_node_id
            checkpoint.writeback.resume_supported = next_node_id is not None
            checkpoint.writeback.next_node_id = next_node_id
            trace.append(
                {
                    "event": "route_decision",
                    "node_id": current_node_id,
                    "message": f"next={next_node_id or 'END'}",
                    "timestamp": utc_now().isoformat(),
                }
            )
            current_node_id = next_node_id
            self._checkpoints[checkpoint.checkpoint_id] = checkpoint
            if self._checkpoint_store is not None:
                self._checkpoint_store.put(checkpoint)

        else:
            errors.append({"message": "workflow exceeded max_steps guard", "code": "max_steps_exceeded"})

        run.status = "failed" if errors else "succeeded"
        run.ended_at = utc_now()
        run.current_step_id = steps[-1].step_id if steps else None

        result = RunResult(
            run=run,
            steps=steps,
            final_output=current_output,
            trace=trace,
            artifacts=artifacts,
            checkpoints=checkpoints,
            errors=errors,
        )
        if self._writeback_adapter is not None:
            receipts = self._writeback_adapter.persist_run_result(result, checkpoint_store=self._checkpoint_store)
            result.run.metadata["writeback_receipts"] = [
                receipt.model_dump(mode="json") for receipt in receipts
            ]
        self._runs[run_id] = result
        return result

    def get_run(self, run_id: str) -> Optional[RunResult]:
        return self._runs.get(run_id)

    def _execute_node(
        self,
        node: NodeDefinition,
        step_input: Dict[str, Any],
        state: Dict[str, Any],
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        role = node.config.get("role", node.type)
        prompt = node.config.get("prompt", "")
        message = node.config.get(
            "message_template",
            f"[{role}] handled workflow step for '{step_input.get('goal') or step_input.get('message') or node.id}'.",
        )

        output: Dict[str, Any] = {
            "message": message,
            "node_id": node.id,
            "node_type": node.type,
            "handled_by": role,
            "state": {},
        }

        if node.type == "control.parallel":
            branches = [branch for branch in node.config.get("branches", []) if isinstance(branch, str)]
            barrier = node.config.get("barrier")
            output["message"] = node.config.get(
                "message_template",
                f"[{role}] scheduled {len(branches)} parallel branches.",
            )
            output["branch_count"] = len(branches)
            output["branches"] = branches
            output["barrier"] = barrier
            return output

        if node.type == "control.barrier":
            source_parallel = node.config.get("source_parallel") or state.get("active_parallel")
            parallel_state = state.get("parallel", {}).get(source_parallel, {})
            branch_outputs = parallel_state.get("branch_outputs", {})
            completed = list(branch_outputs.keys())
            output["message"] = node.config.get(
                "message_template",
                f"[{role}] joined {len(completed)} parallel branches.",
            )
            output["parallel_group"] = source_parallel
            output["branch_count"] = len(completed)
            output["branch_outputs"] = branch_outputs
            output["branches_completed"] = completed
            output["state"].update(
                {
                    "last_parallel_group": source_parallel,
                    "last_parallel_branch_count": len(completed),
                    "last_parallel_results": {source_parallel: branch_outputs} if source_parallel else {},
                }
            )
            if "artifact" in node.config:
                output["artifact"] = node.config["artifact"]
            return output

        if prompt:
            output["prompt"] = prompt
        if "set_state" in node.config:
            output["state"].update(node.config["set_state"])
        if "emit" in node.config and isinstance(node.config["emit"], dict):
            output.update(node.config["emit"])
        if "copy_input" in node.config:
            keys = node.config["copy_input"]
            if isinstance(keys, list):
                output["copied_input"] = {key: step_input.get(key) for key in keys}
        if "artifact" in node.config:
            output["artifact"] = node.config["artifact"]
        if "decision" in node.config:
            output["decision"] = node.config["decision"]
        if "context_echo" in node.config:
            output["context"] = {key: context.get(key) for key in node.config["context_echo"]}

        return output

    def _build_artifacts(
        self,
        request: RuntimeRequest,
        run_id: str,
        workflow_id: str,
        index: int,
        node: NodeDefinition,
        node_id: str,
        step_output: Dict[str, Any],
    ) -> List[ArtifactRef]:
        artifact_payload = step_output.get("artifact")
        if not artifact_payload:
            return []

        if isinstance(artifact_payload, dict):
            payload = artifact_payload
        else:
            payload = {"content": artifact_payload}

        writeback_config = self._resolve_writeback_config(request, "artifact", payload, node=node)
        target = writeback_config.get("target", "host")
        mode = writeback_config.get("mode", "reference")
        has_inline_content = payload.get("content") is not None
        if mode == "inline" and not has_inline_content:
            raise ValueError(
                f"artifact writeback for node {node_id} requires content when mode=inline"
            )

        return [
            ArtifactRef(
                artifact_id=f"artifact-{uuid4().hex[:10]}",
                kind=payload.get("kind", "json"),
                name=payload.get("name", f"{node_id}-artifact-{index}.json"),
                uri=payload.get("uri", f"memory://{run_id}/{node_id}/{index}"),
                producer_step_id=f"step-{index:03d}",
                writeback=WritebackRef(
                    channel="artifact",
                    target=target,
                    mode=mode,
                    host_action="persist_artifact_ref",
                    content_field="metadata.content" if mode == "inline" and has_inline_content else None,
                ),
                metadata={
                    "content": payload.get("content"),
                    "workflow_id": workflow_id,
                    "producer_node_id": node_id,
                },
            )
        ]

    def _resolve_writeback_config(
        self,
        request: RuntimeRequest,
        channel: str,
        payload: Optional[Dict[str, Any]] = None,
        *,
        node: Optional[NodeDefinition] = None,
    ) -> Dict[str, Any]:
        workflow_defaults = request.workflow.defaults.get("writeback", {})
        request_overrides = request.metadata.get("writeback", {})
        resolved: Dict[str, Any] = {
            **workflow_defaults.get(channel, {}),
            **request_overrides.get(channel, {}),
        }

        if channel == "artifact" and isinstance(payload, dict):
            payload_writeback = payload.get("writeback")
            if isinstance(payload_writeback, dict):
                resolved.update(payload_writeback)
            elif node is not None:
                node_artifact = node.config.get("artifact")
                if isinstance(node_artifact, dict) and isinstance(node_artifact.get("writeback"), dict):
                    resolved.update(node_artifact["writeback"])

        if channel == "checkpoint":
            resolved.setdefault("mode", "reference")

        return resolved

    def _resolve_next_node(
        self,
        workflow: WorkflowDefinition,
        node: NodeDefinition,
        step_output: Dict[str, Any],
        state: Dict[str, Any],
    ) -> Optional[str]:
        current_node_id = node.id
        if node.type == "control.parallel":
            parallel_state = state.get("parallel", {}).get(node.id, {})
            remaining = parallel_state.get("remaining_branches", [])
            if remaining:
                return remaining[0]
            return parallel_state.get("barrier")

        active_parallel_id = state.get("active_parallel")
        if active_parallel_id:
            parallel_state = state.get("parallel", {}).get(active_parallel_id, {})
            branches = set(parallel_state.get("branches", []))
            if current_node_id in branches:
                remaining = parallel_state.get("remaining_branches", [])
                if remaining:
                    return remaining[0]
                return parallel_state.get("barrier")

        candidates = [edge for edge in workflow.edges if edge.from_id == current_node_id]
        for edge in candidates:
            if self._match_condition(edge.condition, step_output, state):
                return None if edge.to_id == "END" else edge.to_id
        return None

    def _apply_runtime_transitions(
        self,
        node: NodeDefinition,
        step_output: Dict[str, Any],
        state: Dict[str, Any],
    ) -> None:
        if node.type == "control.parallel":
            branches = list(step_output.get("branches", []))
            state["parallel"][node.id] = {
                "branches": branches,
                "remaining_branches": branches.copy(),
                "branch_outputs": {},
                "barrier": step_output.get("barrier"),
            }
            state["active_parallel"] = node.id
            return

        active_parallel_id = state.get("active_parallel")
        if not active_parallel_id:
            return

        parallel_state = state.get("parallel", {}).get(active_parallel_id)
        if not parallel_state:
            return

        if node.id in parallel_state.get("branches", []):
            parallel_state.setdefault("branch_outputs", {})[node.id] = step_output
            parallel_state["remaining_branches"] = [
                branch_id for branch_id in parallel_state.get("remaining_branches", []) if branch_id != node.id
            ]

    def _finalize_runtime_transitions(self, node: NodeDefinition, state: Dict[str, Any]) -> None:
        if node.type != "control.barrier":
            return

        source_parallel = node.config.get("source_parallel") or state.get("active_parallel")
        if source_parallel:
            state["active_parallel"] = None

    def _match_condition(
        self,
        condition: Optional[str],
        step_output: Dict[str, Any],
        state: Dict[str, Any],
    ) -> bool:
        if not condition:
            return True

        normalized = condition.strip()
        if "&&" in normalized or " and " in normalized:
            parts = re.split(r"\s*&&\s*|\s+and\s+", normalized)
            return all(self._match_condition(part, step_output, state) for part in parts)

        if "." in normalized:
            root, expr = normalized.split(".", 1)
            root = root.strip()
            target = step_output if root == "result" else state if root == "state" else None
            if target is None:
                return False
            return self._eval_expr(expr.strip(), target)

        return self._eval_expr(normalized, step_output)

    def _eval_expr(self, expr: str, source: Dict[str, Any]) -> bool:
        pattern = r"([\w_]+)\s*(>=|<=|>|<|==|!=|contains|includes)\s*['\"]?(.+?)['\"]?$"
        match = re.match(pattern, expr, re.IGNORECASE)
        if not match:
            return False

        key, op, raw_value = match.groups()
        actual = source.get(key)
        if actual is None:
            return False

        expected: Any = raw_value.strip()
        try:
            expected = json.loads(expected)
        except json.JSONDecodeError:
            pass

        if isinstance(actual, bool) and isinstance(expected, str):
            expected = expected.lower() in {"true", "1", "yes"}
        elif isinstance(actual, (int, float)) and not isinstance(expected, (int, float)):
            try:
                expected = float(expected)
            except (TypeError, ValueError):
                return False

        if op == ">":
            return actual > expected
        if op == ">=":
            return actual >= expected
        if op == "<":
            return actual < expected
        if op == "<=":
            return actual <= expected
        if op == "==":
            return actual == expected
        if op == "!=":
            return actual != expected
        if op in {"contains", "includes"}:
            return str(expected).lower() in str(actual).lower()
        return False
