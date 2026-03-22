# 工作流规划器使用指南

## 概述

工作流规划器（Workflow Planner）是 AgentGraph 的核心组件，能够根据用户输入自动分析任务特征，生成合适的工作流配置。

## 架构组件

### 1. 任务分析器（TaskAnalyzer）

负责分析用户输入，识别任务类型、复杂度和所需工具。

```python
from agentgraph.planner import TaskAnalyzer

analyzer = TaskAnalyzer()
analysis = analyzer.analyze("对电商平台进行全面的安全审计")
print(f"任务类型: {analysis.task_type.value}")
print(f"复杂度: {analysis.complexity.value}")
print(f"所需工具: {analysis.required_tools}")
```

### 2. 工作流规划器（WorkflowPlanner）

整合任务分析和规则引擎，生成优化的工作流配置。

```python
from agentgraph.planner import WorkflowPlanner

planner = WorkflowPlanner()

# 分析任务
analysis = planner.analyze_input(input_text)

# 推荐代理
recommendations = planner.recommend_agents(analysis)

# 生成工作流
agents = [r.role for r in recommendations]
workflow = planner.generate_workflow(analysis, agents)

# 优化工作流
optimized = planner.optimize_workflow(workflow)
```

### 3. 规则引擎（RuleEngine）

基于 YAML 配置的规则系统，能够根据任务特征自动调整工作流。

```python
from agentgraph.planner import RuleEngine

# 自定义规则目录
rule_engine = RuleEngine(rules_dir="custom_rules")
```

## 支持的任务类型

1. **security_audit** - 安全审计
2. **code_review** - 代码审查
3. **data_pipeline** - 数据管道
4. **research** - 研究分析
5. **coding** - 编码开发
6. **documentation** - 文档生成
7. **testing** - 测试
8. **debugging** - 调试
9. **optimization** - 性能优化
10. **analysis** - 数据分析

## 工作流配置示例

### 安全审计工作流

```json
{
  "name": "安全审计工作流",
  "description": "执行全面的安全审计和漏洞扫描",
  "agents": ["security_expert", "vulnerability_analyzer"],
  "steps": ["scanning", "error_handling", "analysis", "reporting", "quality_check"],
  "tools": ["nmap", "burpsuite", "nikto"],
  "parallel": true,
  "timeout": 3600,
  "metadata": {
    "monitoring": true,
    "version": "1.0.0"
  }
}
```

### 代码审查工作流

```json
{
  "name": "代码审查工作流",
  "description": "进行代码质量检查和规范审查",
  "agents": ["code_reviewer", "static_analyzer"],
  "steps": ["initial_review", "error_handling", "detailed_analysis", "issue_reporting", "quality_check"],
  "tools": ["eslint", "pylint", "sonarqube"],
  "parallel": false,
  "timeout": 1800,
  "metadata": {
    "monitoring": true,
    "version": "1.0.0"
  }
}
```

## 自定义规则

创建 `rules/custom_rules.yaml` 文件来自定义工作流规则：

```yaml
- id: 'custom_security_rule'
  name: '自定义安全规则'
  description: '为安全任务添加额外步骤'
  condition:
    task_type: 'security_audit'
    complexity: 'high'
  actions:
    - type: 'add_step'
      step: 'comprehensive_report'
      position: 'end'
  priority: 100
  enabled: true
```

## 使用示例

### 完整示例

```python
from agentgraph.planner import WorkflowPlanner

# 创建规划器
planner = WorkflowPlanner()

# 用户输入
user_input = "审查React项目的代码质量，检查ESLint规范和潜在bug"

# 分析任务
analysis = planner.analyze_input(user_input)
print(f"分析结果: {analysis.task_type.value}, {analysis.complexity.value}")

# 推荐代理
recommendations = planner.recommend_agents(analysis)
for rec in recommendations:
    print(f"- {rec.role}: {rec.reason}")

# 生成工作流
workflow = planner.generate_workflow(analysis, [r.role for r in recommendations])

# 优化工作流
optimized = planner.optimize_workflow(workflow)

# 保存配置
planner.save_workflow(optimized, "review_workflow.json")
```

### 批量处理

```python
# 多个任务批量处理
tasks = [
    "对电商平台进行安全审计",
    "审查Java后端代码",
    "构建数据ETL管道"
]

for task in tasks:
    analysis = planner.analyze_input(task)
    workflow = planner.generate_workflow(analysis, analysis.suggested_agents)
    optimized = planner.optimize_workflow(workflow)

    # 保存每个任务的工作流
    filename = f"workflow_{analysis.task_type.value}.json"
    planner.save_workflow(optimized, filename)
```

## 高级功能

### 1. 动态规则加载

```python
# 运行时添加规则
from agentgraph.planner.rules import Rule

new_rule = Rule(
    id="dynamic_rule",
    name="动态规则",
    description="动态添加的规则",
    condition={"task_type": "coding"},
    actions=[{"type": "add_agent", "agent": "mentor"}],
    priority=50
)

rule_engine.add_rule(new_rule)
```

### 2. 工作流版本管理

```python
# 保存多个版本
for i in range(3):
    workflow.metadata["version"] = f"1.0.{i}"
    planner.save_workflow(workflow, f"workflow_v{i}.json")
```

### 3. 性能监控

```python
# 启用性能监控
import time

start_time = time.time()
workflow = planner.generate_workflow(analysis, agents)
end_time = time.time()

print(f"生成耗时: {end_time - start_time:.2f}秒")
print(f"代理数量: {len(workflow.agents)}")
print(f"步骤数量: {len(workflow.steps)}")
```

## 最佳实践

1. **规则管理**：定期审查和更新规则，保持规则库的时效性
2. **性能优化**：对于复杂任务，考虑使用并行处理
3. **错误处理**：为每个工作流添加错误处理步骤
4. **监控**：启用工作流监控和日志记录
5. **版本控制**：为重要工作流维护多个版本

## 故障排除

### 常见问题

1. **导入错误**
   ```python
   # 确保正确导入
   from agentgraph.planner import TaskAnalyzer, WorkflowPlanner
   ```

2. **规则不生效**
   ```python
   # 检查规则是否启用
   rule = rule_engine.get_rule(rule_id)
   if not rule.enabled:
       rule.enabled = True
   ```

3. **工作流复杂度过高**
   ```python
   # 简化工作流
   workflow.parallel = False
   workflow.steps = workflow.steps[:3]  # 只保留前3个步骤
   ```

## 贡献指南

欢迎贡献新的任务类型、工作流模板和规则！

1. 添加新的任务类型到 `TaskAnalyzer`
2. 创建新的工作流模板
3. 提交改进的规则
4. 编写测试用例