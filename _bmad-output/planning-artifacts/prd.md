---
name: shadowflow-prd
title: ShadowFlow Product Requirements Document
workflowType: prd
status: complete
version: v0.1
completedAt: 2026-04-15T08:45:00Z
project_name: ShadowFlow
user_name: Jy
created: 2026-04-15T07:05:32Z
updated: 2026-04-15T08:45:00Z
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
  projectType: web_app
  projectTypeSecondary: blockchain_web3
  domain: general
  domainCrossover:
    - scientific
    - blockchain_web3
  complexity: high
  projectContext: brownfield
  boundaryModel: phase-layered
  boundaryNotes: |
    Phase 1 (hackathon MVP, deadline 2026-05-16): ShadowFlow ships as a standalone
    Web application — Python FastAPI backend + React/ReactFlow editor + real-time
    dashboard. The Web shell is a demo-driven package, not the long-term positioning.
    Phase 2 (2-3 weeks post-hackathon): ShadowFlow collapses back to pure engine
    role; user-facing entry points move to Shadow CLI / Shadow UI via Tauri Sidecar
    integration (per shadow-cli-shadow-ui-boundary-v1.md and engine-scope-v1.md).
    Phase 3 (2026 Q3+): ShadowFlow team templates become on-chain INFT assets
    (ERC-7857) on 0G Chain.
inputDocuments:
  brief:
    - _bmad-output/planning-artifacts/shadowflow-product-brief.md
  related_planning:
    - _bmad-output/planning-artifacts/shadowflow-integration-roadmap.md
  research_and_design:
    - docs/plans/cli-api-execution/shadowflow-engine-scope-v1.md
    - docs/plans/cli-api-execution/shadowflow-engine-task-list-v1.md
    - docs/plans/cli-api-execution/shadowflow-workflow-assembly-contract-v1.md
    - docs/plans/cli-api-execution/shadowflow-shadow-cli-shadow-ui-boundary-v1.md
    - docs/plans/cli-api-execution/shadowflow-graph-projection-contract-v1.md
    - docs/plans/cli-api-execution/shadowflow-language-strategy-v1.md
    - docs/plans/academic-foundation-and-roadmap-v1.md
    - docs/plans/spontaneous-assembly/summary.md
  project_docs:
    - docs/CORE_CHARTER.md
    - docs/ARCHITECTURE.md
    - docs/RUNTIME_CONTRACT_SPEC.md
    - docs/WORKFLOW_SCHEMA.md
    - docs/CHECKPOINT_STORE_CONTRACT.md
    - docs/WRITEBACK_ADAPTER_CONTRACT.md
documentCounts:
  brief: 1
  related_planning: 1
  research_and_design: 8
  project_docs: 6
projectType: brownfield
baseline:
  briefVersion: v0.2
  briefStatus: approved
  briefDate: 2026-04-15
  hackathonDeadline: 2026-05-16
---

# Product Requirements Document - ShadowFlow

**Author:** Jy
**Date:** 2026-04-15
**Baseline:** ShadowFlow Product Brief v0.2 (approved, 2026-04-15)
**Deadline:** 2026-05-16 (0G Hackathon)

> 本 PRD 将通过 bmad-create-prd 工作流逐步构建。每一步只填充对应章节,完成后在 frontmatter 的 stepsCompleted 数组中追加步骤名。

## Executive Summary

ShadowFlow 让每个人都能可视化地设计自己的 AI 协作团队,并把这个团队铸成链上资产。

它面向"**希望用 AI 干复合任务,但又不想被预设工作流束缚**"的用户 —— 首批是一人公司 / Solopreneur、内容创作者 / 新闻工作室、小型咨询团队、Web3 社区 / DAO。这些用户的共同困境是:现有 AI 工具要么只会对话(ChatGPT、Cherry Studio),要么只懂动作而无角色意志(N8N、LangGraph),要么有角色有流程但必须写代码(AutoGen、CrewAI),要么铸造的是单个 Agent 而非一整个有分工审议的协作团队(AIverse、Ghast)—— 没有任何产品同时满足"角色人格 × 详细工作流 × 可视化设计 × 链上治理"这四个维度。

用户在 ShadowFlow 上完成五件事:**设计**(角色 SOUL + 工具 + LLM)、**立法**(权限矩阵 —— 谁能给谁发消息、谁能驳回谁)、**编排**(stage / lane / 并行 / 审议节点)、**运行**(实时看板观察多 agent 协作与审议驳回)、**传承**(模板铸成链上资产,可自用、分享、交易)。

黑客松 MVP(2026-05-16 交付)以 Web 应用形态演示完整闭环;Phase 2(黑客松后 2-3 周)通过 Tauri Sidecar 合入 Shadow 桌面应用,ShadowFlow 回归"纯引擎"定位,由 Shadow CLI / Shadow UI 承担用户入口;Phase 3(2026 Q3+)开放 **Multi-Mode Marketplace** —— 团队模板默认仅用 0G Storage CID 分享(不上链),当用户发起真实交易时提供**三种交易模式**:**A · 私下 P2P**(不上链,零平台费)/ **B · 平台托管 Escrow**(不上链,平台抽佣)/ **C · 链上 INFT**(铸 ERC-7857,自动化结算 + 二级市场流通)。**核心原则:交易方式多元,链上仅是选项之一;不交易,永不上链。**

### What Makes This Special

**产品层差异化**:ShadowFlow 是"**角色 × 工作流 × 可视化 × 链上**"四维同时满足的唯一产品。对标表明 —— ChatGPT/Cherry 做 1-2 维,N8N/LangGraph 做 1-2 维,AutoGen/CrewAI 做 2-3 维但要写代码,Edict 把制度写死,AIverse 铸的是单 agent。蓝海象限不存在直接竞品。

**抽象层级差**:市面上的"可视化工作流"产品(LangFlow、CrewAI Studio)做的是"**代码可视化**" —— 把写给程序员的节点拖到画布上;ShadowFlow 做的是"**组织形态可视化**" —— 让非开发者直接设计组织的角色、权限、审议、传承逻辑,底层才是编译成可运行 workflow。

**核心技术壁垒(非 UI 皮)**:`Runtime Contract + Writeback Adapter + Checkpoint/Resume + Policy Matrix` 四件套,已在 ShadowFlow Python Runtime Phase 1 代码级交付(RuntimeService 2991 行、WorkflowDefinition 660 行、Checkpoint 204 行、4 Provider Adapter 完整)。引擎宿主无关,既能跑 Web MVP,也能作为 Shadow 桌面 Sidecar,也能被第三方宿主嵌入。

**学术血脉(差异化技术背书)**:ShadowFlow 的核心命题落在 `Neural Module Networks (2016) → Voyager (2023) → WorkTeam (2025) → MoE 动态路由 (2025) → Neural Bandit + LLM (2024-2026)` 八条研究线交集 —— "工作流层的 NMN、agent 级的 MoE 动态路由、加上对话式意图提炼、加上情境老虎机激活学习"。这是工程差异化之外的学术定位。

**三年图景的递进逻辑**:
1. **Solopreneur 个体落地**(Phase 1-2):把业务变成可复制的数字公司制度
2. **团队模板 Multi-Mode Marketplace**(Phase 3):**多元交易方式 + 按需上链**。朋友间分享走 0G Storage CID(永不上链);陌生人交易可选 P2P 私下 / 平台 Escrow / 链上 INFT 三种模式。区别于 AIverse 的单 agent NFT,资产载荷是"有分工、有权限、有审议的协作制度"
3. **Shadow 生态执行层标配**(Phase 2-长期):桌面 AI 工作站因接入 ShadowFlow 从"对话 + 知识索引"升级为"真能完成复合任务"

## Project Classification

| 维度 | 取值 | 说明 |
|------|------|------|
| **主项目类型** | `web_app` | Phase 1 MVP 以浏览器可访问的 React + FastAPI Web 应用形态交付,方便评委现场 5 分钟跑完 demo |
| **次级类型信号** | `blockchain_web3` | 0G Storage(trajectory 归档,MVP 必做)/ 0G Compute(LLM 推理)/ 0G Chain INFT(Phase 3);区别于 AIverse 的团队级链上资产 |
| **领域** | AI agent infrastructure / developer tooling(CSV 归入 `general`,跨 `scientific` + `blockchain_web3` 交叉)| 多智能体工作流编排引擎 + 可视化组织设计器 |
| **复杂度** | `high` | 叠加了:多 agent runtime 复杂度 + 权限矩阵治理 + 链上集成 + brownfield(Shadow 既有体系)+ 硬截止日期(2026-05-16)+ 差异化竞品叙事 |
| **项目上下文** | `brownfield` | ShadowFlow Python Runtime Phase 1 已代码级交付(~6000+ 行);Shadow 桌面端文档体系完整;本 PRD 覆盖的是"在既有 runtime 之上新增黑客松 MVP 功能层 + 定义 Phase 2/3 路径" |
| **边界模型** | `phase-layered` | Phase 1 = 含 Web 壳的完整产品;Phase 2 = 回归纯引擎,用户入口移交 Shadow CLI/UI;Phase 3 = 链上资产层 |

## Success Criteria

### User Success

**首批聚焦 3 个 persona,每个 persona 配独立模板与 aha 时刻:**

