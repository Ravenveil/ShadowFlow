// ============================================================================
// 节点注册表 - 管理所有可用节点
// ============================================================================

import { create } from 'zustand';
import { INode, NodeCategory } from '../types';

interface NodeRegistryState {
  nodes: Map<string, INode>;
  categories: NodeCategory[];
  registerNode: (node: INode) => void;
  unregisterNode: (nodeId: string) => void;
  getNode: (nodeId: string) => INode | undefined;
  getNodesByCategory: (category: NodeCategory) => INode[];
  getAllNodes: () => INode[];
  searchNodes: (query: string) => INode[];
}

// 内置节点定义
const builtinNodes: INode[] = [
  // ========== 输入节点 ==========
  {
    id: 'receive',
    type: 'builtin',
    name: { en: 'Receive', zh: '接收' },
    description: { en: 'Receive and parse user input', zh: '接收并解析用户输入' },
    category: 'input',
    icon: '📥',
    color: '#3b82f6',
    accentColor: '#60a5fa',
    inputs: [],
    outputs: [
      { name: 'parsed_task', type: 'object', required: true, description: { en: 'Parsed task', zh: '解析后的任务' } },
    ],
    defaultConfig: {
      parser: 'auto',
      extract_entities: false,
    },
  },
  {
    id: 'understand',
    type: 'builtin',
    name: { en: 'Understand', zh: '理解' },
    description: { en: 'Analyze and understand task requirements', zh: '分析并理解任务需求' },
    category: 'input',
    icon: '🧠',
    color: '#3b82f6',
    accentColor: '#60a5fa',
    inputs: [
      { name: 'task', type: 'object', required: true, description: { en: 'Task to understand', zh: '要理解的任务' } },
    ],
    outputs: [
      { name: 'understanding', type: 'object', required: true, description: { en: 'Task understanding', zh: '任务理解结果' } },
      { name: 'questions', type: 'array', required: false, description: { en: 'Clarifying questions', zh: '澄清问题' } },
    ],
    defaultConfig: {
      depth: 'medium',
      ask_clarifying_questions: false,
    },
  },
  {
    id: 'clarify',
    type: 'builtin',
    name: { en: 'Clarify', zh: '澄清' },
    description: { en: 'Clarify ambiguous requirements through Q&A', zh: '通过问答澄清不明确的需求' },
    category: 'input',
    icon: '❓',
    color: '#3b82f6',
    accentColor: '#60a5fa',
    inputs: [
      { name: 'task', type: 'object', required: true, description: { en: 'Task to clarify', zh: '要澄清的任务' } },
      { name: 'questions', type: 'array', required: false, description: { en: 'Questions to answer', zh: '待回答的问题' } },
    ],
    outputs: [
      { name: 'clarified_task', type: 'object', required: true, description: { en: 'Clarified task', zh: '澄清后的任务' } },
      { name: 'qa_history', type: 'array', required: false, description: { en: 'Q&A history', zh: '问答历史' } },
    ],
    defaultConfig: {
      max_rounds: 3,
    },
  },

  // ========== 规划节点 ==========
  {
    id: 'analyze',
    type: 'builtin',
    name: { en: 'Analyze', zh: '分析' },
    description: { en: 'Analyze task complexity and dependencies', zh: '分析任务复杂度和依赖关系' },
    category: 'planning',
    icon: '📊',
    color: '#8b5cf6',
    accentColor: '#a78bfa',
    inputs: [
      { name: 'task', type: 'object', required: true, description: { en: 'Task to analyze', zh: '要分析的任务' } },
    ],
    outputs: [
      { name: 'complexity', type: 'object', required: true, description: { en: 'Complexity scores', zh: '复杂度评分' } },
      { name: 'dependencies', type: 'array', required: false, description: { en: 'Dependencies', zh: '依赖关系' } },
      { name: 'required_capabilities', type: 'array', required: false, description: { en: 'Required capabilities', zh: '所需能力' } },
    ],
  },
  {
    id: 'design',
    type: 'builtin',
    name: { en: 'Design', zh: '设计' },
    description: { en: 'Design technical solutions or architecture', zh: '设计技术方案或架构' },
    category: 'planning',
    icon: '🎨',
    color: '#8b5cf6',
    accentColor: '#a78bfa',
    inputs: [
      { name: 'requirements', type: 'object', required: true, description: { en: 'Requirements', zh: '需求' } },
      { name: 'constraints', type: 'object', required: false, description: { en: 'Constraints', zh: '约束条件' } },
    ],
    outputs: [
      { name: 'architecture', type: 'object', required: true, description: { en: 'Architecture design', zh: '架构设计' } },
      { name: 'tech_stack', type: 'array', required: false, description: { en: 'Technology stack', zh: '技术栈' } },
      { name: 'diagrams', type: 'array', required: false, description: { en: 'Design diagrams', zh: '设计图' } },
    ],
  },
  {
    id: 'decompose',
    type: 'builtin',
    name: { en: 'Decompose', zh: '分解' },
    description: { en: 'Break down large tasks into subtasks', zh: '将大任务分解为子任务' },
    category: 'planning',
    icon: '🔪',
    color: '#8b5cf6',
    accentColor: '#a78bfa',
    inputs: [
      { name: 'task', type: 'object', required: true, description: { en: 'Task to decompose', zh: '要分解的任务' } },
    ],
    outputs: [
      { name: 'subtasks', type: 'array', required: true, description: { en: 'Subtasks', zh: '子任务列表' } },
      { name: 'dependencies', type: 'array', required: false, description: { en: 'Task dependencies', zh: '任务依赖' } },
    ],
    defaultConfig: {
      strategy: 'sequential',
    },
  },
  {
    id: 'spec',
    type: 'builtin',
    name: { en: 'Specification', zh: '规范' },
    description: { en: 'Create detailed execution specifications', zh: '制定详细的执行规范' },
    category: 'planning',
    icon: '📋',
    color: '#8b5cf6',
    accentColor: '#a78bfa',
    inputs: [
      { name: 'requirements', type: 'object', required: true, description: { en: 'Requirements', zh: '需求' } },
      { name: 'template', type: 'string', required: false, description: { en: 'Specification template', zh: '规范模板' } },
    ],
    outputs: [
      { name: 'specification', type: 'object', required: true, description: { en: 'Specification', zh: '执行规范' } },
    ],
  },

  // ========== 执行节点 ==========
  {
    id: 'code',
    type: 'builtin',
    name: { en: 'Code', zh: '编码' },
    description: { en: 'Write code', zh: '编写代码' },
    category: 'execution',
    icon: '💻',
    color: '#f59e0b',
    accentColor: '#fbbf24',
    inputs: [
      { name: 'specification', type: 'object', required: true, description: { en: 'Code specification', zh: '代码规范' } },
      { name: 'language', type: 'string', required: false, description: { en: 'Programming language', zh: '编程语言' } },
    ],
    outputs: [
      { name: 'code', type: 'string', required: true, description: { en: 'Generated code', zh: '生成的代码' } },
      { name: 'files', type: 'array', required: false, description: { en: 'File list', zh: '文件列表' } },
    ],
  },
  {
    id: 'test',
    type: 'builtin',
    name: { en: 'Test', zh: '测试' },
    description: { en: 'Write or run tests', zh: '编写或运行测试' },
    category: 'execution',
    icon: '🧪',
    color: '#f59e0b',
    accentColor: '#fbbf24',
    inputs: [
      { name: 'code', type: 'string', required: false, description: { en: 'Code to test', zh: '要测试的代码' } },
      { name: 'specification', type: 'object', required: false, description: { en: 'Test specification', zh: '测试规范' } },
    ],
    outputs: [
      { name: 'test_code', type: 'string', required: false, description: { en: 'Test code', zh: '测试代码' } },
      { name: 'test_results', type: 'object', required: false, description: { en: 'Test results', zh: '测试结果' } },
    ],
    defaultConfig: {
      test_type: 'unit',
    },
  },
  {
    id: 'generate',
    type: 'builtin',
    name: { en: 'Generate', zh: '生成' },
    description: { en: 'Generate content (documents, reports, etc.)', zh: '生成内容（文档、报告等）' },
    category: 'execution',
    icon: '✨',
    color: '#f59e0b',
    accentColor: '#fbbf24',
    inputs: [
      { name: 'template', type: 'string', required: true, description: { en: 'Generation template', zh: '生成模板' } },
      { name: 'data', type: 'object', required: true, description: { en: 'Input data', zh: '输入数据' } },
    ],
    outputs: [
      { name: 'content', type: 'string', required: true, description: { en: 'Generated content', zh: '生成的内容' } },
    ],
  },
  {
    id: 'transform',
    type: 'builtin',
    name: { en: 'Transform', zh: '转换' },
    description: { en: 'Transform or process data', zh: '数据转换或处理' },
    category: 'execution',
    icon: '🔄',
    color: '#f59e0b',
    accentColor: '#fbbf24',
    inputs: [
      { name: 'input', type: 'any', required: true, description: { en: 'Input data', zh: '输入数据' } },
      { name: 'transformation', type: 'string', required: true, description: { en: 'Transformation rules', zh: '转换规则' } },
    ],
    outputs: [
      { name: 'output', type: 'any', required: true, description: { en: 'Transformed output', zh: '转换后的输出' } },
    ],
  },

  // ========== 审核节点 ==========
  {
    id: 'review',
    type: 'builtin',
    name: { en: 'Review', zh: '审核' },
    description: { en: 'Review the quality of artifacts', zh: '审核产出物的质量' },
    category: 'review',
    icon: '👁️',
    color: '#10b981',
    accentColor: '#34d399',
    inputs: [
      { name: 'artifact', type: 'any', required: true, description: { en: 'Artifact to review', zh: '要审核的产出物' } },
      { name: 'criteria', type: 'object', required: false, description: { en: 'Review criteria', zh: '审核标准' } },
    ],
    outputs: [
      { name: 'approved', type: 'boolean', required: true, description: { en: 'Approval status', zh: '是否通过' } },
      { name: 'score', type: 'number', required: false, description: { en: 'Review score', zh: '审核评分' } },
      { name: 'issues', type: 'array', required: false, description: { en: 'Issues found', zh: '发现的问题' } },
      { name: 'suggestions', type: 'array', required: false, description: { en: 'Suggestions', zh: '改进建议' } },
    ],
    defaultConfig: {
      strictness: 'normal',
    },
  },
  {
    id: 'validate',
    type: 'builtin',
    name: { en: 'Validate', zh: '验证' },
    description: { en: 'Validate against specifications or constraints', zh: '验证是否符合规范或约束' },
    category: 'review',
    icon: '✅',
    color: '#10b981',
    accentColor: '#34d399',
    inputs: [
      { name: 'artifact', type: 'any', required: true, description: { en: 'Artifact to validate', zh: '要验证的产出物' } },
      { name: 'schema', type: 'object', required: false, description: { en: 'Validation schema', zh: '验证模式' } },
    ],
    outputs: [
      { name: 'valid', type: 'boolean', required: true, description: { en: 'Validation result', zh: '验证结果' } },
      { name: 'errors', type: 'array', required: false, description: { en: 'Validation errors', zh: '验证错误' } },
    ],
  },
  {
    id: 'security',
    type: 'builtin',
    name: { en: 'Security Audit', zh: '安全审计' },
    description: { en: 'Perform security audit and vulnerability scanning', zh: '执行安全审计和漏洞扫描' },
    category: 'review',
    icon: '🔒',
    color: '#10b981',
    accentColor: '#34d399',
    inputs: [
      { name: 'code', type: 'string', required: true, description: { en: 'Code to audit', zh: '要审计的代码' } },
    ],
    outputs: [
      { name: 'vulnerabilities', type: 'array', required: false, description: { en: 'Vulnerabilities found', zh: '发现的漏洞' } },
      { name: 'risk_level', type: 'string', required: false, description: { en: 'Overall risk level', zh: '整体风险等级' } },
    ],
  },

  // ========== 决策节点 ==========
  {
    id: 'branch',
    type: 'builtin',
    name: { en: 'Branch', zh: '分支' },
    description: { en: 'Select execution path based on conditions', zh: '根据条件选择执行路径' },
    category: 'decision',
    icon: '🔀',
    color: '#eab308',
    accentColor: '#facc15',
    inputs: [
      { name: 'condition', type: 'any', required: true, description: { en: 'Branch condition', zh: '分支条件' } },
      { name: 'branches', type: 'object', required: false, description: { en: 'Branch definitions', zh: '分支定义' } },
    ],
    outputs: [
      { name: 'true', type: 'any', required: true, description: { en: 'True branch', zh: '真分支' } },
      { name: 'false', type: 'any', required: true, description: { en: 'False branch', zh: '假分支' } },
    ],
  },
  {
    id: 'merge',
    type: 'builtin',
    name: { en: 'Merge', zh: '合并' },
    description: { en: 'Merge results from multiple branches', zh: '合并多个分支的结果' },
    category: 'decision',
    icon: '🔗',
    color: '#eab308',
    accentColor: '#facc15',
    inputs: [
      { name: 'inputs', type: 'array', required: true, description: { en: 'Inputs to merge', zh: '要合并的输入' } },
    ],
    outputs: [
      { name: 'merged', type: 'any', required: true, description: { en: 'Merged result', zh: '合并后的结果' } },
    ],
    defaultConfig: {
      strategy: 'combine',
    },
  },
  {
    id: 'loop',
    type: 'builtin',
    name: { en: 'Loop', zh: '循环' },
    description: { en: 'Repeat execution until condition is met', zh: '重复执行直到条件满足' },
    category: 'decision',
    icon: '🔁',
    color: '#eab308',
    accentColor: '#facc15',
    inputs: [
      { name: 'initial', type: 'any', required: true, description: { en: 'Initial value', zh: '初始值' } },
      { name: 'condition', type: 'string', required: true, description: { en: 'Loop condition', zh: '循环条件' } },
    ],
    outputs: [
      { name: 'final_result', type: 'any', required: true, description: { en: 'Final result', zh: '最终结果' } },
      { name: 'iterations', type: 'number', required: false, description: { en: 'Number of iterations', zh: '迭代次数' } },
    ],
    defaultConfig: {
      max_iterations: 10,
    },
  },

  // ========== 协调节点 ==========
  {
    id: 'parallel',
    type: 'builtin',
    name: { en: 'Parallel', zh: '并行' },
    description: { en: 'Execute multiple tasks in parallel', zh: '并行执行多个任务' },
    category: 'coordinate',
    icon: '⚡',
    color: '#06b6d4',
    accentColor: '#22d3ee',
    inputs: [
      { name: 'tasks', type: 'array', required: true, description: { en: 'Tasks to execute', zh: '要执行的任务' } },
    ],
    outputs: [
      { name: 'results', type: 'array', required: true, description: { en: 'Execution results', zh: '执行结果' } },
    ],
    defaultConfig: {
      max_concurrent: 5,
    },
  },
  {
    id: 'sequence',
    type: 'builtin',
    name: { en: 'Sequence', zh: '顺序' },
    description: { en: 'Execute steps in sequence', zh: '按顺序执行步骤' },
    category: 'coordinate',
    icon: '📝',
    color: '#06b6d4',
    accentColor: '#22d3ee',
    inputs: [
      { name: 'steps', type: 'array', required: true, description: { en: 'Steps to execute', zh: '要执行的步骤' } },
    ],
    outputs: [
      { name: 'results', type: 'array', required: true, description: { en: 'Execution results', zh: '执行结果' } },
    ],
  },
  {
    id: 'assign',
    type: 'builtin',
    name: { en: 'Assign', zh: '分配' },
    description: { en: 'Assign tasks to appropriate agents', zh: '将任务分配给合适的 Agent' },
    category: 'coordinate',
    icon: '👤',
    color: '#06b6d4',
    accentColor: '#22d3ee',
    inputs: [
      { name: 'task', type: 'object', required: true, description: { en: 'Task to assign', zh: '要分配的任务' } },
      { name: 'agents', type: 'array', required: false, description: { en: 'Available agents', zh: '可用 Agent' } },
    ],
    outputs: [
      { name: 'assignment', type: 'object', required: true, description: { en: 'Task assignment', zh: '任务分配' } },
    ],
  },
  {
    id: 'aggregate',
    type: 'builtin',
    name: { en: 'Aggregate', zh: '汇总' },
    description: { en: 'Aggregate multiple results', zh: '汇总多个结果' },
    category: 'coordinate',
    icon: '📊',
    color: '#06b6d4',
    accentColor: '#22d3ee',
    inputs: [
      { name: 'results', type: 'array', required: true, description: { en: 'Results to aggregate', zh: '要汇总的结果' } },
    ],
    outputs: [
      { name: 'summary', type: 'object', required: true, description: { en: 'Aggregated summary', zh: '汇总摘要' } },
    ],
  },
  {
    id: 'barrier',
    type: 'builtin',
    name: { en: 'Barrier', zh: '屏障' },
    description: { en: 'Wait for all inputs before continuing', zh: '等待所有输入到达后再继续' },
    category: 'coordinate',
    icon: '🚧',
    color: '#06b6d4',
    accentColor: '#22d3ee',
    inputs: [
      { name: 'inputs', type: 'array', required: true, description: { en: 'Inputs to wait for', zh: '要等待的输入' } },
    ],
    outputs: [
      { name: 'all_inputs', type: 'array', required: true, description: { en: 'All collected inputs', zh: '收集的所有输入' } },
    ],
    defaultConfig: {
      expected_count: 0,
    },
  },
  {
    id: 'negotiate',
    type: 'builtin',
    name: { en: 'Negotiate', zh: '协商' },
    description: { en: 'Negotiate consensus among parties', zh: '多方协商达成共识' },
    category: 'coordinate',
    icon: '🤝',
    color: '#06b6d4',
    accentColor: '#22d3ee',
    inputs: [
      { name: 'proposal', type: 'object', required: true, description: { en: 'Initial proposal', zh: '初始提案' } },
      { name: 'parties', type: 'array', required: false, description: { en: 'Negotiating parties', zh: '协商方' } },
    ],
    outputs: [
      { name: 'consensus', type: 'object', required: false, description: { en: 'Final consensus', zh: '最终共识' } },
      { name: 'agreed', type: 'boolean', required: true, description: { en: 'Agreement reached', zh: '是否达成一致' } },
    ],
    defaultConfig: {
      max_rounds: 5,
      decision_rule: 'majority',
    },
  },

  // ========== 输出节点 ==========
  {
    id: 'report',
    type: 'builtin',
    name: { en: 'Report', zh: '报告' },
    description: { en: 'Generate execution report', zh: '生成执行报告' },
    category: 'output',
    icon: '📄',
    color: '#6b7280',
    accentColor: '#9ca3af',
    inputs: [
      { name: 'results', type: 'any', required: true, description: { en: 'Results to report', zh: '要报告的结果' } },
    ],
    outputs: [
      { name: 'report', type: 'string', required: true, description: { en: 'Generated report', zh: '生成的报告' } },
    ],
    defaultConfig: {
      format: 'markdown',
    },
  },
  {
    id: 'store',
    type: 'builtin',
    name: { en: 'Store', zh: '存储' },
    description: { en: 'Persist results to storage', zh: '持久化存储结果' },
    category: 'output',
    icon: '💾',
    color: '#6b7280',
    accentColor: '#9ca3af',
    inputs: [
      { name: 'data', type: 'any', required: true, description: { en: 'Data to store', zh: '要存储的数据' } },
      { name: 'location', type: 'string', required: false, description: { en: 'Storage location', zh: '存储位置' } },
    ],
    outputs: [
      { name: 'stored_path', type: 'string', required: false, description: { en: 'Storage path', zh: '存储路径' } },
    ],
  },
  {
    id: 'notify',
    type: 'builtin',
    name: { en: 'Notify', zh: '通知' },
    description: { en: 'Send notifications', zh: '发送通知' },
    category: 'output',
    icon: '🔔',
    color: '#6b7280',
    accentColor: '#9ca3af',
    inputs: [
      { name: 'message', type: 'string', required: true, description: { en: 'Notification message', zh: '通知消息' } },
      { name: 'channel', type: 'string', required: false, description: { en: 'Notification channel', zh: '通知渠道' } },
    ],
    outputs: [
      { name: 'sent', type: 'boolean', required: true, description: { en: 'Send status', zh: '发送状态' } },
    ],
    defaultConfig: {
      channel: 'console',
    },
  },

  // ========== ShadowFlow Agent 角色节点 ==========
  {
    id: 'planner',
    type: 'builtin',
    name: { en: 'Planner', zh: '规划者' },
    description: { en: 'Decomposes goals and orchestrates the team plan', zh: '拆解目标，编排团队计划' },
    category: 'planning',
    icon: '🗂',
    color: '#A855F7',
    accentColor: '#D8B4FE',
    inputs: [{ name: 'goal', type: 'string', required: true, description: { en: 'Goal', zh: '目标' } }],
    outputs: [{ name: 'plan', type: 'object', required: true, description: { en: 'Team plan', zh: '团队计划' } }],
    defaultConfig: { model: 'claude-sonnet-4', temperature: 0.2 },
  },
  {
    id: 'writer',
    type: 'builtin',
    name: { en: 'Writer', zh: '写手' },
    description: { en: 'Drafts documents, code, or structured content', zh: '起草文档、代码或结构化内容' },
    category: 'execution',
    icon: '✏️',
    color: '#3B82F6',
    accentColor: '#93C5FD',
    inputs: [{ name: 'brief', type: 'object', required: true, description: { en: 'Brief', zh: '任务简报' } }],
    outputs: [{ name: 'draft', type: 'string', required: true, description: { en: 'Draft output', zh: '草稿输出' } }],
    defaultConfig: { model: 'claude-sonnet-4', temperature: 0.4 },
  },
  {
    id: 'researcher',
    type: 'builtin',
    name: { en: 'Researcher', zh: '研究员' },
    description: { en: 'Gathers evidence, sources, and datasets', zh: '收集证据、来源和数据集' },
    category: 'input',
    icon: '🔍',
    color: '#10B981',
    accentColor: '#6EE7B7',
    inputs: [{ name: 'query', type: 'string', required: true, description: { en: 'Research query', zh: '研究问题' } }],
    outputs: [{ name: 'sources', type: 'array', required: true, description: { en: 'Sources found', zh: '找到的来源' } }],
    defaultConfig: { model: 'claude-sonnet-4', max_sources: 12 },
  },
  {
    id: 'critic',
    type: 'builtin',
    name: { en: 'Critic', zh: '评审' },
    description: { en: 'Reviews output quality and flags issues', zh: '审查输出质量，标记问题' },
    category: 'review',
    icon: '🔎',
    color: '#F59E0B',
    accentColor: '#FCD34D',
    inputs: [{ name: 'draft', type: 'string', required: true, description: { en: 'Draft to review', zh: '待审稿件' } }],
    outputs: [
      { name: 'verdict', type: 'string', required: true, description: { en: 'approve | reject', zh: '批准 | 拒绝' } },
      { name: 'feedback', type: 'string', required: false, description: { en: 'Feedback notes', zh: '反馈意见' } },
    ],
    defaultConfig: { model: 'claude-sonnet-4', strict: true },
  },
  {
    id: 'advisor',
    type: 'builtin',
    name: { en: 'Advisor', zh: '顾问' },
    description: { en: 'Domain expert that can approve or reject handoffs via Policy Matrix', zh: '领域专家，可通过 Policy Matrix 批准或拒绝交接' },
    category: 'review',
    icon: '🧑‍⚖️',
    color: '#EF4444',
    accentColor: '#FCA5A5',
    inputs: [{ name: 'handoff', type: 'object', required: true, description: { en: 'Handoff payload', zh: '交接内容' } }],
    outputs: [
      { name: 'verdict', type: 'string', required: true, description: { en: 'approve | reject | retry', zh: '批准 | 拒绝 | 重试' } },
      { name: 'reason', type: 'string', required: false, description: { en: 'Rejection reason', zh: '拒绝原因' } },
    ],
    defaultConfig: { model: 'claude-sonnet-4', policy: 'strict', retry_limit: 3 },
  },
  {
    id: 'editor',
    type: 'builtin',
    name: { en: 'Editor', zh: '编辑' },
    description: { en: 'Polishes and finalizes output before publish', zh: '润色并完成最终输出' },
    category: 'execution',
    icon: '✨',
    color: '#8B5CF6',
    accentColor: '#C4B5FD',
    inputs: [{ name: 'draft', type: 'string', required: true, description: { en: 'Draft to polish', zh: '待润色草稿' } }],
    outputs: [{ name: 'final', type: 'string', required: true, description: { en: 'Final output', zh: '最终输出' } }],
    defaultConfig: { model: 'claude-sonnet-4', temperature: 0.3 },
  },

  // ========== ShadowFlow 门控 · 路由节点 ==========
  {
    id: 'retry_gate',
    type: 'builtin',
    name: { en: 'Retry Gate', zh: '重试门' },
    description: { en: 'Enforces retry limits from Policy Matrix; rolls back on exceeded limit', zh: '执行 Policy Matrix 的重试限制，超限时回滚' },
    category: 'decision',
    icon: '↻',
    color: '#F59E0B',
    accentColor: '#FCD34D',
    inputs: [{ name: 'result', type: 'object', required: true, description: { en: 'Upstream result', zh: '上游结果' } }],
    outputs: [
      { name: 'retry', type: 'object', required: false, description: { en: 'Retry signal', zh: '重试信号' } },
      { name: 'pass', type: 'object', required: false, description: { en: 'Pass-through', zh: '通过' } },
    ],
    defaultConfig: { max_retries: 3 },
  },
  {
    id: 'approval_gate',
    type: 'builtin',
    name: { en: 'Approval Gate', zh: '审批门' },
    description: { en: 'Pauses execution for human or policy approval before continuing', zh: '暂停执行，等待人工或策略审批后继续' },
    category: 'coordinate',
    icon: '✓',
    color: '#10B981',
    accentColor: '#6EE7B7',
    inputs: [{ name: 'payload', type: 'object', required: true, description: { en: 'Payload to approve', zh: '待审批内容' } }],
    outputs: [
      { name: 'approved', type: 'object', required: false, description: { en: 'Approved payload', zh: '已批准内容' } },
      { name: 'rejected', type: 'object', required: false, description: { en: 'Rejected payload', zh: '已拒绝内容' } },
    ],
    defaultConfig: { approver: 'human', timeout_s: 300 },
  },
  {
    id: 'checkpoint',
    type: 'builtin',
    name: { en: 'Checkpoint', zh: '检查点' },
    description: { en: 'Saves a named snapshot to 0G Storage; enables fork and time-travel', zh: '将命名快照保存到 0G Storage，支持 fork 和时间回溯' },
    category: 'coordinate',
    icon: '◆',
    color: '#22D3EE',
    accentColor: '#67E8F9',
    inputs: [{ name: 'state', type: 'object', required: true, description: { en: 'State to snapshot', zh: '待快照状态' } }],
    outputs: [{ name: 'cid', type: 'string', required: true, description: { en: '0G CID', zh: '0G CID' } }],
    defaultConfig: { storage: '0g', label: '' },
  },
];

