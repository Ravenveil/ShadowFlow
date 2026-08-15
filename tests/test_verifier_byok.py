"""LLM-as-Verifier BYOK configuration tests.

_sense_with_verifier must pass provider/model/api_key_env/base_url/prompt_template
from config.verifier (or SF_VERIFIER_* env) into the ApiExecutor call, instead of
hardcoding anthropic + a fixed model. A fake ApiExecutor captures the config.
"""

from __future__ import annotations

import asyncio

from shadowflow.runtime import RuntimeService
from shadowflow.runtime.executors import ApiExecutor


class _FakeApiExecutor(ApiExecutor):
    """Captures the execute() config and returns a deterministic judge verdict."""

    def __init__(self):
        self.captured: dict | None = None

    async def execute(self, config, payload):  # type: ignore[override]
        self.captured = {**config, "_prompt": payload.get("prompt", "")}
        return {"score": 0.97, "confidence": 0.9, "reasoning": "ok"}


def _sense(service: RuntimeService, sensor_cfg: dict, fake: _FakeApiExecutor):
    base = {"sensor_type": "verifier", "value": 0.4, "converged": False}
    return asyncio.run(
        service._sense_with_verifier(
            sensor_cfg,
            {"metric": "quality", "op": ">=", "value": 0.95},
            {},
            [0.1, 0.2, 0.4],
            base,
        )
    ), fake.captured


def _service_with_fake():
    service = RuntimeService()
    fake = _FakeApiExecutor()
    service._executor_registry._executors["api"] = fake
    return service, fake


def test_byok_provider_and_key_env_from_config():
    service, fake = _service_with_fake()
    result, cfg = _sense(
        service,
        {
            "type": "verifier",
            "verifier": {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "api_key_env": "MY_OPENAI_KEY",
                "base_url": "https://my-gateway.example/v1/responses",
            },
        },
        fake,
    )
    assert cfg["provider"] == "openai"
    assert cfg["model"] == "gpt-4o-mini"
    assert cfg["api_key_env"] == "MY_OPENAI_KEY"
    assert cfg["base_url"] == "https://my-gateway.example/v1/responses"
    # logprob 只在 anthropic 路径启用
    assert "logprobs" not in cfg
    assert result["verifier_score"] == 0.97
    assert result["converged"] is True


def test_byok_provider_from_env(monkeypatch):
    monkeypatch.setenv("SF_VERIFIER_PROVIDER", "openai")
    monkeypatch.delenv("SF_VERIFIER_API_KEY_ENV", raising=False)
    service, fake = _service_with_fake()
    _, cfg = _sense(service, {"type": "verifier"}, fake)
    assert cfg["provider"] == "openai"
    # 未配置 model → 不硬编码模型，交给 provider 默认
    assert "model" not in cfg
    assert "api_key_env" not in cfg


def test_anthropic_defaults_enable_logprobs():
    service, fake = _service_with_fake()
    _, cfg = _sense(
        service,
        {"type": "verifier", "verifier": {"top_logprobs": 3}},
        fake,
    )
    assert cfg["provider"] == "anthropic"
    assert cfg["logprobs"] is True
    assert cfg["top_logprobs"] == 3


def test_prompt_template_override():
    service, fake = _service_with_fake()
    _, cfg = _sense(
        service,
        {
            "type": "verifier",
            "verifier": {
                "prompt_template": "判断指标 {metric} 是否达到 {op} {target}（当前 {current_value}）。",
            },
        },
        fake,
    )
    assert cfg["_prompt"] == "判断指标 quality 是否达到 >= 0.95（当前 0.4）。"


def test_invalid_prompt_template_falls_back_to_default(monkeypatch):
    service, fake = _service_with_fake()
    _, cfg = _sense(
        service,
        {"type": "verifier", "verifier": {"prompt_template": "bad {unknown_field}"}},
        fake,
    )
    # 未知占位符 → 回退默认模板（仍包含 JSON 输出说明）
    assert "Output a JSON" in cfg["_prompt"]
