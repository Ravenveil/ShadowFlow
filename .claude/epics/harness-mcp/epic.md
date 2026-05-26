---
name: harness-mcp
status: open
created: 2026-05-26T14:20:03Z
updated: 2026-05-26T14:20:03Z
prd: harness-6dim-survey-and-river-memory
priority: P3
progress: 0%
source_doc: docs/harness/harness-6dim-survey-and-river-memory.md §2.2 Q6 + §4 B7
---

# Epic: Harness Dimension — MCP（Team MCP Binding）

## 维度定位

**文章 6 维之一**：MCP — *"How to connect safely"* / *External tools and capabilities*

> "MCP 不是 Harness 的核心，而是对外的接口层。它连接什么、访问粒度多细、
> 什么时候允许触发，本身必须由策略和关卡来治理。" —— 文章 §1.6

## 平台缺口（用户视角）

用户问："我想让我团队里某个 Agent 能调 Notion API / GitHub API / 公司内部 Jira，怎么接？"
**ShadowFlow 当前回答**：……如果你用 `cli:claude`，让 Claude Code 自己装 MCP；ShadowFlow 这层不管。

- 我们装的 9 个 MCP（chrome-devtools / pencil / codex / zai / code-review-graph / zread 等）
  是给 ShadowFlow 开发者的 IDE 工具，**不是给用户搭的 team 的运行时工具**
- 用户 team agent 能用什么工具，完全由 executor 决定（cli:claude / cli:codex / byok:zhipu）
- ShadowFlow 平台层无 first-class "team MCP 配置"

**评分**：平台原语 🟡（ShadowFlow IDE 自用有）/ 用户可用度 🔴。

## 战略优先级

**P3 — 中期**。MCP 是接口层，文章主张"留到要把回路往外推时再考虑"。先把核心 5 维
（Rule / Skill / Sub-Agent / Workflow / Scripts）补齐，MCP 跟进。

注意 ACP（Hermes 项目）是我们的 first-class 外部 agent 接入协议，**和 MCP 是两条线**。
本 epic 不冲突 ACP，定位是"让用户 team 内的 agent 能调外部 MCP server"。

## Success Criteria

- [ ] Team 配置可挂 MCP server 列表（server URL + 凭证 ref + 权限范围）
- [ ] Runtime 把 team-bound MCP server 工具暴露给该 team 内所有 agent
- [ ] 权限 / 审计：MCP 调用前置策略门 + 调用日志归档
- [ ] UI 配置面板：team 设置 "外部工具" tab

## 后端模块责任

**新建模块**：`shadowflow/runtime/team_mcp/` — team-level MCP server 配置 + 注入。

**触点**：
- `shadowflow/api/teams.py` — mcp_servers CRUD endpoints
- Runtime executor — turn 开始时把 team MCP 工具加入 agent 工具列表
- `src/components/team-settings/` — 新增 "外部工具" tab

## Tasks Created

- [ ] 001.md - Team-level MCP server schema + API + 凭证管理
- [ ] 002.md - Runtime injection + 权限策略门 + 调用审计
- [ ] 003.md - UI 配置面板（team 设置"外部工具"tab）

Total tasks: 3
Parallel tasks: 1 (003 与 001-002 并行)
Sequential tasks: 2 (001 → 002)
Estimated total effort: 1-2 周
