"""Operations overview endpoints (Story 4.7).

Four aggregated endpoints:
  - GET /ops/kpi?window=24h|7d|30d|all
  - GET /agents/health
  - GET /providers/load
  - GET /approvals/pending

Data is aggregated from the in-memory RuntimeService + RunEventBus with a
15-minute TTL cache (small dict; no new dependencies).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------


class KPIDelta(BaseModel):
    value: str
    driver: Optional[str] = None


class OpsKPI(BaseModel):
    active_runs: int
    pending_approvals: int
    avg_latency_p95_ms: float
    rejection_rate_pct: float
    deltas: Dict[str, KPIDelta] = Field(default_factory=dict)


class AgentHealth(BaseModel):
    agent_id: str
    name: str
    kind: Literal["acp", "cli", "mcp", "local"] = "local"
    model: str = ""
    status: Literal["online", "degraded", "offline"] = "online"
    queue_depth: int = 0
    p95_ms: float = 0.0
    trend_14pt: List[int] = Field(default_factory=list)


class ProviderLoad(BaseModel):
    provider_id: str
    name: str
    model_count: int = 0
    p95_ms: float = 0.0
    tee_verified: bool = False
    load_pct: int = 0
    fallback_priority: int = 0


class PendingApproval(BaseModel):
    run_id: str
    template: str = ""
    sender: str = ""
    receiver: str = ""
    policy_name: str = ""
    field: str = ""
    waiting_seconds: int = 0
    assignee: str = ""


# ---------------------------------------------------------------------------
# Aggregator with TTL cache
# ---------------------------------------------------------------------------


_TTL_SECONDS = 15 * 60


@dataclass
class _CacheEntry:
    value: Any
    expires_at: float


@dataclass
class OpsAggregator:
    runtime_service: Any = None
    event_bus: Any = None
    provider_manager: Any = None
    cache: Dict[str, _CacheEntry] = field(default_factory=dict)

    # ---- cache helpers ----
    def _cached(self, key: str) -> Optional[Any]:
        entry = self.cache.get(key)
        if entry is None:
            return None
        if time.time() >= entry.expires_at:
            self.cache.pop(key, None)
            return None
        return entry.value

    def _store(self, key: str, value: Any) -> Any:
        self.cache[key] = _CacheEntry(value=value, expires_at=time.time() + _TTL_SECONDS)
        return value

    def clear_cache(self) -> None:
        self.cache.clear()

    # ---- aggregations ----
    def kpi(self, window: str = "24h") -> OpsKPI:
        cache_key = f"kpi:{window}"
        cached = self._cached(cache_key)
        if cached is not None:
            return cached

        runs = self._list_runs()
        active = sum(1 for r in runs if r.get("status") in {"accepted", "running", "waiting", "paused", "awaiting_approval"})
        rejected = sum(1 for r in runs if r.get("status") == "failed")
        rate = (rejected / len(runs) * 100.0) if runs else 0.0
        p95 = self._compute_provider_p95()
        pending = len(self.pending_approvals())

        kpi = OpsKPI(
            active_runs=active,
            pending_approvals=pending,
            avg_latency_p95_ms=p95,
            rejection_rate_pct=round(rate, 1),
            deltas={},
        )
        return self._store(cache_key, kpi)

    def agents_health(self) -> List[AgentHealth]:
        cache_key = "agents_health"
        cached = self._cached(cache_key)
        if cached is not None:
            return cached

        agents: List[AgentHealth] = []

        # Prefer a registry if the runtime service exposes one
        registry = getattr(self.runtime_service, "_registry", None) \
            or getattr(self.runtime_service, "registry", None)
        if registry is not None and hasattr(registry, "list_agent_health"):
            try:
                raw = registry.list_agent_health()
                for a in raw:
                    agents.append(AgentHealth(**a) if isinstance(a, dict) else AgentHealth.model_validate(a))
            except Exception:
                agents = []

        # Fall back to runtime.health known providers so UI always has data
        if not agents:
            try:
                from shadowflow.runtime.health import check_all_agents
                raw = check_all_agents()
                for provider, result in raw.items():
                    agents.append(AgentHealth(
                        agent_id=provider,
                        name=provider.title(),
                        kind="cli",
                        model=result.version or "",
                        status="online" if result.ok else "offline",
                        queue_depth=0,
                        p95_ms=0.0,
                        trend_14pt=[],
                    ))
            except Exception:
                agents = []

        return self._store(cache_key, agents)

    def providers_load(self) -> List[ProviderLoad]:
        cache_key = "providers_load"
        cached = self._cached(cache_key)
        if cached is not None:
            return cached

        loads: List[ProviderLoad] = []
        if self.provider_manager is not None and hasattr(self.provider_manager, "list_providers"):
            try:
                for idx, p in enumerate(self.provider_manager.list_providers()):
                    loads.append(ProviderLoad(
                        provider_id=str(getattr(p, "id", idx)),
                        name=str(getattr(p, "name", f"provider_{idx}")),
                        model_count=int(getattr(p, "model_count", 1)),
                        p95_ms=float(getattr(p, "p95_ms", 0.0)),
                        tee_verified=bool(getattr(p, "tee_verified", False)),
                        load_pct=int(getattr(p, "load_pct", 0)),
                        fallback_priority=idx,
                    ))
            except Exception:
                pass

        return self._store(cache_key, loads)

    def pending_approvals(self) -> List[PendingApproval]:
        cache_key = "pending_approvals"
        cached = self._cached(cache_key)
        if cached is not None:
            return cached

        pending: List[PendingApproval] = []
        approval_events = getattr(self.runtime_service, "_approval_events", {}) if self.runtime_service else {}
        for (run_id, node_id), evt in approval_events.items():
            # evt is an asyncio.Event; if not yet set, it is still pending
            if hasattr(evt, "is_set") and not evt.is_set():
                pending.append(PendingApproval(
                    run_id=run_id,
                    template="",
                    sender="",
                    receiver=node_id,
                    policy_name="default",
                    field="",
                    waiting_seconds=0,
                    assignee="",
                ))

        return self._store(cache_key, pending)

    # ---- helpers ----
    def _list_runs(self) -> List[Dict[str, Any]]:
        svc = self.runtime_service
        if svc is None:
            return []
        try:
            summaries = svc.list_runs()
            return [s.model_dump() if hasattr(s, "model_dump") else dict(s) for s in summaries]
        except Exception:
            return []

    def _compute_provider_p95(self) -> float:
        loads = self.providers_load()
        if not loads:
            return 0.0
        vals = [p.p95_ms for p in loads if p.p95_ms]
        return round(sum(vals) / len(vals), 2) if vals else 0.0


# ---------------------------------------------------------------------------
# FastAPI router
# ---------------------------------------------------------------------------


router = APIRouter(tags=["ops"])


def _get_aggregator_factory():
    """Default factory: attached by app via router.state-like singleton."""
    return None


_AGGREGATOR_SINGLETON: Optional[OpsAggregator] = None


def get_aggregator() -> OpsAggregator:
    global _AGGREGATOR_SINGLETON
    if _AGGREGATOR_SINGLETON is None:
        _AGGREGATOR_SINGLETON = OpsAggregator()
    return _AGGREGATOR_SINGLETON


def set_aggregator(agg: OpsAggregator) -> None:
    global _AGGREGATOR_SINGLETON
    _AGGREGATOR_SINGLETON = agg


_WINDOWS = {"24h", "7d", "30d", "all"}


@router.get("/ops/kpi")
async def get_kpi(window: str = Query("24h")):
    if window not in _WINDOWS:
        raise HTTPException(status_code=422, detail=f"window must be one of {_WINDOWS}")
    agg = get_aggregator()
    kpi = agg.kpi(window)
    return {"data": kpi.model_dump(), "meta": {"window": window}}


@router.get("/agents/health", response_model=List[AgentHealth])
async def get_agents_health():
    agg = get_aggregator()
    return agg.agents_health()


@router.get("/providers/load", response_model=List[ProviderLoad])
async def get_providers_load():
    agg = get_aggregator()
    return agg.providers_load()


@router.get("/approvals/pending", response_model=List[PendingApproval])
async def get_approvals_pending():
    agg = get_aggregator()
    return agg.pending_approvals()
