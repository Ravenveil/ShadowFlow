# wow-harness 调研报告

> 调研日期：2026-04-09
> 调研对象：[NatureBlueee/wow-harness](https://github.com/NatureBlueee/wow-harness)
> 备份地址：[Ravenveil/wow-harness-backup](https://github.com/Ravenveil/wow-harness-backup)（私密）
> 目的：评估 wow-harness 的 AI Agent 治理机制，提取 Shadow CLI / AgentGraph 可借鉴的设计

---

## 一、项目概述

wow-harness 是一个面向 Claude Code 的 **AI Agent Session 治理框架**。核心理念：

> CLAUDE.md 指令遵从率 ~20%，PreToolUse hook 机械强制 100%。
> 如果某件事重要，就用 hook 强制执行，而不是用一句话去"希望" AI 遵守。

从私有项目 Towow（通爻）剥离开源，当前完成度中等——hook 机制成熟，skill 层大量占位符未填。

---

## 二、架构分析

### 2.1 目录结构

```
wow-harness/
├── .claude/
│   ├── settings.json        # Hook 注册表（16 hooks，7 stages）
│   ├── rules/               # Path-scoped rules
│   └── skills/              # 13 个 Skill 定义（大量 {{占位符}}）
├── scripts/
│   ├── hooks/               # 14 个 hook 脚本（session lifecycle + tool guards）
│   ├── guard-feedback.py    # PostToolUse 入口 — 上下文路由 + guard 检查
│   ├── deploy-guard.py      # PreToolUse Bash 入口 — 部署安全拦截
│   ├── context_router.py    # 文件路径 → 上下文片段路由表
│   ├── guard_router.py      # 文件路径 → guard 脚本映射
│   ├── context-fragments/   # 17 个上下文片段
│   ├── checks/              # Guard 脚本（check_*.py）
│   └── install/             # 安装器（phase2_auto.py）
├── templates/scaffold/      # 目标项目骨架模板
├── schemas/                 # YAML/JSON schema 定义
└── docs/decisions/          # ADR 决策记录
```

### 2.2 核心机制

#### 机制 A：Hook Lifecycle（16 hooks × 7 stages）

```
SessionStart  →  加载上下文，重置风险状态，注入工具
PreToolUse    →  阻断不安全部署，拦截 review agent，脱敏读操作
PostToolUse   →  按编辑文件路由上下文，检测循环，追踪风险
Stop          →  验证完成候选（transcript × git diff 交叉检查）
SessionEnd    →  反思，分析 traces，持久化进度
```

hook 注册在 `.claude/settings.json`，Claude Code 在对应生命周期阶段自动触发。

#### 机制 B：8-Gate 状态机

每个重要变更必须流过 8 道门禁，偶数门要求独立审查者：

```
G0 问题锁定 → G1 架构设计 → G2 独立审查*
  → G3 计划制定 → G4 审查+锁定*
  → G5 任务拆分 → G6 独立审查*
  → G7 执行+日志 → G8 最终审查*

* = 独立审查者（隔离上下文，只读工具）
```

#### 机制 C：Review Agent 物理隔离（核心亮点）

**两级权限控制：**

| 层级 | 机制 | 适用场景 | 遵从率 |
|------|------|---------|--------|
| Schema 级 | Agent frontmatter 工具白名单 | 自有 agent | 100% |
| Spawn 边界 | PreToolUse hook 拦截 Task 调用 | 第三方插件 agent | ~70%+前置强制 |

**第一级——工具白名单：**

```yaml
# .claude/agents/review-readonly.md
---
tools:
  - Read
  - Glob
  - Grep
  # 不列 Edit/Write/Bash → 物理上不可调用
---
```

agent 连工具定义都看不到，不存在"忍住不用"的问题。

**第二级——Spawn 边界拦截（`review-agent-gatekeeper.py`）：**

```python
# PreToolUse Task hook
# 当 AI 要 spawn review/audit 类 subagent 时：
#   1. 检查 subagent_type 是否匹配 review 模式
#   2. 检查 prompt 是否包含 read-only 指令
#   3. 缺失 → exit 2 硬阻断 spawn
#   4. 通过 → 写 marker 文件，放行

REQUIRED_DIRECTIVES = (
    "MUST NOT call Edit",
    "read-only reviewer",
    "read-only mode",
    "schema-level read-only",
)
```

解决了"第三方插件 agent 改不了 frontmatter"的问题。

---

## 三、对 Shadow CLI / AgentGraph 的借鉴价值

### 3.1 直接可用的设计模式

#### 模式 1：Agent 能力声明式白名单

```
设计原则：Agent 在定义时声明可用能力（tools/permissions），
         runtime 只注入声明过的能力，未声明的物理不可见。

Shadow 映射：AgentGraph 的 Agent Executor 层，
           每个 agent node 应有 capabilities 声明，
           Orchestration 层在 dispatch 时强制过滤。
```

**建议 Shadow 实现：**

```python
# agent 定义
class ReviewAgent(AgentNode):
    capabilities = ["read", "search", "analyze"]
    # 没有 "write", "execute", "deploy"

# runtime 强制
def dispatch(agent, task):
    tools = tool_registry.filter(agent.capabilities)
    # agent 只能看到 filter 后的工具集
```

#### 模式 2：Spawn 边界拦截

```
设计原则：Agent 创建 sub-agent 时，runtime 层校验权限策略。
         子 agent 的权限不能超过父 agent 声明的范围。

Shadow 映射：AgentGraph 的 Planner/Router 在分发任务给子 agent 时，
           检查目标 agent 的 capabilities 是否符合当前任务的安全策略。
```

#### 模式 3：完成验证（Stop Hook）

```
设计原则：AI 声称"完成"时，不信任自我评估，
         用机械检查交叉验证（transcript 有写操作 + git diff 有变更）。

Shadow 映射：AgentGraph 的 Monitor 组件，
           task 标记 complete 时触发 validator，
           检查实际产出 vs 声明产出。
```

### 3.2 可选借鉴（视需求）

| wow-harness 机制 | Shadow 是否需要 | 理由 |
|------------------|----------------|------|
| 8-Gate 状态机 | 可能不需要 | 对多数项目过重，Shadow 可按需设计轻量 gate |
| Context 路由（文件路径→上下文片段） | 有价值 | AgentGraph 的 Router 做 context-aware dispatch |
| 风险追踪（risk-tracker） | 有价值 | 多 agent 协作时追踪累计风险 |
| Trust Token（HMAC 30min 滑动窗口） | 可能不需要 | 除非 Shadow 有跨 session 信任链需求 |

### 3.3 不建议借鉴

- **Skill 模板系统**：大量 `{{占位符}}`，通用性差，Shadow 有自己的 skill/tool 体系
- **安装器（phase2_auto.py）**：绑定 Claude Code 生态，与 Shadow 架构不匹配
- **MANIFEST.yaml 物理清单**：适合静态治理项目，不适合 Shadow 的动态 agent 编排

---

## 四、关键代码参考索引

| 文件 | 用途 | 参考价值 |
|------|------|---------|
| `scripts/hooks/review-agent-gatekeeper.py` | Spawn 边界拦截 review agent | 高——权限隔离实现 |
| `.claude/rules/review-agent-isolation.md` | 审查隔离的完整设计文档 | 高——设计思路 |
| `scripts/guard-feedback.py` | PostToolUse 上下文路由 + guard | 中——context routing |
| `scripts/hooks/stop-evaluator.md` | 完成验证检查清单 | 中——validator 思路 |
| `scripts/context_router.py` | 文件路径 → 上下文片段映射 | 中——动态 context 注入 |
| `.claude/settings.json` | 16 hooks 注册表 | 低——Claude Code 专用格式 |

---

## 五、结论

wow-harness 的核心贡献是一个观察：**prompt 约束不可靠，机械约束才可靠。** 具体到 Agent 权限控制，它提出了两级方案：schema 级白名单 + spawn 边界拦截。

对 Shadow CLI / AgentGraph 而言：
- **直接可用**：Agent 能力声明式白名单、spawn 权限校验、完成验证
- **可选借鉴**：context 路由、风险追踪
- **不需要**：8-Gate 全流程、skill 模板、安装器

建议将"模式 1（能力白名单）"和"模式 2（spawn 边界拦截）"纳入 AgentGraph Execution Layer 的安全设计。
