"""订单编排层：把「一次付款」翻译成「一次真实交付」。

状态机（单向，除退款）：
    created -> pending_payment -> paid -> running -> delivered
                                      \\-> failed
    任意态 -> cancelled（未付款）/ refunded（已付款，需人工）

设计原则：订单不认识引擎内部，只认两件事 —— run_id 和最终交付物。
这样将来把 Python 引擎换成集群版，订单层不用动。
"""

import json
import threading

from . import company, db, orchestrator, pay, seed_data

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
    info = pay.info()
    if not info["configured"]:
        raise OrderError(info["note"], 503)

    product = db.get_product(product_id)
    if not product or not product.get("active"):
        raise OrderError(f"服务不存在或已下架：{product_id}", 404)

    requirement = _clean(requirement)
    if len(requirement) < 4:
        raise OrderError("请至少用一句话描述你要交付的内容", 422)

    order = db.create_order(
        {
            "id": db.new_id("ord"),
            "product_id": product["id"],
            "product_name": product["name"],
            "buyer_name": _clean(buyer_name, 60),
            "contact": _clean(contact, 120),
            "requirement": requirement,
            "amount_cents": product["price_cents"],
            "status": "created",
            "created_at": db.now(),
        }
    )
    db.emit_order(
        order["id"],
        "order.created",
        {
            "product": {"id": product["id"], "name": product["name"]},
            "amount_cents": product["price_cents"],
            "requirement": requirement,
        },
    )

    try:
        payment = pay.create_payment(order)
    except pay.PayNotConfigured as exc:
        db.update_order(order["id"], status="failed")
        db.emit_order(order["id"], "order.failed", {"reason": str(exc)})
        raise OrderError(str(exc), 503)

    order = db.update_order(
        order["id"],
        status="pending_payment",
        pay_provider=payment["provider"],
        pay_txn_id=payment["txn_id"],
    )
    db.emit_order(
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
    order = db.get_order(order_id)
    if not order:
        raise OrderError(f"订单不存在：{order_id}", 404)
    if order["status"] in SETTLED:
        return {"order": order, "idempotent": True}

    product = db.get_product(order["product_id"])
    if not product:
        raise OrderError("订单关联的服务已不存在", 409)

    order = db.update_order(
        order_id,
        status="paid",
        paid_at=db.now(),
        pay_txn_id=txn_id or order.get("pay_txn_id") or "",
    )
    db.emit_order(
        order_id,
        "order.paid",
        {"amount_cents": order["amount_cents"], "channel": channel, "txn_id": order["pay_txn_id"]},
    )

    companies = company.list_companies()
    if companies:
        project = company.create_project(
            companies[0]["id"],
            name=f"{product['name']}｜{order.get('buyer_name') or '客户'}",
            goal=order["requirement"],
            client_name=order.get("buyer_name") or "",
            budget_cents=order["amount_cents"],
            order_id=order_id,
        )
        tasks = company.plan_project(project["id"], seed_data.PLAYBOOK)
        order = db.update_order(order_id, project_id=project["id"], status="running")
        db.emit_order(
            order_id,
            "order.dispatched",
            {"project_id": project["id"], "tasks": len(tasks), "team": "增长工场"},
        )
        threading.Thread(target=_execute_project, args=(project["id"],), daemon=True).start()
        return {"order": order, "idempotent": False}

    # 没有公司时退回单人执行，保证旧环境仍可用
    task = f"{product['name']}｜{order['requirement']}"
    run_id = db.create_run(product["team_id"], task, {"reject_once": True, "order_id": order_id})
    order = db.update_order(order_id, run_id=run_id, status="running")
    db.emit_order(order_id, "order.dispatched", {"run_id": run_id, "team_id": product["team_id"], "task": task})
    orchestrator.submit(run_id)
    return {"order": order, "idempotent": False}


def _execute_project(project_id, auto_approve=True):
    """后台推进项目。

    客户已付款的订单走「自动验收」：审批节点照样生成、照样留痕，
    但由系统代老板放行，避免客户卡在内部流程上。
    内部项目（老板自己下的目标）则真的会停在审批等人。
    """
    for _ in range(12):
        try:
            res = company.run_project(project_id)
        except Exception:  # noqa: BLE001 - 后台失败不能影响订单接口
            return
        if res.get("stopped") != "approval" or not auto_approve:
            return
        pending = res.get("pending_approvals") or []
        if not pending:
            return
        for a in pending:
            try:
                company.decide_approval(a["id"], "approved", note="已付款订单，系统代为验收", decided_by="系统代批")
            except company.CompanyError:
                pass


def _project_deliverable(project_id):
    project = company.get_project(project_id)
    if not project:
        return None
    tasks = company.list_tasks(project_id=project_id)
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


def _node_text(node):
    raw = node.get("output")
    if not raw:
        return ""
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return raw
    if isinstance(parsed, dict):
        return parsed.get("text") or parsed.get("summary") or ""
    return str(parsed)


def _writer_text(run_id):
    """取「内容撰写」最后一次产出。

    loop 节点在 run_nodes 里只留审校结论，真正成稿在事件流的 agent.message 里，
    所以交付正文必须从事件流回溯，不能只看节点表。
    """
    last = ""
    for e in db.events_since(run_id, 0):
        if e["type"] != "agent.message":
            continue
        p = e["payload"]
        if isinstance(p, str):
            try:
                p = json.loads(p)
            except json.JSONDecodeError:
                continue
        if p.get("agent") == "writer" and p.get("text"):
            last = p["text"]
    return last


def _deliverable(run_id):
    run = db.get_run(run_id)
    if not run:
        return None

    # 回滚重做会给同一节点写多条记录；交付物只认每个环节的最终版本
    merged = {}
    for n in db.list_run_nodes(run_id):
        merged[n["node_id"]] = n
    nodes = list(merged.values())

    iters = db.list_iterations(run_id)
    cps = db.list_checkpoints(run_id)

    summary = _node_text(nodes[-1]) if nodes else ""
    body = _writer_text(run_id)
    if not body:
        for n in nodes[:-1]:
            text = _node_text(n)
            if len(text) > len(body):
                body = text

    final_text = summary
    if body and body not in summary:
        final_text = f"{summary}\n\n—— 正文 ——\n{body}"

    return {
        "run_id": run_id,
        "status": run["status"],
        "final_text": final_text.strip(),
        "nodes": [
            {"title": n["title"], "agent": n["agent"], "status": n["status"], "round": n.get("round")}
            for n in nodes
        ],
        "iterations": [
            {"round": i["round"], "score": i["score"], "decision": i["decision"]} for i in iters
        ],
        "evidence": {
            "events": len(db.events_since(run_id, 0)),
            "checkpoints": len(cps),
            "iterations": len(iters),
        },
    }


def sync_order(order_id):
    """惰性推进：读订单时顺手把项目（或旧版 run）的终态回填。"""
    order = db.get_order(order_id)
    if not order or order["status"] not in ("paid", "running"):
        return order

    project_id = order.get("project_id")
    if project_id:
        project = company.get_project(project_id)
        if not project:
            return order
        if project["status"] == "delivered":
            payload = _project_deliverable(project_id)
            order = db.update_order(
                order_id,
                status="delivered",
                delivered_at=db.now(),
                deliverable_json=json.dumps(payload, ensure_ascii=False),
            )
            db.emit_order(
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
                company.add_income(
                    project["company_id"],
                    project_id,
                    order["amount_cents"],
                    f"{order.get('buyer_name') or '客户'} · {order.get('product_name') or '服务'}",
                    category="订单收入",
                    ref_id=order_id,
                )
        elif project["status"] == "failed":
            order = db.update_order(order_id, status="failed")
            db.emit_order(order_id, "order.failed", {"project_id": project_id})
        return order

    run_id = order.get("run_id")
    if not run_id:
        return order
    run = db.get_run(run_id)
    if not run:
        return order

    if run["status"] == "completed":
        payload = _deliverable(run_id)
        order = db.update_order(
            order_id,
            status="delivered",
            delivered_at=db.now(),
            deliverable_json=json.dumps(payload, ensure_ascii=False),
        )
        db.emit_order(
            order_id,
            "order.delivered",
            {
                "run_id": run_id,
                "evidence": payload["evidence"] if payload else {},
                "preview": (payload or {}).get("final_text", "")[:120],
            },
        )
    elif run["status"] in ("failed", "stopped", "cancelled"):
        order = db.update_order(order_id, status="failed")
        db.emit_order(order_id, "order.failed", {"run_id": run_id, "run_status": run["status"]})
    return order


def cancel_order(order_id, reason="buyer_cancelled"):
    order = db.get_order(order_id)
    if not order:
        raise OrderError(f"订单不存在：{order_id}", 404)
    if order["status"] in ("delivered",):
        raise OrderError("已交付的订单不能取消", 409)
    if order["status"] in ("paid", "running"):
        order = db.update_order(order_id, status="refunded")
        db.emit_order(order_id, "order.refunded", {"reason": reason, "manual": True})
        return order
    order = db.update_order(order_id, status="cancelled")
    db.emit_order(order_id, "order.cancelled", {"reason": reason})
    return order
