"""一键打完整交付包：把源码 / 文档 / 工具 / 演示库收成唯一一个 zip。

用法：
    python tools/make_package.py

输出：../ShadowFlow-OPC-OS-v<版本>.zip（同名覆盖，桌面始终只保留这一个交付包）
包内顶层放「从这里开始.md」，解压后先看它就不会觉得文件零散。

刻意排除：.git、缓存、运行日志、以及带真实运行数据的 shadowflow.db（首次启动会自动建）。
"""

import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT.parent

EXCLUDE_DIRS = {".git", ".tmp", "__pycache__", ".pytest_cache", ".workbuddy", ".workbuddy-tmp"}
EXCLUDE_FILES = {".run.log", ".env", ".env.local", ".env.production"}
EXCLUDE_SUFFIX = {".pyc", ".pyo", ".wal", ".shm"}
# 运行库含真实订单数据与访问凭据，绝不进包
EXCLUDE_DB = {"shadowflow.db", "shadowflow.db-wal", "shadowflow.db-shm"}
# 这些是本地临时目录 / 派生产物，不该跟着包走：
#   backup/        换库前的旧库备份（含真实数据）
#   demo-run/      演示时临时跑的那份库
#   public-demo/   公网发布目录的构建产物（源码副本 + 演示库），跟主包重复
#   demo-clean.db-wal / -shm  WAL 附属文件，db 文件本身已做 checkpoint，不需要
EXCLUDE_SUBPATHS = ("data/backup", "data/demo-run", "data/public-demo")
# 走查截图等一次性产物
EXCLUDE_IMAGES = {"local-order.png", "public-order.png", "public-os.png", "public-shop.png"}


def version():
    txt = (ROOT / "app" / "config.py").read_text(encoding="utf-8")
    return re.search(r'APP_VERSION\s*=\s*"([^"]+)"', txt).group(1)


def collect():
    files = []
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(ROOT).as_posix()
        if any(part in EXCLUDE_DIRS for part in p.relative_to(ROOT).parts[:-1]):
            continue
        if any(rel.startswith(prefix) for prefix in EXCLUDE_SUBPATHS):
            continue
        if p.name in EXCLUDE_FILES or p.suffix in EXCLUDE_SUFFIX:
            continue
        if p.name in EXCLUDE_IMAGES:
            continue
        if p.name in EXCLUDE_DB:
            continue
        files.append((p, "shadowflow-backend/" + rel))
    return files


