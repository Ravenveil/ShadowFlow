from __future__ import annotations

import urllib.error
import urllib.request
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from shadowflow.runtime.contracts import CheckpointRef, utc_now


WritebackTarget = Literal["host", "docs", "memory", "graph", "zerog"]


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


class ZeroGCheckpointStore(BaseCheckpointStore):
    """Checkpoint store backed by 0G KV Store via a local Node.js bridge.

    The bridge exposes:
        PUT  /kv/:key         → store value
        GET  /kv/:key         → retrieve value
        GET  /kv/list/:prefix → list keys by prefix

    Key format: shadowflow/{run_id}/{checkpoint_id}

    Because the bridge GET /kv/:key only accepts checkpoint_id (not run_id),
    we maintain a local in-memory index {checkpoint_id → run_id} populated
    during put().  This survives the process lifetime — sufficient for a single
    hackathon run session.
    """

    def __init__(self, bridge_url: str = "http://localhost:3001") -> None:
        self.bridge_url = bridge_url.rstrip("/")
        # local index: checkpoint_id → run_id  (populated by put)
        self._run_index: Dict[str, str] = {}

    # ------------------------------------------------------------------
    # Internal HTTP helpers
    # ------------------------------------------------------------------

    def _http_put(self, key: str, value: str) -> None:
        import json as _json
        body = _json.dumps({"value": value}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.bridge_url}/kv/{key}",
            data=body,
            method="PUT",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status not in (200, 201):
                raise RuntimeError(f"0G bridge PUT failed: {resp.status}")

    def _http_get(self, key: str) -> Optional[str]:
        try:
            req = urllib.request.Request(f"{self.bridge_url}/kv/{key}", method="GET")
            with urllib.request.urlopen(req, timeout=10) as resp:
                import json as _json
                data = _json.loads(resp.read().decode("utf-8"))
                return data.get("value")
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            raise

    def _http_list(self, prefix: str) -> List[str]:
        req = urllib.request.Request(f"{self.bridge_url}/kv/list/{prefix}", method="GET")
        with urllib.request.urlopen(req, timeout=10) as resp:
            import json as _json
            data = _json.loads(resp.read().decode("utf-8"))
            return data.get("keys", [])

    # ------------------------------------------------------------------
    # BaseCheckpointStore interface
    # ------------------------------------------------------------------

    def put(self, checkpoint: CheckpointRef) -> StoredCheckpointRecord:
        checkpoint_copy = checkpoint.model_copy(deep=True)
        cid = checkpoint_copy.checkpoint_id
        run_id = checkpoint_copy.run_id

        key = f"shadowflow/{run_id}/{cid}"
        self._http_put(key, checkpoint_copy.model_dump_json())

        # Record key
        record_key = f"shadowflow/{run_id}/_records/{cid}"
        record = StoredCheckpointRecord(
            checkpoint_id=cid,
            run_id=run_id,
            step_id=checkpoint_copy.step_id,
            target=checkpoint_copy.writeback.target,
            location=f"0g://{key}",
            state_ref=checkpoint_copy.state_ref,
            next_node_id=checkpoint_copy.writeback.next_node_id,
            resume_supported=bool(checkpoint_copy.writeback.resume_supported),
            metadata={
                **checkpoint_copy.metadata,
                "current_node_id": checkpoint_copy.state.current_node_id,
            },
        )
        self._http_put(record_key, record.model_dump_json())

        # Populate local index so get() can resolve without run_id
        self._run_index[cid] = run_id
        return record

    def get(self, checkpoint_id: str) -> Optional[CheckpointRef]:
        run_id = self._run_index.get(checkpoint_id)
        if run_id is None:
            return None
        key = f"shadowflow/{run_id}/{checkpoint_id}"
        raw = self._http_get(key)
        if raw is None:
            return None
        return CheckpointRef.model_validate_json(raw)

    def get_record(self, checkpoint_id: str) -> Optional[StoredCheckpointRecord]:
        run_id = self._run_index.get(checkpoint_id)
        if run_id is None:
            return None
        key = f"shadowflow/{run_id}/_records/{checkpoint_id}"
        raw = self._http_get(key)
        if raw is None:
            return None
        return StoredCheckpointRecord.model_validate_json(raw)

    def list_run(self, run_id: str) -> List[StoredCheckpointRecord]:
        prefix = f"shadowflow/{run_id}/_records/"
        keys = self._http_list(prefix)
        records: List[StoredCheckpointRecord] = []
        for key in keys:
            raw = self._http_get(key)
            if raw:
                records.append(StoredCheckpointRecord.model_validate_json(raw))
        return sorted(records, key=lambda r: r.stored_at)
