# ShadowFlow 战略调研与自修正骨架定位存档

> 日期：2026-04-09
> 类型：Research Archive（非正式 design doc，属 office-hours 过程中的战略思考沉淀）
> 对应主 design doc：`jy-main-design-20260408-205859.md`（2026-04-08 v4，当前 DRAFT 状态）
> 触发：office-hours 过程中 user 先后抛出 Coze 冲击、embodied 新洞察、platform vs product 战略转向、towow harness 6 层机制

---

## 1. 背景：为什么要存这份档

这不是最终 design doc，而是 office-hours 对话中 user 带来的多条重量级输入的沉淀。这些输入暂时不全部进主 design doc（避免主 doc 散焦），但必须留下痕迹——它们**决定了 ShadowFlow 从黑客松到 post-hackathon 的战略方向**。

核心触发点：
- **Coze 2.0**（字节开源 AI agent 平台，2026-01-19 发布）在对话式装配 workflow 这个方向上吃掉了 ShadowFlow 原设想的大半差异化
- User 提出 "两条路"模型：路径 1 自然语言→workflow（进入门槛），路径 2 workflow→环境学习修改（护城河）
- User 提出**embodied 家居机器人**作为路径 2 的极致应用场景
- User 发来 **Towow harness 6 层机制**作为参考：自治 AI 工程组织的工程形态
- User 最终定调：**"ShadowFlow 做骨架，不做产品。先打自修正核心，应用是后话。"**

---

## 2. Coze 2.0 冲击评估

### 2.1 Coze 2.0 核心能力（2026-01-19 发布）

| 功能 | 说明 | 对 ShadowFlow 的冲击 |
|---|---|---|
| Agent Office | 多轮追问业务约束 + 性能目标，持久规划 | ❌ "对话式 wizard 引导装配" 差异化被吃 |
| Coze Coding | 对话式构建网站/app/workflow | ❌ "自然语言 → workflow" 差异化被吃 |
| Skills Marketplace | 自然语言打包专业经验成可复用 skill module | ❌ "recipe 作为可复用知识化编排" 差异化被吃 |
| Coze Studio 开源 | 2025-07 开源，Go 微服务 + React 企业级 | ❌ "开源 workflow 引擎" 不独占 |
| 飞书 Docs/Sheets/Base 工具化 | agent 可直接读写飞书文档 | ❌ 中国生态整合不占优 |

GitHub star：n8n 157k / Dify 119k / **Coze 18.6k**（开源 9 个月，字节资源加持增长快）

### 2.2 Coze 架构上够不到的两个战场

**战场 1：Web3 / 可验证 AI**
- Coze 是中心化 SaaS，和 Web3 无关
- Merkle proof / 链上存证 / INFT / TEE 推理 — 架构里没有这些概念
- ShadowFlow P1 v4 的 0G 黑客松路径

**战场 2：自修正 / 环境交互式 workflow 进化**
- Coze 的 workflow 是静态定义：一次写好，run N 次
- 没有"根据执行后的反馈修改 workflow 本身"的概念
- 学术界正在研究（RoboCat, VLA, household robot LLM agents）但停在 model 级别，没有 workflow 级别
- **ShadowFlow 的真正护城河**（见第 4 节）

