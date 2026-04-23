"""Tests for 0G Storage proxy fallback endpoint."""

from __future__ import annotations

import os

import pytest
from unittest.mock import patch


@pytest.mark.asyncio
async def test_proxy_upload_returns_403_when_byok_active():
    """BYOK mode (default) should return 403 with guidance to use frontend upload."""
    with patch.dict(os.environ, {"ZEROG_FRONTEND_DIRECT": "true"}):
        # Re-import to pick up the env var
        import importlib
        from shadowflow.integrations import zerog_storage

        importlib.reload(zerog_storage)

        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await zerog_storage.upload_via_proxy("test-run-id")
        assert exc_info.value.status_code == 403
        assert "BYOK" in exc_info.value.detail


@pytest.mark.asyncio
async def test_proxy_upload_returns_501_when_byok_disabled():
    """When BYOK is disabled, the proxy endpoint should return 501 (not yet implemented)."""
    with patch.dict(os.environ, {"ZEROG_FRONTEND_DIRECT": "false"}):
        import importlib
        from shadowflow.integrations import zerog_storage

        importlib.reload(zerog_storage)

        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await zerog_storage.upload_via_proxy("test-run-id")
        assert exc_info.value.status_code == 501
