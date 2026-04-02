# Ralph Loop 调研：与 ShadowFlow 反馈循环的关系

> 调研日期：2026-04-02
> 背景：ShadowFlow Phase 3 (Graph-RL) 规划中，探索 Ralph Loop 对我们反馈循环设计的启发

---

## 什么是 Ralph Loop

Ralph Loop（全称 **Ralph Wiggum Loop**）是 Geoffrey Huntley 于 2026 年初发明的 AI 自主编码方法论。名字来自《辛普森一家》中的角色 Ralph Wiggum，取其"不管失败多少次都傻傻坚持"的精神。

核心形态极其简单——一个 bash 无限循环：

```bash
while :; do cat PROMPT.md | claude ; done
```

让 AI 编码代理在**持续迭代的循环**中反复执行任务，直到所有需求被客观验证满足。

---

## 核心架构

### 三个文件 + 一个脚本

| 文件 | 作用 |
|------|------|
| `PRD.md` | 需求清单（markdown checklist），每个任务一个复选框 |
| `PROMPT.md` | 指令模板，告诉 agent "读 PRD，选下一个未完成任务，执行，commit，打勾" |
| `ralph.sh` | Bash 循环脚本，每次迭代启动一个全新的 CLI session |

### Stop Hook 机制

系统的技术基础是**拦截 agent 的退出行为**：
1. Stop Hook 检查是否存在预定义的完成信号（如 `<promise>COMPLETE</promise>`）
2. 如果没有找到，阻止退出，重新注入原始 prompt
3. 创建新的迭代轮次

### 状态持久化模型

Ralph Loop 不依赖 LLM 上下文窗口来保持记忆，而是用**外部持久化状态**：
- **文件系统**：`progress.txt` 记录迭代日志、发现的模式、遇到的坑
- **Git 历史**：提供客观的 diff，显示每轮迭代的变更
- **PRD checklist**：结构化任务列表，标记完成状态

> **核心洞察：进度不存在于 LLM 的上下文窗口中——它存在于文件和 Git 历史中。**

---

## 与 ReAct 的对比

| 维度 | ReAct（传统 Agent 循环） | Ralph Loop |
|------|------------------------|------------|
| 退出控制 | LLM 自主决定何时完成 | 外部脚本强制执行完成标准 |
| 退出标准 | 自我评估 | 机器可验证条件（测试通过、特定输出） |
| 上下文管理 | 单 session，步骤越多越膨胀 | 跨 session，文件系统做记忆 |
| 失败处理 | 在推理链内尝试修复 | 允许失败，从文件系统状态重启 |

---

## 与 RL 反馈循环的关系

Ralph Loop 不是正式的 RL 系统，但它体现了 RL 的核心结构：

```
RL 映射：

  环境 (Environment)    = 代码仓库 + 文件系统 + Git 历史
  动作 (Action)         = agent 的代码修改和 commit
  奖励信号 (Reward)     = 测试通过 / 类型检查 / lint 通过 / build 成功
  策略迭代 (Iteration)  = 每轮全新 session 基于上一轮结果改进
```

**关键区别**：传统 RL 通过梯度更新权重，Ralph Loop 通过**文件系统状态变化**传递"学习"。Agent 在每轮迭代中看到之前的修改结果和测试反馈，相当于一种"外部记忆驱动的策略改进"。

---

## 与 ShadowFlow 的映射

### 概念对应

| ShadowFlow | Ralph Loop |
|------------|------------|
| 目标（Goal） | PRD.md 中的 checklist 任务 |
| Block 选择（ActivationSelector） | PROMPT 指导 agent "选下一个未完成任务" |
| 工作流执行（RuntimeService.run） | Agent 在单轮迭代中执行代码修改 |
| 反馈（ExecutionFeedbackRecord） | 测试/lint/typecheck 的客观结果 |
| 学习（Phase 3 RL） | progress.txt + Git diff 做跨迭代知识传递 |

### 数据流对比

```
Ralph Loop:
  PRD.md → agent 自主选任务 → 执行 → 测试验证 → Git commit → 下一轮
       └─────────────────── 文件系统做记忆 ──────────────────┘

ShadowFlow:
  goal → ActivationSelector → block 选择 → 执行 → FeedbackRecord → ActivationTrainingSample
       └──────────────── Phase 3: RL 权重更新 ────────────────┘
```

### ShadowFlow 比 Ralph Loop 多了什么

1. **结构化选择空间**：Ralph Loop 让 LLM 自主决定做什么；ShadowFlow 有明确的 block catalog + capabilities 声明，选择空间是显式的、可枚举的
2. **真正的学习层**：Ralph Loop 的"学习"是隐式的（文件系统状态）；ShadowFlow Phase 3 有明确的 reward signal → 策略更新路径
3. **可组合拓扑**：Ralph Loop 是单一 agent 线性执行；ShadowFlow 支持多 block 组合成 DAG（v2 拓扑推断后）
4. **跨 provider 执行**：同一个 workflow 可以在 Claude/OpenAI/Gemini/Ollama 上执行

