import logging
import os
import re
from pathlib import Path
from uuid import uuid4
import yaml
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Literal, Optional
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from shadowflow.api._limiter import limiter

from shadowflow.runtime.errors import ShadowflowError
from shadowflow.runtime.health import (
    check_all_agents,
    health_results_to_dict,
    log_agent_health_warnings,
)
from shadowflow.runtime.events import RunEventBus, format_sse_event
from shadowflow.runtime import (
    ActivationTrainingDataset,
    ArtifactLineageProjection,
    ChatMessageRequest,
    ChatSession,
    ChatSessionCreateRequest,
    ChatSessionRecord,
    ChatTurnResult,
    ChildRunRequest,
    CheckpointLineageProjection,
    MemoryRelationProjection,
    ResumeRequest,
    RunGraph,
    RunResult,
    RunSummary,
    RuntimeRequest,
    RuntimeService,
    TaskTreeProjection,
    WorkflowDefinition,
    WorkflowGraph,
    WorkflowValidationResult,
)
from shadowflow.runtime.contracts import RunTrajectory, TrajectoryBundle, WorkflowAssemblySpec, WorkflowPolicyMatrixSpec
from shadowflow.runtime.errors import PolicyMismatch
from shadowflow.runtime.sanitize import sanitize_trajectory, RemovedField
from shadowflow.runtime.trajectory import build_run_trajectory, build_trajectory_bundle
from shadowflow.assembly.compile import compile as compile_workflow_spec, CompilationError
from shadowflow.highlevel import WorkflowTemplateSpec

logger = logging.getLogger("shadowflow.server")


def _internal_error(exc: Exception) -> HTTPException:
    """Return a safe 500 error envelope — never exposes exc message to clients."""
    trace_id = uuid4().hex
    logger.exception("Internal error [trace=%s]", trace_id, exc_info=exc)
    return HTTPException(
        status_code=500,
        detail={"error": {"code": "INTERNAL_ERROR", "message": "An internal error occurred", "trace_id": trace_id}},
    )


def _client_error(status_code: int, exc: Exception, code: str = "CLIENT_ERROR") -> HTTPException:
    """Return a structured client error envelope (400/404). Safe to expose exc message."""
    return HTTPException(
        status_code=status_code,
        detail={"error": {"code": code, "message": str(exc)}},
    )


# ---------------------------------------------------------------------------
# Template Registry (T1: AC2 + AC3)
# ---------------------------------------------------------------------------

_SEED_DIR = Path("templates")
_CUSTOM_DIR = Path("templates/custom")
_TEMPLATE_ID_RE = re.compile(r"^[a-z0-9-]{3,40}$")


def _load_template_file(path: Path, source: str) -> Optional[Dict[str, Any]]:
    """Load and validate a single template YAML file. Returns None on failure."""
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        spec = WorkflowTemplateSpec.model_validate(raw)
        return {"spec": spec, "source": source, "mtime": path.stat().st_mtime}
    except Exception as exc:
        logger.warning("Skipping template file %s: %s", path, exc)
        return None


def _list_templates() -> List[Dict[str, Any]]:
    """Return all loaded templates (seed + custom) as list of dicts with spec+source+mtime."""
    results: List[Dict[str, Any]] = []
    # Seed: templates/*.yaml (not recursing into subdirs)
    if _SEED_DIR.is_dir():
        for p in sorted(_SEED_DIR.glob("*.yaml")):
            entry = _load_template_file(p, "seed")
            if entry:
                results.append(entry)
    # Custom: templates/custom/*.yaml sorted by mtime descending
    if _CUSTOM_DIR.is_dir():
        custom_paths = sorted(_CUSTOM_DIR.glob("*.yaml"), key=lambda p: p.stat().st_mtime, reverse=True)
        for p in custom_paths:
            entry = _load_template_file(p, "custom")
            if entry:
                results.append(entry)
    return results


