---
name: sprint-change-proposal-security-hardening
title: Sprint Change Proposal — 安全漏洞修复（深度扫描 v2）
date: 2026-04-23T05:43:51Z
status: proposed
scope: moderate
trigger: scheduled-task bmad-correct-course "修复漏洞"
affected_epics: [epic-1, epic-5, cross-cutting]
affected_stories: [5-2, 1-3, 1-5]
new_stories_proposed: 3
supersedes: sprint-change-proposal-2026-04-23-security v1 (04:23 UTC)
scan_summary: 2 CRITICAL, 5 HIGH, 8 MEDIUM, 6 LOW
---

# Sprint Change Proposal — 安全漏洞修复（深度扫描 v2）

**提案日期**: 2026-04-23
**触发**: 定时安全扫描（bmad-correct-course 自动触发，参数"修复漏洞"）
**变更范围**: Moderate（需新增 Story + 修改已完成 Story 产出）
**本版说明**: 在 v1（10 项发现）基础上新增深度扫描，共发现 **21 项安全问题**（2 CRITICAL / 5 HIGH / 8 MEDIUM / 6 LOW）。新增 CRITICAL 级 `new Function()` 代码注入是最紧急项。

---

## 1. 问题摘要

对 ShadowFlow 全栈代码库（Python 后端、React/TS 前端、Docker/CI 基础设施）进行三层深度安全扫描，发现 **21 项安全问题**：

| 严重度 | 数量 | 关键项 |
|--------|------|--------|
| **CRITICAL** | 2 | `new Function()` 前端代码注入（5 处）、CORS wildcard + credentials |
| **HIGH** | 5 | 异常泄露、API key 明文 localStorage、HTTP 硬编码、Docker 无版本锁/.env 未 gitignore |
| **MEDIUM** | 8 | Sanitizer 模式缺失、Policy Matrix 无校验、无 Rate Limiting、SSE 未过滤、安全 Header 缺失等 |
| **LOW** | 6 | CSP 缺失、依赖版本范围过宽、CI 权限未限制等 |

当前项目处于 Epic 5 in-progress（Story 5-3 review 中），距 hackathon 截止日（2026-05-16）还有 23 天。**CRITICAL 级 `new Function()` 代码注入必须在 Demo 站上线前修复**——攻击者可通过恶意 workflow YAML 在用户浏览器中执行任意 JavaScript。

---

## 2. 影响分析

### 2.1 Epic 影响

| Epic | 影响 | 说明 |
|------|------|------|
| **Epic 1** (Runtime Hardening) | 追补 | `server.py` 错误处理需统一为标准 error envelope；安全 Header 缺失 |
| **Epic 3** (Frontend Editor) | **新发现** | 4 个 executor 文件存在 `new Function()` 代码注入（CRITICAL） |
| **Epic 5** (0G Integration) | 追补 | Story 5-2 sanitizer 产出缺少 5+ 种常见凭证模式 |
| **Cross-cutting** | 新增 | CORS、rate limiting、Docker 安全加固、CSP、CI 权限 |

### 2.2 Story 影响

| Story | 状态 | 影响 |
|-------|------|------|
| **5-2** (trajectory sanitize scan) | done | sanitizer 缺少 5+ 种常见凭证模式，需追补 pattern |
| **1-3** (运行时真驳回) | done | policy matrix endpoint 接受 `Dict[str, Any]` 无 schema 校验 |
| **1-5** (trajectory export) | done | 所有 `except Exception` 块泄露内部实现 |
| **3-x** (前端 executor) | done | `new Function()` 代码注入 — **CRITICAL 新发现** |

### 2.3 Artifact 冲突分析

| Artifact | 冲突 | 说明 |
|----------|------|------|
| **PRD** | 无冲突 | S1-S6 安全需求已声明，本提案是落实而非变更 |
| **Architecture** | 无冲突 | CORS 限制、error envelope、sanitize 规范已在 architecture.md 定义，代码未对齐 |
| **project-context.md** | 无冲突 | §1 0G 红线、§8 Provider 安全位已覆盖 |

---

## 3. 详细发现

### CRITICAL 级

