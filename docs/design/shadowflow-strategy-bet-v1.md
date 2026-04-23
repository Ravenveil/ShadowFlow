---
title: ShadowFlow 战略下注 v1.0 — Agent Team 的 VSCode
author: Jy（owner）+ Party Mode 圆桌（Winston / Victor / John / Carson / Dr. Quinn / Amelia）
created: 2026-04-20
status: thesis_frozen_pending_execution
supersedes: 记忆中"架构核心决策 v1.0"的战略定位段（补充非替代）
---

# ShadowFlow 战略下注 v1.0 — Agent Team 的 VSCode

## 0. 核心论题（Thesis / 论题）

> **ShadowFlow 要做的是 "Agent Team 的 VSCode"，未来的工作平台。**

这句话不是品牌口号，是**产品形态的决定性选择**。

- **VSCode** 不是最强的编辑器（vim 更快、JetBrains 更智能、Emacs 更灵活），但它赢了，因为它是**最开放、最可扩展、最不对抗生态的"基础设施层"**
- **Agent Team 的 VSCode** 不是又一个 agent 框架（CrewAI 抢过、AutoGen 抢过、Hermes 会抢），而是**让 Hermes / OpenClaw / 自研 agent 都能插进来形成 team 的公共底座**

下面两条下注路径，是对这个论题的具体兑现。

---

## 1. 论证来源（思想脉络）

本文档整合 2026-04-20 Party Mode 圆桌三轮讨论的精华。圆桌参与者（均为 BMAD agent 子进程）：

- 📋 **John**（产品经理）—— L1/L2/L3 问题分层
- 🏗️ **Winston**（架构师）—— 多源 agent 组织形态候选 + Hermes 研发者视角团队化路径
- 🧠 **Carson**（头脑风暴）—— "河流、3 agent 极简、工作 vs 工作流、最烂实践" 四把发散钩子
- ⚡ **Victor**（战略）—— "工作流平台 vs AI 团队搭建平台，留哪个" + 第三态（infrastructure layer）+ "多 vendor 总线"判断
- 🔬 **Dr. Quinn**（问题求解）—— 用 Theory of Constraints（约束理论）把自进化定位为根因，给出三堵墙的 TRIZ（发明问题解决理论）解法
- 💻 **Amelia**（高级开发）—— 两套方案"先死哪" + 半年 MVP 三做三不做

**三轮递进共识**：
1. **Round 1**：问题含糊，三人一致要求澄清 L1（Runtime 编排 / 运行时编排）、L2（AI 员工协作）、L3（团队 Sprint / 冲刺）
2. **Round 2**：用户澄清后，出现真分歧——Winston 推架构候选，Victor 切双定位战略，Dr. Quinn 指根因为自进化
3. **Round 3**：角色扮演（Winston 扮 Hermes 研发者、Victor 扮 Jy）后**罕见形成递进共识**——Hermes 战略上会"故意不补治理和工作流"，**ShadowFlow 正好接这个缺口**

---

## 2. 下注 1 — ACP（Agent Communication Protocol / 智能体通信协议）

### 2.1 ACP 画像

存在两个同名协议，本文档只讨论第一个：

1. **IBM/Linux Foundation ACP**（2025-03 推出）—— REST 原生的智能体间通信协议，IBM Research 主导，Linux Foundation 托管
   - 核心特性：**有状态（Stateful）会话**、多部分消息（multi-part messages / 多模态消息包）、异步流传输
   - 生态：**BeeAI 平台**（IBM 开源智能体发现/运行/共享平台）首采
   - **2025-08 官方合并入 Google A2A 协议**（Agent-to-Agent Protocol / 智能体对智能体协议）
2. **JetBrains/Zed ACP**（Agent Client Protocol / 智能体客户端协议）—— 面向 IDE-agent 的本地通信，与我们无关

### 2.2 ACP vs MCP vs A2A 三协议对比

