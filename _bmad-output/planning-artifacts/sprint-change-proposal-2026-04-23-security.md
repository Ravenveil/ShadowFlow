---
name: sprint-change-proposal-security-hardening
title: Sprint Change Proposal — 安全漏洞修复
date: 2026-04-23T04:23:03Z
status: proposed
scope: moderate
trigger: scheduled-task bmad-correct-course "修复漏洞"
affected_epics: [epic-1, epic-5, cross-cutting]
affected_stories: [5-2, 1-3, 1-5]
new_stories_proposed: 2
---

# Sprint Change Proposal — 安全漏洞修复

**提案日期**: 2026-04-23
**触发**: 定时安全扫描（bmad-correct-course 自动触发，参数"修复漏洞"）
**变更范围**: Moderate（需新增 Story + 修改已完成 Story 产出）

---

## 1. 问题摘要

对 ShadowFlow 代码库（`shadowflow/server.py`、`shadowflow/runtime/sanitize.py`、前端密钥存储）进行全面安全扫描后，发现 **10 项安全问题**，其中 2 项 HIGH、6 项 MEDIUM、2 项 LOW。

当前项目处于 Epic 5 in-progress（Story 5-3 review 中），距 hackathon 截止日（2026-05-16）还有 23 天。安全问题虽非阻塞 MVP 功能交付，但其中 **CORS 配置错误**和**异常信息泄露**属于 Demo 站上线前必须修复的项目，**sanitizer 模式缺失**直接影响 S2 合规红线。

---

## 2. 影响分析

### 2.1 Epic 影响

| Epic | 影响 | 说明 |
|------|------|------|
| **Epic 1** (Runtime Hardening) | 追补 | `server.py` 错误处理需统一为标准 error envelope（architecture.md 已有规范但未落地） |
| **Epic 5** (0G Integration) | 追补 | Story 5-2 sanitizer 产出缺少 AWS/Slack/Bearer/github_pat 等常见凭证模式 |
| **Cross-cutting** | 新增 | CORS 配置、rate limiting、policy matrix 输入校验横跨多 epic |

### 2.2 Story 影响

| Story | 状态 | 影响 |
|-------|------|------|
| **5-2** (trajectory sanitize scan) | done | sanitizer 缺少 5+ 种常见凭证模式，需追补 pattern |
| **1-3** (运行时真驳回) | done | policy matrix endpoint `POST /workflow/runs/{run_id}/policy` 接受 `Dict[str, Any]` 无 schema 校验 |
| **1-5** (trajectory export) | done | 所有 `except Exception as exc: raise HTTPException(500, detail=str(exc))` 泄露内部实现 |

### 2.3 Artifact 冲突分析

| Artifact | 冲突 | 说明 |
|----------|------|------|
| **PRD** | 无冲突 | S1-S6 安全需求已声明，本提案是落实而非变更 |
| **Architecture** | 无冲突 | CORS 限制、error envelope、sanitize 规范已在 architecture.md 定义，代码未对齐 |
| **project-context.md** | 无冲突 | §1 0G 红线、§8 Provider 安全位已覆盖 |

---

## 3. 详细发现

### Finding 1: CORS 配置 — `allow_origins=["*"]` + `allow_credentials=True` (HIGH)

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

**风险**: `allow_origins=["*"]` 搭配 `allow_credentials=True` 违反 CORS 安全模型——浏览器会忽略 credentials 设置，但某些旧版浏览器/代理可能放行，允许任意站点携带凭据发起跨域请求。

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

### Finding 2: 异常信息泄露 — `str(exc)` 直接返回客户端 (HIGH)

**文件**: `shadowflow/server.py` 多处（line 275-277, 284-285, 293-295, 334-336, 550-552 等）

**现状**:
```python
except Exception as exc:
    raise HTTPException(status_code=500, detail=str(exc))
```

**风险**: Python 异常消息可能包含文件路径、变量名、SQL 片段、甚至环境变量值。直接返回给前端暴露实现细节。

**修复**: 按 architecture.md 已定义的 error envelope 标准化：
```python
import uuid

except Exception as exc:
    trace_id = str(uuid.uuid4())
    logger.exception("Internal error", extra={"trace_id": trace_id})
    raise HTTPException(
        status_code=500,
        detail={"error": {"code": "INTERNAL_ERROR", "message": "An internal error occurred", "trace_id": trace_id}},
    )
```

### Finding 3: Sanitizer 模式不完整 (MEDIUM)

**文件**: `shadowflow/runtime/sanitize.py:26-58`

**现状**: 覆盖 email, phone, id_card, bank_card, sk-*, ghp_*, AIza*, JWT, 0x 私钥。

