# AgentGraph Phase 0 完成报告

> 完成日期：2026-03-07
> 版本：v0.1.0-alpha

---

## 一、项目概述

**AgentGraph** 是一个融合蜂群智能与 Claude 认知协议的多智能体工作流系统。

**核心定位**：
> AgentGraph = LangGraph 的图编排能力 × 蜂群（Swarm）的自组织韧性 × Claude 的可信推理协议

---

## 二、今日完成功能

### 2.1 核心功能

| 功能 | 状态 | 说明 |
|------|------|------|
| Agent 竞标机制 | ✅ | `Agent.bid()` 基于角色/工具匹配度 |
| SwarmRouter 路由 | ✅ | 真正竞标 + 历史强化学习 |
| 三层记忆系统 | ✅ | Session/User/Global 层级 |
| 跨会话检索 | ✅ | Agent 间共享用户历史 |
| LLM Provider 抽象 | ✅ | Claude/Gemini/OpenAI/Ollama |
| Graph 可视化 | ✅ | Mermaid + ASCII 图 |
| Graph 条件匹配 | ✅ | 表达式解析 `vulns_found > 0` |
| Rust 后端修复 | ✅ | 错误处理完善 |

### 2.2 新增文件

```
agentgraph/
├── llm/                        # LLM Provider 抽象层
│   ├── __init__.py             # 工厂函数
│   ├── base.py                 # LLMProvider 基类
│   ├── claude.py               # Claude API
│   ├── gemini.py               # Gemini API
│   ├── openai.py               # OpenAI/DeepSeek
│   └── ollama.py               # 本地 Ollama
│
├── memory/                     # 三层记忆架构
│   ├── base.py                 # 基础接口
│   ├── layers.py               # KnowledgeLayer/ContextLayer/SemanticLayer
│   ├── session.py              # SessionMemory（内存）
│   ├── user.py                 # UserMemory（SQLite，跨会话）
│   ├── global_memory.py        # GlobalMemory（全局模式库）
│   └── patterns.py             # PatternStore + PatternLearner
│
├── protocol/
│   └── claude.py               # FallbackChain（RETRY/CACHE/DELEGATE）
│
└── core/
    ├── agent.py                # + bid() 方法
    ├── router.py               # + 真正竞标机制
    └── graph.py                # + 条件匹配 + 可视化 + 记忆集成
```

---

## 三、核心设计

### 3.1 Agent 竞标机制

```python
class Agent:
    async def bid(self, input: str, state: Dict) -> tuple[float, str]:
        """
        返回 (score, reason) 用于竞标路由
        - score: 0.0-1.0 置信度
        - reason: 为什么这个 Agent 适合
        """
        # 基于角色匹配度 (30%)
        # 基于 Prompt 匹配度 (15%)
        # 基于工具可用性 (20%)
```

### 3.2 SwarmRouter 路由

```python
class SwarmRouter(Router):
    async def route(self, state, agents, current_id):
        # 1. 调用所有 Agent 的 bid() 方法
        # 2. 应用历史强化学习权重 (70% 当前 + 30% 历史)
        # 3. 选择最高分 Agent
        # 4. 记录路由历史
```

### 3.3 三层记忆架构

```
┌─────────────────────────────────────┐
│     KnowledgeLayer (知识层)          │
│     • MD 笔记、WikiLink、标签         │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│     ContextLayer (上下文层)          │
│     • 会话记忆、工作流状态            │
│     • SessionMemory (内存)           │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│     SemanticLayer (语义层)           │
│     • Agent 偏好、用户画像            │
│     • PatternStore (SQLite)          │
│     • UserMemory (跨会话检索)         │
└─────────────────────────────────────┘
```

### 3.4 LLM Provider 抽象

```python
from agentgraph.llm import create_provider, ProviderType, LLMConfig

# 创建不同 Provider
claude = create_provider(ProviderType.CLAUDE, LLMConfig(
    model="claude-3-opus-20240229",
    api_key="..."
))

gemini = create_provider(ProviderType.GEMINI, LLMConfig(
    model="gemini-2.0-flash",
    api_key="..."
))

# 每个 Agent 可以用不同 LLM
frontend_agent = Agent(config, provider=gemini)  # Gemini 擅长 UI
backend_agent = Agent(config, provider=claude)   # Claude 擅长逻辑
```

