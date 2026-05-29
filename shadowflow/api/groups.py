"""Groups API — chat group persistence.

POST   /api/groups                                       — create a new group chat
GET    /api/groups                                       — list groups (filter by workspace_id)
GET    /api/groups/{id}                                  — get single group
GET    /api/groups/{id}/messages?limit=N                 — list recent messages
POST   /api/groups/{id}/messages                         — append a message (optional reply_to)
GET    /api/groups/{id}/briefboard?date=                 — per-day agent output feed
GET    /api/groups/{id}/messages/{msg_id}/thread         — thread view: source + replies

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

import asyncio
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
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
                # 2026-05-28 — strict scoping. Previously `not rec_ws` was
                # treated as a wildcard so legacy / fixture records with
                # workspace_id=null bled into every workspace's chat list.
                # Now an explicit workspace_id filter only matches records
                # whose workspace_id equals it; null / missing records are
                # excluded. To see those run an unscoped list (no query).
                if rec_ws == workspace_id:
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
    # Stream G — thread reply support. Stored on each message; nullable when the
    # message is a top-level post (not a reply). Carrying the source message_id
    # lets us query a thread via /api/groups/{gid}/messages/{mid}/thread.
    message_id: Optional[str] = None
    reply_to: Optional[str] = None
    # Stream M 2026-05-29 — message-level actions (消息悬浮工具栏接后端).
    #   reactions: emoji → [user_id]（去重；空 emoji 项会被删除）
    #   pinned:    是否被置顶
    # 老消息没有这两个字段时 Pydantic 用默认值，向后兼容。
    reactions: Optional[Dict[str, List[str]]] = None
    pinned: bool = False


class PostMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=8000)
    sender_name: str = "user"
    sender_kind: str = "user"
    # Stream G — optional thread anchor. When provided, this message is a reply
    # to the message whose `message_id` equals `reply_to`.
    reply_to: Optional[str] = None


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
    x_llm_key: Optional[str] = Header(None, alias="X-LLM-Key"),
    x_llm_provider: Optional[str] = Header(None, alias="X-LLM-Provider"),
    x_llm_model: Optional[str] = Header(None, alias="X-LLM-Model"),
) -> MessageItem:
    """Append a message to a group's persisted message log.

    Atomic w.r.t. file IO via _save_group's tempfile-replace pattern. Not
    safe under concurrent writes to the SAME group from multiple processes;
    that's acceptable for the current single-uvicorn-process deployment.

    Side effect — Stream C chat→agent bridge: when the incoming message is
    from a user (``sender_kind == 'user'``) and the group has agent members,
    we schedule an async dispatch via ``BackgroundTasks`` that calls the
    configured BYOK LLM and appends agent replies back into this group's
    message log. The dispatch failures are isolated — they cannot affect
    the persistence success of this endpoint.

    2026-05-29 — Forward the frontend BYOK credentials (``X-LLM-*`` headers,
    same as ``/api/chat/completions``) into the background dispatch so the
    group agent can reply using the key configured in the browser, not only a
    server-side env var. ``dispatch_agent_reply`` falls back to env keys when
    these are absent.
    """
    rec = _load_group(group_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Group not found: {group_id}")

    msg = {
        "sender_name": body.sender_name,
        "sender_kind": body.sender_kind,
        "content": body.content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        # Stream G — give every message a stable id so it can be referenced by
        # future replies. Existing records without `message_id` are still served
        # back via get_group_messages (Pydantic treats the field as Optional).
        "message_id": uuid4().hex,
        "reply_to": body.reply_to,
    }
    messages = rec.get("messages", [])
    messages.append(msg)
    rec["messages"] = messages
    _save_group(rec)

    # Stream C bridge: only dispatch on user-originated messages. Agent /
    # system messages should never trigger another agent reply (would loop).
    if body.sender_kind == "user" and rec.get("agent_ids"):
        from shadowflow.api._chat_bridge import (  # noqa: PLC0415
            build_byok_override,
            dispatch_agent_reply,
        )

        byok_override = build_byok_override(x_llm_provider, x_llm_key, x_llm_model)
        background_tasks.add_task(dispatch_agent_reply, group_id, byok_override)

    return MessageItem(**msg)


# ---------------------------------------------------------------------------
# 2026-05-29 — Group chat SSE: real-time push of async agent replies.
# Mirrors stream_approval_events / stream_run_events. Lets the browser see the
# _chat_bridge fan-out replies the moment they land, instead of polling.
# ---------------------------------------------------------------------------


@router.get("/api/groups/{group_id}/events")
async def stream_group_events(group_id: str, request: Request) -> StreamingResponse:
    """SSE stream of a group's live events.

    Events emitted (``event:`` line → ``data:`` JSON):
      agent.message  — an agent reply was appended to the group
      system.notice  — a bridge/system notice was appended
      agent.typing   — an agent is composing a reply (optional UX hint)

    Keepalive comments every 15s keep the connection open through proxies.
    """
    if _load_group(group_id) is None:
        raise HTTPException(status_code=404, detail=f"Group not found: {group_id}")

    from shadowflow.api._group_events import subscribe, unsubscribe  # noqa: PLC0415

    async def _generate():
        q = subscribe(group_id)
        try:
            yield ": connected\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(q.get(), timeout=15.0)
                    event_type = event.get("type", "message")
                    data = json.dumps(event.get("data", {}), default=str)
                    yield f"event: {event_type}\ndata: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            unsubscribe(group_id, q)

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Stream M 2026-05-29 — message-level actions: reactions + pin
# （消息悬浮工具栏「反应」「Pin」接后端；翻译/AI改写/转发见批 2）
# ---------------------------------------------------------------------------


class ReactionRequest(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=16)
    # auth 未落地前 user_id 走前端传入，默认 anonymous（与 user-settings 一致）
    user_id: str = "anonymous"


class PinRequest(BaseModel):
    # None = toggle（不传就翻转）；显式 true/false = 直接设定
    pinned: Optional[bool] = None


def _message_not_found(message_id: str) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={"error": {"code": "MESSAGE_NOT_FOUND", "message": f"Message {message_id!r} not found"}},
    )


def _find_message(rec: Dict[str, Any], message_id: str) -> Optional[Dict[str, Any]]:
    for m in rec.get("messages", []):
        if m.get("message_id") == message_id:
            return m
    return None


@router.post("/api/groups/{group_id}/messages/{message_id}/reactions")
@limiter.limit("120/minute")
async def toggle_reaction(
    request: Request, group_id: str, message_id: str, body: ReactionRequest
) -> Dict[str, Any]:
    """Toggle one emoji reaction by one user on a message.

    Idempotent toggle: if the user already reacted with this emoji, the
    reaction is removed; otherwise it is added. Empty emoji buckets are
    pruned so the stored map stays clean.
    """
    rec = _load_group(group_id)
    if rec is None:
        raise _group_not_found(group_id)
    target = _find_message(rec, message_id)
    if target is None:
        raise _message_not_found(message_id)

    reactions: Dict[str, List[str]] = dict(target.get("reactions") or {})
    users = list(reactions.get(body.emoji, []))
    if body.user_id in users:
        users.remove(body.user_id)
    else:
        users.append(body.user_id)
    if users:
        reactions[body.emoji] = users
    else:
        reactions.pop(body.emoji, None)
    target["reactions"] = reactions
    _save_group(rec)
    return _envelope({"message_id": message_id, "reactions": reactions})


@router.post("/api/groups/{group_id}/messages/{message_id}/pin")
@limiter.limit("120/minute")
async def pin_message(
    request: Request, group_id: str, message_id: str, body: PinRequest
) -> Dict[str, Any]:
    """Pin or unpin a message. Body `pinned` omitted → toggle current state."""
    rec = _load_group(group_id)
    if rec is None:
        raise _group_not_found(group_id)
    target = _find_message(rec, message_id)
    if target is None:
        raise _message_not_found(message_id)

    new_val = (not bool(target.get("pinned", False))) if body.pinned is None else body.pinned
    target["pinned"] = new_val
    _save_group(rec)
    return _envelope({"message_id": message_id, "pinned": new_val})


# ---------------------------------------------------------------------------
# Stream G — thread view endpoint
# ---------------------------------------------------------------------------


class ThreadViewData(BaseModel):
    source_message: MessageItem
    replies: List[MessageItem]


class ThreadViewResponse(BaseModel):
    data: ThreadViewData
    meta: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Stream K — group settings (group metadata + per-user preferences)
# ---------------------------------------------------------------------------


def _envelope(data: Any, **meta: Any) -> Dict[str, Any]:
    """Standard response envelope (mirrors teams.py / workspaces.py)."""
    return {"data": data, "meta": meta}


def _group_not_found(group_id: str) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={"error": {"code": "GROUP_NOT_FOUND", "message": f"Group {group_id!r} not found"}},
    )


class PatchGroupRequest(BaseModel):
    """Group-level metadata patch payload.

    All fields are optional — only the provided fields are updated. Empty
    JSON body is a no-op (still bumps `updated_at`). Future expansion can
    add avatar, member_emails, etc.
    """

    name: Optional[str] = Field(None, min_length=1, max_length=120)
    announcement: Optional[str] = Field(None, max_length=2000)


class UserGroupSetting(BaseModel):
    """Per-user-per-group preferences.

    Stored under ``record["user_settings"][user_id]`` in the group's JSON file.
    Until auth lands, ``user_id`` comes from a query parameter and defaults to
    ``"anonymous"`` — see TODO at the bottom of this module.
    """

    muted: bool = False
    pinned: bool = False
    folded: bool = False
    show_nickname: bool = True
    my_nickname: Optional[str] = Field(None, max_length=80)


@router.patch("/api/groups/{group_id}")
async def patch_group(group_id: str, body: PatchGroupRequest) -> Dict[str, Any]:
    """Update group-level metadata (name / announcement).

    Tolerant of legacy records that lack the ``announcement`` field — they
    pick it up on the first PATCH that touches that field.
    """
    record = _load_group(group_id)
    if record is None:
        raise _group_not_found(group_id)

    if body.name is not None:
        record["name"] = body.name
    if body.announcement is not None:
        record["announcement"] = body.announcement
    record["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save_group(record)
    return _envelope(record)


@router.get("/api/groups/{group_id}/user-settings")
async def get_user_group_settings(
    group_id: str,
    user_id: str = Query(default="anonymous", max_length=120),
) -> Dict[str, Any]:
    """Return the requesting user's preferences for this group.

    Defaults to a clean ``UserGroupSetting()`` when the user has never saved
    settings for this group — so the FE always gets a complete shape.
    """
    record = _load_group(group_id)
    if record is None:
        raise _group_not_found(group_id)

    all_settings: Dict[str, Any] = record.get("user_settings", {})
    setting = all_settings.get(user_id, UserGroupSetting().model_dump())
    return _envelope(setting)


@router.put("/api/groups/{group_id}/user-settings")
async def put_user_group_settings(
    group_id: str,
    body: UserGroupSetting,
    user_id: str = Query(default="anonymous", max_length=120),
) -> Dict[str, Any]:
    """Whole-record replace of the requesting user's preferences for this group.

    Matches the simple PUT semantics used by PolicyMatrix / workflow endpoints
    — the FE sends the full shape every time.
    """
    record = _load_group(group_id)
    if record is None:
        raise _group_not_found(group_id)

    all_settings: Dict[str, Any] = record.setdefault("user_settings", {})
    all_settings[user_id] = body.model_dump()
    record["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save_group(record)
    return _envelope(body.model_dump())


# TODO(stream-k): swap query-param `user_id` for an authenticated principal
# once auth lands. The persisted user_settings dict is forward-compatible —
# real user_ids just become the new keys; "anonymous" entries from this MVP
# phase can be migrated or dropped during the auth cut-over.


@router.get(
    "/api/groups/{group_id}/messages/{message_id}/thread",
    response_model=ThreadViewResponse,
)
async def get_message_thread(group_id: str, message_id: str) -> ThreadViewResponse:
    """Return the thread view for a message.

    Response shape: ``{ data: { source_message, replies: [...] }, meta: {} }``
    where ``replies`` is every message whose ``reply_to`` equals ``message_id``,
    in chronological order. 404 when no message with that id exists in the
    group's persisted message log.
    """
    rec = _load_group(group_id)
    if rec is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "GROUP_NOT_FOUND", "message": f"Group {group_id!r} not found"}},
        )

    messages: List[Dict[str, Any]] = rec.get("messages", [])
    source: Optional[Dict[str, Any]] = next(
        (m for m in messages if m.get("message_id") == message_id), None
    )
    if source is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "MESSAGE_NOT_FOUND",
                    "message": f"Message {message_id!r} not found in group {group_id!r}",
                }
            },
        )

    replies = [m for m in messages if m.get("reply_to") == message_id]
    # `messages` is already insertion-ordered (chronological); preserve that.

    return ThreadViewResponse(
        data=ThreadViewData(
            source_message=MessageItem(**source),
            replies=[MessageItem(**r) for r in replies],
        ),
        meta={"count": len(replies)},
    )
