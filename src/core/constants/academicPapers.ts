export interface AcademicPaper {
  id: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  url: string;
  shadowflowRelevance: string;
}

export const ACADEMIC_PAPERS: AcademicPaper[] = [
  {
    id: 'nmn',
    title: 'Neural Module Networks',
    authors: 'Andreas, Rohrbach, Darrell & Klein',
    year: 2016,
    venue: 'CVPR 2016 · arXiv 1511.02799',
    url: 'https://arxiv.org/abs/1511.02799',
    shadowflowRelevance:
      'ShadowFlow 的工程范式祖师爷。NMN 证明"按任务语法动态组合可复用神经模块"可以解决复杂视觉问答。ShadowFlow 把这一范式抬升到工作流层级——用 Agent 积木代替神经模块，用 Policy Matrix 约束组合规则，用 0G Storage 保存激活轨迹。',
  },
  {
    id: 'voyager',
    title: 'Voyager: An Open-Ended Embodied Agent with Large Language Models',
    authors: 'Wang et al. (Caltech / Stanford / UT / NVIDIA)',
    year: 2023,
    venue: 'NeurIPS 2023 · arXiv 2305.16291',
    url: 'https://arxiv.org/abs/2305.16291',
    shadowflowRelevance:
      'Voyager 的"持续增长技能库"对应 ShadowFlow 的"Agent 积木库"——技能可复用、可组合、可持续学习。Voyager 比 SOTA 快 15.3× 解锁技术树，证明技能传承机制的价值。ShadowFlow 的 CID 传承链是这一思路在多 Agent 工作流层面的延伸。',
  },
  {
    id: 'workteam',
    title: 'WorkTeam: Constructing Workflows from Natural Language with Multi-Agent Collaboration',
    authors: 'NAACL 2025 Industry Track',
    year: 2025,
    venue: 'NAACL 2025 Industry Track',
    url: 'https://aclanthology.org/2025.naacl-industry.3.pdf',
    shadowflowRelevance:
      'WorkTeam 用三 Agent 分工（Supervisor / Orchestrator / Filler）从自然语言构建静态工作流，是学术界对"NL→workflow"问题最新的实证研究。ShadowFlow 在此基础上新增了运行时 Policy 约束与执行反馈学习层，实现从静态工作流到动态可演化团队的升级。',
  },
  {
    id: 'neural-bandit',
    title: 'Neural Bandit Based Optimal LLM Selection for a Pipeline of Tasks',
    authors: 'IBM Research',
    year: 2025,
    venue: 'arXiv 2508.09958 · IBM AAAI 2026 Tutorial',
    url: 'https://arxiv.org/abs/2508.09958',
    shadowflowRelevance:
      'ShadowFlow Policy Matrix 的决策理论基础。该研究用神经老虎机（Neural Bandit）学习"哪个任务用哪个 LLM"，直接对应 ShadowFlow 的 ActivationBandit——选择哪组 Agent 积木、用什么参数组合。IBM 将此方向列为 AAAI 2026 专题教程，证明 Bandit + LLM 混合是 2026 年顶会热点。',
  },
  {
    id: 'paper-orchestra',
    title: 'PaperOrchestra: Multi-Agent Collaborative Academic Paper Generation',
    authors: 'Google Research',
    year: 2026,
    venue: 'arXiv 2604.05018',
    url: 'https://arxiv.org/abs/2604.05018',
    shadowflowRelevance:
      'ShadowFlow Academic Paper 模板的直接学术对标。PaperOrchestra 用 5 专业 Agent 顺序协作 + 并行 + 评审循环完成学术论文生成，胜率领先基线 50-68%。ShadowFlow 的 Academic Paper 模板沿用这一多 Agent 编排范式，并新增了链上轨迹存证与 CID 作者署名链。',
  },
];
