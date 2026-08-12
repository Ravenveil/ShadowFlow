
# Science One 框架：让 AI 科研可验证的「证据链」方案

> 发布日期：2026年7月30日 ｜ 作者：Rui Meng（研究科学家）、Tomas Pfister（Google Cloud 总监）  
>   
> 原文链接：https://research.google/blog/science-one-framework-a-verifiable-autonomous-research-framework-via-chain-of-evidence/

## ◆ 核心速览

- Google 发布 **Science One 框架**：一个把「可验证性」作为一等架构约束的自主科研代理原型
    
- 配套提出 **Chain-of-Evidence（证据链）**概念框架，以及 **CoE Audit** 自动化审计协议
    
- 引用幻觉率：基线系统最高 **21%**，Science One 做到 **0**（零幽灵引用）
    
- 分数全部可独立复现，方法-代码对齐度最高，性能还追平甚至超过人类专家
    
- 泛化测试：MLE-Bench 拿下 **2 金 2 银**，Parameter-Golf 取得当时 SOTA 成绩
    

## ◆ 一、背景：AI 科研代理的「可验证性危机」

大语言模型（LLM）正在从编程助手升级为能独立跑完整个科研流程的自主代理。Sakana 的 AI-Scientist、AutoResearchClaw、DeepScientist、AI-Researcher 等系统，已经能完成文献调研、提出假设、执行实验、撰写完整论文，成品质量直追人类作者。

但随之而来的是一个结构性问题：**可验证性**。当前自主科研流水线是逐字迭代生成文本的，任何阶段的错误都会被逐级放大。现有系统普遍存在三类问题：

- 生成**不存在的引用**（幽灵引用）
    
- 论文描述的方法与**实际代码不一致**
    
- 论文报告的分数**无法从代码复现**
    

论文地址：https://arxiv.org/pdf/2605.26340

## ◆ 二、Chain-of-Evidence：给科研产出定义的「ACID」

CoE 是一个概念框架，用来定义「什么样的科研产出值得信任」——正如 ACID 定义了「什么样的数据库事务是可靠的」。它不规定如何构建科研代理，而是规定其产出必须具备的性质。

框架遵循一条原则的两个半句：

- **完备性（Completeness）**
    
    ：科研产出中的每个声明，都必须携带一条有记录的证据链
    
- **正确性（Correctness）**
    
    ：每条证据链都必须真正支撑它所挂靠的声明
    

声明可以是引用、报告的数字、方法描述或结论；证据则是同行评审论文、实验日志行、真正运行过的代码、结果表格。

一个指向不存在论文的幻觉引用、一个重跑代码得不到的分数、一个论文说算法 A 而代码实现算法 B 的方法描述——本质上都是「声明到证据的链条断了」。CoE Audit 要做的就是让这些断点变得可测量。

## ◆ 三、Science One 框架：三大模块从源头构建证据链

与「先写论文、事后补引用」的传统代理不同，Science One 框架通过三个模块，从构造上就满足 CoE 的要求：

**1. 问题调查员（Problem Investigator）——文献锚定**

通过 Semantic Scholar API 构建引用图谱，每个主题最多精读 100 篇全文 PDF，产出结构化研究简报。论文中每个引用都来自这次锚定的 API 调用结果，**完全不依赖模型记忆**，从根源上杜绝幽灵引用。

Semantic Scholar API：https://www.semanticscholar.org/product/api

**2. 发现引擎（Discovery Engine）——并行探索-利用**

在多个并行分支中系统性地探索与利用想法。每个隔离的循环里，Solver 代理实现解决方案，任务专属的评估器打分；高分分支被迭代精化。所有原始评估输出被整理成一份严格的**只读记录**，作为后续声明的证据来源。

**3. 论文撰写器与声明核验器（Paper Writer & Claim Verifier）**

成稿前，先把每个事实性声明构建为结构化表示，并打上内联证据标签，绑定到工作区里的具体产物（日志、代码、结果表）。专职的 Claim Verifier 逐条核对声明与所声明来源；凡证据撑不住的声明，都会与证据源对齐——**保守改写而非删除**，让论文始终与工作真正支持的内容一致。

