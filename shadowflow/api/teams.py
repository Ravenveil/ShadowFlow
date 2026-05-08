"""Team CRUD API — Story 12.2

Endpoints:
  POST   /api/teams                — create AgentTeam
  GET    /api/teams                — list teams (filter by workspace_id)
  GET    /api/teams/{team_id}      — get single team
  PATCH  /api/teams/{team_id}      — add/remove members
  DELETE /api/teams/{team_id}      — delete team
  POST   /api/teams/{team_id}/chat — chat-driven team editing

All success responses use {data, meta} envelope.
Errors raise HTTP exceptions with {error: {code, message}} body.
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

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

_TEAMS_DIR = Path(__file__).resolve().parents[2] / ".shadowflow" / "teams"
_TEAM_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def _validate_team_id(team_id: str) -> None:
    if not _TEAM_ID_RE.match(team_id):
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "INVALID_TEAM_ID", "message": "Invalid team_id format"}},
        )


def _teams_dir() -> Path:
    _TEAMS_DIR.mkdir(parents=True, exist_ok=True)
    return _TEAMS_DIR


def _team_path(team_id: str) -> Path:
    teams_root = _teams_dir().resolve()
    resolved = (teams_root / f"{team_id}.json").resolve()
    if teams_root not in resolved.parents:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "INVALID_TEAM_ID", "message": "Invalid team_id"}},
        )
    return resolved


def _save_team(record: Dict[str, Any]) -> None:
    target = _team_path(record["team_id"])
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


def _load_team(team_id: str) -> Optional[Dict[str, Any]]:
    p = _team_path(team_id)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def _list_teams(workspace_id: Optional[str] = None) -> List[Dict[str, Any]]:
    d = _teams_dir()
    records = []
    for p in sorted(d.glob("*.json")):
        try:
            rec = json.loads(p.read_text(encoding="utf-8"))
            if workspace_id is None or rec.get("workspace_id") == workspace_id:
                records.append(rec)
        except (json.JSONDecodeError, OSError):
            pass
    return records


def _delete_team_file(team_id: str) -> None:
    p = _team_path(team_id)
    if p.exists():
        p.unlink()


def _escape_fmt_str(s: str) -> str:
    """Escape { and } in user-controlled strings to prevent format-string injection."""
    return s.replace("{", "{{").replace("}", "}}")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/teams", tags=["teams"])


def _envelope(data: Any, **meta: Any) -> Dict[str, Any]:
    return {"data": data, "meta": meta}


def _not_found(team_id: str) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={"error": {"code": "TEAM_NOT_FOUND", "message": f"Team {team_id!r} not found"}},
    )


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class CreateTeamRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str = Field("", max_length=500)
    agent_ids: List[str] = Field(..., min_length=1)
    workspace_id: str = Field("default", max_length=80)


class PatchTeamRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=500)
    add_agent_ids: List[str] = Field(default_factory=list)
    remove_agent_ids: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("", status_code=201)
async def create_team(body: CreateTeamRequest) -> Dict[str, Any]:
    """Create a new AgentTeam."""
    now = datetime.now(timezone.utc).isoformat()
    team_id = f"team-{uuid4().hex[:12]}"
    record: Dict[str, Any] = {
        "team_id": team_id,
        "name": body.name,
        "description": body.description,
        "workspace_id": body.workspace_id,
        "agent_ids": list(dict.fromkeys(body.agent_ids)),  # dedup, preserve order
        "created_at": now,
        "updated_at": now,
    }
    _save_team(record)
    return _envelope(record, created=True)


@router.get("")
async def list_teams(
    workspace_id: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """List all AgentTeams, optionally filtered by workspace."""
    records = _list_teams(workspace_id)
    return _envelope(records, total=len(records))


@router.get("/{team_id}")
async def get_team(team_id: str) -> Dict[str, Any]:
    """Get a single AgentTeam by ID."""
    _validate_team_id(team_id)
    record = _load_team(team_id)
    if record is None:
        raise _not_found(team_id)
    return _envelope(record)


@router.patch("/{team_id}")
async def patch_team(team_id: str, body: PatchTeamRequest) -> Dict[str, Any]:
    """Update team metadata or add/remove members."""
    _validate_team_id(team_id)
    record = _load_team(team_id)
    if record is None:
        raise _not_found(team_id)

    if body.name is not None:
        record["name"] = body.name
    if body.description is not None:
        record["description"] = body.description

    current_ids: List[str] = record.get("agent_ids", [])
    # Add new members (no duplicates)
    for aid in body.add_agent_ids:
        if aid not in current_ids:
            current_ids.append(aid)
    # Remove members
    remove_set = set(body.remove_agent_ids)
    current_ids = [aid for aid in current_ids if aid not in remove_set]

    record["agent_ids"] = current_ids
    record["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save_team(record)
    return _envelope(record)


@router.delete("/{team_id}", status_code=204)
async def delete_team(team_id: str) -> None:
    """Delete an AgentTeam."""
    _validate_team_id(team_id)
    record = _load_team(team_id)
    if record is None:
        raise _not_found(team_id)
    _delete_team_file(team_id)


# ---------------------------------------------------------------------------
# Workflow endpoints — Story 12-3
# ---------------------------------------------------------------------------


class TeamWorkflow(BaseModel):
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)


@router.get("/{team_id}/workflow")
async def get_team_workflow(team_id: str) -> Dict[str, Any]:
    """Get saved workflow graph for a team."""
    _validate_team_id(team_id)
    record = _load_team(team_id)
    if record is None:
        raise _not_found(team_id)
    workflow = record.get("workflow", {"nodes": [], "edges": []})
    return _envelope(workflow)


@router.put("/{team_id}/workflow")
async def put_team_workflow(team_id: str, body: TeamWorkflow) -> Dict[str, Any]:
    """Save workflow graph for a team."""
    _validate_team_id(team_id)
    record = _load_team(team_id)
    if record is None:
        raise _not_found(team_id)
    record["workflow"] = body.model_dump()
    record["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save_team(record)
    return _envelope(record["workflow"])


# ---------------------------------------------------------------------------
# Policy endpoints — Story 12-3
# ---------------------------------------------------------------------------


class TeamPolicyRequest(BaseModel):
    matrix: Dict[str, Dict[str, str]] = Field(default_factory=dict)


class TeamChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


@router.get("/{team_id}/policy")
async def get_team_policy(team_id: str) -> Dict[str, Any]:
    """Get saved policy matrix for a team."""
    _validate_team_id(team_id)
    record = _load_team(team_id)
    if record is None:
        raise _not_found(team_id)
    return _envelope(record.get("policy_matrix", {}))


@router.put("/{team_id}/policy")
async def put_team_policy(team_id: str, body: TeamPolicyRequest) -> Dict[str, Any]:
    """Save policy matrix for a team."""
    _validate_team_id(team_id)
    record = _load_team(team_id)
    if record is None:
        raise _not_found(team_id)
    record["policy_matrix"] = body.matrix
    record["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save_team(record)
    return _envelope(record["policy_matrix"])


# ---------------------------------------------------------------------------
# Chat-driven editing — user describes changes in natural language
# ---------------------------------------------------------------------------

_TEAM_EDIT_SYSTEM_PROMPT = """\
You are a Team configuration assistant. The user will describe changes to an AI agent team's configuration in natural language. You must interpret their request and output a JSON object with the fields to update.

