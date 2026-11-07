"""OPC 订单编排层：把「一次付款」翻译成「一次真实交付」。

状态机（单向，除退款）：
    created -> pending_payment -> paid -> running -> delivered
                                      \\-> failed
    任意态 -> cancelled（未付款）/ refunded（已付款，需人工）

设计原则：订单不认识引擎内部，只认两件事 —— project_id 和最终交付物。
这样将来把本地公司引擎换成集群版，订单层不用动。

与 backend-poc 原版的差异：
- 原版有「无公司时退回单人 run」的兼容路径，ShadowFlow 没有旧版
  orchestrator，因此无公司时显式 503（种子默认自带公司，分支不可达）。
- 旧版 run 交付物聚合（_deliverable/_writer_text/_node_text）随之省略，
  sync_order 只走公司项目路径。
"""

import json
import threading

from .opc_company import (
    CompanyError,
    add_income,
    create_project,
    decide_approval,
    get_project,
    list_companies,
    list_tasks,
    plan_project,
    run_project,
)
from .opc_pay import PayNotConfigured, create_payment, info as pay_info
from .opc_seed import PLAYBOOK
from .opc_store import (
    create_order,
    emit_order,
    get_order,
    get_product,
    new_id,
    now,
    update_order,
)

# 订单进入这些状态后不再接受重复支付回调
SETTLED = {"paid", "running", "delivered", "failed", "refunded"}


class OrderError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _clean(text, limit=2000):
    return (text or "").strip()[:limit]


def place_order(product_id, buyer_name="", contact="", requirement=""):
    """建单 + 出支付凭据。未配置真实网关时直接拒绝，不产生脏单。"""
    info = pay_info()
    if not info["configured"]:
        raise OrderError(info["note"], 503)

    product = get_product(product_id)
    if not product or not product.get("active"):
        raise OrderError(f"服务不存在或已下架：{product_id}", 404)

    requirement = _clean(requirement)
    if len(requirement) < 4:
        raise OrderError("请至少用一句话描述你要交付的内容", 422)

    order = create_order(
        {
            "id": new_id("ord"),
            "product_id": product["id"],
            "product_name": product["name"],
            "buyer_name": _clean(buyer_name, 60),
            "contact": _clean(contact, 120),
            "requirement": requirement,
            "amount_cents": product["price_cents"],
            "status": "created",
            "created_at": now(),
        }
    )
    emit_order(
        order["id"],
        "order.created",
        {
            "product": {"id": product["id"], "name": product["name"]},
            "amount_cents": product["price_cents"],
            "requirement": requirement,
        },
    )

    try:
        payment = create_payment(order)
    except PayNotConfigured as exc:
        update_order(order["id"], status="failed")
        emit_order(order["id"], "order.failed", {"reason": str(exc)})
        raise OrderError(str(exc), 503) from exc

    order = update_order(
        order["id"],
        status="pending_payment",
        pay_provider=payment["provider"],
        pay_txn_id=payment["txn_id"],
    )
    emit_order(
        order["id"],
        "order.pending_payment",
        {"provider": payment["provider"], "mode": payment["mode"], "txn_id": payment["txn_id"]},
    )
    return {"order": order, "payment": payment}


def mark_paid(order_id, txn_id="", provider=None, channel="callback"):
    """支付成功 -> 立刻立项派工。

    客户那一单不再只是一个 run，而是一个真正的公司项目：走组织、走任务依赖、走人工审批。
    这样「平台在经营一家公司」和「客户在买一次服务」是同一条链，不是两套系统。
    """
    order = get_order(order_id)
    if not order:
        raise OrderError(f"订单不存在：{order_id}", 404)
    if order["status"] in SETTLED:
        return {"order": order, "idempotent": True}

    product = get_product(order["product_id"])
    if not product:
        raise OrderError("订单关联的服务已不存在", 409)

    order = update_order(
        order_id,
        status="paid",
        paid_at=now(),
        pay_txn_id=txn_id or order.get("pay_txn_id") or "",
    )
    emit_order(
        order_id,
        "order.paid",
        {"amount_cents": order["amount_cents"], "channel": channel, "txn_id": order["pay_txn_id"]},
    )

    companies = list_companies()
    if not companies:
        # ShadowFlow 无旧版单人 run 路径：没有公司就没法交付，宁可拒也不吞单
        order = update_order(order_id, status="failed")
        emit_order(order_id, "order.failed", {"reason": "no_company"})
        raise OrderError("平台尚未创建经营公司，无法派工交付", 503)

    project = create_project(
        companies[0]["id"],
        name=f"{product['name']}｜{order.get('buyer_name') or '客户'}",
        goal=order["requirement"],
        client_name=order.get("buyer_name") or "",
        budget_cents=order["amount_cents"],
        order_id=order_id,
    )
    tasks = plan_project(project["id"], PLAYBOOK)
    order = update_order(order_id, project_id=project["id"], status="running")
    emit_order(
        order_id,
        "order.dispatched",
        {"project_id": project["id"], "tasks": len(tasks), "team": "增长工场"},
    )
    threading.Thread(target=_execute_project, args=(project["id"],), daemon=True).start()
    return {"order": order, "idempotent": False}


