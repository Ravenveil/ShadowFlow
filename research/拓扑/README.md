# 拓扑研究：工作流 DAG 自动装配

> 创建于 2026-04-01
> 背景：ShadowFlow 三层自发装配架构 — ConnectionResolver v2 的理论基础

---

## 为什么拓扑对 ShadowFlow 重要

ShadowFlow v1 的 ConnectionResolver 用线性链（block1 → block2 → END），
这是个已知局限——当 catalog 变大、目标变复杂时，需要推断真正的 DAG 拓扑。

核心问题：
- **给定一组激活的 blocks，如何推断它们之间的连接关系？**
- 哪些 block 应该串行？哪些应该并行（fan-out）？哪些需要等待多个输入（fan-in）？

这本质上是一个 **DAG 编译问题**：从 capability 声明推导出有向无环图。

---

## 关键论文

### 1. Prompt2DAG（最直接相关）
- **arxiv**: https://arxiv.org/abs/2509.13487
- **核心**：自然语言 → Apache Airflow DAG，四阶段流程
- **关键发现**：
  - 纯 LLM 方案成功率 66%，混合方案（模板+LLM）78.5%
  - **瓶颈是依赖推断，不是任务识别** ← ShadowFlow 的 EUREKA 洞察来源
  - ShadowFlow 的显式 IO contracts 使依赖推断瓶颈更低
- **对 ShadowFlow 的意义**：ConnectionResolver v2 不需要纯 LLM，混合方案（capability 规则 + LLM 消歧）就够

### 2. AFlow：自动化 Agentic 工作流生成（ICLR 2025）
- **arxiv**: https://arxiv.org/abs/2410.10762
- **核心**：用蒙特卡洛树搜索（MCTS）自动搜索最优工作流拓扑
- **方法**：把工作流编码为 DAG，通过执行反馈迭代优化
- **对 ShadowFlow 的意义**：Phase 3（Graph-RL）的参考架构，反馈驱动的拓扑优化

### 3. Survey: From Static Templates to Dynamic Runtime Graphs（2025）
- **arxiv**: https://arxiv.org/abs/2603.22386
- **核心**：LLM agent 工作流优化的全面综述
- **关键分类**：
  - **静态拓扑**：预定义模板（LangGraph 现状）
  - **动态拓扑**：运行时根据反馈修改（ShadowFlow 的方向）
  - **自回归图生成**：按 query 条件采样 role + edge（"Assemble Your Crew"）
  - **图剪枝**：从完全图剪掉不需要的 edge（Adaptive Graph Pruning）

### 4. Constructing Workflows from Natural Language（NAACL 2025）
- **链接**: https://aclanthology.org/2025.naacl-industry.3.pdf
- **核心**：多 agent 协作的工作流构建，工业界实践
- **对 ShadowFlow 的意义**：自然语言 → 工作流的工业落地经验

### 5. Graph-SCP：用 GNN 加速集合覆盖问题（CPAIOR 2025）
- **链接**: https://link.springer.com/chapter/10.1007/978-3-031-95976-9_12
- **核心**：GNN 学习识别集合覆盖问题的解空间子集，加速求解器
- **对 ShadowFlow 的意义**：ActivationSelector 的 capability 最小覆盖集是 NP-hard 问题，
  catalog 大了之后可以用 GNN 加速（Phase 3 方向）

---

## 核心概念速查

### DAG（有向无环图）
工作流的标准表示：节点是任务（block），边是依赖关系。
ShadowFlow 的 `WorkflowDefinition` 就是一个 DAG。

### 拓扑推断的三种方法（从简单到复杂）

```
方法 1：线性链（ShadowFlow v1）
  block1 → block2 → block3 → END
  优点：简单可测试
  缺点：不支持 fan-in/fan-out，catalog 大了会乱

方法 2：Capability 依赖图（ShadowFlow v2 目标）
  如果 block A 的 output_capabilities 包含 block B 的 input_requirements
  → 自动推断 A → B 的边
  优点：确定性，可解释，不依赖 LLM
  缺点：需要 blocks 声明 input_requirements（目前只有 outputs）

方法 3：LLM + 模板混合（Prompt2DAG 的方法）
  模板处理标准 case，LLM 处理歧义和复杂依赖
  优点：成功率高（78.5%）
  缺点：引入 LLM 延迟和不确定性
```

### 集合覆盖（Set Cover）
给定 required_capabilities = {planning, execution}，
在 catalog 里找最小的 block 子集，使其 capabilities 的并集覆盖 required_capabilities。

这是 NP-hard 问题，但 catalog 小（<100 blocks）时贪心算法足够：
每次选覆盖最多 uncovered capabilities 的 block，直到全部覆盖。

### Fan-in / Fan-out
```
Fan-out（一分多）：        Fan-in（多合一）：
    A                         A    B
   / \                         \  /
  B   C                         C

例：A=fetch_data               例：A=analyze, B=summarize
   B=transform, C=export             C=merge_results
```

---

## ShadowFlow 拓扑演化路线图

```
v1（现在）：线性链
  goal → [plan, execute] → plan → execute → END
  ConnectionResolver: 按 score 排序后串联

v2（下一步）：Capability 依赖推断
  WorkflowBlockSpec 加 input_requirements: List[str]
  ConnectionResolver: 如果 A.output_capabilities ∩ B.input_requirements ≠ ∅ → A→B
  支持：串行、简单 fan-out

v3（Phase 3）：Graph-RL / 反馈驱动
  参考 AFlow（MCTS）+ Assemble Your Crew（自回归图生成）
  根据历史执行反馈，学习最优拓扑
  支持：复杂 fan-in/fan-out，动态拓扑修改
```

---

## 待读论文队列

- [ ] [AFlow (ICLR 2025)](https://arxiv.org/abs/2410.10762) — MCTS 搜索最优工作流
- [ ] [Survey 2603.22386](https://arxiv.org/abs/2603.22386) — 动态拓扑综述，重点看第 3-4 节
- [ ] [Prompt2DAG](https://arxiv.org/abs/2509.13487) — 混合方案细节，看依赖推断部分
- [ ] [NAACL 2025 workflow paper](https://aclanthology.org/2025.naacl-industry.3.pdf) — 工业落地经验
- [ ] Graph-SCP (CPAIOR 2025) — 等 catalog 规模超过 50 个 block 时再看

---

## 关键洞察（给未来的自己）

1. **依赖推断是瓶颈，不是任务识别**（Prompt2DAG 验证）
   → ActivationSelector 好做，ConnectionResolver 难做

2. **显式 capability 声明比 LLM 推断更可靠**
   → `block.input_requirements` + `block.output_capabilities` 是 v2 的关键投资

3. **先确定性，后学习**（ShadowFlow 的设计原则与研究趋势一致）
   → v1 规则 → v2 确定性推断 → v3 RL，不要跳步

4. **集合覆盖 + 拓扑推断是两个分开的问题**
   → ActivationSelector 解决「选哪些 block」
   → ConnectionResolver 解决「怎么连」
   → 不要混在一起