| 维度 | MCP（Anthropic） | ACP（IBM/LF，并入 A2A） | A2A（Google） |
|---|---|---|---|
| **全称** | Model Context Protocol / 模型上下文协议 | Agent Communication Protocol / 智能体通信协议 | Agent-to-Agent Protocol / 智能体对智能体协议 |
| **核心定位** | Tool-first / 工具优先，模型→资源垂直连接 | Message-first / 消息优先，智能体水平协同 | 分布式智能体自主协作 |
| **通信方式** | JSON-RPC（JavaScript 对象标记-远程过程调用） | REST 原生多部分消息 + 异步流 | Web 原生互联网规模协议 |
| **状态管理** | Stateless / 无状态 | Stateful / 有状态，会话驱动 | 分布式自治状态 |
| **适用场景** | 单 agent 访问工具 / 数据源 | 多 agent 结构化协作 | 云端分布式多 agent 编排 |

**结论**：MCP 管垂直（agent→tool），ACP/A2A 管水平（agent↔agent）。生产系统通常三者并用。

### 2.3 为什么下注 ACP

**VSCode 类比**：**ACP ≈ LSP**（Language Server Protocol / 语言服务器协议）

VSCode 的最大胜利不是编辑器本身，而是**推动并拥抱了 LSP 这个开放协议**——让任何语言的作者都能通过 LSP 把自己的语言接进任何编辑器。LSP 之前，每个 IDE 为每种语言写适配器（N×M 问题）；LSP 之后，每个语言只写一次 server（N+M 问题）。

**ACP 对 agent 生态是同一个数学转换**：
- ACP 之前：每个平台（CrewAI / LangGraph / Dify）为每种 agent 写适配器
- ACP 之后：每个 agent 只写一次 server，接入任何平台

我们已于 2026-04-17 拍板 **Hermes ACP 主 / MCP 辅**（见记忆 `project_hermes_protocol_decision`）。这个决定现在获得战略层面的再确认：**ACP 是 agent 生态的 LSP 时刻**，早下注早卡位。

### 2.4 风险

1. **协议融合不确定性**：ACP 2025-08 已官方并入 A2A，ACP 独立品牌生命周期可能被缩短——**对我们而言不是坏事**，因为我们押的是"**有状态 agent 协作协议这个派系**"，不是某个商标
2. **MCP 势头太猛**：工具优先派系有 Anthropic 背书 + 开发者心智已占。对策：**不对抗**，把 MCP 接进来做工具层，ACP 做协作层
3. **BeeAI 采纳率未知**：如果 BeeAI 生态长不起来，ACP 也会弱。对策：**我们自己就是 ACP 的参考实现之一**（Hermes 是另一个），不靠 BeeAI 吃饭

---

## 3. 下注 2 — 微软舍弃的产品方案精华

### 3.1 整体判断

微软在 agent / workflow 这个赛道**自上而下**试过非常多次（Cortana / Bot Framework / Power Virtual Agents / AutoGen / Semantic Kernel），全部失败或被降级并入 Copilot Studio。**但 VSCode 自下而上赢了**。

这是一个强信号：**top-down（自上而下）的"大一统智能体"必败，bottom-up（自下而上）的"可扩展基础设施"才赢**。ShadowFlow 要做的就是后者。

### 3.2 可借鉴度降序盘点

#### A. Microsoft AutoGen / 智能体编排框架（高度可借鉴）

**原思想**：多 agent **对话驱动协作**（conversation-driven / 对话驱动，而非 DAG 任务驱动）。UserProxyAgent（用户代理）、AssistantAgent（助手）、GroupChatManager（群聊管理器）是核心抽象。

**为什么被舍弃**：2024-09 核心创始人离职，fork 为 AG2（AutoGen 2 的继续维护分支）；Microsoft 把 AutoGen v0.4 转入 **maintenance mode**（维护模式，只修 bug 不加功能），投入做大一统的 **Agent Framework**。本质：AutoGen 没搞定企业级生产特性（状态管理 / 可观测性 / 类型安全）。

**我们借鉴**：
- **对话驱动 vs 任务驱动**：ShadowFlow 四视图里的 Chat 群聊、AgentDM 单聊本来就是对话优先的，这与 AutoGen 思想同源——**强化它，不要退回 DAG**
- **开源社区的反脆弱**：AutoGen 被 fork 反而活得更好——说明**设计思想不死于产品死亡**。我们的开源策略要预留 fork 空间
- **陷阱警告**：AutoGen 没把会话管理、可观测性做到核心，后期被"贴"中间件——我们 **从第一天就把 River 记忆 + Policy Matrix 放核心**

