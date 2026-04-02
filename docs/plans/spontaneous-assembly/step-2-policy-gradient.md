# Phase 3 Step 2：Policy Gradient on Block Selection + Topology

> 日期：2026-04-02
> 状态：设计中
> 前置：Phase 3 Step 1（ActivationBandit）✅ + Step B（v2 ConnectionResolver）✅

---

## 要解决的核心问题

Step 1 的 ActivationBandit 只学"选哪些 block"，拓扑由 ConnectionResolver 确定性推断。
Step 2 要让策略同时学习"选哪些 block" + "input_requirements 的优先级排序"，
从而间接影响 ConnectionResolver v2 生成的拓扑结构。

```
Step 1（已完成）：goal → ActivationBandit(token affinity) → block 子集 → ConnectionResolver(固定) → DAG
Step 2（本任务）：goal → PolicyGradientSelector(embedding + linear) → block 子集 + 优先级权重 → ConnectionResolver(加权) → DAG
```

**关键约束：不直接学拓扑结构。** 拓扑仍由 ConnectionResolver v2 基于 capability 依赖推断。
Policy Gradient 的作用是：(1) 更好的 block 选择，(2) 影响歧义情况下的边权重。

---

## 为什么用 Policy Gradient 而不是继续 Bandit

| 维度 | Contextual Bandit (Step 1) | Policy Gradient (Step 2) |
|------|---------------------------|--------------------------|
| 动作空间 | 每个 block 独立二值（选/不选） | block 子集的联合概率 |
| credit assignment | 每个 block 独立评估 | 整个 workflow 结果反传 |
| 拓扑感知 | 无 | 通过优先级权重间接影响 |
| 数据需求 | ~50 samples | ~200 samples |
| 表达力 | block 间相互独立 | 可学 block 间相关性 |

Bandit 假设每个 block 的价值独立于其他 block，但实际上 plan + execute 组合比 plan 单独更有价值。
Policy Gradient 可以学到这种组合效应。

---

## 架构设计

### 核心组件

```python
# shadowflow/assembly/policy.py（新文件）

class GoalEncoder:
    """Goal string → fixed-dim embedding vector."""
    # v1: TF-IDF over training corpus
    # v2 (远期): LLM embedding (sentence-transformers)

class BlockSelectionPolicy:
    """
    Policy network: goal_embedding → block activation probabilities.

    Architecture:
      goal_embedding (dim=D) → Linear(D, num_blocks) → sigmoid → per-block probability

    Training:
      REINFORCE with baseline:
      loss = -sum(log π(a|s) * (R - b))
      where:
        s = goal_embedding
        a = selected block subset (sampled from probabilities)
        R = scalar reward from workflow execution
        b = running average reward (baseline)
    """

class TopologyWeightPolicy:
    """
    When ConnectionResolver v2 encounters ambiguity (two blocks both provide
    a required capability), this policy provides preference weights.

    Architecture:
      goal_embedding (dim=D) → Linear(D, num_capability_pairs) → softmax

    This is optional and only kicks in when ambiguity exists.
    """

class PolicyGradientSelector:
    """
    Wraps ActivationBandit: when sufficient data, use PolicyGradientSelector.
    Falls back to ActivationBandit when data insufficient.

    select(goal, catalog) →
      1. encode(goal) → embedding
      2. policy(embedding) → block probabilities
      3. sample block subset from probabilities
      4. ConnectionResolver.resolve(candidates, catalog, strategy="capability")
      5. return ActivationResult + selected topology
    """
```

### 与现有模块的关系

```
GoalEncoder                         ← 新增
    ↓
BlockSelectionPolicy                ← 新增
    ↓
PolicyGradientSelector              ← 新增，wraps ActivationBandit
    ↓
ActivationSelector (greedy)         ← 已有，作为 fallback
    ↓
ConnectionResolver v2 (capability)  ← 已有，不需要改
    ↓
AssemblyCompiler                    ← 已有，不需要改
    ↓
RuntimeService                      ← 已有，不需要改
```

---

## GoalEncoder 详细设计

### v1: TF-IDF

