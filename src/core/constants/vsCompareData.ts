export interface VsCompareItem {
  id: string;
  target: string;
  oneLiner: string;
  detail: string;
}

export const VS_COMPARE_DATA: VsCompareItem[] = [
  {
    id: 'chatgpt',
    target: 'ChatGPT',
    oneLiner: '单 Agent 聊天 vs 多 Agent 协作团队 + 链上传承',
    detail:
      'ChatGPT 是一对一对话模型——你问它，它回答，没有团队结构，没有角色分工。ShadowFlow 构建的是一支有编制的协作团队：CEO 批准、QA 拒绝、写手执行、评审把关。每个角色的权限由运行时 Policy Matrix 强制执行，不靠 prompt 约定，靠代码约束。整个运行轨迹上链到 0G Storage，任何人都可以 fork 这支团队并验证溯源链——ChatGPT 的对话历史无法做到这一点。',
  },
  {
    id: 'cherry-studio',
    target: 'Cherry Studio',
    oneLiner: 'Chat UI 多模型切换 vs Runtime Contract 编排与权限矩阵',
    detail:
      'Cherry Studio 的核心是让用户在一个界面里切换多个 LLM 提供商——它是模型的聚合器，不是 Agent 的编排器。ShadowFlow 关注的是完全不同的层次：Agent 之间的制度关系。谁能批准谁的输出？谁被拒绝后需要重试？这些规则在运行前通过 Policy Matrix 声明，在运行时由 Runtime 强制执行。Cherry Studio 解决"选哪个模型"的问题，ShadowFlow 解决"多个 Agent 如何协作不乱套"的问题——两个工具站在不同的问题层面。',
  },
  {
    id: 'n8n',
    target: 'N8N',
    oneLiner: 'RPA 流程自动化 vs 有状态 Agent 协作（含 Approval Gate / Barrier）',
    detail:
      'N8N 是优秀的 RPA 工具，擅长把 API 调用、数据库操作、定时任务串成流程。但它的节点是确定性函数，不是有自主判断能力的 Agent。ShadowFlow 的节点是真实的 LLM Agent，每个 Agent 有自己的角色 persona 和决策能力。更关键的是 ShadowFlow 的控制结构：Approval Gate 强制等待人工或上级 Agent 批准，Barrier 节点在所有并行分支完成前阻塞推进，Retry 节点在被拒绝后自动重走。这些是 N8N 根本不具备的多 Agent 协作原语。',
  },
  {
    id: 'langgraph',
    target: 'LangGraph',
    oneLiner: '代码级 graph 编写 vs 可视化模板编辑器 + 制度级 Policy Matrix',
    detail:
      'LangGraph 是优秀的开发者框架，但它的上手门槛是：你需要用 Python 代码手写有向图——定义节点、边、状态机。ShadowFlow 提供了可视化编辑器，把 Agent 拖到画布上连线，非开发者也可以设计工作流。更重要的区别在于"制度层"：LangGraph 没有内置的权限矩阵概念，开发者需要自己在代码里实现审批逻辑。ShadowFlow 的 Policy Matrix 是一等公民——在运行前声明批准、拒绝、重试规则，运行时自动执行，无需额外代码。',
  },
  {
    id: 'autogen',
    target: 'AutoGen',
    oneLiner: '对话式 agent 框架 vs 确定性 workflow + checkpoint 可回放',
    detail:
      'AutoGen 通过 Agent 之间的对话循环来协作——Agent A 说一句，Agent B 回一句，直到任务完成。这种方式灵活但不稳定：对话可以无限循环，中间状态难以观测，出错后无法精确回滚。ShadowFlow 使用确定性的有向无环图（DAG），每个节点有明确的输入输出契约，每次 handoff 都生成 Checkpoint 保存到 0G Storage。运行失败可以精确回放到任意历史节点继续执行。对比赛评委而言：AutoGen 的运行是黑盒，ShadowFlow 的运行是完全可审计的链上轨迹。',
  },
  {
    id: 'crewai',
    target: 'CrewAI',
    oneLiner: 'Role-based 协作 vs Role + Policy + 链上传承三位一体',
    detail:
      'CrewAI 是同类工具中最接近 ShadowFlow 的：它也有 Role（角色）、Task（任务）、Crew（团队）的概念。关键差异在两个地方：第一，CrewAI 没有 Policy Matrix——角色之间的审批关系靠 prompt 描述，不是代码约束，LLM 可以绕过。ShadowFlow 的 Policy Matrix 是运行时强制执行的。第二，CrewAI 没有链上传承——团队运行完就结束，无法被他人 fork 或验证溯源。ShadowFlow 把团队（Agent + 策略 + 历史轨迹）作为 CID 发布到 0G Storage，实现真正的知识传承。',
  },
  {
    id: 'edict',
    target: 'Edict',
    oneLiner: 'Agent 指令分发 vs Workflow 编排 + 跨 persona CID 克隆',
    detail:
      'Edict 专注于将指令分发给多个 Agent 执行——它是一个调度层，解决"谁来做"的问题。ShadowFlow 解决的是更完整的问题：不只是"谁来做"，还有"按什么制度做"（Policy Matrix）、"出错后怎么办"（Checkpoint Resume）、"做完后如何传承"（CID + author_lineage）。特别是跨 persona CID 克隆：一个团队的知识可以被另一个团队 fork 并在链上验证溯源链——这是 ShadowFlow 独有的 INFT 级别的知识传承机制，Edict 没有对应概念。',
  },
  {
    id: 'aiverse',
    target: 'AIverse',
    oneLiner: 'Agent marketplace 展示 vs INFT-ready 传承链（Phase 3）',
    detail:
      'AIverse 是 Agent 的展示橱窗——你可以浏览发现社区 Agent，但 Agent 的内部逻辑、运行历史、权限矩阵都是黑盒。ShadowFlow 的 Phase 3 目标是 INFT（Intelligent NFT）：把整个团队（包括 Agent 配置、Policy Matrix、完整运行轨迹）铸造成链上可交易资产。任何人可以 fork 任何团队并在链上验证其血统——这不是 Agent 的展示，而是 Agent 知识的链上确权与可组合继承。两者的差异本质上是"展示市场"和"知识产权市场"的区别。',
  },
  {
    id: 'dify',
    target: 'Dify',
    oneLiner: 'LLM 应用开发平台 vs 真人可设计协作制度的编辑器',
    detail:
      'Dify 是优秀的 LLM 应用快速开发平台——适合构建问答机器人、RAG 应用、单 Agent 工具。但它的协作模型是扁平的：没有内置的 Agent 层级、没有审批机制、没有角色级别的权限约束。ShadowFlow 面向的场景是：当你需要设计一个"真正的 AI 团队"——有 CEO 拍板、有 QA 否决权、有法务审查门、有并行分支再汇聚的复杂组织流程。这种"制度设计"的能力是 ShadowFlow 的核心，而 Dify 的强项在快速搭建单个智能应用，两者服务于不同的复杂度层次。',
  },
];
