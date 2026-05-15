"""Settings API — agents detect, connectors, pets, appearance, and BYOK.

Endpoints:
  GET    /api/settings/agents/detect               — scan PATH for known agent CLIs
  GET    /api/settings/agents/selection            — read selected agent id
  PUT    /api/settings/agents/selection            — write selected agent id
  GET    /api/settings/connectors/composio         — read Composio config
  PUT    /api/settings/connectors/composio         — write Composio API key
  DELETE /api/settings/connectors/composio         — clear Composio API key
  GET    /api/settings/pets                        — list pet spritesheets
  GET    /api/settings/pets/{pet_id}/spritesheet   — serve binary spritesheet image
  GET    /api/settings/appearance                  — read appearance (theme)
  PUT    /api/settings/appearance                  — write appearance (theme)
  GET    /api/settings/byok                        — read BYOK keys (masked) + model
  PUT    /api/settings/byok                        — write a provider key and/or model
  DELETE /api/settings/byok/{provider}             — clear a provider key
  GET    /api/settings/byok/models                 — list supported models
  GET    /api/settings/media                       — read media provider keys (masked)
  PUT    /api/settings/media                       — write a media provider key
  DELETE /api/settings/media/{provider_id}         — clear a media provider key
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import stat
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DATA_DIR = Path(os.environ.get("SHADOWFLOW_DATA_DIR", ".shadowflow"))
COMPOSIO_CONFIG = DATA_DIR / "connectors" / "composio-config.json"
AGENT_SELECTION_FILE = DATA_DIR / "agents" / "selection.json"
APPEARANCE_FILE = DATA_DIR / "appearance.json"
BYOK_CONFIG_FILE = DATA_DIR / "byok-config.json"
MEDIA_CONFIG_FILE = DATA_DIR / "media-config.json"

_PET_ID_RE = re.compile(r"^[a-zA-Z0-9._-]{1,80}$")

_MEDIA_PROVIDERS = [
    {"id": "openai-image", "name": "OpenAI Image",    "hint": "DALL-E / gpt-image-2",    "category": "image"},
    {"id": "stability",    "name": "Stability AI",    "hint": "Stable Diffusion",        "category": "image"},
    {"id": "fal",          "name": "Fal.ai",          "hint": "Fast image generation",   "category": "image"},
    {"id": "replicate",    "name": "Replicate",       "hint": "Open model hosting",      "category": "image"},
    {"id": "xai",          "name": "xAI / Grok",      "hint": "Aurora image model",      "category": "image"},
    {"id": "kling",        "name": "Kling",           "hint": "Video generation",        "category": "video"},
    {"id": "minimax",      "name": "MiniMax",         "hint": "Video + TTS",             "category": "video"},
    {"id": "elevenlabs",   "name": "ElevenLabs",      "hint": "Voice & audio",           "category": "audio"},
    {"id": "suno",         "name": "Suno",            "hint": "AI music generation",     "category": "audio"},
]

_VALID_THEMES = {"dark", "light", "system"}
_VALID_PROVIDERS = {"anthropic", "openai", "google", "deepseek", "azure"}
_DEFAULT_MODEL = "claude-sonnet-4-6"

BYOK_MODELS: List[Dict[str, Any]] = [
    {"id": "claude-opus-4-7",   "name": "Claude Opus 4.7",   "provider": "anthropic"},
    {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "provider": "anthropic"},
    {"id": "claude-haiku-4-5",  "name": "Claude Haiku 4.5",  "provider": "anthropic"},
    {"id": "gpt-4o",            "name": "GPT-4o",            "provider": "openai"},
    {"id": "gpt-4o-mini",       "name": "GPT-4o Mini",       "provider": "openai"},
    {"id": "gemini-2.5-pro",    "name": "Gemini 2.5 Pro",    "provider": "google"},
    {"id": "deepseek-chat",     "name": "DeepSeek Chat",     "provider": "deepseek"},
    {"id": "azure-gpt-4o",      "name": "Azure GPT-4o",      "provider": "azure"},
    {"id": "azure-gpt-4o-mini", "name": "Azure GPT-4o Mini",  "provider": "azure"},
]

AGENT_DEFS: List[Dict[str, Any]] = [
    {"id": "claude",   "name": "Claude Code",    "bin": "claude",       "fallback_bins": ["openclaude"]},
    {"id": "codex",    "name": "Codex CLI",       "bin": "codex",        "fallback_bins": []},
    {"id": "gemini",   "name": "Gemini CLI",      "bin": "gemini",       "fallback_bins": []},
    {"id": "opencode",  "name": "OpenCode",          "bin": "opencode",     "fallback_bins": []},
    {"id": "openclaw", "name": "OpenClaw",          "bin": "openclaw",     "fallback_bins": []},
    {"id": "cursor",   "name": "Cursor Agent",    "bin": "cursor-agent", "fallback_bins": []},
    {"id": "qwen",     "name": "Qwen Code",       "bin": "qwen",         "fallback_bins": []},
    {"id": "copilot",  "name": "GitHub Copilot",  "bin": "copilot",      "fallback_bins": []},
    {"id": "hermes",   "name": "Hermes",          "bin": "hermes",       "fallback_bins": []},
    {"id": "devin",    "name": "Devin",           "bin": "devin",        "fallback_bins": []},
    {"id": "kimi",     "name": "Kimi CLI",         "bin": "kimi",         "fallback_bins": []},
    {"id": "kiro",     "name": "Kiro",             "bin": "kiro",         "fallback_bins": []},
    {"id": "kilo",     "name": "Kilo",             "bin": "kilo",         "fallback_bins": []},
    {"id": "vibe",     "name": "Vibe",             "bin": "vibe",         "fallback_bins": []},
    {"id": "pi",       "name": "Pi",               "bin": "pi",           "fallback_bins": []},
    {"id": "deepseek", "name": "DeepSeek Coder",   "bin": "deepseek",     "fallback_bins": []},
]

# ---------------------------------------------------------------------------
# Helper: CLI detection
# ---------------------------------------------------------------------------

def _resolve_on_path(bin_name: str) -> Optional[str]:
    return shutil.which(bin_name)


def _detect_agents() -> List[Dict[str, Any]]:
    results = []
    for defn in AGENT_DEFS:
        path = _resolve_on_path(defn["bin"])
        for fb in defn.get("fallback_bins", []):
            if not path:
                path = _resolve_on_path(fb)
        version: Optional[str] = None
        if path:
            try:
                out = subprocess.run(
                    [path, "--version"],
                    capture_output=True,
                    text=True,
                    timeout=3,
                )
                version = out.stdout.strip() or out.stderr.strip() or None
            except Exception:
                pass
        results.append(
            {
                "id": defn["id"],
                "name": defn["name"],
                "installed": bool(path),
                "path": path,
                "version": version,
            }
        )
    return results


# ---------------------------------------------------------------------------
# Helper: Composio config
# ---------------------------------------------------------------------------

def _read_composio_config() -> Dict[str, Any]:
    try:
        return json.loads(COMPOSIO_CONFIG.read_text())
    except FileNotFoundError:
        return {"apiKey": ""}


def _write_composio_config(api_key: str) -> Dict[str, Any]:
    COMPOSIO_CONFIG.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = COMPOSIO_CONFIG.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps({"apiKey": api_key}, indent=2))
    tmp.chmod(0o600)
    tmp.rename(COMPOSIO_CONFIG)
    COMPOSIO_CONFIG.chmod(0o600)
    cfg = _read_composio_config()
    return {
        "configured": bool(cfg["apiKey"]),
        "apiKeyTail": cfg["apiKey"][-4:] if cfg["apiKey"] else "",
    }


def _composio_status() -> Dict[str, Any]:
    cfg = _read_composio_config()
    return {
        "configured": bool(cfg.get("apiKey", "")),
        "apiKeyTail": cfg["apiKey"][-4:] if cfg.get("apiKey") else "",
    }


# ---------------------------------------------------------------------------
# Helper: Pet list
# ---------------------------------------------------------------------------

def _list_pets(base_url: str = "") -> List[Dict[str, Any]]:
    pets: List[Dict[str, Any]] = []
    user_root = Path.home() / ".codex" / "pets"
    bundled_root = Path(__file__).parent.parent / "assets" / "community-pets"
    seen: set[str] = set()

    for root, bundled in [(user_root, False), (bundled_root, True)]:
        if not root.exists():
            continue
        for pet_dir in sorted(root.iterdir()):
            if not pet_dir.is_dir():
                continue
            pet_id = pet_dir.name
            if pet_id in seen:
                continue
            manifest_path = pet_dir / "pet.json"
            manifest: Dict[str, Any] = {}
            if manifest_path.exists():
                try:
                    manifest = json.loads(manifest_path.read_text())
                except Exception:
                    pass
            # Find spritesheet
            sheet: Optional[str] = None
            for name in ["spritesheet.webp", "spritesheet.png", "spritesheet.gif"]:
                if (pet_dir / name).exists():
                    sheet = name
                    break
            if not sheet:
                continue
            seen.add(pet_id)
            pets.append(
                {
                    "id": pet_id,
                    "displayName": manifest.get("displayName", pet_id.replace("-", " ").title()),
                    "description": manifest.get("description", ""),
                    "spritesheetUrl": f"{base_url}/api/settings/pets/{pet_id}/spritesheet",
                    "bundled": bundled,
                    "author": manifest.get("author", ""),
                    "tags": manifest.get("tags", []),
                }
            )
    return pets


def _find_spritesheet(pet_id: str) -> Optional[Path]:
    """Return the spritesheet path for a pet, or None if not found."""
    user_root = Path.home() / ".codex" / "pets"
    bundled_root = Path(__file__).parent.parent / "assets" / "community-pets"

    for root in [user_root, bundled_root]:
        pet_dir = root / pet_id
        if not pet_dir.is_dir():
            continue
        for name in ["spritesheet.webp", "spritesheet.png", "spritesheet.gif"]:
            candidate = pet_dir / name
            if candidate.exists():
                return candidate
    return None


# ---------------------------------------------------------------------------
# Helper: agent selection
# ---------------------------------------------------------------------------

def _read_agent_selection() -> Dict[str, Any]:
    try:
        return json.loads(AGENT_SELECTION_FILE.read_text())
    except FileNotFoundError:
        return {"selectedId": "claude"}


def _write_agent_selection(selected_id: str) -> Dict[str, Any]:
    AGENT_SELECTION_FILE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = AGENT_SELECTION_FILE.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps({"selectedId": selected_id}, indent=2))
    tmp.chmod(0o600)
    tmp.rename(AGENT_SELECTION_FILE)
    AGENT_SELECTION_FILE.chmod(0o600)
    return {"selectedId": selected_id}


# ---------------------------------------------------------------------------
# Helper: appearance
# ---------------------------------------------------------------------------

def _read_appearance() -> Dict[str, Any]:
    try:
        data = json.loads(APPEARANCE_FILE.read_text())
        if data.get("theme") not in _VALID_THEMES:
            data["theme"] = "dark"
        return data
    except FileNotFoundError:
        return {"theme": "dark"}


def _write_appearance(theme: str) -> Dict[str, Any]:
    APPEARANCE_FILE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = APPEARANCE_FILE.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps({"theme": theme}, indent=2))
    tmp.chmod(0o600)
    tmp.rename(APPEARANCE_FILE)
    APPEARANCE_FILE.chmod(0o600)
    return {"theme": theme}


# ---------------------------------------------------------------------------
# Helper: BYOK
# ---------------------------------------------------------------------------

def _read_byok_config() -> Dict[str, Any]:
    try:
        cfg = json.loads(BYOK_CONFIG_FILE.read_text())
        return {
            "keys": cfg.get("keys", {}),
            "baseUrls": cfg.get("baseUrls", {}),
            "model": cfg.get("model", _DEFAULT_MODEL),
        }
    except FileNotFoundError:
        return {"keys": {p: None for p in _VALID_PROVIDERS}, "baseUrls": {}, "model": _DEFAULT_MODEL}


def _write_byok_config(config: Dict[str, Any]) -> None:
    BYOK_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = BYOK_CONFIG_FILE.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(config, indent=2))
    tmp.chmod(0o600)
    tmp.rename(BYOK_CONFIG_FILE)
    BYOK_CONFIG_FILE.chmod(0o600)


def _mask_key(key: Optional[str]) -> Optional[str]:
    """Return '****{last4}' if key is set, otherwise None."""
    if not key:
        return None
    return "****" + key[-4:]


def _byok_public_view(config: Dict[str, Any]) -> Dict[str, Any]:
    """Return BYOK config with keys masked."""
    return {
        "keys": {p: _mask_key(config["keys"].get(p)) for p in _VALID_PROVIDERS},
        "baseUrls": {p: config.get("baseUrls", {}).get(p) for p in _VALID_PROVIDERS},
        "model": config.get("model", _DEFAULT_MODEL),
    }


# ---------------------------------------------------------------------------
# Helper: Media config
# ---------------------------------------------------------------------------

def _read_media_config() -> Dict[str, Any]:
    try:
        return json.loads(MEDIA_CONFIG_FILE.read_text())
    except FileNotFoundError:
        return {"keys": {}}


def _write_media_config(provider_id: str, api_key: str) -> Dict[str, Any]:
    MEDIA_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    cfg = _read_media_config()
    cfg.setdefault("keys", {})[provider_id] = api_key if api_key else None
    tmp = MEDIA_CONFIG_FILE.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(cfg, indent=2))
    tmp.chmod(0o600)
    tmp.rename(MEDIA_CONFIG_FILE)
    MEDIA_CONFIG_FILE.chmod(0o600)
    return cfg


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ComposioWriteRequest(BaseModel):
    apiKey: str


class AgentSelectionWriteRequest(BaseModel):
    selectedId: str


class AppearanceWriteRequest(BaseModel):
    theme: str


class ByokWriteRequest(BaseModel):
    provider: str
    apiKey: Optional[str] = None
    model: Optional[str] = None
    baseUrl: Optional[str] = None  # for Azure and custom endpoints


class MediaWriteRequest(BaseModel):
    providerId: str
    apiKey: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/agents/detect")
async def detect_agents() -> Dict[str, Any]:
    """Scan PATH for known agent CLIs and return install status."""
    agents = _detect_agents()
    return {"agents": agents}


@router.get("/connectors/composio")
async def get_composio_config() -> Dict[str, Any]:
    """Return whether Composio is configured and the last 4 chars of the key."""
    return _composio_status()


@router.put("/connectors/composio")
async def put_composio_config(body: ComposioWriteRequest) -> Dict[str, Any]:
    """Save a Composio API key (atomic write, mode 0600)."""
    try:
        return _write_composio_config(body.apiKey)
    except Exception as exc:
        logger.error("Failed to write Composio config: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save Composio config") from exc


@router.delete("/connectors/composio")
async def delete_composio_config() -> Dict[str, Any]:
    """Clear the stored Composio API key."""
    try:
        _write_composio_config("")
    except Exception as exc:
        logger.error("Failed to clear Composio config: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to clear Composio config") from exc
    return {"configured": False, "apiKeyTail": ""}


@router.get("/pets")
async def list_pets(
    request: Request,
    bundled_only: bool = Query(False, description="Return only bundled pets"),
) -> Dict[str, Any]:
    """List available pets with spritesheet URLs."""
    base_url = str(request.base_url).rstrip("/")
    pets = _list_pets(base_url)
    if bundled_only:
        pets = [p for p in pets if p["bundled"]]
    user_root = str(Path.home() / ".codex" / "pets")
    return {"pets": pets, "rootDir": user_root}


class PetSyncResult(BaseModel):
    wrote: int
    skipped: int
    failed: int
    total: int
    errors: List[str]
    rootDir: str


@router.post("/pets/sync")
async def sync_community_pets(
    source: str = Query("all", description="petshare | hatchery | all"),
    limit: int = Query(24, description="Max pets per source"),
) -> Dict[str, Any]:
    """Download community pets from PetShare and/or j20 Hatchery."""
    if source not in ("petshare", "hatchery", "all"):
        raise HTTPException(status_code=422, detail="Invalid source")

    user_root = Path.home() / ".codex" / "pets"
    user_root.mkdir(parents=True, exist_ok=True)

    wrote = 0
    skipped = 0
    failed = 0
    errors: List[str] = []

    import urllib.request
    import urllib.error

    def _fetch_json(url: str) -> Optional[Any]:
        try:
            with urllib.request.urlopen(url, timeout=10) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            errors.append(f"Fetch {url}: {e}")
            return None

    def _download_sprite(url: str, dest: Path, ext: str) -> bool:
        try:
            with urllib.request.urlopen(url, timeout=15) as r:
                data = r.read()
            # Validate magic bytes
            MAGIC = {".webp": b"RIFF", ".png": b"\x89PNG", ".gif": b"GIF8"}
            magic = MAGIC.get(f".{ext}")
            if magic and not data.startswith(magic):
                return False
            dest.write_bytes(data)
            return True
        except Exception as e:
            errors.append(f"Download {url}: {e}")
            return False

    def _sanitize(val: Any) -> str:
        if not isinstance(val, str):
            return ""
        return re.sub(r"[^a-zA-Z0-9._-]", "-", val)[:80]

    tasks: list[dict] = []

    # --- PetShare ---
    if source in ("petshare", "all"):
        url = f"https://ihzwckyzfcuktrljwpha.supabase.co/functions/v1/petshare/api/pets?page=1&pageSize={limit}"
        data = _fetch_json(url)
        if data:
            items = data if isinstance(data, list) else data.get("pets", [])
            for item in items[:limit]:
                if not isinstance(item, dict):
                    continue
                pid = _sanitize(item.get("id") or item.get("displayName", ""))
                if not pid:
                    continue
                sheet_url = item.get("spritesheetUrl") or item.get("spritesheetPath")
                if not sheet_url or not isinstance(sheet_url, str):
                    continue
                ext = sheet_url.rsplit(".", 1)[-1].lower() if "." in sheet_url else "webp"
                if ext not in ("webp", "png", "gif"):
                    ext = "webp"
                tasks.append({
                    "source": "petshare",
                    "folder": pid,
                    "manifest": {
                        "displayName": item.get("displayName", pid),
                        "description": item.get("description", ""),
                        "author": item.get("ownerName", ""),
                        "tags": item.get("tags", []),
                    },
                    "spritesheetUrl": sheet_url,
                    "ext": ext,
                })

    # --- Hatchery ---
    if source in ("hatchery", "all"):
        hatch_data = _fetch_json("https://j20.nz/hatchery/api/pets.json")
        if hatch_data:
            items = hatch_data if isinstance(hatch_data, list) else hatch_data.get("pets", [])
            existing_folders = {t["folder"] for t in tasks}
            for item in items[:limit]:
                if not isinstance(item, dict):
                    continue
                pid = _sanitize(item.get("petManifestId") or item.get("id") or item.get("displayName", ""))
                if not pid or pid in existing_folders:
                    continue
                sheet_url = item.get("spritesheetUrl")
                if not sheet_url or not isinstance(sheet_url, str):
                    continue
                ext = sheet_url.rsplit(".", 1)[-1].lower() if "." in sheet_url else "webp"
                if ext not in ("webp", "png", "gif"):
                    ext = "webp"
                tasks.append({
                    "source": "hatchery",
                    "folder": pid,
                    "manifest": {
                        "displayName": item.get("displayName", pid),
                        "description": item.get("description", ""),
                        "author": item.get("authorLabel", ""),
                        "tags": [],
                    },
                    "spritesheetUrl": sheet_url,
                    "ext": ext,
                })

    total = len(tasks)

    for task in tasks:
        folder = task["folder"]
        pet_dir = user_root / folder
        sheet_path = pet_dir / f"spritesheet.{task['ext']}"
        if sheet_path.exists():
            skipped += 1
            continue
        pet_dir.mkdir(parents=True, exist_ok=True)
        if _download_sprite(task["spritesheetUrl"], sheet_path, task["ext"]):
            manifest_path = pet_dir / "pet.json"
            manifest_path.write_text(json.dumps(task["manifest"], ensure_ascii=False, indent=2))
            wrote += 1
        else:
            failed += 1

    return {
        "wrote": wrote,
        "skipped": skipped,
        "failed": failed,
        "total": total,
        "errors": errors[:10],
        "rootDir": str(user_root),
    }


@router.get("/pets/{pet_id}/spritesheet")
async def get_pet_spritesheet(pet_id: str) -> Response:
    """Serve a pet spritesheet binary. Rejects path-traversal attempts."""
    if not _PET_ID_RE.fullmatch(pet_id):
        raise HTTPException(status_code=404, detail="Pet not found")

    sheet = _find_spritesheet(pet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Pet not found")

    _MIME = {
        ".webp": "image/webp",
        ".png":  "image/png",
        ".gif":  "image/gif",
    }
    media_type = _MIME.get(sheet.suffix, "application/octet-stream")
    return FileResponse(str(sheet), media_type=media_type)


# ---------------------------------------------------------------------------
# Agent selection routes
# ---------------------------------------------------------------------------

@router.get("/agents/selection")
async def get_agent_selection() -> Dict[str, Any]:
    """Return the currently selected agent id."""
    return _read_agent_selection()


@router.put("/agents/selection")
async def put_agent_selection(body: AgentSelectionWriteRequest) -> Dict[str, Any]:
    """Persist the selected agent id."""
    try:
        return _write_agent_selection(body.selectedId)
    except Exception as exc:
        logger.error("Failed to write agent selection: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save agent selection") from exc


# ---------------------------------------------------------------------------
# Appearance routes
# ---------------------------------------------------------------------------

@router.get("/appearance")
async def get_appearance() -> Dict[str, Any]:
    """Return the current appearance settings."""
    return _read_appearance()


@router.put("/appearance")
async def put_appearance(body: AppearanceWriteRequest) -> Dict[str, Any]:
    """Persist appearance settings. Valid themes: dark, light, system."""
    if body.theme not in _VALID_THEMES:
        raise HTTPException(status_code=422, detail="Invalid theme")
    try:
        return _write_appearance(body.theme)
    except Exception as exc:
        logger.error("Failed to write appearance config: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save appearance") from exc


# ---------------------------------------------------------------------------
# BYOK routes
# ---------------------------------------------------------------------------

@router.get("/byok/models")
async def get_byok_models() -> Dict[str, Any]:
    """Return the list of supported models for BYOK."""
    return {"models": BYOK_MODELS}


@router.get("/byok")
async def get_byok() -> Dict[str, Any]:
    """Return masked BYOK keys and the selected model."""
    config = _read_byok_config()
    return _byok_public_view(config)


@router.put("/byok")
async def put_byok(body: ByokWriteRequest) -> Dict[str, Any]:
    """Save a provider API key and/or update the selected model."""
    if body.provider not in _VALID_PROVIDERS:
        raise HTTPException(status_code=422, detail="Invalid provider")
    try:
        config = _read_byok_config()
        if body.apiKey is not None:
            config["keys"][body.provider] = body.apiKey if body.apiKey else None
        if body.model is not None:
            config["model"] = body.model
        if body.baseUrl is not None:
            config.setdefault("baseUrls", {})[body.provider] = body.baseUrl or None
        _write_byok_config(config)
    except Exception as exc:
        logger.error("Failed to write BYOK config: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save BYOK config") from exc
    return {"ok": True}


@router.delete("/byok/{provider}")
async def delete_byok_provider(provider: str) -> Dict[str, Any]:
    """Clear the stored API key for a provider."""
    if provider not in _VALID_PROVIDERS:
        raise HTTPException(status_code=422, detail="Invalid provider")
    try:
        config = _read_byok_config()
        config["keys"][provider] = None
        _write_byok_config(config)
    except Exception as exc:
        logger.error("Failed to clear BYOK key for %s: %s", provider, exc)
        raise HTTPException(status_code=500, detail="Failed to clear BYOK key") from exc
    return {"ok": True}


# ---------------------------------------------------------------------------
# Media config routes
# ---------------------------------------------------------------------------

@router.get("/media")
async def get_media_config() -> Dict[str, Any]:
    """Return media provider list and masked API keys."""
    cfg = _read_media_config()
    masked = {p["id"]: _mask_key(cfg.get("keys", {}).get(p["id"])) for p in _MEDIA_PROVIDERS}
    return {"providers": _MEDIA_PROVIDERS, "keys": masked}


@router.put("/media")
async def put_media_config(body: MediaWriteRequest) -> Dict[str, Any]:
    """Save a media provider API key."""
    valid_ids = {p["id"] for p in _MEDIA_PROVIDERS}
    if body.providerId not in valid_ids:
        raise HTTPException(status_code=422, detail="Unknown provider")
    try:
        cfg = _write_media_config(body.providerId, body.apiKey)
        return {"ok": True, "configured": bool(cfg.get("keys", {}).get(body.providerId))}
    except Exception as exc:
        logger.error("Failed to write media config: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save media config") from exc


@router.delete("/media/{provider_id}")
async def delete_media_config(provider_id: str) -> Dict[str, Any]:
    """Clear the stored API key for a media provider."""
    valid_ids = {p["id"] for p in _MEDIA_PROVIDERS}
    if provider_id not in valid_ids:
        raise HTTPException(status_code=422, detail="Unknown provider")
    try:
        _write_media_config(provider_id, "")
    except Exception as exc:
        logger.error("Failed to clear media config: %s", exc)
    return {"ok": True}
