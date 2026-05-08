"""Agent Catalog API — Story 8.7

3 endpoints, all wrapped in the shared `{data, meta}` envelope:
  - GET  /catalog/apps                 — list+filter+search+page
  - GET  /catalog/apps/{app_id}        — sanitized detail
  - POST /catalog/apps/{app_id}/fork   — clone snapshot → new Blueprint

Errors flow through the existing ShadowflowError handler in shadowflow.server,
which maps them to {error: {...}} JSON envelopes.
"""
from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import uuid4

from fastapi import APIRouter, Query

from shadowflow.runtime.catalog_service import (
    CatalogService,
    get_service,
    redact_blueprint_snapshot,
)


router = APIRouter(prefix="/catalog", tags=["catalog"])


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _ok(data: Any, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {"data": data, "meta": meta or {}}


# ---------------------------------------------------------------------------
# endpoints
# ---------------------------------------------------------------------------


@router.get("/apps")
async def list_apps(
    kit_type: str = Query("all"),
    q: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Dict[str, Any]:
    """List published Catalog apps with optional filter / search / pagination."""
    svc: CatalogService = get_service()
    result = svc.list_apps(kit_type=kit_type, q=q, page=page, page_size=page_size)
    return _ok(
        data={"apps": result["apps"]},
        meta={
            "total": result["total"],
            "page": result["page"],
            "page_size": result["page_size"],
            "kit_type": kit_type,
            "q": q,
        },
    )


@router.get("/apps/{app_id}")
async def get_app(app_id: str) -> Dict[str, Any]:
    """Return sanitized detail for a single Catalog app (AC3 — no sensitive fields)."""
    svc: CatalogService = get_service()
    detail = svc.get_app(app_id)
    return _ok(
        data=detail.model_dump(mode="json"),
        meta={"trace_id": f"trace-{uuid4().hex[:12]}"},
    )


@router.post("/apps/{app_id}/fork")
async def fork_app(app_id: str) -> Dict[str, Any]:
    """Fork a Catalog app into a new editable Blueprint (AC6)."""
    svc: CatalogService = get_service()
    result = svc.fork_app(app_id)
    return _ok(
        data={
            "blueprint_id": result.blueprint_id,
            "forked_from": result.forked_from,
            "blueprint": redact_blueprint_snapshot(result.blueprint.model_dump(mode="json")),
        },
        meta={"trace_id": f"trace-{uuid4().hex[:12]}"},
    )