![图片](https://mmbiz.qpic.cn/mmbiz_png/SvjKnfqiabCnHZibuNDRVdBcZQUibOwsHENVrcWG4QcibrpxKnDoicyuywicIEhIKUicBgHxBFeblxQcxlcNxKOYbDFwLsXBLnGLia5Yh4rtnFg6SNA/640?wx_fmt=png&from=appmsg)

图1：Science One 框架整体流水线——问题调查员锚定文献，发现模块探索与评估方案，写作与核验模块确保每条声明都有证据来源

## ◆ 四、CoE Audit：四项完整性审查

为了严格评测 Science One 与 SOTA 基线（AI Scientist v2、AutoResearchClaw、DeepScientist、AI-Researcher 等）的差距，团队开发了 CoE Audit——一个事后审计协议，相当于**自动化的法证审查员**，对生成的论文、方案、代码和引用跑四项严格检查：

|检查项|内容|
|---|---|
|分数核验|从论文提取报告的分数，与独立重跑提交代码的结果对比|
|规格违规|检查方案代码是否真正解决任务，而非钻评估器空子或偷读标准答案文件|
|引用核验|逐条对照学术 API 检查参考文献，揪出不存在的幽灵引用|
|方法-代码对齐|用 LLM 评审把论文方法章节与代码并排对比，确认文字如实描述实现的算法|

![图片](https://mmbiz.qpic.cn/mmbiz_jpg/SvjKnfqiabCkuwSvkqODdv7T4x4Ja2bNYxW1ibMfsdDSXsZWawDJ3yOPcEre0icaJrq1Fol9odpGyIIX3Qh8rVbH9fmpayehtZcqkHIqCVDUUw/640?wx_fmt=jpeg&from=appmsg)

图2：CoE Audit 框架概览及其四项核心完整性检查

## ◆ 五、实验结果：零幻觉引用，性能不降反升

团队用 CoE Audit 审查了 5 个系统优化任务（Prism、Cloudcast、EPLB、LLM-SQL、事务调度，来自 ADRS「自动化研究系统设计」基准）上生成的 **75 篇论文**，对每个系统都施加同一套独立协议。

结果：Science One 框架在**全部四项完整性检查上领先**——

- 引用零幽灵：每个引用都指向真实可检索的论文，而基线系统幻觉率最高达 21%
    
- 分数核验满分，方法-代码对齐度最高
    
- 反观基线系统，论文里写着「混合神经符号求解器」之类的复杂算法，提交的代码却只是简单的确定性启发式
    

![图片](https://mmbiz.qpic.cn/mmbiz_png/SvjKnfqiabCllFiaH4yObpMpeRgyxhU5dphrjLDfSz7pIl9AuORFd8mBTVN7WIAHeCeIJkKdWfDFgGFf9pqBdhN9wyZ8Giaq2euNFvEqY3oXJ0/640?wx_fmt=png&from=appmsg)

图3：五个系统上的 CoE Audit 结果

更关键的是：严格的可验证性**没有牺牲科研能力**。Science One 在全部 5 个 ADRS 任务上追平或超过人类专家表现，其中 Cloudcast 和 EPLB 两个任务拿到所有系统里的最佳总分。

![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SvjKnfqiabCn4DArvibpwdYsibMXrLzCRrE2pnk3sMzMzichdA0TCeNySEarm3icNiabu0EcDqfftUpwIhoRCxDFFgHzp79jMAjFbzwh00sx4jVIY/640?wx_fmt=png&from=appmsg)

图4：五个 MLE-Bench 任务与 Parameter-Golf 上的求解器性能对比

为了测试泛化能力，团队还在 6 个高难度外部任务上部署了 Science One：

- **MLE-Bench**
    
    （https://arxiv.org/pdf/2410.07095）：横跨医学影像、细粒度识别、3D 感知的 5 个高难度 Kaggle 竞赛，拿下 **2 枚金牌**（其中 3D 目标检测以获胜分数夺冠，基线系统全军覆没）和 **2 枚银牌**
    
- **Parameter-Golf**
    
    （https://github.com/openai/parameter-golf）：一场有严格硬件与文件大小限制的**直播 LLM 训练竞赛**。基线系统连有效提交都做不出来，Science One 不仅完全遵守所有约束，还取得了当时（2026年4月27日）的 SOTA 分数——并且它发现的是**真正新颖的算法技巧**，而不是调几个表层超参数
    

## ◆ 六、展望：可验证性应成为一等架构约束

随着自主科研系统不断冲击更难的课题，求解能力本身将不再是差异化的关键，**「产出能否被信任」才是**。

这项工作的结论很明确：可验证性必须作为**一等架构约束**来对待——在声明产生的那一刻就构建证据链，而不是事后补救式地补建依据。Science One 框架证明了：AI 代理完全可以在产出严谨、可信的科研工作的同时，保持极强的竞争力。团队希望 CoE 框架与其审计协议能成为社区的通用工具，一起构建下一代 AI 科学家。

> 声明：Science One 框架是实验性研究原型，并非生产级工具。

## ◆ 参考链接

- 论文（Chain-of-Evidence）：https://arxiv.org/pdf/2605.26340
    
- AI-Scientist（Sakana）：https://arxiv.org/pdf/2504.08066
    
- AutoResearchClaw：https://arxiv.org/pdf/2605.20025
    
- DeepScientist：https://arxiv.org/pdf/2509.26603
    
- AI-Researcher：https://arxiv.org/pdf/2505.18705
    
- MLE-Bench：https://arxiv.org/pdf/2410.07095
    
- Parameter-Golf：https://github.com/openai/parameter-golf
    
- ADRS 基准：https://arxiv.org/pdf/2510.06189
    
- Semantic Scholar API：https://www.semanticscholar.org/product/api
    
- 原文：https://research.google/blog/science-one-framework-a-verifiable-autonomous-research-framework-via-chain-of-evidence/
    

#Google#AI科研#大语言模型#Chain-of-Evidence#ScienceOne#MLE-Bench#可验证性#LLM

  

**留言**

写留言