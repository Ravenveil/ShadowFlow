from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional
from uuid import uuid4

from shadowflow.runtime.checkpoint_store import BaseCheckpointStore
from shadowflow.runtime.contracts import (
    ActivationCandidate,
    ActivationRecord,
    ActivationTrainingDataset,
    ActivationTrainingSample,
    ArtifactLineageProjection,
    ArtifactRef,
    ChatMessage,
    ChatMessageRequest,
    ChatSession,
    ChatSessionCreateRequest,
    ChatSessionRecord,
    ChatTurnResult,
    ChildRunRequest,
    CheckpointLineageProjection,
    CheckpointRef,
    CheckpointState,
    ExecutionFeedbackRecord,
    HandoffRef,
    MemoryRelationProjection,
    MemoryEvent,
    NodeDefinition,
    ProjectionEdge,
    ProjectionNode,
    ProjectionNodeTimestamps,
    ProjectionScope,
    ResumeRequest,
    RunRecord,
    RunGraph,
    RunGraphNode,
    RunResult,
    RunSummary,
    RuntimeRequest,
    TaskTreeProjection,
    StepRecord,
    TaskRecord,
    WritebackRef,
    WorkflowGraph,
    WorkflowGraphEdge,
    WorkflowGraphNode,
    WorkflowDefinition,
    WorkflowValidationResult,
    utc_now,
)
from shadowflow.runtime.executors import ExecutorRegistry
from shadowflow.runtime.host_adapter import BaseWritebackAdapter


