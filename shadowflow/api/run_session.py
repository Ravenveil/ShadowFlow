"""Run Session API — goal-to-team-assembly pipeline with SSE streaming.

POST /api/run-sessions        — create session, start background assembly
GET  /api/run-sessions/{id}/stream — SSE stream of classify/assemble/node/edge/blueprint/complete
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Dict, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger("shadowflow.api.run_session")

# ---------------------------------------------------------------------------
# Try to import the real IntentRouter; fall back to mock if not available yet
# ---------------------------------------------------------------------------

try:
    from shadowflow.runtime.intent_router import IntentRouter  # type: ignore

    _INTENT_ROUTER_AVAILABLE = True
except ImportError:
    _INTENT_ROUTER_AVAILABLE = False
    IntentRouter = None  # type: ignore
    logger.debug("IntentRouter not yet available — using mock classification data")

# ---------------------------------------------------------------------------
# In-memory session store (ephemeral, no DB)
# ---------------------------------------------------------------------------

_sessions: Dict[str, Dict[str, Any]] = {}

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class RunSessionCreateRequest(BaseModel):
    goal: str
    output_hint: Optional[str] = None
    workspace_id: Optional[str] = None


class RunSessionCreateResponse(BaseModel):
    session_id: str
    stream_url: str


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/run-sessions", tags=["run-sessions"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_session_id() -> str:
    return f"rs-{uuid4().hex[:12]}"


def _sse(event: str, data: Any) -> str:
    """Format a single SSE frame."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _mock_classify(goal: str) -> Dict[str, Any]:
    """Return mock classification result when IntentRouter is unavailable."""
    return {"output_type": "report", "mode": "team", "confidence": 0.92}


def _mock_blueprint_yaml(goal: str) -> str:
    """Return a minimal placeholder YAML blueprint."""
    return (
        "name: paper-review-team\n"
        "description: Auto-generated team for: " + goal[:60] + "\n"
        "coordinator:\n"
        "  type: coordinator\n"
        "  policy_gate: true\n"
        "agents:\n"
        "  - id: agent-reader\n"
        "    role: Reader\n"
        "    model: claude-sonnet-4\n"
        "  - id: agent-critic\n"
        "    role: Critic\n"
        "    model: claude-sonnet-4\n"
        "  - id: agent-writer\n"
        "    role: Writer\n"
        "    model: claude-sonnet-4\n"
    )


# ---------------------------------------------------------------------------
# Background assembly coroutine
# ---------------------------------------------------------------------------


async def _run_assembly(session_id: str, goal: str, output_hint: Optional[str]) -> None:
    """Drive the full classify → plan → emit nodes/edges → emit blueprint pipeline.

    Events are pushed into session["queue"] as pre-formatted SSE strings.
    The SSE streaming endpoint drains the queue via asyncio.Queue.
    """
    session = _sessions.get(session_id)
    if session is None:
        return

    queue: asyncio.Queue[Optional[str]] = session["queue"]

    async def emit(event: str, data: Any) -> None:
        frame = _sse(event, data)
        session["log"].append(frame)
        await queue.put(frame)

    try:
        # --- Step 1: Classify intent (~0.5 s) ---
        if _INTENT_ROUTER_AVAILABLE and IntentRouter is not None:
            router_instance = IntentRouter()
            classify_result = (await router_instance.classify(goal)).__dict__
        else:
            await asyncio.sleep(0.5)
            classify_result = _mock_classify(goal)

        await emit("classify", classify_result)

        # --- Step 2: Plan agent roles (~1.4 s total, two sub-steps) ---
        await emit("assemble", {"step": "分析目标需求", "status": "running"})
        await asyncio.sleep(0.8)
        await emit("assemble", {"step": "分析目标需求", "status": "done", "elapsed_ms": 800})

        await emit("assemble", {"step": "规划 Agent 角色结构", "status": "running"})
        await asyncio.sleep(0.6)
        await emit(
            "assemble",
            {"step": "规划 Agent 角色结构", "status": "done", "elapsed_ms": 1400},
        )

        # --- Step 3: Generate YAML blueprint + stream nodes/edges (~2.1 s) ---
        await emit("assemble", {"step": "生成 YAML Blueprint", "status": "running"})

        # Stream coordinator node
        await emit(
            "node",
            {
                "node_id": "coordinator",
                "type": "coordinator",
                "title": "Team Coordinator",
                "sub": "3 agents · 串行 · policy_gate",
                "chips": ["team_mode", "router", "retry: 3"],
            },
        )

        # Stream agent-1 + edge
        await asyncio.sleep(0.3)
        await emit(
            "node",
            {
                "node_id": "agent-1",
                "type": "agent",
                "title": "Reader · 论文阅读",
                "sub": "claude-sonnet-4 · t 0.2",
                "chips": ["pdf_extract", "arxiv_search"],
                "status": "ready",
            },
        )
        await emit("edge", {"from": "coordinator", "to": "agent-1", "status": "active"})

        # Stream agent-2 + edge
        await asyncio.sleep(0.3)
        await emit(
            "node",
            {
                "node_id": "agent-2",
                "type": "agent",
                "title": "Critic · 批判分析",
                "sub": "claude-sonnet-4 · t 0.3",
                "chips": ["critique", "analysis"],
                "status": "pending",
            },
        )
        await emit("edge", {"from": "coordinator", "to": "agent-2", "status": "pending"})

        # Stream agent-3 + edge
        await asyncio.sleep(0.3)
        await emit(
            "node",
            {
                "node_id": "agent-3",
                "type": "agent",
                "title": "Writer · Review 稿",
                "sub": "claude-sonnet-4 · t 0.4",
                "chips": ["write", "format"],
                "status": "pending",
            },
        )
        await emit("edge", {"from": "coordinator", "to": "agent-3", "status": "pending"})

        # Finish blueprint generation
        await asyncio.sleep(0.2)
        await emit(
            "assemble",
            {"step": "生成 YAML Blueprint", "status": "done", "elapsed_ms": 2100},
        )

        # --- Step 4: Emit full YAML blueprint ---
        yaml_text = _mock_blueprint_yaml(goal)
        await emit(
            "blueprint",
            {"yaml": yaml_text, "filename": "paper-review-team.yml"},
        )

        # --- Step 5: Complete ---
        run_id = f"run-{uuid4().hex[:8]}"
        template_param = session_id
        await emit(
            "complete",
            {
                "session_id": session_id,
                "run_id": run_id,
                "redirect": f"/editor?template={template_param}",
            },
        )

        session["status"] = "complete"
        session["run_id"] = run_id

    except Exception as exc:
        logger.exception("run_assembly failed for session %s: %s", session_id, exc)
        await queue.put(
            _sse("error", {"message": str(exc), "session_id": session_id})
        )
        session["status"] = "error"

    finally:
        # Sentinel: None signals end-of-stream to the SSE generator
        await queue.put(None)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=RunSessionCreateResponse, status_code=201)
