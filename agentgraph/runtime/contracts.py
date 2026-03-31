from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


WRITEBACK_TARGETS = {"host", "docs", "memory", "graph"}
ARTIFACT_WRITEBACK_MODES = {"reference", "inline"}
CHECKPOINT_WRITEBACK_MODES = {"reference"}


def _validate_writeback_channel_config(channel: str, config: Any, scope: str) -> None:
    if not isinstance(config, dict):
        raise ValueError(f"{scope} writeback.{channel} must be an object")

    target = config.get("target", "host")
    mode = config.get("mode", "reference")

    if target not in WRITEBACK_TARGETS:
        raise ValueError(f"{scope} writeback.{channel}.target must be one of {sorted(WRITEBACK_TARGETS)}")

    valid_modes = ARTIFACT_WRITEBACK_MODES if channel == "artifact" else CHECKPOINT_WRITEBACK_MODES
    if mode not in valid_modes:
        raise ValueError(f"{scope} writeback.{channel}.mode must be one of {sorted(valid_modes)}")


def validate_writeback_bundle(bundle: Any, scope: str) -> None:
    if bundle is None:
        return
    if not isinstance(bundle, dict):
        raise ValueError(f"{scope} writeback must be an object")

    for channel in bundle:
        if channel not in {"artifact", "checkpoint"}:
            raise ValueError(f"{scope} writeback supports only artifact/checkpoint channels")
        _validate_writeback_channel_config(channel, bundle[channel], scope)


class NodeDefinition(BaseModel):
    id: str
    kind: Literal["agent", "node"] = "agent"
    type: str
    config: Dict[str, Any] = Field(default_factory=dict)
    inputs: List[str] = Field(default_factory=list)
    outputs: List[str] = Field(default_factory=list)
    retry_policy: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EdgeDefinition(BaseModel):
    from_id: str = Field(alias="from")
    to_id: str = Field(alias="to")
    type: Literal["default", "conditional", "final"] = "default"
    condition: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class WorkflowDefinition(BaseModel):
    workflow_id: str
    version: str
    name: str
    entrypoint: str
    nodes: List[NodeDefinition]
    edges: List[EdgeDefinition]
    defaults: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_graph(self) -> "WorkflowDefinition":
        validate_writeback_bundle(self.defaults.get("writeback"), "workflow defaults")
        node_ids = {node.id for node in self.nodes}
        nodes_by_id = {node.id: node for node in self.nodes}
        outgoing_edges: Dict[str, List[EdgeDefinition]] = {}
        incoming_edges: Dict[str, List[EdgeDefinition]] = {}
        if not self.nodes:
            raise ValueError("workflow must define at least one node")
        if self.entrypoint not in node_ids:
            raise ValueError("entrypoint must reference an existing node")

        for edge in self.edges:
            if edge.from_id not in node_ids:
                raise ValueError(f"edge.from references unknown node: {edge.from_id}")
            if edge.to_id not in node_ids and edge.to_id != "END":
                raise ValueError(f"edge.to references unknown node: {edge.to_id}")
            outgoing_edges.setdefault(edge.from_id, []).append(edge)
            incoming_edges.setdefault(edge.to_id, []).append(edge)

        for node in self.nodes:
            artifact_config = node.config.get("artifact")
            if isinstance(artifact_config, dict) and "writeback" in artifact_config:
                _validate_writeback_channel_config("artifact", artifact_config["writeback"], f"node {node.id} artifact")

            executor_config = node.config.get("executor")
            if executor_config is not None:
                if not isinstance(executor_config, dict):
                    raise ValueError(f"node {node.id} executor must be an object")
                executor_kind = executor_config.get("kind")
                if executor_kind not in {"cli", "api"}:
                    raise ValueError(f"node {node.id} executor.kind must be one of ['api', 'cli']")

            if node.type != "control.parallel":
                continue

            branches = node.config.get("branches", [])
            barrier_id = node.config.get("barrier")
            if not isinstance(branches, list) or not branches:
                raise ValueError(f"parallel node {node.id} must define a non-empty config.branches list")
            if len(branches) != len(set(branches)):
                raise ValueError(f"parallel node {node.id} branches must be unique")
            if not isinstance(barrier_id, str) or barrier_id not in node_ids:
                raise ValueError(f"parallel node {node.id} must define config.barrier referencing an existing node")

            barrier_node = nodes_by_id[barrier_id]
            if barrier_node.type != "control.barrier":
                raise ValueError(f"parallel node {node.id} barrier must reference a control.barrier node")
            if outgoing_edges.get(node.id):
                raise ValueError(f"parallel node {node.id} must not define outgoing edges; barrier continues the flow")

            for branch_id in branches:
                if branch_id not in node_ids:
                    raise ValueError(f"parallel node {node.id} branch references unknown node: {branch_id}")
                if branch_id == node.id or branch_id == barrier_id:
                    raise ValueError(f"parallel node {node.id} branch cannot reference itself or its barrier")
                if outgoing_edges.get(branch_id):
                    raise ValueError(
                        f"parallel branch node {branch_id} must not define outgoing edges in Phase 1 fan-out mode"
                    )

        for node in self.nodes:
            if node.type != "control.barrier":
                continue

            source_parallel = node.config.get("source_parallel")
            if source_parallel is not None:
                if source_parallel not in node_ids:
                    raise ValueError(f"barrier node {node.id} source_parallel references unknown node: {source_parallel}")
                if nodes_by_id[source_parallel].type != "control.parallel":
                    raise ValueError(f"barrier node {node.id} source_parallel must reference a control.parallel node")
            if incoming_edges.get(node.id):
                raise ValueError(
                    f"barrier node {node.id} must not define incoming edges in Phase 1 fan-out mode"
                )
        return self


