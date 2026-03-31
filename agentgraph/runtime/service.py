from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional
from uuid import uuid4

from agentgraph.runtime.checkpoint_store import BaseCheckpointStore
from agentgraph.runtime.contracts import (
    ArtifactRef,
    ChatMessage,
    ChatMessageRequest,
    ChatSession,
    ChatSessionCreateRequest,
    ChatSessionRecord,
    ChatTurnResult,
    CheckpointRef,
    CheckpointState,
    NodeDefinition,
    ResumeRequest,
    RunRecord,
    RunGraph,
    RunGraphNode,
    RunResult,
    RunSummary,
    RuntimeRequest,
    StepRecord,
    WritebackRef,
    WorkflowGraph,
    WorkflowGraphEdge,
    WorkflowGraphNode,
    WorkflowDefinition,
    WorkflowValidationResult,
    utc_now,
)
from agentgraph.runtime.executors import ExecutorRegistry
from agentgraph.runtime.host_adapter import BaseWritebackAdapter


class RuntimeService:
    def __init__(
        self,
        writeback_adapter: Optional[BaseWritebackAdapter] = None,
        checkpoint_store: Optional[BaseCheckpointStore] = None,
        executor_registry: Optional[ExecutorRegistry] = None,
        run_store: Optional[Any] = None,
        request_context_store: Optional[Any] = None,
        chat_session_store: Optional[Any] = None,
    ) -> None:
        self._runs: Dict[str, RunResult] = {}
        self._requests_by_run_id: Dict[str, RuntimeRequest] = {}
        self._checkpoints: Dict[str, CheckpointRef] = {}
        self._chat_sessions: Dict[str, ChatSession] = {}
        self._writeback_adapter = writeback_adapter
        self._checkpoint_store = checkpoint_store or getattr(writeback_adapter, "checkpoint_store", None)
        self._run_store = run_store or getattr(writeback_adapter, "run_store", None)
        self._request_context_store = request_context_store
        self._chat_session_store = chat_session_store
        self._executor_registry = executor_registry or ExecutorRegistry()

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
        if self._request_context_store is not None:
            self._request_context_store.put(result.run.run_id, request)
        if self._run_store is not None:
            self._run_store.put(result)
        return result

    async def resume(self, run_id: str, resume_request: ResumeRequest) -> RunResult:
        original_request = self._requests_by_run_id.get(run_id)
        if original_request is None and self._request_context_store is not None:
            original_request = self._request_context_store.get(run_id)
            if original_request is not None:
                self._requests_by_run_id[run_id] = original_request
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
        if self._request_context_store is not None:
            self._request_context_store.put(result.run.run_id, resumed_request)
        if self._run_store is not None:
            self._run_store.put(result)
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
        if self._request_context_store is not None:
            self._request_context_store.put(run_id, request)

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
            step_output = await self._execute_node(node, current_output, state, request.context)
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
        result = self._runs.get(run_id)
        if result is not None:
            return result
        if self._run_store is not None:
            return self._run_store.get(run_id)
        return None

    def list_runs(self) -> List[RunSummary]:
        runs = [
            RunSummary(
                run_id=result.run.run_id,
                request_id=result.run.request_id,
                workflow_id=result.run.workflow_id,
                status=result.run.status,
                started_at=result.run.started_at,
                ended_at=result.run.ended_at,
                current_step_id=result.run.current_step_id,
                metadata=result.run.metadata,
            )
            for result in self._runs.values()
        ]
        if self._run_store is not None:
            existing = {item.run_id for item in runs}
            for item in self._run_store.list_runs():
                if item.run_id not in existing:
                    runs.append(item)
        return sorted(runs, key=lambda item: item.started_at, reverse=True)

    def export_workflow_graph(self, workflow: WorkflowDefinition) -> WorkflowGraph:
        return WorkflowGraph(
            workflow_id=workflow.workflow_id,
            name=workflow.name,
            entrypoint=workflow.entrypoint,
            nodes=[
                WorkflowGraphNode(
                    id=node.id,
                    label=node.config.get("role", node.id),
                    kind=node.kind,
                    type=node.type,
                    entrypoint=node.id == workflow.entrypoint,
                    metadata={
                        "role": node.config.get("role"),
                        "outputs": node.outputs,
                        "inputs": node.inputs,
                    },
                )
                for node in workflow.nodes
            ],
            edges=[
                WorkflowGraphEdge(
                    from_id=edge.from_id,
                    to_id=edge.to_id,
                    type=edge.type,
                    condition=edge.condition,
                    metadata=edge.metadata,
                )
                for edge in workflow.edges
            ],
            metadata=workflow.metadata,
        )

    def export_run_graph(self, run_id: str) -> Optional[RunGraph]:
        result = self.get_run(run_id)
        request = self._requests_by_run_id.get(run_id)
        if request is None and self._request_context_store is not None:
            request = self._request_context_store.get(run_id)
        if result is None or request is None:
            return None

        steps_by_node_id = {step.node_id: step for step in result.steps}
        workflow_graph = self.export_workflow_graph(request.workflow)
        nodes: List[RunGraphNode] = []
        for node in workflow_graph.nodes:
            step = steps_by_node_id.get(node.id)
            nodes.append(
                RunGraphNode(
                    id=node.id,
                    label=node.label,
                    kind=node.kind,
                    type=node.type,
                    status=step.status if step is not None else "not_started",
                    step_id=step.step_id if step is not None else None,
                    index=step.index if step is not None else None,
                    entrypoint=node.entrypoint,
                    metadata=node.metadata,
                )
            )

        return RunGraph(
            run_id=result.run.run_id,
            workflow_id=result.run.workflow_id,
            status=result.run.status,
            entrypoint=result.run.entrypoint,
            nodes=nodes,
            edges=workflow_graph.edges,
            metadata=result.run.metadata,
        )

    def create_chat_session(self, request: ChatSessionCreateRequest) -> ChatSession:
        session_id = f"session-{uuid4().hex[:12]}"
        record = ChatSessionRecord(
            session_id=session_id,
            title=request.title,
            executor=request.executor,
            metadata=request.metadata,
        )
        messages: List[ChatMessage] = []
        if isinstance(request.system_prompt, str) and request.system_prompt.strip():
            messages.append(
                ChatMessage(
                    role="system",
                    content=request.system_prompt.strip(),
                )
            )
        session = ChatSession(session=record, messages=messages)
        self._chat_sessions[session_id] = session
        if self._chat_session_store is not None:
            self._chat_session_store.put(session)
        return session.model_copy(deep=True)

    def list_chat_sessions(self) -> List[ChatSessionRecord]:
        sessions = [item.session for item in self._chat_sessions.values()]
        if self._chat_session_store is not None:
            existing = {item.session_id for item in sessions}
            for item in self._chat_session_store.list_sessions():
                if item.session.session_id not in existing:
                    sessions.append(item.session)
        return sorted(sessions, key=lambda item: item.updated_at, reverse=True)

    def get_chat_session(self, session_id: str) -> Optional[ChatSession]:
        session = self._chat_sessions.get(session_id)
        if session is None and self._chat_session_store is not None:
            session = self._chat_session_store.get(session_id)
            if session is not None:
                self._chat_sessions[session_id] = session
        if session is None:
            return None
        return session.model_copy(deep=True)

    async def send_chat_message(self, session_id: str, request: ChatMessageRequest) -> ChatTurnResult:
        session = self._chat_sessions.get(session_id)
        if session is None:
            raise ValueError(f"chat session not found: {session_id}")

        user_message = ChatMessage(role="user", content=request.content, metadata=request.metadata)
        session.messages.append(user_message)
        prompt = self._build_chat_prompt(session.messages)
        payload = {
            "prompt": prompt,
            "step_input": {
                "message": request.content,
                "session_id": session_id,
                "history": [
                    {"role": item.role, "content": item.content}
                    for item in session.messages
                ],
            },
            "context": request.context,
            "state": {"chat_session_id": session_id},
            "node": {"id": "chat", "type": "chat.turn", "role": "assistant"},
        }
        executor_output = await self._executor_registry.execute(session.session.executor, payload)
        response_text = str(
            executor_output.get("response_text")
            or executor_output.get("message")
            or executor_output.get("result")
            or ""
        ).strip()
        assistant_message = ChatMessage(role="assistant", content=response_text, metadata={"executor": executor_output.get("executor", {})})
        session.messages.append(assistant_message)
        session.session.updated_at = utc_now()
        if self._chat_session_store is not None:
            self._chat_session_store.put(session)
        return ChatTurnResult(
            session=session.session.model_copy(deep=True),
            user_message=user_message,
            assistant_message=assistant_message,
            response_text=response_text,
            raw_output=executor_output,
            trace=[
                {
                    "event": "chat_turn",
                    "session_id": session_id,
                    "message": f"user={request.content!r}",
                    "timestamp": utc_now().isoformat(),
                },
                {
                    "event": "chat_response",
                    "session_id": session_id,
                    "message": response_text,
                    "timestamp": utc_now().isoformat(),
                },
            ],
        )

    async def _execute_node(
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

        executor_config = node.config.get("executor")
        if isinstance(executor_config, dict):
            output = await self._execute_executor_node(
                node=node,
                executor_config=executor_config,
                step_input=step_input,
                state=state,
                context=context,
                base_output=output,
                prompt=prompt,
            )
            self._apply_node_config_output(
                node=node,
                output=output,
                step_input=step_input,
                context=context,
                prompt=prompt,
            )
            return output

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

        self._apply_node_config_output(
            node=node,
            output=output,
            step_input=step_input,
            context=context,
            prompt=prompt,
        )
        return output

    async def _execute_executor_node(
        self,
        node: NodeDefinition,
        executor_config: Dict[str, Any],
        step_input: Dict[str, Any],
        state: Dict[str, Any],
        context: Dict[str, Any],
        base_output: Dict[str, Any],
        prompt: str,
    ) -> Dict[str, Any]:
        payload = {
            "prompt": prompt,
            "step_input": step_input,
            "state": state,
            "context": context,
            "node": {
                "id": node.id,
                "type": node.type,
                "role": base_output["handled_by"],
            },
        }
        result = json.loads(
            json.dumps(
                await self._executor_registry.execute(executor_config, payload),
                ensure_ascii=False,
                default=str,
            )
        )
        output = dict(base_output)
        if isinstance(result, dict):
            output.update(result)
        else:
            output["result"] = result
        return output

    def _apply_node_config_output(
        self,
        *,
        node: NodeDefinition,
        output: Dict[str, Any],
        step_input: Dict[str, Any],
        context: Dict[str, Any],
        prompt: str,
    ) -> None:
        if prompt:
            output.setdefault("prompt", prompt)
        if "set_state" in node.config and isinstance(node.config["set_state"], dict):
            output["state"].update(node.config["set_state"])
        if "emit" in node.config and isinstance(node.config["emit"], dict):
            for key, value in node.config["emit"].items():
                output.setdefault(key, value)
        if "copy_input" in node.config:
            keys = node.config["copy_input"]
            if isinstance(keys, list):
                output.setdefault("copied_input", {key: step_input.get(key) for key in keys})
        if "artifact" in node.config and "artifact" not in output:
            output["artifact"] = node.config["artifact"]
        if "artifacts" in node.config and "artifacts" not in output:
            output["artifacts"] = node.config["artifacts"]
        if "decision" in node.config and "decision" not in output:
            output["decision"] = node.config["decision"]
        if "context_echo" in node.config and "context" not in output:
            output["context"] = {key: context.get(key) for key in node.config["context_echo"]}

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
        artifact_payloads: List[Any] = []
        if "artifact" in step_output:
            artifact_payloads.append(step_output["artifact"])
        if isinstance(step_output.get("artifacts"), list):
            artifact_payloads.extend(step_output["artifacts"])
        if not artifact_payloads:
            return []
        artifact_refs: List[ArtifactRef] = []
        for artifact_offset, artifact_payload in enumerate(artifact_payloads, start=1):
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
            artifact_refs.append(
                ArtifactRef(
                    artifact_id=f"artifact-{uuid4().hex[:10]}",
                    kind=payload.get("kind", "json"),
                    name=payload.get("name", f"{node_id}-artifact-{index}-{artifact_offset}.json"),
                    uri=payload.get("uri", f"memory://{run_id}/{node_id}/{index}/{artifact_offset}"),
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
            )

        return artifact_refs

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

    def _build_chat_prompt(self, messages: List[ChatMessage]) -> str:
        segments: List[str] = []
        for message in messages:
            if not message.content.strip():
                continue
            segments.append(f"{message.role.upper()}:\n{message.content.strip()}")
        segments.append("ASSISTANT:")
        return "\n\n".join(segments)

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
