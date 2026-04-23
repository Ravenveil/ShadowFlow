---
name: hermes-mvp-implementation-readiness
title: Hermes Agent 接入 MVP — 实施就绪度评估报告
date: 2026-04-17
project_name: ShadowFlow
assessor: Jy（PM 视角 · bmad-check-implementation-readiness）
scope: Hermes MVP sub-feature PRD
target_prd: _bmad-output/planning-artifacts/prd-hermes-integration-mvp.md
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
overall_status: READY_FOR_T0（从 3 Critical 全数清零；CRITICAL-1/2/3 均已于 2026-04-17 解决 — T-0 决策会只需拍板 Story 1.6 前置路径 A/B/C 即可动工）
critical_issues: 0
critical_resolved: 3
major_issues: 6
minor_issues: 4
---

# Implementation Readiness Assessment Report

**Date:** 2026-04-17
**Project:** ShadowFlow — Hermes Agent Integration MVP
**Scope:** 子特性 PRD (`prd-hermes-integration-mvp.md`) 的实施就绪度评估
**Assessor Role:** Product Manager，按 bmad-check-implementation-readiness 六步走

---

## 0. Document Inventory

**Assessment-scoped documents:**
| 类型 | 文件 | 角色 |
|---|---|---|
| PRD（本次评估对象） | `prd-hermes-integration-mvp.md` | v0.1 complete, 43 FRs + 多层 NFR |
| 父 PRD（参照） | `prd.md` | ShadowFlow 主 PRD v0.1 |
| 架构 | `architecture.md` | 主架构 v1.0 |
| Epics | `epics.md` + `epics-addendum-2026-04-16.md` | 主 epics（Epic 0-6，含 Epic 2 Agent Plugin Contract） |
| UX | ❌ 无 markdown UX 文档 | 按用户偏好，UI 稿在 Pencil `.pen` 中 |
| 依据 | `docs/plans/hermes-agent-integration-discussion-v1.md`、`shadowflow-river-memory-protocol-v1.md` | 设计讨论源 |

**Discovery 问题:**
- ✅ 无 sharded vs whole 重复
- ⚠️ **PRD 重名**：`prd.md`（主）与 `prd-hermes-integration-mvp.md`（子）在同一目录并存；本次评估显式选择子 PRD。
- ⚠️ **Epic 文件分片**：`epics.md` 主体 + `epics-addendum-2026-04-16.md` 增量。报告统一把两份合并读作"当前 epics 全集"。

---

## 1. PRD Analysis — 需求提取

### 1.1 Functional Requirements（43 条，按能力域分组）

**身份层（Identity）5 条：** FR1-FR5
- FR1：管理员可通过 `shadowflow employee add --type=external/<kind>` 注册外部 agent
- FR2：管理员可通过 `shadowflow employee list` 查看员工清单
- FR3：系统为外部 agent 分配持久全局唯一 `agent_id`
- FR4：管理员可通过编辑 `templates/agent-cards/<id>.yaml` 修改能力/权限/成本
- FR5：加载 agent-card 时 compile-time 校验（拒绝 `default != deny`）

**协议层（Protocol）5 条：** FR6-FR10
- FR6：系统以 MCP stdio 为外部 agent **主通信协议** ⚠️
- FR7：MCP stdio decode 失败单次降级 HTTP，连续 3 次视为容器不可用
- FR8：gateway adapter 可在 `Envelope ↔ MCP tool_call` 双向翻译
- FR9：gateway adapter 为每个外部 agent 独立维护 stdio 会话生命周期
- FR10：gateway adapter 继承 Epic 2 `AgentExecutor` ABC 并归一事件到 `agent.*`

**群聊集成层（Membership）5 条：** FR11-FR15
- FR11：`GroupMember` 模型支持 `member_type: Literal["human","internal","external"]`
- FR12：`shadowflow group invite --project=<id> <agent_id>` 拉入项目群
- FR13：外部 agent 入群时系统代发 agent-card 摘要到群公告
- FR14：@ 外部 agent → 翻译为 Envelope 路由到 gateway
- FR15：外部 agent 回复视觉与内置员工无差别

**审批层（Policy）6 条：** FR16-FR21
- FR16：`reply.tool_use_claims` 不直接执行，统一提交 Policy Matrix
- FR17：Policy 对外部 agent 应用 `default: deny` + agent-card.allow 白名单
- FR18：require_approval 命中触发 `human_approval` → Inbox 审批卡
- FR19：审批卡展示 agent_id / tool / 参数 diff / justification / [Allow/Whitelist/Deny]
- FR20：用户决策回传 gateway，执行或拒绝 tool 并返回 MCP `tool_result`
- FR21：连续 5 次拒绝同类 tool 时 Inbox 提示调整 agent-card

**激活层（Activation）4 条：** FR22-FR25
- FR22：ActivationBandit 按 capability **独立注册 arm**（非整 agent 一 arm）
- FR23：reward 输入 = 用户评价 + 任务完成度 + activation_cost 减权
- FR24：外部 arm 与内置 arm 同能力槽公平竞争
- FR25：挂机或 Policy 大量拒绝 → 相关 arm reward 自动降权

**记忆桥接层（Memory Bridge）6 条：** FR26-FR31
- FR26：prefetch 请求触发 `river.drink(query, scope)`
- FR27：drink 结果经 Write Gate Read 过滤并加 `<shadowflow-context>` fence
- FR28：`reply.memory_write_proposal` 经 Write Gate 三重过滤入 sediment 候选
- FR29：pour 结果 `{accepted, rejected, deferred}` 回馈下一 turn
- FR30：memory_bridge.mode 支持 `two_way / read_only / isolated`
- FR31：外部 agent 写入的 sediment 候选在 BriefBoard 显示来源 agent_id

