# Spontaneous Assembly Papers

> 目的：收集与 `ShadowFlow` 自发装配 / 自发协作 / RL / 图学习 / 因果归因相关的核心论文入口

---

## 1. 图强化学习 / Graph RL

1. Graph Reinforcement Learning for Combinatorial Optimization: A Survey and Unifying Perspective  
   2024  
   https://arxiv.org/abs/2404.06492

2. Survey on Graph-Based Reinforcement Learning for Networked Coordination and Control  
   2025  
   https://www.mdpi.com/2673-4052/6/4/65

---

## 2. 强化学习与图神经网络结合

1. Graph Neural Networks and Reinforcement Learning: A Survey  
   2023  
   https://www.intechopen.com/chapters/87170

2. Graph Neural Network-based Multi-agent Reinforcement Learning for Resilient Distributed Coordination of Multi-Robot Systems  
   2024  
   https://arxiv.org/abs/2403.13093

3. QMIX-GNN: A Graph Neural Network-Based Heterogeneous Multi-Agent Reinforcement Learning Model for Improved Collaboration and Decision-Making  
   2025  
   https://www.mdpi.com/2076-3417/15/7/3794

4. A multi-agent reinforcement learning scheduling algorithm integrating state graph and task graph structural modeling for ride-sharing dispatching  
   2026  
   https://www.nature.com/articles/s41598-026-35004-8

---

## 3. 因果强化学习 / Causal RL

1. Causal Reinforcement Learning: A Survey  
   2023  
   https://arxiv.org/abs/2307.01452

2. A Survey on Causal Reinforcement Learning  
   2023 arXiv / 2025 TNNLS  
   https://arxiv.org/abs/2302.05209

3. Reinforcement learning-based SDN routing scheme empowered by causality detection and GNN  
   2024  
   https://www.frontiersin.org/journals/computational-neuroscience/articles/10.3389/fncom.2024.1393025/full

4. Causal Reinforcement Learning for Knowledge Graph Reasoning  
   2024  
   https://www.mdpi.com/2076-3417/14/6/2498

---

## 4. LLM 多智能体协作 / 自发演化

1. AgentNet: Decentralized Evolutionary Coordination for LLM-based Multi-Agent Systems  
   2025  
   https://arxiv.org/abs/2504.00587

2. LLM Collaboration With Multi-Agent Reinforcement Learning  
   2025  
   https://arxiv.org/abs/2508.04652

---

## 5. 对 ShadowFlow 最直接有用的优先阅读顺序

1. `2404.06492`  
   先建立图强化学习整体视角

2. `2307.01452` 和 `2302.05209`  
   建立 causal RL 的判断框架

3. `2504.00587`  
   看 decentralized, dynamic DAG, evolving MAS

4. `2508.04652`  
   看 LLM collaboration 如何转成 cooperative MARL

5. `2403.13093`  
   看 GNN + MARL 在协调问题里的具体落法