#### B. Microsoft Semantic Kernel / 语义内核（中度可借鉴）

**原思想**：**Plugin（插件）= Function（函数）+ Prompt（提示词）** 的统一接口。Semantic Functions（语义函数，prompt 模板化 LLM 调用）+ Automatic Planning（自动规划器，给目标生成执行计划）。

**为什么被并入**：2024 秋并入统一 Agent Framework。独立生命周期结束。Plugin 版本管理在多智能体场景暴露了问题。

**我们借鉴**：
- **Plugin 即一等公民**：不是"工具附属于 agent"，而是"capability（能力）是独立的、可版本化的、可被多 agent 引用的实体"。**这正是 Agent Plugin Contract 的 FR42 在做的**（四 kind：api / cli / mcp / acp）
- **声明式 > 过程式**：让用户通过 **capability manifest（能力声明单）** 描述 agent 能做什么，而不是写调度代码
- **陷阱警告**：Plugin 的版本协商（version negotiation）必须在架构早期解决——Story 2.8 `AGENT_PLUGIN_CONTRACT.md` 必须包含版本策略

#### C. Microsoft Power Virtual Agents / 低代码聊天机器人（中度可借鉴 + 教训）

**原思想**：让非开发者拖拽构建对话 bot。LUIS（语言理解智能服务）+ Topics（主题分支流程）+ Power Platform 集成。

**为什么被并入 Copilot Studio**：范式转移——从"结构化对话流程设计"到"生成式 LLM 直接理解 + 结构化执行"。PVA 的**拖拽编辑在复杂度上升时成为瓶颈**。

**我们借鉴（主要是反面）**：
- **不要纯拖拽**：ShadowFlow 的工作流编辑必须**能伸能缩**——简单任务拖拽，复杂任务可降级到 YAML / 代码（Skin Pack 换皮哲学同源）
- **不要押某一代 NLU 技术**：预留底层模型可替换接口
- **不要锁定单一生态**：PVA 被 Power Platform 绑架——ShadowFlow 必须是 vendor-neutral（厂商中立）的

#### D. Microsoft Cortana / 小娜跨设备智能助手（反面教材）

**原思想**：跨应用、跨设备的统一智能助手。

**为什么失败**：
- 跨应用协调的"死亡之谷"——每个应用有自己的 API、权限、UI，Cortana 无法优雅贯穿
- 用户心智把它认作"Windows 搜索"而非"助手"
- 长期记忆与多轮推理不足（LLM 出现前无法补救）

**我们借鉴（纯反面）**：
- **不做 Cortana**：跨应用大统一是死路。ShadowFlow 应**聚焦 agent 团队内的深度协作**，不是瞄准"统一所有应用"
- **长期状态是生命线**：Cortana 不是死于 API 不够，是死于"记不住用户"——河流式记忆（River Memory）直接对应这个痛点

#### E. Microsoft Agent Framework 统一重构本身就是"舍弃"信号

**原思想**：放弃 AutoGen/SK/PVA 各自为政，做单一统一编程模型 + 企业生产特性（遥测 / 治理 / 类型安全）。

**我们借鉴**：
- **早做统一架构，晚做框架分裂**：ShadowFlow 核心运行时（Runtime 7+1+1 契约）从第一天就是单一的，这个已经做对了
- **企业特性不是事后补**：Policy Matrix（审批矩阵）+ SSE（Server-Sent Events / 服务器推事件）事件总线 + Checkpoint（检查点）+ River 记忆从 MVP 就在路上，方向正确

---

### 3.3 关键纠正（2026-04-20 v1.1 追加）— 微软亚研院三层架构论文

**用户 Jy 于本文档 v1.0 成稿后追加的决定性校准。触发源**：阅读公众号文章《微软已为 Agent 悄然调转船头》（2025-06-17，AI 修猫 Prompt 出品，本地保存于 `D:\知识库\shadow\优秀微信公众号文章集锦\微软已为Agent悄然调转船头.md`）。该文章介绍微软亚研院 2025 年 6 月的万字论文。

#### "舍弃"的双重含义