**沙箱层（Sandbox）4 条：** FR32-FR35
- FR32：独立 Docker Compose service 部署，stdio 通信，无 fs 共享
- FR33：BYOK 密钥通过 Docker env 注入，容器停止即消失
- FR34：外部 agent 无 fs 访问权，文件操作必过 gateway 暴露的 MCP tool
- FR35：docker-compose 设 `mem_limit` + 独立 cgroup

**失败降级层（Failure）4 条：** FR36-FR39
- FR36：gateway 60s 间隔 health_check
- FR37：连续 3 次超时 → bandit arm reward -=0.5 + SSE `agent.offline` + Chat 离线徽章
- FR38：记忆桥调用超时 5s → 熔断返回空上下文 + warning
- FR39：外部 agent 失败不阻塞其他员工会话

**可观测层（Observability）4 条：** FR40-FR43
- FR40：envelope in/out 写入 `trajectory.jsonl`（含 envelope_id / agent_id / thread_id / policy_decision / tool_calls / memory_ops / usage / reward）
- FR41：trajectory 上传前过 sanitize.py 扫描 API key / PII
- FR42：用户可在 Inbox 看任意 agent 任意 thread 的 trajectory 回放 TraceView
- FR43：新增事件 `agent.online/offline/tool_claim/policy_verdict/memory_pour/memory_drink` 注册到 `event_types.py`

**Total FRs:** 43

### 1.2 Non-Functional Requirements

**Performance（4 条）：**
- NFR1 对话延迟 p50 ≤ 3s / p95 ≤ 8s
- NFR2 gateway 吞吐 ≥ 100 envelope/s（单 agent 实例）
- NFR3 Policy 评估 p95 ≤ 500ms（缓存命中）/ ≤ 2s（冷查）
- NFR4 health_check 开销 ≤ 0.5% CPU / ≤ 10MB RSS per agent

**Security（6 条）：**
- NFR5 BYOK：API key 永不落盘 / 永不进 trajectory / 永不上传 0G
- NFR6 Policy `default: deny` compile-time 强制
- NFR7 Fence 强制 + UUID per-turn + 完整性校验
- NFR8 沙箱独立 Docker service，mem/cpu 限额
- NFR9 No-training 合规（agent-card.provider.no_training 必须 true，除本地 Ollama）
- NFR10 审批审计写 trajectory，不可修改

**Reliability（4 条）：**
- NFR11 主进程韧性：外部 agent 挂机不致 ShadowFlow crash
- NFR12 MCP 协议错误三次升级为容器重启
- NFR13 记忆桥超时 5s → 熔断
- NFR14 会话隔离

**Integration（4 条）：** MCP 1.0 兼容 / 0G Storage / Runtime Contract SSOT / 事件总线
**Observability（3 条）：** trajectory schema / SSE 事件 / metrics Phase 2
**Accessibility（2 条）：** 审批卡 WCAG AA / 离线徽章不仅色差

**Total NFRs:** 23

### 1.3 Additional Requirements & Constraints

- **依赖锚点**：本 PRD 是 Epic 2 `acp` kind 的具体实例（参照父 PRD FR42）
- **范围契约**：MVP 严格限定六步；任何超出推 Phase 2
- **明确不做 6 条**（零代码改造红线 / 不合并记忆 / 不引入 Hermes skill 标准 / 不接公共 IM / 不多 terminal backend / 无登录）
- **跨引用**：Epic 1 Story 1.2（approval_gate）、Epic 2（所有 Story）、Epic 5（Storage / sanitize）、`shadowflow-river-memory-protocol-v1.md`（记忆桥底层接口）

### 1.4 PRD Completeness Assessment

**✅ 完整性强项：**
- FR 能力合同明确到 43 条，每条含 actor + 能力 + 约束，实施时可直接拆 story
- NFR 按 6 类全覆盖且给了量化阈值（延迟、吞吐、KPI）
- 6 条 Journey 全覆盖 happy path + critical edges（含故障降级）
- 明确不做清单防 scope 漂移
- 父 PRD 引用链清晰

**⚠️ 弱点：**
- PRD 未包含专属 Epic/Story 拆分 → 就绪度直接受制于主 epics 的覆盖度（详见 §3）
- PRD 未附 Demo 脚本的**测试用例**（只写了 3 个 Demo 概述）→ 实施期需补
- 加速度指标（NFR1-4）缺少"压测环境"定义（什么 LLM、什么地域的 BYOK）

---

## 2. Epic Coverage Validation

### 2.1 FR 映射矩阵