#### Persona 1 · Solopreneur(一人公司)🎤 Pitch 首讲
- **角色构成**:8 角色双 Lane —— Lane A(业务)CEO / 内容官 / 设计官 / 客户关系 / 合规官 / 发布运营;Lane B(技术)CEO / 工程师 / 稽查员 / 发布运营;CEO 与 发布运营为两 Lane 共用
- **设计 aha**:≤5 分钟拖出 `Solo Company(一人公司)` 模板,下达综合指令(如"写下周产品周报 + 修登录 bug + 回 3 封用户邮件"),看板上看到 8 个 AI 员工跨 Lane 协作
- **立法 aha(双驳回链)**:
  - Lane A:合规官驳回内容官要发布的推文(Policy Matrix 真生效,触发重写)
  - Lane B:稽查员驳回工程师提交的代码(边界情况测试 fail,触发 retry loop)
- **自动流转 aha**:用户只下一条指令,8 个角色按 stage 自动串行/并行流转,无需手动切换
- **传承 aha**:拿到 0G Storage CID,分享给另一 Solopreneur,对方克隆 + 改制度(例如加"法务顾问"为内容官新增一道审批)

#### Persona 2 · 学者(写论文)⭐
- **设计 aha**:≤5 分钟拖出 `Academic Paper(学术论文)` 模板,输入"想法摘要 + 实验日志",看板上看到大纲→并行(文献 ‖ 绘图)→章节→评审循环完整跑完
- **立法 aha**:Advisor(导师)驳回 Section 初稿并退回 Outline 重新立题(驳回链路穿透 3 层),触发完整 resume + rerun
- **深度 aha**:Refine 循环自动迭代 3 轮后评审意见收敛,PDF 出稿
- **传承 aha**:CID 分享给同领域学者,对方克隆后加一个"同行评议员",改为双盲评审
- **设计参考**:Google PaperOrchestra(arXiv:2604.05018, 2026-04)—— 5 专业智能体顺序协作 + 并行 + 评审循环,胜率领先基线 50-68%

#### Persona 3 · 内容工作者 / 新闻工作室
- **设计 aha**:≤5 分钟拖出 `Newsroom(新闻编辑部)` 模板,下达"写一篇关于 [时事] 的报道",看板显示记者→编辑→主编的流转
- **立法 aha**:主编真的驳回记者初稿,触发重写
- **改制度 aha**:≤3 分钟现场新增"事实核查员"角色、修改权限矩阵、重跑,流程正确纳入新角色(**Pitch Demo 第 2:30~3:30 的高光节点**)

#### 跨 Persona 共通指标
- Demo 站 funnel "落地页 → 首次运行完成" 转化 ≥ **70%**
- 任一 MVP 模板的 demo run **至少触发 1 次真实审议驳回**(非 mock)
- CID 克隆闭环端到端可用,克隆后首次运行成功率 **100%**
- 现场改制度(加角色 + 改矩阵 + 重跑)≤ **3 分钟**

### Business Success

| 时间点 | 指标 | 目标 |
|--------|------|------|
| **2026-05-16**(0G Hackathon 提交) | 赛事合规 | X 帖 + 提交链接按时发布;规则 100% 合规 |
| 2026-05-16 | Demo 完整性 | 端到端闭环(设计→运行→0G 归档)≤ **8 分钟** 跑完 |
| 2026-05-16 | 种子模板 | **5 个非 Blank 模板 + 1 个 Blank**(共 6 个)全部可运行 |
| 2026-05-16 | 0G 链上证据 | **≥ 1 条** 真实 trajectory 的 0G Storage CID 可被评委验证访问 |
| 2026-05-16 | 评委辨识度 | 访谈中 **≥ 3/5** 评委能主动说出 ShadowFlow vs N8N/Cherry/AutoGen/AIverse 的本质区别 |
| 2026-05-16 | Persona 覆盖 | 3 个首批 persona(Solopreneur / 学者 / 内容工作者)各有 1 个专属模板可演示 |
| **2026-06-30**(Phase 2 结束) | 桌面集成 | Shadow 桌面版集成 ShadowFlow Sidecar,Windows/macOS 双平台可启动 |
| 2026-06-30 | 外部测试 | **≥ 10 个** 外部测试用户完成至少 1 次完整 run |
| **2026-09-30**(Phase 3 启动信号) | **总交易量(任一模式)** | ≥ **50 笔** 实际交易,覆盖三种模式(P2P / Escrow / On-chain INFT 任一)。分享 + 克隆走 0G Storage CID,不计入此指标 |
| 2026-09-30 | **off-chain 交易验证** | **≥ 30 笔** P2P + Escrow 交易(验证多元交易模式可行) |
| 2026-09-30 | **on-chain 交易验证** | **≥ 1 笔** 真实发生的 on-chain INFT 交易(证明合约可用,不强求数量) |
| 2026-09-30 | ERC-7857 合约 | 在 0G Chain 主网部署,**按需铸造**(用户选择 C 模式时触发);加密元数据保护 prompt 方案已实现 |

### Technical Success

**Runtime 契约与工程红线(本 PRD 强制可验证):**

1. **契约稳定性**:`task / run / step / artifact / checkpoint / memory_event / handoff` 七个 runtime 对象字段级 schema 冻结,不再破坏性变更
2. **CLI / API 同构**:同一份 workflow YAML 同时可被 CLI 和 HTTP API 消费,结果一致
3. **0G 集成可用**:
   - 0G Storage 上传下载 + Merkle 验证闭环跑通(`@0glabs/0g-ts-sdk`)
   - 0G Compute 推理调用成功率 ≥ **95%**(`processResponse()` 契约正确)
   - Semantic Scholar API(Academic Paper 模板用)**MVP 期 mock,Phase 2 接真 API**
4. **性能红线**:
   - 单 run 首 token 延迟 ≤ **3s**(冷启动)/ ≤ **1.5s**(热启动)
   - 前端看板事件→UI 渲染延迟 ≤ **500ms**
   - 3 节点并行场景下,runtime 不出现状态竞争或消息丢失
5. **Checkpoint / Resume**:任一模板支持 ≥ 1 次中断 + resume,状态完整还原
6. **积木 6 件套命中**:`plan / parallel / barrier / retry_gate / approval_gate / writeback` 六个 Workflow Block 都在 Academic Paper 模板里真实调用
7. **Workflow Assembly 本体**:至少 `Academic Paper` 模板是通过 `WorkflowAssemblySpec → compile → WorkflowDefinition` 主链编译而成,不是硬编码

### Measurable Outcomes

**综合定量指标:**

- **代码级硬资产增量**:MVP 新增功能层 **≥ 1500 行**,在 Phase 1 已有 ~6000 行基础上
- **Demo 可复现性**:评委按公开 README 独立跑通 MVP 端到端闭环成功率 **100%**
- **文档完整度**:PRD + 架构图 + Epic/Story + 首 sprint 计划四件套齐全
- **差异化话术**:Brief 第六节"和 X 有啥区别"9 条对标问答 **100% 可答**
- **学术背书可引用**:PRD 差异化章节可引用 ≥ 5 条学术研究(NMN / Voyager / WorkTeam / Neural Bandit / PaperOrchestra)

## Product Scope

### MVP — Minimum Viable Product(2026-05-16 交付)

**种子模板清单(5 个非 Blank + 1 Blank = 6 个):**

| # | 模板 ID | 中文名 | 角色构成 | 对应 Persona |
|---|---------|-------|---------|-------------|
| 1 | `Solo Company` | **一人公司** 🎤 | CEO / 内容官 / 设计官 / 工程师 / 稽查员 / 客户关系 / 合规官 / 发布运营(8 角色,双 Lane 覆盖 indie dev + indie biz)| Solopreneur |
| 2 | `Academic Paper` | **学术论文** ⭐ | 大纲 / 文献综述 / 绘图 / 章节写作 / 内容优化 / 导师(驳回门)| 学者 |
| 3 | `Newsroom` | **新闻编辑部** | 记者 / 编辑 / 主编(驳回)/ 审校 / 法务 | 内容工作者 |
| 4 | `Modern Startup` | **现代创业团队** | PM / 工程师 / 设计师 | 通用 / 技术评委 |
| 5 | `Consulting` | **咨询工作室** | Engagement Partner / Research Lead / Analyst / Senior Reviewer / Delivery Manager | 咨询从业者(常驻群聊:Engagement Room) |
| 6 | `Blank` | **空白** | — | 引导现场搭建 |

**必做(按优先级):**

1. ✅ **Workflow runtime**(Phase 1 已完成)
2. ⬜ **模板编辑器**(React + ReactFlow,YAML 编辑 + 预览)
3. ⬜ **权限矩阵可视化编辑**(绑定 `WorkflowPolicyMatrixSpec`)
4. ⬜ **实时看板**(ReactFlow 原生实现 + SSE 事件动画层;PixiJS + d3-force 方案因 Shadow 前端不存在该资产而废弃,留 Phase 2 作为性能选项)
5. ⬜ **上述 6 个种子模板**全部 YAML 可运行
6. ⬜ **0G Storage trajectory 归档**(`@0glabs/0g-ts-sdk`)
7. ⬜ **0G Compute 推理接入**(OpenAI SDK 改 `base_url`)
8. ⬜ **Demo 现场改制度交互闭环**(Newsroom 加事实核查员)
9. ⬜ **CID 克隆闭环**(一个 Demo 站 → CID → 另一 Demo 站克隆)
10. ⬜ **WorkflowAssemblySpec 主链**(至少 Academic Paper 走这条路径编译)