**缺失模式**:
| 凭证类型 | 正则 | 影响 |
|----------|------|------|
| AWS Access Key | `AKIA[0-9A-Z]{16}` | 云凭据泄露 |
| Slack Token | `xox[baprs]-[0-9a-zA-Z\-]{10,48}` | 通信凭据泄露 |
| GitHub Fine-grained PAT | `github_pat_[A-Za-z0-9_]{22,255}` | 代码仓库泄露 |
| Anthropic API Key | `sk-ant-[A-Za-z0-9\-]{20,}` | Claude API 密钥 |
| Bearer Token Header | `Bearer\s+[A-Za-z0-9_\-\.]{20,}` | HTTP Auth 头泄露 |

**修复**: 在 `_PATTERNS` 列表追加上述 5 个模式 + 对应的 `_mask_sample` 分支。

### Finding 4: Policy Matrix Endpoint 无 Schema 校验 (MEDIUM)

**文件**: `shadowflow/server.py:321-336`

**现状**:
```python
async def update_run_policy(run_id: str, body: Dict[str, Any]):
    matrix = body.get("matrix")
```

**风险**: 接受任意 JSON 结构；可注入无效 sender/receiver、超大矩阵、非法 cell 值。

**修复**: 创建 Pydantic model 做入口校验：
```python
class PolicyMatrixUpdate(BaseModel):
    matrix: Dict[str, Dict[str, str]]  # sender → receiver → "ok"|"no"|"warn"
    
    @model_validator(mode="after")
    def validate_cells(self): ...
```

### Finding 5: 无 Rate Limiting (MEDIUM)

**文件**: `shadowflow/server.py` 全局

**现状**: 无任何速率限制。`POST /workflow/run` 等高代价操作可被无限调用。

**修复**: 引入 `slowapi`：
```python
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/workflow/run")
@limiter.limit("10/minute")
async def run_workflow(request: Request, body: RuntimeRequest): ...
```

### Finding 6: SSE 事件 Payload 未过滤敏感数据 (MEDIUM)

**文件**: `shadowflow/server.py:554-583`

**风险**: SSE 流直接推送原始事件对象，可能包含中间推理结果中的用户 prompt / 系统 prompt。

**修复**: 在 `format_sse_event` 内对 payload 执行轻量 sanitize（仅检查 blacklist field names，不做全量 regex 以避免性能开销）。

### Finding 7: localStorage 存储私钥 (MEDIUM)

**文件**: `src/core/hooks/useZerogSecretsStore.ts:70-86`

**风险**: localStorage 可被同域任意 JS 访问；XSS 漏洞可窃取加密后的密钥 blob。

**缓解**: 
- 将自动清除时间从 30 分钟缩短至 10 分钟
- 添加 CSP header 限制内联脚本
- 文档中提示用户使用强 passphrase

### Finding 8: JWT Pattern 不完整 (MEDIUM)

**文件**: `shadowflow/runtime/sanitize.py:52-54`

**风险**: 仅匹配标准三段 JWT，遗漏 `Bearer eyJ...` 格式。已纳入 Finding 3 的 Bearer Token 模式。

### Finding 9: Last-Event-ID 无边界检查 (LOW)

**文件**: `shadowflow/server.py:560-570`

**风险**: 客户端可传入极大 seq 值。影响低——`run_event_bus.subscribe` 内部会从有效范围开始。

### Finding 10: 无身份验证 (LOW — By Design)

**说明**: architecture.md 明确 "Demo 站 FastAPI `/workflow/run` 无身份验证(MVP)"。这是有意决策，Phase 2 Sidecar 模式通过 `127.0.0.1` 绑定隔离。无需本 sprint 变更，但须在 README 声明风险。

---

## 4. 推荐路径

**选择: Direct Adjustment（直接调整）**

**理由**:
- 所有修复都是增量改动，不改变架构或 runtime 契约
- 不需要 rollback 任何已完成 Story
- MVP scope 不受影响
- 工作量估计 **2-3 人日**，在 hackathon 截止前预算充足

### 不推荐的方案

- **Rollback**: 不适用——已完成 Story 的核心功能正确，只需追补安全加固
- **MVP Review**: 不适用——安全修复不改变功能 scope

---

## 5. 变更提案

### 新增 Story: **5-6 · 安全加固 — Server 层防护**

**Epic 归属**: Epic 5（0G Ecosystem Integration）或 Cross-cutting
**Priority**: P0（Demo 站上线前必须完成）
**Estimate**: 1 人日

**Acceptance Criteria**:

