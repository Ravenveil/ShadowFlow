"""Policy Matrix 辅助函数 + 内置最佳实践规则库。"""

from __future__ import annotations

from typing import TYPE_CHECKING, List, Set

if TYPE_CHECKING:
    from shadowflow.runtime.contracts import PolicyWarning, WorkflowPolicyMatrixSpec

# 内置不推荐模式规则库
NOT_RECOMMENDED_PATTERNS: List[dict] = [
    {
        "code": "POLICY_NOT_RECOMMENDED",
        "pattern": "factchecker->legal",
        "reason": "事实核查员直接写入法务节点会绕过内容审核层，违反四眼原则",
        "reference_url": "https://shadowflow.dev/docs/policy-matrix#best-practices",
    },
    {
        "code": "POLICY_NOT_RECOMMENDED",
        "pattern": "content_officer->editor_direct_reject",
        "reason": "内容官直接驳回主编缺少中间协商环节，容易造成决策短路",
        "reference_url": "https://shadowflow.dev/docs/policy-matrix#best-practices",
    },
]

# 便于测试覆盖的规则 id → pattern 映射
_PATTERN_ALIASES: dict = {
    "factchecker->legal": ("factchecker", "legal"),
    "content_officer->editor_direct_reject": ("content_officer", "editor"),
}


def can_send(matrix: "WorkflowPolicyMatrixSpec", sender: str, receiver: str) -> bool:
    """检查 sender 是否被允许向 receiver 发送消息。"""
    allowed_receivers = matrix.allow_send.get(sender, [])
    return receiver in allowed_receivers


def can_reject(matrix: "WorkflowPolicyMatrixSpec", reviewer: str, target: str) -> bool:
    """检查 reviewer 是否被允许驳回 target。"""
    allowed_targets = matrix.allow_reject.get(reviewer, [])
    return target in allowed_targets


def validate_best_practices(
    matrix: "WorkflowPolicyMatrixSpec", roles: Set[str]
) -> List["PolicyWarning"]:
    """对矩阵执行最佳实践校验，返回 POLICY_NOT_RECOMMENDED 警告列表（非阻塞）。"""
    from shadowflow.runtime.contracts import PolicyWarning  # 避免循环导入

    warnings: List[PolicyWarning] = []

    # 检查 allow_send 中的不推荐模式
    for rule in NOT_RECOMMENDED_PATTERNS:
        alias_pair = _PATTERN_ALIASES.get(rule["pattern"])
        if alias_pair is None:
            continue
        sender_alias, receiver_alias = alias_pair

        for sender, receivers in matrix.allow_send.items():
            if sender_alias in sender.lower():
                for receiver in receivers:
                    if receiver_alias in receiver.lower():
                        warnings.append(
                            PolicyWarning(
                                code=rule["code"],
                                pattern=f"{sender}->{receiver}",
                                reason=rule["reason"],
                                reference_url=rule["reference_url"],
                            )
                        )

    # 检查 allow_reject 中的不推荐模式
    for rule in NOT_RECOMMENDED_PATTERNS:
        alias_pair = _PATTERN_ALIASES.get(rule["pattern"])
        if alias_pair is None:
            continue
        reviewer_alias, target_alias = alias_pair

        for reviewer, targets in matrix.allow_reject.items():
            if reviewer_alias in reviewer.lower():
                for target in targets:
                    if target_alias in target.lower():
                        warnings.append(
                            PolicyWarning(
                                code=rule["code"],
                                pattern=f"{reviewer}->{target}",
                                reason=rule["reason"],
                                reference_url=rule["reference_url"],
                            )
                        )

    return warnings
