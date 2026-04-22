# Spontaneous Assembly Papers

> 目的：收集与 `ShadowFlow` 自发装配 / 自发协作 / RL / 图学习 / 因果归因相关的核心论文入口

## 图强化学习 / Graph RL

1. Graph Reinforcement Learning for Combinatorial Optimization: A Survey and Unifying Perspective  
   2024  
   <https://arxiv.org/abs/2404.06492>

2. Survey on Graph-Based Reinforcement Learning for Networked Coordination and Control  
   2025  
   <https://www.mdpi.com/2673-4052/6/4/65>

## 强化学习与图神经网络结合

1. Graph Neural Networks and Reinforcement Learning: A Survey  
   2023  
   <https://www.intechopen.com/chapters/87170>

2. Graph Neural Network-based Multi-agent Reinforcement Learning for Resilient Distributed Coordination of Multi-Robot Systems  
   2024  
   <https://arxiv.org/abs/2403.13093>

3. QMIX-GNN: A Graph Neural Network-Based Heterogeneous Multi-Agent Reinforcement Learning Model for Improved Collaboration and Decision-Making  
   2025  
   <https://www.mdpi.com/2076-3417/15/7/3794>

4. A multi-agent reinforcement learning scheduling algorithm integrating state graph and task graph structural modeling for ride-sharing dispatching  
   2026  
   <https://www.nature.com/articles/s41598-026-35004-8>

## 因果强化学习 / Causal RL

1. Causal Reinforcement Learning: A Survey  
   2023  
   <https://arxiv.org/abs/2307.01452>

2. A Survey on Causal Reinforcement Learning  
   2023 arXiv / 2025 TNNLS  
   <https://arxiv.org/abs/2302.05209>

3. Reinforcement learning-based SDN routing scheme empowered by causality detection and GNN  
   2024  
   <https://www.frontiersin.org/journals/computational-neuroscience/articles/10.3389/fncom.2024.1393025/full>

4. Causal Reinforcement Learning for Knowledge Graph Reasoning  
   2024  
   <https://www.mdpi.com/2076-3417/14/6/2498>

## LLM 多智能体协作 / 自发演化

1. AgentNet: Decentralized Evolutionary Coordination for LLM-based Multi-Agent Systems  
   2025  
   <https://arxiv.org/abs/2504.00587>

2. LLM Collaboration With Multi-Agent Reinforcement Learning  
   2025  
   <https://arxiv.org/abs/2508.04652>

## 神经模块网络 / Neural Module Networks（ShadowFlow 祖师爷）

> 2026-04-09 补充：ShadowFlow 的核心命题"积木块神经元式激活"在学术上的直接祖先。NMN 在张量层面做了 10 年前就有的事情，ShadowFlow 把它抬升到工作流层级 + 多 agent 协作 + 大语言模型积木。

1. Neural Module Networks  
   Andreas, Rohrbach, Darrell, Klein. CVPR 2016  
   <https://arxiv.org/abs/1511.02799>  
   **核心**：把视觉问答分解成可组合的子结构，按语法动态实例化模块网络，每个模块专精一件事（识物 / 认色 / 计数），模块可复用。**对 ShadowFlow 的意义**：证明"动态组合小模块"这一范式早在 10 年前就有学术支撑，ShadowFlow 是它在工作流层级的翻版。

2. Learning to Compose Neural Networks for Question Answering  
   Andreas et al. NAACL 2016  
   <https://arxiv.org/abs/1601.01705>  
   **核心**：NMN 的第二篇，强化"端到端训练 + 语法解析 → 模块选择"的管道。

## Embodied Agent + 持续学习 / 技能库自动生长

> 2026-04-09 补充：对应 ShadowFlow post-hackathon 的"积木库自动生长"方向 + "线下机器人"愿景。

1. Voyager: An Open-Ended Embodied Agent with Large Language Models  
   Wang et al. (Caltech / Stanford / UT / NVIDIA). 2023  
   <https://arxiv.org/abs/2305.16291> | [项目主页](https://voyager.minedojo.org/) | [GitHub](https://github.com/MineDojo/Voyager)  
   **核心**：Minecraft 里第一个 LLM 驱动的**终身学习** embodied agent。三大组件：① 自动课程（最大化探索）② **持续增长的技能库**（存储可执行代码，技能"时间上可延展、可解释、可组合"）③ 迭代提示（环境反馈 + 执行错误 + 自我验证）。比 SOTA 多 3.3x 物品 / 2.3x 距离 / 15.3x 科技树速度。**对 ShadowFlow**：技能库 = 积木库；Voyager 自动写新技能 = post-hackathon 的"自动生长积木库"延伸。

