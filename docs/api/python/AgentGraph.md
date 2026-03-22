# AgentGraph API Reference

## AgentGraph Class

The `AgentGraph` class is the main orchestration engine for managing multi-agent workflows.

### Constructor

```python
from agentgraph import AgentGraph, SQLiteMemory, RedisMemory

class AgentGraph:
    def __init__(self, memory: Optional[MemoryBackend] = None, config: Optional[GraphConfig] = None)
```

#### Parameters

- **memory** (MemoryBackend, optional): Memory backend for state persistence. Defaults to `SQLiteMemory()`.
- **config** (GraphConfig, optional): Configuration for the graph execution.

#### Example

```python
# With SQLite memory
memory = SQLiteMemory()
graph = AgentGraph(memory=memory)

# With Redis memory
memory = RedisMemory(host="localhost", port=6379)
graph = AgentGraph(memory=memory)

# With custom config
config = GraphConfig(max_concurrent_agents=5, timeout=300)
graph = AgentGraph(memory=memory, config=config)
```

### Methods

#### `add_agent(agent: Agent)`

Adds an agent to the graph.

```python
from agentgraph import Agent, AgentConfig

config = AgentConfig(
    name="researcher",
    role="Security Researcher",
    prompt="Find security vulnerabilities."
)
agent = Agent(config, "researcher")
graph.add_agent(agent)
```

**Parameters:**
- **agent** (Agent): The agent to add to the graph

#### `remove_agent(agent_id: str)`

Removes an agent from the graph.

```python
graph.remove_agent("researcher")
```

**Parameters:**
- **agent_id** (str): The ID of the agent to remove

#### `invoke(input: str, user_id: str, workflow_id: str = "default")`

Executes a workflow with the given input.

```python
result = await graph.invoke(
    input="Analyze the security of this code",
    user_id="user@example.com",
    workflow_id="security-audit"
)
```

**Parameters:**
- **input** (str): The input for the workflow
- **user_id** (str): Identifier for the user initiating the request
- **workflow_id** (str, optional): Identifier for the workflow. Defaults to "default"

**Returns:** `AsyncIterator[WorkflowResult]`

#### `get_workflow_state(workflow_id: str, user_id: str)`

Gets the current state of a workflow.

```python
state = graph.get_workflow_state("security-audit", "user@example.com")
```

**Parameters:**
- **workflow_id** (str): The workflow identifier
- **user_id** (str): The user identifier

**Returns:** `WorkflowState`

#### `cancel_workflow(workflow_id: str, user_id: str)`

Cancels a running workflow.

```python
await graph.cancel_workflow("security-audit", "user@example.com")
```

**Parameters:**
- **workflow_id** (str): The workflow identifier
- **user_id** (str): The user identifier

#### `get_agent_status(agent_id: str)`

Gets the status of an agent.

```python
status = graph.get_agent_status("researcher")
```

**Parameters:**
- **agent_id** (str): The agent identifier

**Returns:** `AgentStatus`

#### `register_tool(tool_name: str, tool_func: Callable)`

Registers a custom tool for use by agents.

```python
def search_web(query: str) -> str:
    # Implementation
    pass

graph.register_tool("web-search", search_web)
```

**Parameters:**
- **tool_name** (str): Name of the tool
- **tool_func** (Callable): Function implementing the tool

#### `get_metrics()`

Gets performance metrics for the graph.

```python
metrics = graph.get_metrics()
```

**Returns:** `GraphMetrics`

### Example Usage

```python
from agentgraph import AgentGraph, Agent, AgentConfig, SQLiteMemory

# Initialize
memory = SQLiteMemory()
graph = AgentGraph(memory=memory)

# Add agents
researcher = Agent(AgentConfig(
    name="researcher",
    role="Research Assistant",
    prompt="Research the given topic and provide insights"
), "researcher")

analyst = Agent(AgentConfig(
    name="analyst",
    role="Data Analyst",
    prompt="Analyze the research findings and create a report"
), "analyst")

graph.add_agent(researcher)
graph.add_agent(analyst)

# Execute workflow
async for result in graph.invoke(
    input="Research AI trends in 2024",
    user_id="user123"
):
    print(f"Progress: {result.progress}%")
    print(f"Current step: {result.current_agent}")
    if result.output:
        print(f"Output: {result.output}")

# Get workflow state
state = graph.get_workflow_state("default", "user123")
print(f"Workflow status: {state.status}")
print(f"Started at: {state.started_at}")
print(f"Completed at: {state.completed_at}")
```

### Error Handling

```python
try:
    async for result in graph.invoke(input, user_id):
        # Process results
        pass
except AgentGraphError as e:
    print(f"Graph error: {e.message}")
    print(f"Error code: {e.code}")
except MemoryError as e:
    print(f"Memory error: {e}")
except TimeoutError as e:
    print(f"Workflow timeout: {e}")
```