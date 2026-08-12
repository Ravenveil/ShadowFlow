# Cura 1T：让医疗模型从失败轨迹反推下一轮训练数据

![图片](https://mmbiz.qpic.cn/mmbiz_png/pZDxT91EqWBfGSkomHe7RHeiab3tDbVBAKZJtZbWN8yGaRfiaVibKcISunsS38dZuB5uPdoSTf79Os6ztE5zr2nhN2ljmV1IsRb0NQE3mLiacac/640?wx_fmt=png&from=appmsg&wxfrom=13&tp=wxpic#imgIndex=0)

![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/pZDxT91EqWC0mUw0BVupt5f0jC0FiaSoCjjb1J5cjJXOQF6ltdsWb4gSoHJNvGWxhedXLdJCvoiaLzlYVHQuL9ENhME5m5KNJ9cD5YulW3PIo/640?wx_fmt=png&from=appmsg&wxfrom=13&tp=wxpic#imgIndex=1)

PAPER · 论文信息

**标题**Cura 1T: Specialized Model for Agentic Healthcare

**作者**Haolin Chen、Leon Qi、Steve Brown、Deon Metelski、Tao Xia、Joonyul Lee、Qixuan Wang、Kevin Riley、Frank Wang、Weiran Yao

**机构**actAVA AI

**原文**https://arxiv.org/abs/2607.15314

**项目**https://actava.ai/cura

**文档**https://actava.ai/cura/docs

**代码**https://github.com/actava-ai/Cura

INSIGHT · 核心洞察

“

Cura 1T 的关键不是“多喂医学数据”，而是让评测失败决定下一轮该造什么数据、保留什么能力，以及何时撤销一次看似有效的更新。

很多医疗模型把“专业化”理解成增加医学语料。但一个模型会答医学选择题，不等于它能在问诊中补齐关键信息，更不等于它能把医嘱写成合规的 FHIR 电子病历资源。这三类任务需要的不是同一种“医疗能力”，失败方式也完全不同。

Cura 1T 把这种差异变成训练信号：训练 Agent 读取逐条评测轨迹，判断问题来自 知识缺口、推理模式、行为校准 还是 工具执行，再定向合成数据，并用保留样本防止新能力覆盖旧能力。**真正被优化的对象，不只是模型参数，而是数据配方本身。**

💡 一句话总结　本文提出 Cura 1T，用人类把关的自进化闭环把评测失败转成定向训练数据，HealthBench Professional 较基座提升 15.9 个百分点。

+15.9

HealthBench Professional / pp

+14.6

HealthBench Hard / pp

94.0%

MedAgentBench 任务成功率

HIGHLIGHTS · 本文看点

01

为什么医疗专业化首先是数据配方问题

02

SFT、RL、SDFT 如何组成自进化闭环

03

保留与撤回记录揭示了哪些训练规律

01

PROBLEM

### 会答医学题，还远远不够

想象三个场景：患者问一个药名，模型需要给出清楚且安全的解释；医生给出影像与病史，模型需要完成鉴别诊断；医院系统要求创建转诊单，模型还得调用工具、填对编码和必填字段。它们分别对应论文中的 患者照护、临床推理 与 医疗 Agent 任务。

这三类任务的错误形态并不共享一张清单。患者照护常见的是漏掉医师 rubric 中的必要提醒；专家问答可能缺少某个临床事实，也可能推理链走偏；EHR 工作流则可能意图正确，却因为少了字段、写错编码或工具调用格式而整体失败。**同一批“泛医疗数据”很难同时修复这些问题。**

「医疗专业化不是把一个模型变得更像医学百科，而是让它在不同临床任务里做对不同类型的事。」

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 图 1｜Cura 1T 与基座模型、前沿模型在六个医疗评测面板上的对比。

论文从 Kimi-K2.6 出发，得到一个 1T 参数、256K 上下文、原生支持文本与视觉输入的医疗模型。按论文的六个医疗面板，Cura 1T 在五个面板位于最高位置，在 MedXpertQA 多模态子集上以 72.2% 排第二，低于 GPT-5.5 的 77.1%。这说明它覆盖面广，但也留下了清晰的能力边界。

02

CORE IDEA

### 把失败轨迹变成下一轮数据配方

Cura 的主循环可以压缩成五个动作：Plan 确定目标行为和验收标准，Train 训练候选适配器，Evaluate 收集带评分的轨迹，Refine 根据失败合成与重配数据，最后由人类决定 keep、revert、继续修正还是部署。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 图 2｜左侧是训练 Agent 管理的闭环，右侧是数据精炼模块与 SFT→RL→SDFT 训练栈。

Agent 搜索的是数据，不只是超参数

常见 AutoResearch 系统会改提示词、代码或超参数。Cura 当然也记录训练配置，但核心搜索对象是 数据混合比例与样本类型。评测轨迹先被归因，再进入对应的数据技能：缺知识就做有来源约束的知识注入；推理模式错了就修正轨迹并生成同构问题；答案行为偏了就用 rubric 校准；工具链失败则补任务特定的交互轨迹。

•Retention Anchor

混入模型原本已经答对的样本，保护旧能力，避免一次局部修复造成灾难性遗忘。

•Reasoning Correction

由更强模型修正失败推理，同时保持原问题形态，再扩展出需要相似推理的新问题。

•Knowledge Injection

定位缺失的临床知识，用检索材料生成带依据的闭卷问答与推理轨迹。

•Behavior Calibration

比较理想答案和实际答案，以 rubric 表达差距，针对遗漏动作、错误政策或表达问题生成训练样本。

•Validation Gates

样本进入训练前检查格式、安全与 PII 风险、重复项和目标能力覆盖，避免“修复数据”本身引入新问题。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 2｜自进化循环各组件的职责与输出。

最重要的一道保险是 人类闸门。计划在开跑前需要批准，训练后也不是由 Agent 自动把最新 checkpoint 接上生产，而是由人判断是否保留、撤回或继续迭代。**“自进化”在这里并不等于无监督自我修改，而是 Agent 执行、人类把关的实验闭环。**

03

TRAINING

### SFT、RL、SDFT 各自解决什么

SFT 先做低成本体检

每轮先用 监督微调 SFT 检查数据格式、混合比例和超参数是否能稳定训练，并确认目标指标是否朝正确方向移动。这个阶段像小规模试车：如果配方本身有问题，就不必直接进入成本更高的训练。

RL 提升目标行为，SDFT 负责收束

通过筛选后，强化学习 RL 根据任务级奖励改善策略。最后的 Self-Distillation Fine-Tuning（SDFT） 使用模型自己的 on-policy 样本作为学生轨迹，让带有额外上下文的教师分布提供目标；训练时再把这份额外上下文移除，让学生只看原始问题。

这里的额外上下文可以是被干预过的轨迹、参考行为或已验证知识。它的价值在于，教师不是把一条完全脱离学生分布的长推理硬塞给模型，而是在模型自己能够生成的轨迹附近做校正。论文认为这对 长医疗推理链 尤其重要，因为照抄离策略思维链可能破坏模型原本的推理习惯。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 7｜最终整合训练配置：LoRA rank 32、学习率 3×10⁻⁴、batch size 128、最多 256K tokens、6 个 epoch 并早停。

面对 1T 参数模型，论文采用 LoRA 低秩适配器，而不是全参数更新。最终模型来自多个能力循环中被保留的数据精炼结果的整合训练，并非某一次单基准 checkpoint。**这解释了为什么单项开发最优分数与最终发布模型的分数并不总相同：整合阶段优化的是跨任务平衡。**

04

EVIDENCE

### 五组核心结果，分别说明了什么

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 1｜相对 Kimi-K2.6 基座，Cura 1T 在五项医疗评测上的整体变化。

在论文汇总表中，Cura 1T 相对基座在 MedAgentBench、HealthBench Professional、HealthBench Hard、MedXpertQA 和 AgentClinic 上分别提升 9.3、15.9、14.6、8.6、4.2 个百分点。注意，这些 benchmark 的指标定义不同：有的是 rubric 分数，有的是 exact-letter pass@1，还有的是任务成功率，不能把绝对数值直接横向比较。

EHR 工具使用：知道要做什么，还要写得进系统

MedAgentBench 让模型在运行中的 FHIR 服务器上完成读写任务。基座常能理解临床意图，却会漏必填字段、写错编码或让 payload 与请求矛盾。开发路径先加入工具使用轨迹，再加入保留样本，任务成功率从 0.883 逐步到 0.943、0.967；修正评测配置后达到 0.973。最终整合模型为 0.940，仍略高于论文中最强前沿参考 Claude Opus 4.8 的 0.937。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 3｜MedAgentBench 开发轮次与最终整合模型。开发路径使用论文注明的 benchmark-specific 设置。

患者照护：高分不只靠医学事实

HealthBench 用医师编写的 rubric 评价开放回答。基座在 Professional 和 Hard 上为 0.503 与 0.222；最终 Cura 1T 达到 0.662 与 0.368。这里的主要失败不是胡乱给出禁忌建议，而是 漏掉 rubric 要求的关键点，说明患者沟通能力需要行为层面的校准。

专家问答：知识补齐比单纯修推理更有效

MedXpertQA 包含 2450 道文本题和 2000 道多模态题，总分按题量加权。Cura 1T 的文本、多模态、总体 pass@1 分别为 0.600、0.722、0.655；总体高于基座 0.569 和 Claude Opus 4.8 的 0.628，但低于 GPT-5.5 的 0.675。**论文最值得注意的不是最终排名，而是只修推理的两轮都退化，加入知识注入与保留样本后才稳定提升。**

交互诊断：先收集证据，再提交答案

AgentClinic 不是一次性选择题。模型要在模拟问诊中追问病史、调用检查工具，再提交诊断。单轮推理样本没有改变这种临床行为；交互轨迹加保留样本把总体 pass@1 从 0.754 提到 0.807，最终整合模型为 0.796。NEJM 子集从 0.400 提到 0.800，显示收益主要来自 延迟下结论并主动寻找区分性证据。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 6｜AgentClinic 各子集表现；所有模型使用论文描述的 tool-native 协议。

05

ABLATION

### 真正有信息量的，是那些被撤回的轮次

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 图 3｜实线表示保留的干预，虚线表示撤回；不同颜色对应四类能力路径。

总分上涨，也可能必须撤回

HealthBench 第一轮广泛行为修正把全量分数从 0.503/0.222 提到 0.601/0.332，看上去方向正确。但一个退化子集相对自身基线在 Professional 和 Hard 上分别掉了 0.252 与 0.508。团队因此撤回该轮，清理病历模板样板内容、加入更干净的 principle-rubric 数据并缩短训练，第二轮才被保留。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 4｜HealthBench 的行为修正、干净行为混合与最终整合结果。

这个结果提醒我们：平均分 会掩盖局部能力回归。对于医疗系统，某个关键子群或编码场景从“正确”退回“接近正确”，后果可能比平均分上涨更重要。论文把撤回记录保留下来，反而使自进化过程更可解释。

修正推理，不等于补上知识

MedXpertQA 的基座总体为 0.569。两轮 reasoning correction 分别降到 0.541 和 0.545，说明正确的推理形态无法替代缺失的临床知识。加入 Knowledge Injection + Retention 后升到 0.603，再经混合精炼到 0.636；但一次包含过长轨迹的数据调优又导致不终止，总体跌至 0.440，因此被撤回。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 表 5｜MedXpertQA 的保留与撤回轮次；“Data mixture tuning” 因不终止问题显著退化。

「数据不只是越多越好；每一类样本都在重新分配模型的行为概率。」

06

CASE STUDY

### 从两个病例看，模型究竟学会了什么

放疗题：先识别管理约束，再判断获益

一题导管原位癌（DCIS）病例要求判断哪位患者从放疗中获得最大的局部控制收益。基座和单纯推理修正都选择了“高级别且切缘阳性”的选项，因为它看起来风险最高。但临床约束是：切缘阳性首先意味着需要进一步手术，不能简单把它当作放疗获益最大。加入知识注入后，模型才稳定选择切缘阴性的 0.9 cm、3 级病例。

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 案例｜DCIS 放疗题中，知识注入补上了“阳性切缘改变管理问题”这一关键约束。

多轮诊断：改变的不是答案，而是取证顺序

另一例 34 岁女性有吸烟史、呼吸困难和磨玻璃影。基座直接诊断慢性嗜酸性肺炎，一次被撤回的尝试又过早判断为肺泡蛋白沉积症。交互轨迹训练后，模型先请求活检复核，拿到“肺泡内大量含色素巨噬细胞”这一决定性线索，再提交脱屑性间质性肺炎。**提升来自工作流改变：先找证据，后做诊断。**

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 案例｜交互轨迹与保留样本让 Cura 1T 学会在提交诊断前调用检查并使用区分性证据。

一个反向案例：修复也可能制造新错误

论文还展示了坐骨神经痛编码回归：基座正确给出 M54.30、M54.31、M54.32，第一轮行为修正却把未指定侧写成不完整的 M54.3。最终 Cura 1T 恢复了完整可计费编码。它说明 保留样本 不是锦上添花，而是领域微调能否安全叠加的基础设施。

07

GENERALIZATION

### 专业化有没有牺牲通用能力

![图片](data:image/svg+xml,%3C%3Fxml%20version='1.0'%20encoding='UTF-8'%3F%3E%3Csvg%20width='1px'%20height='1px'%20viewBox='0%200%201%201'%20version='1.1'%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg%20stroke='none'%20stroke-width='1'%20fill='none'%20fill-rule='evenodd'%20fill-opacity='0'%3E%3Cg%20transform='translate\(-249.000000,%20-126.000000\)'%20fill='%23FFFFFF'%3E%3Crect%20x='249'%20y='126'%20width='1'%20height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

— 图 4｜AIME、GPQA-Diamond 与 τ²-Bench 的域外评测。

论文在 AIME 2025、AIME 2026、GPQA-Diamond，以及 τ²-Bench 的航空、零售、电信三个 Agent 域上做了域外检查。Cura 1T 分别得到 96.7、93.3、89.9，以及 76.0、88.6、100.0。报告据此认为，医疗专门化没有在这些评测上造成明显的通用推理或 Agent 能力坍塌。

更谨慎的读法是：**这些结果证明了“在所测任务上保持竞争力”，而不是证明所有通用能力都无损。** 不同面板的对手与评测协议并不完全相同，也没有覆盖开放环境中的安全性、校准度和长期稳定性。域外基准的意义，是为保留样本是否工作提供一组有用但不完备的旁证。

部署边界必须写在成绩旁边

论文明确说明：Cura 1T 是 研究模型，不是医疗服务，也不能替代临床医生。固定 harness 上的强分数只代表模型在规定任务和协议中的表现，不能证明无人监督临床使用的安全性。当前官方项目页提供 OpenAI-compatible API 访问，代码仓库主要公开评测工具；截至本文校验时，官方没有宣布开放模型权重。

08

BLUEPRINT

### 这套方法对行业模型团队有什么启发

Cura 1T 的贡献不只是一张医疗榜单。更可复用的是一种 证据驱动的领域后训练方法：先把真实任务拆成不同失败类型，再为每类失败设计可验证的数据动作，并保留每次修改的副作用记录。

•先建轨迹级评测，再谈自动改进

只有最终分数，没有失败过程，就很难判断该补知识、修行为还是改工具协议。

•一次只改变一个主要数据决策

小步添加目标样本、保留样本或清理噪声，才能把指标变化和配方变化对应起来。

•让回归测试成为训练配方的一部分

不仅测目标能力，还要持续测已解决行为；对高风险子群设置独立闸门，不能只看平均分。

•把撤回结果也纳入知识库

失败轮次记录了哪些数据会引发非终止、模板化回答或能力覆盖，它们是下一轮最直接的负证据。

未来方向

论文也坦诚，当前结果受算力、数据和训练资源限制。后续可进一步扩大 临床行为覆盖，推进更长时程的医疗 Agent 工作流，并在资源允许时探索全参数更新。更关键的是，在真实临床场景中加入前瞻性安全评估、校准与人工监督，验证 benchmark 上的提升能否转化为可靠的系统行为。

「Cura 1T 展示的不是“模型已经会看病”，而是领域模型如何用失败证据持续修正自己的训练数据。」

END

我是 MindChain.AI。

如果你觉得今天这篇有收获，欢迎**关注**、**点赞**、**转发**、**喜欢**四连，我们下篇见。

↙ 点击左下角**「阅读原文」**，查看论文全文

暂无评论