- **v1.0 的理解（不完整）**："微软舍弃的产品方案" = 被微软降级或砍掉的**过去产品**（AutoGen / PVA / Cortana / Bot Framework）
- **v1.1 补完**：还有**第二重含义**——**微软亚研院论文里主动主张舍弃的三条错误路线**：
  1. **通用 Agent 幻想**（General-Purpose Agent / 万能智能体）
  2. **能力竞争路线**（"我的 Agent 比你强"的单点比拼）
  3. **孤岛工具做法**（每个 AI 产品独立运行、数据不互通）

微软主张转向**三层协作架构**——但微软自己**没有决心或能力落地**（还在 Copilot Studio 里继续卖单点产品）。**我们押的是微软亲手否定旧路线后主张的新愿景，由我们落地。**

#### 微软三层架构 → ShadowFlow 吻合度映射（惊人）

| 微软论文层 | 内部模块 | ShadowFlow 对应 | 状态 |
| --- | --- | --- | --- |
| **过程层**（Process Layer / 协作大脑与记忆） | 问题空间 + 工作流程 + 操作模块 + 环境空间 + 反思模块 | Runtime 7+1+1 契约 + River Memory（河流记忆）+ Policy Matrix（审批矩阵）+ Checkpoint（检查点） | ✅ 已落地或在路上 |
| **交互层**（Interaction Layer / 同一状态多视图渲染） | 聊天 / 工作流图 / 看板 / 时间线可切换 | 四视图（Inbox / Chat / AgentDM / BriefBoard） | 🔶 Pencil 稿有方向 |
| **基础设施层**（Infrastructure Layer / 模型工具协议） | 个性化 + 基础能力 + 协调机制（含 MCP） | Skin Pack 换皮 + Agent Plugin Contract 四 kind（api/cli/mcp/acp）+ ACP 主协议 | 🔶 MVP 中 |
| **结构适应性**（Structural Adaptivity / 协作方式本身可被动态调整） | 任务变复杂加检查点、用户专业时减少 AI 参与、流程有问题时重组步骤 | ActivationBandit（激活多臂老虎机）+ Workflow Token Transformer（工作流元 Transformer） | 🔶 Phase 3 Step 1 已落地 |

**结论**：这不是巧合。这是论文 PDF 被你用代码实现了一半。

#### 核心论题升级（§0 增补）

原 §0 在 v1.0 里说的是 "Agent Team 的 VSCode"。v1.1 追加一条**学术 / 技术坐标**：

> ShadowFlow 同时是：
>
> 1. **形态**：Agent Team 的 VSCode（产品形态）
> 2. **赌点**：ACP 协议派系 + 微软亲手否定的老路线（战略赌注）
> 3. **位置**：**微软亚研院三层协作架构论文的首个真实落地**（学术坐标）

第 3 条现在是**这份文档里最强的一句 positioning**——比"Agent Team 的 VSCode"还强，因为它给学术论文提供了可辩护的主张（defensible claim）。

#### 待办（v1.2 需补完）

- 找到微软亚研院论文的原文标题与 arxiv 链接（公众号文章未给出）
- 核对论文原文的"过程层"五模块定义，与 ShadowFlow 的 Runtime 7+1+1 精确对位
- 评估微软是否在论文里提到 ACP / A2A / BeeAI——如果提了，我们的下注 1（ACP）与下注 2（三层架构）有共同理论基础

---

## 4. VSCode 类比的深度映射

| VSCode | ShadowFlow 对应 | 状态 |
|---|---|---|
| **Electron / Monaco（编辑器内核）** | Runtime 7+1+1 契约 + Workflow Assembly 编译链 | ✅ 已冻结 |
| **LSP（Language Server Protocol / 语言服务器协议）** | ACP（Agent Communication Protocol / 智能体通信协议） | ✅ 已押注（Hermes ACP 主） |
| **Extensions Marketplace（扩展市场）** | AgentRegistry（智能体注册表）+ Agent Plugin Contract 四 kind | 🔶 MVP 中（Story 2.3 / 2.8 / 2.9） |
| **Settings（设置）+ Workspace（工作区）** | Skin Pack（换皮包）+ 四视图（Inbox/Chat/AgentDM/BriefBoard） | 🔶 Pencil 稿有方向，v5 Skin Slot 契约中 |
| **Activity Bar / Side Panel（活动栏 / 侧栏）** | 四视图的空间布局 | 🔶 待落地 |
| **Themes（主题）** | Skin Pack 的 7 slot YAML | 🔶 v5 契约中 |
| **Tasks（任务）+ Debug（调试）** | Policy Matrix（审批矩阵）+ Checkpoint rollback（回滚） | ✅ MVP 已涵盖 |
| **Git Integration（Git 集成）** | River Memory（河流记忆：主流 / 支流 / 同步点 / 沉淀 / 水闸 / 自净化） | 🔶 Story 1.6 前置 |
| **Remote Development（远程开发）** | 0G 生态（Storage / Compute / Chain）去中心化部署 | 🔶 已在做 |
| **Copilot / IntelliSense（智能提示）** | ActivationBandit（激活多臂老虎机学习器）+ Workflow Token Transformer（工作流元 Transformer） | 🔶 Phase 3 Step 1 已落地；Token Transformer 为 12-18 月目标 |
| **Extension API（扩展 API）** | SDK + "前端交给用户"哲学（Skin Pack 用户可 code 描述 UI） | 🔶 哲学定了，SDK 待做 |