#### Finding C1: `new Function()` 前端任意代码执行（5 处）— **v2 新发现**

**严重度**: CRITICAL
**文件**:
- `src/core/executors/decision/loop-executor.ts:359,371`
- `src/core/executors/decision/branch-executor.ts:143`
- `src/core/executors/execution/transform-executor.ts:271,370`
- `src/core/executors/review/validate-executor.ts:388`

**现状**:
```typescript
// loop-executor.ts:359
const fn = new Function('variables', `return ${condition}`);
return Boolean(fn(context.state.variables));

// transform-executor.ts:271
const filterFn = new Function('item', `return ${filter_condition}`);
return data.filter(item => filterFn(item));

// transform-executor.ts:370
const fn = new Function('data', `return ${custom_function}`);
return fn(data);
```

**风险**: 用户通过 workflow YAML 传入的 `condition`、`filter_condition`、`custom_function` 字符串直接被 `new Function()` 执行。攻击者可在恶意模板 YAML 中注入任意 JavaScript：
- 窃取 localStorage 中的 API 密钥
- 发起跨站请求
- 操控 DOM
- **通过 CID 分享恶意模板可传播攻击**

**修复方案**: 替换为安全表达式解析器（`expr-eval` 或 `mathjs`），只允许白名单操作：
```typescript
import { Parser } from 'expr-eval';
const parser = new Parser();
const expr = parser.parse(condition);
return Boolean(expr.evaluate(context.state.variables));
```

#### Finding C2: CORS 配置 — `allow_origins=["*"]` + `allow_credentials=True`

**严重度**: CRITICAL（从 v1 HIGH 升级 — 与 C1 组合可实现远程攻击链）
**文件**: `shadowflow/server.py:219-225`

**现状**:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**风险**: 与 C1 组合——恶意站点可跨域调用 `/workflow/run` 并注入含 `new Function()` 攻击的 workflow，在受害者浏览器执行。

**修复**:
```python
_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Last-Event-ID"],
)
```

### HIGH 级

#### Finding H1: 异常信息泄露 — `str(exc)` 直接返回客户端

**文件**: `shadowflow/server.py` 多处（line 275-277, 284-285, 293-295, 334-336, 550-552 等）

**修复**: 按 architecture.md error envelope 标准化：
```python
except Exception as exc:
    trace_id = str(uuid.uuid4())
    logger.exception("Internal error", extra={"trace_id": trace_id})
    raise HTTPException(
        status_code=500,
        detail={"error": {"code": "INTERNAL_ERROR", "message": "An internal error occurred", "trace_id": trace_id}},
    )
```

#### Finding H2: API 密钥明文存储 localStorage — **v2 新发现**

**文件**: `src/core/hooks/useSecretsStore.ts:11-31`

**现状**: Anthropic/OpenAI/Gemini API 密钥以明文 JSON 存储在 localStorage（`SHADOWFLOW_SECRETS_V1`）。注意：0G 私钥存储 (`useZerogSecretsStore.ts`) 已使用 AES-GCM 加密，但其他 API 密钥没有。

**风险**: 任意 XSS（包括 C1）可窃取所有 API 密钥。

**修复**: 将 `useSecretsStore` 升级为与 `useZerogSecretsStore` 相同的 AES-GCM 加密方案。

#### Finding H3: HTTP API URL 硬编码 — **v2 新发现**

**文件**: `src/api/workflow.ts:7`、`src/api/templates.ts:3`

**现状**: `const API_BASE_URL = 'http://localhost:8000'` 硬编码，未使用环境变量。

**修复**: 统一使用 `import.meta.env.VITE_API_BASE`，生产环境强制 HTTPS。

#### Finding H4: Docker 安全加固 — **v2 新发现**

**文件**: `Dockerfile.api`、`Dockerfile.web`、`.gitignore`

**问题集合**:
1. 基础镜像未锁定补丁版本（`python:3.11-slim`、`node:20-alpine`）
2. 容器以 root 运行，无 `USER` 指令
3. `.gitignore` 缺少 `.env` 条目

#### Finding H5: Unsafe YAML Serialization — **v2 新发现**

**文件**: `shadowflow/runtime/trajectory.py:69`

