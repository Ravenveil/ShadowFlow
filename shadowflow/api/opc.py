"""OPC OS HTTP API — 移植自 backend-poc/app/main.py 的 company/commerce 端点。

所有路由挂在 /api/opc 前缀下，与 ShadowFlow 既有 /api/* 隔离：
  company / departments / roster / hire / fire / org      — 组织
  projects / tasks / approvals / pnl / ledger / income    — 经营
  products / orders / pay / notify                        — 商务闭环
  models / seed                                           — 元数据 / 初始化

与 backend-poc 的差异：
- 无旧版单人 run 概念，订单详情只回 project + steps（不回 run）。
- 端点统一加 opc 前缀，避免与前端既有 /api/* 路由撞名。
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, HTTPException, Query

from ..services import opc_company as company
from ..services import opc_orders as orders
from ..services import opc_pay as pay
from ..services import opc_seed
from ..services.opc_company import create_department
from ..services.opc_store import (
    emit_order,
    get_order,
    get_product,
    list_orders,
    list_products,
    order_events_since,
)

router = APIRouter(prefix="/api/opc", tags=["opc"])


def _company_or_404(company_id: Optional[str] = None) -> Dict[str, Any]:
    if company_id:
        return company.company_or_404(company_id)
    cs = company.list_companies()
    if not cs:
        raise HTTPException(404, "尚未创建公司")
    return cs[0]


def _company_err(exc: company.CompanyError) -> HTTPException:
    return HTTPException(exc.status, exc.message)


def _order_err(exc: orders.OrderError) -> HTTPException:
    return HTTPException(exc.status, exc.message)


# ------------------------------------------------------------------ meta

@router.get("/models")
def models():
    return {"items": [dict(v, id=k) for k, v in company.MODEL_CATALOG.items()]}


@router.post("/seed")
def seed():
    """幂等初始化：默认公司 + 商品目录。启动/首次访问时调用。"""
    c = opc_seed.ensure_seed()
    return {"company": c, "products": list_products()}


# ------------------------------------------------------------------ company: 组织

@router.get("/company")
def company_default():
    c = _company_or_404()
    return {"company": c, "dashboard": company.dashboard(c["id"])}


@router.get("/companies")
def companies():
    return {"items": company.list_companies()}


@router.get("/company/{company_id}")
def company_detail(company_id: str):
    _company_or_404(company_id)
    return {"dashboard": company.dashboard(company_id)}


@router.get("/company/{company_id}/org")
def company_org(company_id: str):
    try:
        return company.org_chart(company_id)
    except company.CompanyError as exc:
        raise _company_err(exc) from exc


@router.get("/company/{company_id}/roster")
def company_roster(company_id: str):
    _company_or_404(company_id)
    return {"items": company.roster(company_id)}


@router.get("/company/{company_id}/departments")
def company_departments(company_id: str):
    _company_or_404(company_id)
    return {"items": company.list_departments(company_id)}


@router.post("/company/{company_id}/departments")
def company_new_department(company_id: str, payload: dict = Body(...)):
    co = _company_or_404(company_id)
    dept = create_department(
        co["id"],
        payload.get("name") or "新部门",
        charter=payload.get("charter") or "",
        budget_cents=int(payload.get("budget_cents") or 0),
    )
    return {"department": dept}


@router.get("/company/{company_id}/employees/{employee_id}")
def employee_detail(company_id: str, employee_id: str):
    emp = company.get_employee(employee_id)
    if not emp or emp["company_id"] != company_id:
        raise HTTPException(404, f"员工不存在：{employee_id}")
    return {"employee": emp}


@router.post("/company/{company_id}/employees")
def company_hire(company_id: str, payload: dict = Body(...)):
    try:
        emp = company.hire(
            company_id,
            payload.get("name") or "新员工",
            payload.get("role") or "writer",
            department_id=payload.get("department_id"),
            title=payload.get("title") or "",
            seniority=payload.get("seniority") or "mid",
            system_prompt=payload.get("system_prompt") or "",
            skills=payload.get("skills") or [],
            tools=payload.get("tools") or [],
            permissions=payload.get("permissions") or [],
            model_name=payload.get("model_name") or "gpt-4o",
            day_rate_cents=int(payload.get("day_rate_cents") or 1000),
        )
    except company.CompanyError as exc:
        raise _company_err(exc) from exc
    return {"employee": emp}


@router.post("/company/{company_id}/employees/{employee_id}/fire")
def company_fire(company_id: str, employee_id: str, payload: dict = Body(default={})):
    try:
        return company.fire(employee_id, reassign_to=payload.get("reassign_to"))
    except company.CompanyError as exc:
        raise _company_err(exc) from exc


# ------------------------------------------------------------------ company: 项目 / 任务

@router.get("/company/{company_id}/projects")
def company_projects(company_id: str, limit: int = Query(50, ge=1, le=200)):
    _company_or_404(company_id)
    return {"items": company.list_projects(company_id, limit=limit)}


@router.post("/company/{company_id}/projects")
def company_new_project(company_id: str, payload: dict = Body(...)):
    """老板下一个目标，平台自动拆成任务并分派。"""
    goal = (payload.get("goal") or "").strip()
    if len(goal) < 4:
        raise HTTPException(422, "请把业务目标说清楚，至少要一句话")
    co = _company_or_404(company_id)
    name = payload.get("name") or goal[:24]
    project = company.create_project(
        co["id"], name, goal,
        client_name=payload.get("client_name") or "",
        budget_cents=int(payload.get("budget_cents") or 0),
        order_id=payload.get("order_id"),
    )
    tasks = []
    if payload.get("auto_plan", True):
        tasks = company.plan_project(project["id"], opc_seed.PLAYBOOK)
    return {"project": company.get_project(project["id"]), "tasks": tasks}


@router.get("/projects/{project_id}")
def project_detail(project_id: str):
    p = company.get_project(project_id)
    if not p:
        raise HTTPException(404, f"项目不存在：{project_id}")
    tasks = company.list_tasks(project_id=project_id)
    approvals = [a for a in company.list_approvals(p["company_id"], limit=100) if a.get("project_id") == project_id]
    return {"project": p, "tasks": tasks, "approvals": approvals}


@router.post("/projects/{project_id}/run")
def project_run(project_id: str, payload: dict = Body(default={})):
    try:
        return company.run_project(
            project_id,
            max_rounds=int(payload.get("max_rounds") or 12),
            workers=int(payload.get("workers") or 3),
        )
    except company.CompanyError as exc:
        raise _company_err(exc) from exc


@router.get("/tasks/{task_id}")
def task_detail(task_id: str):
    t = company.get_task(task_id)
    if not t:
        raise HTTPException(404, f"任务不存在：{task_id}")
    return {"task": t}


@router.post("/tasks/{task_id}/run")
def task_run(task_id: str, payload: dict = Body(default={})):
    try:
        return company.run_task(task_id, force=bool(payload.get("force")))
    except company.CompanyError as exc:
        raise _company_err(exc) from exc


# ------------------------------------------------------------------ approvals

@router.get("/company/{company_id}/approvals")
def company_approvals(company_id: str, status: str = Query("", description="pending / approved / rejected")):
    _company_or_404(company_id)
    return {"items": company.list_approvals(company_id, status=status or None)}


@router.post("/approvals/{approval_id}/decide")
def approval_decide(approval_id: str, payload: dict = Body(...)):
    try:
        a = company.decide_approval(
            approval_id,
            payload.get("decision") or "",
            note=payload.get("note") or "",
            decided_by=payload.get("decided_by") or "老板",
        )
    except company.CompanyError as exc:
        raise _company_err(exc) from exc
    return {"approval": a}


# ------------------------------------------------------------------ pnl / ledger

@router.get("/company/{company_id}/pnl")
def company_pnl(company_id: str):
    _company_or_404(company_id)
    return {"pnl": company.pnl(company_id), "ledger": company.ledger_entries(company_id, limit=50)}


@router.post("/company/{company_id}/income")
def company_income(company_id: str, payload: dict = Body(...)):
    try:
        amount = int(payload.get("amount_cents") or 0)
    except (TypeError, ValueError):
        raise HTTPException(422, "金额需为整数分") from None
    if amount <= 0:
        raise HTTPException(422, "金额必须大于 0")
    try:
        return company.add_income(
            company_id,
            payload.get("project_id"),
            amount,
            payload.get("description") or "项目收款",
            category=payload.get("category") or "项目收入",
            ref_id=payload.get("ref_id"),
        )
    except company.CompanyError as exc:
        raise _company_err(exc) from exc


# ------------------------------------------------------------------ commerce: products / orders / pay

@router.get("/products")
def products():
    base = pay.public_base()
    items = [dict(p, landing_url=f"{base}/q/{p['id']}") for p in list_products()]
    return {"items": items, "pay": pay.info(), "base_url": base}


@router.get("/products/{product_id}")
def product_detail(product_id: str):
    p = get_product(product_id)
    if not p:
        raise HTTPException(404, f"服务不存在：{product_id}")
    base = pay.public_base()
    return {
        "product": dict(p, landing_url=f"{base}/q/{p['id']}"),
        "pay": pay.info(),
    }


@router.post("/orders")
def order_create(payload: dict = Body(...)):
    try:
        return orders.place_order(
            payload.get("product_id", ""),
            payload.get("buyer_name", ""),
            payload.get("contact", ""),
            payload.get("requirement", ""),
        )
    except orders.OrderError as exc:
        raise _order_err(exc) from exc


@router.get("/orders")
def order_list(limit: int = Query(50, ge=1, le=200)):
    items = [orders.sync_order(o["id"]) or o for o in list_orders(limit)]
    return {"items": items, "pay": pay.info()}


@router.get("/orders/{order_id}")
def order_detail(order_id: str):
    o = orders.sync_order(order_id)
    if not o:
        raise HTTPException(404, f"订单不存在：{order_id}")
    steps, project = [], None
    if o.get("project_id"):
        project = company.get_project(o["project_id"])
        steps = [
            {"title": t["title"], "agent": (t.get("assignee") or {}).get("title"), "status": t["status"], "round": None}
            for t in company.list_tasks(project_id=o["project_id"])
        ]
    return {
        "order": o,
        "project": {"id": project["id"], "status": project["status"]} if project else None,
        "steps": steps,
        "events": order_events_since(order_id, 0),
    }


@router.get("/orders/{order_id}/events")
def order_events(order_id: str, since: int = Query(0, ge=0)):
    o = get_order(order_id)
    if not o:
        raise HTTPException(404, f"订单不存在：{order_id}")
    return {"order_id": order_id, "status": o["status"], "items": order_events_since(order_id, since)}


@router.post("/orders/{order_id}/cancel")
def order_cancel(order_id: str, payload: dict = Body(default={})):
    try:
        return {"order": orders.cancel_order(order_id, payload.get("reason", "buyer_cancelled"))}
    except orders.OrderError as exc:
        raise _order_err(exc) from exc


@router.post("/pay/notify")
def pay_notify(payload: dict = Body(...)):
    """统一支付回调：沙箱与真实网关共用这一条路由、同一套校验。

    真实网关接入时，这里再加验签、证书与幂等表；订单状态机不动。
    """
    provider = payload.get("provider") or pay.mode()
    ok, txn_id, order_id, reason = pay.verify_callback(provider, payload)
    if not ok:
        if order_id:
            emit_order(order_id, "pay.rejected", {"provider": provider, "reason": reason})
        raise HTTPException(400, f"回调校验失败：{reason}")
    if not get_order(order_id):
        raise HTTPException(404, f"回调订单不存在：{order_id}")
    try:
        result = orders.mark_paid(order_id, txn_id=txn_id, provider=provider)
    except orders.OrderError as exc:
        raise _order_err(exc) from exc
    return {"ok": True, "idempotent": result["idempotent"], "order": result["order"]}


@router.get("/pay/info")
def pay_info_endpoint():
    return pay.info()