def _get_template(template_id: str) -> Optional[Dict[str, Any]]:
    """Return a single template dict with spec+source, checking custom first then seed."""
    custom_path = _CUSTOM_DIR / f"{template_id}.yaml"
    if custom_path.exists():
        return _load_template_file(custom_path, "custom")
    seed_path = _SEED_DIR / f"{template_id}.yaml"
    if seed_path.exists():
        return _load_template_file(seed_path, "seed")
    return None


# ---------------------------------------------------------------------------
# Template Pydantic models
# ---------------------------------------------------------------------------

class TemplateListItem(BaseModel):
    template_id: str
    name: str
    user_role: str
    default_ops_room_name: str
    brief_board_alias: str
    theme_color: str
    agent_roster_count: int
    group_roster_count: int
    source: Literal["seed", "custom"]
    # Builder-generated template fields (Story 8.6) — empty string / empty list when not from Builder
    builder_origin: str = ""
    workflow_id: str = ""
    description: str = ""
    # R2-Patch-1: kit_tags was missing from server model — frontend TemplateListItem already has it
    kit_tags: List[str] = Field(default_factory=list)


class SanitizeRequest(BaseModel):
    trajectory: Dict[str, Any]


class SanitizeResponse(BaseModel):
    cleaned_trajectory: Dict[str, Any]
    removed_fields: List[Dict[str, str]]
    had_matches: bool


class CustomTemplateImportRequest(BaseModel):
    yaml_text: str
    overrides: Optional[Dict[str, Any]] = None


class GapResponseRequest(BaseModel):
    node_id: str
    gap_choice: Literal["A", "B", "C"]
    user_input: Optional[str] = None