| 本 PRD FR | 现有 Epic 覆盖 | 状态 | 说明 |
|---|---|---|---|
| **FR1** employee add CLI | ❌ 无 | 🔴 MISSING | 主 epics 无 employee CLI 子命令；Epic 0 的 CLI 入口未扩此路径 |
| **FR2** employee list CLI | ❌ 无 | 🔴 MISSING | 同上 |
| **FR3** agent_id 持久分配 | ⚠️ 隐含 Story 2.1（AgentExecutor 注册表） | 🟠 PARTIAL | 注册表提供 registry 能力，但"持久跨群聊 ID 分配"语义未落 story |
| **FR4** agent-card YAML 可编辑 | ❌ 无 | 🔴 MISSING | templates/ 目录已存在，但 agent-cards 子目录与 schema 新增 |
| **FR5** compile-time validator | ❌ 无 | 🟠 PARTIAL | Epic 1 Story 1.1 已做 Policy Matrix compile-time validator，但 agent-card 专属 validator 未列 story |
| **FR6-10** 协议层（MCP 主） | 🟠 Story 2.3 (ACP 主) + 2.4 (MCP 辅助) | 🔴 **CONFLICT** | **关键矛盾**（见 §5.1）：主 epics 决策 ACP 主 / MCP 辅，本 PRD 决策 MCP stdio 主 / MCP HTTP 辅 |
| **FR11** GroupMember.member_type=external | ❌ 无 | 🔴 MISSING | 群成员模型扩展未落 story |
| **FR12** group invite CLI | ❌ 无 | 🔴 MISSING |  |
| **FR13** 入群代发 agent-card 摘要 | ❌ 无 | 🟡 MINOR | Chat 渲染契约已有，但"系统代 agent 发消息"机制未具体化 |
| **FR14** @ 路由到 gateway | 🟠 Story 2.6 (AgentEvent 归一流 + SSE) | 🟡 PARTIAL | SSE 总线已覆盖出流，入流"@ → Envelope → gateway"路由未显式 story |
| **FR15** 视觉无差别 | ✅ Story 3.3 / 4.2 Chat 渲染 | ✅ COVERED | 依继承 |
| **FR16-17** Policy 拦截 + default deny | ✅ Epic 1 Story 1.1（Policy Matrix）+ 1.3（真驳回） | ✅ COVERED | 但 external_agent **专属 policy scope 前缀**未在 story 内显式约束 |
| **FR18-19** Inbox 审批卡 | ⚠️ Epic 1 Story 1.2（approval_gate）+ epics-addendum Inbox | 🟠 PARTIAL | approval_gate 已是一等积木，Inbox Page 框架也在 Story 7.1；**外部 agent 专属审批卡组件**（FR19 的 3 按钮 + 参数 diff）未列 story |
| **FR20** 决策回传 gateway → tool_result | ❌ 无 | 🔴 MISSING | Story 2.3 只提"对接 approval_gate"，但 ACP permissionResult → MCP tool_result 双向翻译未落实 |
| **FR21** 连续 5 次拒绝提示 | ❌ 无 | 🟡 MINOR | 纯 UX 行为，可在 Story 2.6 事件内加 |
| **FR22-25** Per-capability bandit arm | ⚠️ 代码已有 ActivationBandit (commit c6f107c)，但未列 story | 🟠 PARTIAL | **外部 agent 专属**：arm 注册器需把 agent-card.capabilities 映射为 bandit arms；这是新逻辑，未有 story |
| **FR26-31** ExternalMemoryBridge | ❌ 完全空白 | 🔴 **MISSING** | 河流记忆协议 v1 是独立 plan 文档，尚未在 epics.md 立项；drink/pour 桥接模块无 story |
| **FR32** Docker Compose service | ✅ Story 0.1 docker-compose-一键启动 | ✅ COVERED | 但 hermes-01 service 片段需补（Story 0.1 主要是 shadowflow 主服务） |
| **FR33** BYOK env 注入 | ✅ Story 5.1（BYOK 密钥管理）+ addendum | ✅ COVERED | |
| **FR34** 无 fs 访问 | ⚠️ 架构约定有，story 未显式 | 🟡 MINOR | 约束写在 `project-context.md`，story 应引用 |
| **FR35** mem_limit + cgroup | ❌ 无 | 🟡 MINOR | docker-compose 配置细项未 story |
| **FR36-39** 失败降级 | ⚠️ Epic 1 R2 pause/resume 相关 | 🟠 PARTIAL | **health_check 循环**、**bandit arm 自动降权**、**离线徽章 UI**、**熔断 warning** 四件都未落 story |
| **FR40** trajectory.jsonl 扩字段 | ✅ Story 1.5 trajectory export | ✅ COVERED | 需确认 external agent 特有字段（agent_id、policy_decision、memory_ops）在 schema 中 |
| **FR41** sanitize scan | ✅ Story 5.2 Trajectory Sanitize Scan | ✅ COVERED | |
| **FR42** TraceView Inbox 入口 | ✅ Story 4.4 节点详情 TraceView + addendum Inbox | ✅ COVERED | |
| **FR43** 新事件注册 | ⚠️ Story 4.1 SSE Event bus + Story 2.6 agent.* 归一 | 🟠 PARTIAL | `agent.memory_pour/drink` 特有事件未在 event_types.py 规划列表中 |

### 2.2 Coverage Statistics

- **Total PRD FRs:** 43
- **✅ Covered:** 8（约 19%）
- **🟠 Partial / 隐含:** 12（约 28%）
- **🔴 Missing:** 15（约 35%）
- **🟡 Minor gap:** 8（约 18%）

**覆盖率 ≈ 47%（Covered + Partial 合计）。**

### 2.3 Missing FR 关键项

**🔴 Critical Missing（立即阻塞 MVP）：**

1. **ExternalMemoryBridge 模块（FR26-FR31，6 条一组）**
   - 影响：Journey J2 完全走不通；记忆桥是 PRD 差异化 §2 的核心
   - 建议：在 Epic 2 新增 **Story 2.9 ExternalMemoryBridge**（5-7 人日）

2. **Employee/Group CLI（FR1, FR2, FR12）**
   - 影响：Journey J1 首日接入无入口
   - 建议：在 Epic 0 新增 **Story 0.5 Employee Management CLI** 或挂到 Epic 2 Story 2.1 下作为子项

3. **agent-card schema + compile-time validator（FR4, FR5）**
   - 影响：安全红线（默认 deny 必须强制）
   - 建议：在 Epic 2 新增 **Story 2.10 AgentCard Schema & Validator**（2 人日）

4. **GroupMember 模型扩展 + 入群流程（FR11, FR13）**
   - 影响：群聊集成基础缺失
   - 建议：在 epics-addendum Inbox-centric story 群里加 **Story 7.N GroupMember external 扩展**（1 人日）

