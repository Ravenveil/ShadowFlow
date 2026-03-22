"""
OpenAI/DeepSeek API 实现

使用 openai SDK，支持 OpenAI 和 DeepSeek（通过 base_url 切换）
"""

import asyncio
from typing import Dict, Any, AsyncGenerator

try:
    import openai
except ImportError:
    openai = None

from .base import LLMProvider, LLMResponse, LLMConfig, ProviderType, Message


class OpenAIProvider(LLMProvider):
    """OpenAI/DeepSeek API Provider"""

    def __init__(self, config: LLMConfig):
        super().__init__(config)
        self._provider_type = ProviderType.OPENAI

        if openai is None:
            raise ImportError(
                "openai package is required. Install it with: pip install openai"
            )

        if not config.api_key:
            raise ValueError("api_key is required for OpenAI provider")

        # 检测是否为 DeepSeek
        if config.base_url and "deepseek" in config.base_url.lower():
            self._provider_type = ProviderType.DEEPSEEK

        # 使用 base_url（如果提供）
        client_kwargs = {
            "api_key": config.api_key,
            "timeout": config.timeout,
        }

        if config.base_url:
            client_kwargs["base_url"] = config.base_url

        self.client = openai.AsyncOpenAI(**client_kwargs)

    async def generate(self, prompt: str, **kwargs) -> LLMResponse:
        """生成响应"""
        config = self._merge_config(**kwargs)

        try:
            response = await self.client.chat.completions.create(
                model=self.config.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=config.get("temperature", self.config.temperature),
                max_tokens=config.get("max_tokens", self.config.max_tokens),
            )

            choice = response.choices[0]
            content = choice.message.content or ""

            return LLMResponse(
                content=content,
                model=response.model,
                provider=self.provider_type,
                tokens_used=response.usage.total_tokens if response.usage else 0,
                finish_reason=choice.finish_reason or "stop",
                metadata={
                    "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                    "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                    "id": response.id,
                },
            )
        except openai.APIError as e:
            raise RuntimeError(f"OpenAI API error: {e}")
        except Exception as e:
            raise RuntimeError(f"OpenAI provider error: {e}")

    async def stream(self, prompt: str, **kwargs) -> AsyncGenerator[str, None]:
        """流式生成"""
        config = self._merge_config(**kwargs)

        try:
            stream = await self.client.chat.completions.create(
                model=self.config.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=config.get("temperature", self.config.temperature),
                max_tokens=config.get("max_tokens", self.config.max_tokens),
                stream=True,
            )

            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    yield delta.content
        except openai.APIError as e:
            raise RuntimeError(f"OpenAI API stream error: {e}")
        except Exception as e:
            raise RuntimeError(f"OpenAI provider stream error: {e}")

    async def chat(self, messages: list, **kwargs) -> LLMResponse:
        """对话模式"""
        config = self._merge_config(**kwargs)

        # 转换消息格式
        api_messages = []
        for msg in messages:
            if isinstance(msg, Message):
                api_messages.append(msg.to_dict())
            elif isinstance(msg, dict):
                api_messages.append(msg)
            else:
                raise ValueError(f"Invalid message type: {type(msg)}")

        try:
            response = await self.client.chat.completions.create(
                model=self.config.model,
                messages=api_messages,
                temperature=config.get("temperature", self.config.temperature),
                max_tokens=config.get("max_tokens", self.config.max_tokens),
            )

            choice = response.choices[0]
            content = choice.message.content or ""

            return LLMResponse(
                content=content,
                model=response.model,
                provider=self.provider_type,
                tokens_used=response.usage.total_tokens if response.usage else 0,
                finish_reason=choice.finish_reason or "stop",
                metadata={
                    "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                    "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                    "id": response.id,
                },
            )
        except openai.APIError as e:
            raise RuntimeError(f"OpenAI API chat error: {e}")
        except Exception as e:
            raise RuntimeError(f"OpenAI provider chat error: {e}")

    async def chat_stream(self, messages: list, **kwargs) -> AsyncGenerator[str, None]:
        """对话模式流式生成"""
        config = self._merge_config(**kwargs)

        # 转换消息格式
        api_messages = []
        for msg in messages:
            if isinstance(msg, Message):
                api_messages.append(msg.to_dict())
            elif isinstance(msg, dict):
                api_messages.append(msg)
            else:
                raise ValueError(f"Invalid message type: {type(msg)}")

        try:
            stream = await self.client.chat.completions.create(
                model=self.config.model,
                messages=api_messages,
                temperature=config.get("temperature", self.config.temperature),
                max_tokens=config.get("max_tokens", self.config.max_tokens),
                stream=True,
            )

            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    yield delta.content
        except openai.APIError as e:
            raise RuntimeError(f"OpenAI API chat stream error: {e}")
        except Exception as e:
            raise RuntimeError(f"OpenAI provider chat stream error: {e}")
