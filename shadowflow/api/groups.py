"""Groups API — chat group persistence.

POST   /api/groups                          — create a new group chat
GET    /api/groups                          — list groups (filter by workspace_id)
GET    /api/groups/{id}                     — get single group
GET    /api/groups/{id}/messages?limit=N    — list recent messages
POST   /api/groups/{id}/messages            — append a message
GET    /api/groups/{id}/briefboard?date=    — per-day agent output feed

Storage: JSON files under .shadowflow/groups/{group_id}.json (mirrors
shadowflow/api/teams.py for consistency). Each group record holds its
own messages array — keeps a single-file invariant per group.

History
-------
2026-05-19 — Migrated from in-memory `_group_store` dict (Story 7.3 MVP) to
JSON-file persistence. The dict lost everything on uvicorn restart and the
inbox aggregator couldn't see groups created in run-session auto-save.
This rewrite also drops the template_id requirement so groups created
ad-hoc from a run-session blueprint (no template) persist correctly.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from shadowflow.api._limiter import limiter

router = APIRouter()


# ---------------------------------------------------------------------------
# Storage layer — mirrors teams.py for consistency
# ---------------------------------------------------------------------------

_GROUPS_DIR = Path(__file__).resolve().parents[2] / ".shadowflow" / "groups"
_GROUP_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def _validate_group_id(group_id: str) -> None:
    if not _GROUP_ID_RE.match(group_id):
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "INVALID_GROUP_ID", "message": "Invalid group_id format"}},
        )


def _groups_dir() -> Path:
    _GROUPS_DIR.mkdir(parents=True, exist_ok=True)
    return _GROUPS_DIR


def _group_path(group_id: str) -> Path:
    _validate_group_id(group_id)
    groups_root = _groups_dir().resolve()
    resolved = (groups_root / f"{group_id}.json").resolve()
    if groups_root not in resolved.parents:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "INVALID_GROUP_ID", "message": "Invalid group_id"}},
        )
    return resolved


def _save_group(record: Dict[str, Any]) -> None:
    target = _group_path(record["group_id"])
    content = json.dumps(record, default=str).encode("utf-8")
    fd, tmp_name = tempfile.mkstemp(dir=str(target.parent), prefix=".tmp-")
    try:
        os.write(fd, content)
        os.fsync(fd)
        os.close(fd)
        os.replace(tmp_name, str(target))
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            Path(tmp_name).unlink()
        except OSError:
            pass
        raise


def _load_group(group_id: str) -> Optional[Dict[str, Any]]:
    p = _group_path(group_id)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def _list_groups_records(workspace_id: Optional[str] = None) -> List[Dict[str, Any]]:
    d = _groups_dir()
    records: List[Dict[str, Any]] = []
    for p in sorted(d.glob("*.json")):
        try:
            rec = json.loads(p.read_text(encoding="utf-8"))
            if workspace_id is None:
                records.append(rec)
            else:
                rec_ws = rec.get("workspace_id")
                # Workspace_id-less legacy records match any filter (so they
                # don't vanish during migration). Only records that explicitly
                # belong to a DIFFERENT workspace are filtered out.
                if not rec_ws or rec_ws == workspace_id:
                    records.append(rec)
        except (json.JSONDecodeError, OSError):
            pass
    return records


def list_groups(workspace_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Public helper used by shadowflow.api.inbox to aggregate groups into
    the chat inbox view. Returns raw records — callers can reshape."""
    return _list_groups_records(workspace_id)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class CreateGroupRequest(BaseModel):
    # template_id / group_template_id are kept optional. Run-session
    # auto-save (Step 2 of the data-vertical plan) sends empty strings.
    template_id: str = ""
    group_template_id: str = ""
    name: str = Field(..., max_length=40)
    agent_ids: List[str] = Field(default_factory=list, max_length=50)
    member_emails: List[str] = Field(default_factory=list, max_length=50)
    policy_matrix: Dict[str, Any] = Field(default_factory=dict)
    workspace_id: Optional[str] = None
    team_id: Optional[str] = None

    @field_validator("policy_matrix")
    @classmethod
    def _validate_policy_matrix_size(cls, v: dict) -> dict:
        if len(v) > 200:
            raise ValueError("policy_matrix exceeds 200 key limit")
        return v


class GroupResponse(BaseModel):
    group_id: str
    name: str
    template_id: str
    created_at: str
    agents: List[str]
    workspace_id: Optional[str] = None
    team_id: Optional[str] = None


class MessageItem(BaseModel):
    sender_name: str
    sender_kind: str = "user"
    content: str
    timestamp: str


class PostMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=8000)
    sender_name: str = "user"
    sender_kind: str = "user"


class GroupMessagesResponse(BaseModel):
    group_id: str
    messages: List[MessageItem]


class BriefBoardEntry(BaseModel):
    agent_name: str
    agent_kind: str
    summary: str
    timestamp: str


class BriefBoardData(BaseModel):
    date: str
    entries: List[BriefBoardEntry]


