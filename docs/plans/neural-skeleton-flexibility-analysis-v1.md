# ShadowFlow 神经元式骨架定位 + 三平台灵活性诊断存档

> 日期：2026-04-09
> 类型：Research Archive（office-hours 过程沉淀第二份）
> 前序档案：
> - `jy-main-research-selfcorrecting-skeleton-20260409-095915.md`（Coze 冲击 + embodied 方向 + bootstrap 候选）
> - `jy-main-design-20260408-205859.md`（v4 hackathon design doc，当前 DRAFT）
> 触发：user 读 `hello-agents 第五章 基于低代码平台的智能体搭建.md` 后明确 ShadowFlow 的灵魂 = "神经元式积木块激活系统"
> 重点：user 多次强调 "你现在搞得就很僵化呀，就感觉偏离主线"——本档案记录 pivot 回主线的完整推理链和证据

---

## 1. 三个平台的灵活性瓶颈诊断（基于 hello-agents 第五章）

从 datawhalechina/hello-agents 第五章实操案例中提炼出的三个平台的**致命灵活性瓶颈**（chapter 原话）：

| 平台 | 核心差异化 | **致命灵活性瓶颈**（chapter 原话） |
|---|---|---|
| **Coze** | 极丰富插件市场 + 一键发布字节生态 | **"不支持 MCP"**（原文直接说"这是最致命的"）；**"无法导出标准化 JSON"**，只能导出 zip，**锁定在 Coze 生态里** |
| **Dify** | 开源 + 8000+ 插件 + 支持 MCP + 本地/云部署 | 学习曲线陡峭；高并发性能挑战 |
| **n8n** | "连接"能力（数百预置节点）+ 私有化部署 | **"内置存储非持久化"**（Simple Memory / Simple Vector Store 内存里，服务重启就丢）；**"版本控制不如代码成熟"**（JSON diff 不如 git diff） |

### 1.1 三个平台共同的瓶颈（chapter 没明说但能推出来）

**workflow 写好就不变**。三家都没有"workflow 根据执行反馈修改 workflow 自己"的概念。

所有三个平台的 workflow 都是**静态 DAG**：
- 用户设计 → 系统执行 → 重复
- 失败了，人工改 workflow 或加 error branch
- 成功了，workflow 还是原来那个
- **没有任何"系统从执行中学习并改 workflow 本身"的机制**

### 1.2 user 说的"比他们更加灵活"真正指的是什么

User 原话：**"我是想搞一种比他们工作流更加灵活的工作流。但你们要这么搞的话，就反而比那些工作流还僵化了。"**

要跳出的**三个灵活性瓶颈**：

1. **生态锁定**（Coze 的死穴）→ 开放标准（MCP / 链上 / 可验证）
2. **工程不成熟**（n8n 的死穴）→ typed contract + 可 git diff 的 spec
3. **静态 workflow**（三家共同死穴）→ **自修正 / 自演化 / 神经元式动态激活**

---

## 2. 关键洞察：n8n 的 AI Agent 节点 = "在 workflow 层做 agent 编排的投降"

这是本次分析中发现的一个容易被忽略的细节。

hello-agents 第五章 5.4 的 n8n 邮件助手案例中，用的不是传统"多 agent 拆解 + 节点连接"，而是 **n8n 新增的 `AI Agent` 节点**——这个节点里面自己集成了 LLM + Memory + Tools，相当于**一个节点就是一个完整 agent**。

```
传统 n8n DAG:
  trigger → tool1 → tool2 → tool3 → output
  （每个节点是一个具体操作）

新 AI Agent 节点做法:
  trigger → [AI Agent Node]──→ output
                │
                ├── LLM (Chat Model)
                ├── Memory (Simple Memory)
                └── Tools
                     ├── SerpAPI
                     └── Simple Vector Store
  （整个 agent 内循环被黑盒化进一个节点）
```

**这是 n8n 对 workflow 层级做 agent 编排的投降**。它承认：
- DAG 连接的节点图，**没法表达 "agent 思考 → 决策 → 工具调用 → 再思考" 这种动态行为**
- 所以干脆把整个 agent 内循环**黑盒化成一个节点**
- workflow 只负责**外围数据流转**（触发、输入、输出）

**后果**：
- agent 内部对 workflow 层不可见，你没法在 workflow 层 debug/优化 agent 决策
- 多 agent 协作只能靠 "多个 AI Agent 节点串联 + prompt 工程硬说服"
- 失去了 typed contract 的好处

