# Spontaneous Assembly Roadmap

> 更新日期：2026-04-02
> 状态：Phase 0-2 完成，Phase 3 规划中

---

## 当前端到端数据流

```
用户目标 (str)
    ↓
ActivationSelector.select(goal, catalog)
    → 双语 tag 匹配（token + substring）+ 贪心最小覆盖集
    → ActivationResult(candidates, complete, missing_capabilities)
    ↓
ConnectionResolver.resolve(candidates)
    → v1 线性链: block1 → block2 → ... → END
    ↓
WorkflowAssemblySpec(blocks + links + goal)
    ↓
AssemblyCompiler.compile(assembly)        ← 需要绑定 agent（哪个 LLM 跑哪个 block）
    → WorkflowDefinition + metadata{assembly_block_node_map, assembly_goal}
    ↓
RuntimeService.run(workflow)              ← 实际执行
    → 每步自动产生 ExecutionFeedbackRecord（含 reward_hints）
    ↓
export_activation_training_dataset()
    → ActivationTrainingSample（含 assembly_block_id + assembly_goal）
    → 这就是 Phase 3 的训练数据
```

CLI 入口：
- `shadowflow assemble --goal "规划并执行任务"` → 输出选了哪些 block + 连接关系
- `shadowflow registry list --kind blocks` → 列出所有可用 block

当前瓶颈：assemble 到 compile 之间需要手动绑定 agent。没有"一键从目标到执行"的命令。

---

## Phase 0：积木本体 ✅

落地点：
1. `WorkflowBlockSpec` — 含 capabilities 字段（系统面，English only）
2. `WorkflowAssemblySpec` — 含 goal 字段
3. `AssemblyConstraintSpec` — 连接约束
4. `build_builtin_block_catalog()` — 8 个内置 block，全部带 tags + capabilities
5. `AssemblyCompiler.compile()` — assembly → template → WorkflowDefinition

---

## Phase 1：局部激活 / 选择机制 ✅

落地点：
1. `ActivationSelector.select(goal, catalog)` — tag 双模式匹配 + 贪心覆盖
2. `ConnectionResolver.resolve(candidates)` — v1 线性链
3. `shadowflow assemble --goal` CLI 子命令
4. `registry list --kind blocks/assemblies` 扩展
5. OOD 处理：complete=False, missing=["unknown"], fallback="surface_to_user"
6. 中英双语 tag 支持（token 匹配 + substring 匹配）

关键设计决策：
- ActivationSelector 是 **catalog 级激活**（选哪些 block），不是 runtime 级激活（WorkflowActivationSpec，运行时决定 node 是否执行）
- 确定性激活是默认，LLM 是可插拔增强
- 集合覆盖（选哪些 block）和拓扑推断（怎么连）是两个分开的问题

---

## Phase 2：反馈信号标准化 ✅

落地点：
1. `ActivationTrainingSample` 新增 `assembly_block_id` + `assembly_goal` 字段
2. `AssemblyCompiler.compile()` 写入 `assembly_block_node_map`（block_ref→node_id）到 WorkflowDefinition.metadata
3. `export_activation_training_dataset()` 从 metadata 读取映射，填充 assembly 字段
4. `BaseWritebackAdapter.persist_feedback()` 接口就绪
5. 每步 `ExecutionFeedbackRecord` 已有 5 个 reward_hints 维度：
   - `artifact_count`, `delegated_run`, `continued_flow`, `review_gate_triggered`, `selected_candidates`

反馈闭环已建立：assembly 层的 block_id + goal → runtime 层的执行反馈 → 训练管线。

---

## Phase 3 前置：数据积累 + v2 拓扑（待做）

### Step A：默认 agent 绑定（消除摩擦，开始积累数据）

现在 assemble → compile 需要手动绑 agent，太摩擦了。需要加默认 agent 绑定策略：

```
shadowflow assemble --goal "xxx" --provider claude --executor-kind cli
# 自动给每个 worker block 绑定默认 agent → 直接输出可执行的 WorkflowDefinition
```

**为什么先做这个：** 没有真实执行，就没有 ActivationTrainingSample。没有数据，Phase 3 就是空中楼阁。

