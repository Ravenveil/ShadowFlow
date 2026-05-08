"""Approvals API — Story 7.7 (Inbox ApprovalGatePanel).

Endpoints:
  GET  /api/groups/{group_id}/approvals/pending  — list pending approvals for a group
  POST /api/approvals/{approval_id}/approve      — approve an approval gate
  POST /api/approvals/{approval_id}/reject       — reject via true rejection flow (Story 1.3)
  GET  /api/approvals/events                     — SSE stream of approval lifecycle events
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from shadowflow.runtime.events import _redact_sse_payload
from pydantic import BaseModel

logger = logging.getLogger("shadowflow.api.approvals")

router = APIRouter(tags=["approvals"])

# ---------------------------------------------------------------------------
# Registry: approval_id → (run_id, node_id) + metadata
# ---------------------------------------------------------------------------

_approval_registry: Dict[str, Dict[str, Any]] = {}  # approval_id → record
_reverse_registry: Dict[Tuple[str, str], str] = {}  # (run_id, node_id) → approval_id


def _get_or_create_approval_id(run_id: str, node_id: str) -> str:
    key = (run_id, node_id)
    if key not in _reverse_registry:
        aid = uuid4().hex[:16]
        _reverse_registry[key] = aid
        _approval_registry[aid] = {
            "run_id": run_id,
            "gate_id": node_id,
            "triggered_at": datetime.now(timezone.utc).isoformat(),
            "submitter_name": node_id,
            "submitter_kind": "acp",
            "summary": "",
        }
    return _reverse_registry[key]


# ---------------------------------------------------------------------------
# Runtime service singleton
# ---------------------------------------------------------------------------

_runtime_service: Any = None


def set_runtime_service(svc: Any) -> None:
    global _runtime_service
    _runtime_service = svc


def _get_runtime_service() -> Any:
    return _runtime_service


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class PendingApprovalItem(BaseModel):
    approval_id: str
    run_id: str
    gate_id: str
    submitter_name: str
    submitter_kind: str
    summary: str
    triggered_at: str
    waiting_seconds: int


class PendingApprovalsResponse(BaseModel):
    items: List[PendingApprovalItem]


class ApproveResponse(BaseModel):
    status: str
    run_id: str
    gate_id: str


class RejectRequest(BaseModel):
    reason: Optional[str] = ""


class RejectResponse(BaseModel):
    status: str
    run_id: str
    gate_id: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _waiting_seconds(triggered_at: str) -> int:
    try:
        t = datetime.fromisoformat(triggered_at.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - t
        return max(0, int(delta.total_seconds()))
    except Exception:
        return 0


def _format_sse(event_type: str, payload: Dict[str, Any]) -> str:
    data = json.dumps(_redact_sse_payload(payload), ensure_ascii=False)
    return f"event: {event_type}\ndata: {data}\n\n"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/api/groups/{group_id}/approvals/pending", response_model=PendingApprovalsResponse)
async def get_group_pending_approvals(group_id: str) -> PendingApprovalsResponse:
    """Return pending ApprovalGate items for a group.

    MVP: filters from all pending approvals via run_group mapping if available,
    otherwise returns all pending approvals when group_id resolves no runs.
    """
    svc = _get_runtime_service()
    items: List[PendingApprovalItem] = []

    if svc is None:
        return PendingApprovalsResponse(items=items)

    approval_events: Dict[Tuple[str, str], Any] = getattr(svc, "_approval_events", {})

    # Build candidate (run_id, node_id) set — filter by group_id when possible
    group_run_ids: Optional[set] = _resolve_group_run_ids(svc, group_id)

    for (run_id, node_id), evt in list(approval_events.items()):
        if not (hasattr(evt, "is_set") and not evt.is_set()):
            continue
        if group_run_ids is not None and run_id not in group_run_ids:
            continue

        aid = _get_or_create_approval_id(run_id, node_id)
        rec = _approval_registry[aid]

        items.append(
            PendingApprovalItem(
                approval_id=aid,
                run_id=run_id,
                gate_id=node_id,
                submitter_name=rec.get("submitter_name", node_id),
                submitter_kind=rec.get("submitter_kind", "acp"),
                summary=rec.get("summary", ""),
                triggered_at=rec.get("triggered_at", ""),
                waiting_seconds=_waiting_seconds(rec.get("triggered_at", "")),
            )
        )

    return PendingApprovalsResponse(items=items)


def _resolve_run_group_id(svc: Any, run_id: str) -> Optional[str]:
    """Return group_id for a given run_id, or None if not determinable."""
    try:
        run_store = getattr(svc, "_run_store", None)
        if run_store is None:
            return None
        runs = run_store.list() if hasattr(run_store, "list") else []
        for run in runs:
            run_dict = run.model_dump() if hasattr(run, "model_dump") else {}
            if run_dict.get("run_id") == run_id:
                return run_dict.get("group_id")
    except Exception:
        return None
    return None


def _resolve_group_run_ids(svc: Any, group_id: str) -> Optional[set]:
    """Return run_ids associated with group_id, or None if group_id not tracked.

    Returns None when the run store is unavailable or when no run record carries
    a `group_id` field (data-model limitation — can't determine group membership).
    Returns an empty set when the field exists but no run belongs to this group
    (correct isolation — show zero approvals for this group).
    """
    try:
        runs = svc.list_runs() if hasattr(svc, "list_runs") else []
        has_group_field = False
        matched: set = set()
        for r in runs:
            run_dict = r.model_dump() if hasattr(r, "model_dump") else {}
            if "group_id" in run_dict:
                has_group_field = True
                if run_dict.get("group_id") == group_id:
                    matched.add(run_dict.get("run_id", ""))
        if not has_group_field:
            return None  # group_id not in data model yet — skip filtering
        return matched
    except Exception:
        return None


@router.post("/api/approvals/{approval_id}/approve", response_model=ApproveResponse)
async def approve_approval(approval_id: str) -> ApproveResponse:
    """Approve a pending approval gate.

    Sets the approval decision to 'approve' and signals the waiting coroutine.
    Also publishes approval.resolved SSE event.
    """
    svc = _get_runtime_service()
    if svc is None:
        raise HTTPException(status_code=500, detail="Runtime service unavailable")

    rec = _approval_registry.get(approval_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Approval not found: {approval_id}")

    run_id = rec["run_id"]
    gate_id = rec["gate_id"]
    key = (run_id, gate_id)

    approval_events: Dict[Tuple[str, str], Any] = getattr(svc, "_approval_events", {})
    approval_decisions: Dict[Tuple[str, str], Any] = getattr(svc, "_approval_decisions", {})

    evt = approval_events.get(key)
    if evt is None or (hasattr(evt, "is_set") and evt.is_set()):
        raise HTTPException(status_code=404, detail=f"Approval not found or already resolved: {approval_id}")

    # Signal the waiting _execute_approval_gate coroutine
    approval_decisions[key] = {"decision": "approve", "reason": ""}
    evt.set()

    # Publish SSE event for real-time updates
    event_bus = getattr(svc, "_event_bus", None)
    if event_bus is not None:
        try:
            event_bus.publish(
                run_id,
                {
                    "type": "approval.resolved",
                    "approval_id": approval_id,
                    "run_id": run_id,
                    "gate_id": gate_id,
                    "decision": "approve",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception:
            pass

    logger.info("Approval approved: approval_id=%s run_id=%s gate=%s", approval_id, run_id, gate_id)
    return ApproveResponse(status="approved", run_id=run_id, gate_id=gate_id)


@router.post("/api/approvals/{approval_id}/reject", response_model=RejectResponse)
async def reject_approval(approval_id: str, body: RejectRequest) -> RejectResponse:
    """Reject a pending approval gate via the true rejection flow (Story 1.3).

    1. Signals the approval event with 'reject' decision (unblocks the gate).
    2. Calls RuntimeService.reject() to enforce policy matrix and fire the
       full rejection event chain (policy.violation → node.rejected → handoff.triggered).
    """
    svc = _get_runtime_service()
    if svc is None:
        raise HTTPException(status_code=500, detail="Runtime service unavailable")

    rec = _approval_registry.get(approval_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Approval not found: {approval_id}")

    run_id = rec["run_id"]
    gate_id = rec["gate_id"]
    reason = (body.reason or "").strip()
    key = (run_id, gate_id)

    approval_events: Dict[Tuple[str, str], Any] = getattr(svc, "_approval_events", {})
    approval_decisions: Dict[Tuple[str, str], Any] = getattr(svc, "_approval_decisions", {})

    evt = approval_events.get(key)
    if evt is None or (hasattr(evt, "is_set") and evt.is_set()):
        raise HTTPException(status_code=404, detail=f"Approval not found or already resolved: {approval_id}")

    # Step 1: Signal the gate to unblock with 'reject' decision
    approval_decisions[key] = {"decision": "reject", "reason": reason}
    evt.set()

    # Step 2: Trigger true rejection flow via RuntimeService.reject() (Story 1.3)
    try:
        await svc.reject(
            run_id=run_id,
            reviewer_role="human",
            target_node_id=gate_id,
            reason=reason,
        )
    except ValueError as exc:
        # Expected business error (policy violation, unknown run) — gate already unblocked.
        logger.warning("RuntimeService.reject policy/business error: run=%s gate=%s: %s", run_id, gate_id, exc)
    except Exception as exc:
        # Unexpected error — full rejection event chain did NOT fire; gate already unblocked.
        logger.critical(
            "RuntimeService.reject UNEXPECTED failure — rejection chain incomplete: "
            "run=%s gate=%s exc=%s: %s",
            run_id, gate_id, type(exc).__name__, exc,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Rejection gate unblocked but policy chain failed: {type(exc).__name__}",
        ) from exc

    # Publish SSE resolved event
    event_bus = getattr(svc, "_event_bus", None)
    if event_bus is not None:
        try:
            event_bus.publish(
                run_id,
                {
                    "type": "approval.resolved",
                    "approval_id": approval_id,
                    "run_id": run_id,
                    "gate_id": gate_id,
                    "decision": "reject",
                    "reason": reason,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception:
            pass

    logger.info("Approval rejected: approval_id=%s run_id=%s gate=%s", approval_id, run_id, gate_id)
    return RejectResponse(status="rejected", run_id=run_id, gate_id=gate_id)


_ACTIVE_RUN_STATUSES = {"running", "paused"}


@router.get("/api/approvals/events")
async def stream_approval_events(request: Request) -> StreamingResponse:
    """SSE stream of approval lifecycle events and run lifecycle events.

    Events emitted:
      approval.pending   — new approval gate awaiting decision
      approval.resolved  — approval gate resolved (includes decision / reason)
      run.started        — run entered active status (running / paused)
      run.completed      — run left active status

    Uses 1-second server-side polling.  Payloads include group_id for
    client-side filtering.  Resolved approval entries are cleaned from the
    in-memory registry after emission to prevent unbounded growth.
    """
    svc = _get_runtime_service()

    async def generate():
        known_pending: set = set()
        known_active_runs: Dict[str, Optional[str]] = {}  # run_id → group_id
        seq = 0

        while True:
            if await request.is_disconnected():
                break

            if svc is not None:
                # ── approval events ────────────────────────────────────────
                approval_events: Dict[Tuple[str, str], Any] = getattr(svc, "_approval_events", {})
                current = {
                    k for k, v in approval_events.items()
                    if hasattr(v, "is_set") and not v.is_set()
                }

                for key in current - known_pending:
                    run_id, node_id = key
                    aid = _get_or_create_approval_id(run_id, node_id)
                    rec = _approval_registry[aid]
                    group_id = _resolve_run_group_id(svc, run_id)
                    payload = {
                        "type": "approval.pending",
                        "approval_id": aid,
                        "run_id": run_id,
                        "gate_id": node_id,
                        "group_id": group_id,
                        "submitter_name": rec.get("submitter_name", node_id),
                        "submitter_kind": rec.get("submitter_kind", "acp"),
                        "summary": rec.get("summary", ""),
                        "triggered_at": rec.get("triggered_at", ""),
                        "waiting_seconds": _waiting_seconds(rec.get("triggered_at", "")),
                        "seq": seq,
                    }
                    yield _format_sse("approval.pending", payload)
                    seq += 1

                for key in known_pending - current:
                    run_id, node_id = key
                    aid = _reverse_registry.get(key)
                    if aid:
                        group_id = _resolve_run_group_id(svc, run_id)
                        # Include decision/reason so clients can distinguish approve vs reject
                        approval_decisions: Dict[Tuple[str, str], Any] = getattr(
                            svc, "_approval_decisions", {}
                        )
                        decision_rec = approval_decisions.get(key, {})
                        payload = {
                            "type": "approval.resolved",
                            "approval_id": aid,
                            "run_id": run_id,
                            "gate_id": node_id,
                            "group_id": group_id,
                            "decision": decision_rec.get("decision", ""),
                            "reason": decision_rec.get("reason", ""),
                            "seq": seq,
                        }
                        yield _format_sse("approval.resolved", payload)
                        seq += 1
                        # Clean up resolved entries to prevent unbounded memory growth
                        _approval_registry.pop(aid, None)
                        _reverse_registry.pop(key, None)

                known_pending = current

                # ── run lifecycle events ────────────────────────────────────
                try:
                    all_runs = svc.list_runs() if hasattr(svc, "list_runs") else []
                    current_active: Dict[str, Optional[str]] = {}
                    for r in all_runs:
                        run_dict = r.model_dump() if hasattr(r, "model_dump") else {}
                        if run_dict.get("status") in _ACTIVE_RUN_STATUSES:
                            rid = run_dict.get("run_id", "")
                            current_active[rid] = run_dict.get("group_id")  # may be None
                except Exception:
                    current_active = {}

                for run_id, group_id in current_active.items():
                    if run_id not in known_active_runs:
                        yield _format_sse(
                            "run.started",
                            {"type": "run.started", "run_id": run_id, "group_id": group_id, "seq": seq},
                        )
                        seq += 1

                for run_id, group_id in list(known_active_runs.items()):
                    if run_id not in current_active:
                        yield _format_sse(
                            "run.completed",
                            {"type": "run.completed", "run_id": run_id, "group_id": group_id, "seq": seq},
                        )
                        seq += 1

                known_active_runs = current_active

            await asyncio.sleep(1)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