### 2.3 相关参考链接
- [狂师博客：Agent 自动化工作流 n8n/dify/coze 谁更强](https://www.cnblogs.com/jinjiangongzuoshi/p/19305202)
- [AiX Society: Coze 2.0 Transforming AI from Chat Tool to Intelligent Work Partner](https://aixsociety.com/bytedances-coze-2-0-transforming-ai-from-chat-tool-to-intelligent-work-partner/)
- [coze-dev/coze-studio GitHub](https://github.com/coze-dev/coze-studio)
- [Jimmy Song: Open Source AI Agent Platform Comparison 2026](https://jimmysong.io/blog/open-source-ai-agent-workflow-comparison/)

---

## 3. Embodied AI / 自我进化 workflow 学术前沿

### 3.1 相关论文与系统

| 论文/系统 | 贡献 | 对 ShadowFlow 的意义 |
|---|---|---|
| **LLM-Empowered Embodied Agent for Household Task Planning** ([arxiv 2504.21716](https://arxiv.org/html/2504.21716)) | 家居机器人 + 三 agent（routing / task planning / knowledge base）+ memory-augmented | 几乎就是 user 描述的场景；可作为 ShadowFlow 骨架第一个机器人应用的 reference |
| **RoboCat (DeepMind)** | self-evolving foundation model：新机械臂 → self-play → retrain → 适应扩展任务 | self-evolution 的学术证明；范式证明了 "workflow 迭代修改" 的可行性 |
| **RoboOS** ([arxiv 2505.03673](https://arxiv.org/html/2505.03673v1)) | Brain-Cerebellum 分层架构，跨 embodiment 多 agent 协作，开源 | 分层架构参考；ShadowFlow 骨架 = Brain，具体应用 = Cerebellum |
| **VLA (Vision-Language-Action) with online RL** | LLM-generated reward 做 online fine-tuning | 证明 online adaptation 可行 |
| **Multi-Robot-45k 数据集** | scene graph + 机器人规格 + 长 horizon 任务 + workflow graph of decomposed subtasks | ShadowFlow workflow assembly 天然训练数据源 |
| **Continual learning taxonomy for LLMs** | Rehearsal / Data aug / Regularization / Architecture-based 方法防 catastrophic forgetting | 自修正骨架借鉴的方法学 |

### 3.2 关键空位（ShadowFlow 的机会）

所有上述学术工作聚焦于 **model 级别的 self-evolution**（改神经网络权重）。

**没人把"整个 workflow assembly"作为被修改的对象**。

ShadowFlow 的 `WorkflowAssemblySpec + WorkflowBlockSpec + ConnectionResolver + AssemblyConstraintSpec + ActivationBandit + ExecutionFeedbackRecord` 恰好构成了 workflow-level continual adaptation 的现成工程基座。**这个 level 的结构学术界没有，工业界也没有**。

### 3.3 相关参考链接
- [Towards Embodied Agentic AI: Review](https://arxiv.org/html/2508.05294v4)
- [Frontiers: Agentic LLM-based robotic systems](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2025.1605405/full)
- [Awesome-Embodied-Robotics-and-Agent](https://github.com/zchoi/Awesome-Embodied-Robotics-and-Agent)

---

## 4. 两条路 × 两个场景矩阵

User 在 office-hours 中提出的"两条路"：
- **路径 1**：自然语言 → workflow（对话装配，进入门槛）
- **路径 2**：workflow → 环境反馈学习修改（自修正，护城河）

交叉两个场景：

| | 路径 1：自然语言 → workflow | 路径 2：workflow → 环境学习修改 |
|---|---|---|
| **场景 A：可验证 AI (0G)** | wizard 装配带证明的调研报告 | reviewer 封驳 / proof 审核失败 → 修 workflow |
| **场景 B：embodied 家居** | wizard 装配"晚上 8 点提醒家人喝水" | 传感器反馈（家人不在家/已睡着）→ 修 workflow |
| **场景 C：编程 harness** | 自然语言描述 → 装配编程 agent swarm | 测试失败 / review 挡回 → 从 invariant 中注入新约束（towow 风格） |

**其他人的分布**：
- n8n / Dify / Coze 坐在**左列**（路径 1，所有场景）
- 学术界（RoboCat / VLA）在**右下角 model 级别**（路径 2 的 model 层，非 workflow 层）
- **整个右列 workflow 级别的自修正 = 空地**

**User 最终定调**：**先打右列的骨架能力（路径 2），场景 A/B/C 是装能力装上去的事，不是现在做的事**。

---

## 5. Path X/Y/Z 候选对比（已被 user 超越）

这三条路径是 2026-04-08 office-hours 末期讨论的候选。user 在 2026-04-09 提出 platform thinking 后，**这三条都被升级**——因为三条全部默认"黑客松做具体 demo 场景"，而 user 决定"做的是骨架，不是具体场景"。

**留作历史参考：**

| Path | 核心做法 | 优缺点 | 被什么取代 |
|---|---|---|---|
| **X** | 严格执行 v4 design doc（对话装配 + 0G 可验证），embodied 是 post-hackathon | 稳但 differentiation 弱 | user 的 platform thinking |
| **Y** | 主 demo 换成 embodied 家居场景 | 极致差异化但偏离 0G 叙事、时间不够 | user 的 "先走骨架" |
| **Z** | v4 严守 + design doc 加两条路矩阵 + demo 末尾加 minimum 路径 2 证明 | 最平衡，我原本推荐 | user 的 "骨架高于场景" 升级 |

---

## 6. Towow Harness 6 层机制（user 发来的重要参考）

User 在 office-hours 最后阶段发来 towow 工程的 6 层自治机制原话。抄录并映射到 ShadowFlow：

### 6.1 Towow 原话 6 层

1. **虚拟工程团队（26 个 Skill = 26 个"员工"）**——不是一个 AI 干所有事，架构师/开发/测试/审查/运维/Bug 分诊各有专才，每个 Skill 有明确输入输出契约
2. **自动治理（Hooks = 看不见的手）**——部署守卫、上下文路由、循环检测、停止门，**物理上不让做**而非"提醒别做"
3. **8 Gate Fail-Closed 流程**——每个功能必过 8 道门禁，4 道独立 AI 审查（自动 spawn 另一个 AI，schema 隔离写权限）
4. **自学习（Invariant 注入）**——towow-crystal-learn 自动从失败提取"不变量"（如"改接口必须 grep 消费者"），机械化注入到执行层 Skill
5. **上下文工程（AI 不迷路）**——每 50 次 tool call 自动复述目标，压缩前注入原始意图，编辑文件时自动加载该文件规则
6. **劳动分工（Claude 判断 + Codex 执行）**——高价值判断给 Claude，低价值机械工作并行委派给 Codex

人只做三件事：战略决策、方向纠偏、最终确认。

### 6.2 ShadowFlow 骨架 1:1 映射

| towow 层（代码层） | ShadowFlow 对应（workflow 层） | 现状 |
|---|---|---|
| 1. 虚拟工程团队 | `WorkflowBlockSpec` catalog + `RoleSpec` + `SkillSpec` | ✅ 已有（Phase 0） |
| 2. 自动治理（物理拦截） | `AssemblyConstraintSpec` + `ConnectionResolver` 合法性 + `WorkflowDefinition` schema 校验 | ✅ 已有（Phase 1） |
| 3. 8 Gate Fail-Closed | multi-stage review_gate + **独立 critique agent**（未做） | ⚠️ 部分（review gate spec 有，独立审查 agent 缺） |
| **4. 自学习（Invariant 注入）** | **`ExecutionFeedbackRecord` → 自动提取约束 → 注入 `AssemblyConstraintSpec` → 下次 assembly 强制遵守** | ❌ **核心缺口**（spec 字段有，闭环未实现） |
| 5. 上下文工程 | memory adapter + context injection in node execution + 周期性目标复述 | ⚠️ 部分（memory 有，目标复述缺） |
| 6. 劳动分工 | multi-provider agent binding + delegate/child run + Claude/Codex provider 分流 | ✅ 已有（Phase 0-1） |

### 6.3 核心空位：第 4 层自学习闭环

这是 ShadowFlow 骨架要填的**唯一真正新东西**。其他 5 层的基础设施都已经 Phase 0-2 做了 80%+。

自学习闭环的具体工程形态：

```
WorkflowRun 执行
   ↓
ExecutionFeedbackRecord (已有：reward_hints 5 维)
   ↓
【新】失败模式分析器 (Failure Mode Extractor)
   ↓ 识别
   - 重复错误模式 (同 block 连续失败 N 次)
   - 约束违反 (输出不符合 schema)
   - 性能瓶颈 (某 edge 一直超时)
   ↓
【新】Invariant 提取器 (Invariant Miner)
   ↓ 产出
   - 新的 AssemblyConstraintSpec (如 "block X 必须在 block Y 之前")
   - 新的 block input_requirements (如 "block X 要求上游提供 Z 字段")
   - 新的 role 绑定规则 (如 "此类 goal 禁用 provider W")
   ↓
【新】Catalog 注入器 (Catalog Updater)
   ↓
更新 catalog → 下一次 ActivationSelector.select() 会看到新约束
   ↓
bandit weights 更新 (已有：ActivationBandit)
```

**关键**：这不是"学一个模型"（我之前 P2 讲的 bandit），这是 **"从失败中提取可解释的结构化约束，自动注入到下次 assembly 的合法性检查里"**。每次失败，系统都"变聪明了一点"，但这个"聪明"是**可审计、可回滚、可人工干预的规则集**，不是黑盒权重。

这接近 towow 原话的 "**同一个坑不踩第二次 / 机械化注入到执行层**"，是 **inductive rule mining from execution traces**，学术上有支撑（symbolic RL, program synthesis from failures）但工程化落地极少。

---

## 7. 自修正骨架定位（v5 candidate）

基于 user 2026-04-09 的 platform thinking 转向，ShadowFlow 的新定位候选：

### 7.1 P1 v5 候选

**ShadowFlow = "自修正 workflow 元引擎骨架"** —— 提供一个 workflow-level 的 continual adaptation 基础设施，上面可装载不同能力与知识以面向不同应用场景。

三条核心能力：

1. **Path 1 能力（进入门槛）**：自然语言 → workflow assembly 生成
   - 通过对话或一次性 prompt
   - 从 catalog 中选 block + 推断拓扑 + 绑定 agent
2. **Path 2 能力（护城河）**：workflow → 环境反馈自修正
   - 执行 feedback → 失败模式提取 → 约束/规则归纳 → catalog 注入
   - 下一次 assembly 自动遵守新规则（towow 第 4 层同构）
3. **能力装载 SDK**：骨架 + 可插拔能力包 = 具体应用
   - 能力包 = 一组 `WorkflowBlockSpec` + `SkillSpec` + `domain knowledge YAML`
   - 示例能力包：
     - **编程能力包**（towow 式 26 skill 编码 swarm）
     - **家居/机器人能力包**（传感器 block + 运动控制 block + 空间推理）
     - **调研能力包**（search/read/synthesize + 0G 存证）
     - **自动化能力包**（cron/HTTP/code/notification + recipe 库）

### 7.2 对当前 design doc (v4) 的影响

主 design doc `jy-main-design-20260408-205859.md` 当前是 v4 定位（"对话式引导装配 + 0G-native，主攻 n8n 不覆盖战场"）。v5 升级方向：

- **P1 必须重写**：从 "0G 场景产品" → "自修正骨架 + 0G 是第一个能力包示例"
- **Demo 重心变化**：主 demo 必须展示**自修正闭环**（失败 → 约束注入 → 下次成功），不仅仅是"对话装配 → 跑一次"
- **P9 catalog 扩展仍需**（但归类为"自动化能力包"的第一批示例）
- **路径 2 从 stretch goal 升级为 hackathon 主菜**——至少做出一个最小的 "失败提取 → 约束注入" 闭环 demo

### 7.3 对 bandit / 学习降级的再审视

之前在 v4 design doc 里把 `ActivationBandit` / 学习降级为 stretch goal 的判断——**在 v5 升级后需要重评**：

- **bandit 本身仍是 stretch**（统计权重更新对 demo 不是主菜）
- **但"自学习闭环" = 必做**，只是工程形态不是 bandit：
  - 失败模式分析器：规则式，遍历 ExecutionFeedbackRecord 找 pattern
  - Invariant 提取器：可以是规则式 + LLM assisted（用 LLM 把"这种失败"翻译成"这种约束"）
  - Catalog 注入器：纯工程，写数据结构

这个区分很重要：**user 要的"自修正"不是神经网络权重更新，是规则/约束的增量归纳**。我之前把两者混淆了。

---

## 8. 下一步决策清单

- [ ] **主 design doc v5 重写**：P1 升级为自修正骨架；demo 重心移到自修正闭环；hackathon scope 重排
- [ ] **自学习闭环技术选型**：失败模式分析器的具体实现路径（规则 vs LLM vs 混合）
- [ ] **hackathon demo 场景再选**：自修正闭环需要一个具体场景才能演示（编程 harness？调研 agent？）
- [ ] **能力包抽象层设计**：骨架如何"装载"一个能力包？API 形态？
- [ ] **与 towow 团队接触可能性**：towow 自己有 harness 工程（user 引用原话），直接借鉴 6 层机制的最佳路径是能合作还是只参考？

---

## 附：User 在 office-hours 中的关键原话（供后续回溯）

- "我们要做的是骨架，而不是呃现在就开始搞落地的产品"
- "我们能够把这个它自己净化工作流的，它这个东西打好了，我们可以就是现在线上去完成线上的任务"
- "之后我们再想进军线下机器人的话，我们再给他这其实就是装能力的事情了"
- "但是如果我们主体他一个自信化的功能没有的话，就是没有我跟他说一句话，他自己生成一个工作流。然后他再到环境中去自己去迭代...最后给我一个...符合我期的结果"
- "我们先走主干"
- "比如说编程的那种 harness 的工程...也可以非常方便的在我们这个产品上面去实现"
- （towow 原话）"核心不是 AI 写代码快，而是搭了一个自治的 AI 工程组织。六层机制叠加"
- （towow 原话）"同一个坑不踩第二次。towow-crystal-learn 自动从失败中提取不变量，机械化注入到执行层 Skill"

这些话要铭记。下一版 design doc 的灵魂都在里面。
