"""Schedules API — Story 14.2 AC3/AC4.

Endpoints (prefix /schedules):
  POST   /schedules                — create schedule (validates cron + 500-char desc)
  GET    /schedules?group_id=X     — list schedules (optionally filtered by group_id)
  PATCH  /schedules/{id}           — enable/disable (pause/resume APScheduler job)
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
    from apscheduler.triggers.date import DateTrigger
    _APSCHEDULER_AVAILABLE = True
except ImportError:
    _APSCHEDULER_AVAILABLE = False
    CronTrigger = None  # type: ignore[assignment,misc]
    DateTrigger = None  # type: ignore[assignment,misc]

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/schedules", tags=["schedules"])

_SCHEDULES_DIR = Path(__file__).resolve().parents[2] / ".shadowflow" / "schedules"
_SCHEDULE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")

MAX_RUNS_STORED = 20

# ── OpenBot /routines 防呆三件套（2026-11-06 对齐批）────────────────────────
# OpenBot 产品约束范式：例程间隔下限 / 启用数量上限 / 连续失败熔断自动停用，
# 都是「防止一句话调度出超出人意料的规模」的产品化思考。落点：
MAX_ENABLED_SCHEDULES = 20      # 启用计划数上限（创建/启用时校验）
MIN_CRON_INTERVAL_MINUTES = 15  # cron 最小触发间隔（防高频烧模型费用）
MAX_CONSECUTIVE_FAILURES = 10   # 连续失败达阈值 → 熔断自动停用


def _parse_cron_interval_minutes(cron: str) -> Optional[int]:
    """Estimate the shortest interval (minutes) at which a cron expression can
    fire consecutively. Conservative parse of the minute/hour fields only:
      - "*/N" in minute field → N minutes
      - "A/B" in minute field → interval N within the hour window
      - plain "*" minute field with "*/*" hour → 60/hours-step minutes
      - anything more specific (listed minutes, single time) → ≥ 60 minutes
    Returns None when the expression cannot be parsed conservatively (caller
    then skips the interval check rather than false-positiving).
    """
    try:
        fields = cron.split()
    except (ValueError, AttributeError):
        return None
    if len(fields) != 5:
        return None
    minute, hour = fields[0], fields[1]

    def _step(field: str) -> Optional[int]:
        """Extract the step of a */N or A/B field; None when not a step form."""
        if "/" not in field:
            return None
        _, _, step_part = field.partition("/")
        try:
            step = int(step_part)
        except ValueError:
            return None
        return step if step > 0 else None

    def _is_wildcard(field: str) -> bool:
        return field == "*" or (field.startswith("*/") and field[2:].isdigit())

    # Minute field */N or A/B → fires every N minutes (N < 60 → sub-hourly).
    m_step = _step(minute)
    if m_step is not None:
        return m_step
    # Minute wildcard + hour step A/B → fires every B hours = B*60 minutes.
    if _is_wildcard(minute) and (hour.startswith("*/") or "/" in hour):
        h_step = _step(hour)
        if h_step is not None:
            return h_step * 60
    # Listed minutes (0,15,30,45 etc.) → shortest gap between consecutive
    # listed values within the hour; conservative floor at 60 when unclear.
    if "," in minute:
        try:
            mins = sorted({int(x) for x in minute.split(",")})
            gaps = [b - a for a, b in zip(mins, mins[1:])]
            gaps.append(60 - mins[-1] + mins[0])  # wrap-around gap
            return max(min(gaps), 1)
        except ValueError:
            return None
    # Single fixed minute (e.g. "0 9 * * *") → at most once per hour.
    if minute.isdigit():
        return 60
    return None


def _enforce_enabled_cap() -> None:
    """Reject create/enable when the enabled-schedule cap is reached (422)."""
    enabled_count = sum(1 for r in _list_schedules() if r.get("enabled", True) is not False)
    if enabled_count >= MAX_ENABLED_SCHEDULES:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "enabled_limit_reached",
                "message": f"最多允许 {MAX_ENABLED_SCHEDULES} 个启用中的计划（当前 {enabled_count} 个）。"
                "请先停用或删除部分计划再试。",
                "limit": MAX_ENABLED_SCHEDULES,
            },
        )


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
    # Safety net for stale in-memory jobs: a disabled schedule must not fire
    # even if the pause did not reach APScheduler (e.g. re-added after restart).
    if record.get("enabled", True) is False:
        return

    # Run bookkeeping: runs are appended after execution outcome is known.
    runs: List[Dict[str, Any]] = record.get("runs", [])

    # The trigger itself only proves the scheduler fired; whether the task
    # succeeded is decided by the executor bridge below. When no bridge is
    # registered (pure reminder schedules), firing counts as success.
    status = "succeeded"
    error_message: Optional[str] = None
    bridge = _RUN_EXECUTOR_BRIDGE
    if bridge is not None:
        try:
            bridge(record)
        except Exception as exc:
            status = "failed"
            error_message = str(exc)[:300]
            logger.warning("schedule_job: executor failed for %s: %s", schedule_id, exc)

    run = {
        "run_id": uuid4().hex,
        "triggered_at": _utc_now().isoformat(),
        "status": status,
    }
    if error_message:
        run["error"] = error_message
    runs.insert(0, run)
    record["runs"] = runs[:MAX_RUNS_STORED]

    # One-shot events fire exactly once; mark completed so frontend can render
    # them as historical rather than pending.
    if record.get("start_at") and not record.get("cron_expression"):
        record["completed"] = True
        record["next_run_time"] = None

    # OpenBot 防呆③：连续失败熔断 — cron 计划连续失败达阈值自动停用，
    # 防止一个坏计划每 15 分钟烧一次模型费用（OpenBot: 连续失败 10 次停用）。
    if status == "failed" and record.get("cron_expression"):
        recent = record["runs"][:MAX_CONSECUTIVE_FAILURES]
        if (
            len(recent) >= MAX_CONSECUTIVE_FAILURES
            and all(r.get("status") == "failed" for r in recent)
        ):
            record["enabled"] = False
            record["next_run_time"] = None
            record["auto_disabled"] = True
            record["auto_disabled_at"] = _utc_now().isoformat()
            record["auto_disabled_reason"] = (
                f"连续失败 {MAX_CONSECUTIVE_FAILURES} 次，已自动停用"
            )
            logger.warning(
                "schedule_job: schedule %s auto-disabled after %d consecutive failures",
                schedule_id,
                MAX_CONSECUTIVE_FAILURES,
            )
            _save_schedule(record)
            # Mirror the disable into APScheduler (pause the burning job).
            from shadowflow.services.scheduler import get_scheduler
            scheduler = get_scheduler()
            if scheduler.running:
                try:
                    scheduler.pause_job(schedule_id)
                except Exception:
                    pass
            return

    try:
        _save_schedule(record)
    except Exception as exc:
        logger.error("schedule_job: failed to save run record for %s: %s", schedule_id, exc)


# Executor bridge: the daemon registers a callable that actually runs the
# task_description (LLM/chat pipeline). None = pure reminder mode where a
# fired trigger is recorded as succeeded. Kept module-level so tests can
# monkeypatch it without touching APScheduler internals.
_RUN_EXECUTOR_BRIDGE: Optional[Any] = None


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateScheduleRequest(BaseModel):
    group_id: str = Field(..., min_length=1, max_length=200)
    # iCal-style: at least one of cron_expression / start_at must be set.
    # Validated by _xor_trigger below. Cron = recurring; start_at = one-shot.
    cron_expression: Optional[str] = Field(default=None, max_length=100)
    start_at: Optional[datetime] = None
    agent_id: Optional[str] = Field(default=None, max_length=200)
    task_description: str = Field(default="", max_length=500)
    duration_min: int = Field(default=30, ge=1, le=1440)

    @model_validator(mode="after")
    def _xor_trigger(self):
        has_cron = bool(self.cron_expression and self.cron_expression.strip())
        has_start = self.start_at is not None
        if not has_cron and not has_start:
            raise ValueError("Either cron_expression or start_at must be set")
        return self


class PatchScheduleRequest(BaseModel):
    """Enable/disable toggle. `enabled` is the only mutable field for now."""
    enabled: bool


class AgentSchedulesEnvelope(BaseModel):
    """agent_id 维度的计划过滤（os-unified 2026-11-04：Agent 主机卡片「定时
    任务」区块按 agent 列计划）。group_id 语义不变——agent 的 DM 会话 id。"""
    agent_id: str = Field(..., min_length=1, max_length=200)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def _rebuild_trigger(record: Dict[str, Any]):
    """Rebuild an APScheduler trigger from a stored record. None when the
    schedule cannot fire anymore (corrupt cron, one-shot already past)."""
    if not _APSCHEDULER_AVAILABLE:
        return None
    cron = record.get("cron_expression")
    if cron:
        try:
            return CronTrigger.from_crontab(cron)
        except (ValueError, TypeError):
            return None
    start_at_raw = record.get("start_at")
    if start_at_raw:
        start_at = datetime.fromisoformat(start_at_raw)
        if start_at.tzinfo is None:
            start_at = start_at.replace(tzinfo=timezone.utc)
        if start_at > _utc_now():
            return DateTrigger(run_date=start_at)
    return None


@router.post("", status_code=201)
async def create_schedule(body: CreateScheduleRequest) -> Dict[str, Any]:
    if not _APSCHEDULER_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail={"error": "SCHEDULER_UNAVAILABLE", "message": "APScheduler not installed; add 'APScheduler>=3.10,<4' to your environment"},
        )

    # OpenBot 防呆①：启用计划数上限（创建即启用，创建前校验）。
    # 注意放在 cron/start_at 二分支之前——两种计划类型都占启用名额。
    _enforce_enabled_cap()

    # Build trigger: cron (recurring) takes precedence if both supplied,
    # otherwise start_at (one-shot).
    if body.cron_expression:
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
        # OpenBot 防呆②：最小触发间隔（默认 15 分钟，防高频计划烧模型费用）。
        interval = _parse_cron_interval_minutes(body.cron_expression)
        if interval is not None and interval < MIN_CRON_INTERVAL_MINUTES:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "cron_interval_too_short",
                    "message": f"cron 触发间隔过短（约 {interval} 分钟），最小允许 {MIN_CRON_INTERVAL_MINUTES} 分钟。",
                    "example": "*/15 * * * *",
                },
            )

    else:
        # body.start_at guaranteed not None by _xor_trigger validator
        start_at = body.start_at
        # Normalize naive datetimes to UTC so comparisons below don't crash.
        if start_at.tzinfo is None:
            start_at = start_at.replace(tzinfo=timezone.utc)
        if start_at < _utc_now():
            raise HTTPException(
                status_code=422,
                detail={"error": "start_at_in_past", "start_at": start_at.isoformat()},
            )
        trigger = DateTrigger(run_date=start_at)

    schedule_id = uuid4().hex
    now = _utc_now()

    # Compute next_run_time
    next_fire = trigger.get_next_fire_time(None, now)
    next_run_iso = next_fire.isoformat() if next_fire else None

    record: Dict[str, Any] = {
        "schedule_id": schedule_id,
        "group_id": body.group_id,
        "cron_expression": body.cron_expression,
        "start_at": body.start_at.isoformat() if body.start_at else None,
        "agent_id": body.agent_id,
        "task_description": body.task_description,
        "duration_min": body.duration_min,
        "created_at": now.isoformat(),
        "next_run_time": next_run_iso,
        "completed": False,
        "enabled": True,
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
async def list_schedules(group_id: Optional[str] = None, agent_id: Optional[str] = None) -> Dict[str, Any]:
    records = _list_schedules()
    if group_id:
        records = [r for r in records if r.get("group_id") == group_id]
    # os-unified 2026-11-04：Agent 主机卡片按 agent 维度列计划（agent_id 精确匹配）。
    if agent_id:
        records = [r for r in records if r.get("agent_id") == agent_id]
    return {"data": records, "meta": {"count": len(records)}}


@router.patch("/{schedule_id}")
async def patch_schedule(schedule_id: str, body: PatchScheduleRequest) -> Dict[str, Any]:
    if not _SCHEDULE_ID_RE.match(schedule_id):
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_ID", "message": "Invalid schedule_id"}})

    record = _load_schedule(schedule_id)
    if record is None:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Schedule not found"}})

    # OpenBot 防呆①：停用→启用切换时同样受启用数上限约束（创建路径同款 422）。
    was_enabled = record.get("enabled", True) is not False
    if body.enabled and not was_enabled:
        _enforce_enabled_cap()

    record["enabled"] = body.enabled
    # 人工重新启用 = 熔断复位：清掉自动停用标记与失败计数（runs 历史保留）。
    if body.enabled:
        record.pop("auto_disabled", None)
        record.pop("auto_disabled_at", None)
        record.pop("auto_disabled_reason", None)

    # Recompute next_run_time so list views reflect the toggle immediately.
    # A completed one-shot stays completed — re-enabling does not resurrect it.
    if body.enabled and not record.get("completed"):
        trigger = _rebuild_trigger(record)
        next_fire = trigger.get_next_fire_time(None, _utc_now()) if trigger else None
        record["next_run_time"] = next_fire.isoformat() if next_fire else None
    else:
        record["next_run_time"] = None
    _save_schedule(record)

    # Mirror the toggle into APScheduler (best-effort; storage is the truth).
    from shadowflow.services.scheduler import get_scheduler
    scheduler = get_scheduler()
    if scheduler.running:
        try:
            if not body.enabled:
                scheduler.pause_job(schedule_id)
            elif scheduler.get_job(schedule_id) is not None:
                scheduler.resume_job(schedule_id)
            elif not record.get("completed"):
                # Job missing from the in-memory scheduler (e.g. after a
                # backend restart) — re-register so enabling actually fires.
                trigger = _rebuild_trigger(record)
                if trigger is not None:
                    scheduler.add_job(
                        _schedule_job,
                        trigger=trigger,
                        id=schedule_id,
                        args=[schedule_id],
                        replace_existing=True,
                    )
        except Exception:
            pass

    return {"data": record, "meta": {}}


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
