"""FastAPI routers for Epic 4 fleet-level observability (Stories 4.7/4.8/4.9)
and Epic 9 knowledge endpoints (Story 9.1)."""

from shadowflow.api.ops import router as ops_router, OpsAggregator
from shadowflow.api.archive import router as archive_router, ArchiveService
from shadowflow.api.policy_observability import (
    router as policy_obs_router,
    PolicyObsAggregator,
)
from shadowflow.api.knowledge import (
    router as knowledge_router,
    KnowledgeService,
)

__all__ = [
    "ops_router",
    "archive_router",
    "policy_obs_router",
    "knowledge_router",
    "OpsAggregator",
    "ArchiveService",
    "PolicyObsAggregator",
    "KnowledgeService",
]