class BriefBoardResponse(BaseModel):
    data: BriefBoardData


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/api/groups", response_model=GroupResponse, status_code=201)
@limiter.limit("20/minute")
async def create_group(request: Request, body: CreateGroupRequest) -> GroupResponse:
    """Create a new group chat. Persists to .shadowflow/groups/{group_id}.json."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    group_id = uuid4().hex
    created_at = datetime.now(timezone.utc).isoformat()

    record: Dict[str, Any] = {
        "group_id": group_id,
        "name": name,
        "template_id": body.template_id,
        "group_template_id": body.group_template_id,
        "agent_ids": body.agent_ids,
        "member_emails": body.member_emails,
        "policy_matrix": body.policy_matrix,
        "workspace_id": body.workspace_id,
        "team_id": body.team_id,
        "created_at": created_at,
        "messages": [],
    }
    _save_group(record)

    return GroupResponse(
        group_id=group_id,
        name=name,
        template_id=body.template_id,
        created_at=created_at,
        agents=body.agent_ids,
        workspace_id=body.workspace_id,
        team_id=body.team_id,
    )


@router.get("/api/groups")
async def list_groups_endpoint(
    workspace_id: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    """List groups, optionally filtered by workspace_id.

    Wraps records in {data, meta} envelope to match other endpoints — but
    also exposes a top-level `groups` array for the front-end's existing
    stub-compatible callers."""
    records = _list_groups_records(workspace_id)
    return {
        "data": records,
        "groups": records,  # legacy stub-compatible field
        "meta": {"count": len(records)},
    }


@router.get("/api/groups/{group_id}")
async def get_group(group_id: str) -> Dict[str, Any]:
    rec = _load_group(group_id)
    if rec is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "GROUP_NOT_FOUND", "message": f"Group {group_id!r} not found"}},
        )
    return {"data": rec, "meta": {}}


@router.get("/api/groups/{group_id}/briefboard", response_model=BriefBoardResponse)
async def get_group_briefboard(
    group_id: str,
    date: Optional[str] = Query(default=None),
) -> BriefBoardResponse:
    """Return per-agent output feed for a group on a given date.

    Aggregates run step outputs from the in-memory run store when available.
    Returns empty entries when no runs are associated with the group.
    """
    rec = _load_group(group_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Group not found: {group_id}")

    target_date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Lazy import to avoid circular dependency at module level
    try:
        from shadowflow.runtime.service import _run_store  # noqa: PLC0415

        entries: List[BriefBoardEntry] = []
        for run_id, run_data in _run_store.items():
            if run_data.get("group_id") != group_id:
                continue
            for step in run_data.get("steps", []):
                ts: str = step.get("timestamp", "")
                if ts.startswith(target_date):
                    entries.append(
                        BriefBoardEntry(
                            agent_name=step.get("agent_name", "Agent"),
                            agent_kind=step.get("agent_kind", "acp"),
                            summary=step.get("output", ""),
                            timestamp=ts,
                        )
                    )
    except (ImportError, AttributeError):
        entries = []

    return BriefBoardResponse(data=BriefBoardData(date=target_date, entries=entries))


@router.get("/api/groups/{group_id}/messages", response_model=GroupMessagesResponse)
async def get_group_messages(
    group_id: str,
    limit: int = Query(default=20, ge=1, le=200),
) -> GroupMessagesResponse:
    """Return recent messages for a group, newest last (insertion order)."""
    rec = _load_group(group_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Group not found: {group_id}")

    messages: List[Dict[str, Any]] = rec.get("messages", [])
    # Return the last `limit` items in chronological order.
    sliced = messages[-limit:]
    return GroupMessagesResponse(
        group_id=group_id,
        messages=[MessageItem(**m) for m in sliced],
    )


@router.post(
    "/api/groups/{group_id}/messages",
    response_model=MessageItem,
    status_code=201,
)
@limiter.limit("60/minute")
async def post_group_message(
    request: Request,
    group_id: str,
    body: PostMessageRequest,
    background_tasks: BackgroundTasks,
) -> MessageItem:
    """Append a message to a group's persisted message log.

    Atomic w.r.t. file IO via _save_group's tempfile-replace pattern. Not
    safe under concurrent writes to the SAME group from multiple processes;
    that's acceptable for the current single-uvicorn-process deployment.

    Side effect — Stream C chat→agent bridge: when the incoming message is
    from a user (``sender_kind == 'user'``) and the group has agent members,
    we schedule an async dispatch via ``BackgroundTasks`` that calls the
    configured BYOK LLM and appends the agent reply back into this group's
    message log. The dispatch failures are isolated — they cannot affect
    the persistence success of this endpoint.
    """
    rec = _load_group(group_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Group not found: {group_id}")

    msg = {
        "sender_name": body.sender_name,
        "sender_kind": body.sender_kind,
        "content": body.content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    messages = rec.get("messages", [])
    messages.append(msg)
    rec["messages"] = messages
    _save_group(rec)

    # Stream C bridge: only dispatch on user-originated messages. Agent /
    # system messages should never trigger another agent reply (would loop).
    if body.sender_kind == "user" and rec.get("agent_ids"):
        from shadowflow.api._chat_bridge import dispatch_agent_reply  # noqa: PLC0415

        background_tasks.add_task(dispatch_agent_reply, group_id)

    return MessageItem(**msg)
