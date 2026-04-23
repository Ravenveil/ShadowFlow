---
name: sprint-change-proposal-security-v3-status
title: Sprint Change Proposal — 安全漏洞修复状态审计（v3 跟踪报告）
date: 2026-04-23T09:16:38Z
status: proposed
scope: moderate
trigger: scheduled-task bmad-correct-course "修复漏洞"（定时复查）
supersedes: sprint-change-proposal-2026-04-23-security v2 (05:43 UTC)
scan_summary: 0/21 fully fixed since v2 proposal; 2 new MEDIUM findings
---

# Sprint Change Proposal — 安全漏洞修复状态审计（v3 跟踪报告）

**提案日期**: 2026-04-23
**触发**: 定时安全扫描复查（bmad-correct-course 自动触发，参数"修复漏洞"）
**基于**: v2 深度扫描提案（同日 05:43 UTC）
**本版目的**: 验证 v2 提案中 21 项漏洞的当前修复进度，并报告新发现

---

## 1. 执行摘要

v2 安全提案于 2026-04-23 05:43 UTC 提出，识别了 21 项安全问题（2 CRITICAL / 5 HIGH / 8 MEDIUM / 6 LOW）。本次自动复查（09:16 UTC）验证了每一项的当前代码状态：

| 状态 | 数量 | 说明 |
|------|------|------|
| **完全修复** | 1 | M8（localStorage 30min TTL — 原已实现） |
| **大部分修复** | 2 | H4（Docker 安全）、M6（Subprocess 参数） |
| **部分修复** | 3 | H2（API 密钥存储）、M1（Sanitizer 模式）、M2（Policy Matrix 校验） |
| **未修复** | 15 | 包含全部 2 个 CRITICAL |
| **新发现** | 2 | 2 个 MEDIUM（见 §4） |

**结论**: v2 提案发出后 ~3.5 小时内无修复动作启动。**2 个 CRITICAL 级漏洞仍完全开放**，距 hackathon 截止日仅 23 天。建议立即启动 Story X-1（`new Function()` 替换）。

---

## 2. 逐项修复状态

### CRITICAL 级（0/2 修复）

| # | 问题 | 文件 | 状态 | 证据 |
|---|------|------|------|------|
| **C1** | `new Function()` 代码注入（5 处） | loop-executor.ts:359,371 / branch-executor.ts:143 / transform-executor.ts:271,370 / validate-executor.ts:388 | **未修复** | 所有 5 处 `new Function()` 调用原样存在，未引入 `expr-eval` 或等效安全解析器 |
| **C2** | CORS wildcard + credentials | server.py:224-231 | **未修复** | `allow_origins=["*"]` + `allow_credentials=True` 原样存在，仅有中文注释标注需修复 |

### HIGH 级（0/5 完全修复）

| # | 问题 | 状态 | 详情 |
|---|------|------|------|
| **H1** | 异常信息泄露 `str(exc)` | **未修复** | server.py 中 19+ 处 `detail=str(exc)` 直接返回异常字符串 |
| **H2** | API 密钥明文 localStorage | **部分修复** | `useZerogSecretsStore` 已用 AES-GCM（✓），但 `useSecretsStore`（Anthropic/OpenAI/Gemini）仍明文 JSON |
| **H3** | HTTP API URL 硬编码 | **未修复** | `workflow.ts:7` 和 `templates.ts:3` 仍为 `http://localhost:8000` |
| **H4** | Docker 安全 | **大部分修复** | 基础镜像已锁版本（✓），但 `.gitignore` 仍缺 `.env` 条目 |
| **H5** | Unsafe `yaml.dump()` | **未修复** | `trajectory.py:69` 仍为 `yaml.dump()` 而非 `yaml.safe_dump()` |

### MEDIUM 级（1/8 完全修复）

| # | 问题 | 状态 | 详情 |
|---|------|------|------|
| **M1** | Sanitizer 模式不完整 | **部分修复** | 覆盖 9 种模式，仍缺 AWS/Slack/Anthropic/Bearer 4 种 |
| **M2** | Policy Matrix 无 Schema 校验 | **部分修复** | 有 `matrix is None` 检查，但无 Pydantic model 完整校验 |
| **M3** | 无 Rate Limiting | **未修复** | 无 slowapi 或等效中间件 |
| **M4** | SSE payload 未过滤 | **未修复** | 事件直接流转，无 sanitize 调用 |
| **M5** | 安全 Header 缺失 | **未修复** | 无 X-Frame-Options / X-Content-Type-Options 等 |
| **M6** | Subprocess 参数未校验 | **大部分安全** | 使用 `create_subprocess_exec()`（非 shell=True），命令受限于内部方法调用 |
| **M7** | Unvalidated Object.assign | **未修复** | aggregate-executor.ts:267 和 workflowStore.ts:215,278 仍直接 `Object.assign()` |
| **M8** | localStorage 私钥 30min TTL | **已修复 ✓** | `useZerogSecretsStore` 已正确实现 AES-GCM + 30min 自动清除 |

