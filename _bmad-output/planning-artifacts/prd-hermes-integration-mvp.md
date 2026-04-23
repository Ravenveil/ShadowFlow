---
name: hermes-integration-mvp-prd
title: Hermes Agent 接入 ShadowFlow — MVP PRD
workflowType: prd
status: complete
version: v0.1
completedAt: 2026-04-17T00:00:00Z
project_name: ShadowFlow
user_name: Jy
parentPRD: _bmad-output/planning-artifacts/prd.md
scope: sub-feature
featureName: Hermes Agent Integration MVP
description: Hermes Agent 作为 ShadowFlow 外部 AI 员工接入 MVP
created: 2026-04-17T00:00:00Z
updated: 2026-04-17T00:00:00Z
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
classification:
  projectType: agent_plugin_integration
  projectTypeSecondary: brownfield_subfeature
  domain: multi_agent_orchestration
  complexity: medium
  projectContext: brownfield
inputDocuments:
  - docs/plans/hermes-agent-integration-discussion-v1.md
  - docs/plans/shadowflow-river-memory-protocol-v1.md
  - _bmad-output/brainstorming/brainstorming-session-2026-04-17-hermes-agent.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/project-context.md
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 1
  projectDocs: 5
---

# Product Requirements Document — Hermes Agent 接入 ShadowFlow MVP

**Author:** Jy
**Date:** 2026-04-17
**父 PRD:** `_bmad-output/planning-artifacts/prd.md`（ShadowFlow 主 PRD v0.1）
**范围:** 子特性 PRD（Epic 2 Agent Plugin Contract 的具体落地路径之一）
**状态:** v0.2 Protocol Aligned（2026-04-17 决策：ACP 主 / MCP 辅）

---

## Executive Summary

ShadowFlow 主 PRD 把产品定位为"**能容纳 N 个 agent 框架协作的公司操作系统**"。本 PRD 把这个抽象定位**具象化为第一个可跑的外部 agent 接入案例**：**让 [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) 以独立 Docker 容器的身份，被 ShadowFlow 注册为"AI 员工"，拉入项目群聊，被 Policy Matrix 治理、被 ActivationBandit 调度、与河流记忆双向桥接，且 Hermes 自身代码零改造。**

本 PRD 的目标不是"绑定 Hermes"，而是**用 Hermes 打通一条外部 agent 接入通道**。接入协议以 **ACP（Agent Client Protocol）为主协议**（session 级管理 + 审批流 + 流式事件，与 ShadowFlow run 生命周期天然对应），**MCP 作为 tool 暴露的辅助通道**（轻量单次调用），外加 gateway adapter + agent-card + policy bridge + memory bridge + per-capability bandit arm 六项契约。使此后任何声明兼容 ACP 的外部 agent（Hermes / ShadowSoul / Zed 生态），都能走同一条路接入 ShadowFlow。

### What Makes This Special

业界的多 agent 框架互联通常走两种路径：**全合并**（把所有 agent 塞进同一 runtime）或**完全隔离**（彼此不可见）。本 PRD 走的是第三条路——**契约式浅接**：

1. **零代码改造**：Hermes 不知道 Policy Matrix 存在，它只看到 ACP `session.permissionResult`（或 MCP `tool_result`）。治理完全由 ShadowFlow 侧的 `gateway/hermes.py` 适配层承担。换任何别家 ACP agent，Hermes 一行不改。
2. **两套记忆并存不合并**：Hermes 的 HRR holographic memory 是"工作台"，ShadowFlow 河流记忆是"档案馆"。通过 `drink`（读档）和 `pour`（写档）两条管道桥接，`<shadowflow-context>` fence 做安全边界。避免"用一套替换另一套"的过度工程。
3. **Policy Matrix `default: deny`**：外部 agent 接入不是"开后门"。每次 `tool_use_claims` 都经 Policy 评估，仅 agent-card 白名单放行。这是接入的核心安全位。
4. **Per-capability bandit arm**：Hermes 的每个 capability（research / long_context_reasoning / web_fetch）是独立 bandit arm，与内置员工的同名能力公平竞争。外部 agent 的调度粒度与内置一致。
5. **属地化术语**：ShadowFlow 用 `Envelope / agent-card / drink / pour / settle` 自家语汇描述接入协议，**不直接沿用 Hermes 命名**（如 skill、plugin），避免术语泄漏导致"依赖某家标准"。

**一句话差异化**：其他框架问"怎么让 agent 互相调用"；ShadowFlow 问"**怎么让外部 agent 不改代码就能成为能被治理、被调度、有档案的员工**"。

## Project Classification

| 维度 | 取值 |
|---|---|
| **Project Type** | agent_plugin_integration（Epic 2 Agent Plugin Contract 的 `acp` kind 具体实例） |
| **Secondary Type** | brownfield_subfeature（扩展既有 web_app + blockchain_web3 主产品） |
| **Domain** | multi_agent_orchestration（AI agent 协作运行时） |
| **Complexity** | medium（协议翻译 + 治理桥接 + 记忆桥接三层耦合，但范围明确） |
| **Project Context** | brownfield（基于现有 ShadowFlow 架构：Runtime Contract 7+1、Policy Matrix、ActivationBandit、河流记忆、四视图、SSE 总线） |

