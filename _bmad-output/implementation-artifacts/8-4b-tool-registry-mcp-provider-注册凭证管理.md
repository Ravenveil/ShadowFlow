# Story 8.4b: Tool Registry + MCP Provider 注册与凭证管理

Status: ready-for-dev

## Story

As a **想给 Agent 接入特定数据源或平台的用户**,
I want **在 Builder 里浏览内置工具目录，并通过 MCP Provider 注册接入小红书搜索、GitHub 等专属工具**,
so that **基础工具（Web Search）开箱即用，特殊工具（小红书、Slack 等）只需填一次配置，之后所有 Agent 都能共用**。

## 背景：内置工具 vs MCP 工具

参考 Claude Code CLI 的工具分层设计：

| 类型 | 注册方式 | 凭证 | 用户操作 |
|---|---|---|---|
| **内置工具** | 平台内置，始终可用 | 无需 | Inspector 里勾选开关即可 |
| **MCP 工具** | 用户注册 MCP Provider | 填写 API Key / 启动命令 | 注册一次，全平台共用 |

**内置工具（Built-in，零配置）**：
- `web_search`：通用网页搜索（DuckDuckGo / Brave）
- `web_fetch`：URL 抓取与正文提取
- `code_executor`：沙箱 Python/JS 执行
- `calculator`：数学计算
- `spawn_task`：主管专属 — 将子任务委派给员工 Agent 执行，子 Agent 在孤立上下文中运行后汇报结果；仅当 `RoleProfile.can_spawn_tasks = true` 时在 Inspector 中可见

**MCP 工具（需注册）**：
- 小红书搜索、微博、抖音
- GitHub API、GitLab
- Slack、Email、飞书
- 自定义 REST API（用户自带）
- 本地脚本（stdio MCP 服务器）

这个分层让 Research Kit 默认附带 `web_search`，开箱即用；高级用户接小红书只需注册 MCP Provider 一次。

## Acceptance Criteria

### AC1 — 内置工具始终在 Inspector 的工具选择器中可见，无需注册

**Given** 用户在 Scene Mode Inspector 中选中一个 Agent  
**When** 打开工具选择区域  
**Then** 内置工具列表（`web_search`, `web_fetch`, `code_executor`, `calculator`）始终出现，带有"内置"标签

**And** 内置工具只需 toggle 开关即可绑定到当前 Agent，不需要任何凭证配置

**And** 内置工具的 `tool_id` 为固定平台常量（如 `builtin:web_search`），不允许用户覆盖

**And** 内置工具的搜索引擎提供商（DuckDuckGo / Brave）可在平台全局配置中切换，不暴露到每个 Agent 的 Inspector

### AC2 — MCP Provider 注册：用户可在设置页注册一个 MCP 服务器

**Given** 用户想为平台接入小红书搜索工具  
**When** 用户访问"工具注册 / Tool Providers"设置页  
**Then** 用户可以填写以下字段注册一个 MCP Provider：
- `name`（展示名，如"小红书搜索"）
- `transport_type`（`stdio` / `http` / `sse`）
- 若 `stdio`：`command`（可执行文件路径）+ `args[]`
- 若 `http` / `sse`：`server_url`
- `env`（key-value 凭证，如 `XHS_API_KEY=xxx`）
- `description`（可选）

**And** `env` 字段中的 value **不明文存储**，存储时加密，前端只展示 `***` 掩码

**And** 提交后，平台尝试连接 MCP 服务器，拉取工具 schema 列表，成功后显示"已连接，发现 N 个工具"

**And** 连接失败时显示具体错误（连接超时 / 认证失败 / schema 拉取错误），不静默失败

### AC3 — 注册成功的 MCP 工具在 Inspector 工具选择器中出现

**Given** 用户已成功注册"小红书搜索" MCP Provider  
**When** 用户在 Scene Mode Inspector 中为 Agent 选择工具  
**Then** MCP 工具列表中出现"小红书搜索"下的所有工具，每个工具带有：
- 工具名（来自 MCP schema 的 `name`）
- 简短描述（来自 MCP schema 的 `description`）
- Provider 标签（如"小红书搜索 · MCP"）
- Toggle 开关

**And** 用户 toggle 开启一个 MCP 工具后，`AgentBlueprint.tool_policies` 中写入：
```json
{
  "tool_id": "mcp:xhs:search_notes",
  "provider_id": "provider-uuid",
  "visibility": "enabled",
  "approval_required": false,
  "credentials_ref": "provider-uuid"
}
```

