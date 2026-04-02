# 01. GNN 与图学习总览

## 这批材料关注什么

这一批主要看近两年的图学习总览，目的是先厘清三件事：

1. 现在图学习社区的主流演进方向是什么
2. `Graph Transformer / Graph Foundation Model` 是否真的天然优于经典 GNN
3. 这些进展对 `ShadowFlow` 是“直接可用能力”，还是“设计启发”

## 核心材料

1. **Graph Foundation Models: A Comprehensive Survey**  
   来源：<https://arxiv.org/abs/2505.15116>  
   本地：[`2025-graph-foundation-models-survey-2505.15116.pdf`](../papers/2025-graph-foundation-models-survey-2505.15116.pdf)

2. **A Survey of Graph Transformers: Architectures, Theories and Applications**  
   来源：<https://arxiv.org/abs/2502.16533>  
   本地：[`2025-graph-transformers-survey-2502.16533.pdf`](../papers/2025-graph-transformers-survey-2502.16533.pdf)

3. **Classic GNNs are Strong Baselines: Reassessing GNNs for Node Classification**  
   来源：<https://arxiv.org/abs/2406.08993>  
   本地：[`2024-classic-gnns-strong-baselines-2406.08993.pdf`](../papers/2024-classic-gnns-strong-baselines-2406.08993.pdf)

4. **Improving the Effective Receptive Field of Message-Passing Neural Networks**  
   来源：<https://arxiv.org/abs/2505.23185>  
   本地：[`2025-effective-receptive-field-mpnn-2505.23185.pdf`](../papers/2025-effective-receptive-field-mpnn-2505.23185.pdf)

## 先提炼出的判断

### 1. Graph Foundation Model 很热，但离“引擎内核能力”还很远

从 survey 的视角看，图基础模型更像一个大方向：

- 统一预训练
- 通用图表征
- 下游适配
- 跨任务迁移

它对我们真正重要的地方，不是“马上接进去”，而是提醒我们：

**如果未来 `ShadowFlow` 要做运行数据挖掘、工作流模式推荐、失败路径聚类、异常检测，typed runtime graph 会是很自然的训练/分析对象。**

### 2. Graph Transformer 很重要，但不是“天然更强”

Graph Transformer 代表的是更强的结构编码与长程建模能力，但并不意味着它在所有实际任务里都会稳定优于经典 GNN。

`Classic GNNs are Strong Baselines` 的提醒很直接：

- 很多场景下，经典方法调好以后依然非常强
- 新模型更复杂，不等于就更适合真实系统
- 真问题可能不是表达能力不足，而是任务定义不清、评估不对、语义没建模好

对 `ShadowFlow` 的启发是：

**先把运行图语义做好，再考虑是否需要学习模型介入。**

### 3. 长程依赖与过度压缩，是图建模里的真实问题

消息传递模型会遇到：

- over-squashing
- 有效感受野不足
- 多步依赖难以保真

这对我们不是要立刻上 MPNN，而是有一个设计提醒：

**如果未来要把运行图喂给分析模型，必须保留足够显式的 typed edges，而不是把很多关系都压平到一条“通用边”里。**

## 对 ShadowFlow 的直接结论

1. 暂时不要把 GNN 当作运行时核心能力
2. 可以把它看作后续的“图分析层 / 推荐层 / 诊断层”
3. 现在最该做的是把运行图数据结构建对，为以后做图分析留接口

