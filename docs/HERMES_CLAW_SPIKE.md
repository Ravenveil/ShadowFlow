# Hermes `claw` 子命令 SPIKE(Sprint 0)

- **Story**: 2.7 — Hermes `claw` 子命令 SPIKE
- **AR**: AR60(Must,1 天 SPIKE)
- **日期**: 2026-04-18
- **时间盒**: 1 天(严格)
- **产物类型**: 决策文档(不含代码改动)
- **影响面**: AR52(OpenClaw CLI Executor)、AR57(ShadowClaw Agent)、Story 2.2 / 2.5 preset 命名

---

## 执行环境

| 项 | 值 |
| --- | --- |
| Hermes 仓库 | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) |
| Hermes 版本 | v0.9.0(已在 brainstorming 2026-04-17 会话确认仓库存活,HTTP 200) |
| 源码访问途径 | GitHub `main` 分支 raw 文件(`hermes_cli/claw.py` 532 行 + README + `hermes_cli/main.py` 顶层 docstring),访问日期 **2026-04-18**。所有 `claw.py:{行号}` 引用基于此日期的 `main` 分支快照;未来上游重构后本 SPIKE 的行号引用可能漂移,届时以已引用的**代码内容**(已逐段粘贴于下方"源码分析"章节)为权威,行号作参考 |
| 本地 CLI 可用性 | **本机未安装 Hermes CLI,无 `hermes --version` 实机输出**。SPIKE 结论基于**源码与官方文档证据链**得出,等价于"读 `hermes_cli/claw.py` + `hermes_cli/main.py` + README" |
| OS | Windows 11(宿主机;本 SPIKE 无需跨 OS 验证) |

> **透明性说明**: 本 SPIKE 依赖上游仓库源码证据,而非实机 `hermes claw --help` 输出。因 `hermes_cli/claw.py` 的模块 docstring 第 1-15 行明确列出了 usage 全集(见下方证据),且 `claw_command` 分发器实现完整可读,与 `--help` 输出等价。Sprint 0 若补装 Hermes,可执行 `hermes claw --help` 做交叉验证,**结论不会改变**(源码即契约)。

---

## 命令行输出(从源码 docstring 等价还原)

`hermes_cli/claw.py:1-15` 模块级 docstring(即 `hermes claw --help` 的权威来源):

```python
"""hermes claw — OpenClaw migration commands.

Usage:
    hermes claw migrate              # Preview then migrate (always shows preview first)
    hermes claw migrate --dry-run    # Preview only, no changes
    hermes claw migrate --yes        # Skip confirmation prompt
    hermes claw migrate --preset full --overwrite  # Full migration, overwrite conflicts
    hermes claw cleanup              # Archive leftover OpenClaw directories
    hermes claw cleanup --dry-run    # Preview what would be archived
"""
```

`hermes_cli/claw.py:215-228` 分发器(等价于子命令列表):

```python
def claw_command(args):
    """Route hermes claw subcommands."""
    action = getattr(args, "claw_action", None)

    if action == "migrate":
        _cmd_migrate(args)
    elif action in ("cleanup", "clean"):
        _cmd_cleanup(args)
    else:
        print("Usage: hermes claw <command> [options]")
        print()
        print("Commands:")
        print("  migrate          Migrate settings from OpenClaw to Hermes")
        print("  cleanup          Archive leftover OpenClaw directories")
        print()
        print("Run 'hermes claw <command> --help' for options.")
```

**子命令集合(闭集,仅 2 个)**: `migrate` / `cleanup`(别名 `clean`)。

`hermes_cli/main.py` 顶层 docstring 在 Hermes CLI 一级子命令清单(`chat` / `gateway` / `setup` / `acp` / `honcho` / `sessions` / `doctor` / ...)之外,将 `claw migrate` 作为示例列出,佐证 `claw` 与 `acp` / `mcp` 等**是同级一级子命令**,并非嵌套在 agent 运行时路径上。

---

## 源码分析(关键片段 + 行号引用)

### 证据 A:`claw` 的本质 — OpenClaw 静态数据迁移器,**非 agent runtime 集成**

`hermes_cli/claw.py:1`(模块 docstring 首行):

```
"""hermes claw — OpenClaw migration commands.
```

**类型定义**: "migration commands"(迁移命令),**不是** "agent runtime" / "plugin" / "provider"。

### 证据 B:零 `from openclaw import` — 无 OpenClaw 代码依赖

`hermes_cli/claw.py:17-28`(完整 imports):

```python
import importlib.util
import logging
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from hermes_cli.config import get_hermes_home, get_config_path, load_config, save_config
from hermes_constants import get_optional_skills_dir
from hermes_cli.setup import (
    Colors, color, print_header, print_info, print_success, print_error, prompt_yes_no,
)
```