**关键洞察**：VSCode 之所以能打败 Atom（轻量版）、取代 Sublime（收费版）、压制 JetBrains（重型版），是因为它**选择了"薄核心 + 厚扩展"的形态**。ShadowFlow 的 Runtime 7+1+1 契约 + ACP 接入 + Plugin Contract 就是同一形态的智能体版本。

---

## 5. 半年 MVP 做 / 不做清单（Amelia 交叉检查产出）

### 必做（三件）

1. **Policy Matrix ACP 边界插桩** —— `shadowflow/runtime/` 的 Policy Matrix 落地 ACP Client 插桩点（Story 2.3 已有 hook 点，补齐）
2. **River Memory 底座** —— Story 1.6 前置（`shadowflow/runtime/river/`）
3. **Hermes 接入 1 个外部 agent** —— Story 2.3 ACP Client + Story 2.9 ExternalMemoryBridge（外部记忆桥）收口

### 必不做（三件）

1. **不碰 Hermes 内部改造** —— 任何 fork / patch upstream（上游打补丁）的想法都否决。Hermes 战略上会"**故意不补治理和工作流**"（Winston 扮 Hermes 研发者视角的结论），这正是我们要接的缺口
2. **不上 Workflow Token Transformer**（工作流元 Transformer）—— 推理延迟（RTX 5060 + Gemma 2B + LoRA ≈ 秒级）不满足同步调用。**旁路异步 pre-compute 也不做**，延到 12 个月后
3. **不要求用户主动标注 bandit 反馈** —— 工业界 RLHF（Reinforcement Learning from Human Feedback / 基于人类反馈的强化学习）标注成本高。**改自动信号（任务成功率）或下线 Phase 3 对外承诺**

### 宣传语修正（Amelia 点到的真相）

- ❌ 原："统一 agent 基础设施"（夸大——Policy Matrix 拦不住 agent 内部 LLM 调用）
- ✅ 新："**Agent 边界治理层**" + "**Agent Team 的 VSCode**"

---

## 6. 赌点与风险地图

### 核心赌点（必须承认是赌点，不是定论）

> 当 agent 数量 ≥ 3、项目数量 ≥ 5 时，
> n8n 的静态编排会崩，
> Hermes 单 vendor（单厂商）的记忆会爆炸，
> **那一刻"统一治理"从 nice-to-have（加分项）变成 must-have（必需品）**。

如果这个赌点错了——即用户永远只用 1-2 个 agent，或 Hermes 的团队化比预期快——我们的护城河变薄。对冲策略：**把 ACP 接入 / River 记忆 / Policy Matrix 做得足够独立**，即使战略调整，这三块仍有单独价值。

### 风险矩阵（Amelia 指出的真撞墙点）

| 风险 | 影响 | 对策 |
|---|---|---|
| Policy Matrix 对 agent 内部 LLM 调用拦不住（假治理风险） | 高 | 宣传语精确化：治理**边界**，不治理**内心** |
| ActivationBandit 用户标注稀疏，bandit 收敛不了 | 中 | 改自动反馈信号（任务成功率 / 完成时间） |
| Token Transformer 延迟 | 低（延后了）| 异步旁路，12 个月外再做 |
| Hermes upstream 节奏不可控 | 中 | 我们只做 ACP client，不改 Hermes |
| ACP 被 A2A 合并后品牌消退 | 低 | 我们押的是"派系"不是商标 |

