"""Runtime configuration. All values override-able via environment variables."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path):
    """读取项目根 `.env`（KEY=VALUE，支持 # 注释与引号）。

    不引入 python-dotenv，保持零额外依赖。规则：已存在的真实环境变量优先，
    不被 .env 覆盖 —— 这样「填三个值就能接真模型」，又不影响 CI / 服务器上
    用环境变量注入的部署方式。
    """
    if not path.exists():
        return
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
    except OSError:
        pass


_load_dotenv(BASE_DIR / ".env")

DATA_DIR = Path(os.getenv("SF_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
# 库文件名默认 shadowflow.db；刷新演示库这类工具要操作 demo-clean.db，用 SF_DB_NAME 换名。
DB_NAME = os.getenv("SF_DB_NAME", "shadowflow.db")
DB_PATH = str(DATA_DIR / DB_NAME)
STATIC_DIR = Path(__file__).resolve().parent / "static"

APP_VERSION = "0.5.1"
ENGINE_NAME = "shadowflow-python-engine"

PORT = int(os.getenv("SF_PORT", "8787"))
HOST = os.getenv("SF_HOST", "127.0.0.1")

# ---- 公网演示模式（v0.5.1）----
# 把服务挂到公网时用：管理接口不再只认本机，改为全员可访问。
# 为什么敢开：这个模式下跑的是**一次性演示库**（每次启动从干净库重置），
# 里面只有演示数据，没有真实客户信息、没有访问凭据。
# 一旦指向真实库，必须关掉它 —— 所以这里显式用环境变量开，绝不自动开。
PUBLIC_DEMO = os.getenv("SF_PUBLIC_DEMO", "0").strip().lower() in ("1", "true", "yes", "on")

# ---- 干净演示库作为种子（v0.5.1）----
# 交付包里只带一份 demo-clean.db（干净演示库）。收到包的人第一次启动，
# 运行库还不存在 —— 这时必须拿干净库当种子建出来，否则他看到的是空系统，
# 而包里的演示数字（12 单 / 14 项目 / 116 活儿）全对不上。
# 规则很克制：**只在运行库不存在时**才种子。已有库（哪怕是空的）一律不碰 ——
# 万一那是你自己新建的库，覆盖掉就是数据事故。
# 公网演示模式例外：那里每次启动都重置，因为公开演示会被乱点。
_CLEAN_DB = DATA_DIR / "demo-clean.db"


def _seed_run_db(force=False):
    """把干净演示库复制成运行库。返回 (是否复制了, 说明)。"""
    run = Path(DB_PATH)
    try:
        if not _CLEAN_DB.exists():
            return False, "没有干净演示库，跳过种子"
        if run.resolve() == _CLEAN_DB.resolve():
            return False, "运行库就是干净库本身，跳过"
        if run.exists() and not force:
            return False, "运行库已存在，不覆盖"
        import shutil

        # 先把干净库的 WAL 落盘，避免漏掉还没 checkpoint 的数据
        try:
            import sqlite3

            conn = sqlite3.connect(str(_CLEAN_DB))
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.close()
        except Exception:
            pass  # checkpoint 失败不致命，复制主文件仍然可用
        for suffix in ("-wal", "-shm"):
            side = run.with_name(run.name + suffix)
            if side.exists():
                side.unlink()
        shutil.copy2(_CLEAN_DB, run)
        return True, f"已用干净演示库创建运行库：{run.name}"
    except OSError as exc:
        return False, f"种子失败（继续用现有库）：{exc}"


# 公网演示模式：每次启动都把干净库复制成运行库。
# 公开演示会被乱点（点坏一单、删一条经验），不重置的话对方看到的就不是能演示的样子了。
# 这条只在 PUBLIC_DEMO 打开时生效，正常本地运行绝不受影响。
if PUBLIC_DEMO:
    _done, _msg = _seed_run_db(force=True)
    print(f"[public-demo] {_msg}")

# 普通模式：运行库不存在时才用干净库做种子（拿包即用，不用手动导数据）
else:
    _done, _msg = _seed_run_db(force=False)
    if _done:
        print(f"[seed] {_msg}")

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
ALIPAY_PUBLIC_KEY = os.getenv("SF_ALIPAY_PUBLIC_KEY", "")

# ---- 管理端鉴权 ----
# 留空时管理类接口只接受本机回环请求（局域网访问一律 403）。
# 要在手机上打开管理台，就设一个长随机串：SF_ADMIN_TOKEN=xxxx
ADMIN_TOKEN = os.getenv("SF_ADMIN_TOKEN", "").strip()
# 允许局域网访问管理端时，是否信任反向代理传来的 X-Forwarded-For
TRUST_PROXY = os.getenv("SF_TRUST_PROXY", "0").strip().lower() in ("1", "true", "yes", "on")

# ---- memory ----
MEMORY_ENABLED = os.getenv("SF_MEMORY_ENABLED", "1").strip().lower() not in ("0", "false", "no", "off")
MEMORY_RECALL_TOP_K = int(os.getenv("SF_MEMORY_TOP_K", "3"))

# ---- 主动经营 / 定时任务（v0.5.1）----
# 每天几点自动生成经营简报并落库。0-23。
BRIEF_ENABLED = os.getenv("SF_BRIEF_ENABLED", "1").strip().lower() not in ("0", "false", "no", "off")
BRIEF_HOUR = int(os.getenv("SF_BRIEF_HOUR", "8"))
# 简报推送到哪里（企业微信机器人 / 飞书 / 自建服务都行）。留空 = 只落库不推送。
BRIEF_WEBHOOK = os.getenv("SF_BRIEF_WEBHOOK", "").strip()