### 3.5 Graph 可视化

```python
graph = AgentGraph()
graph.add_agent(researcher)
graph.add_agent(coder)
graph.add_edge(Edge("researcher", "coder", condition="vulns_found > 0"))

# Mermaid 图
print(graph.to_mermaid())

# ASCII 图
print(graph.draw())
```

---

## 四、使用示例

### 4.1 基础使用

```python
from agentgraph import AgentGraph, Agent, AgentConfig
from agentgraph.router import SwarmRouter

# 创建 Graph（蜂群模式）
graph = AgentGraph(
    memory=LayeredMemory(),
    router=SwarmRouter()
)

# 创建 Agent
researcher = Agent(AgentConfig(
    name="Security Researcher",
    role="Find vulnerabilities in code",
    tools=["nvd_search", "cve_lookup"]
), "researcher")

coder = Agent(AgentConfig(
    name="Secure Coder",
    role="Fix security vulnerabilities",
    tools=["code_analyzer", "patch_generator"]
), "coder")

# 添加到 Graph
graph.add_agent(researcher)
graph.add_agent(coder)

# 执行工作流
result = await graph.invoke(
    input="Audit this authentication code for vulnerabilities",
    user_id="alice"
)

# 查看结果
print(result.output)
print(f"Steps: {len(result.steps)}")
print(f"Trace:\n{graph.get_protocol_trace_formatted()}")
```

### 4.2 跨会话记忆

```python
# 第一次会话
result1 = await graph.invoke("实现登录功能", user_id="alice")

# 第二次会话 - Agent 能看到之前的交互
result2 = await graph.invoke("继续完善认证", user_id="alice")

# 查看记忆上下文
context = await graph.get_memory_context("alice")
print(context)
```

---

## 五、项目结构

```
AgentGraph/
├── agentgraph/                # Python 包
│   ├── __init__.py
│   ├── cli.py                 # 命令行接口
│   ├── server.py              # FastAPI 服务器
│   ├── core/                  # 核心模块
│   │   ├── agent.py           # Agent 类
│   │   ├── graph.py           # AgentGraph 类
│   │   ├── router.py          # Router 实现
│   │   └── state.py           # 状态定义
│   ├── llm/                   # LLM Provider
│   ├── memory/                # 记忆系统
│   └── protocol/              # 协议层
│
├── src-tauri/                 # Rust 后端（可选）
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── error.rs
│       ├── models.rs
│       ├── storage.rs
│       ├── knowledge_base.rs
│       ├── file_watcher.rs
│       └── commands.rs
│
├── docs/                      # 文档
│   ├── ARCHITECTURE.md
│   ├── PHASE1_IMPLEMENTATION.md
│   ├── SHADOW_CLAW_DESIGN.md
│   ├── SECURITY_ARCHITECTURE.md
│   ├── AGENTGRAPH_INTEGRATION.md
│   └── agentgraph计划书
│
├── examples/                  # 示例
│   └── simple_workflow.yaml
│
├── tests/                     # 测试
│   └── test_agentgraph.py
│
├── pyproject.toml             # Python 配置
└── README.md
```

---

## 六、下一步计划

### Phase 1: MVP（2 周）

- [ ] Agent 统一定义和配置系统
- [ ] 自动工作流规划器
- [ ] 蜂群拓扑（层级/网格/环形/星形）
- [ ] 工作流模板库
- [ ] 完整的单元测试
- [ ] 文档完善

### Phase 2: Production（4 周）

- [ ] Docker 沙箱支持
- [ ] FastAPI 服务器完善
- [ ] Prometheus 监控
- [ ] 发布到 PyPI

### Phase 3: Shadow 集成

- [ ] HTTP API 集成
- [ ] 知识库同步
- [ ] UI 集成

---

## 七、参考资源

- [LangGraph 文档](https://github.com/langchain-ai/langgraph)
- [Claude Code Swarm Mode](https://help.apiyi.com/en/claude-code-swarm-mode-multi-agent-guide-en.html)
- [Claude AI Agents Architecture](https://dextralabs.com/blog/claude-ai-agents-architecture-deployment-guide/)