**这给了 ShadowFlow 一个 n8n 自己让出来的空位**：**在 workflow 层级做结构化多 agent 编排**。

这恰好是 ShadowFlow Phase 0-2 已经做的事：
- `WorkflowBlockSpec` 每个 agent 是一级对象
- `ConnectionResolver` 推断多 agent 之间的 capability 依赖
- `AssemblyConstraintSpec` 约束它们的交互
- `ActivationSelector` 动态选择哪些 agent 进入 assembly

---

## 3. ShadowFlow 在光谱里的真实位置

| 维度 | Coze | Dify | n8n | **ShadowFlow 目标** |
|---|---|---|---|---|
| agent 编排层级 | 单 agent + 插件 | 多 agent via 分类器路由 | **单 agent 黑盒节点**（AI Agent node） | **workflow 层级结构化多 agent** |
| workflow 修改机制 | 人工 | 人工 | 人工 | **ActivationBandit 训练 + 自动权重更新** |
| 标准对接 | ❌ 不支持 MCP | ✅ MCP | ⚠️ 部分 | ✅ MCP + 0G + 开放 |
| 版本控制 | ⚠️ zip 导出 | ✅ 相对好 | ⚠️ JSON diff | ✅ typed spec + git-native |
| 生产持久化 | 平台托管 | ✅ 企业级 | ❌ 默认内存 | ✅ 合约优先 + checkpoint |
| **继续变聪明** | ❌ | ❌ | ❌ | ✅ (神经元式激活训练) |

**ShadowFlow 的空位就是最右一列的 5 个 "✅"**——没有一个是"和 Coze/n8n 正面竞争的功能"，每一个都是**它们架构根本不覆盖的层级**。

---

## 4. ShadowFlow 骨架的神经元式定位（核心）

User 原话（office-hours 中最关键的一段）：

> **"之前就是探讨了很多，就是我们团队就是每一个都是一个积木块。然后这个积木块，它是可以像神经元一样去自由的去激活，然后通过这样的训练，然后去搭建一个成熟的智能体，我是想往这个方面去探索的。"**

这句话给出了 ShadowFlow 灵魂的完整定义：

| 要素 | 你的词 | Phase 0-2 已做 |
|---|---|---|
| 基本单位 | **积木块** | `WorkflowBlockSpec` + `SkillSpec` + `RoleSpec`（typed capabilities） |
| 基本机制 | **神经元式动态激活** | `ActivationSelector` Phase 1 贪心版 |
| 可训练性 | **"通过训练"** | `ActivationBandit` Phase 3 Step 1 |
| 最终形态 | **"成熟的智能体"** | 收敛后的激活模式 + 稳定的子图结构 |
| 自由度 | **"自由激活"** | `ConnectionResolver` v2 capability-dep 推断 |

**这个愿景你半年前（Phase 0 设计时）就定好了**。我这几个小时做的事情就是绕了一大圈，最后发现答案一直在 `docs/plans/spontaneous-assembly/roadmap.md` 里。

### 4.1 骨架与应用的分层