```python
class TFIDFGoalEncoder:
    """
    Builds vocabulary from training corpus (assembly_goal strings).
    Transforms goal → sparse vector → truncated to top-K dimensions.
    """
    def __init__(self, max_features: int = 200):
        self.max_features = max_features
        self._vocab: Dict[str, int] = {}
        self._idf: Dict[str, float] = {}

    def fit(self, goals: List[str]) -> None:
        """Build vocabulary from training goals."""
        # tokenize all goals, compute IDF
        ...

    def encode(self, goal: str) -> List[float]:
        """Goal string → fixed-dim vector."""
        # TF-IDF + truncate to max_features
        ...
```

为什么先用 TF-IDF 不用 LLM embedding：
- 零外部依赖（不需要 sentence-transformers 或 API call）
- 训练速度快（纯 numpy）
- 200 samples 下 TF-IDF 和 LLM embedding 的下游效果差异不大
- 后续升级到 LLM embedding 只需替换 GoalEncoder，不影响 Policy

---

## BlockSelectionPolicy 详细设计

### 模型

```python
class BlockSelectionPolicy:
    def __init__(self, input_dim: int, num_blocks: int, lr: float = 0.01):
        # W: (input_dim, num_blocks), b: (num_blocks,)
        self.W = np.zeros((input_dim, num_blocks))
        self.b = np.zeros(num_blocks)
        self.lr = lr
        self.baseline = 0.0       # running average reward
        self.baseline_decay = 0.9  # exponential moving average

    def forward(self, embedding: np.ndarray) -> np.ndarray:
        """embedding → per-block probability (sigmoid)."""
        logits = embedding @ self.W + self.b
        return 1.0 / (1.0 + np.exp(-logits))  # sigmoid

    def sample(self, probs: np.ndarray) -> np.ndarray:
        """Sample binary mask from probabilities."""
        return (np.random.random(len(probs)) < probs).astype(float)

    def update(self, embedding, action, reward):
        """REINFORCE update with baseline."""
        probs = self.forward(embedding)
        advantage = reward - self.baseline
        # ∇ log π(a|s) for Bernoulli: a - σ(z) for each block
        grad_logits = action - probs  # (num_blocks,)
        # ∇ loss = -advantage * ∇ log π
        self.W += self.lr * advantage * np.outer(embedding, grad_logits)
        self.b += self.lr * advantage * grad_logits
        # Update baseline
        self.baseline = self.baseline_decay * self.baseline + (1 - self.baseline_decay) * reward
```

### 训练循环

```python
for sample in training_data:
    # 1. Encode goal
    embedding = encoder.encode(sample.assembly_goal)

    # 2. Forward pass → probabilities
    probs = policy.forward(embedding)

    # 3. Action = which blocks were actually selected (from training data)
    action = np.zeros(num_blocks)
    for bid in sample.selected_candidate_ids:
        if bid in block_to_idx:
            action[block_to_idx[bid]] = 1.0

    # 4. Reward = compute_reward(sample.reward_hints)
    reward = compute_reward(sample.reward_hints)

    # 5. Update policy
    policy.update(embedding, action, reward)
```

### 推理流程

```python
def select(self, goal, catalog):
    embedding = self.encoder.encode(goal)
    probs = self.policy.forward(embedding)

    # Deterministic: select blocks with prob > 0.5
    # (or sample for exploration during data collection)
    selected_ids = [
        block_id for block_id, prob in zip(self.block_ids, probs)
        if prob > 0.5 and block_id in catalog
    ]

    if not selected_ids:
        return self._bandit.select(goal, catalog)  # fallback

    candidates = [
        CatalogActivationCandidate(
            block_id=bid,
            matched_capabilities=list(catalog[bid].capabilities),
        )
        for bid in selected_ids
    ]

    return ActivationResult(
        candidates=candidates,
        complete=True,
        missing_capabilities=[],
    )
```

---

## Exploration vs Exploitation

### 训练时：ε-greedy + temperature

