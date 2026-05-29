"""Inbox API — Story 7.2 (AC5) + workspace-driven aggregator (2026-05-19).

GET /api/templates/{template_id}/inbox
  Returns groups (from group_roster) and agent_dms (from agent_roster) aggregated
  from the template spec + live run state.  P95 ≤ 200ms on mock data.

GET /api/inbox?workspace_id=…
  Returns groups created via /api/groups (file-backed in .shadowflow/groups/)
  filtered by workspace. This is the path used by /chat when no template
  context is active — i.e. for groups created by run-session auto-save.

GET /api/templates
  Returns a lightweight list of all available templates for the switcher.

History
-------
2026-05-19 — Added /api/inbox endpoint. Previously the chat page only knew
how to fetch groups from a template's `group_roster`, so groups created
ad-hoc from run-session never appeared in /chat. The new endpoint reads
directly from the groups storage layer added in Step 4.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter()

# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------

InboxStatus = Literal["running", "blocked", "idle", "pending_approval"]


class GroupItem(BaseModel):
    id: str
    name: str
    templateId: str
    status: InboxStatus = "idle"
    unreadCount: int = 0
    pendingApprovalsCount: int = 0
    lastMessage: str = ""
    lastActivityAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metrics: Dict[str, Any] = Field(default_factory=dict)
    # 2026-05-28 · Stream L · 群设置 modal 用到的额外字段（缺失即省略）
    announcement: Optional[str] = None
    agent_ids: List[str] = Field(default_factory=list)
    created_at: Optional[str] = None


class AgentDMItem(BaseModel):
    agentId: str
    agentName: str
    kind: str = "local"
    status: InboxStatus = "idle"
    unreadCount: int = 0
    lastMessage: str = ""
    lastActivityAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class InboxData(BaseModel):
    groups: List[GroupItem] = Field(default_factory=list)
    agent_dms: List[AgentDMItem] = Field(default_factory=list)


class InboxResponse(BaseModel):
    data: InboxData
    meta: Dict[str, str] = Field(default_factory=dict)


class TemplateSummary(BaseModel):
    template_id: str
    name: str
    theme_color: str = "#6366F1"
    agent_roster_count: int = 0
    group_roster_count: int = 0


class TemplateListResponse(BaseModel):
    data: List[TemplateSummary]
    meta: Dict[str, str] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Aggregator
# ---------------------------------------------------------------------------


class InboxAggregator:
    """Aggregate inbox data from template spec + optional live run state."""

    def build(self, template_id: str, template_entry: Dict[str, Any]) -> InboxData:
        """Build InboxData from a loaded template entry dict (spec + source)."""
        spec = template_entry["spec"]
        now = datetime.now(timezone.utc).isoformat()

        groups: List[GroupItem] = []
        for g in spec.group_roster:
            groups.append(
                GroupItem(
                    id=g.id,
                    name=g.name,
                    templateId=template_id,
                    status="idle",
                    unreadCount=0,
                    pendingApprovalsCount=0,
                    lastMessage="",
                    lastActivityAt=now,
                )
            )

        agent_dms: List[AgentDMItem] = []
        for a in spec.agent_roster:
            agent_dms.append(
                AgentDMItem(
                    agentId=a.id,
                    agentName=a.name,
                    kind="local",
                    status="idle",
                    unreadCount=0,
                    lastMessage="",
                    lastActivityAt=now,
                )
            )

        return InboxData(groups=groups, agent_dms=agent_dms)


_aggregator: Optional[InboxAggregator] = None


def get_aggregator() -> InboxAggregator:
    global _aggregator
    if _aggregator is None:
        _aggregator = InboxAggregator()
    return _aggregator


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/api/templates/{template_id}/inbox", response_model=InboxResponse)
async def get_inbox(template_id: str) -> InboxResponse:
    """Return inbox groups + agent DMs for a template. P95 ≤ 200ms."""
    from shadowflow.server import _get_template  # avoid circular import at module level

    entry = _get_template(template_id)
    if entry is None:
        # Return empty inbox for unknown templates (graceful degradation)
        return InboxResponse(
            data=InboxData(),
            meta={"trace_id": uuid4().hex, "timestamp": datetime.now(timezone.utc).isoformat()},
        )

    inbox_data = get_aggregator().build(template_id, entry)
    return InboxResponse(
        data=inbox_data,
        meta={"trace_id": uuid4().hex, "timestamp": datetime.now(timezone.utc).isoformat()},
    )


@router.get("/api/inbox", response_model=InboxResponse)
async def get_workspace_inbox(
    workspace_id: Optional[str] = Query(default=None),
) -> InboxResponse:
    """Workspace-driven inbox: list groups from .shadowflow/groups/*.json.

    Replaces the template-roster path for ad-hoc groups (e.g. those created
    by run-session auto-save). Falls back to empty result when the groups
    directory is missing or contains no matching records.
    """
    from shadowflow.api.groups import list_groups  # local import avoids cycles

    records = list_groups(workspace_id)
    groups: List[GroupItem] = []
    for rec in records:
        try:
            # Last activity = last message timestamp if any, else created_at
            messages = rec.get("messages", []) or []
            last_msg = messages[-1] if messages else None
            last_activity = (
                (last_msg.get("timestamp") if isinstance(last_msg, dict) else None)
                or rec.get("created_at")
                or datetime.now(timezone.utc).isoformat()
            )
            last_message_preview = (
                last_msg.get("content", "")[:140] if isinstance(last_msg, dict) else ""
            )
            groups.append(
                GroupItem(
                    id=rec.get("group_id", ""),
                    name=rec.get("name", ""),
                    templateId=rec.get("template_id", "") or "",
                    status="idle",
                    unreadCount=0,
                    pendingApprovalsCount=0,
                    lastMessage=last_message_preview,
                    lastActivityAt=last_activity,
                    metrics={"members": len(rec.get("agent_ids", []) or []),
                             "activeRuns": 0,
                             "pendingApprovalsCount": 0,
                             "costToday": 0},
                    # 2026-05-28 · Stream L · 群设置 modal 用：透传 record 字段
                    announcement=rec.get("announcement") or None,
                    agent_ids=list(rec.get("agent_ids", []) or []),
                    created_at=rec.get("created_at") or None,
                )
            )
        except Exception:
            # Defensive: skip a malformed record rather than 500 the whole list
            continue

    # 2026-05-29 — 填充 agent_dms：列出该 workspace 的 agents 作为单聊入口。
    # 之前写死 []，导致 team 建好后 chat 左侧看不到任何 agent，没法单聊。
    # agent 记录来自 .shadowflow/agents/*.json（quick-hire / 落库 agent）。
    agent_dms: List[AgentDMItem] = []
    try:
        from shadowflow.api.agents import _list_agents  # local import avoids cycles

        for arec in _list_agents():
            rec_ws = arec.get("workspace_id")
            # 与 group 同款严格 scoping：传了 workspace_id 就只收相等的；
            # 不传（管理/无 scope 场景）则全收。
            if workspace_id is not None and rec_ws != workspace_id:
                continue
            agent_dms.append(
                AgentDMItem(
                    agentId=arec.get("agent_id", ""),
                    agentName=arec.get("name") or arec.get("agent_id", "") or "Agent",
                    kind=arec.get("source") or "local",
                    status=arec.get("status") if arec.get("status") in ("running", "blocked", "idle", "pending_approval") else "idle",
                    unreadCount=0,
                    lastMessage=(arec.get("soul") or "")[:140],
                    lastActivityAt=arec.get("created_at") or datetime.now(timezone.utc).isoformat(),
                )
            )
    except Exception:
        # agent 列表失败不应阻塞 inbox 主体（groups 仍可用）。
        agent_dms = []

    return InboxResponse(
        data=InboxData(groups=groups, agent_dms=agent_dms),
        meta={
            "trace_id": uuid4().hex,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "workspace-groups",
        },
    )


@router.get("/api/templates", response_model=TemplateListResponse)
async def list_templates() -> TemplateListResponse:
    """Return lightweight list of all templates for the TemplateSwitcher."""
    from shadowflow.server import _list_templates  # avoid circular import

    entries = _list_templates()
    summaries: List[TemplateSummary] = []
    for entry in entries:
        spec = entry["spec"]
        summaries.append(
            TemplateSummary(
                template_id=spec.template_id,
                name=spec.name,
                theme_color=spec.theme_color,
                agent_roster_count=len(spec.agent_roster),
                group_roster_count=len(spec.group_roster),
            )
        )
    return TemplateListResponse(
        data=summaries,
        meta={"trace_id": uuid4().hex, "timestamp": datetime.now(timezone.utc).isoformat()},
    )
