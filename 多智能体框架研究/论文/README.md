# Agent 轨迹治理（Trajectory Governance）论文集

本文件夹收录与 **Agent 轨迹治理** 相关的论文，涵盖轨迹分析、能力归因、失败轨迹利用、轨迹验证与自进化训练等方向。

来源：Stanford Scaling Intelligence Lab TRACE 博客，以及 `../公众号文章/` 中的相关解读。

## 论文列表

| # | 论文 | 方向 | 来源 |
|---|------|------|------|
| 1 | TRACE | 轨迹对比 → 能力归因 → 定向训练 | Stanford 博客 |
| 2 | SEED | 失败轨迹 → 事后技能提取 → 同策略蒸馏 | 公众号文章（清华） |
| 3 | Cura 1T | 评测失败轨迹 → 定向数据精炼 | 公众号文章 |
| 4 | LLM-as-a-Verifier | 连续概率分数验证 / 挑选正确轨迹 | 公众号文章（Stanford） |

---

## 1. TRACE: Capability-Targeted Agentic Training

- 文件：`TRACE-Capability-Targeted-Agentic-Training.pdf`
- arXiv：https://arxiv.org/abs/2604.05336 (v2, 2026-07)
- 代码：https://github.com/ScalingIntelligence/TRACE
- 机构：Stanford University (Scaling Intelligence Lab)
- 作者：Hangoo Kang, Tarun Suresh, Jon Saad-Falcon, Azalia Mirhoseini

**与轨迹治理的关系**：对比 Agent 的成功 / 失败轨迹，自动定位其缺失的具体能力（capability deficit），再为每个能力缺陷合成一个定向训练环境，用 RL 训练 LoRA 适配器。把"轨迹级失败"转化为"能力级训练目标"。

**关键结果**：τ²-Bench +15.3 分、SWE-Bench Verified Pass@1 +15.0 分；样本效率上用不到 1/4 的 rollout 即超越 GRPO/GEPA。

---

## 2. SEED: Self-Evolving On-Policy Distillation for Agentic Reinforcement Learning

- 文件：`SEED-Self-Evolving-On-Policy-Distillation.pdf`
- arXiv：https://arxiv.org/abs/2607.14777 (v1, 2026-07)
- 代码：https://github.com/jinyangwu/SEED
- 机构：清华大学等

**与轨迹治理的关系**：策略在完成在线轨迹采集的同时，对已完成交互轨迹做事后分析，自动提取可复用工作流、关键观测点与避错规则（自然语言技能）。策略决策能力与技能分析能力同步迭代，并生成稠密的 token 级蒸馏信号，解决长周期任务稀疏轨迹奖励下的监督缺口。

**关键结果**：ALFWorld 91.8、检索问答 45.7、WebShop 78.9，在三类长周期任务上均领先基线。

---

## 3. Cura 1T: Specialized Model for Agentic Healthcare

- 文件：`Cura-1T-Specialized-Model-for-Agentic-Healthcare.pdf`
- arXiv：https://arxiv.org/abs/2607.15314 (v2, 2026-08)
- 主页：https://actava.ai/cura ｜ 代码：https://github.com/actava-ai/Cura
- 机构：actAVA AI

**与轨迹治理的关系**：训练 Agent 逐条读取评测轨迹，判断失败来自知识缺口、推理模式、行为校准还是工具执行，再定向合成数据；并用保留样本（Retention Anchor）防止新能力覆盖旧能力，由人类闸门决定 keep / revert。把"失败轨迹"反推成下一轮"数据配方"，真正被优化的对象是数据本身。

**关键结果**：HealthBench Professional +15.9 pp、Hard +14.6 pp、MedAgentBench 任务成功率 94.0%。

---

## 4. LLM-as-a-Verifier: A General-Purpose Verification Framework

- 文件：`LLM-as-a-Verifier-General-Purpose-Verification-Framework.pdf`
- arXiv：https://arxiv.org/abs/2607.05391 (v2, 2026-07)
- 主页：https://llm-as-a-verifier.com ｜ 代码：https://github.com/llm-as-a-verifier/llm-as-a-verifier
- 机构：Stanford / UC Berkeley / NVIDIA Research

**与轨迹治理的关系**：把"验证"作为继预训练、后训练、测试时计算之后的第四条 Scaling 轴。对评分 token 的完整概率分布求期望，得到连续轨迹分数，从而在"看起来都不错"的候选轨迹中挑出真正正确的那条。同一连续信号还可用于进度监测和稠密 RL 奖励。

**关键结果**：Terminal-Bench V2 86.5%、SWE-Bench Verified 78.2%、RoboRewardBench 87.4%、MedAgentBench 73.3%。

---

## 共同主线

四篇论文从不同角度回答同一个问题：**如何把 Agent 轨迹变成可被治理、可被复用的信号**。

- TRACE —— 轨迹对比 → 定位能力缺陷
- SEED —— 轨迹事后分析 → 提取技能蒸馏
- Cura 1T —— 失败轨迹归因 → 定向数据精炼
- LLM-as-a-Verifier —— 轨迹验证 → 连续概率评分与选优