**现状**: `yaml.dump()` 未指定 `Dumper=yaml.SafeDumper`。若输出被 unsafe_load 解析，可构成 RCE 链。

**修复**: 使用 `yaml.safe_dump()`。

### MEDIUM 级

#### Finding M1: Sanitizer 模式不完整

**文件**: `shadowflow/runtime/sanitize.py:26-58`

**缺失模式**: AWS Access Key (`AKIA*`)、Slack Token (`xox*`)、GitHub Fine-grained PAT (`github_pat_*`)、Anthropic API Key (`sk-ant-*`)、Bearer Token Header。

#### Finding M2: Policy Matrix Endpoint 无 Schema 校验

**文件**: `shadowflow/server.py:321-336`

接受 `Dict[str, Any]` 无 Pydantic 校验。

#### Finding M3: 无 Rate Limiting

**文件**: `shadowflow/server.py` 全局

#### Finding M4: SSE payload 未过滤敏感数据

**文件**: `shadowflow/server.py:554-583`

#### Finding M5: 安全 Header 缺失 — **v2 新发现**

**文件**: `shadowflow/server.py`

无 `X-Frame-Options`、`X-Content-Type-Options`、`X-XSS-Protection` 等安全头。

#### Finding M6: Subprocess 参数未校验 — **v2 新发现**

**文件**: `shadowflow/llm/zerog.py:105-116`

`chat_id` 和 `usage_data` 来自 API 响应，未做格式校验。

#### Finding M7: Unvalidated Object.assign — **v2 新发现**

**文件**: `src/core/executors/coordinate/aggregate-executor.ts:267`、`src/core/stores/workflowStore.ts:215,278`

用户数据直接 `Object.assign` 到节点对象。

#### Finding M8: localStorage 私钥 30min TTL

**文件**: `src/core/hooks/useZerogSecretsStore.ts:70-86`

### LOW 级

| # | 问题 | 文件 |
|---|------|------|
| L1 | 无 Content Security Policy | `index.html` / `vite.config.ts` |
| L2 | Last-Event-ID 无边界检查 | `server.py:560-570` |
| L3 | 依赖版本范围过宽 | `pyproject.toml:29-62` |
| L4 | CI/CD 缺少 `permissions:` 块 | `.github/workflows/ci.yml` |
| L5 | 默认 Fallback 到 Testnet 端点 | `src/adapter/zerogStorage.ts:5-7`、`bridge/index.ts:38-40` |
| L6 | 无身份验证 (MVP by-design) | `server.py` 全局 |

---

## 4. 推荐路径

**选择: Direct Adjustment（直接调整）**

**理由**:
- 所有修复都是增量改动，不改变架构或 runtime 契约
- 不需要 rollback 任何已完成 Story
- MVP scope 不受影响
- CRITICAL 级 `new Function()` 必须在 Demo 站上线前修复——CID 分享机制意味着恶意模板可传播
- 工作量估计 **3-4 人日**，在 hackathon 截止前预算充足

### 不推荐的方案

- **Rollback**: 不适用——已完成 Story 的核心功能正确，只需追补安全加固
- **MVP Review**: 不适用——安全修复不改变功能 scope

---

## 5. 变更提案

### 新增 Story: **X-1 · CRITICAL — 前端表达式注入修复**

**Epic 归属**: Cross-cutting（影响 Epic 3 executor 层）
**Priority**: **P0 — 阻塞 Demo 站上线**
**Estimate**: 1 人日

**Acceptance Criteria**:

1. 所有 5 处 `new Function()` 替换为安全表达式解析器（`expr-eval` 或等效库）
2. 表达式仅支持白名单操作（算术、比较、逻辑、属性访问），禁止函数调用/赋值
3. 恶意表达式（如 `fetch('evil.com')` / `localStorage.getItem('key')`）被拒绝并返回明确错误
4. 所有现有 workflow YAML 中的合法表达式仍正常执行
5. 新增针对注入场景的单元测试（至少 5 个恶意 payload）

### 新增 Story: **X-2 · 安全加固 — Server 层防护**

**Epic 归属**: Cross-cutting
**Priority**: P0（Demo 站上线前必须完成）
**Estimate**: 1.5 人日

