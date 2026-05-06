"""
Memory 模块 - 三层记忆架构

提供会话级、用户级、全局级记忆管理。
"""

# 原有接口（向后兼容）
from agentgraph.memory.base import Memory, BaseMemory

# 数据类和枚举
from agentgraph.memory.base import (
    MemoryScope,
    Interaction,
    Pattern
)

# 原有的实现
try:
    from agentgraph.memory.sqlite import SQLiteMemory
except ModuleNotFoundError:  # pragma: no cover - optional dependency guard
    SQLiteMemory = None

try:
    from agentgraph.memory.redis import RedisMemory
except ModuleNotFoundError:  # pragma: no cover - optional dependency guard
    RedisMemory = None

# 三层架构
from agentgraph.memory.layers import (
    LayerType,
    MemoryLayer,
    KnowledgeLayer,
    ContextLayer,
    SemanticLayer,
    LayeredMemory,
    WikiLink,
    Tag,
    NoteMetadata,
    SessionContext,
    AgentPattern,
    UserProfile
)

# 新的三层记忆实现
from agentgraph.memory.session import SessionMemory
try:
    from agentgraph.memory.user import UserMemory, ContextResult, UserMemoryFactory
except ModuleNotFoundError:  # pragma: no cover - optional dependency guard
    UserMemory = None
    ContextResult = None
    UserMemoryFactory = None

try:
    from agentgraph.memory.global_memory import GlobalMemory, PatternType
except ModuleNotFoundError:  # pragma: no cover - optional dependency guard
    GlobalMemory = None
    PatternType = None

try:
    from agentgraph.memory.patterns import PatternManager
except ModuleNotFoundError:  # pragma: no cover - optional dependency guard
    PatternManager = None

__all__ = [
    # 基础接口
    "Memory",
    "BaseMemory",

    # 数据类和枚举
    "MemoryScope",
    "Interaction",
    "Pattern",

    # 原有实现
    "SQLiteMemory",
    "RedisMemory",

    # 三层架构
    "LayerType",
    "MemoryLayer",
    "KnowledgeLayer",
    "ContextLayer",
    "SemanticLayer",
    "LayeredMemory",
    "WikiLink",
    "Tag",
    "NoteMetadata",
    "SessionContext",
    "AgentPattern",
    "UserProfile",

    # 新的三层记忆实现
    "SessionMemory",
    "UserMemory",
    "GlobalMemory",
    "PatternType",
    "PatternManager",

    # 兼容旧的导出
    "ContextResult",
    "UserMemoryFactory"
]
