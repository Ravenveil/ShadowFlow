# Stanford 提出 LLM-as-a-Verifier：把验证变成第四条 Scaling 轴，用概率分数挑出真正正确的 Agent 轨迹

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

PAPER · 论文信息

**标题**LLM-as-a-Verifier: A General-Purpose Verification Framework

**作者**Jacky Kwok1†、Shulu Li2、Pranav Atreya2、Yuejiang Liu1、Yixing Jiang1、Chelsea Finn1、Marco Pavone1,3、Ion Stoica2、Azalia Mirhoseini1

**机构**1Stanford University；2UC Berkeley；3NVIDIA Research

**原文**https://arxiv.org/abs/2607.05391

**主页**https://llm-as-a-verifier.com

**代码**https://github.com/llm-as-a-verifier/llm-as-a-verifier

**插件**https://github.com/llm-as-a-verifier/TurboAgent

INSIGHT · 核心洞察

“

生成更多候选并不等于解决问题。长程 Agent 真正稀缺的能力，是在关键时刻把“看起来都不错”的轨迹分出高下。

一个代码 Agent 可以连续生成五条、十条甚至上百条解决路径，其中往往已经包含正确答案。真正困难的是：错误轨迹也会留下看似合理的文件、日志和解释，传统整数 Judge 很容易把它们与正确轨迹打成平手。生成端暴露出的能力，因此卡在了验证端。

这篇论文把 verification 视为继预训练、后训练与测试时计算之后的第四条 Scaling 轴。LLM-as-a-Verifier 对评分 token 的完整概率分布求期望，再沿分数粒度、重复评估、标准拆分三条轴增加验证计算；连续分数随后被同一套系统用于候选选优、进度监测和强化学习。

💡 一句话总结　本文提出 LLM-as-a-Verifier，以评分 token 概率期望和三维验证扩展替代离散裁决，在 Terminal-Bench V2 达到 86.5%。

86.5%

Terminal-Bench V2

87.4%

RoboRewardBench

≈1.8×

LIBERO 样本效率

HIGHLIGHTS · 本文看点

01

从第四条 Scaling 轴讲清研究动机

02

沿原文顺序拆解公式、PPT 与消融

03

覆盖正文全部图表及关键附录证据

01

INTRODUCTION

### 为什么论文要把“验证”单独列为一条 Scaling 轴？

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 图 1｜论文首页给出的跨领域结果：代码、机器人和医疗任务均使用同一验证思想。

论文先用结果说明这条路线值得研究：Terminal-Bench V2 为 86.5%，SWE-Bench Verified 为 78.2%，RoboRewardBench 偏好准确率为 87.4%，MedAgentBench 为 73.3%。这些数字来自不同模态和任务，却共享一个设计：不训练新的领域奖励模型，而是从现有 LLM 或 VLM 的评分分布中提取连续验证信号。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 图 2｜统一框架总览：多模态输入、三条验证扩展轴与三类下游用途。

论文随后从一个宏观变化切入：大模型能力提升已经形成三条成熟路径。Pre-training scaling扩大数据与计算，Post-training scaling通过偏好优化和强化学习校准行为，Test-time scaling在推理时增加采样、搜索或反思预算。但这些路径主要在扩展“生成”，负责判断结果是否真的正确的 verification 仍常停留在一次提示、一个整数分数。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 图 3｜论文将 Verification Scaling 与预训练、后训练、测试时扩展并列。

为什么这会成为瓶颈？因为 Agent 任务不是一句回答，而是由多轮观察、代码编辑和工具调用组成的长轨迹。两个候选可能都输出了目标文件，也都声称测试通过；区别却藏在是否修改了错误数据库、是否漏掉隐含约束、是否在日志中出现失败信号。把这种差异压成 1–5 的整数，很容易造成高平局率和错误排序。

「能力不只取决于模型能否生成正确轨迹，还取决于系统能否在候选池里认出它。」

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 图 4｜Verification Scaling 的三条轴：分数粒度、重复评估与评价标准拆分。

