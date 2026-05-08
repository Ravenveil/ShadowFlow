"""Inbox API — Story 7.2 (AC5).

GET /api/templates/{template_id}/inbox
  Returns groups (from group_roster) and agent_dms (from agent_roster) aggregated
  from the template spec + live run state.  P95 ≤ 200ms on mock data.

GET /api/templates
  Returns a lightweight list of all available templates for the switcher.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException
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
