"""
Memory 模块 - 三层记忆架构

提供会话级、用户级、全局级记忆管理。
"""

# 原有接口（向后兼容）
from shadowflow.memory.base import Memory, BaseMemory

# 数据类和枚举
from shadowflow.memory.base import (
    MemoryScope,
    Interaction,
    Pattern
)

# 原有的实现
try:
    from shadowflow.memory.sqlite import SQLiteMemory
except ModuleNotFoundError:  # pragma: no cover - optional dependency guard
    SQLiteMemory = None

try:
    from shadowflow.memory.redis import RedisMemory
except ModuleNotFoundError:  # pragma: no cover - optional dependency guard
    RedisMemory = None

# 三层架构
from shadowflow.memory.layers import (
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
from shadowflow.memory.session import SessionMemory
try:
    from shadowflow.memory.user import UserMemory, ContextResult, UserMemoryFactory
except ModuleNotFoundError:  # pragma: no cover - optional dependency guard
    UserMemory = None
    ContextResult = None
    UserMemoryFactory = None

try:
    from shadowflow.memory.global_memory import GlobalMemory, PatternType
except ModuleNotFoundError:  # pragma: no cover - optional dependency guard
    GlobalMemory = None
    PatternType = None

try:
    from shadowflow.memory.patterns import PatternManager
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