**明确不做(战略级砍项):**

- ❌ Tauri 桌面应用打包(Web 版够 demo)
- ❌ 企业多用户 / 跨 Agent 记忆共享
- ❌ INFT 铸造功能完整实现(Phase 3)
- ❌ Shadow 知识库集成(黑客松期间 Shadow 冻结)
- ❌ Agent 可视化拖拽创建(只提供 YAML 编辑 + 预览)
- ❌ 1000 个集成节点(永不做)
- ❌ 用户账户 / 登录 / 团队协作页(Phase 4 以后)
- ❌ Semantic Scholar 真 API 接入(MVP mock)

### Growth Features(Post-MVP,Phase 2: 2026-05 下旬 ~ 06)

1. ⬜ **Tauri Sidecar 集成**(PyInstaller + externalBin + Rust client)
2. ⬜ **Shadow CLI 承接用户入口**,ShadowFlow 停止独立 CLI 产品面
3. ⬜ **Shadow UI 承接可视化**(桌面端侧边栏嵌入编辑器 + 看板)
4. ⬜ **Agent 可视化拖拽创建**(补 MVP 砍项)
5. ⬜ **Semantic Scholar 真 API 接入**(Academic Paper 模板生产级可用)
6. ⬜ **Trajectory 高频写回优化**(writeback 下沉 Rust)
7. ⬜ **Windows 打包签名 + 杀软兼容**

### Vision(Future)

**Phase 3(2026 Q3+):Multi-Mode Marketplace**

**核心原则:交易方式多元,链上仅是选项之一;不交易,永不上链。**

默认态(永远):模板分享 = 0G Storage CID 分享(不上链,零成本)

仅当用户发起真实交易时,**由用户选择三种交易模式之一**:

| 模式 | 成本 | 信任机制 | 适用 | 上链 |
|------|------|---------|------|------|
| **A · P2P 私下** | 零平台费 | 双方信任 / 线下协议 | 朋友 / 小圈子 | ❌ |
| **B · 平台托管 Escrow** | 平台抽佣 2-5% | ShadowFlow 托管付款,买家确认后放款 | 陌生人交易 | ❌(记录存 0G Storage) |
| **C · 链上 INFT** | 0G gas(~$0.01-0.50) + 可选 royalty | 智能合约 + on-chain provenance | 高价值 / 二级市场流通 / 自动分成 | ✅ 铸 ERC-7857 |

**三模式共同保障**:
- 加密元数据保护 prompt(在交易完成前,买家看不到 SOUL 明文)
- 模板作者署名链 traceable
- Phase 3 UI 是 opt-in 入口(marketplace 页面),用户可永远不进入

**与 AIverse 差异化**:AIverse 强制铸单 agent NFT;ShadowFlow 铸一整套组织制度,且不强制铸造。

**Phase 4(2026 Q4+):企业版**
- 多用户 / 共享 Agent 团队 / 跨 Agent 记忆互通 / 治理审计

**长期(Phase 5+):Shadow 生态执行层标配 + 触发性 Rust kernel 下沉**
- ShadowFlow = Shadow 桌面的"执行层事实标准"
- 高并发消息总线 / lineage 查询引擎按需下沉 Rust
- Python 保留 LLM provider / workflow schema / policy matrix 语义层

## User Journeys

本节 5 条主要旅程(J1-J5)+ 3 条边界情况(E1-E3),按"故事体(J1/J2/J3)+ bullet(J4/J5 + edges)"混合呈现。

### J1 · 周一早晨的 Solopreneur(Primary Happy Path · Solopreneur)

> **人物**:Alex,34 岁,前 Google 工程师,去年辞职做独立 SaaS 工具销售。每周一早晨是他最焦虑的 3 小时 —— 要同时扮演 CEO、工程师、内容官、客户关系、合规官、发布运营。上周日深夜失眠:"每个角色我都能干,但一个人同时干 6 个角色是不可能的"。

**关键节拍:**