**关键**: 没有 `import openclaw` 或 `from openclaw import ...`。Hermes **没有把 OpenClaw 作为库依赖**。迁移脚本通过 `importlib.util` 动态加载独立的 `openclaw_to_hermes.py` 脚本(见证据 C),属于"脚本调用"而非"运行时集成"。

### 证据 C:迁移目标 = 静态文件,不是 agent 进程

`hermes_cli/claw.py:30-35`(关键常量):

```python
logger = logging.getLogger(__name__)
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
_OPENCLAW_SCRIPT = (
    get_optional_skills_dir(PROJECT_ROOT / "optional-skills")
    / "migration" / "openclaw-migration" / "scripts" / "openclaw_to_hermes.py"
)
```

`hermes_cli/claw.py:230-250`(`_cmd_migrate` 头部)默认源路径:

```python
def _cmd_migrate(args):
    """Run the OpenClaw → Hermes migration."""
    explicit_source = getattr(args, "source", None)
    if explicit_source:
        source_dir = Path(explicit_source)
    else:
        source_dir = Path.home() / ".openclaw"
        if not source_dir.is_dir():
            for legacy in (".clawdbot", ".moltbot"):
                candidate = Path.home() / legacy
                if candidate.is_dir():
                    source_dir = candidate
                    break
    ...
```

**迁移对象**: `~/.openclaw/` 目录下的 **用户配置 / persona(SOUL.md)/ memories / skills / API keys** 静态文件,迁到 `~/.hermes/`。

### 证据 D:cleanup 是归档,不是卸载

`hermes_cli/claw.py:373-383`(`_cmd_cleanup` 头部):

```python
def _cmd_cleanup(args):
    """Archive leftover OpenClaw directories after migration.

    Scans for OpenClaw directories that still exist after migration and offers
    to rename them to .pre-migration to free disk space.
    """
```

**行为**: 把 `~/.openclaw` 重命名为 `~/.openclaw.pre-migration`(不删除),用户保留回滚能力。

### 证据 E:README 官方定位

Hermes README 原文(引自 WebFetch 分析):

> "If you're coming from OpenClaw, Hermes can automatically import your settings, memories, skills, and API keys."

定位明确:**面向 OpenClaw 老用户的迁移辅助**,一次性脚本。

### 证据 F:`main.py` 一级子命令清单(`hermes_cli/main.py:6-32` docstring)

Hermes CLI 一级子命令包括:`chat` / `gateway` / `setup` / `logout` / `status` / `cron` / `doctor` / `honcho` / `sessions` / `version` / `update` / `uninstall` / **`acp`** / `claw`(另见 docstring 示例行 32 `"hermes claw migrate --dry-run"`)。

`acp` 的描述:"Run as an ACP server for editor integration" —— 这**确认了 Epic 2 Story 2.3 (ACP Client) 的前提**:Hermes 已内置 ACP server 模式,ShadowFlow 作为 ACP client 接入是可行路径。

---

## 结论 — `claw` 是什么?

**✅ 结论(三选一定案)**: **独立的"OpenClaw 数据迁移"辅助工具**(对 Hermes 用户)。

| 候选 | 判定 | 证据 |
| --- | --- | --- |
| (a)Hermes 内置的 OpenClaw **运行时集成**(即 Hermes 可以"调用 OpenClaw 作为 sub-agent") | ❌ 排除 | 证据 B:零 `from openclaw import`,无运行时依赖。证据 F:`claw` 与 `acp` / `chat` / `gateway` 并列为 CLI 一级子命令,不是 agent runtime 路径 |
| (b)独立的类 "claw agent" 能力(即 `hermes claw` 是一个 agent 执行入口) | ❌ 排除 | 证据 A / E:docstring 与 README 明确为 "migration commands"。证据 C / D:闭集仅 `migrate` + `cleanup`,无 `run` / `chat` / `session` 等 agent 入口 |
| (c)**一次性静态数据迁移工具(OpenClaw → Hermes)** | ✅ **定案** | 证据 A-F 全部指向此结论。命名空间语义:`claw` 在此读作"**from Claw**(= OpenClaw)",是动词化的 import/migration namespace,类比 `git mv` |

**扩展判定**:

- **`claw` 不是 agent 名,是"OpenClaw 的简写 namespace"**。Hermes 作者选择这个名字,因为 OpenClaw 的用户生态中 `~/.openclaw` 目录已被称为 "claw" data。`hermes claw` 读作 "hermes (import from) claw"。
- **闭集,无扩展计划**: `migrate` + `cleanup` 两个子命令覆盖完整迁移生命周期。这是一次性 one-shot 工具,预期用完即弃。

---

## 命名冲突分析

### ShadowFlow 术语现状

