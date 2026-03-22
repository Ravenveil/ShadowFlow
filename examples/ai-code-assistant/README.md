# AI 代码助手示例

> 使用 AgentGraph 河流式记忆系统构建的 AI 代码助手

## 🌊 河流式记忆演示

这个示例展示了一个完整的 AI 代码助手工作流：

```
用户需求
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        主干河流                                  │
│  ════════════════════════════════════════════════════════════▶  │
│                                                                 │
│  [需求分析] ──▶ [架构设计] ──▶ [代码生成] ──▶ [测试] ──▶ [审核]   │
│       │              │              │            │          │   │
│       │              │              │            │          │   │
│       └──────────────┴──────────────┴────────────┴──────────┘   │
│                              │                                  │
│                              ▼                                  │
│                        沉淀层                                   │
│                    (学习到的模式)                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
  产出代码
```

## 节点记忆流转

### 1. 需求分析节点
```typescript
// 🥤 取水 - 读取用户输入
const userInput = this.drinkMemory(context, 'context');

// 🌊 注水 - 输出分析结果
this.pourMemory(context, {
  type: 'context',
  content: {
    type: 'requirement_analysis',
    requirements: [...],
    constraints: [...],
    techStack: ['TypeScript', 'React']
  }
});
```

### 2. 架构设计节点
```typescript
// 🥤 取水 - 读取需求分析
const analysis = this.drinkMemory(context, 'context');

// 🏝️ 从沉淀层挖掘 - 获取之前的设计模式
const patterns = this.dredgePatterns(context, {
  type: 'success_pattern',
  minImportance: 0.7
});

// 🌊 注水 - 输出设计决策
this.pourMemory(context, {
  type: 'context',
  content: {
    type: 'design_decision',
    architecture: 'MVC',
    modules: [...],
    interfaces: [...]
  }
});
```

### 3. 代码生成节点
```typescript
// 🥤 取水 - 读取设计和需求
const design = this.scoopMemory(context, {
  type: 'context',
  sourceNode: 'design'
});

// 🌊 注水 - 输出生成的代码
this.pourMemory(context, {
  type: 'execution',
  content: {
    files: [...],
    dependencies: [...]
  }
});

// 🏝️ 沉淀 - 记录成功的代码模式
if (codeQuality > 0.8) {
  this.settlePattern(context, {
    type: 'success_pattern',
    content: { pattern: '...', category: 'code' }
  });
}
```

### 4. 测试节点
```typescript
// 🚧 建闸 - 测试前创建检查点
const checkpointId = this.buildCheckpoint(context);

// 执行测试...

// 如果测试失败，可以开闸恢复
if (testFailed) {
  this.openCheckpoint(context, checkpointId);
}
```

## 运行示例

```bash
# 安装依赖
npm install

# 运行示例
npm run example

# 或者直接运行
npx ts-node src/index.ts
```

## 示例输入/输出

### 输入
```
创建一个用户登录API，支持邮箱和密码登录
```

### 输出
```
📁 生成的文件：
├── src/controllers/auth.controller.ts
├── src/services/auth.service.ts
├── src/middleware/auth.middleware.ts
├── src/routes/auth.routes.ts
├── src/models/user.model.ts
└── tests/auth.test.ts

📊 统计：
- 总代码行数: 450
- 测试覆盖率: 85%
- 审核得分: 0.92
```

## 学习要点

1. **记忆流转** - 节点间如何通过河流共享记忆
2. **沉淀学习** - 成功模式如何沉淀到知识库
3. **检查点** - 如何在关键点创建恢复点
4. **上下文传递** - 设计决策如何传递到代码生成

## 扩展

你可以基于这个示例：
- 添加更多节点（如部署、监控）
- 自定义沉淀策略
- 集成你自己的 LLM
- 添加自定义模式识别
