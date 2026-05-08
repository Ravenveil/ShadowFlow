"""Knowledge API — Story 9.1 AC4.

Routes:
  POST   /knowledge/packs                — create pack (async ingest)
  GET    /knowledge/packs                — list packs (limit / offset)
  GET    /knowledge/packs/{pack_id}      — single-pack detail
  PATCH  /knowledge/packs/{pack_id}      — update name / description / retrieval_profile
  DELETE /knowledge/packs/{pack_id}      — delete pack
  POST   /knowledge/packs/{pack_id}/reindex — force re-ingest

All success responses use the shared `{data, meta}` envelope.
All errors raise ShadowflowError → handled by the global handler in
`shadowflow.server`, which produces `{error: {code, message, trace_id}}`.

Hardening (post-review 2026-04-27):
  - C4 / H2: pack_id is a UUID-hex allowlist; non-matching IDs raise
    KnowledgePackInvalidId (400) instead of being conflated with NotFound (404).
  - C5 / H6: BG ingest re-checks pack existence before each save, logs failures,
    and flips status to "failed" instead of silently swallowing ShadowflowError.
  - H7: delete uses shutil.rmtree to handle nested directories (e.g. pdfplumber
    cache) cleanly.
  - H5: PATCH on retrieval_profile fields that affect chunking
    (chunk_size / overlap / mode) auto-enqueues a reindex so the persisted
    index stays consistent with the profile.
  - L2: timestamps emitted with the canonical `Z` UTC suffix.
  - M3: corrupted records on listing log a warning and surface a `meta.skipped`
    counter so operators can see ingestion drift.
  - C3 piggybacks: pack.json writes go through atomic_write_text + per-pack lock.
"""

from __future__ import annotations

import json
import logging
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Query
from pydantic import BaseModel, ConfigDict, Field

from shadowflow.memory.ingest_pipeline import (
    atomic_write_text,
    pack_lock,
    run_ingest,
)
from shadowflow.memory.knowledge_pack import (
    FreshnessPolicy,
    KnowledgePack,
    KnowledgeSource,
    SourceType,
    update_pack,
)
from shadowflow.memory.retrieval_profiles import RetrievalProfile
from shadowflow.runtime.errors import ShadowflowError


logger = logging.getLogger(__name__)


_KNOWLEDGE_DIR = Path(".shadowflow/knowledge")

# C4: pack_id allowlist. Production pack IDs are UUID4 hex (32 chars). Any
# user-supplied path that doesn't match is rejected with a distinct 400 error
# so attack attempts don't show up as 404s in audit logs.
_PACK_ID_RE = re.compile(r"^[a-f0-9]{32}$")


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class KnowledgePackNotFound(ShadowflowError):
    """Requested pack_id does not exist."""

    code = "KNOWLEDGE_PACK_NOT_FOUND"


class KnowledgePackInvalid(ShadowflowError):
    """Persisted pack record could not be validated against the current schema."""

    code = "KNOWLEDGE_PACK_INVALID"


class KnowledgePackInvalidId(ShadowflowError):
    """pack_id failed format / safety validation (e.g. path-traversal attempt)."""

    code = "KNOWLEDGE_PACK_INVALID_ID"


# ---------------------------------------------------------------------------
# Service (file-backed; mirrors CatalogService convention)
# ---------------------------------------------------------------------------


