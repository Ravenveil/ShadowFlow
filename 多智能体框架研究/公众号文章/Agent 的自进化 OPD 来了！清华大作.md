# Agent 的自进化 OPD 来了！清华大作

论文标题：SEED: SELF-EVOLVING ON-POLICY DISTILLATION FOR AGENTIC REINFORCEMENT LEARNING

论文地址：https://arxiv.org/abs/2607.14777

![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/z4xLyaK66S86jFtwJOIGbYEwia99eEKiaQ1tXgtakX7acIdYunYOA9ia7gGu9s3p0r78PU57YY2V9NTicuk04PicB5KmicAlcmfYaV9Diar1LVUsz4/640?wx_fmt=png&from=appmsg)

# 创新点

- 提出自演进轨迹分析机制，让策略同步完成轨迹采集与事后技能提取，随策略迭代持续优化监督质量。
    

- 生成稠密令牌级蒸馏信号，结合技能增强上下文重打分对齐轨迹分布，和结果强化学习联合优化提升智能体表现。
    

# 方法

本文主要研究方法是针对长周期智能体任务中稀疏轨迹奖励的监督缺口问题展开优化。它先让策略模型在完成在线轨迹采集的同时，对已完成的交互轨迹做事后分析，自动提取可复用工作流、关键观测点与避错规则的自然语言技能，实现策略决策能力与技能分析能力的同步迭代。之后框架分别在普通上下文与技能增强上下文下为采样动作重新打分，将技能带来的概率偏移转化为稠密的令牌级蒸馏信号，和基于结果的强化学习信号联合优化，既保证辅助监督与当前轨迹分布完全对齐，又能持续提升智能体的任务表现与采样效率，对未见过的全新场景也能保持稳健泛化能力。

## 不同算法在三类长周期智能体任务上的性能对比

![图片](https://mmbiz.qpic.cn/mmbiz_png/z4xLyaK66S9Q2cHPq4ic4P1XQWkHK89dgOen6icHAntExibdJE9srQpjyvIT2MxOMZW1y6ic19kmo0fPkGRAYnb3J1KBicmeesP4L1jljSMo7ibJQ/640?wx_fmt=png&from=appmsg)

本图将参评方法划分为无训练方法、仅基于结果的强化学习方法、技能蒸馏方法三类，在ALFWorld平均得分、基于检索的问答平均得分、WebShop任务成功率三个维度展开横向对比。本文提出的SEED方法在所有任务上均取得最高成绩，分别达到91.8、45.7、78.9，大幅领先其余基线方法。直观验证了该自演进在线策略蒸馏框架，在长周期智能体任务中，通过同步迭代策略与技能分析能力、生成稠密蒸馏信号的核心设计，能有效填补稀疏奖励下的监督缺口，实现性能的显著跃升。

## SEED：自演进同策略蒸馏

![图片](https://mmbiz.qpic.cn/mmbiz_png/z4xLyaK66SicBwjthQxibBvTAQiaibTPV8fxuJSWqNqyibwndlYuyTVF2CCXNVg5WBtliaxWRRge2Tr9Nick0U0VV08l9YvlB64iadXR053hffSCevU/640?wx_fmt=png&from=appmsg)

本图将参评方法划分为无训练方法、仅基于结果的强化学习方法、技能蒸馏方法三类，在ALFWorld平均得分、基于检索的问答平均得分、WebShop任务成功率三个维度展开横向对比。本文提出的SEED方法在所有任务上均取得最高成绩，分别达到91.8、45.7、78.9，大幅领先其余基线方法。直观验证了该自演进在线策略蒸馏框架，在长周期智能体任务中，通过同步迭代策略与技能分析能力、生成稠密蒸馏信号的核心设计，能有效填补稀疏奖励下的监督缺口，实现性能的显著跃升。

## SEED框架与基线方法在多类智能体任务上的采样效率消融对比图

![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/z4xLyaK66S9OXhjqYnSLjNr1IicIaH7UAIYBscFkHO5ribqWeu14icM4WlF0qHwTodqQ094CoqXR9eTDicNEgYicEiasamiaP01DX68Tc0RIc61jzs/640?wx_fmt=png&from=appmsg)

本图直观呈现SEED与GRPO算法的迭代差异。随着训练步数从0推进至150，SEED的回合成功率全程高于GRPO，最终逼近0.9，性能提升速度更快，训练前期就拉开明显差距。在单回合交互步数维度，SEED的数值始终低于GRPO，最终稳定在13左右，远优于GRPO的15以上的表现。这充分说明SEED依托自演进事后技能蒸馏机制，不仅能达成更高的任务完成率，还能引导智能体摸索出更短的交互路径，采样效率与策略优化效果都显著优于基线GRPO算法。

## 实验

![图片](https://mmbiz.qpic.cn/mmbiz_png/z4xLyaK66S9DgJ73VrXGhpShdOFYBib0w6B2IicQx3tmSWARkW70PrZaJzTViagpCRBsNOlFxJt9Dic2SmqBMPTh1pel0dbF8Tw0nuM2kQRjueY/640?wx_fmt=png&from=appmsg)

本表覆盖Qwen2.5-1B、Qwen2.5-7B、Qwen3-1.7B三类基座模型，在ALFWorld具身交互、检索式问答、WebShop网页操作三大长序列智能体任务上，横向对比SEED与十余种主流基线方法的实测表现。结果显示SEED在所有核心评测维度上均取得最优成绩，ALFWorld平均得分、检索问答平均得分、WebShop任务成功率分别达到91.8、45.7、78.9，大幅领先其余方案。这充分验证了自演进同策略蒸馏框架，能有效解决传统强化学习蒸馏的策略漂移问题，在不同参数规模基座下都能实现显著性能跃升，兼具出色的泛化能力与采样效率。

**留言**

写留言