**And** 凭证通过 `credentials_ref` 间接引用，不内联在 Blueprint 中（类比 Claude Code 的 env dict 在 mcp.json 里，不在 prompt 里）

### AC4 — 每个工具可配置 deny / ask / allow 权限规则（参考 Claude Code CLI 权限模型）

**Given** 用户为 Agent 开启了某个工具  
**When** 用户展开该工具的高级权限设置  
**Then** 可为该工具设置三级权限：
- `allow`：Agent 可自动调用，无需审批
- `ask`：每次调用前需要用户（或 Approval Gate）确认
- `deny`：Agent 不能调用此工具（即使 provider 已注册）

**And** 权限规则可选填 arg pattern（glob），如：
- `web_search(query:*小红书*)` → ask（涉及小红书查询时需确认）
- `code_executor(lang:python)` → allow
- `code_executor(lang:bash)` → deny

**And** 规则评估顺序：deny → ask → allow（first match wins，与 Claude Code CLI 一致）

**And** 默认规则：内置工具默认 `allow`，MCP 工具默认 `ask`，用户可覆盖

### AC5 — 后端 Tool Registry API

**Given** 需要持久化管理 MCP Provider 注册与工具 schema 缓存  
**When** 实现 Tool Registry 后端  
**Then** 新建 `shadowflow/api/tools.py`，至少提供：
- `GET /tools/builtin` — 内置工具列表（静态）
- `GET /tools/providers` — 已注册 MCP Providers 列表
- `POST /tools/providers` — 注册新 MCP Provider（含连接验证）
- `DELETE /tools/providers/{id}` — 删除 Provider
- `GET /tools/providers/{id}/tools` — 拉取该 Provider 暴露的工具 schema 列表
- `POST /tools/providers/{id}/test` — 重新测试连接

**And** MCP 连接测试通过标准 MCP 协议（JSON-RPC，`tools/list` 请求）验证

**And** 工具 schema 缓存在内存 + 本地文件（如 `_data/tool_schemas/`），TTL 可配置（默认 1 小时）

**And** 凭证（`env` dict values）使用对称加密存储，解密密钥从环境变量 `SF_TOOL_SECRET_KEY` 读取，不硬编码

### AC6 — Research Kit（Story 10.1）默认附带 `web_search` 内置工具，无需用户配置

**Given** Story 10.1 实例化 Research Kit Blueprint  
**When** Blueprint 生成后  
**Then** `tool_policies` 中自动包含 `builtin:web_search`（`visibility: enabled, approval: allow`）

**And** 用户可以在 Inspector 中额外开启 MCP 工具（如小红书搜索）作为补充搜索来源

**And** Research Kit 的 Planner Agent 在 system prompt 中明确说明可用工具，不需要用户手动注入

### AC7 — 测试覆盖关键路径

**Given** Tool Registry 是 Kit 能力的基础设施  
**When** Story 8.4b 完成  
**Then** 至少覆盖：
- `POST /tools/providers` 注册 stdio MCP Provider，验证连接并拉取 schema
- 凭证掩码展示（前端不泄露明文）
- 注册失败（连接超时 / 认证失败）的错误响应
- 权限规则 deny > ask > allow 评估顺序单元测试
- Inspector 中内置工具始终可见，MCP 工具注册后出现
- Blueprint 中 `credentials_ref` 间接引用，不内联凭证

## Tasks / Subtasks

- [ ] **T1(AC5) 后端 Tool Registry API**
  - [ ] 新建 `shadowflow/api/tools.py`（7 个 endpoint）
  - [ ] 新建 `shadowflow/runtime/tool_registry.py`（Provider CRUD + MCP 连接 + schema 缓存）
  - [ ] 新建 `shadowflow/runtime/tool_credentials.py`（对称加密 env dict，`SF_TOOL_SECRET_KEY`）
  - [ ] 在 `shadowflow/server.py` 接入 tools router

- [ ] **T2(AC2) MCP Provider 注册流程**
  - [ ] 支持 `stdio` 和 `http/sse` 两种 transport（复用 Epic 2 的 MCP client 能力）
  - [ ] 注册时调用 `tools/list` JSON-RPC 验证连接
  - [ ] schema 本地缓存（`_data/tool_schemas/{provider_id}.json`，带 TTL）

