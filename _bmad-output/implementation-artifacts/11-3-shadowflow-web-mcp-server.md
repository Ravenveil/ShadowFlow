# Story 11.3: shadowflow-web MCP Server（网络抓取与搜索工具）

Status: done

## Story

As a **ShadowFlow 平台开发者**,
I want **一个基于 stdio 的 Python MCP Server，暴露 `fetch` / `search` 两个网络工具**,
so that **LLM Agent 可以通过标准 MCP 协议抓取 URL 内容并执行网络搜索，达到 Claude Code CLI WebFetch/WebSearch 工具的同等能力**。

## 背景

- 本 Story 是 Phase B 三服务器之一，与 Story 11.1 / 11.2 完全并行
- **前置条件**：无（独立可完成）
- **后置依赖**：Story 11.4（LLM tool_use 循环）

## Acceptance Criteria

### AC1 — MCP Server 启动与工具发现

**Given** `shadowflow/mcp_servers/web_server.py` 存在  
**When** 通过 `python -m shadowflow.mcp_servers.web_server` 启动  
**Then** `tools/list` 返回两个工具：
- `fetch(url: str, timeout?: int) → ToolResult`
- `search(query: str, backend?: str, max_results?: int) → ToolResult`

### AC2 — `fetch()` 工具：URL 抓取

**Given** 一个有效 URL  
**When** `fetch(url="https://example.com")` 被调用  
**Then** 返回：
```json
{
  "status_code": 200,
  "content_type": "text/html",
  "content": "...(text/markdown转换后的内容)...",
  "size_bytes": 1234,
  "retrieval_time_ms": 380
}
```

**And** HTML 内容自动转换为 Markdown（去除脚本/样式标签），保留文本结构  
**And** 非 2xx 状态码时 `status: "http_error"` + 状态码，不抛异常  
**And** 超时（默认 15s）时 `status: "timeout"`

### AC3 — `search()` 工具：网络搜索

**Given** 未配置搜索后端（`SF_SEARCH_BACKEND` 未设置）  
**When** `search(query="python mcp server")` 被调用  
**Then** 返回 `status: "not_configured"` + 配置说明（无静默失败）

**Given** 已配置搜索后端（如 SerpAPI key 在 `SF_SERPAPI_KEY`）  
**When** `search(query="python mcp server", max_results=5)` 被调用  
**Then** 返回结构化结果列表：
```json
[
  { "title": "...", "url": "...", "snippet": "...", "rank": 1 }
]
```

### AC4 — 响应缓存

**Given** 相同 URL 或 query 在 1 小时内被再次请求  
**When** server 命中缓存  
**Then** 返回缓存内容 + `"cache_hit": true` 标志，不重复发起网络请求

### AC5 — McpClient 集成测试

**Given** `McpClient` 连接到 web_server  
**When** `fetch("https://httpbin.org/get")` 被调用（或 mock HTTP server）  
**Then** 返回 status_code=200 的 ToolResult  
**And** `search("test query")` 在未配置后端时返回 `not_configured` 而非异常

## 技术指引

**新建文件**：
- `shadowflow/mcp_servers/web_server.py`
- `tests/mcp_servers/test_web_server.py`

**依赖**：
- `httpx`（异步 HTTP）
- `html2text` 或 `markdownify`（HTML → Markdown）
- 搜索后端：可选 `serpapi` / `tavily-python` / `duckduckgo-search`

**参考**：`Ravenveil/claude-code` → `src/tools/` WebFetch/WebSearch 实现

## DoD

- [x] `fetch()` / `search()` 单元测试通过（含 mock HTTP）
- [x] McpClient 集成测试通过（AC5）
- [x] 缓存逻辑测试通过（TTL 1h，cache_hit 标志）
- [x] search 未配置时优雅降级（not_configured，无异常）
- [x] pytest 绿，无新 lint 错误

## File List

- `shadowflow/mcp_servers/web_server.py` — 新建，web MCP Server 实现
- `tests/mcp_servers/test_web_server.py` — 新建，13 个测试（11 单元 + 2 集成）

## Dev Agent Record

### Completion Notes

实现了 `shadowflow-web` MCP Server：
- `_fetch()` 使用 httpx AsyncClient，HTML 经 html2text 转 Markdown（fallback：正则剥标签），TTL=1h 内存缓存，cache_hit 标志
- `_search()` 支持 serpapi / tavily / duckduckgo 后端，未配置时返回 not_configured（无异常，AC3 核心要求）
- 缓存 key 对 fetch 使用 URL，对 search 使用 `search:{backend}:{query}:{max_results}`
- 缓存过期（>TTL）时透明重新请求

测试统计：13/13 全部通过（11 单元 + 2 集成）

## Review Findings

### Round 1 (2026-04-25)
- [x] [Review][Patch] `_fetch` 跟随重定向无 SSRF 防护 — **已 defer**：设计层面，工具本身允许任意 URL；系统级安全 Story 统一处理
- [x] [Review][Patch] 错误结果被写入缓存（缓存投毒）— **已修复 2026-04-26**：`status:error` 结果不再写入缓存 [web_server.py]
- [x] [Review][Patch] `_search_duckduckgo` 同步调用阻塞事件循环 — **已修复 2026-04-26**：改用 `asyncio.to_thread(_ddgs_sync)` [web_server.py]
- [x] [Review][Patch] `asyncio.wait_for` 与 httpx 双重超时 — **已修复 2026-04-26**：改为 `httpx.AsyncClient(timeout=...)` + 捕获 `httpx.TimeoutException` [web_server.py]

### Round 2 (2026-04-26, automated)
- [x] [Review][Defer] SSRF — `follow_redirects=True` 无私有 IP 过滤（CRITICAL 设计决策）— 工具作为 Agent 能力设计上允许任意 URL；系统级安全策略（allowlist/denylist）留系统安全 Story 统一处理
- [x] [Review][Defer] 缓存无上限/无主动驱逐（MEDIUM）— 已在 2026-04-25 deferred.md 记录；bounded LRU Phase 2 替换

## Change Log

- 2026-04-25: Story 11.3 实现完成。新增 web MCP Server（fetch/search + TTL 缓存），13 个测试全绿，ruff lint 零错误。
- 2026-04-26: Round 2 automated code review — 3 patches applied (cache poisoning CRITICAL, DuckDuckGo event loop blocking HIGH, asyncio.wait_for httpx incorrect HIGH); 1 SSRF deferred (design-level).