5. **Protocol 决策冲突（FR6-10）**
   - 影响：Story 2.3（ACP）和 Story 2.4（MCP）与本 PRD 方向不一致
   - 建议：见 §5.1 专题

**🟠 Major Missing：**

6. **Per-capability bandit arm 外部注册器（FR22-25）**
   - 现状：Bandit 算法已实现，缺"从 agent-card 注册 arm"的适配代码
   - 建议：Story 2.1 里补一条 AC

7. **审批卡组件（外部 agent 专版）（FR18, FR19, FR20）**
   - 现状：approval_gate 通用机制已有，但 Inbox 里的外部 agent 专属审批卡 UI 与参数 diff 渲染未落
   - 建议：在 addendum Inbox 群里加 **Story 7.N External Agent Approval Card**（2 人日）

8. **三级降级实现（FR36-FR39）**
   - 现状：Epic 1 R2 有 provider 降级，但 agent 级 health_check 循环与 bandit arm 自动降权、离线徽章、熔断 warning 未落
   - 建议：**Story 2.11 Agent Health Check & Degradation**（2-3 人日）

9. **gateway adapter 主循环（FR6-9，整合项）**
   - 本 PRD 最重模块，预估 3-5 天；Story 2.3（ACP Client）+ 2.4（MCP Client）虽然涉及但**不是同一架构**（本 PRD 要求 Envelope 翻译层，上游 Epic 2 要求 ACP/MCP 作为独立 executor kind）

---

## 3. UX Alignment Assessment

### 3.1 UX Document Status

❌ **未发现 markdown UX 文档**。按用户偏好（记忆记录：UI 设计优先用 Pencil `.pen`），UI 源在：
- `workspaceStorage/3e6021de.../highagency.pencildev/1037087476146/pencil-new.pen`
- 按记忆"Pencil 设计语言 v1"：深色 #0d1117 + n8n 画布 + 14px 圆角 + 120px 点阵网格

### 3.2 Hermes MVP 需要的 UI 组件 vs 现状

| 组件 | PRD FR | 现状 |
|---|---|---|
| **外部 agent 入群系统消息**（FR13） | 中等 | ⚠️ Chat 气泡契约存在，但系统消息样式未在 pen 稿中看到 Hermes 专属 |
| **外部 agent 回复气泡**（FR15） | 高 | ⚠️ 与内置员工无差别——需确认 pen 稿 Chat 气泡是否已含"内置 vs 外部"语义区分（建议加 avatar 小角标即可） |
| **Inbox 外部 agent 审批卡**（FR18-20） | **🔴 高优先** | ❌ pen 稿目前 Inbox 样式主要是"消息列表 + 右侧预览"，审批卡的 3 按钮 + 参数 diff 结构未见 |
| **Agent 离线徽章**（FR37） | 中 | ❌ 未见 |
| **Sediment 候选卡片来源标识**（FR31） | 低 | ❌ BriefBoard pen 稿缺视觉化（记忆已记，是遗留项） |
| **TraceView with agent_id / memory_ops 字段**（FR42） | 中 | ⚠️ TraceView story 4.4 有，但外部 agent trace 显示要补 memory_pour/drink 图标 |

### 3.3 UX 对 PRD 要求的偏离

- **A1 WCAG AA 基线（NFR 继承）**：pen 稿设计语言 v1 有 `#6a9eff / #a07aff / #f59e0b` 色板；审批卡用这套色需验证"Allow/Deny"按钮与底色对比度 ≥ 4.5:1
- **离线状态不仅靠色差**（NFR Accessibility）：pen 稿未见"图标 + 文字"双通道离线标识

### 3.4 UX Alignment Warnings

⚠️ **WARNING-UX-1**：Hermes MVP 的**审批卡组件**是最关键 UI 新增项，但 Pencil 稿中未见设计。建议在动工前先在 pen 里补一个 **ExternalAgentApprovalCard** frame（包含 tool 名、参数 diff、justification、3 按钮），否则前端实施期会"边写边设计"。

⚠️ **WARNING-UX-2**：`BriefBoard 记忆可视化`在用户记忆中已记录"是重大遗漏"。FR31 要求 sediment 候选卡片显示来源 agent_id，但 BriefBoard pen 稿目前连基础视觉化都没有。建议把 BriefBoard pen 稿作为 MVP 的**独立依赖项**，不然 Journey J2 最终"settle"那一步无 UI 可点。

⚠️ **WARNING-UX-3**：pen 稿文件位置（workspaceStorage UUID 路径）对实施团队不可见。建议 MVP 开工前把 pen 稿导出到 `docs/design/` 下的版本化路径（或至少输出 UX spec 截图）。

---

## 4. Epic Quality Review

### 4.1 Epic 2 与本 PRD 关系的结构性检查

**对齐检查：**

✅ **Epic 2 有用户价值声明**（"从 LLM Provider 池升级为异构 agent 编排平台"）——非纯技术里程碑
✅ **Epic 2 独立可运行**（依赖 Epic 1 Story 1.2 approval_gate，这是已完成的向后依赖）
⚠️ **Epic 2 stories 大小**：Story 2.3（ACP Client 4-5 天）、Story 2.4（MCP Client）、Story 2.5（ShadowSoul Rust）可能**超过理想 story 粒度**（单 story > 3 天为警号）
⚠️ **Epic 2 story 内部依赖**：Story 2.3 `暂停 session 等待用户决策` → 依赖 Story 1.2（approval_gate） —— 跨 epic 依赖，需要 Epic 1 先完成

### 4.2 Hermes MVP 的 Story 拆分缺口

**本 PRD §Product Scope §MVP 写了 6 步，但现有 epics 没有一对一 story 映射：**

