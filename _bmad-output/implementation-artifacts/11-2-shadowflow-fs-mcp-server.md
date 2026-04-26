# Story 11.2: shadowflow-fs MCP Server（文件系统操作工具）

Status: done

## Story

As a **ShadowFlow 平台开发者**,
I want **一个基于 stdio 的 Python MCP Server，暴露 `read` / `write` / `edit` / `glob` / `grep` 五个文件操作工具**,
so that **LLM Agent 可以通过标准 MCP 协议安全地读写本地文件，达到 Claude Code CLI Read/Write/Edit/Glob/Grep 工具的同等能力**。

## 背景

- 技术方案 §5.2b：参考仓库 `Ravenveil/claude-code`（Python 复刻，`src/tools/`）
- 本 Story 是 Phase B 三服务器之一，与 Story 11.1 / 11.3 完全并行
- **前置条件**：无（独立可完成）
- **后置依赖**：Story 11.4（LLM tool_use 循环）

## Acceptance Criteria

### AC1 — MCP Server 启动与工具发现

**Given** `shadowflow/mcp_servers/fs_server.py` 存在  
**When** 通过 `python -m shadowflow.mcp_servers.fs_server` 启动  
**Then** `tools/list` 返回五个工具：
- `read(path: str, offset?: int, limit?: int) → ToolResult`
- `write(path: str, content: str, overwrite?: bool) → ToolResult`
- `edit(path: str, old_string: str, new_string: str) → ToolResult`
- `glob(pattern: str, base_dir?: str) → ToolResult`
- `grep(pattern: str, path: str, context?: int) → ToolResult`

### AC2 — `read()` 工具：文件读取与分页

**Given** 路径在允许列表内（`$SF_FS_ALLOW_ROOT`，默认为启动目录）  
**When** `read(path="src/main.py")` 被调用  
**Then** 返回带行号的文件内容（`cat -n` 格式，1-indexed）  
**And** 文件 > 128KB 时返回 `status: "truncated"` + 内容前 N 行 + 分页提示（`use offset/limit to paginate`）  
**And** 路径越界（`../../etc/passwd`）时返回 `status: "permission_denied"`

### AC3 — `write()` / `edit()` 工具：写入与精确替换

**Given** 路径在允许列表内且 `overwrite: false`（默认）  
**When** `write(path, content)` 调用但文件已存在  
**Then** 返回 `status: "conflict"` + 建议使用 `edit()` 或 `write(overwrite=true)`

**Given** `edit(path, old_string, new_string)` 调用  
**When** `old_string` 在文件中唯一存在  
**Then** 精确替换并返回 `status: "success"` + 行号范围  
**When** `old_string` 不存在  
**Then** 返回 `status: "not_found"`  
**When** `old_string` 匹配多处  
**Then** 返回 `status: "ambiguous"` + 匹配行号列表

### AC4 — `glob()` / `grep()` 工具：搜索

**Given** `glob(pattern="**/*.py")` 调用  
**Then** 返回匹配路径列表，上限 1000 条，超出时附加 `"truncated": true`

**Given** `grep(pattern="def run_agent", path="shadowflow/")` 调用  
**Then** 返回结构化匹配列表：`[{file, line_number, line_content, context_before, context_after}]`  
**And** 默认 3 行上下文，上限 500 条匹配

### AC5 — McpClient 集成测试

**Given** `McpClient` 连接到 fs_server  
**When** 依次调用 `write("tmp/test.txt", "hello")` → `read("tmp/test.txt")` → `edit(..., "hello", "world")` → `grep("world", "tmp/")` → `glob("tmp/*.txt")`  
**Then** 全部返回 success，内容符合预期，无异常

## 技术指引

**新建文件**：
- `shadowflow/mcp_servers/fs_server.py`
- `tests/mcp_servers/test_fs_server.py`

**路径安全实现**：
```python
from pathlib import Path

ALLOW_ROOT = Path(os.getenv("SF_FS_ALLOW_ROOT", ".")).resolve()

def check_path(path: str) -> Path:
    p = (ALLOW_ROOT / path).resolve()
    if not str(p).startswith(str(ALLOW_ROOT)):
        raise PermissionError(f"Path {path} is outside allow root")
    return p
```

**参考**：`Ravenveil/claude-code` → `src/tools/` Read/Write/Edit/Glob/Grep 实现

## DoD

- [x] 五个工具单元测试通过（含路径安全测试）
- [x] McpClient 集成测试通过（AC5 完整流程）
- [x] 路径越界攻击测试通过（`../../` 被拒绝）
- [x] pytest 绿，无新 lint 错误

## File List

- `shadowflow/mcp_servers/fs_server.py` — 新建，fs MCP Server 实现
- `tests/mcp_servers/test_fs_server.py` — 新建，25 个测试（24 单元 + 1 集成）

## Dev Agent Record

### Completion Notes

实现了 `shadowflow-fs` MCP Server：
- `_read()` 带行号（cat -n 格式），128KB 截断分页，offset/limit 支持，路径安全检查
- `_write()` 默认冲突检测（overwrite=false），自动创建父目录
- `_edit()` 精确唯一替换：not_found / ambiguous（含行号列表）/ success（含 changed_lines）
- `_glob()` 使用 stdlib glob，上限 1000，truncated 标志
- `_grep()` 正则搜索，上限 500，结构化 context_before/context_after
- 所有工具的路径安全：`(ALLOW_ROOT / path).resolve()` startswith 检查

测试统计：25/25 全部通过（24 单元 + 1 集成）

## Review Findings

### Round 1 (2026-04-25)
- [x] [Review][Patch] `_resolve_path` startswith 前缀碰撞（CRITICAL）— **已修复 2026-04-26**：改用 `resolved.relative_to(ALLOW_ROOT)` + `ValueError` 捕获，正确拦截 `/data/app-secret/` 类兄弟目录 [fs_server.py:160]
- [x] [Review][Patch] `_glob` 模式包含 `../` 可逃逸沙箱 — **已修复 2026-04-26**：拒绝绝对路径 pattern；glob 结果逐个 `resolve().relative_to(ALLOW_ROOT)` 过滤，拦截符号链接逃逸 [fs_server.py:276]
- [x] [Review][Patch] `_edit` 多行 old_string 时 matched_lines 错误 — **已修复 2026-04-26**：改用 `text.find()` 迭代定位，精确计算每次匹配的起始行号 [fs_server.py:251]

### Round 2 (2026-04-26, automated)
- [x] [Review][Patch] `_read` 大文件 OOM：整文件读入内存后才检查大小 — **已修复 2026-04-26**：超限时先 `fh.read(MAX_FILE_BYTES)` 截断读取，避免 GB 级文件 OOM [fs_server.py:185]
- [x] [Review][Defer] `_glob` `_grep` 同步阻塞事件循环（HIGH）— rglob/glob 未用 asyncio.to_thread，大目录会 block；属架构重构，延后
- [x] [Review][Defer] 符号链接目录读取泄露存在性（HIGH）— glob 已过滤实际内容，但内部符号链接目录本身可能被 rglob 遍历；Phase 2 安全 Story 处理
- [x] [Review][Defer] `_write`/`_edit` 非原子写入（LOW）— 进程崩溃可致文件部分写入；建议 `os.replace` 原子模式，Phase 2 处理

## Change Log

- 2026-04-25: Story 11.2 实现完成。新增 fs MCP Server（read/write/edit/glob/grep），25 个测试全绿，ruff lint 零错误。
- 2026-04-26: Round 2 automated code review — 4 patches applied (path traversal CRITICAL×2, OOM HIGH, multi-line edit HIGH); 3 deferred.
