/**
 * 节点定义
 * 定义所有节点的输入端口、输出端口和配置 Schema
 */

import { INode, PortDefinition, NodeCategory, NodeTypeId } from '../types/node.types';

/**
 * 端口定义构建器
 */
function port(def: PortDefinition): PortDefinition {
  return def;
}

/**
 * 输入类节点定义
 */
export const INPUT_NODES: INode[] = [
  {
    id: 'receive' as NodeTypeId,
    category: NodeCategory.INPUT,
    name: { en: 'Receive', zh: '接收' },
    description: { en: 'Receive and parse input data', zh: '接收并解析输入数据' },
    icon: '📥',
    inputs: [
      port({ name: 'raw_input', type: 'string', required: true, description: { en: 'Raw input to parse', zh: '要解析的原始输入' } })
    ],
    outputs: [
      port({ name: 'raw_input', type: 'any', description: { en: 'Original raw input', zh: '原始输入' } }),
      port({ name: 'parsed_task', type: 'object', description: { en: 'Parsed task data', zh: '解析后的任务数据' } }),
      port({ name: 'input_size', type: 'number', description: { en: 'Input size in bytes', zh: '输入大小（字节）' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        parser: { type: 'string', enum: ['json', 'yaml', 'text', 'auto'], default: 'auto' },
        extract_entities: { type: 'boolean', default: false },
        max_input_size: { type: 'number', default: 1048576 }
      }
    }
  },
  {
    id: 'understand' as NodeTypeId,
    category: NodeCategory.INPUT,
    name: { en: 'Understand', zh: '理解' },
    description: { en: 'Understand task requirements', zh: '理解任务需求' },
    icon: '🧠',
    inputs: [
      port({ name: 'task', type: 'any', required: true, description: { en: 'Task to understand', zh: '要理解的任务' } })
    ],
    outputs: [
      port({ name: 'understanding', type: 'object', description: { en: 'Task understanding result', zh: '任务理解结果' } }),
      port({ name: 'complexity', type: 'number', description: { en: 'Task complexity (0-1)', zh: '任务复杂度（0-1）' } }),
      port({ name: 'required_capabilities', type: 'array', description: { en: 'Required capabilities', zh: '所需能力' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        depth: { type: 'string', enum: ['shallow', 'medium', 'deep'], default: 'medium' },
        ask_clarifying_questions: { type: 'boolean', default: false },
        max_questions: { type: 'number', default: 5 }
      }
    }
  },
  {
    id: 'clarify' as NodeTypeId,
    category: NodeCategory.INPUT,
    name: { en: 'Clarify', zh: '澄清' },
    description: { en: 'Clarify ambiguities', zh: '澄清疑问' },
    icon: '❓',
    inputs: [
      port({ name: 'task', type: 'any', required: true, description: { en: 'Task to clarify', zh: '要澄清的任务' } }),
      port({ name: 'clarifying_questions', type: 'array', description: { en: 'Questions to clarify', zh: '要澄清的问题' } })
    ],
    outputs: [
      port({ name: 'clarification_result', type: 'object', description: { en: 'Clarification result', zh: '澄清结果' } }),
      port({ name: 'refined_task', type: 'string', description: { en: 'Refined task description', zh: '精炼的任务描述' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['interactive', 'auto', 'batch'], default: 'auto' },
        max_rounds: { type: 'number', default: 3 },
        auto_infer: { type: 'boolean', default: false }
      }
    }
  }
];

/**
 * 规划类节点定义
 */
export const PLANNING_NODES: INode[] = [
  {
    id: 'analyze' as NodeTypeId,
    category: NodeCategory.PLANNING,
    name: { en: 'Analyze', zh: '分析' },
    description: { en: 'Analyze task complexity', zh: '分析任务复杂度' },
    icon: '📊',
    inputs: [
      port({ name: 'task', type: 'any', required: true, description: { en: 'Task to analyze', zh: '要分析的任务' } }),
      port({ name: 'understanding', type: 'object', description: { en: 'Task understanding', zh: '任务理解' } })
    ],
    outputs: [
      port({ name: 'complexity', type: 'object', description: { en: 'Complexity scores', zh: '复杂度评分' } }),
      port({ name: 'risks', type: 'array', description: { en: 'Identified risks', zh: '识别的风险' } }),
      port({ name: 'potential_issues', type: 'array', description: { en: 'Potential issues', zh: '潜在问题' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        detail_level: { type: 'string', enum: ['summary', 'standard', 'detailed'], default: 'standard' },
        assess_risks: { type: 'boolean', default: true },
        check_feasibility: { type: 'boolean', default: true }
      }
    }
  },
  {
    id: 'design' as NodeTypeId,
    category: NodeCategory.PLANNING,
    name: { en: 'Design', zh: '设计' },
    description: { en: 'Design technical solution', zh: '设计技术方案' },
    icon: '🎨',
    inputs: [
      port({ name: 'task', type: 'any', required: true, description: { en: 'Task to design for', zh: '要设计的任务' } }),
      port({ name: 'understanding', type: 'object', description: { en: 'Task understanding', zh: '任务理解' } }),
      port({ name: 'complexity', type: 'object', description: { en: 'Task complexity', zh: '任务复杂度' } })
    ],
    outputs: [
      port({ name: 'design', type: 'object', description: { en: 'Technical design', zh: '技术设计' } }),
      port({ name: 'architecture_pattern', type: 'string', description: { en: 'Architecture pattern', zh: '架构模式' } }),
      port({ name: 'data_models', type: 'array', description: { en: 'Data models', zh: '数据模型' } }),
      port({ name: 'implementation_steps', type: 'array', description: { en: 'Implementation steps', zh: '实现步骤' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        architecture_pattern: { type: 'string' },
        generate_data_models: { type: 'boolean', default: true },
        generate_interfaces: { type: 'boolean', default: true },
        detail_level: { type: 'string', enum: ['high-level', 'mid-level', 'detailed'], default: 'mid-level' }
      }
    }
  },
  {
    id: 'decompose' as NodeTypeId,
    category: NodeCategory.PLANNING,
    name: { en: 'Decompose', zh: '分解' },
    description: { en: 'Decompose task into subtasks', zh: '分解任务为子任务' },
    icon: '🔧',
    inputs: [
      port({ name: 'task', type: 'any', required: true, description: { en: 'Task to decompose', zh: '要分解的任务' } }),
      port({ name: 'implementation_steps', type: 'array', description: { en: 'Implementation steps', zh: '实现步骤' } })
    ],
    outputs: [
      port({ name: 'subtasks', type: 'array', description: { en: 'Subtasks', zh: '子任务' } }),
      port({ name: 'execution_plan', type: 'object', description: { en: 'Execution plan', zh: '执行计划' } }),
      port({ name: 'total_subtasks', type: 'number', description: { en: 'Total subtasks', zh: '子任务总数' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        strategy: { type: 'string', enum: ['sequential', 'parallel', 'hybrid'], default: 'sequential' },
        max_subtasks: { type: 'number', default: 10 },
        granularity: { type: 'string', enum: ['coarse', 'fine', 'auto'], default: 'auto' }
      }
    }
  },
  {
    id: 'spec' as NodeTypeId,
    category: NodeCategory.PLANNING,
    name: { en: 'Spec', zh: '规范' },
    description: { en: 'Define specifications', zh: '制定规范' },
    icon: '📋',
    inputs: [
      port({ name: 'task', type: 'any', required: true, description: { en: 'Task to spec', zh: '要制定规范的任务' } }),
      port({ name: 'design', type: 'object', description: { en: 'Design document', zh: '设计文档' } })
    ],
    outputs: [
      port({ name: 'specifications', type: 'array', description: { en: 'Specifications', zh: '规范' } }),
      port({ name: 'acceptance_criteria', type: 'array', description: { en: 'Acceptance criteria', zh: '验收标准' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        spec_type: { type: 'string', enum: ['functional', 'non-functional', 'all'], default: 'all' },
        strictness: { type: 'string', enum: ['relaxed', 'standard', 'strict'], default: 'standard' }
      }
    }
  }
];

/**
 * 执行类节点定义
 */
export const EXECUTION_NODES: INode[] = [
  {
    id: 'code' as NodeTypeId,
    category: NodeCategory.EXECUTION,
    name: { en: 'Code', zh: '编写代码' },
    description: { en: 'Generate code', zh: '生成代码' },
    icon: '💻',
    inputs: [
      port({ name: 'task', type: 'any', required: true, description: { en: 'Task to code', zh: '要编码的任务' } }),
      port({ name: 'subtask', type: 'object', description: { en: 'Subtask to implement', zh: '要实现的子任务' } }),
      port({ name: 'design', type: 'object', description: { en: 'Technical design', zh: '技术设计' } })
    ],
    outputs: [
      port({ name: 'code', type: 'string', description: { en: 'Generated code', zh: '生成的代码' } }),
      port({ name: 'file_path', type: 'string', description: { en: 'File path', zh: '文件路径' } }),
      port({ name: 'language', type: 'string', description: { en: 'Programming language', zh: '编程语言' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', default: 'typescript' },
        style: { type: 'string', enum: ['functional', 'object-oriented', 'procedural', 'auto'], default: 'auto' },
        add_comments: { type: 'boolean', default: true }
      }
    }
  },
  {
    id: 'test' as NodeTypeId,
    category: NodeCategory.EXECUTION,
    name: { en: 'Test', zh: '测试' },
    description: { en: 'Write or run tests', zh: '编写或运行测试' },
    icon: '🧪',
    inputs: [
      port({ name: 'code', type: 'string', required: true, description: { en: 'Code to test', zh: '要测试的代码' } }),
      port({ name: 'task', type: 'any', description: { en: 'Task context', zh: '任务上下文' } })
    ],
    outputs: [
      port({ name: 'test_code', type: 'string', description: { en: 'Generated test code', zh: '生成的测试代码' } }),
      port({ name: 'passed', type: 'number', description: { en: 'Passed tests', zh: '通过的测试' } }),
      port({ name: 'failed', type: 'number', description: { en: 'Failed tests', zh: '失败的测试' } }),
      port({ name: 'coverage', type: 'object', description: { en: 'Test coverage', zh: '测试覆盖率' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        test_type: { type: 'string', enum: ['write', 'run'], default: 'write' },
        test_category: { type: 'string', enum: ['unit', 'integration', 'e2e', 'all'], default: 'all' },
        target_coverage: { type: 'number', default: 80 }
      }
    }
  },
  {
    id: 'generate' as NodeTypeId,
    category: NodeCategory.EXECUTION,
    name: { en: 'Generate', zh: '生成内容' },
    description: { en: 'Generate content', zh: '生成内容' },
    icon: '📝',
    inputs: [
      port({ name: 'task', type: 'any', required: true, description: { en: 'Task to generate content for', zh: '要生成内容的任务' } }),
      port({ name: 'code', type: 'string', description: { en: 'Code to document', zh: '要文档化的代码' } })
    ],
    outputs: [
      port({ name: 'content', type: 'string', description: { en: 'Generated content', zh: '生成的内容' } }),
      port({ name: 'content_type', type: 'string', description: { en: 'Content type', zh: '内容类型' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        content_type: { type: 'string', default: 'documentation' },
        output_format: { type: 'string', enum: ['markdown', 'html', 'pdf'], default: 'markdown' },
        target_audience: { type: 'string', default: 'all' }
      }
    }
  },
  {
    id: 'transform' as NodeTypeId,
    category: NodeCategory.EXECUTION,
    name: { en: 'Transform', zh: '转换' },
    description: { en: 'Transform data', zh: '数据转换' },
    icon: '🔄',
    inputs: [
      port({ name: 'data', type: 'any', required: true, description: { en: 'Data to transform', zh: '要转换的数据' } }),
      port({ name: 'input_data', type: 'any', description: { en: 'Input data', zh: '输入数据' } })
    ],
    outputs: [
      port({ name: 'data', type: 'any', description: { en: 'Transformed data', zh: '转换后的数据' } }),
      port({ name: 'statistics', type: 'object', description: { en: 'Transform statistics', zh: '转换统计' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', default: 'map' },
        from_format: { type: 'string', default: 'json' },
        to_format: { type: 'string', default: 'json' }
      }
    }
  }
];

/**
 * 审核类节点定义
 */
export const REVIEW_NODES: INode[] = [
  {
    id: 'review' as NodeTypeId,
    category: NodeCategory.REVIEW,
    name: { en: 'Review', zh: '审核' },
    description: { en: 'Quality review', zh: '质量审核' },
    icon: '✅',
    inputs: [
      port({ name: 'artifact', type: 'any', required: true, description: { en: 'Artifact to review', zh: '要审核的内容' } }),
      port({ name: 'code', type: 'string', description: { en: 'Code to review', zh: '要审核的代码' } })
    ],
    outputs: [
      port({ name: 'approved', type: 'boolean', description: { en: 'Review approved', zh: '审核通过' } }),
      port({ name: 'score', type: 'number', description: { en: 'Review score (0-1)', zh: '审核评分（0-1）' } }),
      port({ name: 'issues', type: 'array', description: { en: 'Review issues', zh: '审核问题' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        strictness: { type: 'string', enum: ['loose', 'normal', 'strict'], default: 'normal' },
        auto_fix: { type: 'boolean', default: false }
      }
    }
  },
  {
    id: 'validate' as NodeTypeId,
    category: NodeCategory.REVIEW,
    name: { en: 'Validate', zh: '验证' },
    description: { en: 'Validate against specifications', zh: '规范验证' },
    icon: '🔍',
    inputs: [
      port({ name: 'artifact', type: 'any', required: true, description: { en: 'Artifact to validate', zh: '要验证的内容' } }),
      port({ name: 'specifications', type: 'array', description: { en: 'Specifications to validate against', zh: '验证依据的规范' } })
    ],
    outputs: [
      port({ name: 'valid', type: 'boolean', description: { en: 'Validation passed', zh: '验证通过' } }),
      port({ name: 'errors', type: 'array', description: { en: 'Validation errors', zh: '验证错误' } }),
      port({ name: 'warnings', type: 'array', description: { en: 'Validation warnings', zh: '验证警告' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        validation_type: { type: 'string', default: 'all' },
        strict_mode: { type: 'boolean', default: false },
        auto_fix: { type: 'boolean', default: false }
      }
    }
  },
  {
    id: 'security' as NodeTypeId,
    category: NodeCategory.REVIEW,
    name: { en: 'Security', zh: '安全审计' },
    description: { en: 'Security audit', zh: '安全审计' },
    icon: '🔒',
    inputs: [
      port({ name: 'artifact', type: 'any', required: true, description: { en: 'Artifact to audit', zh: '要审计的内容' } }),
      port({ name: 'code', type: 'string', description: { en: 'Code to audit', zh: '要审计的代码' } })
    ],
    outputs: [
      port({ name: 'secure', type: 'boolean', description: { en: 'Is secure', zh: '是否安全' } }),
      port({ name: 'vulnerabilities', type: 'array', description: { en: 'Security vulnerabilities', zh: '安全漏洞' } }),
      port({ name: 'risk_score', type: 'number', description: { en: 'Risk score (0-1)', zh: '风险评分（0-1）' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', default: 'all' },
        standard: { type: 'string', enum: ['owasp', 'sans', 'custom'], default: 'owasp' },
        generate_fixes: { type: 'boolean', default: false }
      }
    }
  }
];

/**
 * 决策类节点定义
 */
export const DECISION_NODES: INode[] = [
  {
    id: 'branch' as NodeTypeId,
    category: NodeCategory.DECISION,
    name: { en: 'Branch', zh: '分支' },
    description: { en: 'Conditional branch', zh: '条件分支' },
    icon: '🔀',
    inputs: [
      port({ name: 'data', type: 'any', required: true, description: { en: 'Data to evaluate', zh: '要评估的数据' } })
    ],
    outputs: [
      port({ name: 'branch_result', type: 'boolean', description: { en: 'Branch condition result', zh: '分支条件结果' } }),
      port({ name: 'branch_taken', type: 'string', description: { en: 'Which branch was taken', zh: '走的是哪个分支' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        condition_type: { type: 'string', enum: ['simple', 'expression', 'comparison', 'logical'], default: 'simple' },
        condition: { type: 'string' },
        variable: { type: 'string' },
        operator: { type: 'string' },
        value: { type: 'any' }
      }
    }
  },
  {
    id: 'merge' as NodeTypeId,
    category: NodeCategory.DECISION,
    name: { en: 'Merge', zh: '合并' },
    description: { en: 'Merge results', zh: '合并结果' },
    icon: '🔗',
    inputs: [
      port({ name: 'input_data', type: 'any', isMultiple: true, description: { en: 'Inputs to merge', zh: '要合并的输入' } })
    ],
    outputs: [
      port({ name: 'merged', type: 'any', description: { en: 'Merged result', zh: '合并后的结果' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        strategy: { type: 'string', enum: ['concatenate', 'merge', 'overwrite', 'union', 'first', 'last'], default: 'merge' },
        deep_merge: { type: 'boolean', default: false }
      }
    }
  },
  {
    id: 'loop' as NodeTypeId,
    category: NodeCategory.DECISION,
    name: { en: 'Loop', zh: '循环' },
    description: { en: 'Loop execution', zh: '循环执行' },
    icon: '🔁',
    inputs: [
      port({ name: 'tasks', type: 'array', description: { en: 'Tasks to loop over', zh: '要循环的任务' } })
    ],
    outputs: [
      port({ name: 'results', type: 'array', description: { en: 'Loop results', zh: '循环结果' } }),
      port({ name: 'iterations', type: 'number', description: { en: 'Number of iterations', zh: '迭代次数' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        loop_type: { type: 'string', enum: ['for', 'while', 'until', 'for_each'], default: 'for' },
        max_iterations: { type: 'number', default: 10 },
        collect_results: { type: 'boolean', default: true }
      }
    }
  }
];

/**
 * 协调类节点定义
 */
export const COORDINATE_NODES: INode[] = [
  {
    id: 'parallel' as NodeTypeId,
    category: NodeCategory.COORDINATE,
    name: { en: 'Parallel', zh: '并行' },
    description: { en: 'Execute in parallel', zh: '并行执行' },
    icon: '⚡',
    inputs: [
      port({ name: 'tasks', type: 'array', required: true, description: { en: 'Tasks to execute', zh: '要执行的任务' } })
    ],
    outputs: [
      port({ name: 'results', type: 'array', description: { en: 'Execution results', zh: '执行结果' } }),
      port({ name: 'success_count', type: 'number', description: { en: 'Successful tasks', zh: '成功任务数' } }),
      port({ name: 'failure_count', type: 'number', description: { en: 'Failed tasks', zh: '失败任务数' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        max_concurrent: { type: 'number', default: 5 },
        fail_fast: { type: 'boolean', default: false },
        timeout: { type: 'number', default: 30000 }
      }
    }
  },
  {
    id: 'sequence' as NodeTypeId,
    category: NodeCategory.COORDINATE,
    name: { en: 'Sequence', zh: '顺序' },
    description: { en: 'Execute in sequence', zh: '顺序执行' },
    icon: '➡️',
    inputs: [
      port({ name: 'tasks', type: 'array', required: true, description: { en: 'Tasks to execute', zh: '要执行的任务' } })
    ],
    outputs: [
      port({ name: 'results', type: 'array', description: { en: 'Execution results', zh: '执行结果' } }),
      port({ name: 'last_result', type: 'any', description: { en: 'Last result', zh: '最后一个结果' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        stop_on_error: { type: 'boolean', default: true },
        collect_results: { type: 'boolean', default: true },
        chain_results: { type: 'boolean', default: false }
      }
    }
  },
  {
    id: 'assign' as NodeTypeId,
    category: NodeCategory.COORDINATE,
    name: { en: 'Assign', zh: '分配' },
    description: { en: 'Assign tasks to agents', zh: '任务分配' },
    icon: '👥',
    inputs: [
      port({ name: 'tasks', type: 'array', required: true, description: { en: 'Tasks to assign', zh: '要分配的任务' } })
    ],
    outputs: [
      port({ name: 'assignments', type: 'array', description: { en: 'Task assignments', zh: '任务分配' } }),
      port({ name: 'count', type: 'number', description: { en: 'Number of assignments', zh: '分配数量' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        strategy: { type: 'string', enum: ['round_robin', 'random', 'capability_based', 'manual'], default: 'capability_based' },
        auto_reserve: { type: 'boolean', default: true }
      }
    }
  },
  {
    id: 'aggregate' as NodeTypeId,
    category: NodeCategory.COORDINATE,
    name: { en: 'Aggregate', zh: '汇总' },
    description: { en: 'Aggregate results', zh: '结果汇总' },
    icon: '📊',
    inputs: [
      port({ name: 'results', type: 'array', required: true, description: { en: 'Results to aggregate', zh: '要汇总的结果' } })
    ],
    outputs: [
      port({ name: 'result', type: 'any', description: { en: 'Aggregated result', zh: '汇总后的结果' } }),
      port({ name: 'count', type: 'number', description: { en: 'Item count', zh: '项目数量' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        aggregate_type: { type: 'string', enum: ['sum', 'average', 'count', 'merge', 'custom'], default: 'merge' },
        field: { type: 'string' },
        include_statistics: { type: 'boolean', default: false }
      }
    }
  },
  {
    id: 'barrier' as NodeTypeId,
    category: NodeCategory.COORDINATE,
    name: { en: 'Barrier', zh: '屏障' },
    description: { en: 'Barrier synchronization', zh: '屏障同步' },
    icon: '⏸️',
    inputs: [],
    outputs: [
      port({ name: 'completed', type: 'boolean', description: { en: 'All tasks completed', zh: '所有任务完成' } }),
      port({ name: 'completed_count', type: 'number', description: { en: 'Completed tasks', zh: '完成任务数' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        task_count: { type: 'number', default: 3 },
        timeout: { type: 'number', default: 60000 },
        allow_partial: { type: 'boolean', default: false }
      }
    }
  },
  {
    id: 'negotiate' as NodeTypeId,
    category: NodeCategory.COORDINATE,
    name: { en: 'Negotiate', zh: '协商' },
    description: { en: 'Multi-party negotiation', zh: '多方协商' },
    icon: '🤝',
    inputs: [
      port({ name: 'participants', type: 'array', required: true, description: { en: 'Participants', zh: '参与者' } })
    ],
    outputs: [
      port({ name: 'agreed', type: 'boolean', description: { en: 'Agreement reached', zh: '达成一致' } }),
      port({ name: 'final_proposal', type: 'any', description: { en: 'Final proposal', zh: '最终方案' } }),
      port({ name: 'opinions', type: 'array', description: { en: 'Participant opinions', zh: '参与者意见' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        strategy: { type: 'string', enum: ['majority_vote', 'consensus', 'expert_priority'], default: 'majority_vote' },
        max_rounds: { type: 'number', default: 3 }
      }
    }
  }
];

/**
 * 输出类节点定义
 */
export const OUTPUT_NODES: INode[] = [
  {
    id: 'report' as NodeTypeId,
    category: NodeCategory.OUTPUT,
    name: { en: 'Report', zh: '报告' },
    description: { en: 'Generate report', zh: '生成报告' },
    icon: '📄',
    inputs: [
      port({ name: 'data', type: 'any', required: true, description: { en: 'Data for report', zh: '报告数据' } })
    ],
    outputs: [
      port({ name: 'report', type: 'string', description: { en: 'Generated report', zh: '生成的报告' } }),
      port({ name: 'file_name', type: 'string', description: { en: 'Report file name', zh: '报告文件名' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        report_type: { type: 'string', enum: ['summary', 'detailed', 'executive', 'technical'], default: 'summary' },
        output_format: { type: 'string', enum: ['markdown', 'html', 'pdf', 'json'], default: 'markdown' }
      }
    }
  },
  {
    id: 'store' as NodeTypeId,
    category: NodeCategory.OUTPUT,
    name: { en: 'Store', zh: '存储' },
    description: { en: 'Persist data', zh: '持久化存储' },
    icon: '💾',
    inputs: [
      port({ name: 'data', type: 'any', required: true, description: { en: 'Data to store', zh: '要存储的数据' } })
    ],
    outputs: [
      port({ name: 'stored', type: 'boolean', description: { en: 'Successfully stored', zh: '存储成功' } }),
      port({ name: 'location', type: 'string', description: { en: 'Storage location', zh: '存储位置' } }),
      port({ name: 'size', type: 'number', description: { en: 'Data size', zh: '数据大小' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        store_type: { type: 'string', enum: ['file', 'database', 'cache', 'variable'], default: 'variable' },
        target: { type: 'string' },
        file_format: { type: 'string', default: 'json' }
      }
    }
  },
  {
    id: 'notify' as NodeTypeId,
    category: NodeCategory.OUTPUT,
    name: { en: 'Notify', zh: '通知' },
    description: { en: 'Send notification', zh: '发送通知' },
    icon: '🔔',
    inputs: [
      port({ name: 'message', type: 'string', required: true, description: { en: 'Notification message', zh: '通知消息' } }),
      port({ name: 'subject', type: 'string', description: { en: 'Notification subject', zh: '通知主题' } })
    ],
    outputs: [
      port({ name: 'sent', type: 'boolean', description: { en: 'Notification sent', zh: '通知已发送' } }),
      port({ name: 'notification_id', type: 'string', description: { en: 'Notification ID', zh: '通知ID' } })
    ],
    configSchema: {
      type: 'object',
      properties: {
        notification_type: { type: 'string', enum: ['email', 'slack', 'webhook', 'console'], default: 'console' },
        destination: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' }
      }
    }
  }
];

/**
 * 所有节点定义
 */
export const ALL_NODES: INode[] = [
  ...INPUT_NODES,
  ...PLANNING_NODES,
  ...EXECUTION_NODES,
  ...REVIEW_NODES,
  ...DECISION_NODES,
  ...COORDINATE_NODES,
  ...OUTPUT_NODES
];

/**
 * 按分类获取节点
 */
export function getNodesByCategory(category: NodeCategory): INode[] {
  return ALL_NODES.filter(node => node.category === category);
}

/**
 * 按 ID 获取节点
 */
export function getNodeById(id: NodeTypeId): INode | undefined {
  return ALL_NODES.find(node => node.id === id);
}
