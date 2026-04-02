"""
ShadowFlow top-level package.

Phase 1 canonical public surface is runtime-contract first:
- WorkflowDefinition
- RuntimeRequest
- ResumeRequest
- RuntimeService
- RunResult

High-level registry and template APIs remain available as companion entrypoints.
"""

__version__ = "0.3.0"
__author__ = "Ravenveil"
__license__ = "MIT"

from shadowflow.highlevel import (
    AssemblyCompiler,
    AssemblyConstraintSpec,
    AgentSpec,
    RoleSpec,
    SkillSpec,
    SpecRegistry,
    TemplateCompiler,
    ToolSpec,
    WorkflowAssemblySpec,
    WorkflowBlockSpec,
    WorkflowTemplateSpec,
)
from shadowflow.runtime import (
    InMemoryCheckpointStore,
    ZeroGCheckpointStore,
    ReferenceWritebackAdapter,
    ResumeRequest,
    RunResult,
    RuntimeRequest,
    RuntimeService,
    WorkflowDefinition,
)

__all__ = [
    "WorkflowDefinition",
    "RuntimeRequest",
    "ResumeRequest",
    "RuntimeService",
    "RunResult",
    "ReferenceWritebackAdapter",
    "InMemoryCheckpointStore",
    "ZeroGCheckpointStore",
    "ToolSpec",
    "SkillSpec",
    "RoleSpec",
    "AgentSpec",
    "WorkflowBlockSpec",
    "WorkflowAssemblySpec",
    "AssemblyConstraintSpec",
    "WorkflowTemplateSpec",
    "SpecRegistry",
    "TemplateCompiler",
    "AssemblyCompiler",
]