- [ ] **T3(AC1/AC3) 前端工具选择器**
  - [ ] 新建 `src/core/components/builder/Inspector/fields/ToolPicker.tsx`
  - [ ] 内置工具列表（静态，带"内置"标签）
  - [ ] MCP 工具列表（从 `GET /tools/providers/{id}/tools` 动态加载）
  - [ ] Toggle 开关写回 `blueprint.tool_policies`

- [ ] **T4(AC4) 权限规则编辑器**
  - [ ] 在 ToolPicker 中展开高级权限（deny/ask/allow + arg pattern）
  - [ ] deny > ask > allow 规则评估逻辑（前端预览 + 后端执行时校验）

- [ ] **T5(AC6) Research Kit 默认 web_search**
  - [ ] 在 `list_kits()` 的 Research Kit 描述中预置 `builtin:web_search` tool policy
  - [ ] Research Kit Planner Agent system prompt 模板中提及可用工具

- [ ] **T6 前端设置页**
  - [ ] 新建 `src/pages/SettingsPage/ToolProvidersTab.tsx`（Provider 列表 + 注册表单）
  - [ ] 凭证 value 展示为 `***`，提交前不明文传输

- [ ] **T7(AC7) 测试**
  - [ ] `tests/test_tool_registry_api.py`
  - [ ] `tests/test_tool_credentials.py`（加解密）
  - [ ] 权限规则评估单元测试
  - [ ] 前端 ToolPicker 组件测试

## Dev Notes

### 与 Epic 2 的关系

Epic 2 的 `AgentExecutor` / MCP Client（Story 2.4）实现了**运行时层**的 MCP 工具调用。本 Story 在其上增加**用户层**的：
- Provider 注册与管理 UI
- 凭证安全存储
- 工具 schema 缓存与浏览
- 权限规则配置

两者不重复：Epic 2 解决"怎么调用 MCP 工具"，本 Story 解决"用户怎么配置哪些 MCP 工具可以被用"。

### 参考：Claude Code CLI 的对应机制

| Claude Code CLI | ShadowFlow Tool Registry |
|---|---|
| 内置工具（Read, Bash, WebFetch...）| `builtin:web_search` / `builtin:code_executor` |
| `~/.claude.json mcpServers` | Tool Providers 注册（全局） |
| `.mcp.json mcpServers` | Tool Providers 注册（项目级，未来扩展） |
| `env dict` in mcp config | `tool_credentials.py` 加密 env 存储 |
| `allowedTools / deniedTools` | `tool_policies[].visibility` + deny/ask/allow 规则 |
| `permissions.deny/ask/allow` + glob | 本 Story AC4 权限规则 + arg pattern |
| 工具 schema 按需加载 | schema 缓存 TTL，运行时 lazy-load |

### 安全边界

- 凭证不进 Blueprint（只有 `credentials_ref` 进）
- 凭证不进日志、SSE 流、Trajectory export
- `SF_TOOL_SECRET_KEY` 只从环境变量读，不允许 hardcode
- MCP stdio 服务器只允许用户自己配置的命令（不允许 sudo / 特权命令）

### Scope Boundaries

**本 Story 做：**
- Built-in 工具目录（静态）
- MCP Provider 注册 + 连接验证
- 工具 schema 缓存与浏览
- Inspector ToolPicker UI
- 权限规则 deny/ask/allow
- Research Kit 默认 web_search

**本 Story 不做：**
- 工具调用的实际执行（Epic 2 已覆盖）
- 工具调用的 Approval Gate 弹窗（Story 1.2 已覆盖）
- 工具调用结果的 Citation 追踪（Story 9.2）
- 工具使用量计费或限额

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- 核心设计参考 Claude Code CLI 的工具分层：内置（零配置）vs MCP（注册一次全平台共用）
- 凭证安全模型参考 Claude Code 的 mcp.json env dict + 平台加密存储
- 权限规则参考 Claude Code 的 deny > ask > allow 评估顺序 + glob pattern
- Research Kit (10-1) 因此不需要让用户手动选择搜索工具——web_search 默认开启

### File List

- `_bmad-output/implementation-artifacts/8-4b-tool-registry-mcp-provider-注册凭证管理.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-04-23: 创建 Story 8.4b，状态置为 `backlog`（依赖 Story 8.3 和 Epic 2）
