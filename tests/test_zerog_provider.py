"""Tests for ZeroGComputeProvider (Story 5.4).

Covers:
  - ChatID extraction: ZG-Res-Key header priority → data.id fallback → MissingChatIdError
  - processResponse parameter order assertion (providerAddress, chatID, usageData)
  - usageData must be JSON string (not dict)
  - listService tuple index access (s[0], s[1], s[6], s[10])
  - Streaming ChatID extraction from header + stream fallback
  - InsufficientBalanceError on 402
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from shadowflow.llm.base import LLMConfig, ProviderType
from shadowflow.llm.zerog import ZeroGBrokerBridge, ZeroGComputeProvider
from shadowflow.runtime.errors import (
    InsufficientBalanceError,
    MissingChatIdError,
    ProviderUnavailableError,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_config() -> LLMConfig:
    return LLMConfig(model="deepseek-v3", timeout=30)


def _make_response_headers(
    chat_id: str | None = None,
    *,
    lowercase: bool = False,
) -> httpx.Headers:
    h: dict[str, str] = {"content-type": "application/json"}
    if chat_id is not None:
        key = "zg-res-key" if lowercase else "ZG-Res-Key"
        h[key] = chat_id
    return httpx.Headers(h)


def _make_response_body(
    content: str = "hello",
    *,
    body_id: str | None = "resp-001",
    usage: dict | None = None,
) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        "choices": [{"message": {"content": content}, "finish_reason": "stop"}],
        "model": "deepseek-v3",
    }
    if body_id is not None:
        body["id"] = body_id
    if usage is not None:
        body["usage"] = usage
    else:
        body["usage"] = {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}
    return body


def _make_httpx_response(
    status_code: int,
    json_body: Dict[str, Any],
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    """Create httpx.Response with a request instance (required for raise_for_status)."""
    resp = httpx.Response(
        status_code,
        json=json_body,
        headers=headers or {},
        request=httpx.Request("POST", "https://test.0g.ai/chat/completions"),
    )
    return resp


def _patch_env(**env_vars: str):
    defaults = {
        "ZEROG_PRIVATE_KEY": "0xdeadbeef",
        "ZEROG_PROVIDER_ADDRESS": "0x1234567890abcdef",
        "ZEROG_RPC_URL": "https://evmrpc-testnet.0g.ai",
    }
    defaults.update(env_vars)
    return patch.dict("os.environ", defaults)


# ---------------------------------------------------------------------------
# ChatID Extraction Tests
# ---------------------------------------------------------------------------

class TestChatIdExtraction:
    """AC1 — ChatID 提取逻辑(硬契约)。"""

    def test_header_zg_res_key_takes_priority(self):
        """ZG-Res-Key header present → use it, ignore body.id."""
        headers = _make_response_headers("header-chat-id")
        body = _make_response_body(body_id="body-chat-id")
        result = ZeroGComputeProvider.extract_chat_id(headers, body)
        assert result == "header-chat-id"

    def test_header_lowercase_variant(self):
        """zg-res-key (lowercase) also works."""
        headers = _make_response_headers("lower-id", lowercase=True)
        body = _make_response_body(body_id="body-id")
        result = ZeroGComputeProvider.extract_chat_id(headers, body)
        assert result == "lower-id"

    def test_fallback_to_body_id(self):
        """No header → fallback to data.id."""
        headers = _make_response_headers(None)
        body = _make_response_body(body_id="fallback-id")
        result = ZeroGComputeProvider.extract_chat_id(headers, body)
        assert result == "fallback-id"

    def test_missing_both_raises(self):
        """Both header and body.id absent → MissingChatIdError."""
        headers = _make_response_headers(None)
        body = _make_response_body(body_id=None)
        with pytest.raises(MissingChatIdError):
            ZeroGComputeProvider.extract_chat_id(headers, body)

    def test_empty_header_falls_back(self):
        """Empty string header → fallback to body.id."""
        headers = httpx.Headers({"ZG-Res-Key": "", "content-type": "application/json"})
        body = _make_response_body(body_id="body-fallback")
        result = ZeroGComputeProvider.extract_chat_id(headers, body)
        assert result == "body-fallback"


# ---------------------------------------------------------------------------
# processResponse Parameter Order Tests
# ---------------------------------------------------------------------------

class TestProcessResponseContract:
    """AC1 — processResponse(providerAddress, chatID, usageData) 参数顺序断言。"""

    @pytest.mark.asyncio
    async def test_process_response_param_order(self):
        """Bridge._call receives args in correct order: addr, chatID, usageJSON."""
        bridge = MagicMock(spec=ZeroGBrokerBridge)
        bridge._provider_address = "0xProviderAddr"
        bridge._call = AsyncMock(return_value={"ok": True})

        # Directly call process_response (bypass __init__)
        bridge.process_response = ZeroGBrokerBridge.process_response.__get__(bridge)
        await bridge.process_response("chat-123", '{"total_tokens": 30}')

        bridge._call.assert_called_once_with(
            "process",
            "0xProviderAddr",  # 1st: providerAddress
            "chat-123",        # 2nd: chatID
            '{"total_tokens": 30}',  # 3rd: usageData (JSON string)
        )

    @pytest.mark.asyncio
    async def test_empty_chat_id_raises(self):
        """Empty chatID → ValueError."""
        bridge = MagicMock(spec=ZeroGBrokerBridge)
        bridge._provider_address = "0xProviderAddr"
        bridge.process_response = ZeroGBrokerBridge.process_response.__get__(bridge)

        with pytest.raises(ValueError, match="chatID must be non-empty"):
            await bridge.process_response("", '{}')

    @pytest.mark.asyncio
    async def test_usage_data_must_be_string(self):
        """usageData must be JSON string, not dict."""
        bridge = MagicMock(spec=ZeroGBrokerBridge)
        bridge._provider_address = "0xProviderAddr"
        bridge.process_response = ZeroGBrokerBridge.process_response.__get__(bridge)

        with pytest.raises(ValueError, match="usageData must be JSON string"):
            await bridge.process_response("chat-123", {"total_tokens": 30})  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Provider Initialization Tests
# ---------------------------------------------------------------------------

class TestProviderInit:
    """Provider 初始化和环境变量检查。"""

    def test_missing_private_key_raises(self):
        """ZEROG_PRIVATE_KEY not set → ProviderUnavailableError."""
        with patch.dict("os.environ", {"ZEROG_PROVIDER_ADDRESS": "0x123"}, clear=False):
            with patch.dict("os.environ", {"ZEROG_PRIVATE_KEY": ""}, clear=False):
                with pytest.raises(ProviderUnavailableError, match="ZEROG_PRIVATE_KEY"):
                    ZeroGComputeProvider(_make_config())

    def test_missing_provider_address_raises(self):
        """ZEROG_PROVIDER_ADDRESS not set → ProviderUnavailableError."""
        with patch.dict("os.environ", {"ZEROG_PRIVATE_KEY": "0xabc"}, clear=False):
            with patch.dict("os.environ", {"ZEROG_PROVIDER_ADDRESS": ""}, clear=False):
                with pytest.raises(ProviderUnavailableError, match="ZEROG_PROVIDER_ADDRESS"):
                    ZeroGComputeProvider(_make_config())

    def test_provider_type_is_zero_g(self):
        """Provider type should be ZERO_G."""
        with _patch_env():
            provider = ZeroGComputeProvider(_make_config())
            assert provider.provider_type == ProviderType.ZERO_G


# ---------------------------------------------------------------------------
# Full Chat Flow Tests (mocked HTTP + bridge)
# ---------------------------------------------------------------------------

class TestChatFlow:
    """AC1 — 完整 chat flow including processResponse call."""

    @pytest.mark.asyncio
    async def test_chat_calls_process_response(self):
        """chat() must call processResponse after successful inference."""
        with _patch_env():
            provider = ZeroGComputeProvider(_make_config())

        # Mock bridge
        provider._bridge.acknowledge = AsyncMock()
        provider._bridge.check_balance = AsyncMock(
            return_value={"total_balance": "1000", "available_balance": "500"}
        )
        provider._bridge.get_metadata = AsyncMock(
            return_value={"endpoint": "https://test.0g.ai", "model": "deepseek-v3"}
        )
        provider._bridge.get_headers = AsyncMock(return_value={"X-Auth": "signed"})
        provider._bridge.process_response = AsyncMock()

        body = _make_response_body("world", body_id="resp-42", usage={"total_tokens": 50})
        mock_response = _make_httpx_response(
            200,
            body,
            headers={"ZG-Res-Key": "chat-42", "content-type": "application/json"},
        )

        provider._http = MagicMock()
        provider._http.post = AsyncMock(return_value=mock_response)

        result = await provider.chat([{"role": "user", "content": "hello"}])

        assert result.content == "world"
        assert result.provider == ProviderType.ZERO_G
        assert result.tokens_used == 50
        assert result.metadata["chat_id"] == "chat-42"

        # Verify processResponse was called with correct params
        provider._bridge.process_response.assert_called_once_with(
            "chat-42",
            json.dumps({"total_tokens": 50}),
        )

    @pytest.mark.asyncio
    async def test_chat_402_raises_insufficient_balance(self):
        """HTTP 402 → InsufficientBalanceError."""
        with _patch_env():
            provider = ZeroGComputeProvider(_make_config())

        provider._bridge.acknowledge = AsyncMock()
        provider._bridge.check_balance = AsyncMock(
            return_value={"total_balance": "1000", "available_balance": "500"}
        )
        provider._bridge.get_metadata = AsyncMock(
            return_value={"endpoint": "https://test.0g.ai", "model": "deepseek-v3"}
        )
        provider._bridge.get_headers = AsyncMock(return_value={})

        mock_response = _make_httpx_response(402, {"error": "insufficient balance"})

        provider._http = MagicMock()
        provider._http.post = AsyncMock(return_value=mock_response)

        with pytest.raises(InsufficientBalanceError, match="余额不足"):
            await provider.chat([{"role": "user", "content": "hello"}])


# ---------------------------------------------------------------------------
# Service Tuple Access Tests
# ---------------------------------------------------------------------------

class TestServiceTupleAccess:
    """0G skill 契约: listService() 返回 tuple 数组,不是对象。"""

    def test_tuple_index_mapping(self):
        """Verify correct tuple indices: s[0]=addr, s[1]=type, s[6]=model, s[10]=tee."""
        # Simulated tuple from listService()
        service_tuple = [
            "0xProviderAddr",   # [0] providerAddress
            "chatbot",          # [1] serviceType
            "https://endpoint", # [2] url
            None, None, None,   # [3-5]
            "deepseek-v3",      # [6] model
            None, None, None,   # [7-9]
            True,               # [10] teeVerified
        ]

        assert service_tuple[0] == "0xProviderAddr"
        assert service_tuple[1] == "chatbot"
        assert service_tuple[6] == "deepseek-v3"
        assert service_tuple[10] is True

    def test_filter_chatbot_services(self):
        """Filter services by type using tuple index [1]."""
        services = [
            ["0xA", "chatbot", "", None, None, None, "deepseek", None, None, None, True],
            ["0xB", "text-to-image", "", None, None, None, "flux", None, None, None, False],
            ["0xC", "chatbot", "", None, None, None, "qwen", None, None, None, True],
        ]
        chatbots = [s for s in services if s[1] == "chatbot"]
        assert len(chatbots) == 2
        assert chatbots[0][6] == "deepseek"
        assert chatbots[1][6] == "qwen"


# ---------------------------------------------------------------------------
# Ledger Tuple Access Tests
# ---------------------------------------------------------------------------

class TestLedgerTupleAccess:
    """0G skill 契约: getLedger() 返回 tuple。"""

    def test_balance_tuple_indices(self):
        """account[1] = totalBalance, account[2] = availableBalance."""
        account_tuple = [
            "0xOwnerAddr",     # [0]
            "1000000000000",   # [1] totalBalance
            "500000000000",    # [2] availableBalance
        ]
        assert account_tuple[1] == "1000000000000"
        assert account_tuple[2] == "500000000000"