### LOW 级（已延期 — 不在本次跟踪范围）

L1-L6 按 v2 提案维持"延期"或"可接受"状态，不重复扫描。

---

## 3. 优先行动建议

v2 提案的 Story X-1 / X-2 / X-3 定义仍然有效，不需要修改。建议执行顺序：

| 优先级 | 任务 | Story | 估时 | 状态 |
|--------|------|-------|------|------|
| **P0-阻塞** | 替换 `new Function()` → `expr-eval` | X-1 | 4h | **需立即开始** |
| **P0-阻塞** | CORS 修复 → env var | X-2 (part) | 0.5h | **需立即开始** |
| P0 | Error envelope 统一 | X-2 (part) | 2h | 待启动 |
| P0 | yaml.safe_dump() | X-2 (part) | 0.5h | 待启动 |
| P0 | 安全 Header 中间件 | X-2 (part) | 0.5h | 待启动 |
| P1 | Sanitizer 新增 4 模式 | 5-2 追补 | 2h | 待启动 |
| P1 | useSecretsStore 加密 | X-3 (part) | 2h | 待启动 |
| P1 | API URL 环境变量化 | X-3 (part) | 0.5h | 待启动 |
| P1 | .gitignore + Docker 收尾 | X-3 (part) | 0.5h | 待启动 |

---

## 4. 新发现（v3 增量）

本次扫描在新增/修改的代码中发现 2 个新的 MEDIUM 级问题：

### 新发现 N1: Regex Condition 解析可绕过

**严重度**: MEDIUM
**文件**: `shadowflow/runtime/service.py:67-71`

```python
_condition_pattern = re.compile(
    r"([\w_]+)\s*(>=|<=|>|<|==|!=|contains|includes)\s*['\"]?(.+?)['\"]?$",
    re.IGNORECASE,
)
```

**问题**: 正则允许未加引号的值包含特殊字符，贪婪/非贪婪匹配可能导致意外解析。攻击者可构造格式巧妙的 condition 字符串绕过预期限制。

**建议**: 对非数字值强制要求引号包裹，或替换为结构化表达式解析器（与 C1 修复可统一方案）。

### 新发现 N2: Gap Detector 输入深度无限制

**严重度**: MEDIUM
**文件**: `shadowflow/runtime/gap_detector.py:46-66`

```python
def detect_gap(inputs: Dict[str, Any], node_config: Optional[Dict[str, Any]] = None):
    config = node_config or {}
    detector_cfg = config.get("gap_detection") if isinstance(config.get("gap_detection"), dict) else {}
```

**问题**: `inputs` 和 `node_config` 的嵌套深度和大小无限制。恶意构造的深层嵌套字典可能导致 DoS（算法复杂度攻击）。

**建议**: 对嵌套结构添加深度限制（如 max_depth=10），对列表添加大小限制。

---

## 5. 对 sprint-status.yaml 的建议变更

v2 提案建议新增 3 个 Story（X-1/X-2/X-3）。**这些 Story 尚未加入 sprint-status.yaml**。

建议在用户审批 v2 提案后立即添加：
```yaml
# ===== Cross-cutting: Security Hardening =====
X-1-critical-expression-injection-fix: ready-for-dev  # P0
X-2-security-hardening-server: ready-for-dev          # P0
X-3-security-hardening-frontend-infra: ready-for-dev  # P1
```

新发现 N1/N2 可纳入 X-2 的 scope 扩展，无需单独立 Story。

---

## 6. 结论

v2 安全提案（21 项发现 + 3 个新 Story）的分析仍然完全有效。**所有 CRITICAL 和 HIGH 级漏洞均未开始修复**。本 v3 报告作为进度跟踪——确认问题仍然存在，并追加 2 个新的 MEDIUM 级发现。

**下一步**: 等待 Jy 审批 v2 提案 → 将 X-1/X-2/X-3 加入 sprint-status.yaml → Developer agent 按优先级执行修复。

---

*本报告由 bmad-correct-course 定时任务自动生成（v3 状态审计），基于 2026-04-23T09:16:38Z 全栈代码验证。*
