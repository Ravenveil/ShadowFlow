"""OPC OS company layer — ported from backend-poc/app/company.py (2026-11-04).

与 backend-poc 版的差异：
  1. db → opc_store（本包 sqlite 存储层，独立 opc.sqlite）；
  2. kb / llm 依赖改为延迟导入 + 缺失时降级（backend-poc 的 kb/llm 不随移植，
     ShadowFlow 有自己的 LLM 通路；run_task 在无 llm 适配时返回 simulated 提示）；
  3. Playbook / 员工种子数据不在这里 —— 挂载层（api/opc.py）按需 seed。

三条硬规则（原样保留）：
  1. 员工是可配置、可调用、可追踪的 agent 实例（ID/岗位/权限/模型/成本/绩效）。
  2. 每项任务可追到责任人、执行过程、交接记录、成本和交付结果。
  3. 风险分级决定谁来批：low 自动放行，medium 部门负责人，high 老板本人。
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from shadowflow.services import opc_store as db

# 模型目录：不同岗位用不同模型，成本与能力都不同。
MODEL_CATALOG = {
    "claude-sonnet": {"label": "Claude Sonnet", "vendor": "Anthropic", "in_cents": 3.0, "out_cents": 15.0, "tier": "旗舰"},
    "gpt-4o": {"label": "GPT-4o", "vendor": "OpenAI", "in_cents": 2.5, "out_cents": 10.0, "tier": "旗舰"},
    "gemini-flash": {"label": "Gemini Flash", "vendor": "Google", "in_cents": 0.08, "out_cents": 0.3, "tier": "轻量"},
    "deepseek-chat": {"label": "DeepSeek V3", "vendor": "DeepSeek", "in_cents": 0.27, "out_cents": 1.1, "tier": "性价比"},
    "qwen-max": {"label": "Qwen Max", "vendor": "Alibaba", "in_cents": 0.6, "out_cents": 1.8, "tier": "性价比"},
}

RISK_LEVELS = ["low", "medium", "high"]
TASK_STATUS = ["todo", "blocked", "running", "review", "done", "failed", "cancelled"]
EMP_STATUS = ["idle", "working", "awaiting_approval", "blocked", "offline"]


class CompanyError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def _j(value: Any, default: Any = None) -> Any:
    if not value:
        return default if default is not None else []
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return default if default is not None else []


def _money(cents: Any) -> float:
    return round(int(cents) / 100, 2)


# ------------------------------------------------------------------ 公司

def create_company(name: str, industry: str, mission: str, owner_name: str = "老板",
                   team_id: Optional[str] = None, cash_cents: int = 0) -> Dict[str, Any]:
    cid = db.new_id("co")
    db.x(
        """INSERT INTO companies (id, name, logo, industry, mission, team_id, cash_cents, owner_name, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (cid, name, name[:1], industry, mission, team_id, int(cash_cents), owner_name, db.now()),
    )
    return get_company(cid)


def get_company(company_id: str) -> Optional[Dict[str, Any]]:
    return db.q1("SELECT * FROM companies WHERE id = ?", (company_id,))


def list_companies() -> List[Dict[str, Any]]:
    return db.q("SELECT * FROM companies ORDER BY created_at")


def company_or_404(company_id: str) -> Dict[str, Any]:
    c = get_company(company_id)
    if not c:
        raise CompanyError(f"公司不存在：{company_id}", 404)
    return c


# ------------------------------------------------------------------ 组织与员工

