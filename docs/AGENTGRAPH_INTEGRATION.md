# AgentGraph 集成方案

> Legacy Integration Note
>
> 本文包含较多早期集成叙事和历史阶段判断，当前不应被视为 Phase 1 runtime contract 的权威集成文档。
> 如果你要按当前主线做集成，请优先以以下文档为准：
>
> - `docs/CORE_CHARTER.md`
> - `docs/RUNTIME_CONTRACT_SPEC.md`
> - `docs/WORKFLOW_SCHEMA.md`
> - `docs/api/http/README.md`

## 架构决策：独立项目 + 集成使用

### 核心原则

**AgentGraph 应该作为独立的 Python 项目，Shadow 通过 API 或 CLI 集成使用。**

这种架构既保持了 AgentGraph 的通用性和可复用性，又让 Shadow 能够利用其强大的多智能体能力。

---

## 原因分析

| 维度 | 独立项目 | 整合进 Shadow |
|------|-----------|---------------|
| **通用性** | ? 可被其他项目复用 | ? 仅限 Shadow 使用 |
| **维护性** | ? 独立版本管理 | ? 耦合度高 |
| **发布** | ? 可发布 PyPI 包 | ? 无法独立发布 |
| **测试** | ? 独立测试套件 | ? 依赖 Shadow 环境 |
| **技术栈** | ? Python（适合 AI 生态） | ? 需要跨语言集成 |

---

## 推荐架构

```
┌─────────────────────────────────────────────────────────┐
│                   Shadow (Tauri)                  │
│  ┌─────────────────────────────────────────────┐  │
│  │  知识库管理 + 用户界面             │  │
│  └─────────────────────────────────────────────┘  │
│                      ↓                            │
│              ┌─────────────────┐               │
│              │  Tauri 命令    │               │
│              └─────────────────┘               │
│                      ↓                            │
│  ┌─────────────────────────────────────────────┐  │
│  │  AgentGraph (Python)                    │  │
│  │  - 多智能体编排                         │  │
│  │  - 共享记忆中枢                         │  │
│  │  - 蜂群路由                             │  │
│  └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 集成方式

### 方式 1：HTTP API（推荐）

**优点**：
- 完全解耦
- 可独立部署和扩展
- 支持远程调用

**实现**：
```rust
// Shadow 端
#[tauri::command]
pub async fn execute_agent_workflow(
    workflow: String,
    input: String,
) -> Result<AgentResult, String> {
    let client = AgentGraphClient::new("http://localhost:8000");
    client.run_workflow(workflow, input).await
        .map_err(|e| e.to_string())
}
```

```python
# AgentGraph 端
from fastapi import FastAPI

app = FastAPI()

@app.post("/workflow/run")
async def run_workflow(request: WorkflowRequest):
    result = graph.invoke(request.input, user_id=request.user_id)
    return {"result": result, "trace": result.audit_log}
```

### 方式 2：Subprocess 调用

**优点**：
- 实现简单
- 无网络开销

**缺点**：
- 性能较差
- 进程管理复杂

**实现**：
```rust
use std::process::Command;

let output = Command::new("agentgraph")
    .args(["run", "-w", workflow, "-i", input])
    .output()
    .map_err(|e| ShadowError::Internal(e.to_string()))?;
```

---

## 项目结构建议

```
E:\VScode\
├── AgentGraph\          # 独立项目
│   ├── agentgraph\
│   │   ├── core\
│   │   │   ├── __init__.py
│   │   │   ├── agent.py
│   │   │   ├── graph.py
│   │   │   └── router.py
│   │   ├── memory\
│   │   │   ├── __init__.py
│   │   │   ├── base.py
│   │   │   ├── sqlite.py
│   │   │   └── redis.py
│   │   ├── protocol\
│   │   │   ├── __init__.py
│   │   │   ├── claude.py
│   │   │   └── validator.py
│   │   └── __init__.py
│   ├── examples\
│   │   ├── security_audit.yaml
│   │   └── code_review.yaml
│   ├── tests\
│   │   ├── test_agent.py
│   │   ├── test_memory.py
│   │   └── test_router.py
│   ├── pyproject.toml
│   ├── setup.py
│   └── README.md
│
└── Shadow\             # 当前项目
    ├── src-tauri\
    │   ├── ai\
    │   │   ├── agentgraph_client.rs  # AgentGraph 客户端
    │   │   ├── provider\
    │   │   │   └── agentgraph.rs
    │   │   └── ...
    │   └── ...
    └── ...
```

---

## 实施建议

### 阶段 1：AgentGraph 独立开发（2-4 周）

**Phase 0：PoC（3 天）**
- 实现 `Agent` 类 + `SharedMemory` 抽象
- 内置 `RuleRouter` + `SwarmRouter` 基础版
- CLI `agentgraph run -w workflow.yaml`

**Phase 1：MVP（2 周）**
- 加入 `ClaudeProtocol` 中间件
- 支持 SQLite/Redis memory
- 提供 3 个示例 Agent
- 发布 v0.1.0 到 PyPI

**Phase 2：Production（4 周）**
- Docker 沙箱支持
- FastAPI server + `/workflow/run` HTTP API
- Prometheus metrics + structured logging
- 发布 v1.0.0 GA

### 阶段 2：Shadow 集成（1-2 周）

**集成步骤**：

1. **添加 AgentGraph 客户端**
   - 实现 HTTP 客户端
   - 支持流式响应
   - 错误处理和重试机制

2. **替换现有 AI 调用**
   - 将简单的 LLM 调用替换为 AgentGraph 工作流
   - 支持多 Agent 协作场景
   - 保持向后兼容

3. **UI 增强**
   - 显示 Agent 执行过程
   - 展示 reasoning trace
   - 支持工作流可视化

---

## 技术细节

### AgentGraph API 设计

```python
# agentgraph/api.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List