class RuntimeService:
    _condition_splitter = re.compile(r"\s*&&\s*|\s+and\s+")
    _condition_pattern = re.compile(
        r"([\w_]+)\s*(>=|<=|>|<|==|!=|contains|includes)\s*['\"]?(.+?)['\"]?$",
        re.IGNORECASE,
    )

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
        self._workflow_index_cache: Dict[int, Any] = {}
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

    def _get_request_context(self, run_id: str) -> Optional[RuntimeRequest]:
        request = self._requests_by_run_id.get(run_id)
        if request is None and self._request_context_store is not None:
            request = self._request_context_store.get(run_id)
            if request is not None:
                self._requests_by_run_id[run_id] = request
        return request

    def register_request_context(self, run_id: str, request: RuntimeRequest) -> None:
        self._requests_by_run_id[run_id] = request
        if self._request_context_store is not None:
            self._request_context_store.put(run_id, request)

    async def spawn_child_run(
        self,
        parent_run_id: str,
        request: ChildRunRequest,
        *,
        parent_request_override: Optional[RuntimeRequest] = None,
        parent_task_override: Optional[TaskRecord] = None,
        delegated_from_node_id: Optional[str] = None,
    ) -> RunResult:
        parent_result = self.get_run(parent_run_id)
        parent_request = parent_request_override or self._get_request_context(parent_run_id)
        if parent_result is None and parent_request is None:
            raise ValueError(f"parent run not found: {parent_run_id}")
        if parent_request is None:
            raise ValueError(f"request context not found for parent run: {parent_run_id}")

        parent_task_id = request.parent_task_id or (
            parent_task_override.task_id if parent_task_override is not None else (
                parent_result.run.task_id if parent_result is not None else None
            )
        )
        parent_task = parent_task_override
        if parent_task is None and parent_result is not None:
            parent_task = next((item for item in parent_result.tasks if item.task_id == parent_task_id), None)
        root_run_id = (
            parent_result.run.root_run_id if parent_result is not None and parent_result.run.root_run_id is not None
            else parent_request.metadata.get("root_run_id") or parent_run_id
        )
        root_task_id = (
            parent_task.root_task_id
            if parent_task is not None
            else str(parent_task_id or f"task-{uuid4().hex[:12]}")
        )

        base_context = parent_request.context if request.context_mode == "inherit" else {}
        child_context = {**base_context, **request.context}
        resolved_parent_node_id = delegated_from_node_id
        if resolved_parent_node_id is None and parent_result is not None and request.parent_step_id is not None:
            parent_step = next((item for item in parent_result.steps if item.step_id == request.parent_step_id), None)
            if parent_step is not None:
                resolved_parent_node_id = parent_step.node_id

        runtime_request = RuntimeRequest(
            workflow=request.workflow,
            input=request.input,
            context=child_context,
            memory_scope=request.memory_scope,
            execution_mode=request.execution_mode,
            idempotency_key=request.idempotency_key,
            metadata={
                **request.metadata,
                "delegated_run": True,
                "delegation_mode": request.context_mode,
                "parent_run_id": parent_run_id,
                "root_run_id": root_run_id,
                "parent_task_id": parent_task_id,
                "root_task_id": root_task_id,
                "parent_step_id": request.parent_step_id,
                "delegated_from_node_id": resolved_parent_node_id,
                "handoff_goal": request.handoff_goal,
                "task_title": request.task_title or request.metadata.get("task_title") or request.workflow.name,
            },
        )
        return await self.run(runtime_request)

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
            task_id=None,
            parent_run_id=request.metadata.get("parent_run_id"),
            root_run_id=request.metadata.get("root_run_id"),
            status="running",
            started_at=utc_now(),
            entrypoint=start_node_id,
            metadata=metadata,
        )
        task_id = f"task-{uuid4().hex[:12]}"
        root_task_id = str(request.metadata.get("root_task_id") or task_id)
        task = TaskRecord(
            task_id=task_id,
            run_id=run_id,
            root_task_id=root_task_id,
            parent_task_id=request.metadata.get("parent_task_id"),
            title=request.metadata.get("task_title") or request.workflow.name,
            focus=str(request.input.get("goal") or request.input.get("message") or request.workflow.name),
            status="running",
            started_at=run.started_at,
            metadata={
                "workflow_id": request.workflow.workflow_id,
                "entrypoint": start_node_id,
                "memory_scope": request.memory_scope,
                "parent_run_id": request.metadata.get("parent_run_id"),
                "root_run_id": request.metadata.get("root_run_id"),
                "parent_task_id": request.metadata.get("parent_task_id"),
                "root_task_id": root_task_id,
                "parent_step_id": request.metadata.get("parent_step_id"),
                "delegated_run": bool(request.metadata.get("delegated_run")),
                "delegation_mode": request.metadata.get("delegation_mode"),
                "delegated_from_node_id": request.metadata.get("delegated_from_node_id"),
                "handoff_goal": request.metadata.get("handoff_goal"),
            },
        )
        run.task_id = task.task_id
        if run.root_run_id is None:
            run.root_run_id = run.run_id

        tasks: List[TaskRecord] = [task]
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
        handoffs: List[HandoffRef] = []
        activation_candidates: List[ActivationCandidate] = []
        activations: List[ActivationRecord] = []
        feedback_records: List[ExecutionFeedbackRecord] = []
        memory_events: List[MemoryEvent] = [
            MemoryEvent(
                event_id=f"mem-{uuid4().hex[:10]}",
                run_id=run_id,
                task_id=task.task_id,
                category="task",
                summary=f"Task started: {task.title or request.workflow.name}",
                payload={
                    "focus": task.focus,
                    "workflow_id": request.workflow.workflow_id,
                    "entrypoint": start_node_id,
                },
                metadata={"source": "runtime_service"},
            )
        ]
        trace: List[Dict[str, Any]] = []
        errors: List[Dict[str, Any]] = []

        workflow_index = self._get_workflow_index(request.workflow)
        nodes_by_id = workflow_index["nodes_by_id"]
        edges_by_from = workflow_index["edges_by_from"]
        handoff_goals = workflow_index["handoff_goals"]
        checkpoint_writeback = self._resolve_writeback_config(request, "checkpoint")
        current_node_id: Optional[str] = start_node_id
        max_steps = max(len(request.workflow.nodes) * 3, 1)
        current_output: Dict[str, Any] = initial_output.copy()

        for index in range(1, max_steps + 1):
            if current_node_id is None or current_node_id == "END":
                break

            node = nodes_by_id[current_node_id]
            step_started_at = utc_now()
            step_id = f"step-{index:03d}"
            run.current_step_id = step_id
            state["visited_nodes"].append(current_node_id)
            candidates = self._build_activation_candidates(
                request=request,
                run_id=run_id,
                task=task,
                step_id=step_id,
                node=node,
                step_input=current_output,
                state=state,
            )
            activation_candidates.extend(candidates)
            activation = self._build_activation_record(
                request=request,
                run_id=run_id,
                task=task,
                step_id=step_id,
                node=node,
                candidates=candidates,
            )
            activations.append(activation)

            step_trace = [
                {
                    "event": "reasoning",
                    "node_id": current_node_id,
                    "message": f"Executing node {current_node_id} ({node.type})",
                    "timestamp": step_started_at.isoformat(),
                }
            ]
            step_trace.extend(
                {
                    "event": "activation_candidate",
                    "node_id": current_node_id,
                    "message": (
                        f"candidate {candidate.candidate_ref} "
                        f"type={candidate.candidate_type} "
                        f"score={candidate.score:.2f} "
                        f"selected={candidate.selected}"
                    ),
                    "timestamp": candidate.created_at.isoformat(),
                }
                for candidate in candidates
            )
            step_trace.append(
                {
                    "event": "activation",
                    "node_id": current_node_id,
                    "message": f"activation mode={activation.mode} decision={activation.decision}",
                    "timestamp": activation.created_at.isoformat(),
                }
            )
            memory_events.append(
                MemoryEvent(
                    event_id=f"mem-{uuid4().hex[:10]}",
                    run_id=run_id,
                    task_id=task.task_id,
                    step_id=step_id,
                    category="activation",
                    summary=f"Activation resolved for {current_node_id}",
                    payload={
                        "activation_id": activation.activation_id,
                        "node_id": current_node_id,
                        "mode": activation.mode,
                        "decision": activation.decision,
                        "tags": activation.tags,
                        "candidate_ids": [candidate.candidate_id for candidate in candidates],
                        "selected_candidate_ids": [
                            candidate.candidate_id for candidate in candidates if candidate.selected
                        ],
                        "delegate_candidates": activation.delegate_candidates,
                        "feedback_channels": activation.feedback_channels,
                    },
                    metadata={"source": "activation"},
                )
            )
            if activation.decision != "activated":
                step_trace.append(
                    {
                        "event": "activation_skip",
                        "node_id": current_node_id,
                        "message": f"node skipped due to activation decision={activation.decision}",
                        "timestamp": utc_now().isoformat(),
                    }
                )
                step_output = self._build_suppressed_step_output(node=node, activation=activation)
            elif self._is_delegated_node(node):
                step_output = await self._execute_delegated_node(
                    request=request,
                    run_id=run_id,
                    task=task,
                    step_id=step_id,
                    node=node,
                    step_input=current_output,
                    state=state,
                )
            else:
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
                step_id=step_id,
                run_id=run_id,
                node_id=current_node_id,
                status="succeeded" if activation.decision == "activated" else "skipped",
                index=index,
                input=current_output,
                output=step_output,
                trace=step_trace,
                artifacts=step_artifacts,
                started_at=step_started_at,
                ended_at=utc_now(),
                metadata={
                    "node_kind": node.kind,
                    "node_type": node.type,
                    "task_id": task.task_id,
                    "activation_candidate_ids": [candidate.candidate_id for candidate in candidates],
                    "selected_candidate_ids": [candidate.candidate_id for candidate in candidates if candidate.selected],
                    "activation_id": activation.activation_id,
                    "activation_mode": activation.mode,
                    "activation_decision": activation.decision,
                    "activation_tags": activation.tags,
                    "delegate_candidates": activation.delegate_candidates,
                    "feedback_channels": activation.feedback_channels,
                    "feedback_ids": [],
                },
            )
            steps.append(step)
            artifacts.extend(step_artifacts)
            trace.extend(step_trace)
            memory_events.append(
                MemoryEvent(
                    event_id=f"mem-{uuid4().hex[:10]}",
                    run_id=run_id,
                    task_id=task.task_id,
                    step_id=step.step_id,
                    category="step_result",
                    summary=str(step_output.get("message") or f"{current_node_id} completed"),
                    payload={
                        "node_id": current_node_id,
                        "node_type": node.type,
                        "status": step.status,
                        "handled_by": step_output.get("handled_by"),
                    },
                    metadata={"source": "step"},
                )
            )
            for artifact in step_artifacts:
                memory_events.append(
                    MemoryEvent(
                        event_id=f"mem-{uuid4().hex[:10]}",
                        run_id=run_id,
                        task_id=task.task_id,
                        step_id=step.step_id,
                        category="artifact",
                        summary=f"Artifact produced: {artifact.name}",
                        payload={
                            "artifact_id": artifact.artifact_id,
                            "artifact_kind": artifact.kind,
                            "target": artifact.writeback.target,
                            "mode": artifact.writeback.mode,
                        },
                        metadata={"source": "artifact"},
                    )
                )
            if step_artifacts:
                state.setdefault("artifacts_by_step", {})[step.step_id] = [item.artifact_id for item in step_artifacts]

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
                    state=self._build_checkpoint_payload(state),
                ),
                writeback=WritebackRef(
                    channel="checkpoint",
                    target=checkpoint_writeback.get("target", "host"),
                    mode=checkpoint_writeback.get("mode", "reference"),
                    host_action="persist_checkpoint_ref",
                ),
                metadata={
                    "workflow_id": request.workflow.workflow_id,
                    "entrypoint": request.workflow.entrypoint,
                },
            )
            checkpoints.append(checkpoint)
            memory_events.append(
                MemoryEvent(
                    event_id=f"mem-{uuid4().hex[:10]}",
                    run_id=run_id,
                    task_id=task.task_id,
                    step_id=step.step_id,
                    category="checkpoint",
                    summary=f"Checkpoint saved after {current_node_id}",
                    payload={
                        "checkpoint_id": checkpoint.checkpoint_id,
                        "next_node_id": checkpoint.state.next_node_id,
                    },
                    metadata={"source": "checkpoint"},
                )
            )

            next_node_id = self._resolve_next_node(node, step_output, state, edges_by_from)
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
            if next_node_id is not None and step.status == "succeeded":
                artifact_ids = [item.artifact_id for item in step_artifacts]
                handoff_goal = handoff_goals.get(current_node_id)
                handoff = HandoffRef(
                    handoff_id=f"handoff-{uuid4().hex[:10]}",
                    run_id=run_id,
                    from_step_id=step.step_id,
                    from_node_id=current_node_id,
                    to_node_id=next_node_id,
                    goal=handoff_goal,
                    artifact_ids=artifact_ids,
                    metadata={"workflow_id": request.workflow.workflow_id},
                )
                handoffs.append(handoff)
                memory_events.append(
                    MemoryEvent(
                        event_id=f"mem-{uuid4().hex[:10]}",
                        run_id=run_id,
                        task_id=task.task_id,
                        step_id=step.step_id,
                        category="handoff",
                        summary=f"Handoff from {current_node_id} to {next_node_id}",
                        payload={
                            "handoff_id": handoff.handoff_id,
                            "to_node_id": next_node_id,
                            "artifact_ids": artifact_ids,
                            "goal": handoff_goal,
                        },
                        metadata={"source": "handoff"},
                    )
                )
            feedback_record = self._build_step_feedback_record(
                run_id=run_id,
                task=task,
                step=step,
                activation=activation,
                candidates=candidates,
                checkpoint=checkpoint,
                next_node_id=next_node_id,
                artifact_ids=[item.artifact_id for item in step_artifacts],
                handoff=handoffs[-1] if handoffs and handoffs[-1].from_step_id == step.step_id else None,
            )
            feedback_records.append(feedback_record)
            step.metadata.setdefault("feedback_ids", []).append(feedback_record.feedback_id)
            memory_events.append(
                MemoryEvent(
                    event_id=f"mem-{uuid4().hex[:10]}",
                    run_id=run_id,
                    task_id=task.task_id,
                    step_id=step.step_id,
                    category="feedback_signal",
                    summary=feedback_record.summary,
                    payload={
                        "feedback_id": feedback_record.feedback_id,
                        "source_type": feedback_record.source_type,
                        "status": feedback_record.status,
                        "signals": feedback_record.signals,
                        "reward_hints": feedback_record.reward_hints,
                    },
                    metadata={"source": "feedback"},
                )
            )
            trace.append(
                {
                    "event": "feedback_signal",
                    "node_id": current_node_id,
                    "message": feedback_record.summary,
                    "timestamp": feedback_record.created_at.isoformat(),
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
        task.status = "failed" if errors else "succeeded"
        task.ended_at = run.ended_at
        run_feedback = self._build_run_feedback_record(
            run=run,
            task=task,
            steps=steps,
            artifacts=artifacts,
            checkpoints=checkpoints,
            handoffs=handoffs,
            activation_candidates=activation_candidates,
            activations=activations,
            feedback_records=feedback_records,
        )
        feedback_records.append(run_feedback)
        memory_events.append(
            MemoryEvent(
                event_id=f"mem-{uuid4().hex[:10]}",
                run_id=run_id,
                task_id=task.task_id,
                category="feedback_signal",
                summary=run_feedback.summary,
                payload={
                    "feedback_id": run_feedback.feedback_id,
                    "source_type": run_feedback.source_type,
                    "status": run_feedback.status,
                    "signals": run_feedback.signals,
                    "reward_hints": run_feedback.reward_hints,
                },
                metadata={"source": "feedback"},
            )
        )
        memory_events.append(
            MemoryEvent(
                event_id=f"mem-{uuid4().hex[:10]}",
                run_id=run_id,
                task_id=task.task_id,
                category="run_summary",
                summary=f"Run finished with status {run.status}",
                payload={
                    "run_id": run_id,
                    "status": run.status,
                    "step_count": len(steps),
                    "artifact_count": len(artifacts),
                    "checkpoint_count": len(checkpoints),
                    "handoff_count": len(handoffs),
                },
                metadata={"source": "runtime_service"},
            )
        )

        result = RunResult(
            run=run,
            tasks=tasks,
            steps=steps,
            final_output=current_output,
            trace=trace,
            artifacts=artifacts,
            checkpoints=checkpoints,
            handoffs=handoffs,
            activation_candidates=activation_candidates,
            activations=activations,
            feedback=feedback_records,
            memory_events=memory_events,
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

    def _resolve_projection_run(
        self,
        run_id: Optional[str] = None,
        artifact_id: Optional[str] = None,
    ) -> Optional[RunResult]:
        if run_id is not None:
            return self.get_run(run_id)

        if artifact_id is None:
            return None

        for summary in self.list_runs():
            candidate = self.get_run(summary.run_id)
            if candidate is None:
                continue
            if any(artifact.artifact_id == artifact_id for artifact in candidate.artifacts):
                return candidate
        return None

    def _collect_run_lineage(self, run_id: str) -> tuple[str, List[RunResult]]:
        result = self.get_run(run_id)
        if result is None:
            raise ValueError(f"run not found: {run_id}")

        root_run_id = result.run.root_run_id or result.run.run_id
        lineage: List[RunResult] = []
        seen: set[str] = set()
        for summary in self.list_runs():
            candidate = self.get_run(summary.run_id)
            if candidate is None:
                continue
            candidate_root = candidate.run.root_run_id or candidate.run.run_id
            if candidate_root != root_run_id:
                continue
            if candidate.run.run_id in seen:
                continue
            seen.add(candidate.run.run_id)
            lineage.append(candidate)

        lineage.sort(key=lambda item: item.run.started_at)
        return root_run_id, lineage

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
            scope=ProjectionScope(workflow_id=workflow.workflow_id),
            summary={
                "node_count": len(workflow.nodes),
                "edge_count": len(workflow.edges),
            },
            nodes=[
                WorkflowGraphNode(
                    id=node.id,
                    label=node.config.get("role", node.id),
                    kind=node.kind,
                    type=node.type,
                    entrypoint=node.id == workflow.entrypoint,
                    refs={"workflow_id": workflow.workflow_id, "node_id": node.id},
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
                    edge_type="conditional_flow" if edge.type == "conditional" else "control_flow",
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
        candidates_by_step_id: Dict[str, List[ActivationCandidate]] = {}
        for candidate in result.activation_candidates:
            if candidate.step_id is None:
                continue
            candidates_by_step_id.setdefault(candidate.step_id, []).append(candidate)
        activations_by_step_id = {activation.step_id: activation for activation in result.activations if activation.step_id}
        feedback_by_step_id: Dict[str, List[ExecutionFeedbackRecord]] = {}
        for record in result.feedback:
            if record.step_id is None:
                continue
            feedback_by_step_id.setdefault(record.step_id, []).append(record)
        workflow_graph = self.export_workflow_graph(request.workflow)
        nodes: List[RunGraphNode] = []
        for node in workflow_graph.nodes:
            step = steps_by_node_id.get(node.id)
            candidates = candidates_by_step_id.get(step.step_id, []) if step is not None else []
            activation = activations_by_step_id.get(step.step_id) if step is not None else None
            feedback_records = feedback_by_step_id.get(step.step_id, []) if step is not None else []
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
                    refs={
                        "workflow_id": result.run.workflow_id,
                        "run_id": result.run.run_id,
                        "node_id": node.id,
                        "step_id": step.step_id if step is not None else None,
                    },
                    metadata={
                        **node.metadata,
                        "activation": activation.model_dump(mode="json") if activation is not None else None,
                        "candidate_count": len(candidates),
                        "candidate_ids": [candidate.candidate_id for candidate in candidates],
                        "feedback_count": len(feedback_records),
                        "feedback_ids": [item.feedback_id for item in feedback_records],
                    },
                )
            )

        return RunGraph(
            run_id=result.run.run_id,
            workflow_id=result.run.workflow_id,
            status=result.run.status,
            entrypoint=result.run.entrypoint,
            scope=ProjectionScope(workflow_id=result.run.workflow_id, run_id=result.run.run_id),
            summary={
                "step_count": len(result.steps),
                "artifact_count": len(result.artifacts),
                "checkpoint_count": len(result.checkpoints),
                "activation_candidate_count": len(result.activation_candidates),
                "activation_count": len(result.activations),
                "feedback_count": len(result.feedback),
                "memory_event_count": len(result.memory_events),
                "handoff_count": len(result.handoffs),
            },
            nodes=nodes,
            edges=workflow_graph.edges,
            metadata=result.run.metadata,
        )

    def _build_task_tree_projection(self, run_id: str) -> Optional[dict[str, Any]]:
        try:
            root_run_id, lineage_runs = self._collect_run_lineage(run_id)
        except ValueError:
            return None

        result = next((item for item in lineage_runs if item.run.run_id == run_id), None)
        if result is None:
            return None

        nodes: List[ProjectionNode] = []
        edges: List[ProjectionEdge] = []
        node_ids: set[str] = set()

        for lineage_result in lineage_runs:
            run = lineage_result.run
            if run.run_id not in node_ids:
                nodes.append(
                    ProjectionNode(
                        id=run.run_id,
                        entity_type="run",
                        label=run.workflow_id,
                        status=run.status,
                        parent_id=run.parent_run_id,
                        refs={
                            "run_id": run.run_id,
                            "workflow_id": run.workflow_id,
                            "parent_run_id": run.parent_run_id,
                            "root_run_id": run.root_run_id,
                        },
                        timestamps=ProjectionNodeTimestamps(
                            started_at=run.started_at,
                            ended_at=run.ended_at,
                        ),
                        metadata={"entrypoint": run.entrypoint, **run.metadata},
                    )
                )
                node_ids.add(run.run_id)

            if run.parent_run_id is not None:
                edges.append(
                    ProjectionEdge(
                        id=f"edge-run-parent-{run.run_id}",
                        edge_type="delegation",
                        from_id=run.parent_run_id,
                        to_id=run.run_id,
                        intervention=True,
                        metadata={
                            "parent_step_id": run.metadata.get("parent_step_id"),
                            "delegated_from_node_id": run.metadata.get("delegated_from_node_id"),
                        },
                    )
                )

            steps_by_task_id: Dict[Optional[str], List[StepRecord]] = {}
            for step in lineage_result.steps:
                steps_by_task_id.setdefault(step.metadata.get("task_id", run.task_id), []).append(step)

            for task in lineage_result.tasks:
                if task.task_id not in node_ids:
                    nodes.append(
                        ProjectionNode(
                            id=task.task_id,
                            entity_type="task",
                            label=task.title or task.focus or task.task_id,
                            status=task.status,
                            parent_id=task.parent_task_id or run.run_id,
                            refs={
                                "task_id": task.task_id,
                                "run_id": task.run_id,
                                "root_task_id": task.root_task_id,
                                "parent_task_id": task.parent_task_id,
                            },
                            timestamps=ProjectionNodeTimestamps(
                                created_at=task.created_at,
                                started_at=task.started_at,
                                ended_at=task.ended_at,
                            ),
                            metadata=task.metadata,
                        )
                    )
                    node_ids.add(task.task_id)
                edges.append(
                    ProjectionEdge(
                        id=f"edge-task-run-{task.task_id}",
                        edge_type="belongs_to_run",
                        from_id=task.task_id,
                        to_id=run.run_id,
                        metadata={"run_id": run.run_id},
                    )
                )
                if task.parent_task_id is not None:
                    edges.append(
                        ProjectionEdge(
                            id=f"edge-task-parent-{task.task_id}",
                            edge_type="delegation",
                            from_id=task.parent_task_id,
                            to_id=task.task_id,
                            intervention=True,
                            metadata={"run_id": run.run_id},
                        )
                    )

                for step in steps_by_task_id.get(task.task_id, []):
                    if step.step_id not in node_ids:
                        nodes.append(
                            ProjectionNode(
                                id=step.step_id,
                                entity_type="step",
                                label=step.node_id,
                                status=step.status,
                                parent_id=task.task_id,
                                refs={
                                    "run_id": step.run_id,
                                    "task_id": task.task_id,
                                    "step_id": step.step_id,
                                    "node_id": step.node_id,
                                },
                                timestamps=ProjectionNodeTimestamps(
                                    started_at=step.started_at,
                                    ended_at=step.ended_at,
                                ),
                                metadata=step.metadata,
                            )
                        )
                        node_ids.add(step.step_id)
                    edges.append(
                        ProjectionEdge(
                            id=f"edge-step-task-{step.step_id}",
                            edge_type="belongs_to_task",
                            from_id=step.step_id,
                            to_id=task.task_id,
                            metadata={"run_id": step.run_id},
                        )
                    )

        return {
            "scope": ProjectionScope(
                workflow_id=result.run.workflow_id,
                run_id=result.run.run_id,
                task_id=result.run.task_id,
            ),
            "summary": {
                "root_run_id": root_run_id,
                "run_count": len(lineage_runs),
                "task_count": sum(len(item.tasks) for item in lineage_runs),
                "step_count": sum(len(item.steps) for item in lineage_runs),
                "activation_candidate_count": sum(len(item.activation_candidates) for item in lineage_runs),
                "activation_count": sum(len(item.activations) for item in lineage_runs),
                "feedback_count": sum(len(item.feedback) for item in lineage_runs),
            },
            "nodes": nodes,
            "edges": edges,
            "metadata": {
                "run_status": result.run.status,
                "root_run_id": root_run_id,
                "projection_note": "task_tree is a graph projection over task-level lineage relations.",
            },
        }

    def export_task_tree(self, run_id: str) -> Optional[TaskTreeProjection]:
        payload = self._build_task_tree_projection(run_id)
        if payload is None:
            return None
        return TaskTreeProjection(**payload)

    def export_artifact_lineage(
        self,
        run_id: Optional[str] = None,
        artifact_id: Optional[str] = None,
    ) -> Optional[ArtifactLineageProjection]:
        target_result = self._resolve_projection_run(run_id=run_id, artifact_id=artifact_id)
        if target_result is None:
            return None

        artifacts = target_result.artifacts
        if artifact_id is not None:
            artifacts = [artifact for artifact in artifacts if artifact.artifact_id == artifact_id]
            if not artifacts:
                return None

        nodes: List[ProjectionNode] = [
            ProjectionNode(
                id=target_result.run.run_id,
                entity_type="run",
                label=target_result.run.workflow_id,
                status=target_result.run.status,
                refs={"run_id": target_result.run.run_id, "workflow_id": target_result.run.workflow_id},
                timestamps=ProjectionNodeTimestamps(
                    started_at=target_result.run.started_at,
                    ended_at=target_result.run.ended_at,
                ),
                metadata=target_result.run.metadata,
            )
        ]
        edges: List[ProjectionEdge] = []
        tasks_by_id = {task.task_id: task for task in target_result.tasks}
        steps_by_id = {step.step_id: step for step in target_result.steps}

        included_task_ids: set[str] = set()
        included_step_ids: set[str] = set()
        node_ids = {target_result.run.run_id}

        for artifact in artifacts:
            step = steps_by_id.get(artifact.producer_step_id)
            task = tasks_by_id.get(target_result.run.task_id or "")
            if task is not None and task.task_id not in node_ids:
                nodes.append(
                    ProjectionNode(
                        id=task.task_id,
                        entity_type="task",
                        label=task.title or task.focus or task.task_id,
                        status=task.status,
                        parent_id=target_result.run.run_id,
                        refs={"task_id": task.task_id, "run_id": task.run_id},
                        timestamps=ProjectionNodeTimestamps(
                            created_at=task.created_at,
                            started_at=task.started_at,
                            ended_at=task.ended_at,
                        ),
                        metadata=task.metadata,
                    )
                )
                node_ids.add(task.task_id)
                included_task_ids.add(task.task_id)
                edges.append(
                    ProjectionEdge(
                        id=f"edge-artifact-task-run-{task.task_id}",
                        edge_type="belongs_to_run",
                        from_id=task.task_id,
                        to_id=target_result.run.run_id,
                        metadata={"run_id": target_result.run.run_id},
                    )
                )
            if step is not None and step.step_id not in node_ids:
                nodes.append(
                    ProjectionNode(
                        id=step.step_id,
                        entity_type="step",
                        label=step.node_id,
                        status=step.status,
                        parent_id=target_result.run.task_id,
                        refs={
                            "step_id": step.step_id,
                            "run_id": step.run_id,
                            "task_id": target_result.run.task_id,
                            "node_id": step.node_id,
                        },
                        timestamps=ProjectionNodeTimestamps(
                            started_at=step.started_at,
                            ended_at=step.ended_at,
                        ),
                        metadata=step.metadata,
                    )
                )
                node_ids.add(step.step_id)
                included_step_ids.add(step.step_id)
                if target_result.run.task_id is not None:
                    edges.append(
                        ProjectionEdge(
                            id=f"edge-artifact-step-task-{step.step_id}",
                            edge_type="belongs_to_task",
                            from_id=step.step_id,
                            to_id=target_result.run.task_id,
                            metadata={"run_id": target_result.run.run_id},
                        )
                    )

            nodes.append(
                ProjectionNode(
                    id=artifact.artifact_id,
                    entity_type="artifact",
                    label=artifact.name,
                    parent_id=artifact.producer_step_id,
                    refs={
                        "artifact_id": artifact.artifact_id,
                        "run_id": target_result.run.run_id,
                        "producer_step_id": artifact.producer_step_id,
                    },
                    timestamps=ProjectionNodeTimestamps(),
                    metadata={
                        "kind": artifact.kind,
                        "uri": artifact.uri,
                        "writeback": artifact.writeback.model_dump(mode="json"),
                        **artifact.metadata,
                    },
                )
            )
            node_ids.add(artifact.artifact_id)
            if step is not None:
                edges.append(
                    ProjectionEdge(
                        id=f"edge-produces-{artifact.artifact_id}",
                        edge_type="produces_artifact",
                        from_id=step.step_id,
                        to_id=artifact.artifact_id,
                        metadata={"run_id": target_result.run.run_id},
                    )
                )
            if target_result.run.task_id is not None:
                edges.append(
                    ProjectionEdge(
                        id=f"edge-artifact-task-{artifact.artifact_id}",
                        edge_type="belongs_to_task",
                        from_id=artifact.artifact_id,
                        to_id=target_result.run.task_id,
                        metadata={"run_id": target_result.run.run_id},
                    )
                )
            edges.append(
                ProjectionEdge(
                    id=f"edge-artifact-run-{artifact.artifact_id}",
                    edge_type="belongs_to_run",
                    from_id=artifact.artifact_id,
                    to_id=target_result.run.run_id,
                    metadata={"run_id": target_result.run.run_id},
                )
            )

        return ArtifactLineageProjection(
            scope=ProjectionScope(
                workflow_id=target_result.run.workflow_id,
                run_id=target_result.run.run_id,
                artifact_id=artifact_id,
            ),
            summary={
                "artifact_count": len(artifacts),
                "step_count": len(included_step_ids),
                "task_count": len(included_task_ids),
            },
            nodes=nodes,
            edges=edges,
            metadata={"run_status": target_result.run.status},
        )

    def export_memory_relation_graph(self, run_id: str) -> Optional[MemoryRelationProjection]:
        result = self.get_run(run_id)
        if result is None:
            return None

        nodes: List[ProjectionNode] = [
            ProjectionNode(
                id=result.run.run_id,
                entity_type="run",
                label=result.run.workflow_id,
                status=result.run.status,
                refs={"run_id": result.run.run_id, "workflow_id": result.run.workflow_id},
                timestamps=ProjectionNodeTimestamps(
                    started_at=result.run.started_at,
                    ended_at=result.run.ended_at,
                ),
                metadata=result.run.metadata,
            )
        ]
        edges: List[ProjectionEdge] = []
        node_ids = {result.run.run_id}
        handoffs_by_step_id = {handoff.from_step_id: handoff for handoff in result.handoffs}
        candidates_by_step_id: Dict[str, List[ActivationCandidate]] = {}
        for candidate in result.activation_candidates:
            if candidate.step_id is None:
                continue
            candidates_by_step_id.setdefault(candidate.step_id, []).append(candidate)
        activations_by_step_id = {activation.step_id: activation for activation in result.activations if activation.step_id}

        for task in result.tasks:
            if task.task_id not in node_ids:
                nodes.append(
                    ProjectionNode(
                        id=task.task_id,
                        entity_type="task",
                        label=task.title or task.focus or task.task_id,
                        status=task.status,
                        parent_id=result.run.run_id,
                        refs={"task_id": task.task_id, "run_id": task.run_id},
                        timestamps=ProjectionNodeTimestamps(
                            created_at=task.created_at,
                            started_at=task.started_at,
                            ended_at=task.ended_at,
                        ),
                        metadata=task.metadata,
                    )
                )
                node_ids.add(task.task_id)
                edges.append(
                    ProjectionEdge(
                        id=f"edge-memory-task-run-{task.task_id}",
                        edge_type="belongs_to_run",
                        from_id=task.task_id,
                        to_id=result.run.run_id,
                        metadata={"run_id": result.run.run_id},
                    )
                )

        for step in result.steps:
            if step.step_id not in node_ids:
                nodes.append(
                    ProjectionNode(
                        id=step.step_id,
                        entity_type="step",
                        label=step.node_id,
                        status=step.status,
                        parent_id=result.run.task_id,
                        refs={"step_id": step.step_id, "run_id": step.run_id, "task_id": result.run.task_id},
                        timestamps=ProjectionNodeTimestamps(
                            started_at=step.started_at,
                            ended_at=step.ended_at,
                        ),
                        metadata=step.metadata,
                    )
                )
                node_ids.add(step.step_id)
                if result.run.task_id is not None:
                    edges.append(
                        ProjectionEdge(
                            id=f"edge-memory-step-task-{step.step_id}",
                            edge_type="belongs_to_task",
                            from_id=step.step_id,
                            to_id=result.run.task_id,
                            metadata={"run_id": result.run.run_id},
                        )
                    )

        for handoff in result.handoffs:
            if handoff.handoff_id not in node_ids:
                nodes.append(
                    ProjectionNode(
                        id=handoff.handoff_id,
                        entity_type="handoff",
                        label=f"{handoff.from_node_id}->{handoff.to_node_id or 'END'}",
                        parent_id=handoff.from_step_id,
                        refs={
                            "handoff_id": handoff.handoff_id,
                            "run_id": handoff.run_id,
                            "from_step_id": handoff.from_step_id,
                        },
                        timestamps=ProjectionNodeTimestamps(created_at=handoff.created_at),
                        metadata={"goal": handoff.goal, **handoff.metadata},
                    )
                )
                node_ids.add(handoff.handoff_id)
                edges.append(
                    ProjectionEdge(
                        id=f"edge-handoff-step-{handoff.handoff_id}",
                        edge_type="handoff_to",
                        from_id=handoff.from_step_id,
                        to_id=handoff.handoff_id,
                        metadata={"to_node_id": handoff.to_node_id},
                    )
                )

        for candidate in result.activation_candidates:
            nodes.append(
                ProjectionNode(
                    id=candidate.candidate_id,
                    entity_type="activation_candidate",
                    label=f"{candidate.candidate_type}:{candidate.candidate_ref}",
                    status="selected" if candidate.selected else "suppressed",
                    parent_id=candidate.step_id or candidate.task_id or result.run.run_id,
                    refs={
                        "candidate_id": candidate.candidate_id,
                        "run_id": candidate.run_id,
                        "task_id": candidate.task_id,
                        "step_id": candidate.step_id,
                        "node_id": candidate.node_id,
                    },
                    timestamps=ProjectionNodeTimestamps(created_at=candidate.created_at),
                    metadata={
                        "candidate_type": candidate.candidate_type,
                        "candidate_ref": candidate.candidate_ref,
                        "source_signals": candidate.source_signals,
                        "score": candidate.score,
                        "selected": candidate.selected,
                        "suppressed_reason": candidate.suppressed_reason,
                        **candidate.metadata,
                    },
                )
            )
            source_id = candidate.step_id or candidate.task_id or result.run.run_id
            edges.append(
                ProjectionEdge(
                    id=f"edge-candidate-step-{candidate.candidate_id}",
                    edge_type="candidate_for_activation",
                    from_id=source_id,
                    to_id=candidate.candidate_id,
                    metadata={"candidate_type": candidate.candidate_type},
                )
            )

        for activation in result.activations:
            nodes.append(
                ProjectionNode(
                    id=activation.activation_id,
                    entity_type="activation",
                    label=f"{activation.node_id}:{activation.mode}",
                    status=activation.decision,
                    parent_id=activation.step_id or activation.task_id or result.run.run_id,
                    refs={
                        "activation_id": activation.activation_id,
                        "run_id": activation.run_id,
                        "task_id": activation.task_id,
                        "step_id": activation.step_id,
                        "node_id": activation.node_id,
                    },
                    timestamps=ProjectionNodeTimestamps(created_at=activation.created_at),
                    metadata=activation.metadata
                    | {
                        "mode": activation.mode,
                        "tags": activation.tags,
                        "delegate_candidates": activation.delegate_candidates,
                        "feedback_channels": activation.feedback_channels,
                        "signal_sources": activation.signal_sources,
                        "reasons": activation.reasons,
                    },
                )
            )
            for candidate in candidates_by_step_id.get(activation.step_id or "", []):
                edges.append(
                    ProjectionEdge(
                        id=f"edge-candidate-activation-{candidate.candidate_id}",
                        edge_type="candidate_for_activation",
                        from_id=candidate.candidate_id,
                        to_id=activation.activation_id,
                        metadata={"selected": candidate.selected},
                    )
                )
            source_id = activation.step_id or activation.task_id or result.run.run_id
            edges.append(
                ProjectionEdge(
                    id=f"edge-activation-{activation.activation_id}",
                    edge_type="activates",
                    from_id=source_id,
                    to_id=activation.activation_id,
                    metadata={"node_id": activation.node_id, "mode": activation.mode},
                )
            )

        for feedback in result.feedback:
            nodes.append(
                ProjectionNode(
                    id=feedback.feedback_id,
                    entity_type="feedback_signal",
                    label=feedback.summary,
                    status=feedback.status,
                    parent_id=feedback.step_id or feedback.task_id or result.run.run_id,
                    refs={
                        "feedback_id": feedback.feedback_id,
                        "run_id": feedback.run_id,
                        "task_id": feedback.task_id,
                        "step_id": feedback.step_id,
                        "node_id": feedback.node_id,
                    },
                    timestamps=ProjectionNodeTimestamps(created_at=feedback.created_at),
                    metadata={
                        "source_type": feedback.source_type,
                        "signals": feedback.signals,
                        "reward_hints": feedback.reward_hints,
                        **feedback.metadata,
                    },
                )
            )
            if feedback.step_id is not None and feedback.step_id in activations_by_step_id:
                source_id = activations_by_step_id[feedback.step_id].activation_id
            elif feedback.step_id is not None:
                source_id = feedback.step_id
            elif feedback.task_id is not None:
                source_id = feedback.task_id
            else:
                source_id = result.run.run_id
            edges.append(
                ProjectionEdge(
                    id=f"edge-feedback-{feedback.feedback_id}",
                    edge_type="records_feedback",
                    from_id=source_id,
                    to_id=feedback.feedback_id,
                    metadata={"source_type": feedback.source_type, "status": feedback.status},
                )
            )

        for event in result.memory_events:
            nodes.append(
                ProjectionNode(
                    id=event.event_id,
                    entity_type="memory_event",
                    label=event.summary,
                    status=event.category,
                    parent_id=event.step_id or event.task_id or result.run.run_id,
                    refs={
                        "event_id": event.event_id,
                        "run_id": event.run_id,
                        "task_id": event.task_id,
                        "step_id": event.step_id,
                    },
                    timestamps=ProjectionNodeTimestamps(created_at=event.created_at),
                    metadata={"category": event.category, **event.metadata, "payload": event.payload},
                )
            )
            source_id = result.run.run_id
            if event.category == "handoff" and event.step_id is not None and event.step_id in handoffs_by_step_id:
                source_id = handoffs_by_step_id[event.step_id].handoff_id
            elif event.step_id is not None:
                source_id = event.step_id
            elif event.task_id is not None:
                source_id = event.task_id
            edges.append(
                ProjectionEdge(
                    id=f"edge-memory-event-{event.event_id}",
                    edge_type="emits_memory_event",
                    from_id=source_id,
                    to_id=event.event_id,
                    metadata={"category": event.category},
                )
            )

        return MemoryRelationProjection(
            scope=ProjectionScope(workflow_id=result.run.workflow_id, run_id=result.run.run_id),
            summary={
                "memory_event_count": len(result.memory_events),
                "step_count": len(result.steps),
                "handoff_count": len(result.handoffs),
                "activation_candidate_count": len(result.activation_candidates),
                "activation_count": len(result.activations),
                "feedback_count": len(result.feedback),
            },
            nodes=nodes,
            edges=edges,
            metadata={"run_status": result.run.status},
        )

    def export_checkpoint_lineage(self, run_id: str) -> Optional[CheckpointLineageProjection]:
        result = self.get_run(run_id)
        if result is None:
            return None

        nodes: List[ProjectionNode] = [
            ProjectionNode(
                id=result.run.run_id,
                entity_type="run",
                label=result.run.workflow_id,
                status=result.run.status,
                refs={"run_id": result.run.run_id, "workflow_id": result.run.workflow_id},
                timestamps=ProjectionNodeTimestamps(
                    started_at=result.run.started_at,
                    ended_at=result.run.ended_at,
                ),
                metadata=result.run.metadata,
            )
        ]
        edges: List[ProjectionEdge] = []
        node_ids = {result.run.run_id}
        steps_by_id = {step.step_id: step for step in result.steps}

        for step in result.steps:
            if step.step_id not in node_ids:
                nodes.append(
                    ProjectionNode(
                        id=step.step_id,
                        entity_type="step",
                        label=step.node_id,
                        status=step.status,
                        parent_id=result.run.task_id,
                        refs={"step_id": step.step_id, "run_id": step.run_id},
                        timestamps=ProjectionNodeTimestamps(
                            started_at=step.started_at,
                            ended_at=step.ended_at,
                        ),
                        metadata=step.metadata,
                    )
                )
                node_ids.add(step.step_id)

        for checkpoint in result.checkpoints:
            nodes.append(
                ProjectionNode(
                    id=checkpoint.checkpoint_id,
                    entity_type="checkpoint",
                    label=checkpoint.state.current_node_id or checkpoint.checkpoint_id,
                    parent_id=checkpoint.step_id,
                    refs={
                        "checkpoint_id": checkpoint.checkpoint_id,
                        "run_id": checkpoint.run_id,
                        "step_id": checkpoint.step_id,
                    },
                    timestamps=ProjectionNodeTimestamps(created_at=checkpoint.created_at),
                    metadata={
                        "state_ref": checkpoint.state_ref,
                        "next_node_id": checkpoint.state.next_node_id,
                        "writeback": checkpoint.writeback.model_dump(mode="json"),
                        **checkpoint.metadata,
                    },
                )
            )
            if checkpoint.step_id is not None and checkpoint.step_id in steps_by_id:
                edges.append(
                    ProjectionEdge(
                        id=f"edge-checkpoint-step-{checkpoint.checkpoint_id}",
                        edge_type="creates_checkpoint",
                        from_id=checkpoint.step_id,
                        to_id=checkpoint.checkpoint_id,
                        metadata={"run_id": checkpoint.run_id},
                    )
                )
            edges.append(
                ProjectionEdge(
                    id=f"edge-checkpoint-run-{checkpoint.checkpoint_id}",
                    edge_type="belongs_to_run",
                    from_id=checkpoint.checkpoint_id,
                    to_id=result.run.run_id,
                    metadata={"run_id": checkpoint.run_id},
                )
            )

        resumed_from_checkpoint_id = result.run.metadata.get("resumed_from_checkpoint_id")
        if isinstance(resumed_from_checkpoint_id, str):
            checkpoint = self.get_checkpoint(resumed_from_checkpoint_id)
            if checkpoint is not None and checkpoint.checkpoint_id not in node_ids:
                nodes.append(
                    ProjectionNode(
                        id=checkpoint.checkpoint_id,
                        entity_type="checkpoint",
                        label=checkpoint.state.current_node_id or checkpoint.checkpoint_id,
                        refs={
                            "checkpoint_id": checkpoint.checkpoint_id,
                            "run_id": checkpoint.run_id,
                            "step_id": checkpoint.step_id,
                        },
                        timestamps=ProjectionNodeTimestamps(created_at=checkpoint.created_at),
                        metadata={
                            "state_ref": checkpoint.state_ref,
                            "next_node_id": checkpoint.state.next_node_id,
                            **checkpoint.metadata,
                        },
                    )
                )
                node_ids.add(checkpoint.checkpoint_id)
            edges.append(
                ProjectionEdge(
                    id=f"edge-resume-{result.run.run_id}",
                    edge_type="resume_from",
                    from_id=result.run.run_id,
                    to_id=resumed_from_checkpoint_id,
                    intervention=True,
                    metadata={"resumed_from_run_id": result.run.metadata.get("resumed_from_run_id")},
                )
            )
            edges.append(
                ProjectionEdge(
                    id=f"edge-derived-{result.run.run_id}",
                    edge_type="derived_from_checkpoint",
                    from_id=resumed_from_checkpoint_id,
                    to_id=result.run.run_id,
                    metadata={"resumed_from_run_id": result.run.metadata.get("resumed_from_run_id")},
                )
            )

        return CheckpointLineageProjection(
            scope=ProjectionScope(
                workflow_id=result.run.workflow_id,
                run_id=result.run.run_id,
                checkpoint_id=resumed_from_checkpoint_id,
            ),
            summary={
                "checkpoint_count": len(result.checkpoints),
                "resumed": bool(resumed_from_checkpoint_id),
            },
            nodes=nodes,
            edges=edges,
            metadata={"run_status": result.run.status},
        )

    def export_activation_training_dataset(self, run_id: str) -> Optional[ActivationTrainingDataset]:
        result = self.get_run(run_id)
        if result is None:
            return None

        activations_by_step_id = {activation.step_id: activation for activation in result.activations if activation.step_id}
        candidates_by_step_id: Dict[str, List[ActivationCandidate]] = {}
        for candidate in result.activation_candidates:
            if candidate.step_id is None:
                continue
            candidates_by_step_id.setdefault(candidate.step_id, []).append(candidate)
        feedback_by_step_id: Dict[str, List[ExecutionFeedbackRecord]] = {}
        for record in result.feedback:
            if record.step_id is None:
                continue
            feedback_by_step_id.setdefault(record.step_id, []).append(record)

        # Phase 2: assembly wire-back — read block→node mapping from run metadata
        assembly_block_node_map: Dict[str, str] = result.run.metadata.get("assembly_block_node_map", {})
        # Invert: node_id → block_ref for lookup
        node_to_block: Dict[str, str] = {node_id: block_ref for block_ref, node_id in assembly_block_node_map.items()}
        assembly_goal: Optional[str] = result.run.metadata.get("assembly_goal")

        samples: List[ActivationTrainingSample] = []
        for step in result.steps:
            activation = activations_by_step_id.get(step.step_id)
            if activation is None:
                continue
            candidates = candidates_by_step_id.get(step.step_id, [])
            feedback_records = feedback_by_step_id.get(step.step_id, [])
            selected_candidate_ids = [candidate.candidate_id for candidate in candidates if candidate.selected]
            reward_hints: Dict[str, float] = {}
            for record in feedback_records:
                for key, value in record.reward_hints.items():
                    reward_hints[key] = float(value)

            samples.append(
                ActivationTrainingSample(
                    sample_id=f"sample-{step.step_id}",
                    run_id=result.run.run_id,
                    workflow_id=result.run.workflow_id,
                    task_id=step.metadata.get("task_id"),
                    step_id=step.step_id,
                    node_id=step.node_id,
                    step_status=step.status,
                    activation_mode=activation.mode,
                    activation_decision=activation.decision,
                    candidate_count=len(candidates),
                    selected_candidate_count=len(selected_candidate_ids),
                    selected_candidate_ids=selected_candidate_ids,
                    candidates=[
                        {
                            "candidate_id": candidate.candidate_id,
                            "candidate_type": candidate.candidate_type,
                            "candidate_ref": candidate.candidate_ref,
                            "source_signals": candidate.source_signals,
                            "score": candidate.score,
                            "selected": candidate.selected,
                            "suppressed_reason": candidate.suppressed_reason,
                            "scoring_breakdown": candidate.metadata.get("scoring_breakdown", {}),
                        }
                        for candidate in candidates
                    ],
                    feedback_ids=[record.feedback_id for record in feedback_records],
                    reward_hints=reward_hints,
                    signals=feedback_records[-1].signals if feedback_records else {},
                    assembly_block_id=node_to_block.get(step.node_id),
                    assembly_goal=assembly_goal if node_to_block else None,
                    metadata={
                        "activation_id": activation.activation_id,
                        "activation_tags": activation.tags,
                        "activation_reasons": activation.reasons,
                        "feedback_channels": activation.feedback_channels,
                    },
                )
            )

        return ActivationTrainingDataset(
            scope=ProjectionScope(workflow_id=result.run.workflow_id, run_id=result.run.run_id, task_id=result.run.task_id),
            summary={
                "sample_count": len(samples),
                "step_count": len(result.steps),
                "activation_candidate_count": len(result.activation_candidates),
                "activation_count": len(result.activations),
                "feedback_count": len(result.feedback),
            },
            samples=samples,
            metadata={
                "run_status": result.run.status,
                "root_run_id": result.run.root_run_id,
                "dataset_note": "trainer-facing activation dataset derived from runtime candidates, activations, and feedback.",
            },
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

    def _is_delegated_node(self, node: NodeDefinition) -> bool:
        delegated_config = node.config.get("delegated")
        return isinstance(delegated_config, dict) and isinstance(delegated_config.get("workflow"), dict)

    async def _execute_delegated_node(
        self,
        *,
        request: RuntimeRequest,
        run_id: str,
        task: TaskRecord,
        step_id: str,
        node: NodeDefinition,
        step_input: Dict[str, Any],
        state: Dict[str, Any],
    ) -> Dict[str, Any]:
        role = node.config.get("role", node.type)
        prompt = node.config.get("prompt", "")
        delegated_config = node.config.get("delegated", {})
        child_workflow = WorkflowDefinition.model_validate(delegated_config["workflow"])
        child_input = dict(step_input)
        if isinstance(delegated_config.get("input"), dict):
            child_input.update(delegated_config["input"])
        child_context = delegated_config.get("context") if isinstance(delegated_config.get("context"), dict) else {}
        handoff_goal = delegated_config.get("handoff_goal") or self._extract_handoff_goal(node)
        child_result = await self.spawn_child_run(
            run_id,
            ChildRunRequest(
                workflow=child_workflow,
                input=child_input,
                context=child_context,
                memory_scope=delegated_config.get("memory_scope", request.memory_scope),
                execution_mode=delegated_config.get("execution_mode", request.execution_mode),
                context_mode=delegated_config.get("context_mode", "inherit"),
                parent_step_id=step_id,
                parent_task_id=task.task_id,
                task_title=delegated_config.get("task_title") or node.config.get("task_title") or child_workflow.name,
                handoff_goal=handoff_goal,
                metadata={
                    **(delegated_config.get("metadata") if isinstance(delegated_config.get("metadata"), dict) else {}),
                    "parent_node_id": node.id,
                    "parent_workflow_id": request.workflow.workflow_id,
                },
            ),
            parent_request_override=request,
            parent_task_override=task,
            delegated_from_node_id=node.id,
        )

        output: Dict[str, Any] = {
            "message": node.config.get(
                "message_template",
                f"[{role}] delegated work to child run {child_result.run.run_id}.",
            ),
            "node_id": node.id,
            "node_type": node.type,
            "handled_by": role,
            "state": {
                "last_child_run_id": child_result.run.run_id,
                "last_child_task_id": child_result.run.task_id,
            },
            "delegated_run": True,
            "child_run_id": child_result.run.run_id,
            "child_task_id": child_result.run.task_id,
            "child_status": child_result.run.status,
            "child_workflow_id": child_result.run.workflow_id,
            "child_final_output": child_result.final_output,
            "child_handoff_goal": handoff_goal,
            "child_artifact_ids": [item.artifact_id for item in child_result.artifacts],
            "child_checkpoint_ids": [item.checkpoint_id for item in child_result.checkpoints],
        }
        if prompt:
            output["prompt"] = prompt
        self._apply_node_config_output(
            node=node,
            output=output,
            step_input=step_input,
            context=request.context,
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
        result = self._json_safe(await self._executor_registry.execute(executor_config, payload))
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

    def _build_checkpoint_payload(self, state: Dict[str, Any]) -> Dict[str, Any]:
        shared_state = {
            key: value
            for key, value in state.items()
            if key
            not in {
                "visited_nodes",
                "step_outputs",
                "input",
                "context",
                "workflow_id",
                "root_input",
                "artifacts_by_step",
            }
        }
        if "parallel" in shared_state and isinstance(shared_state["parallel"], dict):
            shared_state["parallel"] = self._sanitize_parallel_state(shared_state["parallel"])
        return {
            "step_outputs": state["step_outputs"],
            "shared_state": shared_state,
        }

    def _sanitize_parallel_state(self, parallel_state: Dict[str, Any]) -> Dict[str, Any]:
        cleaned: Dict[str, Any] = {}
        for parallel_id, payload in parallel_state.items():
            if not isinstance(payload, dict):
                cleaned[parallel_id] = payload
                continue
            cleaned[parallel_id] = {
                key: value
                for key, value in payload.items()
                if key != "branch_set"
            }
        return cleaned

    def _get_workflow_index(self, workflow: WorkflowDefinition) -> Dict[str, Any]:
        cache_key = id(workflow)
        cached = self._workflow_index_cache.get(cache_key)
        if cached is not None and cached[0] is workflow:
            return cached[1]

        compiled = self._build_workflow_index(workflow)
        if len(self._workflow_index_cache) >= 128:
            self._workflow_index_cache.clear()
        self._workflow_index_cache[cache_key] = (workflow, compiled)
        return compiled

    def _build_workflow_index(self, workflow: WorkflowDefinition) -> Dict[str, Any]:
        nodes_by_id = {node.id: node for node in workflow.nodes}
        edges_by_from: Dict[str, List[Any]] = {}
        handoff_goals: Dict[str, Optional[str]] = {}

        for node in workflow.nodes:
            handoff_goals[node.id] = self._extract_handoff_goal(node)

        for edge in workflow.edges:
            edges_by_from.setdefault(edge.from_id, []).append(
                {
                    "to_id": edge.to_id,
                    "condition": self._compile_condition(edge.condition),
                }
            )
        return {
            "nodes_by_id": nodes_by_id,
            "edges_by_from": edges_by_from,
            "handoff_goals": handoff_goals,
        }

    def _as_string_list(self, value: Any) -> List[str]:
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, str) and item]

    def _resolve_node_activation_config(
        self,
        request: RuntimeRequest,
        node: NodeDefinition,
    ) -> Dict[str, Any]:
        workflow_activation = (
            request.workflow.metadata.get("template_activation", {})
            if isinstance(request.workflow.metadata.get("template_activation"), dict)
            else {}
        )
        node_activation = node.config.get("local_activation", {}) if isinstance(node.config.get("local_activation"), dict) else {}
        default_mode = workflow_activation.get("default_mode", "always")
        return {
            "mode": node_activation.get("mode", default_mode),
            "tags": self._as_string_list(node_activation.get("tags")),
            "activate_when": self._as_string_list(node_activation.get("activate_when")),
            "suppress_when": self._as_string_list(node_activation.get("suppress_when")),
            "delegate_candidates": self._as_string_list(node_activation.get("delegate_candidates")),
            "subgoal_triggers": self._as_string_list(node_activation.get("subgoal_triggers")),
            "retry_gates": self._as_string_list(node_activation.get("retry_gates")),
            "review_gates": self._as_string_list(node_activation.get("review_gates")),
            "feedback_channels": self._as_string_list(node_activation.get("feedback_channels")),
            "signal_sources": self._as_string_list(workflow_activation.get("signal_sources")),
            "workflow_activation_enabled": bool(workflow_activation.get("enabled", True)),
            "workflow_default_mode": default_mode,
            "workflow_activation_metadata": workflow_activation.get("metadata", {})
            if isinstance(workflow_activation.get("metadata"), dict)
            else {},
            "metadata": node_activation.get("metadata", {}) if isinstance(node_activation.get("metadata"), dict) else {},
        }

    def _resolve_activation_policy(self, request: RuntimeRequest) -> Dict[str, Any]:
        workflow_activation = (
            request.workflow.metadata.get("template_activation", {})
            if isinstance(request.workflow.metadata.get("template_activation"), dict)
            else {}
        )
        request_policy = (
            request.metadata.get("activation_policy", {})
            if isinstance(request.metadata.get("activation_policy"), dict)
            else {}
        )
        selection_enabled = any(
            key in workflow_activation for key in ("selection_threshold", "top_k", "budget")
        ) or any(
            key in request_policy for key in ("selection_threshold", "top_k", "budget")
        )
        threshold = request_policy.get("selection_threshold", workflow_activation.get("selection_threshold", 0.0))
        top_k = request_policy.get("top_k", workflow_activation.get("top_k"))
        budget = request_policy.get("budget", workflow_activation.get("budget"))
        signal_weights = request_policy.get("signal_weights", workflow_activation.get("signal_weights", {}))
        candidate_type_weights = request_policy.get(
            "candidate_type_weights", workflow_activation.get("candidate_type_weights", {})
        )
        try:
            threshold = float(threshold)
        except (TypeError, ValueError):
            threshold = 0.0
        if not isinstance(top_k, int) or top_k <= 0:
            top_k = None
        if not isinstance(budget, int) or budget <= 0:
            budget = None
        return {
            "selection_enabled": selection_enabled,
            "selection_threshold": threshold,
            "top_k": top_k,
            "budget": budget,
            "signal_weights": signal_weights if isinstance(signal_weights, dict) else {},
            "candidate_type_weights": candidate_type_weights if isinstance(candidate_type_weights, dict) else {},
        }

    def _build_activation_record(
        self,
        *,
        request: RuntimeRequest,
        run_id: str,
        task: TaskRecord,
        step_id: str,
        node: NodeDefinition,
        candidates: List[ActivationCandidate],
    ) -> ActivationRecord:
        resolved = self._resolve_node_activation_config(request, node)
        node_candidates = [candidate for candidate in candidates if candidate.candidate_type == "node"]
        selected_node_candidate = next((candidate for candidate in node_candidates if candidate.selected), None)
        decision = "activated" if selected_node_candidate is not None else "suppressed"
        reasons = ["runtime_selected"] if decision == "activated" else ["runtime_suppressed"]
        if resolved["mode"] == "local":
            reasons.append("local_activation_scope")
        if self._is_delegated_node(node):
            reasons.append("delegated_node")
        if selected_node_candidate is None:
            reasons.extend(
                candidate.suppressed_reason
                for candidate in node_candidates
                if isinstance(candidate.suppressed_reason, str) and candidate.suppressed_reason
            )
        return ActivationRecord(
            activation_id=f"act-{uuid4().hex[:10]}",
            run_id=run_id,
            task_id=task.task_id,
            step_id=step_id,
            node_id=node.id,
            mode=resolved["mode"],
            decision=decision,
            tags=resolved["tags"],
            activate_when=resolved["activate_when"],
            suppress_when=resolved["suppress_when"],
            delegate_candidates=resolved["delegate_candidates"],
            subgoal_triggers=resolved["subgoal_triggers"],
            retry_gates=resolved["retry_gates"],
            review_gates=resolved["review_gates"],
            feedback_channels=resolved["feedback_channels"],
            signal_sources=resolved["signal_sources"],
            reasons=reasons,
            metadata={
                "candidate_ids": [candidate.candidate_id for candidate in candidates],
                "selected_candidate_ids": [candidate.candidate_id for candidate in candidates if candidate.selected],
                "node_type": node.type,
                "node_kind": node.kind,
                "workflow_activation_enabled": resolved["workflow_activation_enabled"],
                "workflow_default_mode": resolved["workflow_default_mode"],
                **resolved["workflow_activation_metadata"],
                **resolved["metadata"],
            },
        )

    def _build_activation_candidates(
        self,
        *,
        request: RuntimeRequest,
        run_id: str,
        task: TaskRecord,
        step_id: str,
        node: NodeDefinition,
        step_input: Dict[str, Any],
        state: Dict[str, Any],
    ) -> List[ActivationCandidate]:
        resolved = self._resolve_node_activation_config(request, node)
        policy = self._resolve_activation_policy(request)
        created_at = utc_now()
        signal_sources = resolved["signal_sources"] or ["goal", "context"]
        node_selected, suppressed_reason, node_score, node_signal_sources = self._evaluate_node_activation_candidate(
            request=request,
            node=node,
            resolved=resolved,
            step_input=step_input,
            state=state,
        )
        node_scoring = self._score_activation_candidate(
            candidate_type="node",
            base_score=node_score,
            source_signals=node_signal_sources,
            policy=policy,
        )
        candidates: List[ActivationCandidate] = [
            ActivationCandidate(
                candidate_id=f"cand-{uuid4().hex[:10]}",
                run_id=run_id,
                task_id=task.task_id,
                step_id=step_id,
                node_id=node.id,
                candidate_type="node",
                candidate_ref=node.id,
                source_signals=node_signal_sources,
                score=node_scoring["score"],
                selected=node_selected,
                suppressed_reason=suppressed_reason,
                created_at=created_at,
                metadata={
                    "node_type": node.type,
                    "node_kind": node.kind,
                    "scoring_breakdown": node_scoring,
                },
            )
        ]

        for candidate_index, candidate_ref in enumerate(resolved["delegate_candidates"], start=1):
            scoring = self._score_activation_candidate(
                candidate_type="delegate_target",
                base_score=max(0.1, 0.85 - (0.1 * (candidate_index - 1))),
                source_signals=signal_sources,
                policy=policy,
            )
            candidates.append(
                ActivationCandidate(
                    candidate_id=f"cand-{uuid4().hex[:10]}",
                    run_id=run_id,
                    task_id=task.task_id,
                    step_id=step_id,
                    node_id=node.id,
                    candidate_type="delegate_target",
                    candidate_ref=candidate_ref,
                    source_signals=signal_sources,
                    score=scoring["score"],
                    selected=False,
                    suppressed_reason="not_selected_in_minimal_runtime",
                    created_at=created_at,
                    metadata={"source_node_id": node.id, "scoring_breakdown": scoring},
                )
            )

        for trigger_index, trigger in enumerate(resolved["subgoal_triggers"], start=1):
            scoring = self._score_activation_candidate(
                candidate_type="subgoal",
                base_score=max(0.1, 0.65 - (0.1 * (trigger_index - 1))),
                source_signals=signal_sources,
                policy=policy,
            )
            candidates.append(
                ActivationCandidate(
                    candidate_id=f"cand-{uuid4().hex[:10]}",
                    run_id=run_id,
                    task_id=task.task_id,
                    step_id=step_id,
                    node_id=node.id,
                    candidate_type="subgoal",
                    candidate_ref=trigger,
                    source_signals=signal_sources,
                    score=scoring["score"],
                    selected=False,
                    suppressed_reason="subgoal_not_spawned_in_minimal_runtime",
                    created_at=created_at,
                    metadata={"source_node_id": node.id, "scoring_breakdown": scoring},
                )
            )

        self._apply_candidate_selection_policy(candidates, policy)
        return candidates

    def _score_activation_candidate(
        self,
        *,
        candidate_type: str,
        base_score: float,
        source_signals: List[str],
        policy: Dict[str, Any],
    ) -> Dict[str, Any]:
        type_weights = policy.get("candidate_type_weights", {})
        signal_weights = policy.get("signal_weights", {})
        try:
            type_weight = float(type_weights.get(candidate_type, 1.0))
        except (TypeError, ValueError):
            type_weight = 1.0
        signal_bonus = 0.0
        weighted_signals: Dict[str, float] = {}
        for signal in source_signals:
            try:
                weight = float(signal_weights.get(signal, 0.0))
            except (TypeError, ValueError):
                weight = 0.0
            weighted_signals[signal] = weight
            signal_bonus += weight
        score = max(0.0, round((base_score * type_weight) + signal_bonus, 4))
        return {
            "base_score": base_score,
            "type_weight": type_weight,
            "signal_bonus": round(signal_bonus, 4),
            "weighted_signals": weighted_signals,
            "score": score,
        }

    def _apply_candidate_selection_policy(
        self,
        candidates: List[ActivationCandidate],
        policy: Dict[str, Any],
    ) -> None:
        threshold = float(policy.get("selection_threshold", 0.0))
        top_k = policy.get("top_k")
        budget = policy.get("budget")
        if not policy.get("selection_enabled"):
            return
        ranked = sorted(
            (
                candidate
                for candidate in candidates
                if candidate.candidate_type != "node"
            ),
            key=lambda item: item.score,
            reverse=True,
        )
        selected_count = 0
        for index, candidate in enumerate(ranked, start=1):
            if candidate.score < threshold:
                candidate.selected = False
                candidate.suppressed_reason = "below_selection_threshold"
                continue
            if top_k is not None and index > top_k:
                candidate.selected = False
                candidate.suppressed_reason = "excluded_by_top_k"
                continue
            if budget is not None and selected_count >= budget:
                candidate.selected = False
                candidate.suppressed_reason = "excluded_by_budget"
                continue
            candidate.selected = True
            candidate.suppressed_reason = None
            selected_count += 1

    def _evaluate_node_activation_candidate(
        self,
        *,
        request: RuntimeRequest,
        node: NodeDefinition,
        resolved: Dict[str, Any],
        step_input: Dict[str, Any],
        state: Dict[str, Any],
    ) -> tuple[bool, Optional[str], float, List[str]]:
        signal_sources = list(resolved["signal_sources"] or ["goal", "context"])
        override_payload = (
            request.metadata.get("activation_overrides", {})
            if isinstance(request.metadata.get("activation_overrides"), dict)
            else {}
        )
        override_nodes = {
            item for item in override_payload.get("nodes", []) if isinstance(item, str) and item
        }
        override_tags = {
            item for item in override_payload.get("tags", []) if isinstance(item, str) and item
        }
        node_tags = set(resolved["tags"])

        if resolved["suppress_when"] and any(
            self._match_condition(condition, step_input, state) for condition in resolved["suppress_when"]
        ):
            return False, "suppress_when_matched", 0.0, signal_sources

        if resolved["activate_when"] and not any(
            self._match_condition(condition, step_input, state) for condition in resolved["activate_when"]
        ):
            return False, "activate_when_not_met", 0.0, signal_sources

        if resolved["mode"] == "manual":
            manually_selected = node.id in override_nodes or bool(node_tags & override_tags)
            if manually_selected:
                return True, None, 1.0, signal_sources + ["manual_override"]
            return False, "manual_activation_required", 0.0, signal_sources

        if resolved["mode"] == "local":
            return True, None, 0.9, signal_sources

        return True, None, 1.0, signal_sources

    def _build_suppressed_step_output(
        self,
        *,
        node: NodeDefinition,
        activation: ActivationRecord,
    ) -> Dict[str, Any]:
        return {
            "message": f"[runtime] skipped node {node.id} due to activation gating.",
            "node_id": node.id,
            "node_type": node.type,
            "handled_by": "activation-gate",
            "state": {},
            "skipped": True,
            "activation_decision": activation.decision,
        }

    def _build_step_feedback_record(
        self,
        *,
        run_id: str,
        task: TaskRecord,
        step: StepRecord,
        activation: ActivationRecord,
        candidates: List[ActivationCandidate],
        checkpoint: CheckpointRef,
        next_node_id: Optional[str],
        artifact_ids: List[str],
        handoff: Optional[HandoffRef],
    ) -> ExecutionFeedbackRecord:
        delegated_run = bool(step.output.get("delegated_run"))
        review_gate_triggered = bool(activation.review_gates)
        signals = {
            "node_id": step.node_id,
            "node_type": step.metadata.get("node_type"),
            "step_status": step.status,
            "activation_id": activation.activation_id,
            "activation_mode": activation.mode,
            "activation_decision": activation.decision,
            "candidate_count": len(candidates),
            "selected_candidate_count": sum(1 for candidate in candidates if candidate.selected),
            "delegate_candidate_count": sum(
                1 for candidate in candidates if candidate.candidate_type == "delegate_target"
            ),
            "selected_non_node_candidate_count": sum(
                1 for candidate in candidates if candidate.candidate_type != "node" and candidate.selected
            ),
            "artifact_count": len(artifact_ids),
            "artifact_ids": artifact_ids,
            "checkpoint_id": checkpoint.checkpoint_id,
            "next_node_id": next_node_id,
            "handoff_id": handoff.handoff_id if handoff is not None else None,
            "delegated_run": delegated_run,
            "child_run_id": step.output.get("child_run_id"),
            "review_gate_triggered": review_gate_triggered,
            "retry_gate_count": len(activation.retry_gates),
        }
        reward_hints = {
            "artifact_count": float(len(artifact_ids)),
            "delegated_run": 1.0 if delegated_run else 0.0,
            "continued_flow": 1.0 if next_node_id is not None else 0.0,
            "review_gate_triggered": 1.0 if review_gate_triggered else 0.0,
            "selected_candidates": float(sum(1 for candidate in candidates if candidate.selected)),
        }
        return ExecutionFeedbackRecord(
            feedback_id=f"fb-{uuid4().hex[:10]}",
            run_id=run_id,
            task_id=task.task_id,
            step_id=step.step_id,
            node_id=step.node_id,
            source_type="step",
            status=(
                "succeeded"
                if step.status == "succeeded"
                else "suppressed" if step.status == "skipped" else "failed"
            ),
            summary=f"Feedback captured for step {step.node_id}",
            signals=signals,
            reward_hints=reward_hints,
            metadata={"feedback_channels": activation.feedback_channels},
        )

    def _build_run_feedback_record(
        self,
        *,
        run: RunRecord,
        task: TaskRecord,
        steps: List[StepRecord],
        artifacts: List[ArtifactRef],
        checkpoints: List[CheckpointRef],
        handoffs: List[HandoffRef],
        activation_candidates: List[ActivationCandidate],
        activations: List[ActivationRecord],
        feedback_records: List[ExecutionFeedbackRecord],
    ) -> ExecutionFeedbackRecord:
        return ExecutionFeedbackRecord(
            feedback_id=f"fb-{uuid4().hex[:10]}",
            run_id=run.run_id,
            task_id=task.task_id,
            source_type="run",
            status="succeeded" if run.status == "succeeded" else "failed",
            summary=f"Run feedback captured for {run.workflow_id}",
            signals={
                "run_status": run.status,
                "step_count": len(steps),
                "artifact_count": len(artifacts),
                "checkpoint_count": len(checkpoints),
                "handoff_count": len(handoffs),
                "activation_candidate_count": len(activation_candidates),
                "activation_count": len(activations),
                "step_feedback_count": len(feedback_records),
            },
            reward_hints={
                "completion": 1.0 if run.status == "succeeded" else 0.0,
                "artifact_density": float(len(artifacts)),
                "candidate_coverage": float(len(activation_candidates)),
                "activation_coverage": float(len(activations)),
            },
            metadata={"workflow_id": run.workflow_id},
        )

    def _resolve_next_node(
        self,
        node: NodeDefinition,
        step_output: Dict[str, Any],
        state: Dict[str, Any],
        edges_by_from: Dict[str, List[Any]],
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
            branches = parallel_state.get("branch_set")
            if branches is None:
                branches = set(parallel_state.get("branches", []))
                parallel_state["branch_set"] = branches
            if current_node_id in branches:
                remaining = parallel_state.get("remaining_branches", [])
                if remaining:
                    return remaining[0]
                return parallel_state.get("barrier")

        candidates = edges_by_from.get(current_node_id, [])
        for edge in candidates:
            if self._match_compiled_condition(edge["condition"], step_output, state):
                return None if edge["to_id"] == "END" else edge["to_id"]
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
                "branch_set": set(branches),
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
        return self._match_compiled_condition(self._compile_condition(condition), step_output, state)

    def _compile_condition(self, condition: Optional[str]) -> Optional[List[Dict[str, Any]]]:
        if not condition:
            return []

        normalized = condition.strip()
        parts = (
            self._condition_splitter.split(normalized)
            if "&&" in normalized or " and " in normalized
            else [normalized]
        )
        checks: List[Dict[str, Any]] = []
        for part in parts:
            clause = part.strip()
            if not clause:
                continue

            source_name = "result"
            expr = clause
            if "." in clause:
                root, expr = clause.split(".", 1)
                root = root.strip()
                if root == "result":
                    source_name = "result"
                elif root == "state":
                    source_name = "state"
                else:
                    return None

            match = self._condition_pattern.match(expr.strip())
            if not match:
                return None

            key, op, raw_value = match.groups()
            expected: Any = raw_value.strip()
            try:
                expected = json.loads(expected)
            except json.JSONDecodeError:
                pass
            checks.append(
                {
                    "source": source_name,
                    "key": key,
                    "op": op,
                    "expected": expected,
                }
            )
        return checks

    def _match_compiled_condition(
        self,
        condition: Optional[List[Dict[str, Any]]],
        step_output: Dict[str, Any],
        state: Dict[str, Any],
    ) -> bool:
        if condition is None:
            return False
        if not condition:
            return True

        for check in condition:
            source = step_output if check["source"] == "result" else state
            actual = source.get(check["key"])
            if actual is None:
                return False
            expected = self._coerce_expected_value(actual, check["expected"])
            if not self._compare_values(actual, expected, check["op"]):
                return False
        return True

    def _extract_handoff_goal(self, node: NodeDefinition) -> Optional[str]:
        assignment = node.config.get("assignment")
        if not isinstance(assignment, dict):
            return None
        raw_handoff_goal = assignment.get("handoff_goal")
        if isinstance(raw_handoff_goal, str) and raw_handoff_goal.strip():
            return raw_handoff_goal.strip()
        return None

    def _coerce_expected_value(self, actual: Any, expected: Any) -> Any:
        if isinstance(actual, bool) and isinstance(expected, str):
            return expected.lower() in {"true", "1", "yes"}
        if isinstance(actual, (int, float)) and not isinstance(expected, (int, float)):
            try:
                return float(expected)
            except (TypeError, ValueError):
                return expected
        return expected

    def _compare_values(self, actual: Any, expected: Any, op: str) -> bool:
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

    def _build_chat_prompt(self, messages: List[ChatMessage]) -> str:
        segments: List[str] = []
        for message in messages:
            if not message.content.strip():
                continue
            segments.append(f"{message.role.upper()}:\n{message.content.strip()}")
        segments.append("ASSISTANT:")
        return "\n\n".join(segments)

    def _eval_expr(self, expr: str, source: Dict[str, Any]) -> bool:
        match = self._condition_pattern.match(expr)
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
        expected = self._coerce_expected_value(actual, expected)
        return self._compare_values(actual, expected, op)

    def _json_safe(self, value: Any) -> Any:
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, dict):
            return {str(key): self._json_safe(item) for key, item in value.items()}
        if isinstance(value, list):
            return [self._json_safe(item) for item in value]
        if isinstance(value, tuple):
            return [self._json_safe(item) for item in value]
        return str(value)