async def create_run_session(body: RunSessionCreateRequest) -> RunSessionCreateResponse:
    """Create a run session and start background team assembly.

    Returns session_id and stream_url immediately; the client should then
    open the SSE stream at stream_url to receive live progress events.
    """
    session_id = _make_session_id()
    queue: asyncio.Queue[Optional[str]] = asyncio.Queue()

    _sessions[session_id] = {
        "session_id": session_id,
        "goal": body.goal,
        "output_hint": body.output_hint,
        "workspace_id": body.workspace_id,
        "status": "running",
        "queue": queue,
        "log": [],          # replay buffer — all frames stored here for late-joining clients
        "run_id": None,
    }

    # Fire and forget — the SSE stream drains the queue
    asyncio.create_task(
        _run_assembly(session_id, body.goal, body.output_hint),
        name=f"assembly-{session_id}",
    )

    stream_url = f"/api/run-sessions/{session_id}/stream"
    logger.info("Created run session %s for goal: %.80s", session_id, body.goal)

    return RunSessionCreateResponse(session_id=session_id, stream_url=stream_url)


@router.get("/{session_id}/stream")
async def stream_run_session(session_id: str) -> StreamingResponse:
    """SSE endpoint — streams assembly progress events for a run session.

    Event sequence:
      classify → assemble (steps) → node/edge (graph) → blueprint → complete
    """
    session = _sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Run session not found: {session_id}")

    queue: asyncio.Queue[Optional[str]] = session["queue"]
    log: list = session["log"]

    async def _generate() -> AsyncGenerator[str, None]:
        # Snapshot how many frames have already been emitted before this client connected
        replayed = len(log)

        # Replay buffered frames so late-joining clients see the full history
        for frame in log[:replayed]:
            yield frame

        # If assembly already finished, no need to drain the queue
        if session.get("status") in ("complete", "error"):
            return

        # Assembly still running — drain the queue.
        # The first `replayed` items in the queue are duplicates of what we just replayed;
        # skip them, then yield new frames as they arrive.
        skipped = 0
        while True:
            frame = await queue.get()
            if frame is None:
                break
            if skipped < replayed:
                skipped += 1
                continue
            yield frame

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{session_id}")
async def get_run_session(session_id: str) -> Dict[str, Any]:
    """Return current status of a run session (non-streaming poll fallback)."""
    session = _sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Run session not found: {session_id}")
    return {
        "session_id": session["session_id"],
        "goal": session["goal"],
        "status": session["status"],
        "run_id": session["run_id"],
        "workspace_id": session["workspace_id"],
    }