1. CORS `allow_origins` 从 `["*"]` 改为环境变量 `CORS_ORIGINS`（默认 localhost）
2. 所有 `except Exception` 块统一为 error envelope `{error: {code, message, trace_id}}`，`str(exc)` 不再返回客户端
3. `POST /workflow/runs/{run_id}/policy` 使用 Pydantic model 做入口校验
4. `POST /workflow/runs/{run_id}/reconfigure` 同样使用 Pydantic model
5. 引入 `slowapi` 对 `/workflow/run` 限速 10 req/min/IP
6. SSE `format_sse_event` 内对 blacklist field 做轻量 sanitize
7. 所有修复有对应测试

### 修改已完成 Story: **5-2 · Sanitizer 模式追补**

**变更类型**: 追补 5 个凭证识别模式
**工作量**: 0.5 人日

**OLD (Acceptance Criteria 已满足)**:
- 覆盖 email, phone, id_card, bank_card, sk-*, ghp_*, AIza*, JWT, eth_private_key

**NEW (追加)**:
- 追加 AWS Access Key (`AKIA*`)、Slack Token (`xox*`)、GitHub Fine-grained PAT (`github_pat_*`)、Anthropic API Key (`sk-ant-*`)、Bearer Token Header 五种模式
- 每个新模式有对应的正/反测试用例
- `_mask_sample` 函数覆盖新模式

**Rationale**: S2 红线要求上传前剔除所有已知凭证格式；当前遗漏 5 种高频凭证。

---

## 6. 实施计划

### 优先级排序

| 顺序 | 任务 | 严重度 | 估时 |
|------|------|--------|------|
| 1 | CORS 修复 | HIGH | 0.5h |
| 2 | Error envelope 统一 | HIGH | 2h |
| 3 | Sanitizer 5 新模式 | MEDIUM | 2h |
| 4 | Policy matrix Pydantic 校验 | MEDIUM | 1h |
| 5 | Rate limiting (slowapi) | MEDIUM | 1h |
| 6 | SSE payload 轻量 sanitize | MEDIUM | 1h |
| 7 | 测试覆盖全部修复 | — | 2h |
| **合计** | | | **~1.5 人日** |

### 依赖与排序

- 无外部依赖；所有修复在当前 codebase 内完成
- 可与 Story 5-3（review 中）并行
- 不阻塞 Story 5-4 / 5-5 / Epic 6

### Sprint Status 变更

如本提案通过，需在 `sprint-status.yaml` 中：
1. 在 Epic 5 下新增 `5-6-安全加固-server-层防护: ready-for-dev`
2. Story 5-2 保持 `done`（追补为增量 commit，不回退状态）

---

## 7. 交接计划

**变更范围**: Moderate

**执行角色**:
- **Developer agent**: 直接实施所有 7 项修复
- 无需 PO / Architect 参与（不涉及 scope 或架构变更）

**成功标准**:
- 所有 `except Exception` 块不再返回 `str(exc)`
- CORS 仅允许显式配置的 origin
- `sanitize_trajectory` 覆盖 14+ 种凭证模式（原 9 + 新 5）
- Policy matrix endpoint 拒绝非法 cell 值
- `/workflow/run` 被限速
- 新增测试全部通过

---

## 8. 安全项总览表

| # | 问题 | 严重度 | 文件 | 行 | 状态 |
|---|------|--------|------|----|------|
| 1 | CORS wildcard + credentials | HIGH | server.py | 219-225 | 待修复 |
| 2 | 异常信息泄露 str(exc) | HIGH | server.py | 多处 | 待修复 |
| 3 | Sanitizer 缺 5 种凭证模式 | MEDIUM | sanitize.py | 26-58 | 待修复 |
| 4 | Policy matrix 无 schema 校验 | MEDIUM | server.py | 321-336 | 待修复 |
| 5 | 无 rate limiting | MEDIUM | server.py | 全局 | 待修复 |
| 6 | SSE payload 未过滤 | MEDIUM | server.py | 554-583 | 待修复 |
| 7 | localStorage 私钥 30min TTL | MEDIUM | useZerogSecretsStore.ts | 70-86 | 缓解 |
| 8 | JWT pattern 不完整 | MEDIUM | sanitize.py | 52-54 | 含在 #3 |
| 9 | Last-Event-ID 无边界 | LOW | server.py | 560-570 | 可接受 |
| 10 | 无身份验证 (MVP by-design) | LOW | server.py | 全局 | 文档声明 |

---

*本提案由 bmad-correct-course 定时任务自动生成，基于 2026-04-23 全量安全扫描。待 Jy 审批后执行。*