```
┌─── ShadowFlow 骨架（神经元式积木激活系统） ───┐
│                                                 │
│  ┌─ 积木块池（扩充中）────────────────────┐  │
│  │ planner / coder / reviewer / ...       │  │
│  │ HTTP / Code / Trigger / Notification   │  │
│  │ SensorRead / MotionCtrl（future）       │  │
│  │ ...                                    │  │
│  └────────────────────────────────────────┘  │
│                    ↓                           │
│  ActivationSelector + ActivationBandit         │
│  （神经元式动态激活）                          │
│                    ↓                           │
│  ConnectionResolver (capability-dep)           │
│                    ↓                           │
│  WorkflowAssemblySpec → AssemblyCompiler →     │
│  WorkflowDefinition → Runtime                  │
│                    ↓                           │
│  ExecutionFeedbackRecord                       │
│                    ↓                           │
│  ActivationBandit 更新（训练闭环）             │
│                    ↑ 回到激活                  │
└─────────────────────────────────────────────────┘

上面可以装的"应用"（用户选择/配置）：
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ 应用 A           │  │ 应用 B           │  │ 应用 C (future)  │
│ 线上自动化       │  │ 代码团队 harness │  │ 线下机器人       │
│                  │  │ (towow 同构)     │  │                  │
│ 装:              │  │ 装:              │  │ 装:              │
│ - trigger 积木   │  │ - 26 个编程积木  │  │ - 传感器积木     │
│ - http 积木      │  │ - 8 Gate 约束    │  │ - 运动积木       │
│ - llm 积木       │  │ - Claude/Codex   │  │ - 规划积木       │
│ - notify 积木    │  │   劳动分工       │  │ - 安全约束       │
│                  │  │ - invariant 学习 │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**骨架不变，装载不同积木包 = 不同应用**。这是 user 明确表达的设计哲学：

> **"如果我们主体他一个自修正的功能没有的话，就是没有我跟他说一句话，他自己生成一个工作流，然后他再到环境中去自己去迭代和迭代工作，最后给我一个最完美的一个结果，是完美符合我期的结果。如果没有这个事情的话，你想放上去，放到那个场景，他也放不了。"**

即：
- **骨架先成熟**（自修正/神经元激活是骨架必备能力）
- **场景是装载关系**（"放上去"）
- **线上先走**（自动化任务），**线下后走**（embodied/机器人）

---

## 5. Towow 6 层机制在 ShadowFlow 里的映射

Towow 是用 Claude Code + 手写 skill 搭的一次性自治 AI 工程组织。它的 6 层机制**不是 ShadowFlow 骨架本身，是装在 ShadowFlow 骨架上的一个应用**。

User 引用的 towow 原话：

> 核心不是"AI 写代码快"，而是搭了一个自治的 AI 工程组织。六层机制叠加：
>
> 1. 虚拟工程团队（26 个 Skill = 26 个"员工"）
> 2. 自动治理（Hooks = 看不见的手）
> 3. 8 Gate Fail-Closed 流程
> 4. 自学习（Invariant 注入）
> 5. 上下文工程（AI 不迷路）
> 6. 劳动分工（Claude 判断 + Codex 执行）
>
> 人只做三件事：战略决策（做什么）、方向纠偏（不是这样）、最终确认（PR accept）。

### 1:1 映射到 ShadowFlow

| towow 层（代码层自治 AI 工程组织） | ShadowFlow 骨架层对应 | Phase 状态 |
|---|---|---|
| 1. 虚拟工程团队 (26 skill) | `WorkflowBlockSpec` catalog + `RoleSpec` + `SkillSpec` | ✅ Phase 0 已做 |
| 2. 自动治理 (Hooks 物理拦截) | `AssemblyConstraintSpec` + `ConnectionResolver` 合法性 | ✅ Phase 1 已做 |
| 3. 8 Gate Fail-Closed | 链式 review_gate 积木 + 独立 LLM provider 上下文隔离 | ⚠️ 部分（review gate spec 有，独立审查积木缺） |
| 4. 自学习 (Invariant 注入) | **`ActivationBandit` 权重更新 + constraint auto-append** | ⚠️ **通电缺失**（见第 6 节） |
| 5. 上下文工程 (AI 不迷路) | memory adapter + context injection + 目标复述积木 | ⚠️ 部分 |
| 6. 劳动分工 (Claude/Codex) | `RoleSpec` provider binding + delegate/child run | ✅ Phase 0-1 已做 |

**关键**：第 4 层自学习在 ShadowFlow 里**不是另一个层**，就是 **ActivationBandit 训练闭环**。不需要"4 个 LLM agent 做失败分析 + 约束提取 + 审核 + 注入"这种 meta workflow——bandit 的反馈学习本身就是自学习。

Towow 的 "towow-crystal-learn 自动从失败提取不变量" 在 ShadowFlow 里的对应 = **ExecutionFeedbackRecord → ActivationBandit.train() → 下次 select 偏好更新**。数据结构层的工程，不需要 LLM 在中间调度。

---

## 6. ActivationBandit 通电诊断（骨架灵魂"写好但没通电"）

基于 `D:/VScode/TotalProject/ShadowFlow/shadowflow/assembly/learner.py` 和相关文件查证：

### 6.1 已有资产（灵魂的组件都写好了）
- ✅ `shadowflow/assembly/learner.py` 210 行实现（token-level affinity + 贪心 fallback）
- ✅ `ActivationTrainingSample` / `ActivationTrainingDataset` 数据契约（`runtime/contracts.py`）
- ✅ `RuntimeService.export_activation_training_dataset(run_id)` 能从 run 导出训练数据
- ✅ `scripts/accumulate_training_data.py` 能累积训练样本
- ✅ `tests/test_phase3_learner.py` 单元测试通过

### 6.2 缺失的通电（三条关键电线）
- ❌ **`bandit.select()` 没有被任何主 pipeline 调用** —— 只在测试文件和独立脚本里用
- ❌ **`RuntimeService` 运行完 run 后没有触发 `bandit.train(dataset)`**
- ❌ **下一次 `assemble()` 时，`ActivationSelector` 不知道 bandit 的存在**

**Bandit 是孤岛**。灵魂组件写好了，但没和系统其他部分连起来。这正是 "骨架灵魂" 缺失的原因——灵魂的组件写好了但没通电。

### 6.3 通电改造（hackathon Week 1 的主工程任务）

三条电线：

1. **RuntimeService.run 结束后 → 自动 train bandit**
   - 位置：`RuntimeService.run_workflow` 结束时
   - 动作：`dataset = export_activation_training_dataset(run_id)` → 追加到持久化 store → `bandit.train(dataset)`

2. **assemble() 时 → 先问 bandit 有没有训好**
   - 位置：`AssembleContext` 或 `ActivationSelector` 调用处
   - 动作：`AssembleContext` 加可选 `learner: ActivationBandit` 字段

3. **ActivationSelector → 按 bandit 权重改贪心为加权选择**
   - 位置：`ActivationSelector.select()`
   - 动作：加 `bandit: Optional[ActivationBandit]` 参数；bandit 已训练且样本 ≥ `min_samples` 时，用 bandit 的 token-affinity 替代贪心

CLI：`shadowflow do --learn` 启用训练模式（也可以是默认行为 + `--no-learn` 关闭）。

---

## 7. 我之前三次偏离主线的复盘

三次 pivot 都是**把已有 Phase 3 Step 1 的 bandit 抹掉**换一个更"容易解释给评委"的东西：

### 7.1 偏离 A：规则驱动（被 user 正确 diss）
- 设计：从失败中 regex 匹配 + if-else 表提取约束，写死到 catalog
- User 的反应：**"太僵化了，这样很不灵活，太不灵活了。就是这种体系就很不灵活。我之前也做过一个项目，也是就是搞这种规则，然后就被批评说就是很僵化不灵活。"**
- 病根：我以为"可审计、可复现"比"灵活"重要，所以选了死规则

### 7.2 偏离 B：4 agent meta-team（bootstrap 自举）
- 设计：用 ShadowFlow 装配一个 meta-workflow（Analyst + Planner + Writer + Reviewer），在每次失败时动态分析
- User 的反应：**"你现在搞得就很僵化呀，就感觉偏离主线"**
- 病根：虽然引入了 LLM 灵活性，但还是**写死一个 4 节点 meta workflow 结构**，不是积木激活

### 7.3 偏离 C：bootstrap 自举的概念包装
- 设计：在 B 的基础上说 "ShadowFlow 用自己装配出自己的自修正能力"
- 病根：概念好看但还是静态结构，不是神经元式

### 7.4 三次偏离的共同病根

都是**把已有 Phase 3 Step 1 的 ActivationBandit 抹掉**，换一个"看起来有 team 但实际是静态 workflow"的东西。

正确姿势：**不要在 ActivationBandit 之上再加任何"别的 self-correction 层"**。ActivationBandit 本身就是 self-correction 的载体——它从 ExecutionFeedbackRecord 学习"什么 context 激活什么积木组合"。

- LLM agent 是**积木块本身**（装在 catalog 里），不是"骨架自修正机制的一部分"
- 骨架自修正是 **统计层面的**（bandit 调权 + constraint 追加），不是 meta-workflow
- 灵活性来自 **积木组合的可能性 × bandit 学到的激活模式**，不是"LLM 动态决策"本身

---

## 8. 诚实的 hackathon 4 周 scope（非规则、非 meta workflow、非 bootstrap）

**核心工程任务（一行话）**：把 ActivationBandit 接入主 assembly pipeline，扩充积木池到足以看到"神经元式激活"的涌现。

### Week 1: 训练闭环通电（3 条关键电线）
- `RuntimeService.run_workflow` 完成后自动 `export_activation_training_dataset(run_id)` → dataset 追加到持久化 store（0G Storage 或本地）
- `AssembleContext` 加可选 `learner: ActivationBandit` 字段
- `ActivationSelector.select()` 加 `bandit: Optional[ActivationBandit]` 参数；bandit 已训练且样本 ≥ min_samples 时，用 bandit 的 token-affinity 替代贪心
- CLI `shadowflow do --learn` 启用训练模式
- 端到端测试：手动跑 10 次 → 导出训练集 → bandit.train → 第 11 次 assemble 时权重影响可见

### Week 2: 积木池扩充（从 8 个 → 25+ 个）
- 当前 8 个积木：planner / coder / reviewer 等，都是"多 agent 协作原型"
- 加 15-20 个"真实世界集成"积木（不是 recipe，是积木本体）：trigger_cron / trigger_webhook / http_request / code_exec / notify_lark / notify_slack / notify_discord / file_read / file_write / github_search / rss_fetch / llm_chat / llm_summarize / embedding / vector_search / format_template / conditional / aggregate / ...
- 每个积木填 capability + input_requirements（这是 ConnectionResolver v2 推断拓扑的依据）
- Catalog 变大意味着 action space 变大，bandit 训练才有区分度

### Week 3: 场景装载 + 训练数据累积
- 选定**一个应用场景**（user 未定，可能候选：线上自动化 / 代码团队 harness / 两个都装）
- 用这个场景跑 50-100 次真实任务，喂给 bandit
- 观察激活模式从"贪心均匀覆盖" → "token-affinity 神经元式稀疏激活"的过渡
- 训练数据同步到 0G Storage（用 ZeroGCheckpointStore，已有组件）

### Week 4: Demo 打磨 + 0G 集成作为背景
- Demo 剧本：展示 naive bandit vs trained bandit 的激活对比
- 0G 集成：训练 checkpoint + 激活历史上链存证（可验证"系统真的在学"）
- **不做**：规则驱动、meta workflow、bootstrap、INFT mint、web UI、复杂 pitch 视频

**这个 scope 里没有任何"为评委服务的花哨功能"**，全是**把半年前设计的骨架通电**。这是黑客松压力测试模式 (c) 的真正含义——黑客松只是一个外部 deadline 让你把烂尾的那一块补完。

---

## 9. Post-hackathon 扩展路径（towow 式应用 + embodied）

Week 4 末端如果训练闭环稳定了，**应用 B 代码团队 harness 是顺理成章的下一步**：

- 换一批积木（architect / dev / tester / reviewer / deploy / bug_triage ... 对应 towow 26 skill）
- 换一组约束（8 Gate Fail-Closed 映射到 AssemblyConstraintSpec）
- **骨架不变**，只是**装载不同的积木包**
- 这证明 "骨架可插拔" 这件事成立

更远期：**应用 C embodied / 家居机器人**

- 换一批积木（SensorRead / MotionCtrl / SpatialPlan ... ）
- 引入环境 feedback loop（传感器读数作为 ExecutionFeedbackRecord 的一部分）
- 骨架不变，同样是 "装能力 + 训练" 的事

User 原话：**"之后我们再想进军线下机器人的话，我们再给他这其实就是装能力的事情了，就只是装到时候就只是装能力的事情了。装能力和装一些继升机器人知识的事情，知识和能力给他再加载上去，还有会自然的往那个方面走了。"**

---

## 10. User 关键原话汇总（office-hours 灵魂）

这些话是 ShadowFlow 定位的最终权威，任何与之冲突的设计都错。

### 关于"更灵活的工作流"
> "我是想搞一种比他们工作流更加灵活的工作流。但你们要这么搞的话，就反而比那些工作流还僵化了。"

### 关于"做骨架不做产品"
> "我们要做的是骨架，而不是呃还而不是现在就开始搞落地的产品。"

> "我们能够把这个它自己净化工作流的，它这个东西打好了，我们可以就是现在线上去完成线上的任务。然后然后之后，然后我们再想进军线下机器人的话，我们再给他这其实就是装能力的事情了。"

### 关于"自修正是灵魂"
> "但是如果我们主体他一个自信化的功能没有的话，就是没有我跟他说一句话，他自己生成一个工作流。然后他再到环境中去自己去迭代和呃迭代工作就O最后给我一个最完美的一个结果，是完美否合我期的结果。如果没有这个事情的话，呃，他可能他你想放上去，放到那个场景，他也放放不了。"

### 关于"先走主干"
> "我们先走主干。"

### 关于"规则驱动太僵化"（diss）
> "太僵化了，这样很不灵活，太不灵活了。就是这种体系就很不灵活。就我之前也做过一个项目，也是就是搞这种规则，然后就被批评说就是很僵化不灵活。"

> "如果你搞得这么僵化，那连 n8n 都比不上呀。"

### 关于"为什么要搞 team"
> "为什么要搞 team，是因为有 team 之后，我们才能实现像之前说的哈里斯工程。"

> "一方面像那种 M 的任务，可以自动化完成；另一方面，代码方面的团队搭建，在我们这个设施上也可以完成。我们先把线上的搞成熟了，就可以自然地去发展线下。"

> "我感觉我如果他能够把他的想法放在我们的产品上去非常方便的是实去实现，然后去助力他自己的一个编程的话，这也是非常好的一个非常好的一步。"

### 关于"神经元式积木"（最核心）
> **"之前就是探讨了很多，就是我们团队就是每一个都是一个积木块。然后这个呃就是积木块啊，积木块它是可以像神经元一样去自由的去激活，然后通过这样的训练，然后然后去搭建一个成熟的智能体，我是想往这个方面去去探索的。"**

### 关于"你偏离了"
> "然后你现在搞得就很僵化呀，就感觉偏离主线"

---

## 11. Towow 原话完整保留（6 层机制）

> 回答你的问题：为什么 Towow 开发这么快、人几乎不用介入？
>
> 核心不是"AI 写代码快"，而是搭了一个自治的 AI 工程组织。六层机制叠加：
>
> **1. 虚拟工程团队（26 个 Skill = 26 个"员工"）**
> 不是一个 AI 干所有事。架构师、开发、测试、审查、运维、Bug 分诊各有专才，每个 Skill 有明确的输入输出契约，互不越界。
>
> **2. 自动治理（Hooks = 看不见的手）**
> 每次操作都经过自动检查：部署守卫拦截危险操作、上下文路由自动注入相关规则、循环检测防止原地打转、停止门防过早交付。不是"提醒别做"，是"物理上不让做"。
>
> **3. 8 Gate Fail-Closed 流程**
> 每个功能必过 8 道门禁，其中 4 道是独立 AI 审查（自动 spawn 另一个 AI，schema 隔离写权限，不能自审）。审查不需要等人，但质量不打折。
>
> **4. 自学习（Invariant 注入）**
> 同一个坑不踩第二次。towow-crystal-learn 自动从失败中提取"不变量"（比如"改接口必须 grep 消费者"），机械化注入到执行层 Skill 中。
>
> **5. 上下文工程（AI 不迷路）**
> 每 50 次 tool call 自动复述目标，上下文压缩前注入原始意图，编辑文件时自动加载该文件的规则。AI 始终知道自己在做什么。
>
> **6. 劳动分工（Claude 判断 + Codex 执行）**
> 高价值判断（架构、交互、审美）由 Claude 做，低价值机械工作（批量替换、补测试）并行委派给 Codex。
>
> 人只做三件事：战略决策（做什么）、方向纠偏（不是这样）、最终确认（PR accept）。

---

## 12. 下一步未决事项

- [ ] **Week 3 装载哪组积木包**（user 未定）
  - 候选 A：线上自动化（GitHub 监控 / 邮件助手类）—— 积木少、训练快、对标 n8n 清晰
  - 候选 B：代码团队 harness（towow 同构 26 个积木）—— 工程量大 3-4 倍但最打 towow 用户
  - 候选 C：两个都装各跑 30 次（最能打但 4 周单人极紧迫）
- [ ] **主 design doc v5 重写**：把 `jy-main-design-20260408-205859.md` 的 P1 v4 升级为 "神经元式骨架 + bandit 通电"
- [ ] **先前 self-correcting skeleton research v1 的关系**：那份档案的 "bootstrap 4 agent" 方向作废（本档案取代），但 Coze 冲击 + embodied 学术背书部分仍有效
- [ ] **AI-SQL-Agent 方案 C 的启示**：方案 C 的哲学（"让模型学会分析" + 多 agent 协作 + 结构化思维链）用在**单个复杂任务的分解**上仍然有价值，但那是 **"某种具体应用 workflow 内部的 agent 组合模式"**，不是骨架机制