app = FastAPI(title="ShadowFlow API", version="0.3.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
run_event_bus = RunEventBus()
runtime_service = RuntimeService(event_bus=run_event_bus)

# --------------------------------------------------------------------
# Epic 4 observability routers (Stories 4.7 / 4.8 / 4.9)
# --------------------------------------------------------------------

from shadowflow.api import ops as _ops_api
from shadowflow.api import archive as _archive_api
from shadowflow.api import policy_observability as _policy_obs_api
from shadowflow.api import inbox as _inbox_api
from shadowflow.api import groups as _groups_api
from shadowflow.api import approvals as _approvals_api
from shadowflow.api import builder as _builder_api
from shadowflow.api import catalog as _catalog_api
from shadowflow.api import tools as _tools_api
from shadowflow.api import knowledge as _knowledge_api
from shadowflow.api import citations as _citations_api
from shadowflow.api import memory as _memory_api
from shadowflow.api import state as _state_api
from shadowflow.api import evals as _evals_api
from shadowflow.integrations import zerog_storage as _zerog_storage_api
from shadowflow.api import agents as _agents_api
from shadowflow.api import teams as _teams_api
from shadowflow.api import registry as _registry_api
from shadowflow.api import acp_server as _acp_server_api
from shadowflow.api import sessions as _sessions_api
from shadowflow.api import workspaces as _workspaces_api
from shadowflow.api import chat as _chat_api
from shadowflow.api import a2a_bridge as _a2a_bridge_api
from shadowflow.api import schedules as _schedules_api
from shadowflow.api import settings as _settings_api
from shadowflow.api import wallet as _wallet_api

_ops_api.set_aggregator(_ops_api.OpsAggregator(
    runtime_service=runtime_service,
    event_bus=run_event_bus,
))
_archive_api.set_service(_archive_api.ArchiveService(runtime_service=runtime_service))
_policy_obs_api.set_aggregator(_policy_obs_api.PolicyObsAggregator(
    event_bus=run_event_bus,
    runtime_service=runtime_service,
))

_approvals_api.set_runtime_service(runtime_service)

app.include_router(_ops_api.router)
app.include_router(_archive_api.router)
app.include_router(_policy_obs_api.router)
app.include_router(_inbox_api.router)
app.include_router(_groups_api.router)
app.include_router(_approvals_api.router)
app.include_router(_zerog_storage_api.router)
app.include_router(_builder_api.router)
app.include_router(_catalog_api.router)
app.include_router(_tools_api.router)
app.include_router(_knowledge_api.router)
app.include_router(_citations_api.router)
app.include_router(_memory_api.router)
app.include_router(_state_api.router)
app.include_router(_evals_api.router)
app.include_router(_registry_api.router)  # before agents to avoid /{agent_id} catch-all
app.include_router(_agents_api.router)
app.include_router(_teams_api.router)
app.include_router(_acp_server_api.router)
app.include_router(_sessions_api.router)
app.include_router(_workspaces_api.router)
app.include_router(_chat_api.router)
# A2A bridge — only mounted when A2A_BRIDGE_ENABLED=true
if _a2a_bridge_api.A2A_BRIDGE_ENABLED:
    app.include_router(_a2a_bridge_api.router)
    logger.info("A2A bridge enabled: GET /.well-known/agent.json  POST /a2a/")
else:
    logger.debug("A2A bridge disabled (set A2A_BRIDGE_ENABLED=true to enable)")
from shadowflow.api.regression import router as _regression_router
app.include_router(_regression_router)
app.include_router(_schedules_api.router)
app.include_router(_settings_api.router)
app.include_router(_wallet_api.router)


@app.exception_handler(ShadowflowError)
async def shadowflow_error_handler(request: Request, exc: ShadowflowError) -> JSONResponse:
    trace_id = f"trace-{uuid4().hex[:12]}"
    logger.warning("ShadowflowError %s trace_id=%s: %s", exc.code, trace_id, exc.message)
    _status_map = {
        "POLICY_VIOLATION": 403,
        "PROVIDER_TIMEOUT": 504,
        "KNOWLEDGE_PACK_NOT_FOUND": 404,
        "KNOWLEDGE_PACK_INVALID_ID": 400,  # H2: malformed pack_id (path-traversal etc.)
        "KNOWLEDGE_PACK_INVALID": 500,     # H3: server-side schema corruption
        "CATALOG_APP_NOT_FOUND": 404,
        "CATALOG_BLUEPRINT_INVALID": 422,
        "CATALOG_SNAPSHOT_MISSING": 500,
        "CITATION_NOT_FOUND": 404,
        "STATE_CONFLICT": 409,
        "AGENT_STATE_NOT_FOUND": 404,
        "SNAPSHOT_NOT_FOUND": 404,
    }
    status = _status_map.get(exc.code, 400)
    return JSONResponse(
        status_code=status,
        content={"error": {**exc.to_dict(), "trace_id": trace_id}},
    )


# Story 0.1 AC2: start even when API keys are absent (BYOK policy, S1 red line).
# Keys are primarily supplied by the browser via localStorage; server-side slots
# exist only for offline bridge / CLI smoke. Missing keys surface as a warning.
_OPTIONAL_KEYS = ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY")


def _detect_missing_keys() -> List[str]:
    return [k for k in _OPTIONAL_KEYS if not os.environ.get(k)]


@app.on_event("startup")
async def _warn_on_missing_keys() -> None:
    missing = _detect_missing_keys()
    app.state.missing_keys = missing
    if missing:
        # Never log key values — only the names. Respects Cross-Cutting Security.
        logger.warning(
            "ShadowFlow starting without server-side keys: %s. "
            "UI will prompt the user to paste keys into localStorage (BYOK).",
            ", ".join(missing),
        )
    else:
        logger.info("ShadowFlow starting with all optional server-side keys present.")


@app.on_event("startup")
async def _discover_kits() -> None:
    """Discover and register all Agent Kits at startup (Story 10.5 C1).

    Replaces per-request scanning in /builder/kits endpoints.
    """
    from shadowflow.runtime.kits.registry import discover_and_register_kits

    imported = discover_and_register_kits()
    logger.info("KitRegistry: discovered %d Kit module(s) at startup", imported)


@app.on_event("startup")
async def _check_agent_binaries() -> None:
    """Check external agent binary availability; warn and cache results (Story 2.5)."""
    import asyncio

    results = await asyncio.to_thread(check_all_agents)
    app.state.agent_health = results
    log_agent_health_warnings(results)


@app.on_event("startup")
async def _start_scheduler() -> None:
    """Start APScheduler BackgroundScheduler and re-register any persisted schedules (14.2)."""
    try:
        from datetime import datetime, timezone
        from shadowflow.services.scheduler import start_scheduler
        from shadowflow.api.schedules import _list_schedules, _schedule_job
        from apscheduler.triggers.cron import CronTrigger
        from apscheduler.triggers.date import DateTrigger
    except ImportError:
        logger.warning("scheduler: APScheduler not installed — schedule feature disabled. Run: pip install 'APScheduler>=3.10,<4'")
        return

    scheduler = start_scheduler()
    app.state.scheduler = scheduler

    # Re-register persisted schedules after server restart. Branches:
    #   - cron_expression set  → CronTrigger (recurring)
    #   - start_at set         → DateTrigger (one-shot); skip if already past
    now = datetime.now(timezone.utc)
    for record in _list_schedules():
        sid = record.get("schedule_id")
        try:
            if record.get("cron_expression"):
                trigger = CronTrigger.from_crontab(record["cron_expression"])
            elif record.get("start_at"):
                run_date = datetime.fromisoformat(record["start_at"])
                if run_date.tzinfo is None:
                    run_date = run_date.replace(tzinfo=timezone.utc)
                if run_date < now or record.get("completed"):
                    continue   # one-shot already fired or in the past — leave as history
                trigger = DateTrigger(run_date=run_date)
            else:
                continue
            scheduler.add_job(_schedule_job, trigger=trigger, id=sid, args=[sid], replace_existing=True)
        except Exception as exc:
            logger.warning("scheduler: could not re-register schedule %s: %s", sid, exc)


@app.on_event("shutdown")
async def _stop_scheduler() -> None:
    """Shut down APScheduler gracefully (14.2)."""
    from shadowflow.services.scheduler import stop_scheduler
    stop_scheduler()


@app.middleware("http")
async def _missing_key_warning_header(request: Request, call_next):
    response = await call_next(request)
    missing = getattr(app.state, "missing_keys", None)
    if missing:
        # Clients (including the web UI) can read this header to decide whether
        # to prompt the user for a localStorage key. Comma-separated for easy parsing.
        response.headers["X-Shadowflow-Warning"] = "API key missing: " + ",".join(missing)
    return response


@app.middleware("http")
async def _security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    # X-XSS-Protection: 0 is the current best practice — the legacy "1; mode=block"
    # is deprecated and can introduce XSS vectors in older browsers.
    response.headers["X-XSS-Protection"] = "0"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# 配置 CORS — origins 由环境变量控制，不允许 wildcard + credentials 同时存在
_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,http://localhost:3007"
    ).split(",")
    if o.strip()
]