**Acceptance Criteria**:

1. CORS `allow_origins` 从 `["*"]` 改为环境变量 `CORS_ORIGINS`（默认 localhost）
2. 所有 `except Exception` 块统一为 error envelope `{error: {code, message, trace_id}}`
3. `POST /workflow/runs/{run_id}/policy` 使用 Pydantic model 做入口校验
4. 引入 `slowapi` 对 `/workflow/run` 限速 10 req/min/IP
5. SSE `format_sse_event` 内对 blacklist field 做轻量 sanitize
6. 添加安全 Header 中间件（X-Frame-Options / X-Content-Type-Options）
7. `trajectory.py` 改用 `yaml.safe_dump()`
8. 所有修复有对应测试

### 新增 Story: **X-3 · 安全加固 — 前端密钥存储 + 基础设施**

**Epic 归属**: Cross-cutting
**Priority**: P1（Demo 站后可补）
**Estimate**: 0.5 人日

**Acceptance Criteria**:

1. `useSecretsStore` 升级为 AES-GCM 加密（与 `useZerogSecretsStore` 对齐）
2. `API_BASE_URL` 从硬编码改为 `import.meta.env.VITE_API_BASE`
3. `.gitignore` 添加 `.env` / `.env.local` / `.env.*.local`
4. Dockerfile 添加 `USER appuser`（非 root 运行）
5. Docker 基础镜像锁定到补丁版本

### 修改已完成 Story: **5-2 · Sanitizer 模式追补**

**变更类型**: 追补 5 个凭证识别模式
**工作量**: 0.5 人日

**OLD**: 覆盖 email, phone, id_card, bank_card, sk-*, ghp_*, AIza*, JWT, eth_private_key

**NEW**: 追加 AWS Access Key (`AKIA*`)、Slack Token (`xox*`)、GitHub Fine-grained PAT (`github_pat_*`)、Anthropic API Key (`sk-ant-*`)、Bearer Token Header 五种模式 + 对应测试

---

## 6. 实施计划

### 优先级排序

| 顺序 | 任务 | 严重度 | 估时 | Story |
|------|------|--------|------|-------|
| **1** | **替换 `new Function()` 为安全解析器** | **CRITICAL** | **4h** | X-1 |
| 2 | CORS 修复 | CRITICAL | 0.5h | X-2 |
| 3 | Error envelope 统一 | HIGH | 2h | X-2 |
| 4 | 安全 Header 中间件 | MEDIUM | 0.5h | X-2 |
| 5 | `yaml.safe_dump()` | HIGH | 0.5h | X-2 |
| 6 | Sanitizer 5 新模式 | MEDIUM | 2h | 5-2 补 |
| 7 | Policy matrix Pydantic 校验 | MEDIUM | 1h | X-2 |
| 8 | Rate limiting (slowapi) | MEDIUM | 1h | X-2 |
| 9 | SSE payload 轻量 sanitize | MEDIUM | 1h | X-2 |
| 10 | useSecretsStore 加密 | HIGH | 2h | X-3 |
| 11 | API URL 环境变量化 | HIGH | 0.5h | X-3 |
| 12 | Docker / .gitignore 加固 | HIGH | 1h | X-3 |
| 13 | 测试覆盖全部修复 | — | 3h | 各 Story |
| **合计** | | | **~3 人日** | |

### 依赖与排序

- **X-1（CRITICAL）应最先执行**——阻塞 Demo 站安全
- X-2 与 X-1 可并行（后端 vs 前端）
- X-3 可在 X-1/X-2 完成后执行
- 5-2 补丁可随时执行
- 不阻塞 Story 5-4 / 5-5 / Epic 6

### Sprint Status 变更

如本提案通过，需在 `sprint-status.yaml` 中：
1. 新增 `X-1-critical-expression-injection-fix: ready-for-dev`（P0）
2. 新增 `X-2-security-hardening-server: ready-for-dev`（P0）
3. 新增 `X-3-security-hardening-frontend-infra: ready-for-dev`（P1）
4. Story 5-2 保持 `done`（追补为增量 commit，不回退状态）

---