2. LLM-Empowered Embodied Agent for Memory-Augmented Task Planning in Household Robotics  
   2025  
   <https://arxiv.org/html/2504.21716>  
   **核心**：家居机器人 + 三 agent（routing / task planning / knowledge base）+ memory-augmented。**对 ShadowFlow**：线下机器人场景的学术对应。

3. Embodied AI Agents: Modeling the World  
   2025  
   <https://arxiv.org/html/2506.22355v1>

4. RoboOS: A Hierarchical Embodied Framework for Cross-Embodiment and Multi-Agent Collaboration  
   2025  
   <https://arxiv.org/html/2505.03673v1>  
   **核心**：Brain-Cerebellum 分层架构，跨 embodiment 多 agent 协作。开源。

5. Towards Embodied Agentic AI: Review and Classification of LLM- and VLM-Driven Robot Autonomy  
   2025  
   <https://arxiv.org/html/2508.05294v4>

## 工作流生成 / 自然语言 → workflow

> 2026-04-09 补充：对应 ShadowFlow 的路径 1（自然语言到工作流）。

1. WorkTeam: Constructing Workflows from Natural Language with Multi-Agent Collaboration  
   NAACL 2025 Industry Track  
   <https://aclanthology.org/2025.naacl-industry.3.pdf>  
   **核心**：三 agent 分工（Supervisor 理解意图 / Orchestrator 协调 / Filler 填充）从自然语言构造工作流。**对 ShadowFlow**：学术上证明"NL→workflow"是活跃问题。但 WorkTeam 产出静态工作流，没有从执行反馈学习——ShadowFlow 比它多一层"训练后的激活收敛"。

## 老虎机学习器 × LLM（ShadowFlow ActivationBandit 的直接对应线）

> 2026-04-09 补充：ShadowFlow 的 `ActivationBandit` 对应的学术线。这是一个 2024-2026 年非常活跃的方向。

1. Bandits, LLMs, and Agentic AI (IBM, AAAI 2026 Tutorial)  
   <https://research.ibm.com/publications/bandits-llms-and-agentic-ai>  
   **核心原话**：应用 bandit 方法到 LLM 和 agentic 系统，LLM 按自主性行动并从反馈中适应。**混合方法**：数值型 contextual bandit 帮助精炼 prompt，而 LLM 增强 bandit 使用的上下文。**对 ShadowFlow**：IBM 把这个方向列为 AAAI 2026 专题教程，证明 bandit + LLM 混合是 2026 顶会热点。

2. Neural Bandit Based Optimal LLM Selection for a Pipeline of Tasks  
   2025  
   <https://arxiv.org/html/2508.09958v1>  
   **核心**：用神经老虎机学"什么任务用哪个 LLM"。**对 ShadowFlow**：ShadowFlow 的 ActivationBandit 做的是一样的事情，但 action space 更大——不只选 LLM，而是选"哪组积木 + 怎么连"。

3. Beyond Numeric Rewards: In-Context Dueling Bandits with LLM Agents  
   2024  
   <https://arxiv.org/abs/2407.01887>  
   **核心**：LLM 能做 zero-shot 的"对比两个选项"决策。**对 ShadowFlow**：可用在评审积木里（让独立 LLM 比较两个 assembly）。

4. When Do We Need LLMs? A Diagnostic for Language-Driven Bandits  
   <https://arxiv.org/html/2604.05859v1>  
   **核心**：研究什么时候该上 LLM，什么时候纯 bandit 够了。对 ShadowFlow 工程选型有直接参考价值。

5. LLM-Based Agents for Tool Learning: A Survey  
   Data Science and Engineering, Springer 2025  
   <https://link.springer.com/article/10.1007/s41019-025-00296-9>  
   **核心**：整个"Tool Learning Agents"子领域的综述。ShadowFlow 在这个 scope 里。

## 混合专家 / MoE 动态路由

> 2026-04-09 补充：ShadowFlow 的"神经元式动态激活"在 2025 顶会热点线上的对应。

