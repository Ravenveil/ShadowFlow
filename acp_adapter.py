#!/usr/bin/env python3
"""ACP Adapter — Story 2.11 Hackathon demo glue layer.

Wraps any CLI-based agent (claude, hermes, custom) and makes it speak the
ShadowFlow ACP Server protocol over WebSocket.

Usage:
  python acp_adapter.py \\
    --agent-cmd "claude" \\
    --acp-server "ws://localhost:8765/acp" \\
    --api-key "$SF_API_KEY" \\
    --workspace "论文实验室" \\
    [--agent-hint "claude-code-cli"]

Or using environment variables:
  export SF_API_KEY=sk-demo
  export SF_ACP_SERVER=ws://localhost:8765/acp
  export SF_WORKSPACE=my-workspace
  python acp_adapter.py --agent-cmd "claude --no-tty"

The adapter:
  1. Connects to ShadowFlow ACP Server
  2. Sends auth + capability_response (with shell/fs/web/code_edit tools)
  3. Listens for {type: "task"} messages
  4. Runs the CLI agent with the task instruction as stdin/argument
  5. Streams stdout back as {type: "task_stream"} chunks
  6. Sends {type: "task_complete"} or {type: "task_error"} when done
  7. Sends heartbeats every 30s
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import subprocess
import sys
from typing import Any, Dict, Optional

try:
    import websockets
except ImportError:
    print("ERROR: websockets package required: pip install websockets", file=sys.stderr)
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("acp-adapter")

# ---------------------------------------------------------------------------
# Capability manifest
# ---------------------------------------------------------------------------

ADAPTER_MANIFEST = {
    "agent_id": "",         # filled in at runtime
    "display_name": "",     # filled in at runtime
    "version": "adapter-1.0",
    "tools": [
        {"name": "shell",     "description": "Execute bash commands"},
        {"name": "fs",        "description": "File system read/write"},
        {"name": "web",       "description": "Fetch web pages"},
        {"name": "code_edit", "description": "Edit source code files"},
    ],
    "max_concurrency": 1,
    "streaming": True,
    "memory": {"type": "stateful", "scope": "session", "persistence": False},
    "protocols": ["acp-v1"],
    "workspace_context": True,
}

# ---------------------------------------------------------------------------
# CLI agent runner
# ---------------------------------------------------------------------------


async def run_agent_task(
    agent_cmd: str,
    instruction: str,
    websocket: Any,
    task_id: str,
) -> None:
    """Run the CLI agent with the instruction, stream output back to ShadowFlow."""
    logger.info("Running agent for task_id=%s: %s", task_id, instruction[:80])

    cmd = f'{agent_cmd} --print "{instruction}"' if "--print" not in agent_cmd else f"{agent_cmd} {instruction}"

    try:
        process = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        async for line in process.stdout:
            chunk = line.decode("utf-8", errors="replace")
            await websocket.send(json.dumps({
                "type": "task_stream",
                "task_id": task_id,
                "chunk": chunk,
            }))

        await process.wait()
        exit_code = process.returncode

        if exit_code == 0:
            await websocket.send(json.dumps({
                "type": "task_complete",
                "task_id": task_id,
                "result": {"status": "success", "exit_code": 0},
            }))
        else:
            await websocket.send(json.dumps({
                "type": "task_error",
                "task_id": task_id,
                "error": {"code": "AGENT_EXIT_NONZERO", "exit_code": exit_code},
            }))

    except Exception as exc:
        logger.exception("Agent execution error: %s", exc)
        await websocket.send(json.dumps({
            "type": "task_error",
            "task_id": task_id,
            "error": {"code": "ADAPTER_ERROR", "message": str(exc)},
        }))


# ---------------------------------------------------------------------------
# Heartbeat loop
# ---------------------------------------------------------------------------


async def heartbeat_loop(websocket: Any, interval: int = 30) -> None:
    active_tasks = 0
    while True:
        await asyncio.sleep(interval)
        try:
            await websocket.send(json.dumps({
                "type": "heartbeat",
                "active_tasks": active_tasks,
            }))
        except Exception:
            break


# ---------------------------------------------------------------------------
# Main connection loop
# ---------------------------------------------------------------------------


async def run(
    acp_server: str,
    api_key: str,
    workspace: str,
    agent_cmd: str,
    agent_hint: str,
) -> None:
    import hashlib
    short_id = hashlib.md5(api_key.encode()).hexdigest()[:8]
    agent_id = f"{agent_hint or 'cli-agent'}-{short_id}"

    manifest = dict(ADAPTER_MANIFEST)
    manifest["agent_id"] = agent_id
    manifest["display_name"] = f"{agent_hint or 'CLI Agent'} ({short_id})"

    logger.info("Connecting to ACP Server: %s", acp_server)

    async with websockets.connect(acp_server, ping_interval=None) as ws:
        # 1. Auth
        await ws.send(json.dumps({
            "type": "auth",
            "api_key": api_key,
            "workspace_id": workspace,
            "agent_hint": agent_hint,
        }))

        auth_resp = json.loads(await ws.recv())
        if auth_resp.get("type") == "auth_error":
            logger.error("Auth failed: %s", auth_resp.get("message"))
            return

        session_id = auth_resp.get("session_id", "")
        logger.info("Authenticated. session_id=%s workspace=%s", session_id, workspace)

        # 2. Capability handshake
        cap_req = json.loads(await ws.recv())
        if cap_req.get("type") == "capability_request":
            await ws.send(json.dumps({
                "type": "capability_response",
                "manifest": manifest,
            }))
            cap_ack = json.loads(await ws.recv())
            logger.info("Registered. agent_id=%s status=%s", cap_ack.get("agent_id"), cap_ack.get("status"))

        # 3. Start heartbeat in background
        asyncio.ensure_future(heartbeat_loop(ws))

        # 4. Main message loop
        logger.info("Listening for tasks...")
        active_tasks: Dict[str, asyncio.Task] = {}

        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type", "")

            if msg_type == "task":
                task_id = str(msg.get("task_id", ""))
                instruction = str(msg.get("instruction", ""))
                logger.info("Received task: %s — %s", task_id, instruction[:60])
                t = asyncio.ensure_future(run_agent_task(agent_cmd, instruction, ws, task_id))
                active_tasks[task_id] = t

            elif msg_type == "task_cancel":
                task_id = str(msg.get("task_id", ""))
                if task_id in active_tasks:
                    active_tasks[task_id].cancel()
                    del active_tasks[task_id]
                await ws.send(json.dumps({"type": "task_cancelled", "task_id": task_id}))
                logger.info("Cancelled task: %s", task_id)

            elif msg_type == "heartbeat_ack":
                pass  # acknowledged

            elif msg_type == "disconnect":
                logger.info("Server disconnected: %s", msg.get("reason"))
                break

            else:
                logger.debug("Unhandled message type: %s", msg_type)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="ShadowFlow ACP Adapter")
    parser.add_argument("--agent-cmd", default=os.getenv("SF_AGENT_CMD", "echo"), help="CLI agent command")
    parser.add_argument("--acp-server", default=os.getenv("SF_ACP_SERVER", "ws://localhost:8765/acp"))
    parser.add_argument("--api-key", default=os.getenv("SF_API_KEY", "sf-demo-key"))
    parser.add_argument("--workspace", default=os.getenv("SF_WORKSPACE", "default"))
    parser.add_argument("--agent-hint", default=os.getenv("SF_AGENT_HINT", "cli-agent"))
    args = parser.parse_args()

    asyncio.run(run(
        acp_server=args.acp_server,
        api_key=args.api_key,
        workspace=args.workspace,
        agent_cmd=args.agent_cmd,
        agent_hint=args.agent_hint,
    ))


if __name__ == "__main__":
    main()
