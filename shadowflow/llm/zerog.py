"""0G Compute Provider — 第 5 provider (AR13).

通过 0G Compute Network 调用去中心化 LLM 推理（DeepSeek V3.1, Qwen, Gemma 等）。
底层使用 httpx 发送 OpenAI-compatible 请求，通过 Node.js bridge 调用 broker SDK
处理签名 header 和 processResponse 费用结算。

0G Skill 契约(ALWAYS/NEVER):
  - processResponse(providerAddress, chatID, usageData) 每次推理后必调，参数顺序不得颠倒
  - ChatID 从 ZG-Res-Key header 提取，data.id 仅作 chatbot fallback
  - 私钥仅从 .env 加载
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, Optional

import httpx

from .base import LLMConfig, LLMProvider, LLMResponse, Message, ProviderType
from ..runtime.errors import (
    InsufficientBalanceError,
    MissingChatIdError,
    ProviderUnavailableError,
)

logger = logging.getLogger(__name__)

_BRIDGE_SCRIPT = str(Path(__file__).resolve().parents[2] / "scripts" / "zerog_broker_bridge.mjs")
_BRIDGE_TIMEOUT = 30


class ZeroGBrokerBridge:
    """Thin wrapper around the Node.js broker bridge subprocess."""

    def __init__(
        self,
        *,
        rpc_url: str,
        private_key: str,
        provider_address: str,
    ) -> None:
        self._env = {
            **os.environ,
            "ZEROG_RPC_URL": rpc_url,
            "ZEROG_PRIVATE_KEY": private_key,
            "ZEROG_PROVIDER_ADDRESS": provider_address,
        }
        self._provider_address = provider_address

    async def _call(self, command: str, *args: str) -> Dict[str, Any]:
        cmd = [self._find_node(), _BRIDGE_SCRIPT, command, *args]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=self._env,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=_BRIDGE_TIMEOUT
            )
        except asyncio.TimeoutError:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass
            raise ProviderUnavailableError(
                "0G broker bridge timed out",
                details={"command": command},
            )
        except FileNotFoundError:
            raise ProviderUnavailableError(
                "Node.js not found — required for 0G Compute broker bridge",
            )

        if proc.returncode != 0:
            err_msg = stderr.decode().strip() if stderr else "unknown error"
            try:
                err_data = json.loads(err_msg)
                err_msg = err_data.get("error", err_msg)
            except json.JSONDecodeError:
                pass
            raise ProviderUnavailableError(
                f"0G broker bridge error: {err_msg}",
                details={"command": command, "returncode": proc.returncode},
            )

        raw = stdout.decode()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            raise ProviderUnavailableError(
                f"0G broker bridge returned invalid JSON: {raw[:200]}",
                details={"command": command},
            )

    @staticmethod
    def _find_node() -> str:
        if sys.platform == "win32":
            return "node.exe"
        return "node"

    async def get_metadata(self) -> Dict[str, str]:
        return await self._call("metadata", self._provider_address)

    async def get_headers(self) -> Dict[str, str]:
        result = await self._call("headers", self._provider_address)
        return result.get("headers", {})

    async def process_response(
        self, chat_id: str, usage_data: str
    ) -> None:
        if not isinstance(chat_id, str) or not chat_id:
            raise ValueError("chatID must be non-empty string")
        if not isinstance(usage_data, str):
            raise ValueError("usageData must be JSON string")
        await self._call(
            "process",
            self._provider_address,  # 1st: providerAddress
            chat_id,                 # 2nd: chatID
            usage_data,              # 3rd: usageData (JSON string)
        )

    async def acknowledge(self) -> None:
        await self._call("acknowledge", self._provider_address)

    async def check_balance(self) -> Dict[str, str]:
        return await self._call("balance", self._provider_address)


class ZeroGComputeProvider(LLMProvider):
    """0G Compute Network LLM Provider (AR13 第 5 provider)."""

    def __init__(self, config: LLMConfig) -> None:
        super().__init__(config)
        self._provider_type = ProviderType.ZERO_G

        rpc_url = os.getenv("ZEROG_RPC_URL", "https://evmrpc-testnet.0g.ai")
        private_key = os.getenv("ZEROG_PRIVATE_KEY", "")
        provider_address = os.getenv("ZEROG_PROVIDER_ADDRESS", "")

        if not private_key:
            raise ProviderUnavailableError(
                "ZEROG_PRIVATE_KEY not set in .env"
            )
        if not provider_address:
            raise ProviderUnavailableError(
                "ZEROG_PROVIDER_ADDRESS not set in .env"
            )

        self._bridge = ZeroGBrokerBridge(
            rpc_url=rpc_url,
            private_key=private_key,
            provider_address=provider_address,
        )
        self._provider_address = provider_address

        self._endpoint: Optional[str] = None
        self._model_name: Optional[str] = None
        self._acknowledged = False

        self._http = httpx.AsyncClient(timeout=config.timeout)

    async def _ensure_ready(self) -> None:
        if not self._acknowledged:
            await self._bridge.acknowledge()
            balance = await self._bridge.check_balance()
            avail = int(balance.get("available_balance", "0"))
            if avail <= 0:
                raise InsufficientBalanceError(
                    "0G Compute 账户余额不足，请充值",
                    details={"available_balance": balance.get("available_balance", "0")},
                )
            self._acknowledged = True
        if self._endpoint is None:
            try:
                meta = await self._bridge.get_metadata()
                self._endpoint = meta["endpoint"]
                self._model_name = meta["model"]
            except KeyError as e:
                raise ProviderUnavailableError(
                    f"0G provider metadata missing required field: {e}",
                )

    @staticmethod
    def extract_chat_id(
        response_headers: httpx.Headers,
        response_body: Dict[str, Any],
    ) -> str:
        """ChatID 提取 — ZG-Res-Key header 优先，data.id fallback（硬契约）。"""
        chat_id = (
            response_headers.get("ZG-Res-Key")
            or response_headers.get("zg-res-key")
        )
        if not chat_id:
            chat_id = response_body.get("id")
        if not chat_id:
            raise MissingChatIdError(
                "0G response missing ZG-Res-Key header and data.id"
            )
        return str(chat_id)

    async def _do_process_response(
        self, chat_id: str, usage: Any, *, fire_and_forget: bool = False
    ) -> None:
        """processResponse 必调 — 参数顺序: (providerAddress, chatID, usageData)。"""
        usage_str = json.dumps(usage) if not isinstance(usage, str) else usage
        try:
            await self._bridge.process_response(chat_id, usage_str)
        except Exception:
            if fire_and_forget:
                logger.warning(
                    "processResponse failed for chatID=%s — fee settlement may be pending",
                    chat_id,
                    exc_info=True,
                )
            else:
                raise

    async def _post_chat(
        self,
        messages: list[Dict[str, str]],
        config: Dict[str, Any],
        stream: bool = False,
    ) -> httpx.Response:
        await self._ensure_ready()
        headers = await self._bridge.get_headers()
        headers["Content-Type"] = "application/json"

        body: Dict[str, Any] = {
            "messages": messages,
            "model": self._model_name or self.config.model,
            "temperature": config.get("temperature", self.config.temperature),
            "max_tokens": config.get("max_tokens", self.config.max_tokens),
        }
        if stream:
            body["stream"] = True

        return await self._http.post(
            f"{self._endpoint}/chat/completions",
            headers=headers,
            json=body,
            timeout=self.config.timeout,
        )

    def _to_api_messages(self, messages: list) -> list[Dict[str, str]]:
        api_msgs: list[Dict[str, str]] = []
        for msg in messages:
            if isinstance(msg, Message):
                api_msgs.append(msg.to_dict())
            elif isinstance(msg, dict):
                api_msgs.append(msg)
            else:
                raise ValueError(f"Invalid message type: {type(msg)}")
        return api_msgs

    async def generate(self, prompt: str, **kwargs: Any) -> LLMResponse:
        config = self._merge_config(**kwargs)
        messages = [{"role": "user", "content": prompt}]
        return await self._chat_impl(messages, config)

    async def stream(self, prompt: str, **kwargs: Any) -> AsyncGenerator[str, None]:
        messages = [{"role": "user", "content": prompt}]
        async for chunk in self._stream_impl(messages, **kwargs):
            yield chunk

    async def chat(self, messages: list, **kwargs: Any) -> LLMResponse:
        config = self._merge_config(**kwargs)
        api_messages = self._to_api_messages(messages)
        return await self._chat_impl(api_messages, config)

    async def chat_stream(
        self, messages: list, **kwargs: Any
    ) -> AsyncGenerator[str, None]:
        api_messages = self._to_api_messages(messages)
        async for chunk in self._stream_impl(api_messages, **kwargs):
            yield chunk

    async def _chat_impl(
        self, messages: list[Dict[str, str]], config: Dict[str, Any]
    ) -> LLMResponse:
        try:
            response = await self._post_chat(messages, config, stream=False)
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 402:
                raise InsufficientBalanceError(
                    "0G Compute 余额不足,请充值"
                )
            raise RuntimeError(f"0G Compute API error: {e}")
        except httpx.TimeoutException:
            raise RuntimeError("0G Compute request timed out")

        data = response.json()
        chat_id = self.extract_chat_id(response.headers, data)

        choices = data.get("choices", [])
        if not choices:
            raise RuntimeError("0G Compute returned empty choices array")
        choice = choices[0]
        content = choice["message"]["content"] or ""
        usage = data.get("usage", {})

        # processResponse 必调 (AR35)
        await self._do_process_response(chat_id, usage)

        return LLMResponse(
            content=content,
            model=data.get("model", self.config.model),
            provider=self.provider_type,
            tokens_used=usage.get("total_tokens", 0),
            finish_reason=choice.get("finish_reason", "stop"),
            metadata={
                "prompt_tokens": usage.get("prompt_tokens", 0),
                "completion_tokens": usage.get("completion_tokens", 0),
                "chat_id": chat_id,
                "provider_address": self._provider_address,
            },
        )

    async def _stream_impl(
        self, messages: list[Dict[str, str]], **kwargs: Any
    ) -> AsyncGenerator[str, None]:
        config = self._merge_config(**kwargs)
        try:
            response = await self._post_chat(messages, config, stream=True)
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 402:
                raise InsufficientBalanceError(
                    "0G Compute 余额不足,请充值"
                )
            raise RuntimeError(f"0G Compute API stream error: {e}")

        chat_id = (
            response.headers.get("ZG-Res-Key")
            or response.headers.get("zg-res-key")
        )
        stream_chat_id: Optional[str] = None
        usage: Optional[Dict[str, Any]] = None
        full_content = ""

        try:
            async for line in response.aiter_lines():
                stripped = line.strip()
                if not stripped or stripped == "data: [DONE]":
                    continue
                json_str = stripped[5:].strip() if stripped.startswith("data:") else stripped
                try:
                    chunk = json.loads(json_str)
                    if not stream_chat_id and chunk.get("id"):
                        stream_chat_id = chunk["id"]
                    if chunk.get("usage"):
                        usage = chunk["usage"]
                    delta_content = (
                        chunk.get("choices", [{}])[0]
                        .get("delta", {})
                        .get("content")
                    )
                    if delta_content:
                        full_content += delta_content
                        yield delta_content
                except json.JSONDecodeError:
                    continue
        finally:
            final_chat_id = chat_id or stream_chat_id
            if final_chat_id:
                await self._do_process_response(
                    final_chat_id, usage or {}, fire_and_forget=True
                )
            else:
                logger.error(
                    "0G stream ended without ChatID — processResponse skipped, fee may be pending"
                )