## 7. 交接计划

**变更范围**: Moderate

**执行角色**:
- **Developer agent**: 直接实施所有修复
- 无需 PO / Architect 参与（不涉及 scope 或架构变更）

**成功标准**:
- 零 `new Function()` 调用（grep 验证）
- 所有 `except Exception` 块不再返回 `str(exc)`
- CORS 仅允许显式配置的 origin
- `sanitize_trajectory` 覆盖 14+ 种凭证模式（原 9 + 新 5）
- Policy matrix endpoint 拒绝非法 cell 值
- `/workflow/run` 被限速
- API 密钥加密存储
- Docker 容器非 root 运行
- 新增测试全部通过

---

## 8. 安全项总览表

| # | 问题 | 严重度 | 文件 | 状态 | v2 新增 |
|---|------|--------|------|------|---------|
| C1 | `new Function()` 代码注入（5 处） | **CRITICAL** | loop-executor.ts, branch-executor.ts, transform-executor.ts, validate-executor.ts | 待修复 | **YES** |
| C2 | CORS wildcard + credentials | **CRITICAL** | server.py:219-225 | 待修复 | 升级 |
| H1 | 异常信息泄露 str(exc) | HIGH | server.py 多处 | 待修复 | |
| H2 | API 密钥明文 localStorage | HIGH | useSecretsStore.ts:11-31 | 待修复 | **YES** |
| H3 | HTTP API URL 硬编码 | HIGH | workflow.ts:7, templates.ts:3 | 待修复 | **YES** |
| H4 | Docker 安全（root/版本/gitignore） | HIGH | Dockerfile.api, .gitignore | 待修复 | **YES** |
| H5 | Unsafe yaml.dump() | HIGH | trajectory.py:69 | 待修复 | **YES** |
| M1 | Sanitizer 缺 5 种凭证模式 | MEDIUM | sanitize.py:26-58 | 待修复 | |
| M2 | Policy matrix 无 schema 校验 | MEDIUM | server.py:321-336 | 待修复 | |
| M3 | 无 rate limiting | MEDIUM | server.py 全局 | 待修复 | |
| M4 | SSE payload 未过滤 | MEDIUM | server.py:554-583 | 待修复 | |
| M5 | 安全 Header 缺失 | MEDIUM | server.py | 待修复 | **YES** |
| M6 | Subprocess 参数未校验 | MEDIUM | zerog.py:105-116 | 待修复 | **YES** |
| M7 | Unvalidated Object.assign | MEDIUM | aggregate-executor.ts, workflowStore.ts | 待修复 | **YES** |
| M8 | localStorage 私钥 30min TTL | MEDIUM | useZerogSecretsStore.ts | 缓解 | |
| L1 | 无 Content Security Policy | LOW | index.html | 延期 | **YES** |
| L2 | Last-Event-ID 无边界 | LOW | server.py:560-570 | 可接受 | |
| L3 | 依赖版本范围过宽 | LOW | pyproject.toml | 延期 | **YES** |
| L4 | CI/CD 缺少 permissions 块 | LOW | ci.yml | 延期 | **YES** |
| L5 | 默认 Fallback 到 Testnet | LOW | zerogStorage.ts, bridge/index.ts | 延期 | **YES** |
| L6 | 无身份验证 (MVP by-design) | LOW | server.py | 文档声明 | |

---

## 9. 正面发现（已做好的安全实践）

- SQL 查询全部使用参数化查询（`global_memory.py`）
- YAML 加载全部使用 `yaml.safe_load()`
- Subprocess 使用 `create_subprocess_exec()`（非 shell=True）
- 无 `eval()`、`exec()`、`pickle.loads()` 等危险函数
- 模板 ID 有正则白名单 + 路径遍历检查
- `leakGuard.ts` 拦截 fetch 中的密钥泄露
- 0G 私钥存储使用 AES-GCM 加密
- Sanitizer 已覆盖 9 种常见凭证/PII 模式

---

*本提案由 bmad-correct-course 定时任务自动生成（v2 深度扫描），基于 2026-04-23 三层全栈安全扫描（Python 后端 + React 前端 + 基础设施）。待 Jy 审批后执行。*