class KnowledgeService:
    """File-backed CRUD service for KnowledgePack."""

    def __init__(self, storage_dir: Optional[Path] = None) -> None:
        self._storage_dir = storage_dir or _KNOWLEDGE_DIR

    # -- storage helpers -------------------------------------------------

    def _ensure_dir(self) -> None:
        self._storage_dir.mkdir(parents=True, exist_ok=True)

    def _record_path(self, pack_id: str) -> Path:
        # C4: explicit allowlist instead of substring blocklist. UUID4 hex shape.
        if not pack_id or not _PACK_ID_RE.match(pack_id):
            raise KnowledgePackInvalidId(
                f"Invalid pack_id format: {pack_id!r} (expected 32-char hex UUID)",
                details={"pack_id": pack_id},
            )
        return self._storage_dir / pack_id / "pack.json"

    def pack_dir(self, pack_id: str) -> Path:
        """Return the per-pack storage directory; raises if pack_id is malformed."""
        return self._record_path(pack_id).parent

    def exists(self, pack_id: str) -> bool:
        """Cheap existence check used by the BG task before each save (C5)."""
        try:
            return self._record_path(pack_id).exists()
        except ShadowflowError:
            return False

    def save(self, pack: KnowledgePack) -> KnowledgePack:
        """Atomically persist `pack`. Holds the per-pack lock so concurrent
        BG ingests don't lose updates (C3)."""
        self._ensure_dir()
        target = self._record_path(pack.pack_id)
        with pack_lock(pack.pack_id):
            atomic_write_text(
                target,
                json.dumps(pack.model_dump(mode="json"), ensure_ascii=False, indent=2),
            )
        return pack

    def load(self, pack_id: str) -> KnowledgePack:
        target = self._record_path(pack_id)
        if not target.exists():
            raise KnowledgePackNotFound(
                f"KnowledgePack not found: {pack_id}",
                details={"pack_id": pack_id},
            )
        try:
            payload = json.loads(target.read_text(encoding="utf-8"))
            return KnowledgePack.model_validate(payload)
        except json.JSONDecodeError as exc:
            raise KnowledgePackInvalid(
                f"KnowledgePack record corrupted for {pack_id}: {exc}",
                details={"pack_id": pack_id},
            ) from exc
        except ValueError as exc:  # pydantic validation
            raise KnowledgePackInvalid(
                f"KnowledgePack record failed validation for {pack_id}: {exc}",
                details={"pack_id": pack_id},
            ) from exc

    def delete(self, pack_id: str) -> None:
        self._record_path(pack_id)  # validate pack_id format first (raises on bad IDs)
        # H7: shutil.rmtree handles arbitrarily nested directories (e.g. cache
        # subdirs from optional parsers). Hold the per-pack lock so a BG ingest
        # mid-flight can't recreate the directory after we wipe it (C5 partner).
        # P4: exists() check moved inside the lock to avoid TOCTOU on concurrent
        # DELETE (two concurrent requests both pass exists(), second rmtree raises
        # FileNotFoundError which we convert to NotFound rather than 500).
        with pack_lock(pack_id):
            target = self._record_path(pack_id)
            if not target.exists():
                raise KnowledgePackNotFound(
                    f"KnowledgePack not found: {pack_id}",
                    details={"pack_id": pack_id},
                )
            try:
                shutil.rmtree(target.parent, ignore_errors=False)
            except FileNotFoundError:
                raise KnowledgePackNotFound(
                    f"KnowledgePack not found: {pack_id}",
                    details={"pack_id": pack_id},
                )

    def list(self, limit: int = 20, offset: int = 0) -> Dict[str, Any]:
        """List packs ordered by created_at desc.

        Returns `{packs, total, limit, offset, skipped}`. `skipped` counts
        records that failed validation/parse — they're left on disk so an
        operator can investigate, but the route surfaces the count via meta
        so the UX doesn't silently drop packs (M3).
        """
        if not self._storage_dir.is_dir():
            return {"packs": [], "total": 0, "limit": limit, "offset": offset, "skipped": 0}

        items: List[KnowledgePack] = []
        skipped = 0
        for pack_dir in sorted(self._storage_dir.iterdir()):
            if not pack_dir.is_dir():
                continue
            target = pack_dir / "pack.json"
            if not target.exists():
                continue
            try:
                payload = json.loads(target.read_text(encoding="utf-8"))
                items.append(KnowledgePack.model_validate(payload))
            except (json.JSONDecodeError, ValueError, OSError) as exc:
                # OSError covers FileNotFoundError from a concurrent DELETE that
                # removed the file between iterdir() and read_text() (P5).
                skipped += 1
                logger.warning(
                    "KnowledgeService.list skipped corrupted record %s: %s",
                    pack_dir.name,
                    exc,
                )
                continue

        items.sort(key=lambda p: p.created_at, reverse=True)
        total = len(items)
        page = items[offset : offset + limit]
        return {
            "packs": [p.model_dump(mode="json") for p in page],
            "total": total,
            "limit": limit,
            "offset": offset,
            "skipped": skipped,
        }


# ---------------------------------------------------------------------------
# Service singleton
# ---------------------------------------------------------------------------

_SERVICE_SINGLETON: Optional[KnowledgeService] = None


def get_service() -> KnowledgeService:
    global _SERVICE_SINGLETON
    if _SERVICE_SINGLETON is None:
        _SERVICE_SINGLETON = KnowledgeService()
    return _SERVICE_SINGLETON


def set_service(svc: KnowledgeService) -> None:
    global _SERVICE_SINGLETON
    _SERVICE_SINGLETON = svc


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class KnowledgeSourceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source_type: SourceType
    source_ref: str = Field(min_length=1)
    mime_type: str = ""


class CreatePackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    sources: List[KnowledgeSourceInput] = Field(min_length=1)
    retrieval_profile: Optional[RetrievalProfile] = None
    citation_required: bool = False
    freshness_policy: FreshnessPolicy = "on_demand"


class UpdatePackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    retrieval_profile: Optional[RetrievalProfile] = None
    citation_required: Optional[bool] = None
    freshness_policy: Optional[FreshnessPolicy] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now() -> str:
    """ISO 8601 UTC with the canonical `Z` suffix (per .claude/rules/datetime.md, L2)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _rag_backend_label() -> str:
    """Return the active RAG backend label for response meta."""
    try:
        from shadowflow.runtime import lightrag_adapter  # noqa: PLC0415
        return lightrag_adapter.backend_label()
    except Exception:  # noqa: BLE001 — non-critical
        return "stub"


def _envelope(data: Any, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {
        "data": data,
        "meta": {
            "trace_id": f"trace-{uuid4().hex[:12]}",
            "timestamp": _now(),
            "rag_backend": _rag_backend_label(),
            **(meta or {}),
        },
    }


# Fields whose change requires a fresh ingest because they govern chunking/index
# semantics. Used by PATCH to auto-enqueue reindex (H5).
_REINDEX_TRIGGER_FIELDS: Tuple[str, ...] = ("chunk_size", "overlap", "mode")


def _profile_changes_require_reindex(
    old: RetrievalProfile, new: RetrievalProfile
) -> bool:
    return any(
        getattr(old, f) != getattr(new, f) for f in _REINDEX_TRIGGER_FIELDS
    )


def _reset_sources_for_reindex(pack: KnowledgePack) -> List[KnowledgeSource]:
    return [
        s.model_copy(
            update={
                "ingest_status": "pending",
                "error_message": "",
                "chunk_count": 0,
            }
        )
        for s in pack.sources
    ]


def _ingest_and_save(pack_id: str, svc: KnowledgeService) -> None:
    """Background task: load pack, mark indexing, run ingest, save final state.

    C5/H6: re-checks pack existence before EVERY save so a concurrent DELETE
    doesn't get its directory recreated by `mkdir(exist_ok=True)`. ShadowflowError
    no longer silently returns — failures are logged and (when possible) surfaced
    in the persisted pack record so the polling UI sees `failed` instead of
    spinning forever on `pending`/`indexing`.
    """
    # Hold the per-pack lock for the entire BG run so DELETE / PATCH / a second
    # ingest serialize cleanly. Anything that takes the same lock will block.
    with pack_lock(pack_id):
        try:
            pack = svc.load(pack_id)
        except KnowledgePackNotFound:
            logger.info(
                "BG ingest skipped: pack %s already deleted before start", pack_id
            )
            return
        except ShadowflowError as exc:
            logger.warning(
                "BG ingest aborted on load for %s: %s (%s)",
                pack_id,
                exc.message,
                exc.code,
            )
            return

        indexing = update_pack(pack, status="indexing")
        if not svc.exists(pack_id):
            logger.info("BG ingest aborted: pack %s removed before indexing", pack_id)
            return
        try:
            svc.save(indexing)
        except ShadowflowError as exc:
            logger.warning("BG ingest aborted on save(indexing) for %s: %s", pack_id, exc.message)
            return

        try:
            finished = run_ingest(indexing)
        except Exception as exc:
            logger.exception("BG ingest crashed for %s", pack_id)
            try:
                finished = update_pack(
                    indexing,
                    status="failed",
                    sources=[
                        {
                            **s.model_dump(),
                            "ingest_status": "failed",
                            "error_message": (
                                f"unexpected ingest error: {type(exc).__name__}: {exc}"
                            ),
                        }
                        for s in indexing.sources
                    ],
                )
            except Exception:  # pragma: no cover — last-resort guard
                logger.exception(
                    "BG ingest could not record failure state for %s", pack_id
                )
                return

        # C5: final guard — the pack might have been DELETEd while ingest was
        # parsing/indexing. Don't resurrect it.
        if not svc.exists(pack_id):
            logger.info(
                "BG ingest discarded result: pack %s deleted during run", pack_id
            )
            return
        try:
            svc.save(finished)
        except ShadowflowError as exc:  # pragma: no cover — defensive
            logger.warning(
                "BG ingest could not save final state for %s: %s",
                pack_id,
                exc.message,
            )


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.post("/packs")
async def create_pack(
    payload: CreatePackRequest,
    background_tasks: BackgroundTasks,
) -> Dict[str, Any]:
    svc = get_service()

    sources = [
        KnowledgeSource(
            source_type=s.source_type,
            source_ref=s.source_ref,
            mime_type=s.mime_type,
        )
        for s in payload.sources
    ]
    pack = KnowledgePack(
        name=payload.name,
        description=payload.description,
        sources=sources,
        retrieval_profile=payload.retrieval_profile or RetrievalProfile(),
        citation_required=payload.citation_required,
        freshness_policy=payload.freshness_policy,
        status="pending",
    )
    svc.save(pack)
    background_tasks.add_task(_ingest_and_save, pack.pack_id, svc)
    return _envelope(pack.model_dump(mode="json"))


@router.get("/packs")
async def list_packs(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    svc = get_service()
    page = svc.list(limit=limit, offset=offset)
    return _envelope(
        data={"packs": page["packs"]},
        meta={
            "total": page["total"],
            "limit": page["limit"],
            "offset": page["offset"],
            "skipped": page["skipped"],
        },
    )


@router.get("/packs/{pack_id}")
async def get_pack(pack_id: str) -> Dict[str, Any]:
    svc = get_service()
    pack = svc.load(pack_id)
    return _envelope(pack.model_dump(mode="json"))


@router.patch("/packs/{pack_id}")
async def patch_pack(
    pack_id: str,
    payload: UpdatePackRequest,
    background_tasks: BackgroundTasks,
) -> Dict[str, Any]:
    svc = get_service()

    # P3: hold the per-pack lock across the entire load→compute→save sequence so
    # a concurrent BG ingest cannot overwrite our changes (or vice-versa). The
    # lock is an RLock so the nested svc.save() that also acquires it is safe.
    needs_reindex = False
    with pack_lock(pack_id):
        pack = svc.load(pack_id)

        changes: Dict[str, Any] = {}
        if payload.name is not None:
            changes["name"] = payload.name
        if payload.description is not None:
            changes["description"] = payload.description
        if payload.retrieval_profile is not None:
            if _profile_changes_require_reindex(pack.retrieval_profile, payload.retrieval_profile):
                needs_reindex = True
            changes["retrieval_profile"] = payload.retrieval_profile
        if payload.citation_required is not None:
            changes["citation_required"] = payload.citation_required
        if payload.freshness_policy is not None:
            changes["freshness_policy"] = payload.freshness_policy

        if needs_reindex:
            # H5: chunking-relevant changes invalidate the persisted index. Reset
            # sources to pending and enqueue a fresh ingest so the index stays in
            # sync with the new profile.
            changes["sources"] = [s.model_dump() for s in _reset_sources_for_reindex(pack)]
            changes["status"] = "pending"

        updated = update_pack(pack, **changes)
        svc.save(updated)

    if needs_reindex:
        background_tasks.add_task(_ingest_and_save, updated.pack_id, svc)
    return _envelope(updated.model_dump(mode="json"))


@router.delete("/packs/{pack_id}")
async def delete_pack(pack_id: str) -> Dict[str, Any]:
    svc = get_service()
    svc.delete(pack_id)
    # Best-effort cleanup of LightRAG index dir (no-op when LIGHTRAG_ENABLED is false).
    try:
        from shadowflow.runtime import lightrag_adapter  # noqa: PLC0415
        lightrag_adapter.delete_pack_index(pack_id)
    except Exception:  # noqa: BLE001 — cleanup is non-critical
        logger.debug("lightrag_adapter.delete_pack_index skipped for %s", pack_id)
    return _envelope({"deleted": True, "pack_id": pack_id})


@router.post("/packs/{pack_id}/reindex")
async def reindex_pack(
    pack_id: str,
    background_tasks: BackgroundTasks,
) -> Dict[str, Any]:
    svc = get_service()
    # P3: same load→save lock guard as patch_pack to prevent lost-update race.
    with pack_lock(pack_id):
        pack = svc.load(pack_id)
        reset_sources = _reset_sources_for_reindex(pack)
        pack = update_pack(pack, sources=[s.model_dump() for s in reset_sources], status="pending")
        svc.save(pack)
    background_tasks.add_task(_ingest_and_save, pack.pack_id, svc)
    return _envelope(pack.model_dump(mode="json"))


__all__ = [
    "router",
    "KnowledgeService",
    "get_service",
    "set_service",
    "KnowledgePackNotFound",
    "KnowledgePackInvalid",
    "KnowledgePackInvalidId",
]
