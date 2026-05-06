# 03. 因果推断、因果发现与图

## 为什么这批资料重要

因果材料对 `ShadowFlow` 的价值，不在于让我们去做学术型因果发现系统，而在于它迫使我们更严肃地区分：

- 依赖
- 相关
- 生成
- 委派
- 干预
- 恢复

这些关系在一个运行时系统里不能混成一类。

## 核心材料

1. **A Survey of Out-of-distribution Generalization for Graph Machine Learning from a Causal View**  
   来源：<https://arxiv.org/abs/2409.09858>  
   本地：[`2024-ood-generalization-graph-ml-causal-view-2409.09858.pdf`](../papers/2024-ood-generalization-graph-ml-causal-view-2409.09858.pdf)

2. **Graph Out-of-Distribution Generalization via Causal Intervention**  
   来源：<https://arxiv.org/abs/2402.11494>  
   本地：[`2024-graph-ood-generalization-causal-intervention-2402.11494.pdf`](../papers/2024-graph-ood-generalization-causal-intervention-2402.11494.pdf)

3. **Causal GNNs: A GNN-Driven Instrumental Variable Approach for Causal Inference in Networks**  
   来源：<https://arxiv.org/abs/2409.08544>  
   本地：[`2024-causal-gnns-iv-network-causal-inference-2409.08544.pdf`](../papers/2024-causal-gnns-iv-network-causal-inference-2409.08544.pdf)

4. **The Landscape of Causal Discovery Data: Grounding Causal Discovery in Real-World Applications**  
   来源：<https://proceedings.mlr.press/v275/brouillard25a.html>  
   本地：[`2025-landscape-of-causal-discovery-data-brouillard25a.pdf`](../papers/2025-landscape-of-causal-discovery-data-brouillard25a.pdf)

5. **Learning Causal Graphs at Scale: A Foundation Model Approach**  
   来源：<https://arxiv.org/abs/2506.18285>  
   本地：[`2025-learning-causal-graphs-at-scale-2506.18285.pdf`](../papers/2025-learning-causal-graphs-at-scale-2506.18285.pdf)

6. **Exploring Causal Learning through Graph Neural Networks: An In-Depth Review**  
   来源：<https://arxiv.org/abs/2311.14994>  
   本地：[`2023-causal-learning-through-gnns-review-2311.14994.pdf`](../papers/2023-causal-learning-through-gnns-review-2311.14994.pdf)

## 先提炼出的判断

### 1. 因果视角最重要的启发是“干预语义”

在运行时系统里，`resume`、`retry`、`cancel`、`spawn child run` 并不是普通状态变化，它们更像对执行图进行的干预。

这意味着后续如果我们做图 contract，最好能表达：

- 哪些边是自然执行产生的
- 哪些边是外部系统/宿主/人工干预产生的

### 2. 真实系统不要只盯结构图好不好看

因果发现领域反复提醒：

- synthetic benchmark 容易高估方法能力
- 真实世界数据脏、偏、缺、混杂
- 真正难的是可解释、可迁移、可落地

对 `ShadowFlow` 的提醒也很直接：

**我们设计 graph runtime 时，要优先保证可观测、可追踪、可解释，而不是先追求形式上多漂亮。**

### 3. 关系类型必须显式化

如果后面我们真的把运行图用于分析、检索、推荐或异常识别，下面这类边必须分开：

1. `control_flow`
2. `conditional_flow`
3. `delegation`
4. `handoff`
5. `produces_artifact`
6. `emits_memory_event`
7. `resume_from`
8. `retry_of`
9. `derived_from_checkpoint`

因果视角的价值就在这里：

**不是所有边都代表同一种语义，更不是所有边都可以被同样地干预。**