def _execute_project(project_id, auto_approve=True):
    """后台推进项目。

    客户已付款的订单走「自动验收」：审批节点照样生成、照样留痕，
    但由系统代老板放行，避免客户卡在内部流程上。
    内部项目（老板自己下的目标）则真的会停在审批等人。
    """
    for _ in range(12):
        try:
            res = run_project(project_id)
        except Exception:  # noqa: BLE001 - 后台失败不能影响订单接口
            return
        if res.get("stopped") != "approval" or not auto_approve:
            return
        pending = res.get("pending_approvals") or []
        if not pending:
            return
        for a in pending:
            try:
                decide_approval(a["id"], "approved", note="已付款订单，系统代为验收", decided_by="系统代批")
            except CompanyError:
                pass


def _project_deliverable(project_id):
    project = get_project(project_id)
    if not project:
        return None
    tasks = list_tasks(project_id=project_id)
    done = [t for t in tasks if t["status"] == "done"]

    summary = ""
    body = ""
    tail = (done[-1].get("output") or {}).get("text") if done else ""
    for t in tasks:
        out = (t.get("output") or {}).get("text") or ""
        if not out:
            continue
        # 交付说明优先取「客户跟进与交付说明」这类收口任务，而不是合规结论
        if "交付" in t["title"]:
            summary = out
        if len(out) > len(body):
            body = out
    summary = summary or tail or body

    return {
        "project_id": project_id,
        "status": project["status"],
        "final_text": (summary + ("\n\n—— 正文 ——\n" + body if body and body not in summary else "")).strip(),
        "nodes": [
            {"title": t["title"], "agent": (t.get("assignee") or {}).get("title"),
             "status": t["status"], "round": None}
            for t in tasks
        ],
        "iterations": [],
        "evidence": {
            "events": len(tasks),
            "checkpoints": len([t for t in tasks if (t.get("review") or {}).get("required")]),
            "iterations": len(done),
        },
        "cost_cents": project["cost_cents"],
    }


def sync_order(order_id):
    """惰性推进：读订单时顺手把项目的终态回填。"""
    order = get_order(order_id)
    if not order or order["status"] not in ("paid", "running"):
        return order

    project_id = order.get("project_id")
    if not project_id:
        return order
    project = get_project(project_id)
    if not project:
        return order
    if project["status"] == "delivered":
        payload = _project_deliverable(project_id)
        order = update_order(
            order_id,
            status="delivered",
            delivered_at=now(),
            deliverable_json=json.dumps(payload, ensure_ascii=False),
        )
        emit_order(
            order_id,
            "order.delivered",
            {
                "project_id": project_id,
                "evidence": (payload or {}).get("evidence", {}),
                "preview": (payload or {}).get("final_text", "")[:120],
            },
        )
        # 交付即确认收入：钱进公司账本，毛利才算得出来
        if project.get("company_id"):
            add_income(
                project["company_id"],
                project_id,
                order["amount_cents"],
                f"{order.get('buyer_name') or '客户'} · {order.get('product_name') or '服务'}",
                category="订单收入",
                ref_id=order_id,
            )
    elif project["status"] == "failed":
        order = update_order(order_id, status="failed")
        emit_order(order_id, "order.failed", {"project_id": project_id})
    return order


def cancel_order(order_id, reason="buyer_cancelled"):
    order = get_order(order_id)
    if not order:
        raise OrderError(f"订单不存在：{order_id}", 404)
    if order["status"] in ("delivered",):
        raise OrderError("已交付的订单不能取消", 409)
    if order["status"] in ("paid", "running"):
        order = update_order(order_id, status="refunded")
        emit_order(order_id, "order.refunded", {"reason": reason, "manual": True})
        return order
    order = update_order(order_id, status="cancelled")
    emit_order(order_id, "order.cancelled", {"reason": reason})
    return order