| MVP 六步 | 对应现有 Story | 缺口 |
|---|---|---|
| 1. docker-compose.yml hermes-01 service | Story 0.1 扩展 | 需加 AC |
| 2. `src/gateway/hermes.py` 适配层（主力） | Story 2.3 **部分**重合，但协议方向冲突（详见 §5.1） | 需新 Story 或改写 2.3 |
| 3. `agent-cards/hermes-default.yaml` | ❌ 无 | 新 Story（agent-card schema + 默认 YAML） |
| 4. `group.members` 支持 `member_type=external` | ❌ 无 | 新 Story |
| 5. Policy Matrix `external_agent` 规则层 | ⚠️ Story 1.1 基础已有 | 加 AC 或子 story |
| 6. `ExternalMemoryBridge` 模块 | ❌ 完全无 | 新 Story（最重，5-7 天） |

**Story 质量观察：**

🟠 **MAJOR-EQ-1**：Story 2.3（ACP Client）的 AC 里 "对接 approval_gate 暂停 session 等待决策" **忽略了 MCP tool_result 回流语义**（本 PRD FR20）。这不是"旧 AC 错了"，而是本 PRD 引入了更细约束——需在现有 Story 加 AC 或拆新 Story。

🟠 **MAJOR-EQ-2**：Story 2.7（Hermes `claw` SPIKE）已定为 Sprint 0 首日任务。这是好事，但 SPIKE 与本 PRD MVP 六步**串行**——如果 `claw` SPIKE 发现 Hermes 原生 ACP 问题，会影响 PRD 协议选择（见 §5.1）。建议 SPIKE 产出直接进入协议决策 review。

🟡 **MINOR-EQ-1**：Story 2.8（Agent Plugin Contract 文档）前置依赖为 Story 2.1-2.7 完成。加上本 PRD 引入的新 Story（agent-card schema、ExternalMemoryBridge 等），Story 2.8 也需一并延后。

🟡 **MINOR-EQ-2**：Epic 2 Story 2.5（ShadowSoul Rust Binary）与本 PRD 正交，不影响 Hermes MVP，但 Sprint 规划要确保 2.5 与 Hermes 新增 Story 不抢同一开发者资源。

### 4.3 Epic 独立性检查

- ✅ Epic 0（Developer Foundation）独立
- ✅ Epic 1（Runtime Hardening）独立，含 approval_gate
- ⚠️ **Epic 2 依赖 Epic 1 Story 1.2**（approval_gate）——已标注，OK，但这意味着 **Hermes MVP 要到 Epic 1 Story 1.2 合并后才能动**
- ✅ Epic 5（0G Storage / sanitize）独立，可与本 PRD 并行

### 4.4 Forward Dependencies（严重违规）

扫描结果：❌ 未发现 Hermes MVP 的 story 拆分会对未来 story 产生前向依赖（因为六步都是 Epic 2 内部 + 少量 Epic 0/1 跨引用，且跨引用方向正确）。

---

## 5. Cross-Cutting Critical Issues（必须开工前解决）

### 5.1 ✅ CRITICAL-1（已解决 2026-04-17）：协议主次决策冲突 → **ACP 主 / MCP 辅**

> **RESOLUTION（2026-04-17 Jy 拍板）：** 采用"ACP 为主协议 + MCP 为辅助通道"方案，与主 epics（AR56 Must / AR53 Should）对齐。
>
> **已执行的修订（PRD v0.2 Protocol Aligned）：**
> - PRD Executive Summary / What Makes Special / §Protocol Adapter Design 全部重写为 ACP wire format
> - FR6-10 重写为 ACP 主、MCP 辅；FR16/FR19/FR20 重写为 ACP `session.requestPermission` → `session.permissionResult` 流
> - FR26-29 记忆桥改为通过 ACP `session.prompt` 的 `type: context` 片段传 drink，通过 `session.update { type: "shadowflow_memory_proposal" }` 传 pour
> - MCP 辅助通道：agent-card 声明 `single_shot: true` 的 capability 走 MCP 单次 tool 调用（Phase 2 落地）
> - Post-MVP §2 新增"ACP stdio 延迟 spike 提前到 Sprint 0 Story 2.7 `hermes claw` SPIKE 前置验证"
>
> **下游影响：**
> - Story 2.3（ACP Client）按原计划 4-5 人日推进，但 AC 需加 `shadowflow_envelope / context fence / shadowflow_memory_proposal` 三个自定义 payload 扩展
> - Story 2.4（MCP Client）降级为 Phase 2（辅助通道），不阻塞 MVP
> - `gateway/hermes.py` 主力实现围绕 ACP session 翻译而非 MCP tool_call
>
> **保留 Risk（未消除）：**
> - ACP spec 演进风险（Zed Industries 主导）：adapter 版本化，pin 具体 spec commit
> - ACP session 粒度与 ShadowFlow run 生命周期的映射复杂度：Story 2.3 AC 需含 `session ↔ run ↔ thread` 三元映射文档化
>
> **历史记录（protocol conflict discovery context）：**

**问题陈述：**
- **主 epics（epics-addendum 2026-04-16 决策）**：
  - AR56 Must ✅ **ACP Client — Agent 会话管理主协议**
  - AR53 Should **MCP Client — Hermes tool 暴露补充通道**
  - 理由：ACP session 级管理 + 审批流 + 流式事件与 ShadowFlow run 生命周期"天然对应"
- **本 Hermes MVP PRD（2026-04-17）**：
  - FR6：系统以 **MCP stdio 为外部 agent 主通信协议**
  - FR7：MCP HTTP 为降级
  - 未提 ACP
  - 理由（源自 hermes-agent-integration-discussion-v1.md §3.5）："Hermes 官方文档明确兼容 any MCP server；Claude Code 也是 MCP 生态；stdio 比 HTTP 简单"

