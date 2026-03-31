"""Tests for ZeroGCheckpointStore — uses in-memory bridge fallback (no real 0G needed)."""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch

import pytest

from agentgraph.runtime.checkpoint_store import ZeroGCheckpointStore
from agentgraph.runtime.contracts import CheckpointRef


# ---------------------------------------------------------------------------
# Minimal fake bridge server (mirrors bridge/index.ts memory fallback)
# ---------------------------------------------------------------------------

class _FakeBridgeHandler(BaseHTTPRequestHandler):
    _store: dict[str, str] = {}

    def do_PUT(self):  # noqa: N802
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        key = self.path.lstrip("/kv/")
        value = json.loads(body)["value"]
        _FakeBridgeHandler._store[key] = value
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "key": key}).encode())

    def do_GET(self):  # noqa: N802
        path = self.path
        if path.startswith("/kv/list/"):
            prefix = path[len("/kv/list/"):]
            keys = [k for k in _FakeBridgeHandler._store if k.startswith(prefix)]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "keys": keys}).encode())
        else:
            key = path[len("/kv/"):]
            if key in _FakeBridgeHandler._store:
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True, "value": _FakeBridgeHandler._store[key]}).encode())
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": "not found"}).encode())

    def log_message(self, *args):  # noqa: N802
        pass


@pytest.fixture(scope="module")
def fake_bridge():
    """Start a fake bridge on a random port; yield its URL; shut down after tests."""
    _FakeBridgeHandler._store.clear()
    server = HTTPServer(("127.0.0.1", 0), _FakeBridgeHandler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()


def _make_checkpoint(run_id: str, checkpoint_id: str, node_id: str) -> CheckpointRef:
    raw = {
        "checkpoint_id": checkpoint_id,
        "run_id": run_id,
        "step_id": f"step-{node_id}",
        "state": {
            "current_node_id": node_id,
            "next_node_id": None,
            "visited_nodes": [],
            "last_output": {},
            "state": {},
        },
        "writeback": {
            "channel": "checkpoint",
            "target": "memory",
            "mode": "reference",
            "host_action": "persist_checkpoint_ref",
            "next_node_id": None,
            "resume_supported": False,
        },
        "state_ref": None,
        "metadata": {},
    }
    return CheckpointRef.model_validate(raw)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestZeroGCheckpointStore:
    def test_put_and_get(self, fake_bridge):
        store = ZeroGCheckpointStore(bridge_url=fake_bridge)
        ckpt = _make_checkpoint("run-1", "ckpt-1", "analyze")
        record = store.put(ckpt)

        assert record.checkpoint_id == "ckpt-1"
        assert record.run_id == "run-1"
        assert record.location.startswith("0g://")

        retrieved = store.get("ckpt-1")
        assert retrieved is not None
        assert retrieved.checkpoint_id == "ckpt-1"
        assert retrieved.run_id == "run-1"

    def test_get_missing_returns_none(self, fake_bridge):
        store = ZeroGCheckpointStore(bridge_url=fake_bridge)
        assert store.get("does-not-exist") is None

    def test_get_without_index_returns_none(self, fake_bridge):
        """get() returns None if checkpoint_id was never put() in this store instance."""
        store = ZeroGCheckpointStore(bridge_url=fake_bridge)
        # ckpt-99 may exist on bridge from another test, but this instance has no index entry
        result = store.get("ckpt-99")
        assert result is None

    def test_get_record(self, fake_bridge):
        store = ZeroGCheckpointStore(bridge_url=fake_bridge)
        ckpt = _make_checkpoint("run-2", "ckpt-2", "summarize")
        store.put(ckpt)

        record = store.get_record("ckpt-2")
        assert record is not None
        assert record.checkpoint_id == "ckpt-2"
        assert record.run_id == "run-2"

    def test_list_run(self, fake_bridge):
        store = ZeroGCheckpointStore(bridge_url=fake_bridge)
        store.put(_make_checkpoint("run-3", "ckpt-3a", "analyze"))
        store.put(_make_checkpoint("run-3", "ckpt-3b", "summarize"))
        store.put(_make_checkpoint("run-3", "ckpt-3c", "suggest"))

        records = store.list_run("run-3")
        ids = {r.checkpoint_id for r in records}
        assert ids == {"ckpt-3a", "ckpt-3b", "ckpt-3c"}

    def test_list_run_empty(self, fake_bridge):
        store = ZeroGCheckpointStore(bridge_url=fake_bridge)
        records = store.list_run("run-nonexistent")
        assert records == []

    def test_bridge_down_raises(self):
        store = ZeroGCheckpointStore(bridge_url="http://127.0.0.1:19999")
        ckpt = _make_checkpoint("run-x", "ckpt-x", "node")
        with pytest.raises(Exception):
            store.put(ckpt)
