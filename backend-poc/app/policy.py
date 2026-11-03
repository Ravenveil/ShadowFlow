"""Policy matrix: compile-time best-practice validation + runtime edge gate.

Design notes (aligns with deck P7):
  * policy is an explicit N x N table stored in the team JSON, not model discretion
  * every DAG edge is checked cell-by-cell before dispatch
  * saving a team runs compile-time checks (four-eyes principle etc.) and blocks violations
  * a denial is not an error: it emits a system message, rolls back to checkpoint and re-dispatches
"""

from .config import LOOP_MAX_DEPTH

ALLOW = "allow"
DENY = "deny"
APPROVAL = "require_approval"

ROLES = {
    "researcher": "情报侦察",
    "strategist": "策略定盘",
    "writer": "内容撰写",
    "reviewer": "审校验证",
    "legal": "合规审核",
    "delivery": "交付汇总",
    "planner": "任务规划",
}

# four-eyes: producer must never hand its own output straight to the auditor
FOUR_EYES_PAIRS = {
    ("writer", "legal"): "写手直写法务节点，违反四眼原则（须经审校或独立审核）",
    ("writer", "reviewer"): "写手自审自校，验证器失去独立性",
    ("legal", "legal"): "同一角色自我复核，四眼原则失效",
}


def default_matrix():
    return {
        "strategy": "explicit",
        "default": DENY,
        "matrix": {
            "researcher": {"strategist": ALLOW, "writer": ALLOW},
            "strategist": {"writer": ALLOW, "researcher": ALLOW},
            "writer": {"reviewer": ALLOW, "legal": DENY, "delivery": DENY},
            "reviewer": {"writer": ALLOW, "legal": ALLOW, "delivery": DENY},
            "legal": {"writer": ALLOW, "delivery": ALLOW, "reviewer": ALLOW},
            "delivery": {},
            "planner": {"researcher": ALLOW, "strategist": ALLOW, "writer": ALLOW},
        },
        "approval_gates": ["legal->delivery"],
    }


def _iter_top_nodes(dag):
    return [n for n in dag.get("nodes", []) if not n.get("parent")]


def topo_order(dag):
    """Deterministic topological order of top-level nodes (stable, list order as tiebreak)."""
    nodes = _iter_top_nodes(dag)
    by_id = {n["id"]: n for n in nodes}
    indeg = {n["id"]: 0 for n in nodes}
    adj = {n["id"]: [] for n in nodes}
    for src, dst in dag.get("edges", []):
        if src in by_id and dst in by_id:
            adj[src].append(dst)
            indeg[dst] += 1
    order, ready = [], [n["id"] for n in nodes if indeg[n["id"]] == 0]
    while ready:
        cur = ready.pop(0)
        order.append(by_id[cur])
        for nxt in adj[cur]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                ready.append(nxt)
    if len(order) != len(nodes):
        # cycle -> fall back to declared order, compile check reports it separately
        return nodes
    return order


def compile_checks(dag, policy):
    """Return {"errors": [...], "warnings": [...]} — errors block saving the team."""
    errors, warnings = [], []
    nodes = dag.get("nodes", [])
    if not nodes:
        errors.append("团队为空：DAG 至少需要一个节点")
        return {"errors": errors, "warnings": warnings}

    by_id = {n["id"]: n for n in nodes}
    if len(by_id) != len(nodes):
        errors.append("节点 id 重复")

    matrix = (policy or {}).get("matrix", {})
    for n in nodes:
        agent = n.get("agent")
        if n.get("type", "agent") == "agent":
            if agent not in ROLES:
                errors.append(f"节点 {n.get('title', n['id'])} 使用了未知角色：{agent}")
            elif agent not in matrix and (policy or {}).get("default") != ALLOW:
                warnings.append(f"角色 {ROLES.get(agent, agent)} 在策略矩阵中无出边配置，将按默认拒绝处理")
        if n.get("type") == "loop":
            cfg = n.get("config") or {}
            if not cfg.get("body"):
                errors.append(f"循环节点 {n.get('title', n['id'])} 缺少循环体")
            if int(cfg.get("max_rounds", 0)) < 1:
                errors.append(f"循环节点 {n.get('title', n['id'])} 必须设置 max_rounds >= 1")
            if not (0 < float(cfg.get("target_score", 0)) <= 1):
                errors.append(f"循环节点 {n.get('title', n['id'])} 的 target_score 必须在 (0,1] 区间")
            if int(n.get("depth", 1)) > LOOP_MAX_DEPTH:
                errors.append(f"循环嵌套深度 {n.get('depth')} 超过上限 {LOOP_MAX_DEPTH}")

    for src, dst in dag.get("edges", []):
        if src not in by_id or dst not in by_id:
            errors.append(f"边 {src} -> {dst} 指向不存在的节点")
            continue
        if src == dst:
            errors.append(f"节点 {src} 存在自环")
            continue
        a, b = by_id[src].get("agent"), by_id[dst].get("agent")
        if a in ROLES and b in ROLES:
            if (a, b) in FOUR_EYES_PAIRS:
                errors.append(f"边 {ROLES[a]} -> {ROLES[b]}：{FOUR_EYES_PAIRS[(a, b)]}")
            cell = matrix.get(a, {}).get(b)
            if cell == DENY:
                warnings.append(f"边 {ROLES[a]} -> {ROLES[b]} 在策略矩阵中被声明为 deny，运行期会被拦截")

    # every terminal agent should route into a delivery/completion node
    has_sink = any(n.get("type") in ("deliver",) or n.get("agent") == "delivery" for n in nodes)
    if not has_sink:
        warnings.append("团队没有交付/收口节点，演示时无法给出交付卡")

    return {"errors": errors, "warnings": warnings}


def gate(policy, sender, receiver):
    """Runtime gate: decide whether `sender` may dispatch to `receiver`."""
    policy = policy or {}
    matrix = policy.get("matrix", {})
    cell = matrix.get(sender, {}).get(receiver)
    if cell is None:
        cell = policy.get("default", DENY)
    reason = {
        ALLOW: f"{ROLES.get(sender, sender)} → {ROLES.get(receiver, receiver)}：策略矩阵显式放行",
        DENY: f"{ROLES.get(sender, sender)} 无权向 {ROLES.get(receiver, receiver)} 派发（策略矩阵 deny）",
        APPROVAL: f"{ROLES.get(sender, sender)} → {ROLES.get(receiver, receiver)} 需人工审批门放行",
    }[cell]
    return {"mode": cell, "reason": reason, "sender": sender, "receiver": receiver}


def describe_matrix(policy):
    matrix = (policy or {}).get("matrix", {})
    roster = [a for a in ROLES if a in matrix]
    table = []
    for a in roster:
        row = {"agent": a, "name": ROLES[a], "cells": {}}
        for b in roster:
            row["cells"][b] = matrix.get(a, {}).get(b, (policy or {}).get("default", DENY))
        table.append(row)
    return {"roles": [{"id": a, "name": ROLES[a]} for a in roster], "rows": table}
