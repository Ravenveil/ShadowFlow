# Agent API Reference

## Agent Class

The `Agent` class represents a single agent in the AgentGraph system. Each agent has a specific role, capabilities, and can execute tasks.

### Constructor

```python
from agentgraph import Agent, AgentConfig, ToolRegistry

class Agent:
    def __init__(self, config: AgentConfig, agent_id: str, tools: Optional[List[str]] = None)
```

#### Parameters

- **config** (AgentConfig): Configuration for the agent
- **agent_id** (str): Unique identifier for the agent
- **tools** (List[str], optional): List of tool names the agent can use

#### Example

```python
from agentgraph import Agent, AgentConfig

config = AgentConfig(
    name="researcher",
    role="Security Researcher",
    prompt="You are an expert security researcher. Analyze code for vulnerabilities.",
    tools=["file-reader", "web-search"]
)
agent = Agent(config, "researcher")
```

### AgentConfig

The `AgentConfig` class defines how an agent should behave.

#### Attributes

```python
class AgentConfig:
    name: str                    # Display name of the agent
    role: str                   # Role description
    prompt: str                 # System prompt/instructions
    tools: List[str] = []       # Available tools
    model: str = "claude-3"    # Default model
    temperature: float = 0.7   # Response randomness
    max_tokens: int = 4000     # Maximum response length
    timeout: int = 60          # Timeout in seconds
    retry_count: int = 3       # Number of retry attempts
```

#### Example

```python
config = AgentConfig(
    name="content-writer",
    role="Creative Content Writer",
    prompt="You create engaging and informative content based on research.",
    tools=["web-search", "document-analysis"],
    model="claude-3-haiku",
    temperature=0.8,
    max_tokens=2000,
    timeout=120
)
```

### Methods

#### `execute(task: str, context: Optional[Dict] = None)`

Executes a task with the given context.

```python
result = await agent.execute(
    task="Analyze this code for security vulnerabilities",
    context={
        "file_path": "app.py",
        "review_level": "basic"
    }
)
```

**Parameters:**
- **task** (str): The task to execute
- **context** (Dict, optional): Additional context for the task

**Returns:** `AgentResult`

#### `add_tool(tool_name: str)`

Adds a tool to the agent's available tools.

```python
agent.add_tool("code-analyzer")
```

**Parameters:**
- **tool_name** (str): Name of the tool to add

#### `remove_tool(tool_name: str)`

Removes a tool from the agent's available tools.

```python
agent.remove_tool("web-search")
```

**Parameters:**
- **tool_name** (str): Name of the tool to remove

#### `get_capabilities()`

Returns the agent's capabilities and configuration.

```python
capabilities = agent.get_capabilities()
```

**Returns:** `AgentCapabilities`

#### `get_execution_history(limit: int = 10)`

Returns the agent's execution history.

```python
history = agent.get_execution_history(limit=5)
```

**Parameters:**
- **limit** (int): Maximum number of history entries to return

**Returns:** `List[AgentExecution]`

### AgentResult

The result of an agent's execution.

```python
class AgentResult:
    output: str                # The generated output
    confidence: float          # Confidence score (0-1)
    tokens_used: int           # Number of tokens used
    execution_time: float      # Time taken in seconds
    error: Optional[str]       # Error message if failed
    tools_called: List[Dict]  # Tools that were called
    metadata: Dict             # Additional metadata
```

#### Example

```python
result = await agent.execute("Write a summary")

if result.error:
    print(f"Error: {result.error}")
else:
    print(f"Output: {result.output}")
    print(f"Confidence: {result.confidence:.2f}")
    print(f"Tokens used: {result.tokens_used}")
    print(f"Execution time: {result.execution_time:.2f}s")
    for tool_call in result.tools_called:
        print(f"Used tool: {tool_call['name']}")
```

### AgentCapabilities

Describes what the agent can do.

```python
class AgentCapabilities:
    name: str
    role: str
    available_tools: List[str]
    supported_tasks: List[str]
    specializations: List[str]
    performance_metrics: Dict[str, float]
```

### AgentExecution

Represents a single execution of an agent.

```python
class AgentExecution:
    agent_id: str
    task: str
    input: str
    output: str
    timestamp: datetime
    duration: float
    success: bool
    error: Optional[str]
    tools_used: List[str]
```

### Example Usage

```python
from agentgraph import Agent, AgentConfig, SQLiteMemory
import asyncio

# Create agent
config = AgentConfig(
    name="research-assistant",
    role="Research Assistant",
    prompt="You research topics and provide comprehensive information.",
    tools=["web-search", "document-reader"]
)
agent = Agent(config, "research-assistant")

# Execute task
async def research_task():
    result = await agent.execute(
        task="Research the latest developments in quantum computing",
        context={
            "timeframe": "2024",
            "focus": "commercial applications"
        }
    )

    if result.success:
        print("Research completed successfully!")
        print(f"Summary: {result.output[:200]}...")
        print(f"Confidence: {result.confidence:.1%}")
        return result.output
    else:
        print(f"Research failed: {result.error}")
        return None

# Run the task
output = await research_task()
```

### Error Handling

```python
try:
    result = await agent.execute("Perform analysis")
except AgentTimeoutError:
    print("Agent timed out")
except AgentError as e:
    print(f"Agent error: {e.message}")
except ToolError as e:
    print(f"Tool error: {e.tool_name}: {e.message}")
```

### Best Practices

1. **Tool Selection**: Only assign tools that are relevant to the agent's role
2. **Prompt Engineering**: Write clear and specific prompts
3. **Timeout Settings**: Set appropriate timeouts based on task complexity
4. **Error Handling**: Implement proper error handling in tool functions
5. **Monitoring**: Monitor agent performance and adjust as needed

```python
# Good example
config = AgentConfig(
    name="code-reviewer",
    role="Senior Code Reviewer",
    prompt="""
    Review code for:
    - Security vulnerabilities
    - Performance issues
    - Best practices
    - Readability

    Provide specific suggestions for improvements.
    """,
    tools=["code-analyzer", "security-scanner"],
    timeout=180  # Allow more time for complex reviews
)
```