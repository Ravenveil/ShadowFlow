// ============================================================================
// 国际化配置 - 中英文支持
// ============================================================================

export const translations = {
  en: {
    // 通用
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      duplicate: 'Duplicate',
      confirm: 'Confirm',
      search: 'Search...',
      clear: 'Clear',
      add: 'Add',
      remove: 'Remove',
      run: 'Run',
      stop: 'Stop',
      export: 'Export',
      import: 'Import',
      new: 'New',
      open: 'Open',
      settings: 'Settings',
      help: 'Help',
      about: 'About',
    },

    // 应用标题
    app: {
      title: 'AgentGraph',
      subtitle: 'Visual Workflow Editor for AI Agents',
    },

    // 节点面板
    nodes: {
      title: 'Nodes',
      subtitle: 'Drag nodes to canvas',
    },

    // 分类
    categories: {
      input: 'Input',
      planning: 'Planning',
      execution: 'Execution',
      review: 'Review',
      decision: 'Decision',
      coordinate: 'Coordinate',
      output: 'Output',
    },

    // 节点名称和描述
    nodeNames: {
      receive: 'Receive',
      understand: 'Understand',
      clarify: 'Clarify',
      analyze: 'Analyze',
      design: 'Design',
      decompose: 'Decompose',
      spec: 'Specification',
      code: 'Code',
      test: 'Test',
      generate: 'Generate',
      transform: 'Transform',
      review: 'Review',
      validate: 'Validate',
      security: 'Security Audit',
      branch: 'Branch',
      merge: 'Merge',
      loop: 'Loop',
      parallel: 'Parallel',
      sequence: 'Sequence',
      assign: 'Assign',
      aggregate: 'Aggregate',
      barrier: 'Barrier',
      negotiate: 'Negotiate',
      report: 'Report',
      store: 'Store',
      notify: 'Notify',
    },

    nodeDescriptions: {
      receive: 'Receive and parse user input',
      understand: 'Analyze and understand task requirements',
      clarify: 'Clarify ambiguous requirements through Q&A',
      analyze: 'Analyze task complexity and dependencies',
      design: 'Design technical solutions or architecture',
      decompose: 'Break down large tasks into subtasks',
      spec: 'Create detailed execution specifications',
      code: 'Write code',
      test: 'Write or run tests',
      generate: 'Generate content (documents, reports, etc.)',
      transform: 'Transform or process data',
      review: 'Review the quality of artifacts',
      validate: 'Validate against specifications or constraints',
      security: 'Perform security audit and vulnerability scanning',
      branch: 'Select execution path based on conditions',
      merge: 'Merge results from multiple branches',
      loop: 'Repeat execution until condition is met',
      parallel: 'Execute multiple tasks in parallel',
      sequence: 'Execute steps in sequence',
      assign: 'Assign tasks to appropriate agents',
      aggregate: 'Aggregate multiple results',
      barrier: 'Wait for all inputs before continuing',
      negotiate: 'Negotiate consensus among parties',
      report: 'Generate execution report',
      store: 'Persist results to storage',
      notify: 'Send notifications',
    },

    // 工具栏
    toolbar: {
      undo: 'Undo',
      redo: 'Redo',
      zoomIn: 'Zoom In',
      zoomOut: 'Zoom Out',
      fitView: 'Fit View',
      autoLayout: 'Auto Layout',
      clearCanvas: 'Clear Canvas',
      exportWorkflow: 'Export Workflow',
      importWorkflow: 'Import Workflow',
      generateWorkflow: 'Generate from Task',
      runWorkflow: 'Run Workflow',
      stopWorkflow: 'Stop Workflow',
    },

    // 配置面板
    config: {
      title: 'Configuration',
      nodeId: 'Node ID',
      nodeType: 'Node Type',
      properties: 'Properties',
      inputs: 'Inputs',
      outputs: 'Outputs',
      status: 'Status',
      noNodeSelected: 'Select a node to edit its configuration',
      deleteNode: 'Delete Node',
    },

    // 节点状态
    status: {
      idle: 'Idle',
      running: 'Running',
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
    },

    // 布局
    layout: {
      hierarchical: 'Hierarchical',
      force: 'Force Directed',
      circular: 'Circular',
      grid: 'Grid',
    },

    // 导出格式
    exportFormat: {
      json: 'JSON',
      yaml: 'YAML',
      typescript: 'TypeScript',
    },

    // 消息
    messages: {
      workflowSaved: 'Workflow saved successfully',
      workflowLoaded: 'Workflow loaded successfully',
      workflowCleared: 'Canvas cleared',
      confirmDelete: 'Are you sure you want to delete this?',
      confirmClear: 'Are you sure you want to clear the canvas?',
      invalidConnection: 'Invalid connection',
      nodeAdded: 'Node added',
      nodeRemoved: 'Node removed',
      edgeAdded: 'Connection added',
      edgeRemoved: 'Connection removed',
      workflowStarted: 'Workflow started',
      workflowStopped: 'Workflow stopped',
      workflowCompleted: 'Workflow completed',
      workflowFailed: 'Workflow failed',
    },

    // 快捷键
    shortcuts: {
      delete: 'Delete',
      duplicate: 'Duplicate',
      undo: 'Undo',
      redo: 'Redo',
      save: 'Save',
      run: 'Run',
    },
  },
  zh: {
    // 通用
    common: {
      save: '保存',
      cancel: '取消',
      delete: '删除',
      edit: '编辑',
      duplicate: '复制',
      confirm: '确认',
      search: '搜索...',
      clear: '清除',
      add: '添加',
      remove: '移除',
      run: '运行',
      stop: '停止',
      export: '导出',
      import: '导入',
      new: '新建',
      open: '打开',
      settings: '设置',
      help: '帮助',
      about: '关于',
    },

    // 应用标题
    app: {
      title: 'AgentGraph',
      subtitle: 'AI Agent 可视化工作流编辑器',
    },

    // 节点面板
    nodes: {
      title: '节点',
      subtitle: '拖拽节点到画布',
    },

    // 分类
    categories: {
      input: '输入',
      planning: '规划',
      execution: '执行',
      review: '审核',
      decision: '决策',
      coordinate: '协调',
      output: '输出',
    },

    // 节点名称和描述
    nodeNames: {
      receive: '接收',
      understand: '理解',
      clarify: '澄清',
      analyze: '分析',
      design: '设计',
      decompose: '分解',
      spec: '规范',
      code: '编码',
      test: '测试',
      generate: '生成',
      transform: '转换',
      review: '审核',
      validate: '验证',
      security: '安全审计',
      branch: '分支',
      merge: '合并',
      loop: '循环',
      parallel: '并行',
      sequence: '顺序',
      assign: '分配',
      aggregate: '汇总',
      barrier: '屏障',
      negotiate: '协商',
      report: '报告',
      store: '存储',
      notify: '通知',
    },

    nodeDescriptions: {
      receive: '接收并解析用户输入',
      understand: '分析并理解任务需求',
      clarify: '通过问答澄清不明确的需求',
      analyze: '分析任务复杂度和依赖关系',
      design: '设计技术方案或架构',
      decompose: '将大任务分解为子任务',
      spec: '制定详细的执行规范',
      code: '编写代码',
      test: '编写或运行测试',
      generate: '生成内容（文档、报告等）',
      transform: '数据转换或处理',
      review: '审核产出物的质量',
      validate: '验证是否符合规范或约束',
      security: '执行安全审计和漏洞扫描',
      branch: '根据条件选择执行路径',
      merge: '合并多个分支的结果',
      loop: '重复执行直到条件满足',
      parallel: '并行执行多个任务',
      sequence: '按顺序执行步骤',
      assign: '将任务分配给合适的 Agent',
      aggregate: '汇总多个结果',
      barrier: '等待所有输入到达后再继续',
      negotiate: '多方协商达成共识',
      report: '生成执行报告',
      store: '持久化存储结果',
      notify: '发送通知',
    },

    // 工具栏
    toolbar: {
      undo: '撤销',
      redo: '重做',
      zoomIn: '放大',
      zoomOut: '缩小',
      fitView: '适应视图',
      autoLayout: '自动布局',
      clearCanvas: '清空画布',
      exportWorkflow: '导出工作流',
      importWorkflow: '导入工作流',
      generateWorkflow: '从任务生成',
      runWorkflow: '运行工作流',
      stopWorkflow: '停止工作流',
    },

    // 配置面板
    config: {
      title: '配置',
      nodeId: '节点 ID',
      nodeType: '节点类型',
      properties: '属性',
      inputs: '输入',
      outputs: '输出',
      status: '状态',
      noNodeSelected: '选择一个节点以编辑其配置',
      deleteNode: '删除节点',
    },

    // 节点状态
    status: {
      idle: '空闲',
      running: '运行中',
      success: '成功',
      error: '错误',
      warning: '警告',
    },

    // 布局
    layout: {
      hierarchical: '层次布局',
      force: '力导向布局',
      circular: '环形布局',
      grid: '网格布局',
    },

    // 导出格式
    exportFormat: {
      json: 'JSON',
      yaml: 'YAML',
      typescript: 'TypeScript',
    },

    // 消息
    messages: {
      workflowSaved: '工作流已保存',
      workflowLoaded: '工作流已加载',
      workflowCleared: '画布已清空',
      confirmDelete: '确定要删除吗？',
      confirmClear: '确定要清空画布吗？',
      invalidConnection: '无效的连接',
      nodeAdded: '节点已添加',
      nodeRemoved: '节点已删除',
      edgeAdded: '连接已添加',
      edgeRemoved: '连接已删除',
      workflowStarted: '工作流已启动',
      workflowStopped: '工作流已停止',
      workflowCompleted: '工作流已完成',
      workflowFailed: '工作流失败',
    },

    // 快捷键
    shortcuts: {
      delete: '删除',
      duplicate: '复制',
      undo: '撤销',
      redo: '重做',
      save: '保存',
      run: '运行',
    },
  },
};

// 获取翻译的辅助函数
export function t(key: string, language: 'en' | 'zh' = 'en'): string {
  const keys = key.split('.');
  let value: any = translations[language];
  for (const k of keys) {
    if (value && k in value) {
      value = value[k];
    } else {
      // 回退到英语
      value = translations.en;
      for (const k2 of keys) {
        if (value && k2 in value) {
          value = value[k2];
        } else {
          return key;
        }
      }
      return value;
    }
  }
  return typeof value === 'string' ? value : key;
}
