from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


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
        node_ids = {node.id for node in self.nodes}
        if not self.nodes:
            raise ValueError("workflow must define at least one node")
        if self.entrypoint not in node_ids:
            raise ValueError("entrypoint must reference an existing node")

        for edge in self.edges:
            if edge.from_id not in node_ids:
                raise ValueError(f"edge.from references unknown node: {edge.from_id}")
            if edge.to_id not in node_ids and edge.to_id != "END":
                raise ValueError(f"edge.to references unknown node: {edge.to_id}")
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


class ArtifactRef(BaseModel):
    artifact_id: str
    kind: Literal["text", "json", "document", "report", "patch", "log"] = "json"
    name: str
    uri: str
    producer_step_id: str
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
