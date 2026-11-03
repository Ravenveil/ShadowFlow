"""Runtime configuration. All values override-able via environment variables."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("SF_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = str(DATA_DIR / "shadowflow.db")
STATIC_DIR = Path(__file__).resolve().parent / "static"

APP_VERSION = "0.1.0-mvp"
ENGINE_NAME = "shadowflow-python-engine"

PORT = int(os.getenv("SF_PORT", "8787"))
HOST = os.getenv("SF_HOST", "127.0.0.1")

# ---- knowledge base (RAG) ----
# LIGHTRAG_ENABLED=0 reproduces the "stub" behaviour documented in the deck (P10):
# management surface is ready, retrieval returns stub results.
LIGHTRAG_ENABLED = os.getenv("LIGHTRAG_ENABLED", "1").strip().lower() not in ("0", "false", "no", "off")
KB_TOP_K = int(os.getenv("SF_KB_TOP_K", "4"))
KB_CHUNK_SIZE = int(os.getenv("SF_KB_CHUNK_SIZE", "220"))
KB_MIN_SCORE = float(os.getenv("SF_KB_MIN_SCORE", "0.06"))

# ---- llm provider (OpenAI-compatible) ----
LLM_BASE_URL = os.getenv("SF_LLM_BASE_URL", "").rstrip("/")
LLM_API_KEY = os.getenv("SF_LLM_API_KEY", "")
LLM_MODEL = os.getenv("SF_LLM_MODEL", "gpt-4o-mini")
LLM_TEMPERATURE = float(os.getenv("SF_LLM_TEMPERATURE", "0.4"))
LLM_TIMEOUT = float(os.getenv("SF_LLM_TIMEOUT", "60"))

# ---- engine limits ----
LOOP_MAX_DEPTH = int(os.getenv("SF_LOOP_MAX_DEPTH", "4"))
MAX_ROLLBACKS = int(os.getenv("SF_MAX_ROLLBACKS", "2"))
STEP_DELAY = float(os.getenv("SF_STEP_DELAY", "0.35"))  # pacing for a readable live demo

# ---- payment gateway ----
# Real collection needs a merchant account (企业资质)，个人拿不到商户号，也就没有任何回调可用。
# So: simulated by default, real gateways wired but unconfigured.
PAY_MODE = os.getenv("SF_PAY_MODE", "simulated").strip().lower()
PUBLIC_BASE_URL = os.getenv("SF_PUBLIC_BASE_URL", "").rstrip("/")
WECHAT_MCHID = os.getenv("SF_WECHAT_MCHID", "")
WECHAT_APPID = os.getenv("SF_WECHAT_APPID", "")
WECHAT_API_KEY = os.getenv("SF_WECHAT_API_KEY", "")
ALIPAY_APPID = os.getenv("SF_ALIPAY_APPID", "")
ALIPAY_PRIVATE_KEY = os.getenv("SF_ALIPAY_PRIVATE_KEY", "")

# ---- memory ----
MEMORY_ENABLED = os.getenv("SF_MEMORY_ENABLED", "1").strip().lower() not in ("0", "false", "no", "off")
MEMORY_RECALL_TOP_K = int(os.getenv("SF_MEMORY_TOP_K", "3"))