- **8:45 AM · 打开 ShadowFlow Demo 站**。首屏标语"你一个人创业,身上挂着 8 个岗位?ShadowFlow 让你用一张图把它们全交给 AI"直击痛点。
- **8:47 · 选择 `Solo Company` 模板**。看到角色列表 `CEO / 内容官 / 设计官 / 工程师 / 稽查员 / 客户关系 / 合规官 / 发布运营` —— 心里一动,"这就是我上周一的焦虑列表"。
- **8:49 · 第一次从第三人称视角看自己的"公司组织架构"**。编辑器画布渲染 DAG 图,两条 Lane 分叉(Lane A 业务 / Lane B 技术),右侧 Policy Matrix 可视化。
- **8:51 · 下达周一指令**:"修登录 bug + 发 CSV 导出推文 + 回 2 封邮件 + 评估 GDPR 变更"。点 Run。
- **8:52~8:58 · 看板 6 分钟戏剧**:CEO 拆解任务 → Lane A/B 并行 → 内容官起草推文同时设计官生成配图 → 工程师写 patch → 客户关系回邮件 → 合规官读 GDPR 起草 diff。
- **8:55 · 合规官驳回内容官(Demo 高光 #1)**:"推文声称'永久免费',违反 GDPR 承诺可撤销性条款" → 重写 → 放行。
- **8:56 · 稽查员驳回工程师(Demo 高光 #2)**:"Token 刷新临近过期窗口(< 30 秒)存在 race condition" → 加 mutex → 重试 → 放行。
- **8:58 · 发布运营收尾**:两 Lane 产物汇合,生成本周执行清单,每条带来源角色和驳回历史。
- **8:59 · 0G Storage 归档**:前端调 `@0glabs/0g-ts-sdk` 上传,CID `0x3f7a...bc91` 出炉。
- **9:03 · Jin 在东京克隆**:粘贴 CID → 模板加载 → 加"法务顾问"给内容官多一道审批 → 保存新 CID → 一个工作流正在变成可流通资产。
- **收尾心声**:不是 AI 写得比他好,而是第一次有东西能让他"看见"自己的组织架构,并让这个架构真的运行。

**揭示的能力需求:**

| 能力 | MVP 必做项 | 验证点 |
|------|-----------|--------|
| 模板加载 + 可视化预览 | #2 模板编辑器 | 8 角色 DAG 30 秒内渲染 |
| 自然语言指令 → 多子任务分派 | #1 Runtime(已有)| CEO 正确 fan-out |
| 双 Lane 并行执行 | Runtime `parallel` 积木 | 两 Lane 不相互阻塞 |
| Policy Matrix 真驳回 + 消息流可视化 | #3 + #4 | 驳回原因、接收方、重试过程全可见 |
| 0G Storage 归档 + CID 生成 | #6 | CID 可在 0G Explorer 访问 |
| CID 克隆闭环 | #9 | 克隆后首次运行成功率 100% |
| 演示叙事 4 幕完整性 | — | 驳回#1 + 驳回#2 + 归档 + 克隆 |

### J2 · deadline 前 3 天的 PhD 学生(Primary Happy Path · 学者)

> **人物**:林筱,28 岁,NLP 方向博三。NeurIPS 2026 摘要截止前凌晨 2 点,手握 3 个 Jupyter Notebook + 8 页草稿 + 半成品 LaTeX。过去两天试过 AI Scientist-v2(格式不兼容)、ChatGPT(幻觉引用)。此刻面对空白 Introduction。

**关键节拍:**

- **02:17 · 师兄发来 ShadowFlow 链接**,"听说直接参考了 Google 4 月刚出的 PaperOrchestra"。加载 `Academic Paper` 模板,角色 `大纲 / 文献综述 / 绘图 / 章节写作 / 内容优化 / 导师(驳回门)` —— 熟悉感扑面。
- **02:19 · 上传三份材料**,`想法摘要 + 实验日志`。
- **02:21 · OutlineAgent 输出 JSON 大纲**:可视化计划(3 张图)+ 文献搜索策略(47 篇目标)+ 章节计划。林筱:"第一次觉得大纲不是堆砌,是作战地图"。
- **02:22~02:31 · 并行 Lane 跑 9 分钟**:
  - `LitReviewAgent` 多轮搜索 + Semantic Scholar API(MVP mock)验证 + 时间过滤 + 去重 + BibTeX(47 篇) + 起草 Introduction/Related Work。每条引用可验证无幻觉。
  - `FigureAgent` 调 PaperBanana → VLM 评审("箭头方向反了")→ 修正 → 重生成 → 通过。3 张图出图。
- **02:34 · SectionAgent 组装 LaTeX**:从日志抽数据生成 tabular,嵌入 `\includegraphics`,所有 `\cite` 插入正确。
- **02:35 · RefineAgent peer review 循环**:第 1 轮 5 条意见 → 修正;第 2 轮 2 条 → 修正;第 3 轮 0 条收敛。
- **02:38 · Advisor(导师)驳回链穿透 3 层(Demo 高光)**:"Method 缺少理论支撑,退回 Outline 重新立题"。驳回沿 SectionAgent → OutlineAgent 穿透。
- **02:41 · Checkpoint 自动保存,resume 继续**:前 20 分钟工作不丢失,从 Outline 重跑,Method 新增"Theoretical Foundation"一节,LitReview 补 5 篇理论文献,Figure 新增理论示意图,Section 重组装,Refine 2 轮收敛。
- **02:53 · 最终 PDF 出稿**:8 页,59 条引用(对齐人类论文),3 图 2 表。
- **02:55 · 归档 + 分享**:CID `0xa8f2...e104` → 发给师弟 → 师弟克隆 + 加"同行评议员" + 双签矩阵 → 保存新 CID,模板长出支线。
- **收尾心声**:系统把导师从"初审的苦役"里解放出来,让他真的可以在战略层面和她对话。

**揭示的能力需求:**

| 能力 | MVP 必做项 | 验证点 |
|------|-----------|--------|
| 多文件上传 + 材料解析 | #2 模板编辑器 | .ipynb/.md/.tex 混合上传 |
| WorkflowAssembly 主链编译 | #10 | Academic Paper 走 assembly 路径 |
| `parallel + barrier` | Runtime 并行语义 | Lit/Figure 两 Lane 汇合正确 |
| `retry_loop`(RefineAgent 3 轮) | Runtime retry | 收敛信号可配置 |
| `approval_gate` + 驳回穿透 3 层 | #3 | Advisor 驳回后 Section/Outline 都回滚 |
| Checkpoint/Resume(驳回后恢复) | Runtime checkpoint | 驳回不丢失已完成工作 |
| **6 种 Workflow Block 全命中** | Technical Success 第 6 条 | plan/parallel/barrier/retry_gate/approval_gate/writeback 真实调用 |

### J3 · 突发新闻的编辑部(Primary Happy Path · 内容工作者 + 现场改制度)

> **人物**:陈姐,42 岁,《城市观察》独立新闻工作室主编。周五 16:20 微博热搜跳出某新能源企业数据造假,今晚 8 点前必须上稿。

**关键节拍:**

- **16:22 · 加载 `Newsroom` 模板**,角色 `记者 / 编辑 / 主编 / 审校 / 法务`。下达:"某新能源企业数据造假深度报道,1500 字,附事实核查 + 法律风险评估"。
- **16:23~16:45 · 主编驳回链**:
  - 记者初稿 → 编辑润色 → 主编驳回("财务指控必须有原始文件证据") → 记者重采 → 主编通过 → 审校润色 → 法务驳回("'造假'未经司法裁定,改为'涉嫌不实'") → 审校修正 → 法务通过 → 定稿。
- **16:47 · 陈姐发现少了一个角色**:稿件里没有独立事实核查步骤,赶时间易出错。**决定现场加角色**。
- **16:48~16:50 · 现场改制度(Pitch 第 3 分钟高光)**:
  - 新增角色 `fact_checker(事实核查员)`,SOUL 定义 + 可驳回记者/编辑
  - 修改 Policy Matrix:编辑 → 事实核查员(必经)+ 事实核查员 → 主编(可跳过)
  - 2 分钟内制度改完,保存。
- **16:51 · Re-run with new policy**:系统用修改后的 6 角色 workflow 重跑,事实核查员跳出驳回("第 3 段引用财新数据与原文不一致"),记者修正通过 → 主编 → 审校 → 法务 → 定稿。
- **17:04 · 终稿完成**,距 8 点还有 3 小时。
- **17:05 · CID 分享到独立新闻圈 Discord**:半小时内 7 个记者克隆模板。

**揭示的能力需求:**

| 能力 | MVP 必做项 | 验证点 |
|------|-----------|--------|
| **运行中新增角色** | #8 Demo 现场改制度 | 不需重建项目,运行中加角色 |
| **Policy Matrix 动态修改 + 重编译** | #3 权限矩阵 | 矩阵修改 < 2 分钟生效 |
| **Re-run with new policy**(复用未改动) | Runtime re-run 语义 | 前次未改动部分复用 |
| 多级驳回链(主编+法务+事实核查员) | Runtime handoff + approval_gate | 3 个角色驳回相互独立 |
| 制度模板社群分享 | #9 CID 克隆闭环 | 克隆即用 |

### J4 · 分享一个 CID(Secondary · 跨 persona · bullet)

**Persona**:模板作者 + 克隆者,任何 persona 都可扮演。

**关键节拍:**

- **[T+0s]** Jin 在 Discord 收到 Alex 发的 CID(来自 J1)。
- **[T+5s]** 粘贴到 Demo 站 "Import by CID" 输入框 → Load。
- **[T+8s]** 前端 TS 调 `@0glabs/0g-ts-sdk` 下载 trajectory:`workflow.yaml + policy_matrix + stages + 4 provider config +(可选)run 历史`。
- **[T+10s]** Merkle 验证通过 → "模板来源:0G Storage · CID 验证 ✓"。
- **[T+12s]** 模板渲染,包括 Alex 的 8 角色 + 权限矩阵。可选"载入历史"或"空白开始"。
- **[T+30s]** Jin 加新角色 `legal_advisor(法务顾问)`,绑定到内容官流程后(为日本药品广告法)。
- **[T+1m]** 保存为新模板,"Publish to 0G"。
- **[T+1m15s]** 新 CID `0x9c2e...a803` + 署名链 `Alex → Jin`。
- **[T+1m20s]** 回传到 Discord,标注"加了日本药品广告法合规层"。

**揭示的能力需求:**

| 能力 | MVP 必做项 | 验证点 |
|------|-----------|--------|
| `Import by CID` 一级入口 | #9 | 不藏在二级菜单 |
| 0G Storage 下载 + Merkle | #6 | 失败有明确错误提示 |
| 模板版本署名链(author lineage) | #5 + metadata | 可查原作者 → 克隆者链条 |
| 克隆首次运行成功率 100% | Technical Success | 0 破坏性依赖 |
| Phase 3 预留(按需触发):署名链 = 未来 INFT provenance | Phase 3 路线图 | metadata 兼容 ERC-7857,但**不在分享/克隆时预铸造** |

### J5 · 5 分钟评委路演(Secondary · 黑客松评委 · bullet)

**Persona**:0G Hackathon 评委,首次访问,目标 5 分钟内判断是否给奖。

**关键节拍:**

- **[0:00]** 落地首屏:Slogan + 四维蓝海象限图(ShadowFlow 独占右上)+ CTA "Try Live Demo (无需注册)"。
- **[0:15]** 点 CTA → 模板选择页,6 张卡片,每张 30 字痛点 + GIF 预览。
- **[0:30]** 选 `Solo Company` → 加载编辑器。
- **[0:45]** "Quick Demo" 按钮预填好指令,点 Run。
- **[1:00~2:30]** 看板双驳回戏按 J1 节奏自动上演,每次驳回有大号红色 toast "⚠️ Policy Matrix: XX 驳回 YY"。
- **[2:30]** 底部三按钮:"技术白皮书" / "差异化对比(vs N8N/Cherry/AutoGen/AIverse)" / "0G 链上证据"。
- **[2:45~3:15]** 点 "0G 链上证据" → 0G Explorer 外链 → 真实 trajectory CID + 时间戳 + Merkle proof,评委可复制到 0G 官方浏览器独立验证。
- **[3:15~4:30]** 切 `Academic Paper` 或 `Newsroom`,看多场景覆盖。
- **[4:30]** 侧边栏:GitHub Star + 团队 + 技术栈 + Phase 2 路线图(Sidecar 集成 Shadow)+ Phase 3 INFT 市场。
- **[5:00]** 第一印象收敛:"不是 demo 级皮肤,是有 runtime 硬资产的产品,0G 原生不是贴标签"。

**揭示的能力需求:**

| 能力 | MVP 必做项 | 验证点 |
|------|-----------|--------|
| 落地页(Slogan + 象限图 + CTA) | MVP 新增 | 无需登录即可 Try |
| "Quick Demo" 预填指令 | #8 | 每模板有预填,降低 Run 门槛 |
| 看板大号驳回 toast | #4 | 驳回事件视觉强化 |
| 0G Explorer 外链独立验证 | #6 | 0G 官方浏览器可打开 |
| 三个差异化对比页 | Brief 第六节话术 | 9 条"vs X"问答 100% 可点 |
| Phase 2/3 路线图页 | PRD 第八节 | 展示工程方案链接 |
| 独立跑通 README | Measurable Outcomes | 评委 copy-paste 本地复现 |

### E1 · 0G Compute API 超时(J1 edge · Solopreneur)

**触发**:工程师节点调 0G Compute 端点,30 秒网络超时。

**节拍:**

- **[T+0]** 工程师节点调用 0G Compute → 30 秒无响应。
- **[T+30]** Runtime 捕获超时 → 看板橙色 toast "⚠️ 0G Compute 超时,尝试 fallback provider"。
- **[T+30]** 按配置 fallback 链 `0G → OpenAI → Claude → Ollama(本地)`。
- **[T+31]** 切到 OpenAI,重新调用。
- **[T+60]** 成功,节点标签保留"本节点来自 OpenAI fallback"。
- **归档时**:trajectory metadata 记录 fallback 事件,可 audit。

**降级策略**:所有 provider 都失败 → 暂停 + checkpoint → 用户手动 resume 时可选:继续 / 放弃 / 换 provider。

**揭示的能力需求:**

| 能力 | MVP 必做项 | 验证点 |
|------|-----------|--------|
| Provider fallback 链 | Phase 1 已有 4 Provider Adapter | 配置式 fallback 顺序 |
| 超时触发 + Runtime retry | Runtime retry 语义 | 可配置 timeout |
| Fallback 事件 trajectory 记录 | #6 | 可审计 |
| 用户看板降级提示 | #4 | 非静默降级 |

### E2 · 实验日志不完整(J2 edge · 学者)

**触发**:上传的 .ipynb 缺少"baseline B on dataset Y"对比数据。

**节拍:**

- **[T+10s]** SectionAgent 组装 Experiments 时发现 gap:大纲引用但实验日志缺。
- **[T+12s]** 触发 "gap detection" → 不自作主张填充 → 发起 `question` 消息事件。
- **[T+13s]** 看板弹窗:"⚠️ Experiments 发现 1 个数据 gap:'baseline B on dataset Y' 无实验结果。(A) 补充数据 (B) 从论文移除此对比 (C) 注释为 'will be updated'"。
- **[T+15s]** 林筱选 B。SectionAgent 更新大纲 → 重生成 Experiments → LitReview 自动移除相关 Related Work 引用保持一致。
- **[T+20s]** 继续正常流程。

**设计原则**:Agent 宁可向用户提问,不自作主张填充。呼应 PaperOrchestra "输入不完整时留空洞"的局限,ShadowFlow 用反向提问修正。

**揭示的能力需求:**

| 能力 | MVP 必做项 | 验证点 |
|------|-----------|--------|
| **Gap detection** 在 Agent 层 | Runtime memory_event 扩展 | 明确 gap 类型 |
| **Agent 反向提问** | Runtime handoff + human-in-the-loop | 非自主决策兜底 |
| 用户选择后 **cascade 更新** | Runtime lineage | 改动自动传播到依赖下游 |

### E3 · 新增角色权限矩阵非法(J3 edge · 内容工作者)

**触发**:陈姐误把 Policy Matrix 配成"事实核查员 → 法务"(给了事实核查员驳回法务的权限),违反法律优先级。

**节拍:**

- **[T+0]** 陈姐保存修改后的 Policy Matrix。
- **[T+1s]** Compile Validator 扫描 → 发现违规:"事实核查员不应驳回法务(法律条款优先于事实核查)"。
- **[T+2s]** 编辑器弹非阻塞红色提示 "⚠️ Compile 警告:Policy conflict - 事实核查员 → 法务 是不推荐的权限关系"。下方按钮:"查看原因" / "我仍要保存(覆盖警告)"。
- **[T+10s]** 陈姐点 "查看原因",看到内置"常见违法矩阵规则库"对比:法务 > 事实核查员 > 审校(新闻行业编辑流程最佳实践)。
- **[T+15s]** 改为"事实核查员 → 记者 + 编辑"(驳回下游而非上游),保存通过。

**设计原则**:系统不强制用户合规,但必须告诉用户代价。呼应 Workflow Assembly Contract v1 的"assembly constraint validator"思想。

**揭示的能力需求:**

| 能力 | MVP 必做项 | 验证点 |
|------|-----------|--------|
| **Compile-time policy validation** | Runtime policy_matrix validator | 保存时自动校验 |
| 非阻塞警告 + 原因展示 | #3 | 可覆盖但有理由 |
| 内置"常见违法矩阵规则库" | MVP 新增(轻量) | 每模板带 3-5 条规则 |
| 教学式反馈 | UX 设计 | 不是冷错误,是教学 |

### Journey Requirements Summary

跨 5 条 Journey + 3 条 Edge Case 汇总的能力优先级:

#### 🔴 Critical(MVP 必做,缺失阻塞 demo)

1. 模板加载 / 可视化 / 预填指令(J1/J2/J3/J5)
2. Policy Matrix 真驳回 + 看板强化提示(J1/J2/J3)
3. `parallel + barrier + retry_loop + approval_gate` 四积木完整可用(J2)
4. Checkpoint / Resume 链路(J2 驳回穿透 + E1 超时恢复)
5. 0G Storage 归档 + Merkle 验证 + CID 克隆闭环(J1/J2/J4)
6. 运行中新增角色 + Re-run with new policy(J3)
7. Compile-time policy validation 非阻塞警告(E3)
8. Provider fallback 链(E1)
9. Demo 站 Quick Demo 预填 + 0G Explorer 外链(J5)

#### 🟡 Important(MVP 建议,影响叙事完整性)

10. Agent gap detection + 反向提问(E2)
11. 模板版本署名链(author lineage)(J4)
12. 差异化对比跳转页(J5)
13. Phase 2/3 路线图展示页(J5)

#### 🟢 Nice-to-have(Post-MVP / Phase 2+)

14. Agent 可视化拖拽创建
15. Semantic Scholar 真 API 接入
16. trajectory 审计日志高级查询

## Domain-Specific Requirements

ShadowFlow 不落在典型监管行业(healthcare / fintech / govtech),但跨越三个高复杂度领域交叉:**AI agent infrastructure + blockchain (0G) + brownfield integration**。本节列出与此交叉相关的强约束。

### 核心原则:交易方式多元,链上仅是选项之一;不交易,永不上链

- **默认模式 = Storage Only**:模板创建 / 分享 / 克隆 / 运行 / trajectory 归档 —— 全部走 **0G Storage CID**,**不触发任何链上交易**,零成本
- **Phase 3 三种交易模式**(用户发起真实交易时选择):
  - **A · P2P 私下**:作者把 CID + 解密密钥私下发送给买家,线下转账(法币 / 加密货币均可),平台不介入,不上链
  - **B · 平台托管 Escrow**:ShadowFlow 前端提供托管流程 —— 买家付款到平台暂存,确认后放款给作者,平台抽 2-5% 服务费;**不上链**,交易记录存 0G Storage
  - **C · 链上 INFT**:铸 ERC-7857 + on-chain 支付 + 所有权自动转移 + 可配 royalty(0G gas ~$0.01-0.50)
- **Phase 1 MVP 不铸造任何 INFT**;Phase 2 集成 Shadow 桌面后仍以 Storage 为主;Phase 3 才开放 opt-in marketplace 入口
- **设计哲学**:交易机制应与场景匹配 —— 朋友间用 Storage,陌生人用 Escrow,高价值流通用 INFT。**平台不做"链上正义"的道德绑架**

### Compliance & Regulatory

- **0G Chain 合规**:trajectory 归档上链数据**不得**包含用户 PII 或第三方敏感内容;上传前必须进行 sanitize scan(禁止字段:邮箱、电话、身份证、银行账户、API key、session token)
- **Phase 3 INFT 合约(ERC-7857,仅在交易触发时)**:
  - **prompt 保护**:模板的 SOUL(role prompt)以加密元数据上链,防止被白嫖
  - **授权模型**:挂牌 / 付费克隆 / 租赁授权 三类事件各自 on-chain event 独立
  - **版权清洁**:模板作者对 soul prompt 的版权归属,克隆链条 traceable(作者署名链从 Storage 层就开始累积,铸造时一次性写入)
- **GDPR / CCPA 应对**(非 MVP 强制,Phase 2 起生效):
  - 用户有权请求删除 trajectory → Phase 2 起必须有 right-to-erasure 流程
  - 0G Storage 已归档的 CID 不可撤回,需前端层过滤 + 重新上传"已删除"版本
  - 已上链的 INFT 元数据不可撤回(链上写入即永久),但可通过二级合约冻结
- **LLM provider 使用合规**:
  - 四 provider(Claude / OpenAI / Gemini / Ollama)各自 TOS
  - 0G Compute 推理必须通过 `processResponse()` 契约(防止计为滥用)

### Technical Constraints

- **LLM API 密钥安全**:
  - MVP:浏览器 localStorage(用户自带 key)
  - Phase 2:系统 keychain(Tauri `tauri-plugin-stronghold`)
  - **严禁**:key 上链、key 存 0G Storage、key 写 trajectory metadata
- **0G SDK 稳定性**:`@0glabs/0g-ts-sdk` 在 Windows / 浏览器历史有不稳定记录 → 锁定可用版本并固化到 `package.json`
- **Merkle 验证**:所有从 0G Storage 下载的 trajectory 必须验证 Merkle root 再解析
- **Provider fallback prompt 隐私**:E1 edge case 触发 fallback 时,选用 no-training-use API tier 或 Ollama 本地
- **模板沙箱**:运行克隆模板时,tool 调用在受限 sandbox 内(MVP:白名单 tools;Phase 2:container / wasm)

### Integration Requirements

- **0G Storage**(MVP 必)—— 上传 / 下载 / Merkle 验证,`@0glabs/0g-ts-sdk` 前端 TS
- **0G Compute**(MVP 必)—— OpenAI SDK 兼容,Python 改 `base_url`,调用后 `processResponse(providerAddress, chatID, usageData)`
- **0G Chain**(Phase 3,**按需铸造**)—— ERC-7857 合约部署;**仅在挂牌/交易瞬间**触发;加密元数据存储(IPFS 或 0G Storage 加密层)
- **Shadow 桌面 Sidecar**(Phase 2)—— Tauri `externalBin` + PyInstaller + HTTP 127.0.0.1
- **4 LLM Provider**(已有)—— Claude / OpenAI / Gemini / Ollama,可扩 0G Compute 作为第 5 provider
- **Semantic Scholar API**(Academic Paper 模板)—— MVP mock,Phase 2 接真 API

### Risk Mitigations

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 0G TS SDK Windows 不稳定 | 中 | Demo 失败 | 提前锁定版本 + 本地 mock 兜底 + 预录 demo 视频 |
| 0G Compute 免费额度耗尽 | 中 | Demo 中断 | 4 provider fallback 链 + Ollama 本地兜底 |
| Trajectory 意外含 PII | 中 | GDPR 合规 | 上传前 sanitize scan + 白名单字段 |
| INFT 加密元数据方案未成熟 | **降权:低** | Phase 3 延期 | **因采用 Lazy Minting,多数模板永不铸造**;POC 原型仅需覆盖真交易路径;未成熟时 marketplace 可延期不影响主产品 |
| Python Sidecar Windows 杀软误报 | 中 | 集成卡壳 | 代码签名 + 或换 PyOxidizer + 预留 3-5 天调试 |
| 克隆模板 tool 恶意调用 | 低 | 用户本地安全 | MVP 白名单 tools + Phase 2 container sandbox |
| LLM provider 训练数据泄漏 prompt | 中 | 商业机密外泄 | no-training API tier + Ollama 本地 + 提示用户风险 |
| 0G testnet 与 mainnet 差异 | 中 | 切换出错 | 早期 testnet 跑通 + 1 周切换期 |
| **过度工程化 INFT 机制** | **新增:中** | **增加 Phase 3 工作量但无实际价值** | **坚持 Lazy Minting 原则;marketplace 是 opt-in 入口,多数用户不需要** |

### Domain Patterns(行业最佳实践)

- **0G Agent Skills 规范**:已接入 `.0g-skills/`,遵循 ALWAYS / NEVER 规则(ethers v6 / `evmVersion: "cancun"` / `processResponse()` 必调 / ZgFile close in finally / 密钥永不硬编码)
- **Multi-agent 工作流社区共识**:gap detection + 反向提问、API 验证(非 LLM 记忆)、迭代循环(非一次性生成)—— 参考 PaperOrchestra / WorkTeam 最佳实践
- **Workflow-as-Asset 先例**:类比 GitHub Actions template / Docker image registry,有成熟版本 / 署名 / 依赖 / 签名机制可参考
- **Lazy Minting 先例**:OpenSea / Manifold / Zora 生态已验证 lazy minting 模式 —— NFT 在首次购买时才真正上链,节省 gas + 对齐交易意图与链上成本

## Innovation & Novel Patterns

### Detected Innovation Areas

ShadowFlow 的创新不是单点突破,而是**五条研究/产业线的交汇**。每一条独立已有 art,但组合后形成产品级别的新范式。

#### 1 · 组织形态可视化(非代码可视化)

- **现有范式**:LangFlow / CrewAI Studio / Dify 做的是"把代码可视化",给程序员用
- **ShadowFlow**:抽象层级提升一层 —— **让非开发者直接设计组织的角色、权限、审议、传承逻辑**,底层才编译成 workflow
- **挑战的假设**:"可视化工作流 = 节点拖拽"是错的;真正的价值在于**"组织设计作为一等公民"**

#### 2 · Workflow Assembly(积木式)而非 Pattern Recommendation

- **现有范式**:Edict 写死三省六部、CrewAI 写死 crew/role/task
- **ShadowFlow**:**"模板是成品,积木才是本体"** —— Block Catalog + Assembly Spec + Constraint Validator,pattern 只是 assembly 的 serialized recipe
- **挑战的假设**:用户需要"选择预设模板" ←→ 用户需要"可自由组装的结构空间"

#### 3 · 工作流层的 NMN × MoE × Neural Bandit

- **学术血脉**(参见 `docs/plans/academic-foundation-and-roadmap-v1.md`):
  - Neural Module Networks (2016, Andreas et al.)—— 按问题语法组合神经网络模块
  - Voyager (2023)—— 技能库自动生长
  - WorkTeam (2025, NAACL)—— NL → workflow
  - MoE 动态路由(Fedus / DeepSeek)—— 动态激活专家
  - Neural Bandit + LLM(IBM AAAI 2026 Tutorial)—— 学哪个 LLM / 哪组工具对哪个任务
- **ShadowFlow 的位置**:**工作流层的 NMN + agent 级 MoE 动态路由 + 情境老虎机激活学习**

#### 4 · Policy Matrix 真驳回(不是配置项,是运行时一等公民)

- **现有范式**:AutoGen 的 agent 可以拒绝,但拒绝是 soft-signal;LangGraph 有 conditional edges 但无 role-based 驳回
- **ShadowFlow**:`approval_gate` + `policy_matrix` 是 Workflow Block 级别的**一等积木**,驳回可穿透 3 层(J2 Advisor 驳回 Section → 回退到 Outline),触发 checkpoint resume
- **挑战的假设**:"多 agent 就是多个 LLM 轮流说话" ←→ "多 agent 是有治理关系的组织"

#### 5 · 多元交易市场(交易方式多元,链上仅是选项之一)

- **现有范式**:NFT 市场默认"铸造 = 上链";AIverse 把单 agent 铸成 NFT 作为默认行为
- **ShadowFlow**:**"不交易,永不上链"** —— 朋友分享 Storage + CID,陌生人交易可选 P2P / Escrow / On-chain INFT 三模式
- **挑战的假设**:"链上 = 正义"的 Web3 道德绑架 ←→ "链上成本应与交易价值对等"

### Market Context & Competitive Landscape

| 维度 | ShadowFlow | AutoGen | LangGraph | CrewAI | N8N | AIverse | Edict |
|------|-----------|---------|-----------|--------|-----|---------|-------|
| 角色人格(SOUL) | ✅ 原生 | 需代码 | 需代码 | ✅ | ❌ | ✅ 单 agent | ✅ 写死 |
| 详细工作流 | ✅ | ✅ 需代码 | ✅ 需代码 | ✅ 需代码 | ✅ | ❌ | ✅ 写死 |
| 可视化设计 | ✅ 组织形态 | ❌ | ❌ | ❌(Studio 是代码可视化)| ✅ 工作流 | ❌ | ✅ 固定架构 |
| 权限/治理矩阵 | ✅ 一等公民 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ 写死 |
| 链上资产化 | ✅ 多元交易 | ❌ | ❌ | ❌ | ❌ | ✅ 单 agent NFT | ❌ |
| 学术血脉明确 | ✅ NMN/MoE/Bandit | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**蓝海象限**(参照 Brief 第二节):右上象限"真协作团队"**无直接竞品**。

### Validation Approach

**创新的每一条都有验证路径**:

| 创新 | 验证信号(Phase 1 黑客松)| 失败回退 |
|------|--------------------------|----------|
| 组织形态可视化 | 评委访谈中 ≥ 3/5 能区分"组织可视化"vs"代码可视化" | 如混淆,调整 pitch 话术,不改产品 |
| Workflow Assembly | 至少 `Academic Paper` 模板走 `WorkflowAssemblySpec → compile` 主链(非硬编码) | 如 assembly 主链复杂度过高,Phase 1 降级为"所有模板硬编码 + Phase 2 补 assembly" |
| NMN/MoE 学术血脉 | 技术评委访谈中能引用 ≥ 2 篇原文背书 | 如不识货,改 pitch 走产品侧(gstack / PaperOrchestra 引用) |
| Policy Matrix 真驳回 | 每个 demo run 至少 1 次真实驳回(非 mock)| 如 demo 稳定性不足,预录备份视频 |
| 多元交易(Phase 3)| Phase 3 启动前 ≥ 3 次用户访谈表态"喜欢有选择权" | 如用户一致要求"只要链上",改回 lazy minting 单模式 |

### Risk Mitigation(创新相关)

| 创新风险 | 概率 | 缓解 |
|---------|------|------|
| "组织形态可视化"被误解为"又一个节点编辑器" | 中 | pitch 叙事前置差异化;Demo 首屏用 "公司组织架构图"类比 |
| WorkflowAssembly 主链工程复杂度超预期 | 中 | 仅 Academic Paper 走 assembly;其他 5 模板硬编码兜底 |
| 学术血脉叙事吓跑非技术评委 | 低 | 双版 pitch:技术评委用学术版,产品评委用 gstack / Solopreneur 版 |
| Policy Matrix 驳回链路 bug 导致 demo 失败 | 中 | 驳回事件 unit test 100% 覆盖;预录备份 demo |
| 多元交易方案被 0G 社区质疑"不够 Web3" | 中 | 公开解释:链上成本应与交易价值对等;引 OpenSea lazy minting 先例 |

## Web App Specific Requirements

### Project-Type Overview

ShadowFlow Phase 1 MVP 以 **React SPA + Python FastAPI** 形态交付,服务于黑客松现场 5 分钟 demo 的场景优先级。Phase 2 通过 Tauri Sidecar 嵌入 Shadow 桌面,SPA 仍保留供独立 Web 分发使用。

### Technical Architecture Considerations

- **前端**:React 18 + ReactFlow 11 + Zustand + Tailwind(与 Shadow 同栈,组件可互搬)
- **后端**:Python FastAPI + pydantic + asyncio + WebSocket / SSE
- **实时通道**:看板消息流通过 SSE(MVP)或 WebSocket(Phase 2),不走轮询
- **链上**:前端 TS 直接调 `@0glabs/0g-ts-sdk`,Python 后端仅编排,不持有链上密钥
- **打包**:MVP 直接 Docker + docker-compose 一键启动;Phase 2 PyInstaller + Tauri externalBin

### Browser Matrix

- **MVP 必支持**:Chrome / Edge / Arc(Chromium ≥ 120),Firefox ≥ 120
- **MVP 建议支持**:Safari 17+(0G SDK 在 Safari 的兼容性在 MVP 前做 smoke test)
- **MVP 不支持**:IE / 老版本移动浏览器
- **解析度**:最小 1366×768(小于此 UI 可能紧凑但仍可用),推荐 1920×1080+

### Responsive Design

- **主场景 = 桌面端编辑器 + 看板**(非移动优先)
- Mobile / Tablet:MVP 仅做 view-only(可看 demo 回放,不能编辑)
- Phase 2+:视需求扩展,但 editor 本身不适合小屏

### Performance Targets

- 模板编辑器首屏渲染 ≤ 2s
- 8 角色 DAG 可视化渲染 ≤ 1s
- 看板消息流从 runtime 事件到 UI ≤ 500ms
- Demo 站 funnel 首次运行完成 ≤ 8 分钟(含 LLM 推理时间)

### SEO Strategy

- **不做传统 SEO**(Demo 站非内容站点)
- 但需要**完整的 OG meta** + 首屏 hero 文案(评委分享链接到 Twitter / Discord 时要有漂亮预览)

### Accessibility Level

- MVP:**WCAG 2.1 AA basic**(键盘导航 + 语义 HTML + 颜色对比度),不做 screen reader 深度适配
- Phase 2+:如发现盲人用户或合规需求,再升级

### Implementation Considerations

- **Docker 一键启动**:`docker-compose up` 即启动前后端,README 有详细步骤
- **前端密钥管理**:LLM API keys 走 localStorage(用户自带);0G Storage 公钥/私钥也由用户自带
- **后端无状态**:runtime 本身无状态,state 全在 checkpoint store;支持水平扩展(Phase 2+)
- **本地兜底**:0G Compute 不可用时自动 fallback Ollama(本地模型)

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP 类型 = Experience MVP + Platform MVP 混合**

- **Experience MVP**:5 分钟让评委完整体验"设计 → 立法 → 编排 → 运行 → 传承"五动作闭环
- **Platform MVP**:Runtime Contract + Writeback Adapter + Checkpoint + Policy Matrix 四件套已是代码级硬资产(Phase 1 Python Runtime 已交付 ~6000 行)

**资源需求**:
- 团队规模:1-2 人(Jy + 可能 1 个前端协作者)
- 周期:4 周(2026-04-15 起至 2026-05-16 交付)
- 关键依赖:0G TS SDK 稳定 + ReactFlow 11 + Shadow 前端组件可搬

### MVP Feature Set(Phase 1)—— 本节是 Scope Contract

**核心用户旅程支持**:
- J1 · Solopreneur 周一早晨 ✅
- J2 · PhD 学生 deadline 前 ✅
- J3 · 新闻编辑部突发新闻 + 现场改制度 ✅
- J4 · CID 分享克隆 ✅
- J5 · 评委 5 分钟路演 ✅
- E1-E3 · 三种降级场景 ✅

**Must-Have 能力**(10 项,见 Success Criteria → MVP):
1. Workflow runtime(已有)/ 2. 模板编辑器 / 3. 权限矩阵可视化 / 4. 实时看板 / 5. 6 个种子模板 / 6. 0G Storage / 7. 0G Compute / 8. 现场改制度 / 9. CID 克隆闭环 / 10. WorkflowAssembly 主链(至少 Academic Paper)

### Post-MVP Features(Phase 2 · 2026-05 下旬 ~ 06)

见 Success Criteria → Growth Features(7 项)

### Phase 3 · Multi-Mode Marketplace(2026 Q3+)

见 Executive Summary + Product Scope → Vision

### Risk Mitigation Strategy(Scoping 视角)

| 类别 | 风险 | 缓解 |
|------|------|------|
| **Technical** | 0G TS SDK Windows 不稳定 | 预先跑通最小闭环 + 锁定版本 + 本地 mock 兜底 + 预录 demo |
| **Technical** | WorkflowAssembly 主链工程量超预期 | 仅 Academic Paper 走 assembly;其他 5 模板硬编码兜底 |
| **Technical** | Python Sidecar Windows 杀软误报(Phase 2) | MVP 不集成,Phase 2 留 3-5 天调试 + 代码签名 |
| **Market** | 评委看不懂"组织形态可视化" | 双版 pitch + Demo 首屏类比"公司组织架构图" |
| **Market** | 被质疑"一个月做不出来" | Brief 第九节明示已有 6000 行硬资产 |
| **Resource** | 独立开发者 1-2 人难 4 周交付 | MVP 砍项彻底(不做 Tauri / 不做 INFT / 不做账户体系);任何超纲立即砍 |
| **Schedule** | 黑客松 0G 方接入流程卡壳 | 提前 1 周完成 0G 注册 + key 生成 + 测试网 smoke test |

## Functional Requirements

本节定义 ShadowFlow 的**能力契约**(Capability Contract)。每一条 FR 是可测试的能力,implementation-agnostic。下游 UX / 架构 / Epic 拆分只实现此处列出的能力;未列出 = 不存在于最终产品。

### 模板设计(Template Design)

- **FR1**:用户可加载系统预置的 6 个种子模板(`Solo Company` / `Academic Paper` / `Newsroom` / `Modern Startup` / `Consulting` / `Blank`)。每个模板具备独立的 agent roster + group roster + 用户身份(CEO / PI / Editor-in-Chief / Founder / Engagement Partner) + BriefBoard 别名 + 默认 Ops Room 命名,模板之间的 agent 与群聊不串货(2026-04-16 决策 7)
- **FR2**:用户可通过 YAML 编辑 + 可视化预览方式新增、修改模板中的角色(Role)、工具(Tool)、Agent 定义
- **FR3**:用户可为每个角色定义 SOUL(职责 prompt)、可用工具列表、绑定的 LLM provider
- **FR4**:用户可定义 stage / lane 结构,指定节点在哪个 stage、属于哪个 lane
- **FR5**:用户可定义 parallel / barrier / retry / approval_gate 等控制流积木
- **FR6**:用户可通过"运行中新增角色"功能,在一次已经启动的 run 中动态加入新角色,无需从头创建项目(J3 关键)
- **FR7**:系统可通过 WorkflowAssemblySpec → compile → WorkflowDefinition 主链把高层积木装配编译为可运行 workflow(至少 Academic Paper 模板走此路径)

### 权限矩阵(Policy Matrix)

- **FR8**:用户可通过可视化矩阵编辑器定义"谁能给谁发消息、谁能驳回谁"的权限关系
- **FR9**:用户可在运行中修改 Policy Matrix 并触发 re-compile + re-run(J3 关键)
- **FR10**:系统在矩阵保存时执行 compile-time validation,对不推荐的权限关系(如违反行业惯例)弹出非阻塞警告 + 原因展示(E3 关键)
- **FR11**:系统在运行时真实执行 Policy Matrix 驳回 —— 当 receiver 无权接收或 reject 发生时,触发 handoff 事件与 retry loop
- **FR12**:驳回可穿透多层(如 Advisor 驳回 Section → 回退到 Outline → 所有中间步骤 rollback),触发 checkpoint resume(J2 关键)

### 运行执行(Runtime Execution)

- **FR13**:用户可在编辑器下达自然语言指令,系统自动 fan-out 到各 stage 的入口节点
- **FR14**:系统可并行(parallel)执行多个 lane / 节点,通过 barrier 汇合
- **FR15**:系统可循环(retry_loop)执行,基于 convergence_signal 或 max_rounds 自动终止
- **FR16**:系统可通过 approval_gate 暂停流程、等待审批角色决策、根据结果进入不同分支
- **FR17**:每个节点可选择 LLM provider(MVP:Claude / OpenAI / Gemini / Ollama / 0G Compute,5 选 1)
- **FR18**:系统在 provider 超时或不可用时按配置 fallback 链自动切换(E1 关键)

### 实时观察(Real-time Observability)

- **FR19**:用户可在看板上实时看到每个节点的执行状态(pending / running / succeeded / failed / rejected)
- **FR20**:用户可看到节点间的消息流(发起方 / 接收方 / 消息内容 / 时间戳)
- **FR21**:驳回事件在看板上以**视觉强化**形式呈现(大号红色 toast,不可被忽略)
- **FR22**:用户可在看板上点开任一节点查看详细输入 / 输出 / 历史 / 错误

### 持久化与恢复(Persistence & Recovery)

- **FR23**:系统在每个 step 完成后自动 checkpoint(无需用户触发)
- **FR24**:用户可在中断后 resume 任一 run,状态完整还原,已完成工作不丢
- **FR25**:用户可查看某次 run 的完整 trajectory(所有 step / artifact / handoff / memory_event)
- **FR26**:系统可 export run 为结构化 `run → step → final_output → trace → artifacts`

### 0G 链生态集成(0G Ecosystem Integration)

- **FR27**:用户可将当前 run 的 trajectory 归档到 0G Storage,得到 CID
- **FR28**:系统在上传前执行 sanitize scan,剔除禁止字段(PII / API key / session token)
- **FR29**:用户可通过 CID 从 0G Storage 下载 trajectory,并在本地 Merkle 验证通过后解析
- **FR30**:系统可调用 0G Compute 端点进行 LLM 推理,遵循 `processResponse()` 契约
- **FR31**:MVP 不提供任何 INFT 铸造功能(Phase 3+)

### 模板分享与交易(Template Sharing & Trading)

- **FR32**:用户可通过 `Import by CID` 一级入口加载来自 0G Storage 的他人模板
- **FR33**:导入的模板保留原作者署名链(author lineage),后续修改作为"克隆分支"追溯
- **FR34**:用户可把修改后的模板重新归档为新 CID,署名链自动累积 `原作者 → 克隆者`
- **FR35**:Phase 3+:用户可选择三种交易模式中的一种发起真实交易(P2P / Escrow / On-chain INFT),MVP 不涉及

### Agent 反向提问 & Gap 检测(Agent Interactivity)

- **FR36**:当 Agent 检测到输入不完整(如实验日志缺 baseline 数据)时,主动向用户发起 question 消息事件,**不自作主张填充**(E2 关键)
- **FR37**:用户回答后,系统自动 cascade 更新依赖下游(如修改大纲后重生成 Experiments 章节)

### Demo 与路演(Demo & Pitch)

- **FR38**:Demo 站点首页可在无需登录下 Try Demo
- **FR39**:每个模板有"Quick Demo"预填指令按钮,降低 Run 门槛
- **FR40**:Demo 站点底部有三个差异化对比页面入口(技术白皮书 / vs 竞品 / 0G 链上证据)
- **FR41**:系统提供一个公开 README,评委 copy-paste 即可在本地跑通 MVP 端到端闭环

### 协作四视图 & AI 员工化(Collaboration Quad-View & AI Workforce)(2026-04-16 决策 1/2/5/6/9/10)

**产品叙事升级:** ShadowFlow 的协作信息架构由"单次 run 为中心"升级为"**AI 员工在公司架构下与人共同工作**"—— 新项目 = 新建群聊(Group Room)+ 拉 AI 员工 + 邀请人类成员。协作入口由 Chat / AgentDM / BriefBoard 三视图扩展为**四视图**,新增 **Inbox(消息列表)** 作为顶层入口。参照钉钉/飞书/企微的三列消息面板,仅参照消息列表的信息架构。

- **FR-Inbox-1**:系统提供 Inbox 顶层入口(三列布局:窄导航 / 消息列表 / 当前会话预览),作为用户进入 ShadowFlow 后的主工作界面(LiveDashboard 降级为"专家观察模式",不再是主入口)
- **FR-Inbox-2**:消息列表按 Tab 过滤(全部 / 单聊 / 群聊 / 未读),分 `TEAM RUNS`(群聊)和 `AGENT DMs`(单聊)两个 section
- **FR-Inbox-3**:消息列表项显示状态胶囊(`Running` / `Blocked` / `Idle`)、未读 badge、待决策数徽章(`DECISIONS · N`)、最后消息预览
- **FR-Inbox-4**:右侧会话预览顶部显示 4 指标胶囊条(Active Runs / Pending Approvals / Cost Today / Members)
- **FR-Inbox-5**:右侧会话预览内嵌 APPROVAL GATE 面板,支持用户在不进入完整群聊的前提下通过 / 驳回待审议条目(紫色 accent `#A78BFA` 作协作态视觉锚)
- **FR-Inbox-6**:"+ 新群聊"按钮触发"新项目流程"—— 选模板 → 实例化该模板的 agent roster → 邀请人类成员 → 生成常驻群聊(Ops Room)
- **FR-Inbox-7**:Inbox 按当前模板上下文筛选(不是跨模板全局收件箱),切换模板即切换整个可见会话集
- **FR-Template-Switcher**:左窄导航顶部(原 SF Logo 位)提供模板切换器,图标色随模板主色,下方显示 10px Mono 标签(如"学术 ▾" / "Academic ▾")
- **FR-Template-Switcher-2**:切换器展开后列出所有可用模板 + 底部"+ 新建模板 / 加入企业"入口(MVP 只实现"新建模板","加入企业"排期 post-MVP 多租户阶段)
- **FR-Identity**:用户在不同模板下的身份不同 —— Solo Company = CEO、Academic Paper = PI、Newsroom = Editor-in-Chief、Modern Startup = Founder、Consulting = Engagement Partner、Blank = Owner;AgentDM 的"SOUL" + "CURRENT TASK" 卡片 header 文案按当前模板投射用户身份
- **FR-OpsRoom**:每个模板有独立的默认常驻群聊命名(Solo=`CEO Ops Room` / Academic=`PI Study Room` / Newsroom=`Editorial Room` / Startup=`Founders Room` / Consulting=`Engagement Room`)
- **FR-BriefBoard-Alias**:`BriefBoard` 为技术名(Spec 层固定),UI 别名按模板可改(Solo=日报 / Academic=组会汇报 / Newsroom=早报会 / Startup=Daily Standup / Consulting=Weekly Digest);**禁用奏折/奏章/军机处等借鉴制度术语**
- **FR-Group-Metrics**:每个群聊对象暴露 `Group.pendingApprovalsCount` / `Group.metrics.{activeRuns, costToday, members}` 字段供 Inbox 列表项徽章 + 预览指标条使用

**信息架构:**

```
  顶层入口
     │
  Inbox(消息列表,按模板筛选)
     │   ├─ 单聊条目 ──→  AgentDM(单聊 + 员工中心合二为一)
     │   └─ 群聊条目 ──→  Chat(群聊)
     │                         │
     │                         └─ 模式切换 ──→  BriefBoard(日报板,别名按模板)
     │
  左窄导航顶部 = 模板切换器(占用原 Logo 位)
```

## Non-Functional Requirements

### Performance

- **P1**:模板编辑器首屏渲染 ≤ **2s**(冷启动)
- **P2**:8 角色 DAG 可视化渲染 ≤ **1s**
- **P3**:单 run 首 token 延迟 ≤ **3s**(冷启动) / ≤ **1.5s**(热启动)
- **P4**:前端看板事件到 UI 渲染延迟 ≤ **500ms**
- **P5**:3 节点并行执行场景下,runtime 不出现状态竞争或消息丢失
- **P6**:0G Storage 上传 / 下载单次操作 ≤ **10s**(正常网络)

### Security

- **S1**:LLM API keys **仅存储于客户端**(MVP:localStorage;Phase 2:系统 keychain),**严禁**上链、存 0G Storage、写 trajectory metadata
- **S2**:上传到 0G Storage 的 trajectory 必须通过 sanitize scan,剔除 PII / 敏感字段
- **S3**:从 0G Storage 下载的 trajectory 必须 Merkle 验证通过才解析,防止篡改
- **S4**:Provider fallback 触发时,prompt 不应被用作 fallback provider 训练数据(选 no-training API tier 或 Ollama 本地)
- **S5**:运行克隆模板时,tool 调用在受限 sandbox 内(MVP:白名单 tools;Phase 2:container / wasm)
- **S6**:Phase 3 INFT 加密元数据保护 prompt(仅在铸造瞬间需要)

### Scalability

- **SC1**:MVP 面向黑客松评委 demo 场景,设计并发目标 **≤ 50 并发 run**(非高并发产品)
- **SC2**:runtime 无状态设计,state 全在 checkpoint store,支持水平扩展(Phase 2+)
- **SC3**:Phase 2+ 如需高并发,消息总线 / lineage 查询引擎可按需下沉 Rust(触发性优化)

### Accessibility

- **A1**:MVP 满足 **WCAG 2.1 AA basic**(键盘导航 + 语义 HTML + 颜色对比度 ≥ 4.5:1)
- **A2**:不做 screen reader 深度适配(Phase 2+ 按需)

### Integration

- **I1**:4 LLM Provider Adapter(Claude / OpenAI / Gemini / Ollama)全部可用,可扩展第 5 provider(0G Compute)
- **I2**:0G Storage `@0glabs/0g-ts-sdk` 前端 TS 版本锁定到 `package.json`
- **I3**:0G Compute 推理调用成功率 ≥ **95%**
- **I4**:Phase 2 Tauri Sidecar 集成契约稳定(Rust `shadowflow_client.rs` + Python HTTP 127.0.0.1)
- **I5**:Phase 2+ Shadow 桌面可暴露 ≥ 20 个 Tauri 命令供 ShadowFlow 调用(知识库 / 图谱投影 / 记忆空间)

### Reliability

- **R1**:任一 MVP 模板支持 ≥ 1 次中断 + resume,状态完整还原,无数据丢失
- **R2**:Provider 所有都失败时,系统不 crash,而是 pause + checkpoint + 等待用户手动决策
- **R3**:Compile validation 失败时,保存操作被非阻塞警告;用户可覆盖,系统记录覆盖事件

## Document History

- **2026-04-15 · v0.1**:Initial PRD created through `bmad-create-prd` workflow,基于 Product Brief v0.2(approved)+ 关联 8 份 research/planning 文档 + 6 份 project docs。关键决策:Lazy Minting + Multi-Mode Marketplace + Solo Company 8 角色 + Academic Paper 模板参考 PaperOrchestra + 首批 3 persona(Solopreneur / 学者 / 内容工作者)
- 后续版本:待 bmad-validate-prd / bmad-create-architecture / bmad-create-epics-and-stories 驱动更新