```python
def select_with_exploration(self, goal, catalog, epsilon=0.1, temperature=1.0):
    if random.random() < epsilon:
        # Exploration: use greedy selector (diverse coverage)
        return self._greedy.select(goal, catalog)

    embedding = self.encoder.encode(goal)
    logits = embedding @ self.W + self.b
    # Temperature scaling: higher T → more exploration
    probs = sigmoid(logits / temperature)
    action = sample(probs)
    ...
```

### 推理时：确定性

推理时不需要探索，直接用 prob > 0.5 确定性选择。

---

## 与 ConnectionResolver v2 的协作

Step 2 不修改 ConnectionResolver v2。拓扑仍然是确定性的 capability 依赖推断。

Policy Gradient 通过两种方式间接影响拓扑：

1. **Block 选择影响可用边**：选了不同的 block 子集 → ConnectionResolver 推断出不同的 DAG
2. **远期：优先级权重**（v2 扩展，本次不实现）：当歧义时（两个 block 都能满足同一个 input_requirement），
   TopologyWeightPolicy 提供偏好权重 → ConnectionResolver 选择权重高的边

---

## 数据需求与评估

### 数据需求

- 最低：200 ActivationTrainingSamples（含 assembly_goal + assembly_block_id）
- 推荐：500+ samples 覆盖多样化 goal
- 数据来源：`scripts/accumulate_training_data.py` 用 codex/claude 执行

### 评估指标

1. **Block 选择准确率**：policy 选的 block 子集 vs greedy 选的，哪个在 held-out goals 上
   获得更高平均 reward
2. **组合发现**：policy 是否学到了有价值的 block 组合（如 plan+execute 比 plan 单独好）
3. **OOD 处理**：对从未见过的 goal，policy 是否正确 fallback 到 greedy

### 离线评估方案

不需要真实执行也能评估——用已有 training data 做 train/test split：

```python
train_samples = dataset.samples[:160]  # 80%
test_samples = dataset.samples[160:]   # 20%

# Train on train_samples
policy.train(train_samples)

# Evaluate on test_samples
for sample in test_samples:
    predicted_blocks = policy.select(sample.assembly_goal, catalog)
    actual_reward = compute_reward(sample.reward_hints)
    predicted_reward = estimate_reward(predicted_blocks)  # from training data
    # Compare
```

---

## 实现计划

| 任务 | 文件 | 行数 | 复杂度 |
|------|------|------|--------|
| TFIDFGoalEncoder | shadowflow/assembly/policy.py | ~60 | 低 |
| BlockSelectionPolicy（linear + REINFORCE） | shadowflow/assembly/policy.py | ~80 | 中 |
| PolicyGradientSelector（wraps bandit） | shadowflow/assembly/policy.py | ~60 | 中 |
| 训练循环（从 ActivationTrainingDataset 训练） | shadowflow/assembly/policy.py | ~40 | 低 |
| 测试：encoder + policy + selector | tests/test_phase3_policy.py | ~150 | 中 |
| 评估脚本 | scripts/evaluate_policy.py | ~80 | 低 |
| **合计** | | **~470** | **中** |

### 依赖

- numpy（已在项目依赖中）
- 无其他新依赖

---

## 与 Phase 3 Step 3（远期 Graph-RL）的关系

```
Step 1: ActivationBandit (token affinity) ← 已完成
    ↓ 数据积累
Step 2: PolicyGradientSelector (TF-IDF + linear REINFORCE) ← 本任务
    ↓ 更多数据 + 验证
Step 3: Graph-RL / GNN
    - GoalEncoder 升级为 LLM embedding
    - BlockSelectionPolicy 升级为 GNN
    - 直接在 DAG 空间上做 policy gradient
    - 参考：AFlow (MCTS), Prompt2DAG
    - catalog 超过 10-20 个 block 后再考虑
```

Step 2 的设计刻意保持简单（TF-IDF + linear），因为：
- 当前 catalog 只有 8 个 block，神经网络没有优势
- 200 samples 不足以训练更复杂的模型
- 简单模型更容易 debug 和解释
- 升级到 Step 3 时只需替换 encoder 和 policy，不影响 selector 接口
