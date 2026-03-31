from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx


DEFAULT_OPENAI_MODEL = "gpt-5.2"
DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514"


def compile_execution_prompt(payload: Dict[str, Any]) -> str:
    prompt = str(payload.get("prompt") or "").strip()
    step_input = payload.get("step_input", {})
    context = payload.get("context", {})

    prompt_sections: List[str] = []
    if prompt:
        prompt_sections.append(prompt)
    if step_input:
        prompt_sections.append(
            "Workflow input:\n" + json.dumps(step_input, ensure_ascii=False, indent=2, default=str)
        )
    if context:
        prompt_sections.append(
            "Runtime context:\n" + json.dumps(context, ensure_ascii=False, indent=2, default=str)
        )
    return "\n\n".join(section for section in prompt_sections if section).strip()


def extract_text_content(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        for item in reversed(value):
            text = extract_text_content(item)
            if text:
                return text
        return ""
    if isinstance(value, dict):
        for key in (
            "output_text",
            "text",
            "message",
            "content",
            "result",
            "final",
            "response",
            "completion",
            "last_message",
        ):
            if key in value:
                text = extract_text_content(value[key])
                if text:
                    return text
        for key in ("item", "items", "output", "events", "data"):
            if key not in value:
                continue
            text = extract_text_content(value[key])
            if text:
                return text
        for key in ("delta",):
            if key not in value:
                continue
            text = extract_text_content(value[key])
            if text:
                return text
        for item in value.values():
            if not isinstance(item, (dict, list)):
                continue
            text = extract_text_content(item)
            if text:
                return text
        return ""
    return str(value)


class BaseExecutor(ABC):
    kind: str

    @abstractmethod
    async def execute(self, config: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError


class ExecutorRegistry:
    def __init__(self, executors: Optional[List[BaseExecutor]] = None) -> None:
        self._executors: Dict[str, BaseExecutor] = {}
        for executor in executors or [CliExecutor(), ApiExecutor()]:
            self.register(executor)

    def register(self, executor: BaseExecutor) -> None:
        self._executors[executor.kind] = executor

    async def execute(self, config: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        kind = config.get("kind")
        if not isinstance(kind, str):
            raise ValueError("executor.kind must be a string")
        executor = self._executors.get(kind)
        if executor is None:
            raise ValueError(f"unsupported executor kind: {kind}")
        return await executor.execute(config=config, payload=payload)


class CliExecutor(BaseExecutor):
    kind = "cli"

    def __init__(self) -> None:
        self._provider_defaults = {
            "codex": self._resolve_codex_invocation,
            "claude": self._resolve_claude_invocation,
        }

    async def execute(self, config: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        provider = str(config.get("provider", "generic"))
        invocation = self._resolve_invocation(provider=provider, config=config, payload=payload)
        timeout_seconds = self._resolve_timeout_seconds(config)
        try:
            completed = await asyncio.to_thread(
                subprocess.run,
                invocation["command"],
                input=invocation.get("stdin_payload"),
                capture_output=True,
                text=True,
                encoding="utf-8",
                check=False,
                cwd=invocation.get("cwd"),
                env=invocation.get("env"),
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired as exc:
            raise ValueError(
                f"cli executor timed out for provider={provider} after {timeout_seconds} seconds"
            ) from exc
        if completed.returncode != 0:
            raise ValueError(
                f"cli executor failed for provider={provider} with exit code {completed.returncode}: "
                f"{completed.stderr.strip()}"
            )

        return self._parse_cli_output(
            provider=provider,
            parse_mode=invocation["parse_mode"],
            stdout=completed.stdout,
            stderr=completed.stderr,
            command=invocation["command"],
        )

    def _resolve_invocation(
        self,
        *,
        provider: str,
        config: Dict[str, Any],
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        provider_builder = self._provider_defaults.get(provider)
        if provider_builder is not None and "command" not in config:
            invocation = provider_builder(config=config, payload=payload)
        else:
            invocation = self._resolve_generic_invocation(config=config, payload=payload)

        raw_env = config.get("env")
        env = None
        if raw_env is not None:
            if not isinstance(raw_env, dict) or not all(
                isinstance(key, str) and isinstance(value, str) for key, value in raw_env.items()
            ):
                raise ValueError("executor.env must be a string map")
            env = {**os.environ, **raw_env}

        # claude CLI refuses to run inside a Claude Code session unless CLAUDECODE is unset
        if provider == "claude" and "CLAUDECODE" in os.environ:
            env = {k: v for k, v in (env or os.environ).items() if k != "CLAUDECODE"}

        invocation["env"] = env
        invocation["cwd"] = config.get("cwd")
        return invocation

    def _resolve_generic_invocation(self, config: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        command = config.get("command")
        if isinstance(command, str):
            command_parts = [command]
        elif isinstance(command, list) and all(isinstance(item, str) for item in command):
            command_parts = list(command)
        else:
            raise ValueError("executor.command must be a string or string list for generic cli executor")

        args = config.get("args", [])
        if not isinstance(args, list) or not all(isinstance(item, str) for item in args):
            raise ValueError("executor.args must be a string list")

        stdin_mode = config.get("stdin", "json")
        if stdin_mode == "json":
            stdin_payload = json.dumps(payload, ensure_ascii=False)
        elif stdin_mode == "text":
            stdin_payload = compile_execution_prompt(payload)
        elif stdin_mode == "none":
            stdin_payload = None
        else:
            raise ValueError("executor.stdin must be json, text, or none")

        parse_mode = str(config.get("parse", "json"))
        return {
            "command": [*command_parts, *args],
            "stdin_payload": stdin_payload,
            "parse_mode": parse_mode,
        }

    def _resolve_codex_invocation(self, config: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        prompt = compile_execution_prompt(payload)
        command = [
            self._resolve_command_binary(["codex", "codex.cmd", "codex.ps1"]),
            "exec",
            "--skip-git-repo-check",
            "--json",
            "-",
        ]
        model = config.get("model")
        if isinstance(model, str) and model:
            command.extend(["--model", model])
        working_directory = config.get("cwd")
        if isinstance(working_directory, str) and working_directory:
            command.extend(["--cd", working_directory])
        command.extend(self._resolve_extra_args(config))
        return {
            "command": command,
            "stdin_payload": prompt,
            "parse_mode": str(config.get("parse", "codex-jsonl")),
        }

    def _resolve_claude_invocation(self, config: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        prompt = compile_execution_prompt(payload)
        command = [self._resolve_command_binary(["claude", "claude.exe"]), "-p", prompt, "--output-format", "json"]
        model = config.get("model")
        if isinstance(model, str) and model:
            command.extend(["--model", model])
        system_prompt = config.get("system_prompt")
        if isinstance(system_prompt, str) and system_prompt:
            command.extend(["--system-prompt", system_prompt])
        permission_mode = config.get("permission_mode")
        if isinstance(permission_mode, str) and permission_mode:
            command.extend(["--permission-mode", permission_mode])
        command.extend(self._resolve_extra_args(config))
        return {
            "command": command,
            "stdin_payload": None,
            "parse_mode": str(config.get("parse", "claude-json")),
        }

    def _parse_cli_output(
        self,
        *,
        provider: str,
        parse_mode: str,
        stdout: str,
        stderr: str,
        command: List[str],
    ) -> Dict[str, Any]:
        clean_stdout = stdout.strip()
        output: Dict[str, Any] = {
            "executor": {
                "kind": "cli",
                "provider": provider,
                "command": command,
                "parse_mode": parse_mode,
            }
        }
        if stderr.strip():
            output["stderr"] = stderr.strip()

        if parse_mode == "text":
            output["response_text"] = clean_stdout
            output["message"] = clean_stdout
            return output

        if parse_mode == "json":
            parsed = json.loads(clean_stdout)
            return self._merge_parsed_output(output, parsed)

        if parse_mode == "claude-json":
            parsed = json.loads(clean_stdout)
            output["raw_output"] = parsed
            text = extract_text_content(parsed)
            if isinstance(parsed, dict):
                output.update({key: value for key, value in parsed.items() if key not in {"message"}})
            output["response_text"] = text
            output["message"] = text or output.get("message", "")
            return output

        if parse_mode == "codex-jsonl":
            events: List[Dict[str, Any]] = []
            for line in clean_stdout.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    events.append({"type": "text", "text": line})
            output["raw_output"] = {"events": events}
            text = ""
            for event in reversed(events):
                text = extract_text_content(event)
                if text:
                    break
            output["response_text"] = text
            output["message"] = text or output.get("message", "")
            output["events"] = events
            return output

        raise ValueError(f"unsupported cli parse mode: {parse_mode}")

    def _merge_parsed_output(self, base: Dict[str, Any], parsed: Any) -> Dict[str, Any]:
        output = dict(base)
        output["raw_output"] = parsed
        if isinstance(parsed, dict):
            output.update(parsed)
            output.setdefault("response_text", extract_text_content(parsed))
            output.setdefault("message", output.get("response_text", ""))
        else:
            output["result"] = parsed
            output["response_text"] = extract_text_content(parsed)
            output["message"] = output["response_text"]
        return output

    def _resolve_command_binary(self, candidates: List[str]) -> str:
        for candidate in candidates:
            resolved = shutil.which(candidate)
            if resolved:
                return resolved
        return candidates[0]

    def _resolve_extra_args(self, config: Dict[str, Any]) -> List[str]:
        extra_args = config.get("extra_args", [])
        if not isinstance(extra_args, list) or not all(isinstance(item, str) for item in extra_args):
            raise ValueError("executor.extra_args must be a string list")
        return list(extra_args)

    def _resolve_timeout_seconds(self, config: Dict[str, Any]) -> Optional[float]:
        timeout = config.get("timeout_seconds")
        if timeout is None:
            return None
        try:
            resolved = float(timeout)
        except (TypeError, ValueError) as exc:
            raise ValueError("executor.timeout_seconds must be a positive number") from exc
        if resolved <= 0:
            raise ValueError("executor.timeout_seconds must be a positive number")
        return resolved


class ApiExecutor(BaseExecutor):
    kind = "api"

    async def execute(self, config: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        provider = str(config.get("provider", "")).strip().lower()
        if provider == "openai":
            return await self._execute_openai(config=config, payload=payload)
        if provider == "anthropic":
            return await self._execute_anthropic(config=config, payload=payload)
        raise ValueError(f"unsupported api provider: {provider}")

    async def _execute_openai(self, config: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        api_key = self._get_api_key(config=config, default_env="OPENAI_API_KEY")
        model = str(config.get("model", DEFAULT_OPENAI_MODEL))
        compiled_prompt = self._build_api_prompt(config=config, payload=payload, enforce_json=config.get("parse") == "json")
        body: Dict[str, Any] = {
            "model": model,
            "input": compiled_prompt,
        }
        system_prompt = config.get("system_prompt")
        if isinstance(system_prompt, str) and system_prompt:
            body["instructions"] = system_prompt
        if config.get("temperature") is not None:
            body["temperature"] = config["temperature"]
        if config.get("max_output_tokens") is not None:
            body["max_output_tokens"] = config["max_output_tokens"]
        if config.get("parse") == "json":
            body["text"] = {"format": {"type": "json_object"}}

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        timeout = float(config.get("timeout_seconds", 120))
        url = str(config.get("base_url", "https://api.openai.com/v1/responses"))
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, headers=headers, json=body)
            response.raise_for_status()
            data = response.json()
        return self._normalize_api_output(
            provider="openai",
            config=config,
            data=data,
            text=data.get("output_text") or extract_text_content(data),
            model=model,
        )

    async def _execute_anthropic(self, config: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        api_key = self._get_api_key(config=config, default_env="ANTHROPIC_API_KEY")
        model = str(config.get("model", DEFAULT_ANTHROPIC_MODEL))
        compiled_prompt = self._build_api_prompt(config=config, payload=payload, enforce_json=config.get("parse") == "json")
        body: Dict[str, Any] = {
            "model": model,
            "max_tokens": int(config.get("max_tokens", 1024)),
            "messages": [{"role": "user", "content": compiled_prompt}],
        }
        system_prompt = config.get("system_prompt")
        if isinstance(system_prompt, str) and system_prompt:
            body["system"] = system_prompt
        if config.get("temperature") is not None:
            body["temperature"] = config["temperature"]

        headers = {
            "x-api-key": api_key,
            "anthropic-version": str(config.get("anthropic_version", "2023-06-01")),
            "content-type": "application/json",
        }
        timeout = float(config.get("timeout_seconds", 120))
        url = str(config.get("base_url", "https://api.anthropic.com/v1/messages"))
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, headers=headers, json=body)
            response.raise_for_status()
            data = response.json()
        text = extract_text_content(data.get("content", []))
        return self._normalize_api_output(
            provider="anthropic",
            config=config,
            data=data,
            text=text,
            model=model,
        )

    def _get_api_key(self, *, config: Dict[str, Any], default_env: str) -> str:
        env_name = str(config.get("api_key_env", default_env))
        api_key = os.getenv(env_name)
        if not api_key:
            raise ValueError(f"missing API key environment variable: {env_name}")
        return api_key

    def _build_api_prompt(self, *, config: Dict[str, Any], payload: Dict[str, Any], enforce_json: bool) -> str:
        compiled = compile_execution_prompt(payload)
        extra_instruction = config.get("response_instruction")
        sections = [compiled] if compiled else []
        if isinstance(extra_instruction, str) and extra_instruction:
            sections.append(extra_instruction)
        if enforce_json:
            sections.append("Return valid JSON only.")
        return "\n\n".join(section for section in sections if section).strip()

    def _normalize_api_output(
        self,
        *,
        provider: str,
        config: Dict[str, Any],
        data: Dict[str, Any],
        text: str,
        model: str,
    ) -> Dict[str, Any]:
        output: Dict[str, Any] = {
            "executor": {
                "kind": "api",
                "provider": provider,
                "model": model,
            },
            "raw_output": data,
            "response_text": text,
        }
        parse_mode = str(config.get("parse", "text"))
        if parse_mode == "json":
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                output.update(parsed)
                output.setdefault("message", extract_text_content(parsed))
            else:
                output["result"] = parsed
                output["message"] = extract_text_content(parsed)
            return output
        if parse_mode != "text":
            raise ValueError(f"unsupported api parse mode: {parse_mode}")
        output["message"] = text
        return output