---

## 7. 未解决问题（交给后续讨论）

1. **Dr. Quinn 指出的三堵墙**的具体落地（ Policy Matrix 对 agent diff 的准入审查 / Evolution Tributary 进化支流 / Checkpoint 双轨 + 水闸版本闸门）—— 需要单独的设计文档
2. **多视图的空间布局**（Inbox / Chat / AgentDM / BriefBoard）在 VSCode 类比下的活动栏设计 —— 需要 Sally（UX）和 Pencil 稿衔接
3. **SDK / Extension API 的具体接口形态** —— 需要 Amelia 产出 spec
4. **开源 vs 商业化**的边界划定（哪些代码开源 / 哪些服务收费）—— 需要商业视角评估

---

## 8. 术语表（中英对照）

| 英文 | 中文 | 解释 |
|---|---|---|
| ACP | Agent Communication Protocol / 智能体通信协议 | IBM/LF 推出的有状态 agent 协作协议，2025-08 并入 A2A |
| A2A | Agent-to-Agent Protocol / 智能体对智能体协议 | Google 主导的分布式 agent 自主协作协议 |
| MCP | Model Context Protocol / 模型上下文协议 | Anthropic 推出的 tool-first 协议，无状态工具优先 |
| LSP | Language Server Protocol / 语言服务器协议 | VSCode 推动的语言服务开放协议——ACP 的类比对象 |
| DAG | Directed Acyclic Graph / 有向无环图 | 传统工作流表达结构 |
| SSE | Server-Sent Events / 服务器推送事件 | ShadowFlow 的事件总线协议（非 WebSocket） |
| BYOK | Bring Your Own Key / 自带密钥 | 用户密钥不出前端的安全模式 |
| RLHF | Reinforcement Learning from Human Feedback / 基于人类反馈的强化学习 | 用户标注信号做模型优化 |
| Stateful / Stateless | 有状态 / 无状态 | 协议是否在通信之间保留会话上下文 |
| Top-down / Bottom-up | 自上而下 / 自下而上 | 产品设计哲学——前者是 Cortana 式大统一，后者是 VSCode 式扩展生态 |
| Maintenance Mode | 维护模式 | 产品只修 bug 不加功能的生命周期阶段 |
| Plugin / Extension | 插件 / 扩展 | 可注入宿主系统的独立组件 |
| Marketplace | 市场 / 生态商店 | 扩展的分发与发现机制 |
| River Memory | 河流记忆 | ShadowFlow 的记忆系统隐喻（主流 / 支流 / 同步点 / 沉淀 / 水闸 / 自净化） |
| Policy Matrix | 审批矩阵 | ShadowFlow MVP 第 8 个契约对象，做"真驳回"语义 |
| Capability Manifest | 能力声明单 | Agent 向平台声明"我能做什么"的 YAML/JSON |
| Activation Bandit | 激活多臂老虎机 | ShadowFlow Phase 3 的 agent 组合学习器 |
| Workflow Token Transformer | 工作流元 Transformer | 把 workflow 模板化 tokenize 后 Transformer 自回归生成的机制，对标 Decision Transformer (NeurIPS 2021) |
| Fork | 分叉 | 开源项目被社区独立分支出去继续维护 |
| Upstream | 上游 | 原始项目仓库——相对于 fork（下游）的概念 |

---

## 9. 文档历史

- **2026-04-20 · v1.0** · 首版。来源：Party Mode 圆桌三轮（John/Winston/Carson/Victor/Dr. Quinn/Amelia）+ ACP + 微软弃案调研。核心新增："**Agent Team 的 VSCode**" 论题由用户 Jy 在第四轮提出，一举锁定产品形态。
- **2026-04-20 · v1.1** · 追加 §3.3 关键纠正。触发源：阅读《微软已为 Agent 悄然调转船头》公众号文章（介绍微软亚研院 2025-06 三层协作架构论文）。纠正"舍弃"的双重含义，补完三层架构到 ShadowFlow 的吻合度映射表，把核心论题 §0 升级为三坐标（形态 / 赌点 / 学术位置），新增"微软论文首个真实落地"作为最强 positioning。