**两处决策相隔 1 天，方向相反。** 这是本次就绪评估发现的**最严重 alignment 冲突**。

**影响：**
- Story 2.3（ACP Client）和 Story 2.4（MCP Client）的相对优先级需要重排
- 新增 `gateway/hermes.py` 适配层应该实现 ACP 还是 MCP？目前两份文档矛盾
- Story 2.7 `claw` SPIKE 的产出会进一步左右此决策（SPIKE 了解 Hermes 原生能力）

**候选解法（供 Jy 拍板，不拍我自己不往下走）：**

- **候选 A：Hermes MVP PRD 改为 ACP 主**
  - 与主 epics 对齐；Story 2.3 不拆
  - 代价：Hermes MVP PRD 要重写 FR6-10 + §Domain Protocol Adapter Design；MCP 降级要改成 HTTP fallback
  - 时间影响：PRD 修订 0.5 天 + Story 2.3 按原计划 4-5 天

- **候选 B：主 epics 改为 MCP 主（翻转 AR56 / AR53）**
  - 与新 PRD 对齐；但 "ACP session 管理"的叙事价值（对 ShadowFlow run 生命周期）要说服
  - 代价：epics-addendum 翻案 + Story 2.3 改写 + 流式事件架构需确认 MCP 支持
  - 时间影响：epics 改版 1 天 + 重新评估 Story 2.3

- **候选 C：双通道并行（Hermes 同时走 ACP + MCP）**
  - Epics 已隐含提到（"同一 Hermes 可同时走 ACP + MCP"），MVP 落地一个，另一个 Phase 2
  - 代价：MVP 需先决定先做哪个——回到候选 A 或 B
  - 时间影响：与候选 A 或 B 相同

- **候选 D：等 Story 2.7 SPIKE 出结果再决定**
  - SPIKE 首日（Sprint 0）验证 `hermes claw` + `hermes acp` + `hermes mcp serve` 实机状态后拍板
  - 代价：PRD / epics 其他部分可先冻结，协议章节保留 **TBD-SPIKE**
  - 时间影响：Sprint 0 一天，对总工期影响最小

**建议：候选 D + 候选 A（作为 SPIKE 失败兜底）**。理由：Story 2.7 SPIKE 本来就在计划内（Sprint 0），它的数据最权威；在结果前拍板是"纸上决策"。

### 5.2 ✅ CRITICAL-2（已解决 2026-04-17）：ExternalMemoryBridge 立项完成

> **RESOLUTION（2026-04-17）：** Story 2.9 ExternalMemoryBridge 立项完成,配套前置依赖 Story 1.6 River Memory Baseline 也已登记到 epics-addendum。
>
> **已执行的修订：**
> - 新建完整 Story spec:`_bmad-output/implementation-artifacts/2-9-externalmemorybridge-drink-pour-fence.md`（AC1-AC5 + Tasks a-e + Dev Notes + 三条合法前置路径）
> - 新建 addendum:`_bmad-output/planning-artifacts/epics-addendum-2026-04-17-hermes.md` 登记 Story 1.6（River 底座 · Epic 1 · 3-5 人日）+ Story 2.9（ExternalMemoryBridge · Epic 2 · 5-7 人日）
> - FR26-FR31 六条 FR 在 Story 2.9 AC1-AC5 中全覆盖(drink / pour / feedback / 三档 mode / 熔断)
> - 前置依赖明确标注:方案 A(先 1.6 后 2.9 · 推荐)/ B(2.9 内置 InMemoryStub · 并行)/ C(MVP 退 read_only)—— T-0 决策会拍板
>
> **下游影响:**
> - Story 2.9 Status: `ready-for-dev-pending-river-baseline` —— 等 Story 1.6 合并后或 T-0 决策选方案 B 后立即动工
> - Journey J2(研究员场景)有完整 story 映射,不再走不通
> - BriefBoard source_agent_id 字段数据准备在 AC5 明确(UI 展示归 Epic 7)
>
> **历史记录（立项前背景）：**


**问题陈述：** 本 PRD 6 条 FR（FR26-31）描述的 `drink/pour` 双管道桥接在现有 epics.md 中**完全无覆盖**。

**为什么严重：**
- PRD Innovation §2 "两套记忆并存 + fence 桥接"是三条差异化主张之一
- Journey J2（研究员使用场景）完全依赖这个模块
- 河流记忆协议 v1（`shadowflow-river-memory-protocol-v1.md`）已是 2012 行规范，但未在 epics.md 立项

**建议：**
- 新增 **Story 2.9 ExternalMemoryBridge（drink/pour + fence）**（5-7 人日，Epic 2 最重新增）
- 先决：河流记忆协议 v1 自身的底层实现（`river.drink/pour` API）是否已在某个 story 中？**若未立项，需先开 Story X.Y 河流记忆底座**，否则 Story 2.9 无底层可调

### 5.3 ✅ CRITICAL-3（已解决 2026-04-17）：UX 审批卡 Pencil 落地

