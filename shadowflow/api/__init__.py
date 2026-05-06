"""FastAPI routers for Epic 4 fleet-level observability (Stories 4.7/4.8/4.9)."""

from shadowflow.api.ops import router as ops_router, OpsAggregator
from shadowflow.api.archive import router as archive_router, ArchiveService
from shadowflow.api.policy_observability import (
    router as policy_obs_router,
    PolicyObsAggregator,
)

__all__ = [
    "ops_router",
    "archive_router",
    "policy_obs_router",
    "OpsAggregator",
    "ArchiveService",
    "PolicyObsAggregator",
]