def create_department(company_id: str, name: str, charter: str = "", parent_id: Optional[str] = None,
                      budget_cents: int = 0, team_id: Optional[str] = None, sort: int = 0) -> Dict[str, Any]:
    did = db.new_id("dept")
    db.x(
        """INSERT INTO departments (id, company_id, name, parent_id, charter, budget_cents, team_id, sort, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (did, company_id, name, parent_id, charter, int(budget_cents), team_id, int(sort), db.now()),
    )
    return db.q1("SELECT * FROM departments WHERE id = ?", (did,))


def list_departments(company_id: str) -> List[Dict[str, Any]]:
    return db.q("SELECT * FROM departments WHERE company_id = ? ORDER BY sort, created_at", (company_id,))


def set_department_head(department_id: str, employee_id: str) -> None:
    db.x(
        "UPDATE departments SET head_employee_id = ? WHERE id = ? AND head_employee_id IS NULL",
        (employee_id, department_id),
    )


def hire(company_id: str, name: str, role: str, department_id: Optional[str] = None, title: str = "",
         seniority: str = "mid", system_prompt: str = "", skills: Optional[List[str]] = None,
         tools: Optional[List[str]] = None, permissions: Optional[List[str]] = None,
         model_name: str = "gpt-4o", day_rate_cents: int = 1000, employment: str = "ai") -> Dict[str, Any]:
    if model_name not in MODEL_CATALOG:
        raise CompanyError(f"未知模型：{model_name}", 422)
    eid = db.new_id("emp")
    db.x(
        """INSERT INTO employees (id, company_id, department_id, name, role, title, avatar, seniority,
                                  system_prompt, skills_json, tools_json, permissions_json,
                                  model_provider, model_name, status, employment,
                                  success_rate, tasks_done, token_cost_cents, day_rate_cents, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            eid, company_id, department_id, name, role, title or role, name[:1], seniority,
            system_prompt, json.dumps(skills or [], ensure_ascii=False),
            json.dumps(tools or [], ensure_ascii=False),
            json.dumps(permissions or [], ensure_ascii=False),
            MODEL_CATALOG[model_name]["vendor"], model_name, "idle", employment,
            0.0, 0, 0, int(day_rate_cents), db.now(),
        ),
    )
    return get_employee(eid)


def get_employee(employee_id: str) -> Optional[Dict[str, Any]]:
    e = db.q1("SELECT * FROM employees WHERE id = ?", (employee_id,))
    if not e:
        return None
    for k in ("skills_json", "tools_json", "permissions_json"):
        e[k.replace("_json", "")] = _j(e.get(k), [])
    e["model"] = MODEL_CATALOG.get(e.get("model_name") or "", {"label": e.get("model_name") or "-"})
    return e


def roster(company_id: str) -> List[Dict[str, Any]]:
    rows = db.q(
        """SELECT e.*, d.name AS department_name FROM employees e
           LEFT JOIN departments d ON d.id = e.department_id
           WHERE e.company_id = ? ORDER BY d.sort, e.created_at""",
        (company_id,),
    )
    out = []
    for e in rows:
        e["skills"] = _j(e.get("skills_json"))
        e["tools"] = _j(e.get("tools_json"))
        e["permissions"] = _j(e.get("permissions_json"))
        e["model"] = MODEL_CATALOG.get(e.get("model_name") or "", {"label": e.get("model_name") or "-"})
        out.append(e)
    return out


def fire(employee_id: str, reassign_to: Optional[str] = None) -> Dict[str, Any]:
    e = get_employee(employee_id)
    if not e:
        raise CompanyError(f"员工不存在：{employee_id}", 404)
    open_tasks = db.q(
        "SELECT id FROM tasks WHERE assignee_employee_id = ? AND status IN ('todo','running','review')",
        (employee_id,),
    )
    if open_tasks and not reassign_to:
        raise CompanyError(f"该员工还有 {len(open_tasks)} 项未完成任务，需先指定接手人", 409)
    if reassign_to:
        db.x(
            "UPDATE tasks SET assignee_employee_id = ? WHERE assignee_employee_id = ? AND status IN ('todo','running','review')",
            (reassign_to, employee_id),
        )
    db.x("UPDATE employees SET status = 'offline', employment = 'retired' WHERE id = ?", (employee_id,))
    return {"ok": True, "reassigned": len(open_tasks)}


