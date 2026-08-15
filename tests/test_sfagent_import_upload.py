"""M9 completion tests: .sfagent import/upload roundtrip + 0G bridge upload.

The 0G bridge is faked with a local HTTP server speaking the same
PUT /kv/:key contract as ZeroGCheckpointStore.
"""

from __future__ import annotations

import asyncio
import base64
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from fastapi.testclient import TestClient

from shadowflow.runtime.agent_bundle import (
    export_sfagent_zip,
    import_sfagent_zip,
    read_sfagent_zip,
    upload_sfagent_to_zerog,
)

_AGENT = {
    "id": "checker-beta",
    "name": "Checker Beta",
    "role": "Checker",
    "capabilities": ["diagnostics-sensor"],
    "skills": [{"name": "lint", "purpose": "count issues"}],
}


def test_bundle_roundtrip_import(tmp_path):
    zip_bytes = export_sfagent_zip(_AGENT)
    parsed = read_sfagent_zip(zip_bytes)
    assert parsed["manifest"]["agent_id"] == "checker-beta"

    record = import_sfagent_zip(zip_bytes, tmp_path / "agents")
    assert record["agent_id"] == "checker-beta"
    assert record["role"] == "Checker"
    stored = json.loads((tmp_path / "agents" / "checker-beta.json").read_text(encoding="utf-8"))
    assert stored["content_id"].startswith("sha256:")
    assert stored["skills"][0]["name"] == "lint"


def test_read_bundle_rejects_non_bundle_zip(tmp_path):
    import zipfile
    from io import BytesIO

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("random.txt", "not a bundle")
    import pytest

    with pytest.raises(ValueError, match="sfagent.json"):
        read_sfagent_zip(buf.getvalue())


def test_upload_to_zerog_bridge_roundtrip():
    received: dict = {}

    class _Handler(BaseHTTPRequestHandler):
        def do_PUT(self):  # noqa: N802 — http.server API
            length = int(self.headers.get("Content-Length", 0))
            received["body"] = json.loads(self.rfile.read(length))
            received["key"] = self.path
            self.send_response(201)
            self.end_headers()

        def log_message(self, *args):  # silence
            pass

    server = HTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        zip_bytes = export_sfagent_zip(_AGENT)
        content_id = read_sfagent_zip(zip_bytes)["manifest"]["content_id"]
        result = upload_sfagent_to_zerog(
            zip_bytes, content_id, bridge_url=f"http://127.0.0.1:{server.server_port}"
        )
        assert result["cid"] == content_id
        assert result["location"].startswith("0g://sfagent/")
        assert received["key"].startswith("/kv/sfagent/")
        assert received["body"]["encoding"] == "base64"
        assert base64.b64decode(received["body"]["value"]) == zip_bytes
    finally:
        server.shutdown()


def test_upload_requires_bridge_config(monkeypatch):
    import pytest

    monkeypatch.delenv("SHADOWFLOW_BRIDGE_URL", raising=False)
    with pytest.raises(ValueError, match="SHADOWFLOW_BRIDGE_URL"):
        upload_sfagent_to_zerog(b"x", "sha256:abc")


def test_http_import_and_upload_endpoints(tmp_path, monkeypatch):
    monkeypatch.delenv("SHADOWFLOW_BRIDGE_URL", raising=False)
    import shadowflow.api.agents as agents_mod

    agents_dir = tmp_path / "agents"
    monkeypatch.setattr(agents_mod, "_AGENTS_DIR", agents_dir)

    from shadowflow.server import app

    client = TestClient(app)
    zip_b64 = base64.b64encode(export_sfagent_zip(_AGENT)).decode("ascii")

    imported = client.post("/workflow/sfagent/import", json={"zip_b64": zip_b64})
    assert imported.status_code == 200, imported.text
    data = imported.json()["data"]
    assert data["agent_id"] == "checker-beta"
    assert (agents_dir / "checker-beta.json").exists()

    upload = client.post("/workflow/sfagent/upload", json={"agent": _AGENT})
    assert upload.status_code == 200, upload.text
    payload = upload.json()["data"]
    assert payload["content_id"].startswith("sha256:")
    assert payload["uploaded"] is False  # no bridge configured → local cid only