引言最后用图 4 预告全文主线：增大评分 token 粒度，让模型的细微信念不再被一个整数抹平；重复独立评估，压低随机方差；把复合评价拆成更简单的标准，减轻提示偏置与判断复杂度。三条轴分别处理量化误差、采样噪声和任务复杂度，后文第四节再逐项做控制实验。

论文的四项核心贡献

•概率化验证

对评分 token 的概率分布求期望，获得比离散 Judge 更细的轨迹分数。

•三维扩展

系统研究分数粒度 G、重复评估 K 与评价标准 C 如何互补地提升验证准确率。

•低成本选优

提出 Probabilistic Pivot Tournament，在候选增多时把两两比较成本从 O(N²) 降到 O(Nk)。

•超越终局排序

把同一连续信号用于 Agent 进度监测，以及机器人控制和数学推理中的稠密强化学习奖励。

02

PRELIMINARIES

### 原文的形式化起点：Agent 轨迹、奖励与验证对象

论文第二节先把问题写成有限时域 Markov Decision Process。对非数学读者，最重要的是理解六个对象：任务上下文 c、状态 s、动作 a、环境转移 P、奖励 R 和最大步数 H。对 LLM Agent 而言，状态不是一个静态页面，而是此前所有对话、观察与工具结果组成的历史；动作也不只是文字，还可能是代码编辑和工具调用。

从初始状态开始，Agent 在每个时间步观察当前状态并选择动作，最终形成轨迹 τ=(s₁,a₁,…,sH,aH)。因此，Verifier 面对的不是一句孤立回答，而是一整条可能很长的交互记录。它需要判断：这条轨迹是否满足任务要求、最终状态是否正确、过程里是否出现会让结果失效的错误。

传统奖励模型输出什么？

标准做法把语言模型提示为 Judge，让它生成一个离散分数 RLM(x,τ)∈{1,…,G}。这个接口简单，却把模型对多个分数的概率质量全部丢掉。例如模型可能对 4 分给 0.45、对 5 分给 0.44；argmax 最终只留下“4 分”，无法表达它几乎处在两个等级之间。**论文接下来所有方法设计，都在修复这次过早的信息压缩。**

Judge 与 Verifier 的概念差别

论文刻意区分两种角色：Judge 形成整体意见并给出裁决，Verifier 则试图确认某件事是否真的成立。对长程 Agent 来说，后者需要更细的证据检查和不确定性表达。LLM-as-a-Verifier 仍使用语言模型推理，但把输出接口从单个整数改造成连续概率奖励。

03

PROPOSED APPROACH

### 方法部分：从 Oracle headroom 到连续奖励与 PPT 排序

动机：候选池里已经有大量正确答案

论文第三节先问：如果选择器永不犯错，现有 Agent 能做到什么程度？在 Terminal-Bench V2 上，随着每题采样轨迹数增加，Oracle Pass@K 持续上升；汇集完整排行榜的候选后，覆盖率达到 **98.9%**。这不是实际系统成绩，而是“正确答案至少出现过一次”的上界。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 图 5｜Terminal-Bench V2 的 Oracle Pass@K 随每题候选数增加而接近 98.9%。

图中的 98.9% 与真实提交成绩之间，就是 Verifier 可以争取的 headroom。标准离散 Judge 在 Terminal-Bench 上约有 27% 的比较打平；训练专用 reward model 又会受训练分布约束，跨到机器人视频或医疗工具调用时未必泛化。论文因此追求一个无需额外训练、可跨模态、分数足够细的框架。

细粒度奖励：保留评分 token 的完整概率质量

给定任务 x、评价标准 c 和两条候选轨迹 τᵢ、τⱼ，论文构造一段成对评价提示。模型先分析两条轨迹，再在 <score_A> 与 <score_B> 标签中输出 1–20 级分数。实现上使用字母化 token，以便稳定提取 top logprobs。输入是任务与完整轨迹，过程是成对推理和打分，输出则是每个评分 token 的条件概率分布。

连续奖励写成 R(x,τ)=1/(CK)·ΣcΣkΣg pθ(vg|x,c,τ)φ(vg)。其中 G 是评分等级数量，K 是独立重复次数，C 是评价标准数量，φ(vg) 把有序 token 映射为标量。直观地说，系统把“每个分数有多可能”乘以对应数值后求和，再跨标准与重复评估取平均。不确定性没有被扔掉，而是成为最终分数的一部分。

