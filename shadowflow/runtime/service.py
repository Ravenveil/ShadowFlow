from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
from typing import Any, Dict, List, Optional, Tuple
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
from shadowflow.runtime.gap_detector import detect_gap
from shadowflow.runtime.host_adapter import BaseWritebackAdapter


logger = logging.getLogger(__name__)

_REJECTION_EVENTS_PER_RUN_MAX = 100


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
        event_bus: Optional[Any] = None,
    ) -> None:
        self._runs: Dict[str, RunResult] = {}
        self._requests_by_run_id: Dict[str, RuntimeRequest] = {}
        self._checkpoints: Dict[str, CheckpointRef] = {}
        self._chat_sessions: Dict[str, ChatSession] = {}
        self._workflow_index_cache: Dict[int, Any] = {}
        # approval_gate 信号：key = (run_id, node_id)
        self._approval_events: Dict[Tuple[str, str], asyncio.Event] = {}
        self._approval_decisions: Dict[Tuple[str, str], Dict[str, Any]] = {}
        self._gap_events: Dict[Tuple[str, str], asyncio.Event] = {}
        self._gap_responses: Dict[Tuple[str, str], Dict[str, Any]] = {}
        # 驳回事件记录：key = run_id
        self._rejection_events: Dict[str, List[Dict[str, Any]]] = {}
        # P5: per-run asyncio.Lock — 保护 reject / resume / _execute 并发写
        self._run_locks: Dict[str, asyncio.Lock] = {}
        self._writeback_adapter = writeback_adapter
        self._checkpoint_store = checkpoint_store or getattr(writeback_adapter, "checkpoint_store", None)
        self._run_store = run_store or getattr(writeback_adapter, "run_store", None)
        self._request_context_store = request_context_store
        self._chat_session_store = chat_session_store
        self._executor_registry = executor_registry or ExecutorRegistry()
        # Per-run threading lock for policy hot-swap writes (Story 4.5)
        self._policy_locks: Dict[str, threading.Lock] = {}
        # SSE event bus (Story 4.1) — optional; set externally or via constructor
        self._event_bus = event_bus

    def _get_run_lock(self, run_id: str) -> asyncio.Lock:
        """Return the per-run asyncio.Lock, creating it on first access."""
        if run_id not in self._run_locks:
            self._run_locks[run_id] = asyncio.Lock()
        return self._run_locks[run_id]

    def validate_workflow(self, workflow: WorkflowDefinition) -> WorkflowValidationResult:
        from shadowflow.runtime.policy_matrix import validate_best_practices

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

        node_ids = {node.id for node in workflow.nodes}
        policy_warnings = []
        if workflow.policy_matrix is not None:
            policy_warnings = validate_best_practices(workflow.policy_matrix)

        return WorkflowValidationResult(
            valid=True,
            workflow_id=workflow.workflow_id,
            warnings=warnings,
            policy_warnings=policy_warnings,
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

    async def reject(
        self,
        run_id: str,
        reviewer_role: str,
        target_node_id: str,
        reason: str = "",
        retarget_stage: Optional[str] = None,
    ) -> None:
        """政策矩阵强制驳回：校验权限 → 新建 snapshot checkpoint → 发事件（SSE） → 触发 approval 信号。

        Args:
            retarget_stage: 目标回退节点 id。非 None 时将该节点及其下游全部标记 invalidated，
                新建 snapshot checkpoint 记录恢复起点，再发 checkpoint.saved 事件，
                最后发 node.invalidated × N 事件（顺序：saved 在前，invalidated 在后）。
        Raises:
            PolicyViolation: reviewer_role 无权驳回 target_node_id。
            ValueError: retarget_stage 不在已访问节点列表中；或 retarget_stage 非 None 但无 checkpoint。
        """
        async with self._get_run_lock(run_id):
            await self._reject_locked(
                run_id=run_id,
                reviewer_role=reviewer_role,
                target_node_id=target_node_id,
                reason=reason,
                retarget_stage=retarget_stage,
            )

    async def _reject_locked(
        self,
        run_id: str,
        reviewer_role: str,
        target_node_id: str,
        reason: str,
        retarget_stage: Optional[str],
    ) -> None:
        """Inner implementation of reject(), called while holding the per-run lock."""
        from shadowflow.runtime.errors import PolicyViolation
        from shadowflow.runtime.events import (
            CHECKPOINT_SAVED,
            HANDOFF_TRIGGERED,
            NODE_INVALIDATED,
            NODE_REJECTED,
            POLICY_VIOLATION as POLICY_VIOLATION_EVT,
        )
        from shadowflow.runtime.policy_matrix import can_reject

        request = self._requests_by_run_id.get(run_id)
        if request is None:
            raise ValueError(f"Unknown run_id: {run_id!r}")
        policy_matrix = request.workflow.policy_matrix

        if policy_matrix is not None:
            if not can_reject(policy_matrix, reviewer_role, target_node_id):
                raise PolicyViolation(reviewer=reviewer_role, target=target_node_id, reason=reason)

        now = utc_now().isoformat()

        # P2/P3/P7/P8/P9: retarget_stage 处理 — 必须在发基础事件之前完成 checkpoint 快照
        invalidated: List[str] = []
        new_checkpoint_id: Optional[str] = None

        if retarget_stage is not None:
            latest = self._get_latest_checkpoint(run_id)
            if latest is None:
                raise ValueError(
                    f"Cannot retarget to '{retarget_stage}': no checkpoint found for run={run_id}"
                )

            visited = list(latest.state.visited_nodes)
            if retarget_stage not in visited:
                raise ValueError(
                    f"retarget_stage='{retarget_stage}' is not in visited_nodes {visited!r} "
                    f"for run={run_id}"
                )

            target_idx = visited.index(retarget_stage)
            invalidated = visited[target_idx:]

            # P9 (D1): 新建 snapshot checkpoint — 不覆盖原 checkpoint
            new_checkpoint_id = f"ckpt-{uuid4().hex[:10]}"
            new_cp = CheckpointRef(
                checkpoint_id=new_checkpoint_id,
                run_id=run_id,
                step_id=latest.step_id,
                state_ref=f"checkpoint://{run_id}/{new_checkpoint_id}",
                state=CheckpointState(
                    current_node_id=latest.state.current_node_id,
                    next_node_id=retarget_stage,
                    # P7: visited_nodes 裁剪到 retarget_stage 之前（不含）
                    visited_nodes=visited[:target_idx],
                    last_output=latest.state.last_output,
                    state={
                        **latest.state.state,
                        "invalidated_nodes": list(invalidated),
                    },
                ),
                writeback=latest.writeback,
                metadata={
                    **latest.metadata,
                    "retarget_stage": retarget_stage,
                    "retarget_from_checkpoint": latest.checkpoint_id,
                },
            )
            self._checkpoints[new_checkpoint_id] = new_cp
            if self._checkpoint_store is not None:
                await asyncio.get_event_loop().run_in_executor(
                    None, self._checkpoint_store.put, new_cp
                )

        # 构建基础事件序列（P1: 顺序正确后全部发布到 SSE）
        base_events: List[Dict[str, Any]] = [
            {
                "event": POLICY_VIOLATION_EVT,
                "sender": reviewer_role,
                "receiver": target_node_id,
                "node_id": target_node_id,
                "reason": reason,
                "timestamp": now,
            },
            {
                "event": NODE_REJECTED,
                "node_id": target_node_id,
                "reason": reason,
                "timestamp": now,
            },
            {
                "event": HANDOFF_TRIGGERED,
                "from": reviewer_role,
                "to": target_node_id,
                "reason": reason,
                "timestamp": now,
            },
        ]

        # P8 (D2): 事件顺序 — checkpoint.saved 先于 node.invalidated
        if new_checkpoint_id is not None:
            base_events.append(
                {
                    "event": CHECKPOINT_SAVED,
                    "checkpoint_id": new_checkpoint_id,
                    "retarget_stage": retarget_stage,
                    "timestamp": now,
                }
            )

        for inv_node in invalidated:
            base_events.append(
                {
                    "event": NODE_INVALIDATED,
                    "node_id": inv_node,
                    "timestamp": now,
                }
            )

        # P1: 发布所有事件到 SSE event bus（之前只写字典，SSE 不可见）
        if self._event_bus is not None:
            for evt in base_events:
                self._event_bus.publish(run_id, evt)

        # 保留字典记录供测试/消费（per-run 上限防止无界增长）
        run_rejections = self._rejection_events.setdefault(run_id, [])
        run_rejections.append({"events": base_events})
        if len(run_rejections) > _REJECTION_EVENTS_PER_RUN_MAX:
            del run_rejections[: len(run_rejections) - _REJECTION_EVENTS_PER_RUN_MAX]

        # 唤醒等待的 approval gate（若存在）
        self.submit_approval(run_id, target_node_id, "reject", reason)

    def submit_approval(self, run_id: str, node_id: str, decision: str, reason: Optional[str] = None) -> bool:
        """向等待审批的工作流节点提交决策。返回 True 表示成功唤醒，False 表示没有等待者。"""
        key = (run_id, node_id)
        event = self._approval_events.get(key)
        if event is None:
            logger.warning("submit_approval: no approval gate waiting for run=%s node=%s decision=%s", run_id, node_id, decision)
            return False
        self._approval_decisions[key] = {"decision": decision, "reason": reason}
        event.set()
        return True

    def submit_gap_response(
        self,
        run_id: str,
        node_id: str,
        gap_choice: str,
        user_input: Optional[str] = None,
    ) -> bool:
        """Submit a response for a waiting gap-detected node."""
        key = (run_id, node_id)
        event = self._gap_events.get(key)
        if event is None:
            logger.warning(
                "submit_gap_response: no gap waiter for run=%s node=%s choice=%s",
                run_id,
                node_id,
                gap_choice,
            )
            return False
        self._gap_responses[key] = {
            "gap_choice": gap_choice,
            "user_input": user_input,
        }
        event.set()
        return True

    # Terminal step statuses — nodes in these states are excluded from affected_downstream
    _TERMINAL_STEP_STATUSES = frozenset({"succeeded", "failed", "skipped", "cancelled", "invalidated"})

    def update_policy(self, run_id: str, matrix: Dict[str, Any]) -> Dict[str, Any]:
        """Story 4.5: hot-swap a run's policy matrix without interrupting execution.

        - completed steps keep their output (never replayed)
        - pending / in-flight nodes see the new matrix on next dispatch
        - publishes ``policy.updated`` for subscribed SSE clients
        Returns {"status": "updated", "affected_downstream_nodes": [...]}
        """
        from shadowflow.runtime.contracts import WorkflowPolicyMatrixSpec
        from shadowflow.runtime.events import POLICY_UPDATED

        request = self._requests_by_run_id.get(run_id)
        if request is None:
            raise ValueError(f"run not found: {run_id}")

        # Validate & coerce the raw dict into a proper Pydantic model (Patch: BLOCKER fix)
        validated_matrix = WorkflowPolicyMatrixSpec.model_validate(matrix)

        # Per-run lock prevents torn reads during concurrent dispatch (GIL protects ref swap,
        # but this serializes the full validate→assign→compute sequence)
        lock = self._policy_locks.setdefault(run_id, threading.Lock())
        with lock:
            try:
                request.workflow.policy_matrix = validated_matrix  # type: ignore[assignment]
            except Exception:
                if hasattr(request.workflow, "model_copy"):
                    request.workflow = request.workflow.model_copy(update={"policy_matrix": validated_matrix})
                else:
                    setattr(request.workflow, "policy_matrix", validated_matrix)

        # BFS affected downstream: exclude all terminal-status nodes
        result = self._runs.get(run_id)
        terminal_node_ids: set = set()
        if result is not None:
            terminal_node_ids = {
                step.node_id for step in result.steps
                if step.status in self._TERMINAL_STEP_STATUSES
            }
        all_nodes: List[str] = []
        try:
            all_nodes = [node.id for node in request.workflow.nodes]
        except Exception:
            pass
        affected_downstream = [n for n in all_nodes if n not in terminal_node_ids]

        if self._event_bus is not None:
            self._event_bus.publish(run_id, {
                "type": POLICY_UPDATED,
                "run_id": run_id,
                "affected_downstream_nodes": affected_downstream,
                "timestamp": utc_now().isoformat(),
            })

        return {"status": "updated", "affected_downstream_nodes": affected_downstream}

    def reconfigure(self, run_id: str, new_def: Dict[str, Any]) -> Dict[str, Any]:
        """Story 4.6: hot-reconfigure a run's workflow (add/remove agents + edges + policy).

        Reuses completed node outputs (by node id + inputs hash parity) and only
        re-executes nodes whose definition changed. Publishes ``run.reconfigured``.

        Args:
            new_def: {"agents": [...], "edges": [...], "policy_matrix": {...}}

        Returns:
            {"status": "reconfigured", "reused_node_outputs": [...], "new_nodes": [...], "removed_nodes": [...]}
        """
        from shadowflow.runtime.events import RUN_RECONFIGURED

        request = self._requests_by_run_id.get(run_id)
        if request is None:
            raise ValueError(f"run not found: {run_id}")

        old_nodes = []
        try:
            old_nodes = [n.id for n in request.workflow.nodes]
        except Exception:
            pass

        new_agents = new_def.get("agents") or []
        new_node_ids = [a.get("id") for a in new_agents if isinstance(a, dict) and a.get("id")]

        reused: List[str] = []
        result = self._runs.get(run_id)
        if result is not None:
            reused = [step.node_id for step in result.steps
                      if step.status == "succeeded" and step.node_id in new_node_ids]

        added = [n for n in new_node_ids if n not in old_nodes]
        removed = [n for n in old_nodes if n not in new_node_ids]

        # Apply the new policy matrix (hot-swap) — propagate errors instead of swallowing
        policy_matrix = new_def.get("policy_matrix")
        policy_failure: Optional[str] = None
        if policy_matrix is not None:
            try:
                self.update_policy(run_id, policy_matrix)
            except Exception as exc:
                policy_failure = str(exc)

        if self._event_bus is not None:
            self._event_bus.publish(run_id, {
                "type": RUN_RECONFIGURED,
                "run_id": run_id,
                "reused_node_outputs": reused,
                "new_nodes": added,
                "removed_nodes": removed,
                "timestamp": utc_now().isoformat(),
            })

        resp: Dict[str, Any] = {
            "status": "reconfigured",
            "reused_node_outputs": reused,
            "new_nodes": added,
            "removed_nodes": removed,
        }
        if policy_failure is not None:
            resp["policy_failure"] = policy_failure
        return resp

    async def resume(self, run_id: str, resume_request: ResumeRequest) -> RunResult:
        """Resume a run from a checkpoint. P6: rejects terminal runs; P11: per-run lock prevents concurrent resume."""
        from shadowflow.runtime.events import RUN_RESUMED

        # P11: dedup concurrent POST /resume via per-run lock
        async with self._get_run_lock(run_id):
            # P6: reject explicitly-cancelled runs — a cancelled run must not be resumed.
            # NOTE: "succeeded" is intentionally NOT blocked here: the normal reject→resume
            # flow calls resume() on a run_id whose original execution already succeeded.
            # resume() always creates a NEW run anyway (new run_id in _execute), so the
            # original run's "succeeded" state is irrelevant to resumability.
            existing = self._runs.get(run_id)
            if existing is not None and existing.run.status == "cancelled":
                raise ValueError(
                    f"Cannot resume run={run_id} in terminal state '{existing.run.status}'"
                )

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

            # P12: emit RUN_RESUMED before execution begins
            if self._event_bus is not None:
                self._event_bus.publish(run_id, {
                    "type": RUN_RESUMED,
                    "run_id": run_id,
                    "checkpoint_id": checkpoint.checkpoint_id,
                    "next_node_id": next_node_id,
                    "timestamp": utc_now().isoformat(),
                })

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

    def _get_latest_checkpoint(self, run_id: str) -> Optional[CheckpointRef]:
        """Return the most recent checkpoint for a run (by created_at), or None."""
        candidates: List[CheckpointRef] = [cp for cp in self._checkpoints.values() if cp.run_id == run_id]
        if self._checkpoint_store is not None:
            for record in self._checkpoint_store.list_run(run_id):
                if record.checkpoint_id not in self._checkpoints:
                    cp = self._checkpoint_store.get(record.checkpoint_id)
                    if cp is not None:
                        candidates.append(cp)
        if not candidates:
            return None
        return max(candidates, key=lambda cp: cp.created_at)

    def get_latest_checkpoint_ref(self, run_id: str) -> Optional[CheckpointRef]:
        """Return the latest CheckpointRef for a run (does NOT resume execution).

        Callers should pass the returned ref's checkpoint_id to
        ``ResumeRequest`` and then call ``await service.resume(run_id, request)``
        to actually restart execution.
        """
        return self._get_latest_checkpoint(run_id)

    # P14: keep deprecated alias for backwards compatibility
    def resume_from_latest_checkpoint(self, run_id: str) -> Optional[CheckpointRef]:
        """Deprecated: use get_latest_checkpoint_ref() instead."""
        return self.get_latest_checkpoint_ref(run_id)

    def _get_request_context(self, run_id: str) -> Optional[RuntimeRequest]:
        request = self._requests_by_run_id.get(run_id)
        if request is None and self._request_context_store is not None:
            request = self._request_context_store.get(run_id)
            if request is not None:
                self._requests_by_run_id[run_id] = request
        return request

    def get_request_context(self, run_id: str) -> Optional[RuntimeRequest]:
        return self._get_request_context(run_id)

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

        # P10 (D3): nodes that were invalidated by reject(retarget_stage) must re-run;
        # nodes already succeeded (in step_outputs) that are NOT invalidated can be skipped.
        invalidated_nodes: set = set(state.get("invalidated_nodes", []))

        for index in range(1, max_steps + 1):
            if current_node_id is None or current_node_id == "END":
                break

            # P10 (D3): In a post-reject resume, skip cached nodes that were NOT invalidated.
            # Guard: only activates when invalidated_nodes is non-empty — i.e., this is a
            # post-reject resume with a snapshot checkpoint.  A normal resume (no rejection)
            # has no invalidated nodes, so we must NOT skip anything and re-execute fully.
            if (
                resumed_from is not None
                and invalidated_nodes                       # only post-reject resumes
                and current_node_id not in invalidated_nodes
                and current_node_id in state.get("step_outputs", {})
            ):
                current_output = state["step_outputs"][current_node_id]
                # advance to next node via normal edge resolution
                # (edges_by_from stores plain dicts: {"to_id": ..., "condition": ...})
                edges = edges_by_from.get(current_node_id, [])
                current_node_id = edges[0]["to_id"] if edges else None
                continue

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
            # Story 4.1 AC2: publish NODE_STARTED before execution
            if activation.decision == "activated" and self._event_bus is not None:
                from shadowflow.runtime.events import NODE_STARTED as _NS
                self._event_bus.publish_node_event(run_id, _NS, current_node_id, {"node_type": node.type, "step_id": step_id})

            effective_input = dict(current_output)
            gap_enabled = isinstance(node.config.get("gap_detection"), dict) or node.type == "section.generate"
            gap_payload = (
                detect_gap(effective_input, node.config)
                if activation.decision == "activated" and gap_enabled
                else None
            )
            if activation.decision == "activated" and gap_payload is not None:
                gap_response = await self._wait_for_gap_response(
                    run_id=run_id,
                    node=node,
                    run=run,
                    task=task,
                    step_id=step_id,
                    gap_payload=gap_payload,
                    trace=step_trace,
                    memory_events=memory_events,
                )
                effective_input = self._apply_gap_response(
                    step_input=effective_input,
                    gap_payload=gap_payload,
                    gap_response=gap_response,
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
            elif node.type == "approval_gate":
                step_output = await self._execute_approval_gate(
                    run_id=run_id,
                    node=node,
                    run=run,
                    task=task,
                    step_id=step_id,
                    step_input=effective_input,
                    state=state,
                    trace=step_trace,
                    memory_events=memory_events,
                )
                if state.get("_approval_paused"):
                    from shadowflow.runtime.events import CHECKPOINT_SAVED as _CKS
                    _timeout_step = StepRecord(
                        step_id=step_id,
                        run_id=run_id,
                        node_id=current_node_id,
                        status="cancelled",
                        index=index,
                        input=effective_input,
                        output=step_output,
                        trace=step_trace,
                        started_at=step_started_at,
                        ended_at=utc_now(),
                        metadata={"node_kind": node.kind, "node_type": node.type, "task_id": task.task_id},
                    )
                    steps.append(_timeout_step)
                    _timeout_cp = CheckpointRef(
                        checkpoint_id=f"ckpt-{uuid4().hex[:10]}",
                        run_id=run_id,
                        step_id=step_id,
                        state_ref=f"checkpoint://{run_id}/{step_id}",
                        state=CheckpointState(
                            current_node_id=current_node_id,
                            next_node_id=current_node_id,
                            visited_nodes=list(state["visited_nodes"]),
                            last_output=effective_input,
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
                            "reason": "approval_timeout",
                        },
                    )
                    checkpoints.append(_timeout_cp)
                    self._checkpoints[_timeout_cp.checkpoint_id] = _timeout_cp
                    if self._checkpoint_store is not None:
                        self._checkpoint_store.put(_timeout_cp)
                    if self._event_bus is not None:
                        self._event_bus.publish(run_id, {
                            "type": _CKS,
                            "checkpoint_id": _timeout_cp.checkpoint_id,
                            "node_id": current_node_id,
                            "reason": "approval_timeout",
                        })
                    break
            elif self._is_delegated_node(node):
                step_output = await self._execute_delegated_node(
                    request=request,
                    run_id=run_id,
                    task=task,
                    step_id=step_id,
                    node=node,
                    step_input=effective_input,
                    state=state,
                )
            else:
                step_output = await self._execute_node(node, effective_input, state, request.context)
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
                input=effective_input,
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
            # Story 4.1 AC2: publish NODE_SUCCEEDED after step completes
            if step.status == "succeeded" and self._event_bus is not None:
                from shadowflow.runtime.events import NODE_SUCCEEDED as _NSu
                self._event_bus.publish_node_event(run_id, _NSu, current_node_id, {
                    "step_id": step.step_id,
                    "output_summary": str(step_output.get("message") or "")[:200],
                })
            # Story 4.5 AC2: in-flight post-validation — recheck completed node against
            # current (possibly hot-swapped) policy matrix
            if (
                step.status == "succeeded"
                and request.workflow.policy_matrix is not None
                and len(state["visited_nodes"]) >= 2
            ):
                from shadowflow.runtime.policy_matrix import can_reject as _can_reject
                _upstream = state["visited_nodes"][-2]
                if _can_reject(request.workflow.policy_matrix, reviewer=_upstream, target=current_node_id):
                    from shadowflow.runtime.events import NODE_REJECTED as _NR
                    _violation = {
                        "run_id": run_id,
                        "step_id": step_id,
                        "node_id": current_node_id,
                        "upstream_node_id": _upstream,
                        "reason": "post_dispatch_policy_violation",
                        "timestamp": utc_now().isoformat(),
                    }
                    rej_list = self._rejection_events.setdefault(run_id, [])
                    if len(rej_list) < _REJECTION_EVENTS_PER_RUN_MAX:
                        rej_list.append(_violation)
                    if self._event_bus is not None:
                        self._event_bus.publish_node_event(run_id, _NR, current_node_id, _violation)
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

        if state.get("_approval_paused"):
            run.status = "paused"
            task.status = "waiting"
        elif errors:
            run.status = "failed"
            task.status = "failed"
        else:
            run.status = "succeeded"
            task.status = "succeeded"
        # Story 4.1 AC2: publish RUN_COMPLETED and close run event bus
        if self._event_bus is not None:
            from shadowflow.runtime.events import RUN_COMPLETED as _RC
            self._event_bus.publish_node_event(run_id, _RC, "", {"status": run.status, "errors": errors[:5]})
            self._event_bus.close_run(run_id)
        run.ended_at = utc_now()
        run.current_step_id = steps[-1].step_id if steps else None
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

    async def _execute_approval_gate(
        self,
        run_id: str,
        node: "NodeDefinition",
        run: "RunRecord",
        task: "TaskRecord",
        step_id: str,
        step_input: Dict[str, Any],
        state: Dict[str, Any],
        trace: List[Dict[str, Any]],
        memory_events: List["MemoryEvent"],
    ) -> Dict[str, Any]:
        from shadowflow.runtime.events import (
            APPROVAL_APPROVED,
            APPROVAL_PENDING,
            APPROVAL_REJECTED,
            APPROVAL_TIMEOUT,
        )

        approval_cfg = node.approval
        timeout = approval_cfg.timeout_seconds if approval_cfg else 300
        key = (run_id, node.id)

        event = asyncio.Event()
        self._approval_events[key] = event

        run.status = "awaiting_approval"
        task.status = "awaiting_approval"

        trace.append(
            {
                "event": APPROVAL_PENDING,
                "node_id": node.id,
                "message": f"Approval gate pending: approver={approval_cfg.approver if approval_cfg else 'unknown'}",
                "timestamp": utc_now().isoformat(),
            }
        )
        memory_events.append(
            MemoryEvent(
                event_id=f"mem-{uuid4().hex[:10]}",
                run_id=run_id,
                task_id=task.task_id,
                step_id=step_id,
                category="step_result",
                summary=f"Approval gate pending at {node.id}",
                payload={"node_id": node.id, "approver": approval_cfg.approver if approval_cfg else ""},
                metadata={"source": "approval_gate"},
            )
        )

        try:
            await asyncio.wait_for(event.wait(), timeout=float(timeout))
        except asyncio.TimeoutError:
            trace.append(
                {
                    "event": APPROVAL_TIMEOUT,
                    "node_id": node.id,
                    "message": f"Approval gate timed out after {timeout}s",
                    "timestamp": utc_now().isoformat(),
                }
            )
            memory_events.append(
                MemoryEvent(
                    event_id=f"mem-{uuid4().hex[:10]}",
                    run_id=run_id,
                    task_id=task.task_id,
                    step_id=step_id,
                    category="step_result",
                    summary=f"Approval timeout at {node.id}",
                    payload={"node_id": node.id, "timeout_seconds": timeout},
                    metadata={"source": "approval_gate"},
                )
            )
            state["_approval_paused"] = True
            self._approval_events.pop(key, None)
            self._approval_decisions.pop(key, None)
            return {"message": "approval_timeout", "approval_status": "timeout", "state": {}}
        finally:
            self._approval_events.pop(key, None)

        decision_data = self._approval_decisions.pop(key, {})
        decision = decision_data.get("decision", "approve")
        reason = decision_data.get("reason", "")

        if decision not in {"approve", "reject"}:
            decision = "reject"
            reason = reason or f"invalid decision '{decision_data.get('decision')}' treated as reject"

        if decision == "approve":
            trace.append(
                {
                    "event": APPROVAL_APPROVED,
                    "node_id": node.id,
                    "message": f"Approval granted by {approval_cfg.approver if approval_cfg else 'unknown'}",
                    "timestamp": utc_now().isoformat(),
                }
            )
            run.status = "running"
            task.status = "running"
            return {"message": "approved", "approval_status": "approved", "approval_reason": reason, "state": {}}

        trace.append(
            {
                "event": APPROVAL_REJECTED,
                "node_id": node.id,
                "message": f"Approval rejected: {reason}",
                "timestamp": utc_now().isoformat(),
            }
        )
        on_reject = approval_cfg.on_reject if approval_cfg else "halt"
        run.status = "running"
        task.status = "running"
        return {
            "message": "rejected",
            "approval_status": "rejected",
            "approval_reason": reason,
            "on_reject": on_reject,
            "state": {"_approval_rejected": True, "_on_reject": on_reject},
        }

    async def _wait_for_gap_response(
        self,
        *,
        run_id: str,
        node: "NodeDefinition",
        run: "RunRecord",
        task: "TaskRecord",
        step_id: str,
        gap_payload: Dict[str, Any],
        trace: List[Dict[str, Any]],
        memory_events: List["MemoryEvent"],
    ) -> Dict[str, Any]:
        from shadowflow.runtime.events import AgentGapDetectedEvent, GapChoice

        key = (run_id, node.id)
        event = asyncio.Event()
        self._gap_events[key] = event
        run.status = "waiting_user"
        task.status = "waiting_user"

        trace.append(
            {
                "event": "gap_detected",
                "node_id": node.id,
                "message": gap_payload["description"],
                "timestamp": utc_now().isoformat(),
            }
        )
        memory_events.append(
            MemoryEvent(
                event_id=f"mem-{uuid4().hex[:10]}",
                run_id=run_id,
                task_id=task.task_id,
                step_id=step_id,
                category="step_result",
                summary=f"Gap detected at {node.id}",
                payload={
                    "node_id": node.id,
                    "gap_type": gap_payload["gap_type"],
                    "description": gap_payload["description"],
                },
                metadata={"source": "gap_detector"},
            )
        )

        if self._event_bus is not None:
            self._event_bus.publish(
                run_id,
                AgentGapDetectedEvent(
                    run_id=run_id,
                    node_id=node.id,
                    gap_type=str(gap_payload["gap_type"]),
                    description=str(gap_payload["description"]),
                    choices=[GapChoice.model_validate(choice) for choice in gap_payload["choices"]],
                ),
            )

        try:
            await event.wait()
        finally:
            self._gap_events.pop(key, None)

        response = self._gap_responses.pop(key, {})
        run.status = "running"
        task.status = "running"
        trace.append(
            {
                "event": "gap_resolved",
                "node_id": node.id,
                "message": f"Gap resolved with choice {response.get('gap_choice', '?')}",
                "timestamp": utc_now().isoformat(),
            }
        )
        return response

    def _apply_gap_response(
        self,
        *,
        step_input: Dict[str, Any],
        gap_payload: Dict[str, Any],
        gap_response: Dict[str, Any],
    ) -> Dict[str, Any]:
        merged = dict(step_input)
        choice = str(gap_response.get("gap_choice") or "").upper()
        user_input = gap_response.get("user_input")
        resolution = {
            "gap_type": gap_payload["gap_type"],
            "description": gap_payload["description"],
            "choice": choice,
            "user_input": user_input,
        }
        merged["_gap_resolution"] = resolution
        existing = merged.get("gap_resolutions")
        if isinstance(existing, list):
            existing.append(resolution)
        else:
            merged["gap_resolutions"] = [resolution]

        if choice == "A" and isinstance(user_input, str) and user_input.strip():
            merged["supplemental_data"] = user_input.strip()
        elif choice == "B":
            merged["drop_comparison"] = True
        elif choice == "C":
            merged["annotation_placeholder"] = "[TODO: will be updated]"
        return merged

    def _apply_gap_resolution_output(self, output: Dict[str, Any], step_input: Dict[str, Any]) -> None:
        resolution = step_input.get("_gap_resolution")
        if not isinstance(resolution, dict):
            return
        choice = str(resolution.get("choice") or "").upper()
        user_input = resolution.get("user_input")
        output["gap_resolution"] = resolution
        output["state"].setdefault("gap_resolution", resolution)
        if choice == "A" and isinstance(user_input, str) and user_input.strip():
            output["message"] = f"{output.get('message', '')} [supplemented: {user_input.strip()}]".strip()
            output["supplemental_data"] = user_input.strip()
        elif choice == "B":
            output["message"] = f"{output.get('message', '')} [comparison dropped]".strip()
            output["drop_comparison"] = True
        elif choice == "C":
            output["message"] = f"[TODO: will be updated] {output.get('message', '')}".strip()
            output["annotation_placeholder"] = "[TODO: will be updated]"

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
            self._apply_gap_resolution_output(output, step_input)
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
            self._apply_gap_resolution_output(output, step_input)
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
            self._apply_gap_resolution_output(output, step_input)
            return output

        self._apply_node_config_output(
            node=node,
            output=output,
            step_input=step_input,
            context=context,
            prompt=prompt,
        )
        self._apply_gap_resolution_output(output, step_input)
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
        self._apply_gap_resolution_output(output, step_input)
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