export const useNodeRegistry = create<NodeRegistryState>((set, get) => {
  const nodesMap = new Map<string, INode>();
  builtinNodes.forEach(node => nodesMap.set(node.id, node));

  return {
    nodes: nodesMap,
    categories: ['input', 'planning', 'execution', 'review', 'decision', 'coordinate', 'output'],

    registerNode: (node: INode) =>
      set(state => {
        const newNodes = new Map(state.nodes);
        newNodes.set(node.id, node);
        return { nodes: newNodes };
      }),

    unregisterNode: (nodeId: string) =>
      set(state => {
        const newNodes = new Map(state.nodes);
        newNodes.delete(nodeId);
        return { nodes: newNodes };
      }),

    getNode: (nodeId: string) => get().nodes.get(nodeId),

    getNodesByCategory: (category: NodeCategory) =>
      Array.from(get().nodes.values()).filter(node => node.category === category),

    getAllNodes: () => Array.from(get().nodes.values()),

    searchNodes: (query: string) => {
      const lowerQuery = query.toLowerCase();
      return Array.from(get().nodes.values()).filter(
        node =>
          node.name.en.toLowerCase().includes(lowerQuery) ||
          node.name.zh.toLowerCase().includes(lowerQuery) ||
          node.description.en.toLowerCase().includes(lowerQuery) ||
          node.description.zh.toLowerCase().includes(lowerQuery)
      );
    },
  };
});

// 导出内置节点作为常量
export { builtinNodes };