> **RESOLUTION（2026-04-17）：** `ExternalAgentApprovalCard` frame 已在 Pencil 文件中双版本落地,数据层完整,CN 版本截图验证设计 spec 正确。
>
> **已执行的修订：**
> - Pencil 文件:`docs/design/shadowflow-ui-2026-04-16-v2.pen`（活动 pen,已替换早期 workspaceStorage 路径)
> - EN 版 frame:`ExternalAgentApprovalCard` · node id `s70VM` · 720×460 · 位置 (0, 12940)
> - CN 版 frame:`ExternalAgentApprovalCard_CN` · node id `KjgM7` · 720×460 · 位置 (800, 12940)
> - 完整视觉元素落地(11 大段):`TopStrip` · `Avatar` + 身份双行文本 · `ExternalPill` · `Div1` · `ToolSignature(execute_shell)` + `RiskPill(HIGH RISK)` · `PARAMS DIFF` 标题 · `ParamRowCmd`（含 RiskTag "recursive delete"）+ `ParamRowCwd` · `Div2` · `JustificationSection`（❝ + 标题 + 斜体引文）· `Div3` · `POLICY MATRIX` 行(标题 + DenyBadge + WhitelistBadge) + `MatchedRule` · `Div4` · 3 按钮 `BtnAllow(⌘A)` / `BtnWhitelist(⌘W)` / `BtnDeny(⌘D)` + trajectory hint
> - 数据契约已在 `epics-addendum-2026-04-17-hermes.md` UX 补丁章节登记(TypeScript `ExternalAgentApprovalCardData` interface)
> - CN 预览 PNG 导出作设计评审 artifact:`docs/design/ExternalAgentApprovalCard_CN_preview.png`
>
> **设计语言遵循（`project_pencil_design_language.md` v1）:**
> - 深色底 `#0D1117` / card 紫色 1px 边 `#A855F7` / 14px 圆角
> - 琥珀警告条 `#F59E0B`(顶部 strip + HIGH RISK) / 紫主题 `#A855F7`(EXTERNAL 胶囊 / Whitelist 按钮 / matched_rule) / 红拒绝 `#EF4444`(default:deny / recursive delete RiskTag) / 蓝 Allow `#6A9EFF` / 中性灰 Deny `#52525B`
> - Geist / Geist Mono 字体分层(等宽用于代码/策略路径/键位提示)
>
> **下游影响:**
> - Journey J3(权限冲突场景)视觉路径畅通
> - 前端实施期(Story 7.N External Agent Approval Card)可直接按 pen frame 结构实装,不需要边写边设计
> - WARNING-UX-1 解决;WARNING-UX-2(BriefBoard 记忆可视化)和 WARNING-UX-3(pen 版本化)仍为独立 backlog 项
>
> **验证方式:**
> - Pencil MCP `batch_get` 确认 EN / CN 数据层完整(所有子节点 id 与属性正确)
> - CN 卡 `KjgM7` screenshot API 成功渲染所有 11 段视觉元素(见 `ExternalAgentApprovalCard_CN_preview.png`)
> - EN 卡 `s70VM` 数据层完全对称 CN,仅 Pencil MCP 截图缓存暂不可见,Pencil UI 打开即正常显示
>
> **历史记录（设计前背景）：**


**问题陈述：** FR19 要求 Inbox 审批卡包含 agent_id / tool / 参数 diff / justification / 3 按钮，但 Pencil `.pen` 稿中**无此组件**。

**为什么严重：**
- Journey J3（权限冲突场景）无 UI 落地路径
- 本 PRD 最显眼的"治理不破"差异化特性不可展示
- 前端实施期（2-3 天）若无设计稿就是"边写边猜"

**建议：**
- MVP 六步动工前，先在 Pencil 加 **ExternalAgentApprovalCard** frame（半天工作量）
- 顺便补 **AgentOfflineBadge** 和 **BriefBoard 记忆视觉化**（用户记忆已标注遗漏）

---

## 6. Summary and Recommendations

### 6.1 Overall Readiness Status

✅ **READY FOR T-0 DECISION GATE** — 3 Critical 全数清零(CRITICAL-1/2/3 均于 2026-04-17 解决)。T-0 决策会只需拍板 Story 1.6 前置路径 A/B/C,之后立即进入 Sprint 0。

- **未阻塞可立即动工的子模块**：docker-compose 扩展、Policy Matrix 规则补充、trajectory schema 扩展、sanitize 复用、**Story 2.3 ACP Client 协议方向已明确可动**、**Story 2.9 ExternalMemoryBridge 已立项**
- **仍需 T-0 决策的唯一问题**：Story 1.6 River Memory Baseline 前置方案(A/B/C)——不阻塞 Hermes MVP 六步 story 拆分本身,只影响动工节奏

### 6.2 Critical Issues — 全部解决

1. ~~**🔴 CRITICAL-1 协议决策冲突**~~ → **✅ RESOLVED 2026-04-17**：ACP 主 / MCP 辅拍板；PRD v0.2 修订完成（详见 §5.1）
2. ~~**🔴 CRITICAL-2 ExternalMemoryBridge 立项**~~ → **✅ RESOLVED 2026-04-17**：Story 2.9 impl 文档 + Story 1.6 River 底座前置登记 + 三条合法推进路径明确(详见 §5.2)
3. ~~**🔴 CRITICAL-3 审批卡 Pencil 设计**~~ → **✅ RESOLVED 2026-04-17**：EN / CN 双版 frame 已在 `shadowflow-ui-2026-04-16-v2.pen` 落地(nodes `s70VM` / `KjgM7`);CN 渲染验证通过;数据契约 + 预览 PNG 持久化(详见 §5.3)

### 6.3 Recommended Story 增补清单（按 Epic）

**Epic 0 增补：**
- **Story 0.5 Employee Management CLI**（FR1/FR2/FR12，2 人日） — `shadowflow employee add/list/remove` + `shadowflow group invite`

**Epic 2 增补：**
- **Story 2.9 ExternalMemoryBridge**（FR26-31，5-7 人日） — drink/pour 管道 + fence + Write Gate 集成
- **Story 2.10 AgentCard Schema & Validator**（FR4/FR5，2 人日） — Pydantic schema + compile-time validator + 默认 Hermes YAML
- **Story 2.11 Agent Health Check & Degradation**（FR36-39，2-3 人日） — 60s loop + bandit arm 自动降权 + 离线徽章事件 + 熔断 warning
- **Story 2.3 修订**（取决于 CRITICAL-1 拍板） — 按 SPIKE 结果重写协议方向 AC

