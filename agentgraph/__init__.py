"""
AgentGraph - A lightweight multi-agent orchestration framework with swarm intelligence.

This package provides:
- Agent definition and execution
- Graph-based workflow orchestration
- Shared memory system (SQLite/Redis)
- Swarm routing with bidding mechanism
- Claude-style reasoning protocol
"""

__version__ = "0.1.0"
__author__ = "AgentGraph Team"
__license__ = "MIT"

from agentgraph.core.agent import Agent, AgentConfig
from agentgraph.runtime import RuntimeRequest, RuntimeService, WorkflowDefinition

try:
    from agentgraph.core.graph import AgentGraph
except ModuleNotFoundError:  # pragma: no cover - optional dependency guard
    AgentGraph = None

try:
    from agentgraph.core.router import RuleRouter
except ModuleNotFoundError:  # pragma: no cover - optional dependency guard
    RuleRouter = None

try:
    from agentgraph.memory.base import Memory
except ModuleNotFoundError:  # pragma: no cover - optional dependency guard
    Memory = None

try:
    from agentgraph.memory.sqlite import SQLiteMemory
except ModuleNotFoundError:  # pragma: no cover - optional dependency guard
    SQLiteMemory = None

try:
    from agentgraph.memory.redis import RedisMemory
except ModuleNotFoundError:  # pragma: no cover - optional dependency guard
    RedisMemory = None

__all__ = [
    "Agent",
    "AgentConfig",
    "AgentGraph",
    "RuleRouter",
    "Memory",
    "WorkflowDefinition",
    "RuntimeRequest",
    "RuntimeService",
    "SQLiteMemory",
    "RedisMemory",
]