def org_chart(company_id: str) -> Dict[str, Any]:
    depts = list_departments(company_id)
    emps = roster(company_id)
    by_dept: Dict[str, List[Dict]] = {}
    for e in emps:
        by_dept.setdefault(e.get("department_id"), []).append(e)
    tree = []
    for d in depts:
        members = by_dept.get(d["id"], [])
        head = next((m for m in members if m["id"] == d.get("head_employee_id")), None)
        tree.append(
            {
                "id": d["id"],
                "name": d["name"],
                "charter": d.get("charter"),
                "budget": _money(d.get("budget_cents") or 0),
                "head": {"id": head["id"], "name": head["name"], "title": head["title"]} if head else None,
                "members": [
                    {
                        "id": m["id"], "name": m["name"], "title": m["title"], "avatar": m["avatar"],
                        "status": m["status"], "model": m["model"].get("label"), "skills": m["skills"][:3],
                    }
                    for m in members
                ],
            }
        )
    return {"company_id": company_id, "departments": tree, "headcount": len(emps)}


# ------------------------------------------------------------------ 项目

def create_project(company_id: str, name: str, goal: str, client_name: str = "",
                   budget_cents: int = 0, due_at: Optional[str] = None,
                   order_id: Optional[str] = None,
                   owner_employee_id: Optional[str] = None) -> Dict[str, Any]:
    pid = db.new_id("prj")
    ts = db.now()
    db.x(
        """INSERT INTO opc_projects (id, company_id, name, goal, client_name, owner_employee_id, status,
                                     budget_cents, revenue_cents, cost_cents, due_at, order_id, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (pid, company_id, name, goal, client_name, owner_employee_id, "planning",
         int(budget_cents), 0, 0, due_at, order_id, ts, ts),
    )
    return get_project(pid)


def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    return db.q1("SELECT * FROM opc_projects WHERE id = ?", (project_id,))


def list_projects(company_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    return db.q(
        "SELECT * FROM opc_projects WHERE company_id = ? ORDER BY created_at DESC LIMIT ?",
        (company_id, int(limit)),
    )


def _recost_project(project_id: str) -> None:
    row = db.q1("SELECT COALESCE(SUM(cost_cents), 0) AS c FROM tasks WHERE project_id = ?", (project_id,))
    db.x("UPDATE opc_projects SET cost_cents = ?, updated_at = ? WHERE id = ?",
         (row["c"], db.now(), project_id))


# ------------------------------------------------------------------ 任务协议

def create_task(project_id: str, title: str, brief: str = "", assignee: Optional[str] = None,
                assigner: Optional[str] = None, depends_on: Optional[List[str]] = None,
                mode: str = "pipeline", priority: str = "normal", risk: str = "medium",
                parent_id: Optional[str] = None, due_at: Optional[str] = None) -> Dict[str, Any]:
    project = get_project(project_id)
    if not project:
        raise CompanyError(f"项目不存在：{project_id}", 404)
    tid = db.new_id("tsk")
    db.x(
        """INSERT INTO tasks (id, project_id, company_id, parent_id, title, brief, assignee_employee_id,
                              assigner_employee_id, status, priority, mode, depends_on_json,
                              cost_cents, due_at, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            tid, project_id, project["company_id"], parent_id, title, brief, assignee, assigner,
            "todo", priority, mode, json.dumps(depends_on or []), 0, due_at, db.now(),
        ),
    )
    if risk in ("medium", "high"):
        db.x(
            "UPDATE tasks SET review_json = ? WHERE id = ?",
            (json.dumps({"risk": risk, "required": True}, ensure_ascii=False), tid),
        )
    return get_task(tid)


