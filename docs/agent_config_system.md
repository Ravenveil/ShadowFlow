# Agent 统一配置系统文档

## 概述

Agent 统一配置系统提供了灵活的 Agent 配置和管理功能，支持 YAML/JSON 配置文件、装饰器注册和配置验证。

## 主要特性

1. **扩展的 Agent 配置**：支持丰富的配置选项
2. **多种配置加载方式**：YAML、JSON、字典
3. **装饰器注册**：便捷的 Agent 定义方式
4. **配置验证**：确保配置完整性
5. **向后兼容**：保持与现有代码的兼容性

## 配置结构

### AgentConfig 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | str | ✓ | Agent 名称 |
| role | str | ✓ | Agent 角色 |
| prompt | str | ✓ | Agent 提示词 |
| tools | List[Union[str, ToolConfig]] | ✗ | 工具列表 |
| memory_scope | Literal["session", "user", "global"] | ✗ | 内存范围 |
| protocol_settings | ProtocolSettings | ✗ | 协议设置 |
| llm_config | LLMConfig | ✗ | LLM 配置 |
| topology_role | Literal["leader", "worker", "coordinator"] | ✗ | 拓扑角色 |
| enable_reasoning | bool | ✗ | 启用推理（兼容） |
| enable_validation | bool | ✗ | 启用验证（兼容） |
| fallback_agent | Optional[str] | ✗ | 降级 Agent（兼容） |
| max_retries | int | ✗ | 最大重试次数（兼容） |
| timeout | int | ✗ | 超时时间（兼容） |
| enable_trace | bool | ✗ | 启用追踪（兼容） |
| enable_fallback | bool | ✗ | 启用降级（兼容） |

### 子配置模型

#### ToolConfig
```python
class ToolConfig(BaseModel):
    name: str  # 工具名称
    description: Optional[str] = None  # 工具描述
    parameters: Dict[str, Any] = Field(default_factory=dict)  # 工具参数
```

#### ProtocolSettings
```python
class ProtocolSettings(BaseModel):
    reasoning_trace: bool = True  # 推理追踪
    validation: bool = True  # 验证
    fallback: bool = True  # 降级
```

#### LLMConfig
```python
class LLMConfig(BaseModel):
    provider: str = "anthropic"  # 提供商
    model: str = "claude-3-haiku-20240307"  # 模型
    temperature: float = 0.7  # 温度
    max_tokens: Optional[int] = 4000  # 最大令牌数
```

## 使用方法

### 1. 从配置文件加载

```python
# 从 YAML 加载
config = AgentConfig.from_yaml("path/to/config.yaml")

# 从 JSON 加载
config = AgentConfig.from_json("path/to/config.json")
```

### 2. 从字典创建

```python
config_dict = {
    "name": "data_analyzer",
    "role": "数据分析助手",
    "prompt": "分析数据并生成报告",
    "tools": ["calculator", "data_visualizer"]
}

config = AgentConfig.from_dict(config_dict)
```

### 3. 使用装饰器注册

```python
@agent_node({
    "name": "code_reviewer",
    "role": "代码审查专家",
    "prompt": "审查代码质量、安全性和性能问题",
    "tools": ["linter", "security_scanner"],
    "topology_role": "worker"
})
async def review_code(input: str, state: dict) -> str:
    # 实现
    return "审查结果"
```

### 4. 配置验证

```python
# 验证配置
if config.validate():
    print("配置有效")
else:
    print("配置无效")
```

### 5. 创建和执行 Agent

```python
# 创建 Agent
agent = Agent(config, "agent_id")

# 注册工具
agent.register_tool("calculator", calculator_func)

# 执行
result = await agent.invoke("输入内容", {"key": "value"})
```

## Agent 注册管理

### 全局注册函数

- `register_agent(agent, agent_id=None)`: 注册 Agent
- `get_agent(agent_id)`: 获取 Agent
- `list_agents()`: 列出所有 Agent
- `unregister_agent(agent_id)`: 注销 Agent

### 装饰器注册的特性

使用 `@agent_node` 装饰器创建的 Agent 会自动注册到全局注册器，可以通过 Agent ID 访问。

## 配置示例

### YAML 配置文件

```yaml
name: "数据分析师"
role: "专业数据分析师"
prompt: "分析提供的数据，提取关键洞察，并生成结构化报告。"

tools:
  - name: "calculator"
    description: "执行数学计算"
    parameters: {}

memory_scope: "session"

protocol_settings:
  reasoning_trace: true
  validation: true
  fallback: true

llm_config:
  provider: "anthropic"
  model: "claude-3-haiku-20240307"
  temperature: 0.3

topology_role: "worker"

# 兼容字段
enable_reasoning: true
max_retries: 3
timeout: 30
```

### JSON 配置文件

```json
{
    "name": "代码审查器",
    "role": "代码质量专家",
    "prompt": "审查代码并提供改进建议",
    "tools": ["linter", "formatter"],
    "memory_scope": "user",
    "protocol_settings": {
        "reasoning_trace": true,
        "validation": true,
        "fallback": false
    },
    "topology_role": "coordinator"
}
```

## 最佳实践

1. **配置文件组织**：将相关的配置文件放在同一目录下
2. **配置复用**：通过继承和组合复用配置
3. **命名规范**：使用清晰、一致的 Agent 名称
4. **工具描述**：为每个工具提供清晰的描述
5. **配置验证**：始终验证配置的有效性
6. **内存管理**：根据使用场景选择合适的内存范围

## 注意事项

1. 确保安装了 Pydantic v2
2. 配置文件路径必须是有效的
3. 工具名称必须是唯一的
4. 内存范围决定了 Agent 的状态持久化策略
5. 拓扑角色影响在多 Agent 协作中的行为