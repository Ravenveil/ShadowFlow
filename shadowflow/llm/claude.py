"""
Claude API 实现

使用 anthropic SDK 调用 Claude API
"""

import asyncio
from typing import Dict, Any, AsyncGenerator, Optional

try:
    import anthropic
except ImportError:
    anthropic = None

from .base import LLMProvider, LLMResponse, LLMConfig, ProviderType, Message


class ClaudeProvider(LLMProvider):
    """Claude API Provider"""

    def __init__(self, config: LLMConfig):
        super().__init__(config)
        self._provider_type = ProviderType.CLAUDE

        if anthropic is None:
            raise ImportError(
                "anthropic package is required. Install it with: pip install anthropic"
            )

        if not config.api_key:
            raise ValueError("api_key is required for Claude provider")

        self.client = anthropic.AsyncAnthropic(
            api_key=config.api_key,
            timeout=config.timeout,
        )

    async def generate(self, prompt: str, **kwargs) -> LLMResponse:
        """生成响应"""
        config = self._merge_config(**kwargs)

        try:
            response = await self.client.messages.create(
                model=self.config.model,
                max_tokens=config.get("max_tokens", self.config.max_tokens),
                temperature=config.get("temperature", self.config.temperature),
                messages=[{"role": "user", "content": prompt}],
            )

            content = ""
            for block in response.content:
                if hasattr(block, "text"):
                    content += block.text

            return LLMResponse(
                content=content,
                model=response.model,
                provider=self.provider_type,
                tokens_used=response.usage.input_tokens + response.usage.output_tokens,
                finish_reason=response.stop_reason,
                metadata={
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                    "id": response.id,
                },
            )
        except anthropic.APIError as e:
            raise RuntimeError(f"Claude API error: {e}")
        except Exception as e:
            raise RuntimeError(f"Claude provider error: {e}")

    async def stream(self, prompt: str, **kwargs) -> AsyncGenerator[str, None]:
        """流式生成"""
        config = self._merge_config(**kwargs)

        try:
            async with self.client.messages.stream(
                model=self.config.model,
                max_tokens=config.get("max_tokens", self.config.max_tokens),
                temperature=config.get("temperature", self.config.temperature),
                messages=[{"role": "user", "content": prompt}],
            ) as stream:
                async for text in stream.text_stream:
                    yield text
        except anthropic.APIError as e:
            raise RuntimeError(f"Claude API stream error: {e}")
        except Exception as e:
            raise RuntimeError(f"Claude provider stream error: {e}")

    async def chat(self, messages: list, **kwargs) -> LLMResponse:
        """对话模式"""
        config = self._merge_config(**kwargs)

        # 转换消息格式
        api_messages = []
        system_message = None

        for msg in messages:
            if isinstance(msg, Message):
                msg_dict = msg.to_dict()
            elif isinstance(msg, dict):
                msg_dict = msg
            else:
                raise ValueError(f"Invalid message type: {type(msg)}")

            if msg_dict["role"] == "system":
                system_message = msg_dict["content"]
            else:
                api_messages.append({"role": msg_dict["role"], "content": msg_dict["content"]})

        try:
            create_kwargs = {
                "model": self.config.model,
                "max_tokens": config.get("max_tokens", self.config.max_tokens),
                "temperature": config.get("temperature", self.config.temperature),
                "messages": api_messages,
            }

            if system_message:
                create_kwargs["system"] = system_message

            response = await self.client.messages.create(**create_kwargs)

            content = ""
            for block in response.content:
                if hasattr(block, "text"):
                    content += block.text

            return LLMResponse(
                content=content,
                model=response.model,
                provider=self.provider_type,
                tokens_used=response.usage.input_tokens + response.usage.output_tokens,
                finish_reason=response.stop_reason,
                metadata={
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                    "id": response.id,
                },
            )
        except anthropic.APIError as e:
            raise RuntimeError(f"Claude API chat error: {e}")
        except Exception as e:
            raise RuntimeError(f"Claude provider chat error: {e}")

    async def chat_stream(self, messages: list, **kwargs) -> AsyncGenerator[str, None]:
        """对话模式流式生成"""
        config = self._merge_config(**kwargs)

        # 转换消息格式
        api_messages = []
        system_message = None

        for msg in messages:
            if isinstance(msg, Message):
                msg_dict = msg.to_dict()
            elif isinstance(msg, dict):
                msg_dict = msg
            else:
                raise ValueError(f"Invalid message type: {type(msg)}")

            if msg_dict["role"] == "system":
                system_message = msg_dict["content"]
            else:
                api_messages.append({"role": msg_dict["role"], "content": msg_dict["content"]})

        try:
            create_kwargs = {
                "model": self.config.model,
                "max_tokens": config.get("max_tokens", self.config.max_tokens),
                "temperature": config.get("temperature", self.config.temperature),
                "messages": api_messages,
            }

            if system_message:
                create_kwargs["system"] = system_message

            async with self.client.messages.stream(**create_kwargs) as stream:
                async for text in stream.text_stream:
                    yield text
        except anthropic.APIError as e:
            raise RuntimeError(f"Claude API chat stream error: {e}")
        except Exception as e:
            raise RuntimeError(f"Claude provider chat stream error: {e}")