# Guard: wildcard origin + credentials is a CORS spec violation and a security hole.
if "*" in _ALLOWED_ORIGINS:
    raise RuntimeError(
        "CORS_ORIGINS must not contain '*' when allow_credentials=True. "
        "Set explicit origin(s) in the CORS_ORIGINS environment variable."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Last-Event-ID", "X-LLM-Key", "X-LLM-Provider", "X-LLM-Model"],
)

@app.get("/")
async def root():
    payload: Dict[str, Any] = {
        "name": "ShadowFlow",
        "version": "0.3.0",
        "status": "running",
        "capabilities": {
            "runtime": True,
            "workflow_graph": True,
            "run_panel": True,
            "chat_session": True,
        },
    }
    missing = getattr(app.state, "missing_keys", None)
    if missing:
        payload["warning"] = "API key missing"
        payload["missing_keys"] = missing
    return payload

@app.post("/workflow/compile")
@limiter.limit("20/minute")
async def compile_workflow(request: Request, spec: WorkflowAssemblySpec):
    """Compile a WorkflowAssemblySpec into a WorkflowDefinition (Story 3.4 AC2).

    Returns: {data: {definition, warnings}, meta: {}}
    Errors:  PolicyMismatch → HTTP 422
    """
    try:
        definition, warnings = compile_workflow_spec(spec)
        return {
            "data": {
                "definition": definition.model_dump(),
                "warnings": warnings,
            },
            "meta": {"workflow_id": spec.workflow_id},
        }
    except PolicyMismatch as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": exc.to_dict()},
        )
    except (ValueError, CompilationError) as exc:
        # P2-β fix: compile() raises ValueError (empty catalog) or CompilationError (bad executor);
        # return 422 with structured envelope, not a raw 500.
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "COMPILE_ERROR", "message": str(exc), "details": {}}},
        )
    except TypeError as exc:
        raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": str(exc)}})
    except Exception as exc:
        raise _internal_error(exc)