奖励先线性归一化到 [0,1]，再通过 Bradley–Terry 模型把两条轨迹的分差变成软偏好概率 P(τᵢ≻τⱼ|x)。与硬胜负相比，0.52 和 0.95 表达了完全不同的胜利强度；这些概率可以在多轮比较中累积，支撑后面的候选排序。

PPT：用少量强候选充当枢轴

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 图 6｜Probabilistic Pivot Tournament 的五阶段流程。

•候选生成

先得到 N 条待选轨迹；PPT 不改变生成器，只接管后续验证。

•环形初赛

随机 Hamiltonian 环比较 N 组相邻候选，让每条轨迹恰好一次处于 A 位、一次处于 B 位，从期望上抵消位置偏置。

•枢轴选择

按环形初赛的平均偏好挑出 top-k 作为 pivots，把主要预算放在更可能正确的候选附近。

•集中比较

完成非枢轴对枢轴和枢轴内部的比较，把 O(N²) 全循环赛压缩为 O(Nk)。

•归一化选优

累积软胜率 wi，并除以每条候选参加比较的次数 ci，避免枢轴因出场更多而占便宜。

这套设计的关键不是随机少比几场，而是先用低成本环形比较寻找经验强者，再围绕强者分配预算。完整算法会返回 wi/ci 最高的轨迹。论文把位置偏置控制、预算集中和软概率聚合组合在同一个排序器里。

04

VERIFICATION SCALING

### 三条验证扩展轴：每一条分别在解决什么误差？

第四节进入控制实验。作者从 Terminal-Bench 中随机抽取 200 条、覆盖多个 Agent harness 的轨迹，使用能返回最多 20 个评分 token logprobs 的 Gemini 2.5 Flash 作为 Verifier。指标是成对验证准确率：对同一任务的一条成功轨迹和一条失败轨迹，Verifier 是否给成功轨迹更高分。

分数粒度：给内部信念更细的投影空间

G 从 1 增至 20 时，成对验证准确率从 73.1% 增至 **77.5%**。增加评分等级并没有为模型提供新轨迹信息；它改变的是解码接口，使原本会被四舍五入到同一整数的相近信念能够落在不同连续期望上。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 1｜正确与错误轨迹分差的信噪比 SNR 随评分粒度增加而提高。

论文用 SNR(G)=E[sc−si]/√Var(sc−si) 拆解原因。分子表示 Verifier 平均多偏好正确轨迹，分母表示这种偏好在不同样本上有多不稳定。G 从 1 增至 20 时，SNR 从 0.775 境至 0.799。信号分离更大、相对噪声更小，因此正确轨迹更容易排在前面。

query-optimize：为什么连续期望能消灭平局

任务要求优化一条 SQLite 查询，同时保证输出完全一致。正确轨迹在标准数据库上等待原查询完整运行 5 分 03 秒，并直接 diff；失败轨迹两次中断原查询，复制数据库后添加索引，再用不同物理访问路径得到的结果做比较，最后还删除验证文件。它看似认真验证，方法上却不能证明与隐藏 grader 的标准环境等价。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 2｜同一 SQL 轨迹对上，离散 Judge 与连续 Verifier 的 100 次比较结果。

1–5 离散 Judge 在 100 次中仅 12 次把正确轨迹排高，另外 88 次打平。对同一 5 档概率分布求期望后，69 次排高、0 次打平；再把 G 扩到 20，正确排序升至 **77 次**。案例说明模型推理文本已经识别出问题，但粗整数接口把“略好”“边际更直接”等不确定判断压成了相同分数。

重复评估：降低一次判断的方差

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 图 7｜连续 Verifier 与离散 Judge 随重复评估次数增加的准确率和平局率。

把 K 次独立评估平均，可视为底层期望奖励的 Monte Carlo 估计；如果采样近似独立，方差按 O(1/K) 下降，但系统偏差不会自动消失。K 从 1 增至 16 时，连续 Verifier 从 74.7% 升至 77.5%，离散 Judge 从 71.8% 升至 74.7%。

