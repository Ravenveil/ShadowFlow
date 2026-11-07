"""FastAPI routers for Epic 4 fleet-level observability (Stories 4.7/4.8/4.9)
and Epic 9 knowledge endpoints (Story 9.1)."""

from shadowflow.api.dashboard.ops import router as ops_router, OpsAggregator
from shadowflow.api.runs.archive import router as archive_router, ArchiveService
from shadowflow.api.quality.policy_observability import (
    router as policy_obs_router,
    PolicyObsAggregator,
)
# 2026-11-07 知识库统一批：旧 KnowledgePack API（/api/knowledge）随知识库统一到
# 多模态记忆库（/api/memory-bank）后下线。
from shadowflow.api.runs.runs import router as runs_router

__all__ = [
    "ops_router",
    "archive_router",
    "policy_obs_router",
    "runs_router",
    "OpsAggregator",
    "ArchiveService",
    "PolicyObsAggregator",
]