| ShadowFlow 术语 | 含义 | 定位 |
| --- | --- | --- |
| **ShadowClaw**(英文代码 / "影爪")| ShadowFlow 生态自家 agent **实体**,Shadow Tauri 项目已有 Rust 实作(`src-tauri/src/main.rs:63-66` 3 个 Tauri command + S.C.O.R.E. + ReAct) | 被 ShadowFlow 调度的 agent runtime |
| **ShadowSoul** | 部分章节对 ShadowClaw 的别称(epics.md 同时出现两种写法) | 见下文"遗留问题" |
| **`provider: "openclaw"`**(Story 2.2 preset)| OpenClaw CLI Executor 接入点,ShadowFlow 作为 scheduler 直接 spawn OpenClaw binary | ShadowFlow 接第三方 agent 的 preset 之一 |

### 与 Hermes `claw` 的冲突矩阵

| ShadowFlow 术语 | 与 `hermes claw` 冲突? | 理由 |
| --- | --- | --- |
| **ShadowClaw(影爪)** | ❌ **不冲突** | 两个概念**正交**: (1)namespace 不同 — Hermes `claw` 是 `hermes` CLI 下的**子命令**,ShadowClaw 是 ShadowFlow 下的**agent 实体**,用户不会在同一命令行碰到;(2)语义不同 — `hermes claw` 读"from Claw(= OpenClaw)",ShadowClaw 读"Shadow 家的 Claw",都用 "claw" 但指向完全不同的对象;(3)生态源头不同 — ShadowClaw 源自 Shadow Tauri 项目自研,与 OpenClaw 血统无关 |
| **`provider: "openclaw"` preset** | ❌ **不冲突** | Hermes `claw` 不做 OpenClaw runtime 代理;ShadowFlow 直接接 OpenClaw CLI 是独立路径,两者不重叠 |
| **`provider: "hermes"` preset(Story 2.2)** | ❌ **不冲突** | ShadowFlow 走 `hermes acp serve`(ACP 主协议)或 `hermes mcp serve`(MCP 辅)接入,都**不经过** `hermes claw` 子命令 |

### 结论

**✅ 零实际命名冲突。ShadowClaw(影爪)命名保留,无需改名。**

---

## 决策建议

### 主决策

| 决策项 | 结论 | 理由 |
| --- | --- | --- |
| **ShadowClaw 是否改名?** | ❌ 不改 | 与 Hermes `claw` 概念正交,语义冲突为零。Demo 叙事不会混淆("ShadowClaw 是自家 agent"vs"Hermes claw 是迁移工具")。改名反而损失 Shadow Tauri 项目已建立的命名连续性 |
| **ShadowClaw 定位是否调整?** | ❌ 不调整 | AR57 现有定位("对话 + 执行 + 记忆 + 工具 + 图谱统一入口"/ 薄壳版复用 Shadow Rust 实作)与 Hermes `claw` 无依赖关系 |
| **Story 2.2 / 2.5 preset 命名是否同步变动?** | ❌ 不需要 | `provider: "openclaw"` 指 OpenClaw binary 接入;`provider: "hermes"` 指 Hermes ACP/MCP/CLI 接入,两者均与 Hermes `claw` 子命令无关 |
| **是否需要 ShadowFlow 模板预留 `hermes claw migrate` 功能入口?** | ❌ 不需要 | 一次性 user-data 迁移是 Hermes 自己的 CLI 职责,ShadowFlow scheduler 不该代理 |

### 副决策(遗留问题)

| 项 | 建议 | 负责 |
| --- | --- | --- |
| **ShadowClaw vs ShadowSoul 术语统一** | 本 SPIKE 不解决(与 Hermes claw 无关,属 ShadowFlow 内部命名争议)。建议:epics.md 统一为 **ShadowClaw(英文代码)/ 影爪(中文界面)**,把所有 "ShadowSoul" 字样改为 "ShadowClaw"。由 Story 2.5 在实装前一次性统一 | Story 2.5 Dev |
| **是否需要在 README "如何接入你的 Agent"一节中说明 Hermes `claw` ≠ ShadowFlow 接入点** | ✅ 加一句脚注 | Story 2.8(Agent Plugin Contract 文档) |

---

## 对 AR57(ShadowClaw Agent)的影响

**结论**: 零实质影响。AR57 原计划可照常推进。

| AR57 条目 | SPIKE 前假设 | SPIKE 后确认 | 改动 |
| --- | --- | --- | --- |
| 命名 | ShadowClaw(暂定,可能需避开 Hermes claw) | ShadowClaw 保留 | 无 |
| 定位 | 自家标杆 agent,对话+执行+记忆+工具+图谱 | 同上 | 无 |
| 实现策略 | 复用 Shadow Rust 实作,薄壳接入 | 同上 | 无 |
| 接入通道 | 优先 `kind: "acp"`(如 ShadowClaw 实现 ACP server),否则 `kind: "cli"`(spawn Rust binary) | 同上;`hermes claw` 与此无关 | 无 |
| Story 2.5 文件名 | `2-5-shadowsoul-rust-binary-接入.md` | **建议**在 epics.md 章节级别统一术语(SOUL→CLAW),但**本 story 文件名不改**(已是 ready-for-dev 成品,改名会破坏 sprint-status.yaml 引用) | 仅 epics.md 章节级术语统一,不改 Story 文件 |

