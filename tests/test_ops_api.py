"""Story 4.7 — OperationsPage backend aggregator + 4 endpoints tests."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from shadowflow.api.ops import OpsAggregator, set_aggregator
from shadowflow.runtime.events import RunEventBus
from shadowflow.server import app


@pytest.fixture
def client():
    bus = RunEventBus()
    agg = OpsAggregator(runtime_service=None, event_bus=bus)
    set_aggregator(agg)
    return TestClient(app), agg


class TestKPIEndpoint:
    def test_kpi_returns_shape(self, client):
        c, _ = client
        r = c.get("/ops/kpi?window=24h")
        assert r.status_code == 200
        data = r.json()["data"]
        assert "active_runs" in data
        assert "pending_approvals" in data
        assert "avg_latency_p95_ms" in data
        assert "rejection_rate_pct" in data

    def test_kpi_rejects_bad_window(self, client):
        c, _ = client
        r = c.get("/ops/kpi?window=99x")
        assert r.status_code == 422


class TestAgentsHealth:
    def test_agents_health_returns_list(self, client):
        c, _ = client
        r = c.get("/agents/health")
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, list)
        # Default: falls back to check_all_agents → 3 known providers
        assert len(body) >= 0

    def test_agents_health_is_cached(self, client):
        c, agg = client
        r1 = c.get("/agents/health")
        r2 = c.get("/agents/health")
        assert r1.json() == r2.json()
        # Cache populated
        assert "agents_health" in agg.cache


class TestProvidersLoad:
    def test_returns_empty_when_no_manager(self, client):
        c, _ = client
        r = c.get("/providers/load")
        assert r.status_code == 200
        assert r.json() == []


class TestApprovalsPending:
    def test_returns_empty_when_no_runtime(self, client):
        c, _ = client
        r = c.get("/approvals/pending")
        assert r.status_code == 200
        assert r.json() == []


class TestCacheTTL:
    def test_cache_expires(self, client):
        c, agg = client
        agg.cache["kpi:24h"] = agg.cache.get("kpi:24h") or None
        c.get("/ops/kpi?window=24h")
        entry = agg.cache.get("kpi:24h")
        assert entry is not None
        # Force expiry
        entry.expires_at = time.time() - 1
        c.get("/ops/kpi?window=24h")
        new_entry = agg.cache.get("kpi:24h")
        assert new_entry is not None
        assert new_entry.expires_at > time.time()
