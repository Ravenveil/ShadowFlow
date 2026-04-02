# 02. 动态图与时间演化

## 为什么动态图库和我们更相关

相较于“静态图表示学习”，动态图对 `ShadowFlow` 更贴近，因为我们的系统天然包含：

- workflow 定义
- run 级实例
- step 级事件
- checkpoint 快照
- memory event 流
- 人为干预动作

这些都说明我们面对的不是一张静态图，而是一个随时间演化的运行图。

## 核心材料

1. **A Comprehensive Survey of Dynamic Graph Neural Networks: Models, Frameworks, Benchmarks, Experiments and Challenges**  
   来源：<https://arxiv.org/abs/2405.00476>  
   本地：[`2024-dynamic-gnn-survey-2405.00476.pdf`](../papers/2024-dynamic-gnn-survey-2405.00476.pdf)

2. **Causality-Inspired Spatial-Temporal Explanations for Dynamic Graph Neural Networks**  
   来源：<https://proceedings.iclr.cc/paper_files/paper/2024/file/6e2a1a8a037f9a06004fe651054e8938-Paper-Conference.pdf>  
   说明：官方 PDF 直连当前抓取受限，暂保留远程链接

## 先提炼出的判断

### 1. 需要明确区分“结构、状态、事件”

动态图研究通常都会把下面几层拆开：

- 图结构本身
- 节点/边状态
- 随时间到来的事件

对 `ShadowFlow` 的映射非常自然：

- `workflow graph`：静态结构
- `run graph`：一次执行态
- `checkpoint`：时序快照
- `memory_event / trace / artifact emission`：事件流

### 2. 时间不是附加属性，而是本体的一部分

一旦我们接受 runtime graph 是演化图，就需要在 contract 里认真对待：

- 事件先后
- checkpoint lineage
- resume / retry / cancel 这种操作的时间位置
- 某条边是自然执行产生，还是人为干预产生

### 3. “任务树”更适合被理解为动态投影

从动态图视角看，`task tree` 不是另一套世界观，而是运行图在某些关系类型上的过滤结果。

也就是说：

- 本体仍然可以是 graph
- `task tree` 是一种观察方式
- `artifact graph`、`memory graph`、`run lineage graph` 也一样都是 projection

## 对 ShadowFlow 的直接结论

1. 需要把 `run graph` 当作正式对象，而不是只保留 `RunResult`
2. 需要给运行时关系加类型，而不是都放进 metadata
3. 需要给“事件”和“快照”分别定义查询视图