Current team configuration:
- Name: {name}
- Description: {description}
- Agent IDs: {agent_ids}

Respond with ONLY a JSON object (no markdown, no explanation outside JSON) with this structure:
{{
  "updates": {{
    "name": "new name or null if unchanged",
    "description": "new description or null if unchanged",
    "add_agent_ids": ["agent-id-1"] or null if not adding,
    "remove_agent_ids": ["agent-id-2"] or null if not removing
  }},
  "explanation": "Brief description of what you changed (in the user's language)"
}}

Rules:
- If the user asks to rename the team, update the "name" field
- If the user asks to change the description/purpose, update the "description" field
- If the user asks to add agents/members, put their IDs in "add_agent_ids"
- If the user asks to remove agents/members, put their IDs in "remove_agent_ids"
- Set unchanged fields to null
- Keep explanation concise (1-2 sentences)
- Match the user's language (Chinese or English)
"""


@router.post("/{team_id}/chat")
async def team_chat_edit(
    team_id: str,
    body: TeamChatRequest,
    x_llm_key: Optional[str] = Header(None, alias="X-LLM-Key"),
    x_llm_provider: Optional[str] = Header(None, alias="X-LLM-Provider"),
    x_llm_model: Optional[str] = Header(None, alias="X-LLM-Model"),
) -> Dict[str, Any]:
    """Chat-driven team editing: user describes changes, LLM interprets and applies."""
    _validate_team_id(team_id)
    record = _load_team(team_id)
    if record is None:
        raise _not_found(team_id)

    if not x_llm_key:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "NO_API_KEY", "message": "X-LLM-Key header required for chat editing"}},
        )

    system_prompt = _TEAM_EDIT_SYSTEM_PROMPT.format(
        name=_escape_fmt_str(record.get("name", "")),
        description=_escape_fmt_str(record.get("description", "")),
        agent_ids=json.dumps(record.get("agent_ids", []), ensure_ascii=False),
    )

    try:
        from shadowflow.llm import LLMConfig, create_provider, ProviderType
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "LLM_UNAVAILABLE", "message": str(e)}},
        )

    # Default provider is "zhipu"; pass X-LLM-Provider header to use OpenAI/Claude/etc.
    provider_name = (x_llm_provider or "zhipu").lower()
    provider_map = {
        "zhipu": ProviderType.ZHIPU,
        "openai": ProviderType.OPENAI,
        "claude": ProviderType.CLAUDE,
        "ollama": ProviderType.OLLAMA,
        "deepseek": ProviderType.DEEPSEEK,
    }
    ptype = provider_map.get(provider_name)
    if ptype is None:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "UNKNOWN_PROVIDER", "message": f"Unknown provider: {provider_name}"}},
        )

    from shadowflow.api.chat import DEFAULT_MODELS
    model = x_llm_model or DEFAULT_MODELS.get(provider_name, "")
    if not model:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "NO_MODEL", "message": f"X-LLM-Model header required for provider '{provider_name}'"}},
        )
    config = LLMConfig(model=model, api_key=x_llm_key)

    try:
        provider = create_provider(ptype, config)
        msgs = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": body.message},
        ]
        response = await provider.chat(msgs)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail={"error": {"code": "LLM_ERROR", "message": str(e)}},
        )

    content = response.content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        lines = [l for l in lines if not l.startswith("```")]
        content = "\n".join(lines)

    try:
        result = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "LLM_PARSE_ERROR", "message": "LLM response was not valid JSON"}},
        )

    updates = result.get("updates", {}) if isinstance(result, dict) else {}
    explanation = result.get("explanation", "") if isinstance(result, dict) else ""
    applied_fields: List[str] = []

    # Validate types before applying — prevent LLM from injecting unexpected field types
    new_name = updates.get("name")
    if isinstance(new_name, str) and new_name:
        record["name"] = new_name[:120]
        applied_fields.append("name")
    new_desc = updates.get("description")
    if isinstance(new_desc, str):
        record["description"] = new_desc[:500]
        applied_fields.append("description")

    current_ids: List[str] = record.get("agent_ids", [])
    add_ids = updates.get("add_agent_ids")
    remove_ids = updates.get("remove_agent_ids")
    # Validate agent id lists are lists of strings
    if not (isinstance(add_ids, list) and all(isinstance(i, str) for i in add_ids)):
        add_ids = None
    if not (isinstance(remove_ids, list) and all(isinstance(i, str) for i in remove_ids)):
        remove_ids = None
    if add_ids:
        for aid in add_ids:
            if aid not in current_ids:
                current_ids.append(aid)
        applied_fields.append("add_agent_ids")
    if remove_ids:
        remove_set = set(remove_ids)
        current_ids = [aid for aid in current_ids if aid not in remove_set]
        applied_fields.append("remove_agent_ids")
    record["agent_ids"] = current_ids

    if applied_fields:
        record["updated_at"] = datetime.now(timezone.utc).isoformat()
        _save_team(record)

    return _envelope({
        "team": record,
        "reply": explanation,
        "applied": bool(applied_fields),
        "applied_fields": applied_fields,
    })
