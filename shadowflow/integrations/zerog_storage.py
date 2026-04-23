"""
0G Storage proxy fallback — disabled by default (BYOK mode).

Only enabled when ZEROG_FRONTEND_DIRECT=false. Returns 403 otherwise,
reminding the caller that BYOK mode is active.
"""

from __future__ import annotations

import logging
import os

from fastapi import APIRouter, HTTPException

logger = logging.getLogger("shadowflow.integrations.zerog_storage")

router = APIRouter(tags=["0g-storage"])

_FRONTEND_DIRECT = os.getenv("ZEROG_FRONTEND_DIRECT", "true").lower() in ("true", "1", "yes")


@router.post("/workflow/runs/{run_id}/trajectory/upload_via_proxy")
async def upload_via_proxy(run_id: str) -> dict:
    if _FRONTEND_DIRECT:
        raise HTTPException(
            status_code=403,
            detail=(
                "BYOK mode is active — trajectory upload must happen directly "
                "from the browser via the 0G SDK. Set ZEROG_FRONTEND_DIRECT=false "
                "to enable backend proxy upload."
            ),
        )

    raise HTTPException(
        status_code=501,
        detail="Backend proxy upload is not yet implemented. Use frontend BYOK upload.",
    )