### Ralph Loop 给我们的启发

1. **外部状态比上下文窗口可靠**
   - Ralph Loop 用文件系统而不是 LLM 记忆来持久化进度
   - ShadowFlow 的 `ActivationTrainingSample` 就是这个思路——不依赖 LLM 的内部状态，把反馈写到外部存储

2. **客观验证比自我评估可靠**
   - Ralph Loop 用测试通过/lint 通过做退出条件，不用 LLM 自我评估
   - ShadowFlow 的 `complete=True/False` 是确定性判断（capability 全覆盖），不是 LLM 判断

3. **允许失败 + 重启**
   - Ralph Loop 的每轮迭代互相独立，一轮失败不会毁掉全局状态
   - ShadowFlow 可以借鉴：Phase 3 的 RL 训练可以用类似的"迭代式探索"——每次选不同的 block 组合，执行，观察 reward，不怕单次失败

4. **进度文件的概念**
   - Ralph Loop 的 `progress.txt` 记录跨迭代的经验
   - ShadowFlow 的 `ActivationTrainingDataset` 就是类似角色——积累历史经验供策略优化

---

## 对 Phase 3 设计的具体建议

### 1. 借鉴 Ralph Loop 的"迭代探索"模式

```
Phase 3 训练循环（类 Ralph Loop 结构）：

while not converged:
    goal = sample_goal()                          # 从历史 goal 或新 goal
    candidates = rl_selector.select(goal, catalog) # RL 策略选 block
    links = resolver.resolve(candidates)           # 连接
    assembly = build_assembly(candidates, links)
    workflow = compile(assembly)
    result = runtime.run(workflow)                 # 执行
    reward = compute_reward(result)                # 从 reward_hints 计算
    rl_selector.update(goal, candidates, reward)   # 策略更新
    save_training_sample(goal, candidates, reward)  # 持久化
```

### 2. 混合策略：确定性 fallback + RL 探索

```
if training_samples.count >= 50:
    candidates = rl_selector.select(goal, catalog)  # RL 选择
    if confidence < threshold:
        candidates = greedy_selector.select(goal)    # fallback 到贪心
else:
    candidates = greedy_selector.select(goal)        # 数据不够，用规则
```

这跟 Ralph Loop 的"安全机制"（`--max-iterations`）类似——有保底策略。

### 3. reward 设计（借鉴 Ralph Loop 的客观验证思路）

| reward 信号 | 来源 | 权重建议 |
|-------------|------|----------|
| workflow 成功完成 | RunRecord.status == "succeeded" | 1.0 |
| 产生了 artifact | reward_hints.artifact_count > 0 | 0.5 |
| 流程未中断 | reward_hints.continued_flow == 1.0 | 0.3 |
| block 数量最少 | -0.1 * len(candidates) | -0.1/block |
| 用户干预次数 | 未来：review_gate_triggered 次数 | -0.2/次 |

---

## 关键仓库和链接

| 资源 | 链接 |
|------|------|
| 原作者教程 | [ghuntley/how-to-ralph-wiggum](https://github.com/ghuntley/how-to-ralph-wiggum) |
| 社区实现 | [snarktank/ralph](https://github.com/snarktank/ralph) |
| 快速入门 | [coleam00/ralph-loop-quickstart](https://github.com/coleam00/ralph-loop-quickstart) |
| Vercel AI SDK 版 | [vercel-labs/ralph-loop-agent](https://github.com/vercel-labs/ralph-loop-agent) |
| Claude Code 内置插件 | [anthropics/claude-code/plugins/ralph-wiggum](https://github.com/anthropics/claude-code/blob/main/plugins/ralph-wiggum/README.md) |
| 发明者博文 | [ghuntley.com/ralph](https://ghuntley.com/ralph/) |
| 与 ReAct 对比（阿里云） | [alibabacloud.com/blog/from-react-to-ralph-loop](https://www.alibabacloud.com/blog/from-react-to-ralph-loop-a-continuous-iteration-paradigm-for-ai-agents_602799) |

---

## 结论

Ralph Loop 是 ShadowFlow RL 反馈循环的一个**简化特例**：
- 它有 goal、execution、feedback，但 block selection 是 LLM 自主决定的（无策略网络）
- 它的 learning 是隐式的（文件系统状态，非权重更新）

ShadowFlow Phase 3 要做的，本质上是把 Ralph Loop 的隐式学习**升级为显式 RL**：
- 把"LLM 自主选任务" → "策略网络选 block"
- 把"文件系统记住经验" → "ActivationTrainingSample 做训练数据"
- 把"测试通过/失败" → "结构化 reward_hints"
- 把"bash 无限循环" → "收敛性保证的训练循环"

Ralph Loop 验证了一个重要假设：**外部状态 + 迭代执行 + 客观验证 = 可靠的 agent 进化模式**。ShadowFlow 在这个基础上加了结构化的选择空间和可学习的策略层。
