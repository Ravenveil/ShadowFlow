"""ACP (Agent Client Protocol) module for ShadowFlow.

Story 2.3: ACP Client — ShadowFlow connects outbound to external agents.
Story 2.10: ACP Capability Handshake — AgentCapabilityManifest + AgentRegistry.
Story 2.11: ACP Server — external agents connect inbound to ShadowFlow.
"""

from shadowflow.runtime.acp.client import AcpClient
from shadowflow.runtime.acp.messages import (
    AcpMessage,
    InitializeRequest,
    InitializeResponse,
    SessionNewRequest,
    SessionPromptRequest,
    SessionUpdateNotification,
    SessionRequestPermissionNotification,
    SessionPermissionResultRequest,
)
from shadowflow.runtime.acp.transport import AcpTransport, AcpSessionTerminated
from shadowflow.runtime.acp.registry import (
    AgentCapabilityManifest,
    AgentRegistryEntry,
    AgentRegistry,
    ToolCapability,
    MemoryCapability,
    TaskRoutingLog,
    get_registry,
)
from shadowflow.runtime.acp.server import (
    AgentSession,
    ACPConnectionManager,
    get_manager,
)

__all__ = [
    # Client (Story 2.3)
    "AcpClient",
    "AcpMessage",
    "AcpTransport",
    "AcpSessionTerminated",
    "InitializeRequest",
    "InitializeResponse",
    "SessionNewRequest",
    "SessionPromptRequest",
    "SessionUpdateNotification",
    "SessionRequestPermissionNotification",
    "SessionPermissionResultRequest",
    # Registry (Story 2.10)
    "AgentCapabilityManifest",
    "AgentRegistryEntry",
    "AgentRegistry",
    "ToolCapability",
    "MemoryCapability",
    "TaskRoutingLog",
    "get_registry",
    # Server (Story 2.11)
    "AgentSession",
    "ACPConnectionManager",
    "get_manager",
]