右图更能看出区别：离散 Judge 的平局率从 26.7% 降至 5.5%，连续 Verifier 在每个预算下都是 0。**一次连续评估已经达到 74.7%，与 16 次离散评估相当。** 后续重复仍有收益，但困难案例存在相关偏差，因此边际提升逐渐减小。

标准拆分：把一个复合问题变成三个更清楚的问题

长程代码任务里的“是否正确”同时混合了多个判断。论文把它拆成 Specification（是否满足所有要求）、Output（最终输出格式是否符合预期）和 Errors（日志与工具输出中是否有失败信号）。任一单项达到 75.2%–76.4%，三项集成达到 **78.3%**。它与粒度、重复评估互补，因为解决的是评价标准本身过于复杂的问题。

05

EXPERIMENTS

### 主实验：同一验证框架如何跨越四个基准？

第五节把 LLM-as-a-Verifier 作为 Trajectory Reward Model 用于测试时选优。共同流程是：生成策略为每题产生 N 条候选；Verifier 按 PPT 进行成对评分；累积并归一化偏好后，只提交排名最高的一条。未特别说明时使用 G=20、K=8 和三个评价标准。框架本身不做领域微调，但不同模态会换用能处理该输入的基础模型。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 3｜三个轨迹选优基准的 Pass@1、Oracle 上界与 LLM-as-a-Verifier 结果。

Terminal-Bench V2：同模型采样五条终端轨迹

Terminal-Bench V2 覆盖多步推理、文件操作与工具调用失败后的恢复。实验使用 Capy scaffold，从 GPT-5.5 为每题采样 N=5 条轨迹，Gemini 2.5 Flash 负责验证。候选池 Pass@1 为 83.1%，Oracle Pass@5 为 92.1%，选优后达到 **86.5%，提升 3.4 个百分点**。

这里的任务难点是：失败轨迹也可能留下语法正确的文件和看似合理的终端状态。Verifier 需要同时阅读任务规格、最终输出与中间错误信号。86.5% 仍低于 92.1% Oracle，说明选择器回收了部分 headroom，但验证并未被彻底解决。

SWE-Bench Verified：从三个模型家族中选一条补丁

SWE-Bench Verified 包含 500 个真实 GitHub issue，每题要求补丁通过维护者隐藏测试。候选池不是同模型多采样，而是分别取 Claude Opus 4.5、Gemini 3 Flash 和 MiniMax M2.5 的一条轨迹，形成 N=3 的异构池。平均 Pass@1 为 76.1%，Oracle Pass@3 为 84.4%，选优后达到 **78.2%，提升 2.1 个百分点**。

异构池更接近实际路由系统：不同模型的错误风格不同，Verifier 不能依赖某个生成器的固定措辞。结果说明连续验证信号可以在模型家族之间比较，但 6.2 个百分点的 Oracle 差距也显示仍有大量可选对却没有选中的正确补丁。

RoboRewardBench：输入从文本轨迹变成多帧视频

RoboRewardBench 给出同一自然语言指令下的两段机器人 rollout，要求判断哪段完成得更多。论文从基准随机抽取 500 对轨迹，使用 Qwen 3.6 35B 作为 VLM Verifier，设置 G=20、K=8。它必须跨多帧理解抓取、移动与放置进度，而不是只看最终一帧。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 4｜RoboRewardBench 偏好准确率：连续 Verifier 与专用奖励模型对比。

LLM-as-a-Verifier 达到 **87.4%**，高于同一 VLM 的离散 Judge（70.8%）、RoboReward-8B（81.4%）、Robometer-4B（78.8%）和 TOPReward（74.7%）。前两种专用模型分别使用约 4.5 万 episodes 和约 100 万 comparisons 训练，而论文方法以零样本方式应用。最值得注意的是：概率期望的收益从文本迁移到了视频。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 5｜连续验证把 RoboRewardBench 对人类标注的 MAE 从 1.11 降至 0.72。

论文还用 Mean Absolute Error 衡量预测奖励与人类标注的距离，数值越低越好。加入连续 Verifier 与 K=8 重复评估后，RoboReward 8B 的 MAE 从 1.11 降至 **0.72**。偏好准确率回答“两个视频谁更好”，MAE 则检查奖励尺度是否更接近人类；两项指标从不同角度支持同一结论。