def readme(ver, files):
    cats = {}
    for _, name in files:
        top = name.split("/")[1] if "/" in name.split("/", 1)[1] else "根目录"
        cats[top] = cats.get(top, 0) + 1
    lines = "\n".join(f"| `{k}/` | {v} 个 |" for k, v in sorted(cats.items()))
    return f"""# 从这里开始 · ShadowFlow 后端 v{ver}

这是**一份完整、可独立运行的交付包**。解压后只有两样东西：本文件（入口）
和一个项目目录 `shadowflow-backend/`。**带上这个 zip 就够了**，其余都不用拿。
外层桌面上的 PDF、`旧/` 文件夹、`_tpl4.tex` 等与本项目无关；外层那份 `演示台词.md`
与包内 `docs/演示台词.md` 内容相同，只是留档副本，不用重复带走。

## 1. 怎么跑（Windows 三步）

1. 进入 `shadowflow-backend/`，双击 `start.bat`（mac/Linux 用 `sh start.sh`）
2. 等控制台出现 `Uvicorn running on http://127.0.0.1:8787`
3. 浏览器打开 <http://127.0.0.1:8787/?autorun=1>，约 8 秒自动跑完一次完整任务

需要 Python 3.9+；启动脚本会自动装依赖（只装 fastapi / uvicorn / segno）。
数据库**不用准备**：首次启动自动建表和种子数据。

### 要让交付物能直接给客户？——接真模型（可选，正式交付必做）

默认走模拟器，交付的是「作业骨架」，不是市场结论。接真模型只需三步：

1. 复制 `.env.example` 为 `.env`（同目录）
2. 填三行：`SF_LLM_BASE_URL` / `SF_LLM_API_KEY` / `SF_LLM_MODEL`
   （模板里已给 DeepSeek / OpenAI / 通义 / Kimi 的现成写法）
3. 验证：`python tools/llmcheck.py` —— **退出码 0 才算真接通**（它会真发一次请求）

通过后重启服务，`/api/health` 的 `llm.mode` 会从 `simulated` 变成 `live`。

## 2. 四个页面 / 四个入口

| 地址 | 给谁用 |
|---|---|
| `/?autorun=1` | 引擎自测台（事件流、DAG、策略矩阵，技术演示） |
| `/shop` | 商品与扫码下单 |
| `/q/{{product_id}}` | 买家填写需求 → 付款 → 等交付 |
| `/os` | 公司经营台（团队、项目、审批、损益、客户回访） |

## 3. 四份文档，只读你需要的那一份

| 你是 | 看这个 | 讲什么 |
|---|---|---|
| 后端自己 | `README.md` | 完整技术说明、启动、架构、变更记录 |
| 前端 / 支付 / 模型对接 | `docs/接口对接说明.md` | 字段清单、契约版本、改动流程、联调命令 |
| 临时查某个接口 | `docs/API.md` | 全部端点的入参出参手册 |
| 上台演示 | `docs/演示台词.md` | 逐字稿、被问到怎么答 |

四份按角色分工、内容不重复，且共用同一套端口与契约版本；
`tools/aligncheck.py` 会自动检查它们有没有写错端口。**不用四份都读。**

## 4. 包里都有什么

| 目录 | 内容 |
|---|---|
{lines}

- `app/` 是后端全部源码；`app/static/` 是四个页面（前端同事要改界面就动这里）。
- `tools/` 是自检脚本，不是运行时依赖；`data/demo-clean.db` 是干净演示库。
  想用干净数据演示，跑 `python tools/demo_reset.py`（另起一份 `data/demo-run/`，
  **不动你正在用的库**），或直接双击 `start-demo.bat`。
  台词里该念多少单、多少钱，跑 `python tools/demonumbers.py` 现算，别背数字。
- `requirements.txt` 是依赖清单；运行库 `shadowflow.db` 故意不带，首次启动自动建。

## 5. 改完代码跑这三件套（不用起服务的除外）

```
python tools/aligncheck.py      # 前后端接口有没有对不上（静态，不用起服务）
python tools/contractcheck.py --base http://127.0.0.1:8787   # 字段契约
python tools/fuzzcheck.py    --base http://127.0.0.1:8787   # 脏输入不 5xx
```

前端对接只需记住一条：**接口清单与字段以 `/api/meta` 和 `app/contract.py` 为准**，
不要照着页面猜字段。契约版本见 `contract.py` 的 `CONTRACT_VERSION`。

## 6. 已知限制（对外说明时用得上）

- 默认模拟模型与模拟支付。接真模型见第 1 节：填 `.env` 后跑 `tools/llmcheck.py` 验证；
  接真实收款需要企业商户号，个人拿不到回调资质。
- 单机单进程：没有分布式锁，多进程同时连同一个库会抢任务。
- 自动对账只覆盖「已交付但未入账」这一种缺口。

## 7. 想继续改 ShadowFlow

不是每次改代码都要重写文档。**内部实现（算法、SQL、修 bug、性能）三份都不用动**；
只有接口契约、启动方式、演示流程变了才需要同步，对照表见 `README.md` 最后一节
「继续开发时，文档怎么跟着改」。

改完先跑 `python tools/aligncheck.py`：端口不一致、接口失效、新接口漏写、版本没登记，
它会直接列出来并给出非零退出码。最后执行 `python tools/make_package.py` 重新打包，
同名覆盖，桌面上始终只有这一个包。

---
打包清单共 {len(files)} 个文件；生成方式 `python tools/make_package.py`。
"""


def main():
    ver = version()
    files = collect()
    out = OUT_DIR / f"ShadowFlow-OPC-OS-v{ver}.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr("从这里开始.md", readme(ver, files))
        for src, name in files:
            z.write(src, name)
    print(f"输出：{out}")
    print(f"文件：{len(files) + 1} 项，{out.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
