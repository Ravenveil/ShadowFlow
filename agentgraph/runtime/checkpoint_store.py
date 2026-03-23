from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from agentgraph.runtime.contracts import CheckpointRef, utc_now


WritebackTarget = Literal["host", "docs", "memory", "graph"]


class StoredCheckpointRecord(BaseModel):
    checkpoint_id: str
    run_id: str
    step_id: Optional[str] = None
    target: WritebackTarget
    location: str
    state_ref: Optional[str] = None
    next_node_id: Optional[str] = None
    resume_supported: bool = False
    stored_at: datetime = Field(default_factory=utc_now)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class BaseCheckpointStore:
    def put(self, checkpoint: CheckpointRef) -> StoredCheckpointRecord:
        raise NotImplementedError

    def get(self, checkpoint_id: str) -> Optional[CheckpointRef]:
        raise NotImplementedError

    def get_record(self, checkpoint_id: str) -> Optional[StoredCheckpointRecord]:
        raise NotImplementedError

    def list_run(self, run_id: str) -> List[StoredCheckpointRecord]:
        raise NotImplementedError


class InMemoryCheckpointStore(BaseCheckpointStore):
    def __init__(self) -> None:
        self._checkpoints: Dict[str, CheckpointRef] = {}
        self._records: Dict[str, StoredCheckpointRecord] = {}

    def put(self, checkpoint: CheckpointRef) -> StoredCheckpointRecord:
        checkpoint_copy = checkpoint.model_copy(deep=True)
        target = checkpoint_copy.writeback.target
        record = StoredCheckpointRecord(
            checkpoint_id=checkpoint_copy.checkpoint_id,
            run_id=checkpoint_copy.run_id,
            step_id=checkpoint_copy.step_id,
            target=target,
            location=f"{target}://checkpoints/{checkpoint_copy.checkpoint_id}",
            state_ref=checkpoint_copy.state_ref,
            next_node_id=checkpoint_copy.writeback.next_node_id,
            resume_supported=bool(checkpoint_copy.writeback.resume_supported),
            metadata={
                **checkpoint_copy.metadata,
                "current_node_id": checkpoint_copy.state.current_node_id,
            },
        )
        self._checkpoints[checkpoint_copy.checkpoint_id] = checkpoint_copy
        self._records[checkpoint_copy.checkpoint_id] = record
        return record

    def get(self, checkpoint_id: str) -> Optional[CheckpointRef]:
        checkpoint = self._checkpoints.get(checkpoint_id)
        return checkpoint.model_copy(deep=True) if checkpoint is not None else None

    def get_record(self, checkpoint_id: str) -> Optional[StoredCheckpointRecord]:
        record = self._records.get(checkpoint_id)
        return record.model_copy(deep=True) if record is not None else None

    def list_run(self, run_id: str) -> List[StoredCheckpointRecord]:
        return [
            record.model_copy(deep=True)
            for record in self._records.values()
            if record.run_id == run_id
        ]
