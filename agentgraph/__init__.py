"""
AgentGraph top-level package.

Phase 1 canonical public surface is runtime-contract first:
- WorkflowDefinition
- RuntimeRequest
- ResumeRequest
- RuntimeService
- RunResult

Legacy graph / memory / router abstractions may still exist for compatibility,
but they are not the authoritative public entrypoint for the current runtime campaign.
"""

__version__ = "0.1.0"
__author__ = "Ravenveil"
__license__ = "MIT"

from agentgraph.core.agent import Agent, AgentConfig
from agentgraph.highlevel import (
    AgentSpec,
    RoleSpec,
    SkillSpec,
    SpecRegistry,
    TemplateCompiler,
    ToolSpec,
    WorkflowTemplateSpec,
)
from agentgraph.runtime import (
    InMemoryCheckpointStore,
    ZeroGCheckpointStore,
    ReferenceWritebackAdapter,
    ResumeRequest,
    RunResult,
    RuntimeRequest,
    RuntimeService,
    WorkflowDefinition,
)

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
    "WorkflowDefinition",
    "RuntimeRequest",
    "ResumeRequest",
    "RuntimeService",
    "RunResult",
    "ReferenceWritebackAdapter",
    "InMemoryCheckpointStore",
    "ZeroGCheckpointStore",
    "Agent",
    "AgentConfig",
    "AgentGraph",
    "RuleRouter",
    "Memory",
    "SQLiteMemory",
    "RedisMemory",
    "ToolSpec",
    "SkillSpec",
    "RoleSpec",
    "AgentSpec",
    "WorkflowTemplateSpec",
    "SpecRegistry",
    "TemplateCompiler",
]