1. Mixture of Experts in Large Language Models (Survey)  
   2025  
   <https://arxiv.org/html/2507.11181v2>  
   **核心**：2025 趋势是小参数 + 多专家（DeepSeek-V3 256 个专家），细粒度 expert division + 动态路由。**对 ShadowFlow**：ShadowFlow 的"激活学习器选子集积木"和 MoE 的"路由器选子集 experts"命题完全同构。

2. LLMoE: LLM-Based Routing in Mixture of Experts  
   Liu & Lo 2025  
   <https://arxiv.org/abs/2501.09636>  
   **核心**：用预训练 LLM 代替传统学习门控网络做专家路由。**对 ShadowFlow**：post-hackathon 方向——用 LLM 路由器替代（或补充）bandit 的 token 亲和度。

3. MasRouter: Learning to Route LLMs for Multi-Agent System  
   ACL 2025  
   <https://aclanthology.org/2025.acl-long.757.pdf>  
   **核心**：专门研究多 agent 系统里怎么 route LLM。**对 ShadowFlow**：多 agent 路由学习的直接对应。

4. Router-R1: Routing as Sequential Decision Process  
   Zhang et al. 2025  
   **核心**：routing 作为序列决策过程，多步推理动态路由。**对 ShadowFlow**：激活学习器可以从"一次性选"升级到"多步激活"。

5. Towards Generalized Routing: Model and Agent Orchestration for Adaptive and Efficient Inference  
   2025  
   <https://arxiv.org/html/2509.07571v1>

## 方法论参考 / Methodology References

> 2026-04-09 补充：几篇和 ShadowFlow 训练方法论相关的方法论参考。

1. Self-Refine: Iterative Refinement with Self-Feedback  
   Madaan et al. 2023  
   **核心**：LLM 生成 → 批评自己 → 修正，通过自我对话迭代改进。**对 ShadowFlow**：reviewer 积木的方法论支撑。

2. HyperNetworks  
   Ha et al. 2016  
   <https://arxiv.org/abs/1609.09106>  
   **核心**：一个网络生成另一个网络的参数。**对 ShadowFlow**：可作为"对话层生成激活层参数"的学术背书。

## 序列建模范式 / Sequence Modeling as Unified Framework（v6 Transformer 范式核心前身）

> 2026-04-09 v6 补充：ShadowFlow 从 bandit 范式（v5）升级到 Transformer 范式（v6）后，核心学术前身转移到"把非语言序列当 token 训 Transformer"这一研究线。User 提出的"工作流元"（workflow token）概念直接对应下列工作。

1. **Decision Transformer: Reinforcement Learning via Sequence Modeling** （**v6 最直接前身**）  
   Chen et al. NeurIPS 2021  
   <https://arxiv.org/abs/2106.01345>  
   **核心**：把强化学习问题抽象成**序列建模**问题。轨迹由 (return-to-go, state, action) 三种 token 组成，送进因果掩码 Transformer，用 next-action prediction 损失训练。在 Atari、OpenAI Gym、Key-to-Door 上匹敌或超过 SOTA 离线 RL 方法。**对 ShadowFlow v6 的意义**：直接证明"非语言序列可以用 Transformer 训练"。ShadowFlow 的 workflow token 完全对应 Decision Transformer 的 trajectory token。**这是 v6 论文里最核心的对照前身**。

2. **Trajectory Transformer: Offline Reinforcement Learning as One Big Sequence Modeling Problem**  
   Janner et al. NeurIPS 2021  
   <https://trajectory-transformer.github.io/trajectory-transformer-neurips-2021.pdf>  
   **核心**：和 Decision Transformer 同期但更激进——整个 RL 问题完全当序列建模，连 reward 都预测。

3. **Task Tokens: A Flexible Approach to Adapting Behavior Foundation Models**  
   2025  
   <https://arxiv.org/abs/2503.22886>  
   **核心**：用 Transformer 架构学习一个新的任务特定编码器，通过 RL 把观察映射成 tokens 作为额外输入。**对 ShadowFlow v6**：证明"任务 tokenization"是 2025 年活跃研究方向。

4. **AFLOW: Automating Agentic Workflow Generation**  
   ICLR 2025  
   <https://arxiv.org/pdf/2410.10762>  
   **核心**：自动工作流优化用 MCTS（蒙特卡洛树搜索）+ 代码表示的 workflows。比手工设计好 5.7%，比其他自动工作流优化工作好 19.5%，平均性能 80.3%。**对 ShadowFlow v6**：这是最近的工作流优化工作，但它用 **MCTS 而非 Transformer**。**v6 论文里作为重要对比 baseline**——ShadowFlow v6 证明 Transformer 自回归生成比 MCTS 搜索更优雅。

