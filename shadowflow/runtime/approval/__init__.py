"""Approval module — aggregated approval logic for ShadowFlow.

This subpackage consolidates the previously-scattered approval logic from:
  - shadowflow/api/approvals.py        (REST registry + approve/reject + SSE)
  - shadowflow/runtime/acp/approval_bridge.py  (ACP permission bridge)
  - shadowflow/runtime/policy_matrix.py        (policy validation)

The three original modules remain as thin re-export shims so that all existing
imports continue to work unchanged.

Public API:
  service  — REST approval business (registry, approve, reject, SSE generator)
  bridge   — AcpApprovalBridge for ACP session.requestPermission
  policy   — Policy matrix validators (can_send, can_reject, validate_best_practices)
"""

from __future__ import annotations

from shadowflow.runtime.approval import bridge, policy, service
from shadowflow.runtime.approval.bridge import AcpApprovalBridge
from shadowflow.runtime.approval.policy import (
    NOT_RECOMMENDED_PATTERNS,
    can_reject,
    can_send,
    validate_best_practices,
)

__all__ = [
    "AcpApprovalBridge",
    "NOT_RECOMMENDED_PATTERNS",
    "bridge",
    "can_reject",
    "can_send",
    "policy",
    "service",
    "validate_best_practices",
]