MedAgentBench：在模拟电子病历环境中验证多步工具调用

MedAgentBench 涉及患者信息检索、指南查询和模拟 EHR 工具调用，验证错误本身可能具有安全含义。实验使用 AgentBench harness，从 Claude Opus 4.8 为每题采样 N=5 条轨迹。Pass@1 为 70.2%，Oracle Pass@5 为 75.0%，选优后达到 **73.3%，提升 3.1 个百分点**。

四个主结果是论文报告的点估计，正文没有为所有基准统一提供显著性检验。因此更稳妥的解读是：同一概率化框架跨设置持续产生正增益，而不是把每个小差值都解释为决定性胜出。

06

PROGRESS TRACKING

### 从最终选优到过程监测：连续分数能否跟踪任务进度？

第六节不再只给完整轨迹打分，而是依次截取 τ1:t：第 1 步前缀、第 2 步前缀，直到整条轨迹。若任务持续推进，后续前缀的分数应总体更高。论文用 Value-Order Correlation（VOC）衡量步骤时间顺序与 Verifier 分数排序的 Spearman 相关，VOC 越接近 1，表示分数越能单调反映进度。

![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/pZDxT91EqWCvOTUoAFKmEhTgxQN8siazAXAAduvb6icWDVMetnMB7SuK6AGAJGTS7H9BFmw8kOlZsiasRAxiaCEj9nDYmlOjribSibQMAUzUyk1xo/640?wx_fmt=png&from=appmsg&wxfrom=13&tp=wxpic#imgIndex=14)

— 图 8｜pytorch-model-cli 中成功轨迹持续升分，失败轨迹长期停留在低分区。

成功轨迹按 Read model.py → Install g compiler → Install CPU-only torch → Update hidden_dim → DONE 推进，分数从接近 0 逐步升到 1。失败轨迹安装体积更大的 torchvision，耗尽磁盘并触发编译错误，分数只缓慢抬升且最终远低于成功轨迹。图中展示的不是最终二分类，而是一条可实时观察的任务价值曲线++。

![图片](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWDLFbROhcAxPo3ib6UhfaZofLLxQDHZ4AGIAEpCfWjavVichpK21QWroia8WmSmtK4dSHxO1SNhe6HNXIiauZkS8ic37LlJzEV2Sj1A/640?wx_fmt=png&from=appmsg&wxfrom=13&tp=wxpic#imgIndex=15)

— 表 6｜Terminal-Bench V2 上成功与失败轨迹的 VOC。

在 500 对由同一模型骨干、同一任务生成的成功与失败轨迹上，Gemini 2.5 Flash（G=20）对成功轨迹的 VOC 为 **0.848±0.012**，失败轨迹为 0.769±0.016，差值 0.079。失败轨迹也可能在部分阶段前进，因此 VOC 不是简单的成败标签；差值反映的是成功路径更接近持续、单调的推进。

机器人进度：完整分布避免过早饱和

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 7｜RoboRewardBench 上的 VOC：LLM-as-a-Verifier 达到 0.966。

500 条 held-out 机器人轨迹上，Qwen 3.6 35B Verifier（K=5、G=20）达到 **0.966 VOC**，高于 RoboReward-8B 的 0.877、Robometer-4B 的 0.780 和 TOPReward 的 0.565。论文观察到 TOPReward 的 P(True) 往往很早饱和到 1.0，后续即使 rollout 失败也难以区分；完整评分分布的期望保留了更平滑的中间差异。

TurboAgent：把 Verifier 变成推理时代理

论文据此实现 TurboAgent。它作为 inference-time proxy 位于 Claude Code 或其他 OpenAI-API compatible 客户端与后端模型之间，不改 Agent harness：每次请求并行发送 N 份候选，使用 PPT 选出最佳响应，并在网页界面展示候选、验证分数和实时进度。排序器与监控器复用同一分数，是这项工作的系统价值之一。

07

DENSE REWARD

### 连续进度信号如何变成强化学习的稠密奖励？

第七节处理 credit assignment：当环境只在任务最终成功时给 1，其余步骤都给 0，算法很难知道哪些中间动作值得保留。论文把轨迹前缀的 Verifier 进度 ρt 加入环境奖励，或者把整段推理的相对质量加入组内奖励。它不是替换原始正确性，而是提供额外的过程梯度。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 图 9｜LLM-as-a-Verifier 在 LIBERO 与 MATH 上提升强化学习样本效率。

离策略：为 DSRL-SAC 的回放缓冲区重新标注奖励

机器人实验在 LIBERO ketchup 任务上微调 π0 vision-language-action policy。每条 rollout 均匀抽取 10 帧，Qwen 3.6 35B 以 G=20、K=3 计算进度曲线 ρt，再使用 rt=r_env_t+λρt、λ=1 重标注 transition，并写入 SAC replay buffer。策略、优化器和其他设置保持不变。

5 个随机种子下，达到 0.2–0.6 目标成功率所需环境步数约减少到稀疏奖励的 1/1.8，论文概括为 **≈1.8× 样本效率**；最终成功率也从 0.69 升至 0.76。这里的“1.8×”指达到匹配成功率所需步数之比，不是最终成功率提高了 80%。

在策略：当一组答案全错时，仍区分推理质量

MATH 实验用 GRPO 微调 Qwen3-8B。每个 prompt 采样 M=16 个回答，64 组组成一个优化 batch，学习率为 2×10⁻⁵，最大生成长度 512 token。训练早期若整组最终答案都错误，纯 correctness reward 会全部相同，组相对 advantage 因此坍缩为 0。

论文让 Gemini 2.5 Flash 用 PPT 比较每个 completion 的推理轨迹，得到组内标准化 reasoning reward，再以 β=0.1 加到正确性与格式奖励上。3 个随机种子下达到匹配准确率所需优化步数约减少 10%，即 **≈1.1× 样本效率**。增益小于机器人实验，但它展示了“最终都错”时仍可利用过程质量的路径。

08

DISCUSSION

### 论文如何定位自己，以及哪些边界需要保留？

它与 Test-Time Scaling 和 LLM-as-a-Judge 的关系

相关工作中，一类方法通过 chain-of-thought、搜索和 Best-of-N 增加测试时生成计算；另一类工作训练或提示 Judge、ORM、PRM 来评价回答。本文的切入点是：即使候选生成策略不变，Verifier 本身也可以沿 G、K、C 扩展。它不是否定生成 scaling，而是在生成—验证闭环中补上长期缺少系统刻画的一侧。

与专门训练的 reward model 相比，LLM-as-a-Verifier 的优势是训练免费并能跨文本、图像和视频迁移；代价是依赖基础模型本身的推理能力、评分提示和 logprob 接口。连续分数减少了离散化损失，但不会让模型自动发现它完全不理解的错误。

未来方向：从固定预算走向自适应验证

•Logit 可用性

直接计算评分期望需要 scoring-token logits，部分受限 API 的前沿模型不提供这一接口。

•标准生成

当前 criteria decomposition 主要靠人工设计，未来可以按任务学习或动态生成。

•算力分配

重复评估目前使用固定 K，未来可根据 Verifier 自身的不确定性给困难样本更多预算。

•多轮强化学习

现有稠密奖励实验仍以单轮设置为主；多轮长轨迹中逐步分配奖励是更困难的下一步。

从论文机制推导出的部署蓝图

下面是基于论文模块的工程推论，而非作者规定的唯一实现：先保留现有 Agent 生成 N 条候选；再把整数 Judge 替换为连续概率分数；根据风险和延迟预算调节 G、K、C；候选较多时用 PPT；运行过程中记录轨迹前缀分数，用于暴露停滞或回退；若进入训练，则把分数作为环境奖励或正确性奖励的辅助项。

「这项工作的核心不是“再加一个 Judge”，而是把验证信号变成可测量、可扩展、可在选优—监控—训练之间复用的系统组件。」

09

APPENDIX EVIDENCE

### 附录精选：泛化、预算权衡与受限 API 的补充证据

更换 Agent harness，增益是否还在？

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 8｜Terminal-Bench V2 上更换 Terminus-Kira 与 Terminus-2 后的结果。

附录 B.1 把 Capy 换成两套不同 scaffold，但保持 Gemini 2.5 Flash、G=20、K=8 和三标准分解。Terminus-Kira 从最强对比的 74.8% 提高到 **79.4%**；Terminus-2 从 Gemini 3.1 Pro 的 68.5% 提高到 **71.2%**，相对 Claude Opus 4.6 的 62.9% 则高 8.3 个百分点。结果支持 Verifier 在读取任务状态，而不是记忆某种 harness 语法。

PPT 的预算—准确率曲线

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 9｜每题 20 条候选时，PPT 随枢轴数 k 增加的预算与准确率。

实验包含 89 个 Terminal-Bench V2 任务、每题 20 条 Terminus-2 轨迹。PPT k=3 用 4,723 个 pair queries 达到 66.17%，超过 V1 各预算下的最好 65.85%；k=9 用 9,630 个 pairs 达到 67.13%，接近全循环赛 13,111 个 pairs 的 67.42%。按表中数字计算，比较数减少约 **26.5%**，准确率低 0.29 个百分点。

把 Verifier 用作 PRM：每一步都从候选动作中选择

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 10｜采样动作数从 1 增至 9 时，逐步验证的 Pass@1。

当 LLM-as-a-Verifier 充当 Process Reward Model，每个 Agent 步骤都生成 k 个动作并由 Verifier 选一个继续。k 从 1 增至 9 时，TauBench Pass@1 从 48.7 提高到 **55.7**，Terminal-Bench 从 49.8 提高到 **54.3**。这把“终局选一条轨迹”进一步细化为“每一步都做测试时选优”。

把 Verifier 用作 ORM：代码与数学的 Best-of-N

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 11｜SWE-Bench Lite、AIME、HMMT 上的 outcome-level 选优。

在 2N 验证预算下，LLM-as-a-Verifier 在 SWE-Bench Lite、AIME、HMMT 上分别达到 **33.0、90.0、73.3**。相对 base model 的 23.5、71.5、52.0，绝对提升为 9.5、18.5、21.3 个百分点；它也在更低预算下达到或超过 3N 的 V1 pairwise baseline。

机器人重复评估：增益跨模态保持

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 图 10｜RoboRewardBench 上重复评估次数与视频帧数的影响。

左图显示 K 从 1 增至 8，轨迹偏好准确率从 81.5% 升至 **87.4%**，并逐渐接近噪声地板；各预算下都高于离散 Judge 与训练型奖励模型。右图还比较 max_frames=4、8、16：更多视觉上下文通常更好，说明视频 Verifier 同时受评估重复数和可见轨迹长度影响。

闭源模型不给 logprob，如何恢复连续奖励？

附录 B.6 提出两阶段 workaround。第一阶段让 GPT-5.5 阅读两条轨迹，输出自由文本 reasoning 和离散 1–10 分；第二阶段把任务、轨迹与这段 reasoning 转交给可读 logits 的 Gemini 2.5 Flash（G=20），只让它负责把推理投影为连续评分分布。前沿闭源模型提供领域推理，开放 Verifier 提供校准信号。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 12｜GPT-5.5 离散评分与两阶段连续方案的准确率和平局率。

K=1 时，直接使用 GPT-5.5 整数分数的准确率为 74.9%、平局率 10.9%；两阶段方案达到 **80.1%**，提升 5.2 个百分点，并把平局降为 0。K=16 时，两者为 79.1% 与 81.2%，连续方案仍领先 2.1 个百分点。它证明受限 API 并非完全无法使用，但会增加第二个模型和一次额外推理阶段的成本。

综合正文与附录，LLM-as-a-Verifier 给出的不是一个固定最佳配置，而是一组可以按场景分配的验证旋钮：先保留概率分布，再决定要把多少计算放在更细的分数、更多重复、更多标准、更大的候选池或更长的视频上下文上。**验证因此第一次像生成一样，拥有了可系统扩展的计算维度。**

END

我是 MindChain.AI。

如果你觉得今天这篇有收获，欢迎**关注**、**点赞**、**转发**、**喜欢**四连，我们下篇见。

↙ 点击左下角**「阅读原文」**，查看论文全文

暂无评论