class RuntimeRequest(BaseModel):
    request_id: str = Field(default_factory=lambda: f"req-{uuid4().hex[:12]}")
    workflow: WorkflowDefinition
    input: Dict[str, Any] = Field(default_factory=dict)
    context: Dict[str, Any] = Field(default_factory=dict)
    memory_scope: Literal["session", "user", "global"] = "session"
    execution_mode: Literal["sync", "async"] = "sync"
    idempotency_key: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def apply_idempotency_key(self) -> "RuntimeRequest":
        if self.idempotency_key is None:
            self.idempotency_key = self.request_id
        validate_writeback_bundle(self.metadata.get("writeback"), "runtime request metadata")
        return self


class RunRecord(BaseModel):
    run_id: str
    request_id: str
    workflow_id: str
    status: Literal["accepted", "validated", "running", "succeeded", "failed", "cancelled", "checkpointed", "waiting"]
    started_at: datetime
    ended_at: Optional[datetime] = None
    entrypoint: str
    current_step_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class WritebackRef(BaseModel):
    channel: Literal["artifact", "checkpoint"]
    target: Literal["host", "docs", "memory", "graph"] = "host"
    mode: Literal["reference", "inline"] = "reference"
    host_action: Literal["persist_artifact_ref", "persist_checkpoint_ref"]
    content_field: Optional[str] = None
    resume_supported: Optional[bool] = None
    next_node_id: Optional[str] = None


class ArtifactRef(BaseModel):
    artifact_id: str
    kind: Literal["text", "json", "document", "report", "patch", "log"] = "json"
    name: str
    uri: str
    producer_step_id: str
    writeback: WritebackRef
    metadata: Dict[str, Any] = Field(default_factory=dict)


class CheckpointState(BaseModel):
    current_node_id: Optional[str] = None
    next_node_id: Optional[str] = None
    visited_nodes: List[str] = Field(default_factory=list)
    last_output: Dict[str, Any] = Field(default_factory=dict)
    state: Dict[str, Any] = Field(default_factory=dict)


