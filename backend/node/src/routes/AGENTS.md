# server/src/routes/

Express HTTP 路由。按功能域分目录，每个文件一个 prefix，挂在 `src/index.ts` 里。

## 目录与主要路由

| 域 | Prefix | 文件 | 用途 |
|---|---|---|---|
| `runs/` | `/api/run-sessions` | `run-sessions.ts` | SSE streaming 主入口（POST 建 session，GET /:id/stream 拉流） |
| `runs/` | `/api/runs` | `runs.ts` | 历史 run 列表 + 详情 |
| `runs/` | `/api/runs` | `run-suggestions.ts` | run 改进建议 |
| `agents/` | `/api/agents` | `agents.ts` | sqlite + yaml 合并 agent 列表（S0.6 `listAllAgents` merge） |
| `agents/` | `/api/teams` | `teams.ts` (S0.7) | `:id/dag` GET/PUT/POST validate；其他路径 fallthrough 到 Python |
| `skills/` | `/api/skills` | `skills.ts` | 列 skill + ingest + `:skillId/team` + `:skillId/agents/:id/:slot` (S6.1) |
| `skills/` | `/api/skills` | `skills-preview-triage.ts` | skill 预览分诊 |
| `skills/` | `/api/clawhub` | `clawhub.ts` | ClawHub 安装/取消 |
| `groups/` | （群聊） | `groups-chat.ts` / `groups-node.ts` / `groups-event-bus.ts` | 群聊 DAG fanout、节点输出、事件总线 |
| `memory/` | `/api/memory-entries` 等 | `memory-entries.ts` / `memory-lessons.ts` / `memory-handoff.ts` | 记忆条目 / 经验沉淀 / 交接写回 |
| `dashboard/` | `/api/dashboard` | `dashboard.ts` | token 用量看板 |
| `dashboard/` | （商家看板） | `merchant-board.ts` | MerchantBoardPanel 数据 |
| `projects/` | `/api/projects` | `projects.ts` / `conversations.ts` | 项目 + 会话 |
| `knowledge/` | `/api/knowledge-vaults` | `knowledge-vaults.ts` | 知识库 |
| `system/` | `/api/design-systems` | `design-systems.ts` | DS 列表 + frontmatter |
| `system/` | `/api/export` | `export.ts` | 导出 artifact |
| `system/` | `/api/settings` | `settings.ts` | 应用设置 / BYOK / model overrides |
| `system/` | `/api/cli` | `cli.ts` | 本地 CLI 探测（claude / gh-copilot / openclaw） |
| `system/` | `/api/acp` | `acp.ts` | ACP / MCP 远程 agent 探测 |
| `system/` | `/api/artifacts` | `artifacts.ts` | artifact lint / 校验 |
| `system/` | `/api/auth` | `auth.ts` | 认证 |
| `system/` | （文件浏览） | `fs-browse.ts` | 工作区文件浏览/读写 |

## 后挂 fallback

`src/index.ts` 末尾 `app.use('/api', proxyFallback)` — 未匹配 Node 路由的 /api/* 转发到 Python (`:8000`)。挂载顺序很关键。

## 跨边界规则

- 路由文件**只**负责 HTTP shape 转换（req.body → service args → res.json）
- 复杂业务到 `src/lib/` 或 `src/storage/`
- SSE writer 用 `res.write('data: ...\n\n')` 模式（参考 `runs/run-sessions.ts:sendEvent`）
- 不要在 routes 直接读 yaml / 调 LLM SDK（套间接 lib）

## 添加新路由

1. 在 `src/routes/<domain>/<name>.ts` 写一个 Router（新域就建新子目录）
2. `export default router`
3. `src/index.ts` 加 `import + app.use('/api/<name>', xRouter)`，**挂在 proxyFallback 之前**