**依赖锚点（必读）：**
- 父 PRD：`_bmad-output/planning-artifacts/prd.md` §Agent Plugin Contract (FR42 / Epic 2)
- 架构：`_bmad-output/planning-artifacts/architecture.md`（4 kind: api/cli/mcp/**acp**）
- 项目上下文：`_bmad-output/project-context.md` §9（ACP Client Story 2.3 + Hermes claw SPIKE Story 2.7）
- 记忆协议：`docs/plans/shadowflow-river-memory-protocol-v1.md` §Part III（MemoryProvider ABC + Fence）
- 接入讨论：`docs/plans/hermes-agent-integration-discussion-v1.md`（§3.11 六步 MVP 路径）

---

## Success Criteria

### User Success

**管理员（运维 AI 员工的人）：**
- **一条命令完成接入**：`shadowflow employee add --type=external/hermes --container=hermes-01` 执行 ≤ 30s 内完成容器拉起 + 注册 + 首次健康检查
- **不看文档也能批**：Policy 拦截的审批卡在 Inbox 里 1 分钟内可完成决策（卡片展示 tool 名、参数 diff、agent 说明、allow/deny 按钮）
- **故障不慌**：Hermes 挂机时管理员能在群聊里立即看到"@hermes-01 当前离线"标识，且**不需要**手动干预其他员工

**项目群组成员（被 AI 员工服务的人）：**
- **@ 可响应**：群内 @hermes-01 在 5 秒内看到"正在思考"指示，8 秒内收到首 token
- **无感使用**：外部 agent 的回复与内置员工在 Chat 视觉上无差别（同样的气泡、avatar、trace 链接）
- **可追溯**：任何一条 Hermes 回答都能点进去看到完整 trajectory（drink 读了什么档、pour 提议了什么、Policy 拦了什么）

### Business Success

- **零代码接入案例 ≥ 1**：Hermes 作为首个案例打通，证明"N 个 agent 框架协作"定位可落地（Hackathon / Pitch 必用素材）
- **接入成本基线**：单个 MCP 兼容外部 agent 接入工作量 ≤ 10 人日（MVP 六步基线 ≈ 1.5 周）
- **二次接入下降**：从 Hermes 扩展到第二个 MCP agent（如 Claude Code 自定义 MCP）工作量 ≤ 3 人日（gateway adapter 复用）
- **治理完备性**：MVP 期内发生 ≥ 1 次 Policy 拦截真实案例（证明治理位不是摆设）

### Technical Success

- **MVP 六步全跑通**（`docs/plans/hermes-agent-integration-discussion-v1.md` §3.11）：
  1. docker-compose.yml 加 hermes-01 service
  2. `src/gateway/hermes.py` 适配层
  3. `templates/agent-cards/hermes-default.yaml` 注册
  4. 四视图 `group.members` 支持 `member_type=external`
  5. Policy Matrix `external_agent` 默认规则（deny-by-default + 白名单）
  6. ExternalMemoryBridge 挂到河流记忆（prefetch/pour_proposal 两条管道）

- **E2E 对话闭环 ≥ 5 次**：在测试群聊完成 "envelope in → drink → Hermes 回复 → tool_use_claims → Policy 评估 → pour 提议 → settle" 完整链路
- **三级降级全覆盖**：Hermes 容器挂 / MCP 协议错误 / 记忆桥超时 / Policy 连续拒绝 各有 1 条自动化测试用例
- **契约冻结兼容**：新增的 `Envelope` 类型、`agent_card` schema、`external` member 字段进入 Pydantic SSOT（`shadowflow/runtime/contracts.py`），TS 生成器无 diff

### Measurable Outcomes

| 指标 | 目标 | 测量方式 |
|---|---|---|
| Envelope 到首 token 延迟 | p50 ≤ 3s / p95 ≤ 8s | gateway 埋点 + SSE 事件时间差 |
| gateway 单机吞吐 | 100 envelope/s（单 agent） | 压测脚本（pytest + asyncio） |
| Policy 评估延迟 | p95 ≤ 500ms 缓存命中 / ≤ 2s 冷查 | Policy Matrix 内部 timer |
| Hermes 健康检查间隔 | 60s（超时 3 次判挂） | health_check endpoint |
| 挂机到用户可见 | ≤ 60s | SSE 事件发送时间 |
| agent-card schema 单测覆盖 | ≥ 90% | pytest --cov |
| trajectory sanitize 通过率 | 100% 敏感 key 匹配拦截 | 预置 PII 样本集测试 |

**成功标准链回差异化**：上述所有指标都服务于"零代码改造 + 治理不破"这两条差异化主张——延迟目标保证"@ 可响应"、Policy 延迟保证"不拖会话节奏"、sanitize 保证"BYOK 不泄漏"。

---

## Product Scope

### MVP（Phase 1 — 与主 PRD 共同 2026-05-16 交付节点对齐）

范围严格限定为六步。**任何超出六步的"顺便做一下"都推到 Phase 2**。

1. **docker-compose.yml 片段**：加 `hermes-01` service，stdio 打开，OPENROUTER_API_KEY 通过 env 注入
2. **`src/gateway/hermes.py` 适配层**（最重，~3-5 人日）：
   - MCP stdio 连接与生命周期管理
   - `Envelope ↔ MCP tool_call` 双向翻译
   - `tool_use_claims` 提交 Policy Matrix 流程
   - `memory_write_proposal` 提交 ExternalMemoryBridge 流程
   - 三级降级触发点
3. **`templates/agent-cards/hermes-default.yaml`**：身份 + 能力 + policy_scope + memory_bridge + health_check 五节
4. **`shadowflow/runtime/contracts.py` 扩展**：
   - `Envelope` 类型进入 Pydantic SSOT
   - `GroupMember` 加 `member_type: Literal["human", "internal", "external"]`
   - 跑 `generate_ts_types.py` 同步前端
5. **Policy Matrix `external_agent` 规则层**：
   - `default: deny`
   - 从 agent-card.policy_scope.allow 白名单放行
   - `require_approval` 命中触发 `human_approval` → Inbox 审批卡
6. **`ExternalMemoryBridge` 模块**：
   - `drink`：调 `river.drink(query)` → Write Gate Read 侧过滤 → `<shadowflow-context>` fence → 回 ACP `session.update`（或 MCP `tool_result`，视触发路径）
   - `pour`：Hermes `memory_write_proposal`（ACP 自定义 session message 或 MCP tool_call） → `river.pour(candidate)` → Write Gate 三重过滤 → 回 `{accepted, rejected, deferred}`

**MVP Demo 脚本**：
- Demo A（3 分钟）：管理员敲命令 → Hermes 容器起 → 入群自我介绍 → 成员 @ 问问题 → 看到回复 + trajectory
- Demo B（2 分钟）：Hermes 想 `file.write` → Inbox 弹审批卡 → 批准 → tool_result 回给 Hermes
- Demo C（1 分钟）：docker stop hermes-01 → 群聊立即显示离线 → 其他员工继续工作

### Post-MVP（Phase 2，2026-05 下旬 ~ 06，与主 PRD Phase 2 同步）

- **ACP stdio 延迟真实 spike**：验证群聊节奏下 ACP session 级往返是否足够（若不够，评估 ACP over HTTP/2 或并发 session 优化）
- **第二个 ACP agent 接入**：用 gateway 的 Hermes 实现扩 1 个案例（候选：ShadowSoul Rust binary 的 ACP mode，或 Zed 生态的其它 ACP agent）—— 验证"二次接入 ≤ 3 人日"基线
- **MCP 辅助通道落地**：把 Hermes 的一部分能力（如 `web_fetch`、`research`）通过 MCP tool 单次调用暴露，免走完整 ACP session，对应 Story 2.4 的用户价值
- **trajectory 0G Storage 上传**：把 Hermes 会话轨迹上链（作者署名 CID），复用 Epic 5 的 `5-5 import-by-cid` 路径
- **Hermes skill → ShadowFlow template 手动迁移指南**：1 篇文档，不做自动同步
- **bandit 多样性参数**：针对多外部 agent 场景的探索/利用平衡调优

### Vision（Post Phase 2）

- **多 Hermes 实例编排**：一个项目群里同时有 Hermes-researcher、Hermes-coder、Hermes-reviewer，协作解同一任务
- **外部 agent 市场**：用户可导入第三方发布的 agent-card，一键接入（需要社区标准 + 审计机制）
- **Hermes `on_pre_compress` ↔ 河流 Dam 联动**：如果 spike 证实 Hermes 的压缩钩子对河流记忆压缩有增益，做一次单向触发
- **反向路径**（探索）：ShadowFlow 内置员工作为 ACP server 被其他 host（Zed 等）调用（方向倒置，Phase 3+）

**明确不做（防 Scope 漂移）：**
- ❌ Hermes 代码 fork / 改造（零改造是红线）
- ❌ Hermes HRR 和河流记忆的结构化合并（已决策：不合并）
- ❌ 把 Hermes 的 skill 文件标准引入 ShadowFlow（Policy Matrix + templates 已够）
- ❌ Telegram/Slack/Discord gateway（ShadowFlow 只有自己四视图，不接公共 IM）
- ❌ Hermes 的 terminal backend 多选（Docker Compose 一条线）
- ❌ 登录系统 / 用户 RBAC（继承主 PRD 决策：MVP 无 DB 无登录）

---

## User Journeys

### J1 · 管理员首日接入（Primary Happy Path · 管理员）

**Setup**：Jy 是 ShadowFlow 一人公司的运维。今天他要试一下新来的"外部员工"——一个 Hermes 容器，看看能不能替他做深度研究。

**Opening Scene**：Jy 在终端敲：
```
shadowflow employee add --type=external/hermes --container=hermes-01
```
看到：
```
[1/4] pulling hermes-agent:latest... ok
[2/4] injecting BYOK from .env... ok (OPENROUTER_API_KEY)
[3/4] registering agent_id=hermes-01, agent-card validated
[4/4] health_check passed in 3.2s
✓ hermes-01 已入职。使用 `shadowflow group invite` 拉进项目群。
```

**Rising Action**：Jy 打开 Shadow 的 Inbox，切到 proj-X 群。右上角"+成员"下拉里，外部员工区多了 `hermes-01`。点一下"拉入群聊"。

**Climax**：群聊里自动弹出一条系统消息，内容是 Hermes 的 agent-card 摘要（"我能做 research / long_context_reasoning / web_fetch，默认无 file.write 权限"）。接着 hermes-01 自己发了句"大家好，有研究任务可以 @ 我"——这条消息是 gateway 代 Hermes 发的，因为 Hermes 原生没 on_group_join 钩子。

**Resolution**：Jy 满意。他现在有 3 个内置员工 + 1 个外部员工。三分钟前他甚至不知道外部 agent 能接进来。

**Journey Requirements Revealed**：FR1（employee add CLI）、FR3（agent_id 分配）、FR9（member_type=external）、FR10（入群 agent-card 摘要发公告）、FR29（health_check）

### J2 · 研究员使用场景（Primary Happy Path · 项目群成员）

**Setup**：群里在讨论一份 200 页的供应链审计 PDF。内置的 sql-analyst-01 不擅长长文档，Jy 想 @hermes-01。

**Opening Scene**：Jy 发：`@hermes-01 帮我分析下这份 PDF 的权限控制缺陷` + PDF 附件。

**Rising Action**：
1. gateway 把消息转成 Envelope，source=chat, attachments=[pdf]
2. 触发 Hermes 的 prefetch 钩子 → ExternalMemoryBridge 调 `river.drink(query="供应链审计 权限缺陷")` → 过滤后用 `<shadowflow-context>` 包好回给 Hermes
3. Hermes 看到 PDF + 档案上下文 + 用户问题，走自己 HRR 推理
4. 2.1s 后 Hermes 返回 MCP `shadowflow.reply`，内含回答 + memory_write_proposal=[{type: "settle_candidate", content: "该 PDF 揭示 ACL 3 层伪代码缺陷，应考虑加入项目反模式清单", confidence: 0.82}]

**Climax**：群聊里 Hermes 的回复气泡展开，下方有个"📎 建议沉淀 1 条"标签。Jy 点一下，弹出 sediment 候选卡片，确认"settle"。这条洞见进入河流记忆的 Alluvium 层。

**Resolution**：下次别的员工做类似任务时，`river.drink` 能把这条洞见也涛出来。Hermes 的一次对话变成了项目档案。

**Journey Requirements Revealed**：FR11（@ 触发路由）、FR12（回复渲染无差别）、FR21-25（记忆桥 drink/pour）、FR33（trajectory 记录）

### J3 · 权限冲突场景（Critical Edge · 管理员 + 成员）

**Setup**：Hermes 在分析过程中发现需要在项目 workspace 写一个 `audit-findings.md` 文件才能继续深入。但 agent-card 里 `file.write` 在 require_approval 清单。

**Opening Scene**：Hermes 的 reply 里带上 `tool_use_claims: [{name: "file.write", path: "audit-findings.md", justification: "需落盘中间发现以便跨 turn 引用"}]`

**Rising Action**：
1. gateway/hermes.py 不直接执行，转 PolicyRequest 给 Policy Matrix
2. Policy 匹配到 require_approval，触发 human_approval
3. Inbox 里 Jy 看到一张审批卡：
   - 申请者：hermes-01
   - Tool：file.write
   - 参数 diff：创建新文件 `audit-findings.md`（256 bytes 预估）
   - Hermes 的理由：需落盘中间发现以便跨 turn 引用
   - 按钮：[Allow This Once] [Allow + Whitelist] [Deny]

**Climax**：Jy 点 [Allow This Once]。决策回传 gateway，gateway 执行 file.write，然后把 MCP tool_result {status: "ok"} 回给 Hermes。Hermes 继续推理，它完全不知道中间经历了一次人类审批——它只看到"tool 成功了"。

**Resolution**：Hermes 返回最终答案。trajectory 里记录：`policy_decision=human_approval(Jy, 2026-04-17T...)`，可审计可回放。

**Journey Requirements Revealed**：FR13-17（Policy 拦截 + 审批卡）、FR35（trajectory 可查）

### J4 · 故障降级场景（Critical Edge · 群组成员）

**Setup**：某天 Hermes 容器因为 OOM 被 Docker 杀了。

**Opening Scene**：Jy 在群里问"@hermes-01 昨天那份审计的总结"——发送后 1 秒，消息气泡旁边出现灰色标识"@hermes-01 当前离线（上次在线 2 分钟前）"。

**Rising Action**：
1. gateway health_check 超时 3 次（连续 3 分钟），判定挂机
2. bandit 相关 arm reward -= 0.5
3. SSE 广播 `agent.offline` 事件到所有订阅该项目的前端
4. 群聊 UI 显示离线徽章

**Climax**：内置 sql-analyst-01 自动捡起 Jy 的请求（bandit 选到次优 arm，因为 Hermes arm 刚降权）："昨天的审计总结在河流里有 1 条 settled insight…"——sql-analyst-01 用 `river.drink` 拿到 J2 里 Hermes 沉淀的洞见，做了个基础回答。

**Resolution**：Jy 没被卡住。10 分钟后 Jy 手动 `docker start hermes-01`，health_check 恢复，bandit arm 回升。

**Journey Requirements Revealed**：FR29-32（失败降级全套）、FR18-20（bandit arm）

### E1 · 记忆桥超时（Edge · 群组成员）

**Setup**：0G Storage 后端偶发抖动，`river.drink` 超时 5s。

**Opening Scene**：@hermes-01 被问问题，prefetch 触发，drink 调用 5s 未返回。

**Rising Action**：ExternalMemoryBridge 超时熔断，给 Hermes 回一个空 context + warning 标记 "档案馆不可达"。Hermes 收到提示后降级用自己 HRR 继续回答。

**Climax**：回复气泡顶部有个小黄色角标"⚠ 本次回答未读取项目档案"，点开可以看到原因。

**Resolution**：Hermes 的回答可能稍弱（缺项目上下文），但不会卡住。下次 drink 成功时回答自动恢复质量。

**Journey Requirements Revealed**：FR31（记忆桥超时降级）、FR25（桥可配置）

### E2 · Policy 连续拒绝（Edge · 管理员）

**Setup**：某个任务里 Hermes 连续 5 次要求 `shell.exec`，都被 deny。

**Opening Scene**：第 5 次被拒后，系统提示 Jy：
```
⚠ @hermes-01 的能力清单可能不足
  最近 5 次 shell.exec 请求均被 Policy 拒绝。
  建议：[查看 agent-card] [调整 policy_scope] [忽略]
```

**Rising Action**：Jy 点 [查看 agent-card]，看到 `shell.exec` 不在 allow 清单。

**Climax**：Jy 决定让 Hermes 在 sandboxed shell 里执行（新增 allow 项 `shell.exec.sandboxed`）。保存 agent-card，bandit arm 的 reward 不受这次干预影响。

**Resolution**：下次 Hermes 再请求，Policy 放行。

**Journey Requirements Revealed**：FR17（连续拒绝提示）、FR4（agent-card 可编辑）

### Journey Requirements Summary

| 能力域 | Journeys | 对应 FR |
|---|---|---|
| 身份注册 | J1 | FR1-4 |
| 协议翻译 | J1, J2, J3, J4 | FR5-8 |
| 群聊集成 | J1, J2, J4 | FR9-12 |
| Policy 审批 | J3, E2 | FR13-17 |
| Bandit 调度 | J4 | FR18-20 |
| 记忆桥接 | J2, E1 | FR21-25 |
| 沙箱隔离 | J1 | FR26-28 |
| 失败降级 | J4, E1 | FR29-32 |
| 可观测 | J3 | FR33-35 |

---

## Domain-Specific Requirements（Multi-Agent Orchestration）

### Compliance & Regulatory

- **BYOK 合规**：外部 agent 的 API key 永不落盘，永不进 trajectory，永不上传 0G Storage。按主 PRD §Technical Constraints 的 BYOK 红线延伸。
- **Data Residency**：trajectory 上传 0G Storage 前走 `scripts/clean_activation_training_data.py` 等价扫描流程（与主 PRD S3 红线对齐）
- **Provider 训练隔离（S4 延伸）**：BYOK 注入的 provider 必须是 no-training tier。外部 agent 自带 provider 配置时，agent-card 必须声明 `provider.no_training: true`，否则 Policy `default: deny`
- **审批可追溯**：所有 human_approval 决策写入 trajectory，包含决策者、时间、决策、tool 参数 diff

### Technical Constraints

- **协议层**：**ACP（Agent Client Protocol）stdio 为主协议**（session 级管理：`initialize` / `session.new` / `session.prompt` / `session.update` / `session.requestPermission` / `session.permissionResult` / `session.cancel`）。**MCP 为辅助通道**，仅用于单次 tool 暴露（不走完整 session 的简单调用，如 `web_fetch`）。不引入 WebSocket、gRPC、自定义 wire。MCP/ACP 均以 stdio 为默认传输，HTTP 作 Phase 2 备选。
- **部署层**：外部 agent 强制以独立 Docker Compose service 运行，不接受"同机进程"部署（沙箱隔离硬约束）
- **记忆层**：不合并 Hermes HRR 和河流记忆。桥接仅限 `drink/pour` 两个动词。任何第三种记忆互动方式（如共享 embedding 空间）推到 Phase 3+。
- **契约层**：`Envelope`、`GroupMember.member_type`、`AgentCard` 必须进 `shadowflow/runtime/contracts.py` Pydantic SSOT，按主 PRD 的向后兼容规则演进（新字段必须带默认值）
- **事件层**：新增事件 `agent.online / agent.offline / agent.tool_claim / agent.policy_verdict` 必须注册到 `shadowflow/runtime/event_types.py`
- **前端层**：审批卡组件继承 `BaseNode.tsx`；Inbox 审批列表走既有 SSE 订阅模式

### Integration Requirements

- **与 Epic 2（Agent Plugin Contract）对齐**：本 PRD 是 Epic 2 `acp` kind 的首个具象实例，必须复用 Epic 2 的 `AgentExecutor` ABC 与 `AgentEvent` 归一流（`agent.*` 命名空间）
- **与 Epic 1（Policy Matrix）对齐**：外部 agent 的 Policy 规则走同一 `PolicyMatrixValidator`，但加 `external_agent` 前缀 scope
- **与 Epic 5（0G Storage）对齐**：trajectory 上传/下载复用 Epic 5 的 `indexer.upload/download` 路径，Merkle 验证必跑
- **与河流记忆（`shadowflow-river-memory-protocol-v1.md`）对齐**：`drink/pour` 调用 river 的既有 API，Write Gate 三重过滤按原协议

### Risk Mitigations

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| ACP stdio 延迟超预算 | 中 | 群聊节奏卡 | Sprint 0 Story 2.7 `hermes claw` SPIKE 实测；Phase 2 备 HTTP/2 预案 |
| 外部 agent 尝试 API key 外泄 | 低 | 合规事故 | Write Gate Gate-1 + trajectory sanitize 黑名单 key pattern 双层兜底 |
| Policy 规则配置错误放行 | 中 | 后门 | agent-card compile-time validator + CI 校验禁用 `default: allow` |
| Hermes 容器吃 RAM 超限导致 ShadowFlow 也被波及 | 中 | 主进程被杀 | docker-compose 给 hermes service 设 `mem_limit`，独立 cgroup |
| 二次接入（别家 ACP agent）不如预期复用 | 中 | 成本超基线 | gateway adapter 写"agent-agnostic"（只看 ACP spec wire，不看 hermes-specific），Phase 2 用 ShadowSoul 等做验证 |
| ACP spec 语义未覆盖到某条 PRD 需求（如群聊入群系统消息） | 中 | 适配层需补洞 | gateway 层自建"语义补丁"（如代发 agent-card 摘要），不修 ACP spec 本身 |
| 记忆桥高并发下 fence 泄漏（上下文边界被 LLM 无视） | 低 | 档案污染 | fence 使用 UUID per-turn + Write Gate Read 侧强制校验 |

---

## Innovation & Novel Patterns

### Detected Innovation Areas

1. **零代码改造接入外部 agent**（gateway adapter 模式）
   - Hermes 不需要写一行 ShadowFlow 感知代码。所有治理、记忆、观测都由 ShadowFlow 侧的 gateway 承担
   - 业界同类（LangGraph、AutoGen、CrewAI）通常要求 agent 实现框架 API。本方案反转契约方向
   - **可验证差异**：换成任何声明兼容 ACP 的别家 agent（ShadowSoul、Zed 生态等，无需专为 ShadowFlow 编程），走同一 gateway 即可接入；MCP 兼容 agent 可通过辅助通道单次调用

2. **两套记忆并存 + fence 桥接**
   - Hermes HRR 是"工作台"（高维向量、phase-encoded bind/unbind），河流是"档案馆"（语义压缩 + Write Gate + Sediment）
   - 用 `drink/pour` + `<shadowflow-context>` fence 做浅桥接，避免了"合并两套高维表示"的工程灾难
   - **与业界对比**：Hermes 自己的 MemoryProvider ABC 硬约束"exactly one external"——我们**不替换它的 builtin**，只**在旁边挂一条外部读写管道**

3. **Per-capability bandit arm 粒度**
   - 不把 Hermes 整体当一个 arm（太粗），而是 agent-card.capabilities 每一项独立 arm
   - 内置 sql-analyst-01 的 `sql_validate` arm 与 Hermes 的 `sql_validate` arm（若声明）公平竞争同一能力槽
   - **可验证差异**：换 agent 不改 bandit 架构；可以同一项目里有 3 个不同 agent 的 `research` arm 互相竞争

4. **Policy Matrix 作为接入安全位**
   - `default: deny` + 白名单。外部 agent 的自由度被 agent-card 严格约束
   - 业界 agent 互联通常没有这层（或只有粗粒度 namespace 隔离）
   - **差异化验证**：MVP 期预期 ≥ 1 次真实 Policy 拦截案例；Phase 2 可以开放社区导入 agent-card 正因为有这层

### Market Context & Competitive Landscape

| 对手 | 做法 | 本 PRD 差异化 |
|---|---|---|
| **LangGraph** | 要求 agent 实现 LangChain 接口 | 零接口要求，ACP/MCP 即可 |
| **AutoGen / Microsoft** | ConversableAgent 基类 fork | 不 fork；gateway 纯翻译 |
| **CrewAI** | 统一 Task/Crew 抽象 | 不统一；每家 agent 保留原语义 |
| **Zed + ACP** | 编辑器 host + ACP agent（单 IDE 内 1 个 agent 协作） | 多 agent 群聊（一个群里有多个 ACP agent + 内置员工并行），Policy Matrix 统一治理 |
| **ACP Spec（Zed Industries）** | 协议层开放标准 | 复用 spec；本 PRD 是 ACP 在"多 agent 公司操作系统"场景的具体工程落地 |
| **Hermes 原生** | 一个 agent 自成体系，可独立运行 | 让它变成"被公司雇佣的员工"，不改其独立性 |

### Validation Approach

**MVP 期三个可观测假设：**
1. **假设 1**：ACP stdio 延迟在群聊节奏下够用 → 用 Demo A 测，p95 ≤ 8s（Sprint 0 Story 2.7 SPIKE 先验）
2. **假设 2**：零改造能跑通一次完整 drink/pour/policy/bandit 闭环（含 ACP `session.requestPermission` 审批流）→ J2 + J3 Demo 覆盖
3. **假设 3**：治理位不是摆设 → J3 Demo 必须有一次真实 Policy 拦截 + 审批 + ACP `session.permissionResult` 回流放行

**Phase 2 期验证升级：**
- 把一个非 Hermes 的 ACP agent（ShadowSoul 或 Zed 生态）接入，验证二次接入 ≤ 3 人日（证明 gateway 真正 agent-agnostic）
- MCP 辅助通道（某条 capability 走单次 tool 调用，不启 session）落地

### Risk Mitigation（创新相关）

- **风险**：ACP spec 仍在演进（Zed Industries 主导的协议） → **对冲**：gateway adapter 写死针对当前 ACP 主线 spec，新版本走 adapter 版本化
- **风险**：Hermes 本身开源项目节奏不确定 → **对冲**：pin 到具体 commit，升级前跑回归
- **风险**："零改造"实测出现必须改一行代码的场景 → **对冲**：把该改动隔离到 gateway 侧 monkey-patch，不 fork Hermes
- **风险**：ACP session 粒度与 ShadowFlow run 生命周期对应失败（如 session 太重/太轻） → **对冲**：gateway 层做一次 `session ↔ run ↔ thread` 三元映射文档化，不直接暴露给上层

---

## Agent Plugin Integration Specific Requirements

### Project-Type Overview

本 PRD 属于 **ShadowFlow Epic 2 Agent Plugin Contract** 的 `acp` kind 首个具象实例。Epic 2 定义了四 kind（api / cli / mcp / acp）的 `AgentExecutor` ABC 与 `AgentEvent` 归一流。本 PRD 在该 ABC 基础上实例化 Hermes（作为 acp kind）。

### Technical Architecture Considerations

- **层次**：新增 `src/gateway/hermes.py`（与 `src/gateway/` 既有模块同级；若目录不存在则创建）
- **ABC 继承**：gateway adapter 实现 Epic 2 定义的 `AgentExecutor` ABC 的 `execute` / `subscribe` / `health_check` 方法
- **事件**：所有 Hermes 事件经 gateway 归一到 `agent.*` 命名空间（与内置员工同流），不引入 `hermes.*` 专有事件
- **依赖注入**：gateway 构造注入 `PolicyMatrix`、`ExternalMemoryBridge`、`ActivationBandit`、`EventBus`，便于测试替身

### Protocol Adapter Design

**协议决策（2026-04-17 Jy 拍板）：ACP 为主协议，MCP 为辅助通道。**

ACP 天然覆盖本 PRD 所需：session 级管理（对应 ShadowFlow run）、审批流（对应 approval_gate）、流式事件（对应 SSE）、session resume（对应 checkpoint）。MCP 只用于某些 capability 的单次 tool 调用（不启 session，更轻量），如 Hermes 的 `web_fetch`。

**核心 wire format — ACP 主通道**

入流 ShadowFlow → Hermes（ACP stdio JSON-RPC）：

```
1. ShadowFlow 启动 → gateway 作为 ACP host 发：
   initialize { protocolVersion, capabilities }
   ← Hermes 返回 capabilities

2. 群聊 @hermes-01 触发：
   session.new {
     sessionId: "thread-42",
     mcpServers: [...],                    # MCP 辅助 tool 按需注入
     workspaceRoots: [...]
   }

3. 群内消息转为 prompt：
   session.prompt {
     sessionId: "thread-42",
     prompt: {
       content: [
         { type: "text", text: "@hermes-01 分析 PDF..." },
         { type: "resource", uri: "file://...", text: "<PDF bytes>" },
         { type: "context",                 # ← ShadowFlow 扩展：预填河流记忆
           fence: "shadowflow-context",
           text: "<drink result with UUID fence>" }
       ],
       shadowflow_envelope: {               # ← gateway 扩展字段
         source: chat | agent_dm | inbox | brief_board,
         group_id, thread_id, sender,
         policy_context: { scope: [...] }
       }
     }
   }
```

出流 Hermes → ShadowFlow（ACP stream）：

```
a. 思考流式事件：
   session.update {
     sessionId: "thread-42",
     update: { type: "agent_thought_chunk" | "agent_message_chunk", content }
   }

b. 工具使用请求（Policy 拦截位）：
   session.requestPermission {
     sessionId: "thread-42",
     toolName: "file.write",
     arguments: { path, content },
     justification: "需落盘中间发现以便跨 turn 引用"
   }
   ← gateway 转 PolicyRequest → Policy Matrix → 审批卡 → 返回：
   session.permissionResult {
     sessionId: "thread-42",
     allowed: true | false,
     reason: "approved by user" | "policy denied"
   }

c. 记忆写入提议（ShadowFlow 扩展）：
   session.update {
     update: {
       type: "shadowflow_memory_proposal",    # ← gateway 识别的自定义类型
       content: [{ type, content, confidence }]
     }
   }
   → gateway 转 pour → Write Gate → 下一 turn session.update 回 {accepted, rejected, deferred}

d. Session 结束：
   session.cancel | session.end
   含 usage: { prompt_tokens, completion_tokens, cost_usd }
```

**辅助通道 — MCP tool 单次调用（不启 session）**

对声明为 `single_shot: true` 的 capability（如 `web_fetch`），gateway 走 MCP：

```
mcp://hermes-01/tools/web_fetch
  request: { url, options }
  response: { content, usage }
```

**关键设计：**
- ACP `session.requestPermission` 语义就是"我想做，等你批"（天然匹配 Policy 拦截位），**不需要**本 PRD 自定义 `tool_use_claims` 字段
- ShadowFlow 的自定义扩展（`shadowflow_envelope`、`shadowflow_memory_proposal`、`context` type）**挂在 ACP 标准消息的 payload 里**，不破坏 ACP wire；gateway 负责序列化/反序列化
- `memory_write_proposal` 语义仍是"我建议沉淀"（非"我写入了"），Write Gate 决定真伪
- `usage` 从 ACP session 结束消息或逐 turn 的 metadata 中抽取，驱动 bandit 的成本维度
- MCP 辅助通道与 ACP session 并行存在：同一 Hermes 既是 ACP agent（session 管理），也可暴露 MCP tools（tool 单调用）

### Agent Card Schema（Registry 契约）

**Pydantic 定义位于 `shadowflow/runtime/contracts.py`**（SSOT），TS 自动生成到 `src/types/agent-card.ts`。Schema 必含字段：

```yaml
agent_id: string (unique)
agent_type: "external/hermes" | "external/<other>"
display_name: string
container: string (docker image)
entrypoint: "mcp-stdio" | "mcp-http"
capabilities: [string]            # 驱动 bandit arm 注册
policy_scope:
  default: "deny"                  # 强制 deny（compile-time validator 拒绝 allow）
  allow: [string]                  # 白名单 tool 名
  require_approval: [string]       # 触发 human_approval 的 tool 名
activation_cost: float             # USD/call，bandit 输入
memory_bridge:
  mode: "two_way" | "read_only" | "isolated"
  pour_targets: [string]           # 可写入的 river 地层
  drink_from: [string]             # 可读取的 river 地层
health_check:
  endpoint: string
  interval_sec: int                # 默认 60
provider:                          # 可选，声明外部 agent 用哪个 LLM provider
  name: string
  no_training: bool                # S4 强制
```

**agent-card compile-time validator** 必须拒绝：
- `policy_scope.default != "deny"`
- `memory_bridge.mode = "two_way"` 且无 `pour_targets`
- `provider.no_training = false`（除非显式声明是本地 Ollama）

### Implementation Considerations

- **开发优先级**：docker-compose service（预演环境）→ agent-card schema + validator → gateway adapter 主循环 → Policy 桥 → 记忆桥 → member_type=external → 观测埋点
- **测试策略**：
  - 单测：agent-card schema validator、Envelope ↔ ACP session message 翻译、MCP tool 调用、Write Gate fence 包装
  - 集成：mock Hermes 容器（或用 ACP reference impl）跑完整 session.new/prompt/requestPermission/permissionResult 闭环
  - E2E：真起 Hermes 容器跑 J1-J4 剧本（含 Sprint 0 `hermes claw` SPIKE 产出的实机命令）
- **契约变更纪律**：Envelope / AgentCard 字段变更走主 PRD 的 major version 规则（向后兼容 + 默认值）
- **Windows 开发机注意**：Docker Compose 下 stdio 的 newline 处理（\r\n vs \n）有坑，必须在 gateway 层做归一（主 PRD 已列 0G SDK Windows 风险，此处同类）

---

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**Scope Contract**：严格六步（详见 Product Scope §MVP）。**任何"顺便做一下"都推到 Phase 2**。

- **资源估计**：1.5 人周（主开发 1 人；gateway 3-5 天是最重模块）
- **团队最小配置**：1 Python 后端（主力）+ 0.3 React 前端（审批卡 UI，复用 Inbox 既有框架）+ 0.2 运维（docker-compose 调整）
- **关键依赖**：Epic 2 Story 2.3 ACP Client 必须已落地（提供 AgentExecutor ABC）；本 PRD 是 Story 2.7 Hermes claw SPIKE 的扩展而非替代

**"够用即交付"的判定**：六步跑通 + J1-J4 四个 Journey Demo 可以端到端演示 + 三级降级有自动化测试 = MVP 达成。**不追求**接入效率最优、bandit 完美调参、UI 视觉打磨。

### Resource Requirements

- 1 Python 后端开发（全期投入）
- 0.3 React 前端（Inbox 审批卡组件，约 2-3 天）
- 0.2 运维/DevOps（docker-compose 片段 + CI 扩展，约 1 天）
- 外部依赖：OpenRouter API key（BYOK 测试用，Jy 个人账户）

### MVP Feature Set（Phase 1）

**Core Journey Coverage**：J1、J2、J3、J4、E1、E2（6 条 Journey，三级 Journey 图全覆盖）

**Must-Have Capabilities**：FR1-FR35（全量，构成能力契约）

**Non-Negotiable**：
- agent-card `default: deny` compile-time 校验（无此位就是后门）
- trajectory sanitize 过 API key 黑名单
- 三级降级自动化测试

### Post-MVP Features（Phase 2，2026-05 下旬 ~ 06）

- MCP stdio 延迟 spike → 若 p95 > 8s，升 HTTP/2 stream
- 第二个 MCP agent 接入（Claude Code MCP server 或 AutoGen MCP）验证二次接入成本
- trajectory 0G Storage 上链（复用 Epic 5 路径）
- Hermes skill ↔ ShadowFlow template 手动迁移文档
- bandit 多样性参数（多外部 agent 场景）
- agent-card UI 编辑器（目前只能改 YAML）

### Vision / Phase 3（Expansion）

- 多 Hermes 实例编排（researcher/coder/reviewer 三分角色）
- 外部 agent 市场（社区导入 + 审计流程）
- Hermes `on_pre_compress` ↔ 河流 Dam 联动（需 Phase 2 spike 证实收益）
- 反向路径：ShadowFlow 内置员工作为 MCP server

### Risk Mitigation Strategy

- **技术风险**：ACP stdio 延迟 → Sprint 0 `hermes claw` SPIKE 先验，Phase 2 预案（HTTP/2 或 session 并发优化）
- **市场风险**：ACP spec 演进 → pin 到具体 spec 版本，adapter 版本化；MCP 辅助通道独立 pin
- **资源风险**：gateway 开发超预算 → 砍记忆桥的 Phase 1 范围（退到 read_only 模式），Phase 2 补回 two_way

---

## Functional Requirements（Capability Contract）

> **⚠️ 契约宣告**：下列 FR 是本 MVP 的**能力合同**。UX、架构、Epic 拆分、代码实现**只允许**实现此处列出的能力。任何未列入的能力在最终产品中都**不存在**。对契约的增删改必须走主 PRD 的 major version bump 流程。

### 身份层（Identity）

- **FR1**：管理员 可通过 `shadowflow employee add --type=external/<kind> --container=<image>` CLI 命令注册外部 agent 容器
- **FR2**：管理员 可通过 `shadowflow employee list` 查看所有已注册员工（含外部）的 agent_id、类型、能力清单、健康状态
- **FR3**：系统 为每个外部 agent 分配全局唯一且持久的 `agent_id`，跨群聊复用，不因容器重启而变化
- **FR4**：管理员 可通过编辑 `templates/agent-cards/<id>.yaml` 修改外部 agent 的 capabilities / policy_scope / activation_cost / memory_bridge / health_check 任意字段
- **FR5**：系统 在加载 agent-card 时执行 compile-time 校验，对 `policy_scope.default != "deny"`、`provider.no_training = false`（非本地 provider）、必填字段缺失等违规情形**阻断注册**

### 协议层（Protocol）

- **FR6**：系统 以 **ACP（Agent Client Protocol）stdio 为外部 agent 主通信协议**，支持 `initialize / session.new / session.prompt / session.update / session.requestPermission / session.permissionResult / session.cancel` 全部核心消息
- **FR7**：系统 以 **MCP 为辅助通道**，用于 agent-card 声明 `single_shot: true` 的 capability（单次 tool 调用，不启 ACP session）；ACP 与 MCP **并行共存**，同一外部 agent 可同时承担 ACP session 角色与 MCP tool server 角色
- **FR8**：gateway adapter 双向翻译：ShadowFlow `Envelope` → ACP `session.prompt`（含 `shadowflow_envelope` / `context fence` 自定义扩展字段）；ACP `session.update` / `session.requestPermission` → ShadowFlow 内部事件与 PolicyRequest
- **FR9**：gateway adapter 为每个外部 agent 实例独立维护 ACP session 生命周期（`initialize` 握手 → `session.new` 创建 → 心跳 → 异常重连 → `session.cancel` 关闭）；协议 decode 失败单次不中断，连续 3 次视为容器不可用
- **FR10**：gateway adapter 继承 Epic 2 的 `AgentExecutor` ABC（kind=`acp` 为主、kind=`mcp` 作辅助通道），并归一事件到 `agent.*` 命名空间

### 群聊集成层（Membership & Chat）

- **FR11**：`GroupMember` 模型 支持 `member_type: Literal["human", "internal", "external"]`
- **FR12**：管理员 可通过 `shadowflow group invite --project=<id> <agent_id>` 命令把外部 agent 拉入项目群
- **FR13**：外部 agent 入群时，系统 代其自动发送基于 agent-card 的自我介绍消息到群公告（因 Hermes 等外部 agent 原生无 on_group_join 钩子）
- **FR14**：群成员 @外部 agent 时，系统 将消息翻译为 Envelope 并路由到对应 gateway adapter
- **FR15**：外部 agent 的回复 在 Chat 的视觉呈现（气泡、avatar、trace 链接）与内置员工完全一致，不设视觉差异

### 审批层（Policy）

- **FR16**：外部 agent 通过 ACP `session.requestPermission` 发起的 tool 使用请求 **不被 gateway 直接执行**，统一转成 PolicyRequest 提交 Policy Matrix 评估
- **FR17**：Policy Matrix 对外部 agent 应用 `default: deny` 规则，仅 agent-card.policy_scope.allow 清单内的 tool 被允许直接放行
- **FR18**：agent-card.policy_scope.require_approval 命中的 tool 触发 `human_approval` 流程，审批卡发到项目 Inbox
- **FR19**：审批卡 展示：申请 agent_id、tool 名、参数 diff、agent 提供的 justification（来自 ACP `session.requestPermission.justification`）、[Allow This Once] / [Allow + Whitelist] / [Deny] 三个操作
- **FR20**：用户 在审批卡上做决策后，gateway 把结果通过 ACP `session.permissionResult { allowed, reason }` 回传外部 agent；若是 MCP 辅助通道则以 MCP `tool_result` 回传
- **FR21**：Policy 连续拒绝同一类 tool 达 5 次时，系统 在该项目 Inbox 提示用户"agent 权限可能不足，建议调整 agent-card"，附快捷入口

### 激活层（Activation / Bandit）

- **FR22**：ActivationBandit 按 agent-card.capabilities 中的每一项**独立注册 arm**（非 agent 整体一个 arm）
- **FR23**：bandit reward 输入包含：(a) 用户显式评价（+1/-1）(b) 任务完成度（跑通无 Policy deny）(c) 成本惩罚（按 activation_cost 减权）
- **FR24**：外部 agent arm 与内置员工 arm 在同一能力槽（如 `research`）内公平竞争，bandit 不区分来源
- **FR25**：agent 挂机或 Policy 大量拒绝时，其相关 arm reward 自动降权，bandit 倾向选其他 arm

### 记忆桥接层（Memory Bridge）

- **FR26**：外部 agent 的 prefetch 请求触发时（在 gateway 构造 ACP `session.prompt` 前），系统 调用 `river.drink(query, scope)` 按 agent-card.memory_bridge.drink_from 声明的地层获取上下文
- **FR27**：drink 返回内容经 Write Gate Read 侧过滤后，以 ACP prompt 的 `type: context` 片段传入（附 `fence: shadowflow-context` 与 UUID per-turn 边界标记），防止档案被误当新输入
- **FR28**：外部 agent 通过 ACP `session.update { type: "shadowflow_memory_proposal" }`（gateway 约定的自定义 update 类型）提交记忆写入提议，经 Write Gate 三重过滤（Write/Forget/Read）后进入 sediment 候选池
- **FR29**：系统 把 pour 结果 `{accepted, rejected, deferred}` 在下一轮 `session.prompt` 的 `shadowflow_envelope.memory_feedback` 字段中回馈给外部 agent
- **FR30**：memory_bridge.mode 支持 `two_way`（读写）/ `read_only`（仅读）/ `isolated`（完全不桥）三档配置
- **FR31**：外部 agent 写入的 sediment 候选在 BriefBoard 显示来源为该 agent_id（可审计）

### 沙箱层（Sandbox）

- **FR32**：外部 agent 强制以独立 Docker Compose service 部署，与 ShadowFlow 主进程通过 stdio 通信，不共享文件系统
- **FR33**：外部 agent 的 BYOK 密钥通过 Docker environment variable 从 `.env` 注入，容器停止即从内存消失，永不落盘到 host
- **FR34**：外部 agent 无法直接访问 ShadowFlow 文件系统，所有文件操作必须通过 gateway 暴露的 MCP tool（进而经 Policy 审批）
- **FR35**：docker-compose service 级别设置 `mem_limit` 与独立 cgroup，防止外部 agent OOM 波及主进程

### 失败降级层（Failure）

- **FR36**：gateway 对每个外部 agent 以 `health_check.interval_sec`（默认 60s）间隔做健康检查
- **FR37**：health_check 连续超时 3 次，系统 判定 agent 挂机，触发：(a) 相关 bandit arm reward -= 0.5 (b) SSE 广播 `agent.offline` (c) Chat UI 显示离线徽章
- **FR38**：记忆桥 drink/pour 调用超时 5s，系统 熔断，给外部 agent 返回空上下文 + warning "档案馆不可达"，Chat 回复附降级标记
- **FR39**：外部 agent 失败不得阻塞其他员工的会话；会话级 timeout 独立计时，失败仅影响当前 thread

### 可观测层（Observability）

- **FR40**：所有外部 agent 的 Envelope in / reply out 必须写入 `trajectory.jsonl`，每行含：envelope_id、agent_id、thread_id、policy_decision、tool_calls、memory_ops、usage、reward
- **FR41**：trajectory 上传 0G Storage 前必过 `sanitize.py` 扫描，剔除 API key（正则匹配常见 provider key pattern）、session token、邮箱、手机号等 PII
- **FR42**：用户 可在 Inbox 打开任意 agent 在任意 thread 的完整 trajectory 回放视图（TraceView）
- **FR43**：新增事件 `agent.online / agent.offline / agent.tool_claim / agent.policy_verdict / agent.memory_pour / agent.memory_drink` 注册到 `event_types.py`，前端可订阅并渲染

---

## Non-Functional Requirements

### Performance

- **对话延迟**：envelope 从 gateway 入流到外部 agent 返回首 token — p50 ≤ 3s，p95 ≤ 8s（假设 BYOK 配 OpenRouter 中速 model，本地到国外 API）
- **gateway 吞吐**：单机单 agent 实例 ≥ 100 envelope/s（以 mock LLM 替身测；真 LLM 下限取决于 provider 速率限制）
- **Policy 评估延迟**：p95 ≤ 500ms（agent-card 缓存命中情况）/ p95 ≤ 2s（需查 bandit 历史数据的冷路径）
- **health_check 开销**：≤ 0.5% CPU，≤ 10MB RSS per agent

### Security

- **BYOK 红线**：外部 agent 的 API key 通过 Docker env 注入，**永不**落盘到 host、**永不**进 trajectory、**永不**上传 0G Storage；sanitize.py 必含常见 provider 的 key pattern 黑名单
- **Policy `default: deny`**：agent-card compile-time validator 拒绝 `default != "deny"` 的配置；CI 加一条 lint 规则
- **Fence 强制**：drink 返回必加 `<shadowflow-context>` fence，UUID per-turn；Write Gate Read 侧做 fence 完整性校验
- **沙箱隔离**：外部 agent 以独立 Docker service 运行，无 host fs 共享，mem/cpu 限额
- **No-training 合规（S4 延伸）**：agent-card.provider.no_training 必须 true（除声明本地 provider 如 Ollama）
- **审批审计**：所有 human_approval 决策写 trajectory，含决策者、时间戳、决策、参数 diff；不可修改

### Reliability

- **主进程韧性**：外部 agent 容器挂机不得导致 ShadowFlow 主进程 crash；gateway 必须 catch 所有 stdio/HTTP 异常
- **ACP / MCP 错误恢复**：ACP session message decode 失败或 MCP tool 调用失败，单次吸收不中断会话，连续 3 次升级为容器重启
- **记忆桥超时熔断**：drink/pour 超时 5s → 降级 + 用户可见提示；不静默失败
- **会话隔离**：单个 thread 的外部 agent 失败不影响同群其他 thread

### Integration

- **ACP 兼容性**：实现 ACP stdio 主协议（pin 到具体 spec 版本，adapter 版本化；参考 [Zed Industries agent-client-protocol](https://github.com/zed-industries/agent-client-protocol) + Hermes `acp_adapter/` 源码）
- **MCP 辅助兼容性**：实现 MCP 1.0 stdio 作为 tool 单调用辅助通道；pin spec 独立版本化
- **0G Storage**：trajectory 上传/下载走 Epic 5 既有 `ZgFile` 接口，Merkle 验证必跑
- **Runtime Contract**：`Envelope`、`GroupMember.member_type`、`AgentCard` 必须进 `shadowflow/runtime/contracts.py` Pydantic SSOT；TS 自动生成 + CI 校验无 diff
- **事件总线**：新增事件全部注册到 `event_types.py`，遵循既有 `agent.*` 命名空间规范

### Observability

- **trajectory.jsonl 每行 schema**：`{envelope_id, agent_id, thread_id, ts, policy_decision, tool_calls, memory_ops, usage, reward}`——用于 Phase 2 上链和 bandit 训练
- **SSE 事件**：所有 agent.* 事件前端可订阅并渲染（Chat 离线徽章、Inbox 审批卡、TraceView 时间线）
- **指标**：gateway 吞吐、Policy 评估延迟、health_check 成功率在 Phase 2 接入 Prometheus（MVP 期仅日志）

### Accessibility

- **审批卡 WCAG 2.1 AA**：键盘全可操作（Tab/Shift+Tab 导航 + Enter/Esc 决策）、screen reader 可读（aria-label 覆盖 tool 名/参数/justification）、对比度 ≥ 4.5:1（继承主 PRD A1 约束）
- **离线徽章不仅靠色差**：除颜色外附加图标（🔴/⚫）和文字"离线"标识

---

## Brainstorming Reconciliation（from `brainstorming-session-2026-04-17-hermes-agent.md`）

Brainstorming 产出 78 个 ideas，绝大多数已落到本 PRD 的 FR / Journey / Domain / Innovation 章节。显式交叉参照：

| Brainstorming 来源 | PRD 落地位置 |
|---|---|
| Part II §2.1 Envelope 归一四视图 | FR8、架构决策隐含于 Domain §Technical Constraints |
| Part II §2.2 agent-card 声明订阅 | FR5、FR11-FR14 |
| Part II §2.3 Tool RPC 契约边界 | FR16（sub-agent boundary 推到 Phase 2，见 Scope Post-MVP） |
| Part II §2.5 LLM Provider 接口形状 | 继承主 PRD Provider 层，不在本 PRD 重复 |
| Part II §2.6 Agent 身份 vs Thread 分离 | FR3（agent_id 持久）+ FR14（thread 独立路由） |
| Part III §3.3 八维度 Morphological | 八维度完整映射到 FR1-FR39 的八大能力域 |
| Part III §3.4 agent-card 示例 | Domain §Agent Card Schema |
| Part III §3.5 MCP wire format | Domain §Protocol Adapter Design（**2026-04-17 决策修订：ACP 主 / MCP 辅**，wire format 以 ACP session 消息为主；原讨论里 MCP stdio 方案降级为辅助通道，见本 PRD §Protocol Adapter Design） |
| Part III §3.6 记忆桥接两套并存 | FR26-FR31 + Innovation §2 |
| Part III §3.7 Policy 拦截机制 | FR16-FR21 |
| Part III §3.8 per-capability bandit arm | FR22-FR25 + Innovation §3 |
| Part III §3.9 Docker Compose 沙箱 | FR32-FR35 |
| Part III §3.10 三级降级 | FR36-FR39 |
| Part III §3.11 MVP 六步 | Product Scope §MVP（直接对齐） |
| Part IV 开放问题（3 条） | 分配：#1 协议延迟（已改为 **ACP stdio 延迟**） → Sprint 0 Story 2.7 SPIKE 前置验证；#2 bandit 多样性 → Phase 2；#3 on_pre_compress 联动 → Phase 3 |

**显式未收录的软性 idea**（低优先或与本 PRD 无关）：
- "ShadowFlow 是一个能容纳 N 个 agent 框架的公司操作系统" —— 这是主 PRD Vision 层的定位性表述，已在 Executive Summary 引用，不作为本 PRD 的独立 FR
- "Hermes 的借鉴和接入是两件事" —— 方法论提示，本 PRD 严格限定于"接入"（路径 B），"借鉴"（路径 A 的 5 条落到其他 ShadowFlow 工作中，见 `hermes-agent-integration-discussion-v1.md` §2.8 小结，另行实现）

---

## Document History

- **v0.1** · 2026-04-17 · 首次生成，基于 bmad-create-prd 13 步工作流一次性合成
  - 输入：hermes-agent-integration-discussion-v1、shadowflow-river-memory-protocol-v1、brainstorming-session-2026-04-17-hermes-agent、主 PRD v0.1、architecture.md、project-context.md
  - 输出：13 个 Level-2 章节 + 43 条 FR + 多层 NFR + 6 条 Journey
  - 范围：Epic 2 Agent Plugin Contract `acp` kind 的首个具象实例（Hermes MVP 六步）
- **v0.2** · 2026-04-17 · **Protocol Aligned 修订**（Jy 拍板 ACP 主 / MCP 辅，对齐主 epics AR56/AR53）
  - 修订 Executive Summary / What Makes Special：协议主辅明确
  - 重写 §Protocol Adapter Design：新的 wire format 基于 ACP session message（initialize/session.new/session.prompt/session.update/session.requestPermission/session.permissionResult/session.cancel），ShadowFlow 扩展字段（shadowflow_envelope / context fence / shadowflow_memory_proposal）挂在 ACP payload 里；MCP 降级为辅助通道（`single_shot: true` capability）
  - 改写 FR6-10（协议层）、FR16/FR19/FR20（审批流走 ACP permissionResult）、FR26-29（记忆桥走 ACP prompt/update）
  - 同步修订 §Technical Constraints / §Integration Requirements / §Risk Mitigations / §Validation Approach / §Competitive Landscape
  - 修订 §Post-MVP：ACP stdio 延迟 spike 提前到 Sprint 0 Story 2.7；MCP 辅助通道落地推到 Phase 2
  - Brainstorming reconciliation 加协议决策注记，Part IV 开放问题 #1 重定位
  - **解除就绪报告 CRITICAL-1**（详见 implementation-readiness-report-2026-04-17-hermes.md v1.1）
- **待后续**：Sprint 0 `hermes claw` SPIKE 跑完后，若 ACP 延迟不达标则启动 HTTP/2 备案；Phase 2 数据回填后增补 v0.3