def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    t = db.q1("SELECT * FROM tasks WHERE id = ?", (task_id,))
    if not t:
        return None
    t["depends_on"] = _j(t.get("depends_on_json"), [])
    t["output"] = _j(t.get("output_json"), None)
    t["handoff"] = _j(t.get("handoff_json"), None)
    t["review"] = _j(t.get("review_json"), None)
    t["input"] = _j(t.get("input_json"), {})
    emp = get_employee(t["assignee_employee_id"]) if t.get("assignee_employee_id") else None
    t["assignee"] = ({"id": emp["id"], "name": emp["name"], "title": emp["title"], "avatar": emp["avatar"]}
                     if emp else None)
    return t


def list_tasks(project_id: Optional[str] = None, company_id: Optional[str] = None,
               assignee: Optional[str] = None, status: Optional[str] = None,
               limit: int = 200) -> List[Dict[str, Any]]:
    sql = "SELECT * FROM tasks WHERE 1=1"
    args: List[Any] = []
    if project_id:
        sql += " AND project_id = ?"
        args.append(project_id)
    if company_id:
        sql += " AND company_id = ?"
        args.append(company_id)
    if assignee:
        sql += " AND assignee_employee_id = ?"
        args.append(assignee)
    if status:
        sql += " AND status = ?"
        args.append(status)
    sql += " ORDER BY created_at LIMIT ?"
    args.append(int(limit))
    rows = db.q(sql, tuple(args))
    return [get_task(r["id"]) for r in rows]


def _deps_done(task: Dict[str, Any]) -> bool:
    for dep in task.get("depends_on") or []:
        d = db.q1("SELECT status FROM tasks WHERE id = ?", (dep,))
        if not d or d["status"] != "done":
            return False
    return True


def next_runnable(project_id: str) -> List[Dict[str, Any]]:
    """可执行 = 依赖已全部完成 + 状态 todo（依赖图表达并行度）。"""
    rows = db.q(
        "SELECT id FROM tasks WHERE project_id = ? AND status = 'todo' ORDER BY created_at",
        (project_id,),
    )
    ready = []
    for r in rows:
        t = get_task(r["id"])
        if t and _deps_done(t):
            ready.append(t)
    return ready


