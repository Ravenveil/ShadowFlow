---
name: tech-roadmap-mcp
status: draft
created: 2026-05-26T14:20:03Z
updated: 2026-05-26T14:20:03Z
epic: harness-mcp
based_on: Explore agent 6 维代码基线调研 (2026-05-26)
---

# Harness MCP 技术路线

> 维度：**Team MCP Binding**。让 user team agent 一等公民地调外部 MCP server。

## 1. 现状基线

| 关注点 | 当前状态 |
|--------|---------|
| MCP 暴露能力 | `shadowflow/mcp_server.py` 仅暴露单个 `run_workflow` 工具（line 47-78）；**user team agent 无 MCP 调用能力**（executors.py 无 MCP client）|
| Hermes ACP vs MCP | 两条**独立**线：Hermes (`gateway/hermes.py`) 处理 ACP session prompt/update；mcp_server.py 是 MCP 协议层；acp_server.py 是 ACP WebSocket 层。无代码交叉 |
| ToolPolicy 权限模型 | `contracts_builder.py:ToolPolicy:93-107` 含 `permission_rules: List[PermissionRule]`（allow/ask/deny + arg_pattern）—— **可直接复用作 MCP 权限策略门** |
| 凭证管理 | BYOK config 在 highlevel.py / llm.py；secrets store 路径未找到（仅 `tool_credentials.py:line 1` 提示）。MCP 凭证需补充加密存储或扩 BYOK |

## 2. 推荐插桩点

```
后端：
  shadowflow/api/teams.py                                ← 加 /mcp-servers CRUD
  shadowflow/runtime/contracts_builder.py:ToolPolicy     ← 复用 permission_rules 作 MCP 权限
  shadowflow/runtime/executors.py                        ← 集成 MCP client + tool_call dispatch
  shadowflow/runtime/team_mcp/                           ← 新建模块
    ├── schema.py        # TeamMCPServerSpec
    ├── client.py        # MCP client（stdio/http/sse 三种 transport）
    ├── injector.py      # 把 team-bound MCP tools 注入 agent 可用工具
    ├── permission.py    # 复用 ToolPolicy.permission_rules
    ├── audit.py         # 调用 audit log
    └── credentials.py   # 凭证管理（复用 / 扩 BYOK secrets store）

前端：
  src/components/team-settings/ExternalToolsTab.tsx       ← 新建
```

## 3. 技术路线（按 task 推进顺序）

### Task 001 — Schema + API + 凭证管理（先做）
- `TeamMCPServerSpec` Pydantic 模型：
  ```python
  class TeamMCPServerSpec(BaseModel):
      id: str
      server_url: str
      transport: Literal['stdio', 'http', 'sse']
      credentials_ref: Optional[str] = None  # secrets store ref，不内联
      allowed_tools: List[str] = []
      permission: Literal['allow', 'ask', 'deny'] = 'ask'
  ```
- `team.mcp_servers: List[TeamMCPServerSpec]` 加入持久化（与 workflow / policy_matrix / rules 同存）
- `teams.py` 加 endpoints
- **凭证**：复用现有 BYOK secrets store 模式（先 grep `tool_credentials.py` + BYOK config 确认路径）；如无现成 secrets store，最小实现 .env-style 文件

### Task 002 — Runtime injection + 权限策略门 + 调用审计（依赖 001）
- `MCPInjector.inject(team_id, agent_tools) -> agent_tools` 把 team.mcp_servers 工具合入 agent 可用工具列表
- 插桩位置：`executors.py` 的 turn 启动 / tool dispatch 阶段
- 每次 MCP 调用前查 permission（复用 ToolPolicy.permission_rules 的 evaluate_permission，contracts_builder.py:209）：
  - `allow` 直通 + 记 audit
  - `ask` 走现有 ApprovalCard / Hermes 审批机制（**这里 MCP 与 Hermes 第一次相遇**）
  - `deny` 拒绝 + 记 audit
- audit log 写 `.shadowflow/audit/mcp-{date}.jsonl`
- 集成测试 mock 一个 MCP server 跑通三种 permission 路径

### Task 003 — UI 配置面板（与 002 并行，依赖 001）
- `ExternalToolsTab.tsx` 在 team-settings 加 tab
- 功能：列出当前 mcp_servers（含 connected/disconnected 状态）+ 添加 server + 展开看可用 tools + 配 permission + 查 audit log
- 浏览器手测：挂一个本地 stdio MCP server → 配 permission → 跑 turn → audit log 出现

## 4. 风险 / 隐藏阻塞

- **🔴 secrets store 实现路径不明**：Task 001 必查 `tool_credentials.py` 实际内容 + BYOK config 加密机制；如完全没有，MVP 用 .env-style + dotenv 兜底
- **🟡 MCP client 三 transport 实现**：stdio 最简单（subprocess + JSON-RPC），http/sse 复杂；MVP 只做 stdio + http 两种，sse 留 v2
- **🟡 ApprovalCard 复用边界**：Hermes 现有审批是给 external agent，给 MCP 调用复用要确认 UI 语义是否冲突
- **🟢 调研给的好消息**：ToolPolicy 权限模型 100% 复用，省去重新设计权限引擎

## 5. 与其他 epic 的接口契约

- **服务 [[harness-scripts]] 004 chrome_console_clean validator**：该 validator 需调 chrome-devtools MCP，本 epic 完成后才有干净通路（否则旁路 puppeteer）
- **服务 [[harness-skill]] 001 http step**：未来 http step 走 MCP 化重构（v2）
- **与 Hermes 共用 ApprovalCard**：UI 复用第一次发生

## 6. 调研待二次确认项

- `tool_credentials.py` 实际内容（决定凭证管理实现路径）
- `executors.py` tool_call dispatch 现状（决定 MCP injection 插桩点精确位置）
- ApprovalCard 当前 props / 调用约定（决定能否复用做 MCP `ask` permission）