5. **Unified Action Tokenization in Machine Learning** （综述）  
   <https://www.emergentmind.com/topics/action-tokenization>  
   **核心**：统一的 tokenization 把视觉、语言、动作映射到同一个 token 空间，让自回归 Transformer 建模多模态长期依赖。**对 ShadowFlow v6**：workflow token 加入这个"统一 token 空间"家族。

6. **In-Context Decision Transformer: Reinforcement Learning via Hierarchical Chain-of-Thought**  
   2024  
   <https://arxiv.org/html/2405.20692v1>  
   **核心**：Decision Transformer 的升级版，用层级 chain-of-thought 做上下文内决策。**对 ShadowFlow v6**：post-hackathon 升级方向的参考。

## Gemma 4 微调工具链 / Gemma 4 Fine-tuning Toolchain（v6 工程基础）

> 2026-04-09 v6 补充：v6 的工程实现依赖在 RTX 5060 Laptop 8GB VRAM 上微调 Gemma 4 2B。以下是验证可行性的关键资源。

1. **Unsloth Gemma 4 Fine-tuning Guide**  
   <https://unsloth.ai/docs/models/gemma-4/train>  
   **核心**：Gemma 4 E2B LoRA 在 8-10GB VRAM 上可跑。LoRA + gradient checkpointing + 4bit 量化。**对 ShadowFlow v6**：直接的工程实现参考。

2. **How to Fine-Tune Google Gemma 4 Locally: A Complete LoRA/QLoRA Guide**  
   BSWEN 2026  
   <https://docs.bswen.com/blog/2026-04-03-how-to-fine-tune-gemma-4-locally/>

3. **Gemma-2-2b-it Fine-tuning on a Local Laptop (实战案例)**  
   Timo Laine, Feb 2025  
   <https://medium.com/@timo.au.laine/gemma-2-2b-it-fine-tuning-on-a-local-laptop-using-s-groups-q-a-data-2c621f43629e>  
   **核心**：本地笔记本跑 Gemma 2-2b-it LoRA 微调的真实案例。**对 ShadowFlow v6**：证明消费级硬件路径可行。

## 神经元模块网络训练方法 / Neural Module Networks Training（详细）

> 2026-04-09 v6 补充：user 明确问 "NMN 论文的网络怎么搞的"，所以单独列出 NMN 训练方法的完整文献。

1. **Neural Module Networks (原版)**  
   Andreas, Rohrbach, Darrell, Klein. CVPR 2016  
   <https://arxiv.org/abs/1511.02799>  
   源码：<https://github.com/jacobandreas/nmn2>  
   **训练方法**：布局预测器用依存句法解析启发式生成，模块是小神经网络，整体前向传播后用交叉熵反向传播更新所有被激活模块的权重。

2. **Learning to Compose Neural Networks for Question Answering**  
   Andreas et al. NAACL 2016  
   <https://arxiv.org/abs/1601.01705>  
   **核心**：NMN 的第二篇，强化"端到端训练 + 语法解析 → 模块选择"的管道。

3. **End-to-End Module Networks (n2nmn, 升级版)**  
   Hu et al. ICCV 2017  
   <https://github.com/ronghanghu/n2nmn>  
   **训练方法**：让布局预测器本身也是可学的，用 **REINFORCE**（策略梯度）训练布局选择。**对 ShadowFlow v6**：Phase 3 Step 2 Policy Gradient 方向的学术背书。**比原版 NMN 更成熟，推荐 ShadowFlow 读这个版本**。

4. **HarshTrivedi/nmn-pytorch**（PyTorch 重实现）  
   <https://github.com/HarshTrivedi/nmn-pytorch>  
   **对 ShadowFlow**：PyTorch 重实现，代码更易读。

5. **dcasbol/dnmn**（模块化训练版本）  
   <https://github.com/dcasbol/dnmn>

**重要提示**：以上所有 NMN 源码都是**为 VQA（视觉问答）设计的**，操作图像特征 + 张量模块。**ShadowFlow 不应直接克隆改造**（编程模型完全不同），而是**读论文方法论，在 ShadowFlow 已有 `assembly/` + `learner.py` 骨架上自行实现**。