def plan_project(project_id: str, playbook: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """按剧本把项目拆成任务。after 字段形成依赖（同层任务天然可并行）。"""
    project = get_project(project_id)
    if not project:
        raise CompanyError(f"项目不存在：{project_id}", 404)
    by_role = {e["role"]: e for e in roster(project["company_id"])}
    created: Dict[str, Dict[str, Any]] = {}
    for item in playbook:
        emp = by_role.get(item["role"])
        if not emp:
            continue
        deps = [created[k]["id"] for k in item.get("after", []) if k in created]
        t = create_task(
            project_id,
            item["title"],
            brief=item.get("brief", ""),
            assignee=emp["id"],
            assigner=None,
            depends_on=deps,
            mode=item.get("mode", "pipeline"),
            risk=item.get("risk", "low"),
        )
        created[item["key"]] = t
    _advance_project(project_id)
    return [get_task(t["id"]) for t in created.values()]


def handoff_context(task: Dict[str, Any]) -> List[Dict[str, Any]]:
    """交接记录：把上游交付物收成结构化上下文，下游不重读全库。"""
    blocks = []
    for dep_id in task.get("depends_on") or []:
        dep = get_task(dep_id)
        if not dep:
            continue
        out = dep.get("output") or {}
        blocks.append(
            {
                "from_task": dep["id"],
                "from_title": dep["title"],
                "from_employee": (dep.get("assignee") or {}).get("name"),
                "summary": out.get("summary") or out.get("text") or "",
                "artifact": out.get("artifact"),
            }
        )
    return blocks


def _estimate_tokens(prompt: str, output: str) -> tuple:
    # 中文约 1.5 字/token，保守估计
    return int(len(prompt) / 1.5), int(len(output) / 1.5)


def _summarize(text: str, limit: int = 160) -> str:
    line = " ".join((text or "").split())
    return line[:limit] + ("…" if len(line) > limit else "")


def force_auto_approve(company: Optional[Dict[str, Any]]) -> bool:
    return bool((company or {}).get("status") == "demo_auto")


def _llm_complete(system: str, user: str, meta: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """LLM 通路：延迟导入 ShadowFlow 自己的 LLM 模块；不可用时降级 simulated。

    backend-poc 版直接 import llm；ShadowFlow 的 llm 子包接口不同（面向
    workflow runtime），这里保持契约（返回 {"text": str, "mode": str}）即可。
    """
    try:
        from shadowflow.llm import completion  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001 — llm 子包不存在或接口不符
        completion = None
    if completion is None:
        # 无真实通路：返回结构一致的 stub（决策可测，不假装有真内容）
        return {
            "text": f"[simulated] 已按岗位要求处理任务：{meta.get('task') or ''}",
            "mode": "simulated",
        }
    try:
        result = completion(system=system, user=user, meta=meta)
        if isinstance(result, str):
            return {"text": result, "mode": "live"}
        if isinstance(result, dict):
            result.setdefault("mode", "live")
            return result
    except Exception as exc:  # noqa: BLE001
        return {"text": f"[error] LLM 调用失败：{exc}", "mode": "error"}
    return None


def run_task(task_id: str, force: bool = False) -> Dict[str, Any]:
    """执行一个任务：任务协议真正落地的地方。"""
    task = get_task(task_id)
    if not task:
        raise CompanyError(f"任务不存在：{task_id}", 404)
    if task["status"] in ("done", "cancelled"):
        raise CompanyError(f"任务已{task['status']}，不能重复执行", 409)
    if not force and not _deps_done(task):
        raise CompanyError("上游任务尚未完成，任务被阻塞", 409)

    emp = get_employee(task["assignee_employee_id"]) if task.get("assignee_employee_id") else None
    if not emp:
        raise CompanyError("任务没有负责人，先指派员工", 422)
    if emp.get("status") == "offline":
        raise CompanyError(f"{emp['name']} 已离职", 409)

    project = get_project(task["project_id"])
    company = get_company(task["company_id"])

    db.x("UPDATE tasks SET status = 'running', started_at = ? WHERE id = ?", (db.now(), task_id))
    db.x("UPDATE employees SET status = 'working' WHERE id = ?", (emp["id"],))

    upstream = handoff_context(task)
    prompt = _build_prompt(company, project, emp, task, upstream, "")

    result = _llm_complete(
        system=emp.get("system_prompt") or f"你是{company['name']}的{emp['title']}。",
        user=prompt,
        meta={
            "role": emp.get("role"),
            "task": task["title"],
            "feedback": (task.get("review") or {}).get("rejected_reason") or "",
        },
    )
    text = (result or {}).get("text") or ""
    mode = (result or {}).get("mode", "simulated")

    in_tok, out_tok = _estimate_tokens(prompt, text)
    catalog = MODEL_CATALOG.get(emp.get("model_name") or "", {"in_cents": 0, "out_cents": 0})
    model_cost = int(round(in_tok / 1000 * catalog["in_cents"] + out_tok / 1000 * catalog["out_cents"]))
    # 工时分摊：一个任务按 1/8 个工作日计
    labor_cost = int(round((emp.get("day_rate_cents") or 0) / 8))
    cost = model_cost + labor_cost

    output = {
        "text": text,
        "summary": _summarize(text),
        "mode": mode,
        "model": emp.get("model_name"),
        "tokens": {"in": in_tok, "out": out_tok},
        "cost_cents": cost,
        "cost_breakdown": {"model": model_cost, "labor": labor_cost},
    }

    # 风险闸门：中高风险任务做完不直接算完，先挂审批
    risk = (task.get("review") or {}).get("risk", "low")
    needs_approval = risk in ("medium", "high") and not force_auto_approve(company)

    db.x(
        """UPDATE tasks SET status = ?, output_json = ?, handoff_json = ?, cost_cents = ?,
                           finished_at = ? WHERE id = ?""",
        (
            "review" if needs_approval else "done",
            json.dumps(output, ensure_ascii=False),
            json.dumps(upstream, ensure_ascii=False),
            cost, db.now(), task_id,
        ),
    )
    db.x(
        """UPDATE employees SET tasks_done = tasks_done + 1, token_cost_cents = token_cost_cents + ?,
                               status = ? WHERE id = ?""",
        (cost, "awaiting_approval" if needs_approval else "idle", emp["id"]),
    )
    db.x(
        "INSERT INTO ledger (id, company_id, project_id, kind, category, amount_cents, description, ref_id, occurred_at)"
        " VALUES (?,?,?,?,?,?,?,?,?)",
        (db.new_id("led"), task["company_id"], project["id"], "expense", "执行成本", cost,
         f"{emp['name']} · {task['title']}", task_id, db.now()),
    )
    _recost_project(project["id"])

    approval = None
    if needs_approval:
        approval = request_approval(
            company_id=task["company_id"],
            project_id=project["id"],
            task_id=task_id,
            kind="task_delivery",
            title=f"{task['title']} · 待验收",
            risk=risk,
            payload={"summary": output["summary"], "by": emp["name"], "cost_cents": cost},
            requested_by=emp["id"],
        )

    return {"task": get_task(task_id), "approval": approval, "output": output}


def _build_prompt(company: Dict[str, Any], project: Dict[str, Any], emp: Dict[str, Any],
                  task: Dict[str, Any], upstream: List[Dict[str, Any]], ctx_block: str) -> str:
    parts = [
        f"公司：{company['name']}（{company.get('industry') or ''}）",
        f"项目：{project['name']}｜目标：{project.get('goal') or ''}",
        f"你的岗位：{emp['title']}（{emp.get('seniority') or 'mid'}）",
        f"技能：{'、'.join(emp.get('skills') or []) or '按岗位常规执行'}",
        f"本次任务：{task['title']}",
    ]
    if task.get("brief"):
        parts.append(f"要求：{task['brief']}")
    if upstream:
        lines = [
            f"- {u['from_employee'] or '上游'} 交付《{u['from_title']}》：{(u['summary'] or '')[:120]}"
            for u in upstream
        ]
        parts.append("上游交接：\n" + "\n".join(lines))
    if ctx_block:
        parts.append("公司知识库：\n" + ctx_block)
    parts.append("请直接交付可用的工作成果，不要解释过程。")
    return "\n\n".join(parts)


def run_ready(project_id: str, workers: int = 3) -> List[Dict[str, Any]]:
    """并行跑当前所有可执行任务（依赖图的同一层）。"""
    from concurrent.futures import ThreadPoolExecutor

    ready = next_runnable(project_id)
    if not ready:
        return []
    batch = ready[:workers]
    with ThreadPoolExecutor(max_workers=len(batch), thread_name_prefix="sf-opc") as ex:
        futures = [ex.submit(run_task, t["id"]) for t in batch]
        out = []
        for f in futures:
            try:
                out.append(f.result())
            except CompanyError as exc:
                out.append({"error": exc.message})
            except Exception as exc:  # noqa: BLE001 — 单个任务失败不拖垮整个项目
                out.append({"error": f"{type(exc).__name__}: {exc}"})
        return out


def run_project(project_id: str, max_rounds: int = 12, workers: int = 3) -> Dict[str, Any]:
    """把项目推到「没有可执行任务」或「卡在人工审批」为止。"""
    project = get_project(project_id)
    if not project:
        raise CompanyError(f"项目不存在：{project_id}", 404)
    db.x("UPDATE opc_projects SET status = 'executing', updated_at = ? WHERE id = ?", (db.now(), project_id))

    rounds: List[List[Dict[str, Any]]] = []
    stopped = "completed"
    for _ in range(max_rounds):
        batch = run_ready(project_id, workers=workers)
        if not batch:
            break
        rows = []
        for r in batch:
            task = r.get("task") or {}
            rows.append(
                {
                    "task_id": task.get("id"),
                    "title": task.get("title"),
                    "by": (task.get("assignee") or {}).get("name"),
                    "status": task.get("status"),
                    "cost": _money(task.get("cost_cents") or 0),
                    "needs_approval": bool(r.get("approval")),
                    "error": r.get("error"),
                }
            )
        rounds.append(rows)
        if any(r.get("approval") for r in batch):
            stopped = "approval"
            break
    else:
        stopped = "max_rounds"

    _advance_project(project_id)
    pending = [
        a for a in list_approvals(project["company_id"], status="pending")
        if a.get("project_id") == project_id
    ]
    return {
        "project": get_project(project_id),
        "rounds": rounds,
        "stopped": stopped,
        "pending_approvals": pending,
        "tasks": list_tasks(project_id=project_id),
    }


# ------------------------------------------------------------------ 审批

def request_approval(company_id: str, project_id: Optional[str], task_id: Optional[str],
                     kind: str, title: str, risk: str = "medium",
                     payload: Optional[Dict] = None,
                     requested_by: Optional[str] = None) -> Dict[str, Any]:
    aid = db.new_id("apr")
    db.x(
        """INSERT INTO approvals (id, company_id, project_id, task_id, kind, title, risk, payload_json,
                                  requested_by, status, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (aid, company_id, project_id, task_id, kind, title, risk,
         json.dumps(payload or {}, ensure_ascii=False), requested_by, "pending", db.now()),
    )
    return get_approval(aid)


def get_approval(approval_id: str) -> Optional[Dict[str, Any]]:
    a = db.q1("SELECT * FROM approvals WHERE id = ?", (approval_id,))
    if a:
        a["payload"] = _j(a.get("payload_json"), {})
    return a


def list_approvals(company_id: str, status: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    sql = "SELECT * FROM approvals WHERE company_id = ?"
    args: List[Any] = [company_id]
    if status:
        sql += " AND status = ?"
        args.append(status)
    sql += " ORDER BY created_at DESC LIMIT ?"
    args.append(int(limit))
    return [dict(a, payload=_j(a.get("payload_json"), {})) for a in db.q(sql, tuple(args))]


def decide_approval(approval_id: str, decision: str, note: str = "",
                    decided_by: str = "老板") -> Dict[str, Any]:
    if decision not in ("approved", "rejected"):
        raise CompanyError("决定只能是 approved 或 rejected", 422)
    a = get_approval(approval_id)
    if not a:
        raise CompanyError(f"审批不存在：{approval_id}", 404)
    if a["status"] != "pending":
        raise CompanyError("该审批已处理", 409)

    db.x(
        "UPDATE approvals SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ?",
        (decision, decided_by, db.now(), note, approval_id),
    )

    if a.get("task_id"):
        task = get_task(a["task_id"])
        if task:
            if decision == "approved":
                db.x("UPDATE tasks SET status = 'done' WHERE id = ?", (a["task_id"],))
                if task.get("assignee_employee_id"):
                    db.x("UPDATE employees SET status = 'idle' WHERE id = ?", (task["assignee_employee_id"],))
            else:
                # 驳回即返工：任务回 todo，保留上一版产出作为证据
                review = task.get("review") or {}
                review["rejected_reason"] = note or "验收未通过"
                review["rejected_at"] = db.now()
                db.x(
                    "UPDATE tasks SET status = 'todo', review_json = ? WHERE id = ?",
                    (json.dumps(review, ensure_ascii=False), a["task_id"]),
                )
                if task.get("assignee_employee_id"):
                    db.x("UPDATE employees SET status = 'idle' WHERE id = ?", (task["assignee_employee_id"],))

    if a.get("project_id"):
        _advance_project(a["project_id"])
    return get_approval(approval_id)


def _advance_project(project_id: str) -> None:
    project = get_project(project_id)
    if not project:
        return
    rows = db.q("SELECT status, COUNT(*) AS n FROM tasks WHERE project_id = ? GROUP BY status", (project_id,))
    counts = {r["status"]: r["n"] for r in rows}
    total = sum(counts.values())
    if total and counts.get("done", 0) == total:
        db.x("UPDATE opc_projects SET status = 'delivered', updated_at = ? WHERE id = ?", (db.now(), project_id))
    elif counts.get("running") or counts.get("review"):
        db.x("UPDATE opc_projects SET status = 'executing', updated_at = ? WHERE id = ?", (db.now(), project_id))
    elif project["status"] == "planning" and total:
        db.x("UPDATE opc_projects SET status = 'ready', updated_at = ? WHERE id = ?", (db.now(), project_id))


# ------------------------------------------------------------------ 经营数据

def pnl(company_id: str) -> Dict[str, Any]:
    income = db.q1(
        "SELECT COALESCE(SUM(amount_cents),0) AS s FROM ledger WHERE company_id = ? AND kind = 'income'",
        (company_id,),
    )["s"]
    expense = db.q1(
        "SELECT COALESCE(SUM(amount_cents),0) AS s FROM ledger WHERE company_id = ? AND kind = 'expense'",
        (company_id,),
    )["s"]
    projects = list_projects(company_id, limit=200)
    delivered = [p for p in projects if p["status"] == "delivered"]
    return {
        "revenue": _money(income),
        "cost": _money(expense),
        "profit": _money(income - expense),
        "margin": round((income - expense) / income * 100, 1) if income else 0.0,
        "projects_total": len(projects),
        "projects_delivered": len(delivered),
        "avg_project_cost": _money(expense / len(projects)) if projects else 0,
    }


def dashboard(company_id: str) -> Dict[str, Any]:
    company = company_or_404(company_id)
    emps = roster(company_id)
    projects = list_projects(company_id, limit=200)
    tasks = list_tasks(company_id=company_id, limit=500)
    pending = list_approvals(company_id, status="pending")

    by_status: Dict[str, int] = {}
    for t in tasks:
        by_status[t["status"]] = by_status.get(t["status"], 0) + 1

    return {
        "company": company,
        "pnl": pnl(company_id),
        "headcount": {
            "total": len(emps),
            "working": sum(1 for e in emps if e["status"] == "working"),
            "idle": sum(1 for e in emps if e["status"] == "idle"),
            "awaiting": sum(1 for e in emps if e["status"] == "awaiting_approval"),
        },
        "tasks": {"total": len(tasks), "by_status": by_status},
        "approvals_pending": len(pending),
        "projects": [
            {
                "id": p["id"], "name": p["name"], "status": p["status"], "client": p.get("client_name"),
                "budget": _money(p["budget_cents"]), "cost": _money(p["cost_cents"]),
                "revenue": _money(p["revenue_cents"]),
            }
            for p in projects[:6]
        ],
    }


def add_income(company_id: str, project_id: Optional[str], amount_cents: int,
               description: str, category: str = "项目收入",
               ref_id: Optional[str] = None) -> Dict[str, Any]:
    db.x(
        "INSERT INTO ledger (id, company_id, project_id, kind, category, amount_cents, description, ref_id, occurred_at)"
        " VALUES (?,?,?,?,?,?,?,?,?)",
        (db.new_id("led"), company_id, project_id, "income", category, int(amount_cents),
         description, ref_id, db.now()),
    )
    if project_id:
        db.x(
            "UPDATE opc_projects SET revenue_cents = revenue_cents + ?, updated_at = ? WHERE id = ?",
            (int(amount_cents), db.now(), project_id),
        )
    return pnl(company_id)


def ledger_entries(company_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    rows = db.q(
        "SELECT * FROM ledger WHERE company_id = ? ORDER BY occurred_at DESC LIMIT ?",
        (company_id, int(limit)),
    )
    for r in rows:
        r["amount"] = _money(r["amount_cents"])
    return rows