### Step B：v2 ConnectionResolver（确定性拓扑推断）

TODOS.md 里记着的。RL 如果只能学线性链，学习空间太小。

实现方案：
1. `WorkflowBlockSpec` 加 `input_requirements: List[str]`（与 capabilities 对称）
2. `ConnectionResolver.resolve()` 基于 capability 依赖图推断：
   - block A 的 capabilities 包含 block B 的 input_requirements → 加边 A→B
3. 支持 fan-out（parallel）和 fan-in（barrier）拓扑

**为什么排在 A 后面：** v1 线性链足够跑起来积累初始数据，但 RL 需要更大的动作空间才有意义。

---

## Phase 3：Graph-RL / 自发协作（规划）

### 核心问题

让系统从"固定规则选 block"进化到"根据历史反馈学习选 block + 怎么连"。

### RL 要学两件事

| 学什么 | 难度 | 方法 | 数据需求 |
|--------|------|------|----------|
| **选哪些 block** | 低 | Contextual Bandit | ~50 samples |
| **怎么连** | 高 | Policy Gradient on DAG | ~200 samples + v2 拓扑 |

### 演化路线

```
贪心覆盖（Phase 1，已完成）
    ↓ Step A 完成，积累 50+ samples
Contextual Bandit（学"选哪些"）
    - 输入：goal embedding（TF-IDF 或 LLM embedding）
    - 输出：每个 block 的激活概率
    - 奖励：reward_hints 加权和
    - 优势：不需要海量数据
    ↓ 积累 200+ samples + Step B (v2 拓扑) 完成
Policy Gradient（学"选哪些 + 怎么连"）
    - 动作空间：block 子集 × 拓扑结构
    - 需要 v2 ConnectionResolver 的非线性拓扑支持
    ↓ 大量数据 + 充分验证
Graph-RL / GNN（完全自发涌现）
    - 参考：AFlow (MCTS), Prompt2DAG 依赖推断
    - catalog 超过 10-20 个 block 后再考虑
```

### Contextual Bandit 最小实现方案

```python
# shadowflow/assembly/learner.py（Phase 3 Step 1）

class ActivationBandit:
    """
    Contextual Bandit for block selection.
    Wraps ActivationSelector: 当有足够训练数据时，
    用学到的概率替代贪心覆盖；否则 fallback 到贪心。
    """
    def __init__(self, selector: ActivationSelector, min_samples: int = 50):
        self.selector = selector  # fallback
        self.min_samples = min_samples
        self._model = None  # 训练后填充

    def select(self, goal, catalog, training_data=None):
        if training_data and len(training_data.samples) >= self.min_samples:
            return self._learned_select(goal, catalog, training_data)
        return self.selector.select(goal, catalog)  # fallback to greedy

    def _learned_select(self, goal, catalog, training_data):
        # Phase 3 实现：
        # 1. goal → embedding
        # 2. embedding → block 激活概率（trained model）
        # 3. 概率 > threshold → 候选
        # 4. 仍用 ConnectionResolver 连接
        raise NotImplementedError("Phase 3 implementation")
```

---

## Phase 4：因果增强（远期）

目标：提高策略更新的解释性和稳健性

1. Credit assignment 改善（哪个 block 对最终成功贡献最大）
2. Counterfactual evaluation（如果没选这个 block 会怎样）
3. Intervention logging（ProjectionGraph 已有 `intervention: bool` 边语义）
4. 因果特征与奖励拆分

---

## 执行优先级

```
现在 → Step A（默认 agent 绑定，一键执行，积累数据）
      → Step B（v2 ConnectionResolver，拓扑推断）
      → Phase 3 Step 1（Contextual Bandit spike）
远期 → Phase 3 Step 2（Policy Gradient）
      → Phase 4（因果增强）
```

## 参考文献

- 设计文档：`~/.gstack/projects/Ravenveil-AgentGraph/jy-main-design-20260401-182636.md`
- 拓扑研究：`research/拓扑/README.md`（Prompt2DAG, AFlow, Survey 2603.22386）
- TODOS.md：parallel/barrier block 在 v2 ConnectionResolver 中的处理