class WorkflowRequest(BaseModel):
    workflow_id: str
    input: str
    user_id: Optional[str] = None
    config: Optional[dict] = None

class AgentStep(BaseModel):
    agent_id: str
    reason: str
    action: dict
    confidence: float
    timestamp: float

class WorkflowResponse(BaseModel):
    result: str
    steps: List[AgentStep]
    metadata: dict

@app.post("/workflow/run", response_model=WorkflowResponse)
async def run_workflow(request: WorkflowRequest):
    try:
        result = graph.invoke(
            input=request.input,
            user_id=request.user_id,
            config=request.config
        )
        return WorkflowResponse(
            result=result.output,
            steps=result.audit_log,
            metadata={"duration": result.duration}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Shadow 客户端实现

```rust
// src-tauri/ai/agentgraph_client.rs
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct WorkflowRequest {
    workflow_id: String,
    input: String,
    user_id: Option<String>,
    config: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct AgentStep {
    agent_id: String,
    reason: String,
    action: serde_json::Value,
    confidence: f64,
    timestamp: f64,
}

#[derive(Deserialize)]
struct WorkflowResponse {
    result: String,
    steps: Vec<AgentStep>,
    metadata: serde_json::Value,
}

pub struct AgentGraphClient {
    base_url: String,
    client: Client,
}

impl AgentGraphClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.to_string(),
            client: Client::new(),
        }
    }

    pub async fn run_workflow(
        &self,
        workflow_id: &str,
        input: &str,
        user_id: Option<&str>,
    ) -> Result<WorkflowResponse> {
        let request = WorkflowRequest {
            workflow_id: workflow_id.to_string(),
            input: input.to_string(),
            user_id: user_id.map(|s| s.to_string()),
            config: None,
        };

        let response = self.client
            .post(&format!("{}/workflow/run", self.base_url))
            .json(&request)
            .send()
            .await?
            .json()
            .await?;

        Ok(response)
    }
}
```

---

## 部署方案

### 开发环境

```bash
# 启动 AgentGraph 服务
cd AgentGraph
pip install -e .
agentgraph serve --port 8000

# Shadow 自动连接
cd Shadow
pnpm tauri dev
```

### 生产环境

```yaml
# docker-compose.yml
version: "3.8"
services:
  agentgraph:
    build: ./AgentGraph
    ports:
      - "8000:8000"
    environment:
      - MEMORY_BACKEND=redis
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  shadow:
    build: ./Shadow
    ports:
      - "5173:5173"
    environment:
      - AGENTGRAPH_URL=http://agentgraph:8000
    depends_on:
      - agentgraph
```

---

## 监控和日志

### AgentGraph 端

```python
# Prometheus metrics
from prometheus_client import Counter, Histogram

workflow_counter = Counter("workflow_executions", "Total workflow executions")
workflow_duration = Histogram("workflow_duration_seconds", "Workflow execution time")

@app.post("/workflow/run")
async def run_workflow(request: WorkflowRequest):
    start_time = time.time()
    
    try:
        result = graph.invoke(...)
        workflow_counter.inc()
        workflow_duration.observe(time.time() - start_time)
        return result
    except Exception as e:
        logger.error(f"Workflow failed: {e}", exc_info=True)
        raise
```

### Shadow 端

```rust
// 记录 AgentGraph 调用
#[tauri::command]
pub async fn execute_agent_workflow(
    workflow: String,
    input: String,
) -> Result<AgentResult, String> {
    let start = std::time::Instant::now();
    
    match client.run_workflow(&workflow, &input, None).await {
        Ok(result) => {
            info!("Workflow completed in {:?}", start.elapsed());
            Ok(result)
        }
        Err(e) => {
            error!("Workflow failed: {}", e);
            Err(e.to_string())
        }
    }
}
```

---

## 总结

**核心决策**：AgentGraph 作为独立项目，Shadow 通过 HTTP API 集成使用。

**优势**：
1. ? 保持 AgentGraph 的通用性和可复用性
2. ? 独立版本管理和发布
3. ? 完全解耦，易于测试和维护
4. ? 支持多种部署场景（本地/云端/混合）

**下一步行动**：
1. 创建 AgentGraph 项目骨架
2. 实现核心功能（Agent、Memory、Router）
3. 在 Shadow 中添加 AgentGraph 客户端
4. 测试集成和性能优化

---

## 参考文档

- [AgentGraph 计划书](./agentgraph计划书)
- [Shadow 架构文档](./ARCHITECTURE.md)
- [Claude Swarm Mode Guide](https://help.apiyi.com/en/claude-code-swarm-mode-multi-agent-guide-en.html)
- [Claude AI Agents Architecture](https://dextralabs.com/blog/claude-ai-agents-architecture-deployment-guide/)