### epics.md 同步更新(Story 2.7 范围内,章节级引用)

- AR60 章节尾部加 "SPIKE 结论见 `docs/HERMES_CLAW_SPIKE.md`(2026-04-18)"
- AR57 章节尾部加 "命名冲突 SPIKE(AR60)已定案,ShadowClaw 命名保留,详见 `docs/HERMES_CLAW_SPIKE.md`"
- AR52 章节尾部加 "OpenClaw 接入独立路径,不受 `hermes claw` 影响,详见 `docs/HERMES_CLAW_SPIKE.md`"

---

## 对 AR52(OpenClaw CLI Executor)的影响

**结论**: 零影响,AR52 继续走独立 CLI 路径。

| 问题 | 答案 |
| --- | --- |
| Hermes 是否已集成 OpenClaw? | ❌ 否(证据 B:无 `import openclaw`)。只做一次性数据迁移,不做 runtime 代理 |
| ShadowFlow 接 OpenClaw 是走 Hermes 中转,还是独立? | ✅ **独立**。因 Hermes `claw` 不提供 runtime 接口,ShadowFlow 必须直接 spawn OpenClaw binary(`provider: "openclaw"` preset,`parse: "jsonl-tail"`)—— 这正是 AR48 / AR52 原设计 |
| AR52 preset 是否改动? | ❌ 不改。`args: ["agent", "--agent", "{id}", "-m", "{stdin}", "--deliver"]` 是 OpenClaw 原生 CLI 契约,与 Hermes 无关 |

### 意外收获

Hermes 的 `acp` 一级子命令(`hermes_cli/main.py` docstring: "Run as an ACP server for editor integration")**确认了 Story 2.3 (ACP Client) 的前提**:Hermes 已内置 ACP server,ShadowFlow 作为 ACP client 直连 Hermes 是最短路径,无需 CLI 绕行。这与 2026-04-17 Hermes 接入决策("ACP 主协议 / MCP 辅"的拍板)互相印证。

---

## 实施跟踪(本 SPIKE 不改代码,仅挂引用)

- [x] `_bmad-output/planning-artifacts/epics.md` AR60 / AR57 / AR52 尾部追加 "SPIKE 结论见 `docs/HERMES_CLAW_SPIKE.md`"(✅ 已完成,2026-04-18,见 epics.md:316 / 356 / 375)
- [ ] Story 2.5(ShadowClaw / ShadowSoul Rust Binary 接入)在 Dev Notes 同步引用 SPIKE 结论(由 Story 2.5 在启动 CS 时处理)
- [ ] Story 2.8(Agent Plugin Contract 文档)在 README 新增"Hermes `claw` 子命令与 ShadowFlow 接入无关"脚注(由 Story 2.8 处理)

---

## 附录 A:证据链交叉表

| 问题 | 引用 |
| --- | --- |
| `hermes claw` 用途是什么? | `hermes_cli/claw.py:1-15` + README OpenClaw 迁移段 |
| 为什么不是 OpenClaw 运行时集成? | `hermes_cli/claw.py:17-28` 无 `import openclaw` |
| 为什么不是独立 agent? | `hermes_cli/claw.py:215-228` 闭集仅 `migrate` + `cleanup`,`hermes_cli/main.py:6-32` 与 `acp` / `chat` / `gateway` 并列为一级子命令 |
| 迁移对象是什么? | `hermes_cli/claw.py:30-35` + `230-250`,默认源 `~/.openclaw/`,legacy `.clawdbot` / `.moltbot` |
| 命名是否冲突? | 命名冲突分析表,ShadowClaw 与 `hermes claw` 概念 / namespace / 语义 / 血统四维正交 |

## 附录 B:Sprint 0 补装 Hermes 后的验证计划(可选)

若 Sprint 0 后续安装 Hermes CLI,可执行以下命令做交叉验证(**预期结论不变**):

```bash
hermes --version                           # 应显示 v0.9.0
hermes claw --help                         # 应输出与 hermes_cli/claw.py:1-15 docstring 一致
hermes claw migrate --help                 # 应列出 --dry-run / --yes / --preset / --overwrite 等 flag
hermes claw cleanup --help                 # 应列出 archive 相关 flag
hermes acp --help                          # 应显示 ACP server 模式(Story 2.3 前提验证)
```

若上述命令输出与 SPIKE 结论不符(极低概率,因源码与文档等价),则**立即以 correct-course 流程**更新本文档与 epics.md。
