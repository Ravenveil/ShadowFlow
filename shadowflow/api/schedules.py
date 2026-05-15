"""Schedules API — Story 14.2 AC3/AC4.

Endpoints (prefix /schedules):
  POST   /schedules                — create schedule (validates cron + 500-char desc)
  GET    /schedules?group_id=X     — list schedules (optionally filtered by group_id)
  DELETE /schedules/{id}           — delete schedule + cancel APScheduler job
  GET    /schedules/{id}/runs      — last 20 run records for a schedule

Storage: .shadowflow/schedules/{schedule_id}.json
"""

from __future__ import annotations

import json
import logging
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

try:
    from apscheduler.triggers.cron import CronTrigger
    _APSCHEDULER_AVAILABLE = True
except ImportError:
    _APSCHEDULER_AVAILABLE = False
    CronTrigger = None  # type: ignore[assignment,misc]

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/schedules", tags=["schedules"])

_SCHEDULES_DIR = Path(__file__).resolve().parents[2] / ".shadowflow" / "schedules"
_SCHEDULE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")

MAX_RUNS_STORED = 20


# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------

def _schedules_dir() -> Path:
    _SCHEDULES_DIR.mkdir(parents=True, exist_ok=True)
    return _SCHEDULES_DIR


def _schedule_path(schedule_id: str) -> Path:
    root = _schedules_dir().resolve()
    resolved = (root / f"{schedule_id}.json").resolve()
    if not resolved.is_relative_to(root):
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_ID", "message": "Invalid schedule_id"}})
    return resolved


def _save_schedule(record: Dict[str, Any]) -> None:
    target = _schedule_path(record["schedule_id"])
    content = json.dumps(record, default=str).encode("utf-8")
    fd, tmp = tempfile.mkstemp(dir=str(target.parent), prefix=".tmp-")
    try:
        os.write(fd, content)
        os.fsync(fd)
        os.close(fd)
        os.replace(tmp, str(target))
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            Path(tmp).unlink(missing_ok=True)
        except OSError:
            pass
        raise


def _load_schedule(schedule_id: str) -> Optional[Dict[str, Any]]:
    p = _schedule_path(schedule_id)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def _list_schedules() -> List[Dict[str, Any]]:
    d = _schedules_dir()
    records = []
    for p in sorted(d.glob("*.json")):
        try:
            records.append(json.loads(p.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("schedules: skipping corrupt record %s: %s", p.name, exc)
    return records


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# APScheduler job
# ---------------------------------------------------------------------------

def _schedule_job(schedule_id: str) -> None:
    """Called by APScheduler when a scheduled trigger fires."""
    record = _load_schedule(schedule_id)
    if record is None:
        logger.warning("schedule_job: schedule %s not found, skipping", schedule_id)
        return

    run = {
        "run_id": uuid4().hex,
        "triggered_at": _utc_now().isoformat(),
        "status": "succeeded",
    }
    runs: List[Dict[str, Any]] = record.get("runs", [])
    runs.insert(0, run)
    record["runs"] = runs[:MAX_RUNS_STORED]
    try:
        _save_schedule(record)
    except Exception as exc:
        logger.error("schedule_job: failed to save run record for %s: %s", schedule_id, exc)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateScheduleRequest(BaseModel):
    group_id: str = Field(..., min_length=1, max_length=200)
    cron_expression: str = Field(..., min_length=1, max_length=100)
    agent_id: str = Field(..., min_length=1, max_length=200)
    task_description: str = Field(default="", max_length=500)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", status_code=201)
async def create_schedule(body: CreateScheduleRequest) -> Dict[str, Any]:
    if not _APSCHEDULER_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail={"error": "SCHEDULER_UNAVAILABLE", "message": "APScheduler not installed; add 'APScheduler>=3.10,<4' to your environment"},
        )
    # Validate cron expression
    try:
        trigger = CronTrigger.from_crontab(body.cron_expression)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "invalid_cron",
                "detail": f"{body.cron_expression!r} is not valid cron expression: {exc}",
                "example": "0 8 * * 1-5",
            },
        )

    # task_description length is validated by Pydantic Field(max_length=500)
    # but we return a structured error matching story spec
    if len(body.task_description) > 500:
        raise HTTPException(
            status_code=422,
            detail={"error": "task_description_too_long", "max_length": 500},
        )

    # MVP: one schedule per group_id
    existing = [r for r in _list_schedules() if r.get("group_id") == body.group_id]
    if existing:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "schedule_exists",
                "existing_id": existing[0]["schedule_id"],
                "hint": f"DELETE /schedules/{existing[0]['schedule_id']} first",
            },
        )

    schedule_id = uuid4().hex
    now = _utc_now()

    # Compute next_run_time
    next_fire = trigger.get_next_fire_time(None, now)
    next_run_iso = next_fire.isoformat() if next_fire else None

    record: Dict[str, Any] = {
        "schedule_id": schedule_id,
        "group_id": body.group_id,
        "cron_expression": body.cron_expression,
        "agent_id": body.agent_id,
        "task_description": body.task_description,
        "created_at": now.isoformat(),
        "next_run_time": next_run_iso,
        "runs": [],
    }
    _save_schedule(record)

    # Register with APScheduler
    from shadowflow.services.scheduler import get_scheduler
    scheduler = get_scheduler()
    if scheduler.running:
        scheduler.add_job(
            _schedule_job,
            trigger=trigger,
            id=schedule_id,
            args=[schedule_id],
            replace_existing=True,
        )

    return {"data": record, "meta": {}}


@router.get("")
async def list_schedules(group_id: Optional[str] = None) -> Dict[str, Any]:
    records = _list_schedules()
    if group_id:
        records = [r for r in records if r.get("group_id") == group_id]
    return {"data": records, "meta": {"count": len(records)}}


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(schedule_id: str) -> None:
    if not _SCHEDULE_ID_RE.match(schedule_id):
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_ID", "message": "Invalid schedule_id"}})

    record = _load_schedule(schedule_id)
    if record is None:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Schedule not found"}})

    # Remove APScheduler job if running
    from shadowflow.services.scheduler import get_scheduler
    scheduler = get_scheduler()
    if scheduler.running:
        try:
            scheduler.remove_job(schedule_id)
        except Exception:
            pass

    _schedule_path(schedule_id).unlink(missing_ok=True)


@router.get("/{schedule_id}/runs")
async def get_schedule_runs(schedule_id: str) -> Dict[str, Any]:
    if not _SCHEDULE_ID_RE.match(schedule_id):
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_ID", "message": "Invalid schedule_id"}})

    record = _load_schedule(schedule_id)
    if record is None:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Schedule not found"}})

    runs = record.get("runs", [])[:20]
    return {"data": runs, "meta": {"count": len(runs)}}
