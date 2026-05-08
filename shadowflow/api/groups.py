"""Groups API — Story 7.3 (AC3 backend) / Story 7.5 (AC4 briefboard).

POST /api/groups       — create a new group chat from a group template.
GET  /api/groups/{id}/briefboard?date= — per-day agent output feed.

Storage: in-memory dict keyed by shadowflow/groups/{group_id}/meta (no-DB convention).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from shadowflow.api._limiter import limiter

router = APIRouter()

# In-memory store — keys follow shadowflow/groups/{group_id}/meta convention
_group_store: Dict[str, Dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class CreateGroupRequest(BaseModel):
    template_id: str
    group_template_id: str
    name: str = Field(..., max_length=40)
    agent_ids: List[str] = Field(default_factory=list, max_length=50)
    member_emails: List[str] = Field(default_factory=list, max_length=50)
    policy_matrix: Dict[str, Any] = Field(default_factory=dict)

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


class MessageItem(BaseModel):
    sender_name: str
    sender_kind: str
    content: str
    timestamp: str


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
    """Create a new group chat.

    Validates:
    - name is non-empty (400)
    - template_id exists (404)
    """
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    # Lazy import to avoid circular dependency at module level
    from shadowflow.server import _get_template  # noqa: PLC0415

    if _get_template(body.template_id) is None:
        raise HTTPException(
            status_code=404, detail=f"Template not found: {body.template_id}"
        )

    group_id = uuid4().hex
    created_at = datetime.now(timezone.utc).isoformat()

    meta: Dict[str, Any] = {
        "group_id": group_id,
        "name": name,
        "template_id": body.template_id,
        "group_template_id": body.group_template_id,
        "agent_ids": body.agent_ids,
        "member_emails": body.member_emails,
        "policy_matrix": body.policy_matrix,
        "created_at": created_at,
    }
    _group_store[f"shadowflow/groups/{group_id}/meta"] = meta

    return GroupResponse(
        group_id=group_id,
        name=name,
        template_id=body.template_id,
        created_at=created_at,
        agents=body.agent_ids,
    )


@router.get("/api/groups/{group_id}/briefboard", response_model=BriefBoardResponse)
async def get_group_briefboard(
    group_id: str,
    date: Optional[str] = Query(default=None),
) -> BriefBoardResponse:
    """Return per-agent output feed for a group on a given date.

    MVP: aggregates run step outputs from the in-memory run store.
    Returns empty entries when no runs are associated with the group.
    """
    meta_key = f"shadowflow/groups/{group_id}/meta"
    if meta_key not in _group_store:
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
    limit: int = Query(default=3, ge=1, le=50),
) -> GroupMessagesResponse:
    """Return recent messages for a group (MVP: from in-memory group store).

    Returns empty list when no messages are recorded — callers must handle this gracefully.
    """
    meta_key = f"shadowflow/groups/{group_id}/meta"
    if meta_key not in _group_store:
        raise HTTPException(status_code=404, detail=f"Group not found: {group_id}")

    # MVP: no real chat DB yet — messages come from run steps in Phase 2.
    messages: List[MessageItem] = _group_store[meta_key].get("messages", [])
    return GroupMessagesResponse(
        group_id=group_id,
        messages=messages[:limit],
    )