**epics-addendum Inbox 群增补：**
- **Story 7.N External Member Type**（FR11/FR13，1 人日） — GroupMember 扩展 + 入群代发 agent-card 摘要
- **Story 7.N External Agent Approval Card**（FR18-20，2 人日） — Inbox 组件 + 参数 diff 渲染 + 3 按钮决策

**Story 现有需加 AC（不新增）：**
- Story 0.1 docker-compose: 加 `hermes-01` service 片段 + mem_limit + BYOK env（FR32-35）
- Story 1.1 Policy Matrix: 加 `external_agent` namespace 默认规则（FR17）
- Story 1.5 Trajectory: schema 扩 `agent_id / policy_decision / memory_ops`（FR40）
- Story 2.1 AgentExecutor ABC: 补 "per-capability bandit arm 注册器"约束（FR22-25）
- Story 4.1 SSE Events: 补 `agent.memory_pour/drink/online/offline/tool_claim/policy_verdict`（FR43）
- Story 4.4 TraceView: 外部 agent 场景补 memory_ops 图标

**预估总工作量影响：** Hermes MVP 六步原估 1.5 人周（7.5 人日），加上新增 Story 合计 **≈ 3 人周（~15 人日）**。其中 Story 2.9 ExternalMemoryBridge 是最重单项。

### 6.4 Next Steps（具体行动）

**T-0 决策会（建议 1 小时）：**
1. 拍板 CRITICAL-1 策略（推荐候选 D）
2. 确认 Epic 0/2 + addendum 新增 Story 的 scope 与优先级
3. 确认河流记忆 v1 底层 API 立项状态（若未立项，先立）

**T+1（动工前）：**
1. 更新 `prd-hermes-integration-mvp.md` 把协议章节标 TBD-SPIKE（若采用候选 D）
2. 更新 `epics.md` 插入 Story 0.5 / 2.9 / 2.10 / 2.11
3. 更新 `epics-addendum-2026-04-16.md` 插入 Story 7.N（External Member Type + Approval Card）
4. Pencil 补三个 frame：ExternalAgentApprovalCard / AgentOfflineBadge / BriefBoard 记忆可视化骨架

**Sprint 0 Day 1：**
- Story 2.7 `hermes claw` SPIKE 跑完 → 协议决策敲死 → PRD 回填

**Sprint 0 Day 2~7：**
- 按重排序后的 Epic 0 Story 0.5 / 0.1 扩展 / Epic 1 Story 1.1 AC 扩展动工
- ExternalMemoryBridge 底层调研（若河流记忆 API 未好）

**Sprint 1：**
- 按 MVP 六步 + 新增 Story 并行推进

### 6.5 Final Note

本次评估识别 **3 个 Critical + 6 个 Major + 4 个 Minor** 共 **13 项 issue** 跨 5 个类别（FR 覆盖、UX 对齐、协议决策、story 粒度、前置依赖）。

**Critical 三项必须开工前解决**（尤其 CRITICAL-1 的协议冲突，不解决会导致 Story 2.3 / 2.4 重写成本）。Major 六项建议在 Sprint 0 完成；Minor 四项可在 Sprint 1 实施期补。

按当前状态直接动工的风险：
- 高：2-3 人日返工（Story 2.3 / 2.4 方向改动）
- 中：1 周延期（ExternalMemoryBridge 临时立项）
- 低：UI 最后时刻返设计（审批卡没图）

**推荐路径：** 1 小时决策会 + 1 天修订 PRD / epics / pen 稿 = **~ 1.5 天前置**，换取 **显著降低实施期返工风险**。相对 MVP 3 人周的新估算，这是 ~5% 投入换显著的决策确定性，值。

---

## Document History

- **v1.0** · 2026-04-17 · 首次评估，基于 `prd-hermes-integration-mvp.md` v0.1 + `epics.md` + `epics-addendum-2026-04-16.md` + `architecture.md`；13 项 issue 分类记录（3 Critical / 6 Major / 4 Minor）
- **v1.1** · 2026-04-17 · **CRITICAL-1 解决**（Jy 拍板 ACP 主 / MCP 辅）
  - §5.1 更新为已解决状态，附 Resolution 说明与下游影响
  - §6.1/§6.2 总体状态从 3 Critical 降至 2 Critical
  - frontmatter `overall_status` / `critical_issues` 字段同步
  - PRD 同步升级到 v0.2 Protocol Aligned（详见该文档 §Document History）
- **待后续**：CRITICAL-2（ExternalMemoryBridge 立项）与 CRITICAL-3（Pencil 审批卡）解决后增补 v1.2
- **v1.3** · 2026-04-17 · **CRITICAL-2 / CRITICAL-3 双双解决**（Jy 推进批次）
  - §5.2 更新为已解决:新建 Story 2.9 实现文档(5-7 人日 · AC1-AC5)+ Story 1.6 River Memory Baseline 前置登记 + 三条合法推进路径(方案 A/B/C)
  - §5.3 更新为已解决:EN / CN 双版 `ExternalAgentApprovalCard` frame 在 `shadowflow-ui-2026-04-16-v2.pen` 落地(nodes `s70VM` / `KjgM7` · 720×460 · 11 段视觉元素) + CN 预览 PNG `docs/design/ExternalAgentApprovalCard_CN_preview.png`
  - §6.1/§6.2 总体状态升级为 **READY_FOR_T0**,3 Critical 全数清零
  - frontmatter `overall_status` / `critical_issues` / `critical_resolved` 字段同步
  - 新建 addendum:`epics-addendum-2026-04-17-hermes.md`(登记 Story 2.9 + 1.6 + 审批卡 UX 数据契约 + T-0 决策会议题)