@app.post("/workflow/validate", response_model=WorkflowValidationResult)
async def validate_workflow(workflow: WorkflowDefinition):
    try:
        return runtime_service.validate_workflow(workflow)
    except ValueError as e:
        raise _client_error(400, e, "VALIDATION_ERROR")
    except Exception as e:
        raise _internal_error(e)


@app.post("/workflow/run", response_model=RunResult)
@limiter.limit("10/minute")
async def run_workflow(request: Request, body: RuntimeRequest):
    try:
        return await runtime_service.run(body)
    except ValueError as e:
        raise _client_error(400, e, "BAD_REQUEST")
    except Exception as e:
        raise _internal_error(e)


@app.post("/workflow/graph", response_model=WorkflowGraph)
async def export_workflow_graph(workflow: WorkflowDefinition):
    try:
        return runtime_service.export_workflow_graph(workflow)
    except ValueError as exc:
        raise _client_error(400, exc, "BAD_REQUEST")
    except Exception as exc:
        raise _internal_error(exc)


@app.get("/runs", response_model=List[RunSummary])
async def list_runs():
    return runtime_service.list_runs()


@app.get("/runs/{run_id}", response_model=RunResult)
async def get_run(run_id: str):
    result = runtime_service.get_run(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return result


class _PolicyUpdateRequest(BaseModel):
    matrix: WorkflowPolicyMatrixSpec


@app.post("/workflow/runs/{run_id}/policy")
async def update_run_policy(run_id: str, body: _PolicyUpdateRequest):
    """Story 4.5: hot-swap policy matrix on a running/completed run.

    Body: {"matrix": {...}}  — new sender×receiver matrix (3-state cells).
    Response: {"status": "updated", "affected_downstream_nodes": [...]}
    """
    try:
        return runtime_service.update_policy(run_id, body.matrix.model_dump())
    except ValueError as exc:
        raise _client_error(404, exc, "NOT_FOUND")
    except Exception as exc:
        raise _internal_error(exc)


@app.post("/workflow/runs/{run_id}/reconfigure")
async def reconfigure_run(run_id: str, body: Dict[str, Any]):
    """Story 4.6: add/remove agents + edges + matrix mid-run without full restart.

    Body: {"agents": [...], "edges": [...], "policy_matrix": {...}}
    Response: {"status": "reconfigured", "reused_node_outputs": [...], "new_nodes": [...], "removed_nodes": [...]}
    """
    try:
        return runtime_service.reconfigure(run_id, body)
    except ValueError as exc:
        raise _client_error(404, exc, "NOT_FOUND")
    except Exception as exc:
        raise _internal_error(exc)


@app.post("/workflow/runs/{run_id}/approval")
async def submit_approval(run_id: str, body: Dict[str, Any]):
    node_id = body.get("node_id")
    decision = body.get("decision")
    reason = body.get("reason", "")
    reviewer_role = body.get("reviewer_role")
    if not node_id or decision not in {"approve", "reject"}:
        raise HTTPException(status_code=422, detail="node_id and decision (approve|reject) are required")
    if decision == "reject":
        if not reviewer_role:
            raise HTTPException(status_code=422, detail="reviewer_role is required when decision is 'reject'")
        try:
            await runtime_service.reject(run_id, reviewer_role, node_id, reason)
        except ValueError as exc:
            raise _client_error(404, exc, "NOT_FOUND")
        return {"run_id": run_id, "node_id": node_id, "decision": decision, "accepted": True}
    ok = runtime_service.submit_approval(run_id, node_id, decision, reason)
    if not ok:
        raise HTTPException(status_code=404, detail=f"No approval gate waiting for run={run_id} node={node_id}")
    return {"run_id": run_id, "node_id": node_id, "decision": decision, "accepted": True}


@app.post("/workflow/runs/{run_id}/gap_response")
async def submit_gap_response(run_id: str, request: GapResponseRequest):
    ok = runtime_service.submit_gap_response(
        run_id,
        request.node_id,
        request.gap_choice,
        request.user_input,
    )
    if not ok:
        raise HTTPException(
            status_code=409,
            detail=f"Node is not waiting for gap input: run={run_id} node={request.node_id}",
        )
    return {
        "run_id": run_id,
        "node_id": request.node_id,
        "gap_choice": request.gap_choice,
        "accepted": True,
    }


@app.post("/workflow/runs/{run_id}/resume", response_model=RunResult)
async def workflow_resume_run(run_id: str):
    """Auto-resume from latest checkpoint (Story 1.4 AC#2).

    Finds the most recent checkpoint for the run and resumes from there.
    Already-completed non-invalidated nodes are skipped; invalidated nodes are re-executed.
    P6: rejects runs already in terminal state (succeeded/cancelled).
    P11: concurrent calls are serialised by the per-run asyncio.Lock inside service.resume().
    """
    # Use the public API — never access private _get_latest_checkpoint from the endpoint
    latest = runtime_service.get_latest_checkpoint_ref(run_id)
    if latest is None:
        raise HTTPException(status_code=404, detail=f"No checkpoint found for run={run_id}")

    resume_request = ResumeRequest(
        checkpoint_id=latest.checkpoint_id,
        metadata={"resumed_via": "auto"},
    )
    try:
        return await runtime_service.resume(run_id, resume_request)
    except ValueError as exc:
        raise _client_error(400, exc, "BAD_REQUEST")
    except Exception as exc:
        raise _internal_error(exc)


@app.get("/workflow/runs/{run_id}")
async def get_workflow_run_trajectory(
    run_id: str,
    format: Literal["summary", "trajectory"] = "summary",
):
    """Return run trajectory in summary or full bundle format (Story 1.5).

    ?format=summary (default) — {run, steps, handoffs, checkpoints, final_artifacts}
    ?format=trajectory        — adds workflow_yaml + policy_matrix (0G archival format)
    """
    result = runtime_service.get_run(run_id)
    if result is None:
        raise ShadowflowError(
            code="RUN_NOT_FOUND",
            message=f"Run not found: {run_id}",
        )

    if format == "trajectory":
        req_ctx = runtime_service.get_request_context(run_id)
        workflow = req_ctx.workflow if req_ctx is not None else None
        bundle = build_trajectory_bundle(result, workflow)
        data = bundle.model_dump(mode="json", exclude_none=True)
        if workflow is None:
            return {"data": data, "meta": {"format": "trajectory", "workflow_missing": True}}
        return {"data": data, "meta": {"format": "trajectory"}}

    trajectory = build_run_trajectory(result)
    return {"data": trajectory.model_dump(mode="json", exclude_none=True), "meta": {"format": "summary"}}


@app.post("/workflow/runs/{run_id}/trajectory/sanitize", response_model=SanitizeResponse)
async def sanitize_run_trajectory(run_id: str, body: SanitizeRequest):
    """Scan trajectory for PII / secrets before upload to 0G (Story 5.2 AC1)."""
    cleaned, removed = sanitize_trajectory(body.trajectory)
    return SanitizeResponse(
        cleaned_trajectory=cleaned,
        removed_fields=[
            {"path": r.path, "pattern": r.pattern, "sample_masked": r.sample_masked}
            for r in removed
        ],
        had_matches=len(removed) > 0,
    )


@app.post("/runs/{run_id}/children", response_model=RunResult)
@limiter.limit("10/minute")
async def spawn_child_run(request: Request, run_id: str, body: ChildRunRequest):
    try:
        return await runtime_service.spawn_child_run(run_id, body)
    except ValueError as exc:
        raise _client_error(404, exc, "NOT_FOUND")
    except Exception as exc:
        raise _internal_error(exc)


@app.get("/runs/{run_id}/graph", response_model=RunGraph)
async def get_run_graph(run_id: str):
    result = runtime_service.export_run_graph(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return result


@app.get("/runs/{run_id}/task-tree", response_model=TaskTreeProjection)
async def get_task_tree(run_id: str):
    result = runtime_service.export_task_tree(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return result


@app.get("/runs/{run_id}/artifact-lineage", response_model=ArtifactLineageProjection)
async def get_artifact_lineage(run_id: str):
    result = runtime_service.export_artifact_lineage(run_id=run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return result


@app.get("/runs/{run_id}/memory-graph", response_model=MemoryRelationProjection)
async def get_memory_relation_graph(run_id: str):
    result = runtime_service.export_memory_relation_graph(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return result


@app.get("/runs/{run_id}/checkpoint-lineage", response_model=CheckpointLineageProjection)
async def get_checkpoint_lineage(run_id: str):
    result = runtime_service.export_checkpoint_lineage(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return result


@app.get("/runs/{run_id}/training-dataset", response_model=ActivationTrainingDataset)
async def get_activation_training_dataset(run_id: str):
    result = runtime_service.export_activation_training_dataset(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return result


@app.get("/checkpoints/{checkpoint_id}")
async def get_checkpoint(checkpoint_id: str):
    checkpoint = runtime_service.get_checkpoint(checkpoint_id)
    if checkpoint is None:
        raise HTTPException(status_code=404, detail=f"Checkpoint not found: {checkpoint_id}")
    return checkpoint


@app.post("/runs/{run_id}/resume", response_model=RunResult)
async def resume_run(run_id: str, request: ResumeRequest):
    try:
        return await runtime_service.resume(run_id, request)
    except ValueError as exc:
        raise _client_error(404, exc, "NOT_FOUND")
    except Exception as exc:
        raise _internal_error(exc)


@app.get("/chat/sessions", response_model=List[ChatSessionRecord])
async def list_chat_sessions():
    return runtime_service.list_chat_sessions()


@app.post("/chat/sessions", response_model=ChatSession)
async def create_chat_session(request: ChatSessionCreateRequest):
    try:
        return runtime_service.create_chat_session(request)
    except ValueError as exc:
        raise _client_error(400, exc, "BAD_REQUEST")
    except Exception as exc:
        raise _internal_error(exc)


@app.get("/chat/sessions/{session_id}", response_model=ChatSession)
async def get_chat_session(session_id: str):
    session = runtime_service.get_chat_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Chat session not found: {session_id}")
    return session


@app.post("/chat/sessions/{session_id}/messages", response_model=ChatTurnResult)
@limiter.limit("30/minute")
async def send_chat_message(request: Request, session_id: str, body: ChatMessageRequest):
    try:
        return await runtime_service.send_chat_message(session_id, body)
    except ValueError as exc:
        raise _client_error(404, exc, "NOT_FOUND")
    except Exception as exc:
        raise _internal_error(exc)

@app.get("/workflow/runs/{run_id}/events")
async def stream_run_events(run_id: str, request: Request):
    """SSE endpoint — streams AgentEvent for a run (Story 2.6 / AR50).

    Supports Last-Event-ID header for reconnection without missing events.
    """
    last_event_id_raw = (
        request.headers.get("last-event-id")
        or request.headers.get("Last-Event-ID")
        or request.query_params.get("last_event_id")
    )
    last_seq: Optional[int] = None
    if last_event_id_raw is not None:
        try:
            last_seq = int(last_event_id_raw)
        except ValueError:
            pass

    async def _generate():
        async for seq, event in run_event_bus.subscribe(run_id, last_seq=last_seq):
            yield format_sse_event(seq, event)

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
async def health():
    agent_health_raw = getattr(app.state, "agent_health", None)
    agents_dict = health_results_to_dict(agent_health_raw) if agent_health_raw else {}
    return {"status": "healthy", "runtime": "contract", "agents": agents_dict}


# ---------------------------------------------------------------------------
# Template endpoints (Story 3.6.8)
# ---------------------------------------------------------------------------

@app.post("/templates/custom")
@limiter.limit("5/minute")
async def import_custom_template(request: Request, body: CustomTemplateImportRequest):
    """Import a YAML string as a custom template (AC1)."""
    # Step 1: parse YAML
    try:
        raw: Any = yaml.safe_load(body.yaml_text)
    except yaml.YAMLError:
        raise HTTPException(status_code=422, detail=[{"loc": ["yaml_text"], "msg": "Invalid YAML: parse error", "type": "yaml_error"}])

    if not isinstance(raw, dict):
        raise HTTPException(status_code=422, detail=[{"loc": ["yaml_text"], "msg": "YAML must be a mapping", "type": "value_error"}])

    # Step 2: apply overrides
    overrides = body.overrides or {}
    raw.update({k: v for k, v in overrides.items() if v is not None})

    # Step 3: validate
    try:
        spec = WorkflowTemplateSpec.model_validate(raw)
    except Exception as exc:
        from pydantic import ValidationError
        if isinstance(exc, ValidationError):
            raise HTTPException(status_code=422, detail=exc.errors())
        raise HTTPException(status_code=422, detail=[{"loc": [], "msg": "Template validation error", "type": "value_error"}])

    # Step 4: check template_id format
    tid = spec.template_id
    if not _TEMPLATE_ID_RE.match(tid):
        raise HTTPException(
            status_code=422,
            detail=[{"loc": ["template_id"], "msg": "must match ^[a-z0-9-]{3,40}$", "type": "value_error"}],
        )

    # Step 5: uniqueness check (seed first, then custom)
    seed_path = _SEED_DIR / f"{tid}.yaml"
    if seed_path.exists():
        raise HTTPException(status_code=409, detail={"detail": f"template_id '{tid}' already exists", "existing_source": "seed"})
    os.makedirs(_CUSTOM_DIR, exist_ok=True)
    custom_path = _CUSTOM_DIR / f"{tid}.yaml"
    # Security: prevent path traversal
    if custom_path.resolve().parent != _CUSTOM_DIR.resolve():
        raise HTTPException(status_code=422, detail=[{"loc": ["template_id"], "msg": "invalid template_id", "type": "value_error"}])
    if custom_path.exists():
        raise HTTPException(status_code=409, detail={"detail": f"template_id '{tid}' already exists", "existing_source": "custom"})

    # Step 6: persist
    yaml_out = yaml.safe_dump(spec.model_dump(mode="json"), allow_unicode=True, sort_keys=False, default_flow_style=False)
    custom_path.write_text(yaml_out, encoding="utf-8")

    return {**spec.model_dump(mode="json"), "source": "custom"}


@app.get("/templates", response_model=List[TemplateListItem])
async def list_templates():
    """List all templates (seed + custom) with summary fields (AC2)."""
    items: List[TemplateListItem] = []
    for entry in _list_templates():
        spec: WorkflowTemplateSpec = entry["spec"]
        meta = spec.metadata or {}
        items.append(TemplateListItem(
            template_id=spec.template_id,
            name=spec.name,
            user_role=spec.user_role,
            default_ops_room_name=spec.default_ops_room_name,
            brief_board_alias=spec.brief_board_alias,
            theme_color=spec.theme_color,
            agent_roster_count=len(spec.agent_roster),
            group_roster_count=len(spec.group_roster),
            source=entry["source"],
            builder_origin=str(meta.get("builder_origin", "")),
            workflow_id=str(meta.get("workflow_id", "")),
            description=spec.description,
            # R2-Patch-1: populate kit_tags from metadata (non-Builder templates get empty list)
            kit_tags=[str(t) for t in (meta.get("kit_tags") or []) if t],
        ))
    return items


@app.get("/templates/{template_id}")
async def get_template(template_id: str):
    """Return full template spec + source field (AC3)."""
    entry = _get_template(template_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")
    spec: WorkflowTemplateSpec = entry["spec"]
    return {**spec.model_dump(mode="json"), "source": entry["source"]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