class CheckpointRef(BaseModel):
    checkpoint_id: str
    run_id: str
    step_id: Optional[str] = None
    state_ref: Optional[str] = None
    state: CheckpointState
    created_at: datetime = Field(default_factory=utc_now)
    writeback: WritebackRef
    metadata: Dict[str, Any] = Field(default_factory=dict)


class StepRecord(BaseModel):
    step_id: str
    run_id: str
    node_id: str
    status: Literal["pending", "running", "succeeded", "failed", "skipped", "cancelled"]
    index: int
    input: Dict[str, Any] = Field(default_factory=dict)
    output: Dict[str, Any] = Field(default_factory=dict)
    trace: List[Dict[str, Any]] = Field(default_factory=list)
    artifacts: List[ArtifactRef] = Field(default_factory=list)
    error: Optional[Dict[str, Any]] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RunResult(BaseModel):
    run: RunRecord
    steps: List[StepRecord] = Field(default_factory=list)
    final_output: Dict[str, Any] = Field(default_factory=dict)
    trace: List[Dict[str, Any]] = Field(default_factory=list)
    artifacts: List[ArtifactRef] = Field(default_factory=list)
    checkpoints: List[CheckpointRef] = Field(default_factory=list)
    errors: List[Dict[str, Any]] = Field(default_factory=list)


class WorkflowValidationResult(BaseModel):
    valid: bool
    workflow_id: Optional[str] = None
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class ResumeRequest(BaseModel):
    checkpoint_id: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RunSummary(BaseModel):
    run_id: str
    request_id: str
    workflow_id: str
    status: Literal["accepted", "validated", "running", "succeeded", "failed", "cancelled", "checkpointed", "waiting"]
    started_at: datetime
    ended_at: Optional[datetime] = None
    current_step_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class WorkflowGraphNode(BaseModel):
    id: str
    label: str
    kind: str
    type: str
    entrypoint: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)


class WorkflowGraphEdge(BaseModel):
    from_id: str
    to_id: str
    type: str
    condition: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class WorkflowGraph(BaseModel):
    workflow_id: str
    name: str
    entrypoint: str
    nodes: List[WorkflowGraphNode] = Field(default_factory=list)
    edges: List[WorkflowGraphEdge] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RunGraphNode(BaseModel):
    id: str
    label: str
    kind: str
    type: str
    status: Literal["pending", "running", "succeeded", "failed", "skipped", "cancelled", "not_started"] = "not_started"
    step_id: Optional[str] = None
    index: Optional[int] = None
    entrypoint: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RunGraph(BaseModel):
    run_id: str
    workflow_id: str
    status: str
    entrypoint: str
    nodes: List[RunGraphNode] = Field(default_factory=list)
    edges: List[WorkflowGraphEdge] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ChatMessage(BaseModel):
    message_id: str = Field(default_factory=lambda: f"msg-{uuid4().hex[:12]}")
    role: Literal["system", "user", "assistant"]
    content: str
    created_at: datetime = Field(default_factory=utc_now)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ChatSessionRecord(BaseModel):
    session_id: str
    title: Optional[str] = None
    status: Literal["active", "archived"] = "active"
    executor: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ChatSession(BaseModel):
    session: ChatSessionRecord
    messages: List[ChatMessage] = Field(default_factory=list)


class ChatSessionCreateRequest(BaseModel):
    title: Optional[str] = None
    executor: Dict[str, Any]
    system_prompt: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_executor(self) -> "ChatSessionCreateRequest":
        if not isinstance(self.executor, dict):
            raise ValueError("executor must be an object")
        kind = self.executor.get("kind")
        if kind not in {"cli", "api"}:
            raise ValueError("executor.kind must be one of ['api', 'cli']")
        return self


class ChatMessageRequest(BaseModel):
    content: str
    context: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ChatTurnResult(BaseModel):
    session: ChatSessionRecord
    user_message: ChatMessage
    assistant_message: ChatMessage
    response_text: str
    raw_output: Dict[str, Any] = Field(default_factory=dict)
    trace: List[Dict[str, Any]] = Field(default_factory=list)
