"""OPC OS 公司层：组织、员工、项目、任务协议、审批、账本。

与执行层的分工：
  公司层只决定「谁、在什么授权下、做什么事、花多少钱」，不碰模型调用细节；
  执行层（orchestrator / loop_engine / kb / llm）负责把一件事真正做出来。
两层之间只有任务协议这一个契约：assignee / brief / depends_on / output / handoff / cost / review。

三条硬规则：
  1. 员工是可配置、可调用、可追踪的 agent 实例，不是一段 prompt —— 所以有 ID、岗位、权限、
     模型、成本、绩效、工作记录。
  2. 每一项任务都必须能追到责任人、执行过程、交接记录、成本和交付结果，缺一项就不算完成。
  3. 风险分级决定谁来批：low 自动放行，medium 要部门负责人，high 必须老板本人。
"""

import json
from datetime import datetime, timedelta

from . import db, kb, llm, memory, quality

# 模型目录：不同岗位用不同模型，成本与能力都不同 —— 这就是「一个框架内的分工协作」。
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
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _j(value, default=None):
    if not value:
        return default if default is not None else []
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return default if default is not None else []


def _money(cents):
    return round(int(cents) / 100, 2)


# ------------------------------------------------------------------ 公司

def create_company(name, industry, mission, owner_name="老板", team_id=None, cash_cents=0):
    cid = db.new_id("co")
    db.x(
        """INSERT INTO companies (id, name, logo, industry, mission, team_id, cash_cents, owner_name, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (cid, name, name[:1], industry, mission, team_id, int(cash_cents), owner_name, db.now()),
    )
    return get_company(cid)


def get_company(company_id):
    return db.q1("SELECT * FROM companies WHERE id = ?", (company_id,))


def list_companies():
    return db.q("SELECT * FROM companies ORDER BY created_at")


def company_or_404(company_id):
    c = get_company(company_id)
    if not c:
        raise CompanyError(f"公司不存在：{company_id}", 404)
    return c


# ------------------------------------------------------------------ 组织与员工

def create_department(company_id, name, charter="", parent_id=None, budget_cents=0, team_id=None, sort=0):
    did = db.new_id("dept")
    db.x(
        """INSERT INTO departments (id, company_id, name, parent_id, charter, budget_cents, team_id, sort, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (did, company_id, name, parent_id, charter, int(budget_cents), team_id, int(sort), db.now()),
    )
    return db.q1("SELECT * FROM departments WHERE id = ?", (did,))


def list_departments(company_id):
    return db.q("SELECT * FROM departments WHERE company_id = ? ORDER BY sort, created_at", (company_id,))


def hire(company_id, name, role, department_id=None, title="", seniority="mid",
         system_prompt="", skills=None, tools=None, permissions=None,
         model_name="gpt-4o", day_rate_cents=1000, employment="ai"):
    if model_name not in MODEL_CATALOG:
        raise CompanyError(f"未知模型：{model_name}", 422)
    try:
        day_rate_cents = int(day_rate_cents)
    except (TypeError, ValueError):
        raise CompanyError("日成本需为整数分", 422)
    if day_rate_cents < 0:
        raise CompanyError("日成本不能为负", 422)
    if day_rate_cents > 10_000_00:
        raise CompanyError("日成本超出合理范围（上限 10000 元/天）", 422)
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


def get_employee(employee_id):
    e = db.q1("SELECT * FROM employees WHERE id = ?", (employee_id,))
    if not e:
        return None
    for k in ("skills_json", "tools_json", "permissions_json"):
        e[k.replace("_json", "")] = _j(e.get(k), [])
    e["model"] = MODEL_CATALOG.get(e.get("model_name") or "", {"label": e.get("model_name") or "-"})
    return e


def roster(company_id):
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


def fire(employee_id, reassign_to=None):
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


def org_chart(company_id):
    depts = list_departments(company_id)
    emps = roster(company_id)
    by_dept = {}
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

def create_project(company_id, name, goal, client_name="", budget_cents=0, due_at=None, order_id=None, owner_employee_id=None):
    pid = db.new_id("prj")
    now = db.now()
    db.x(
        """INSERT INTO projects (id, company_id, name, goal, client_name, owner_employee_id, status,
                                 budget_cents, revenue_cents, cost_cents, due_at, order_id, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (pid, company_id, name, goal, client_name, owner_employee_id, "planning",
         int(budget_cents), 0, 0, due_at, order_id, now, now),
    )
    return get_project(pid)


def get_project(project_id):
    return db.q1("SELECT * FROM projects WHERE id = ?", (project_id,))


def list_projects(company_id, limit=50):
    rows = db.q(
        "SELECT * FROM projects WHERE company_id = ? ORDER BY created_at DESC LIMIT ?",
        (company_id, int(limit)),
    )
    if not rows:
        return rows
    # 一条聚合查完所有项目的环节数，避免每个项目再来一次（列表页最怕 N+1）
    ids = [r["id"] for r in rows]
    marks = ",".join("?" * len(ids))
    counts = {
        r["project_id"]: r
        for r in db.q(
            "SELECT project_id, COUNT(*) AS total,"
            " SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done"
            f" FROM tasks WHERE project_id IN ({marks}) GROUP BY project_id",
            tuple(ids),
        )
    }
    for r in rows:
        c = counts.get(r["id"]) or {}
        total, done = int(c.get("total") or 0), int(c.get("done") or 0)
        r["progress"] = {"done": done, "total": total, "pct": round(done * 100 / total) if total else 0}
        r["budget"] = _money(r.get("budget_cents") or 0)
        r["cost"] = _money(r.get("cost_cents") or 0)
        r["margin_cents"] = int(r.get("revenue_cents") or 0) - int(r.get("cost_cents") or 0)
    return rows


def _recost_project(project_id):
    row = db.q1("SELECT COALESCE(SUM(cost_cents), 0) AS c FROM tasks WHERE project_id = ?", (project_id,))
    db.x("UPDATE projects SET cost_cents = ?, updated_at = ? WHERE id = ?", (row["c"], db.now(), project_id))


# ------------------------------------------------------------------ 任务协议

def create_task(project_id, title, brief="", assignee=None, assigner=None, depends_on=None,
                mode="pipeline", priority="normal", risk="medium", parent_id=None, due_at=None):
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


# 任务与负责人一次 JOIN 取回：旧实现对每条任务再查一次员工，500 个任务就是 1000 次查询。
_TASK_SQL = (
    "SELECT t.*, e.name AS e_name, e.title AS e_title, e.avatar AS e_avatar"
    " FROM tasks t LEFT JOIN employees e ON e.id = t.assignee_employee_id"
)


def _task_from_row(row):
    t = dict(row)
    t["depends_on"] = _j(t.get("depends_on_json"), [])
    t["output"] = _j(t.get("output_json"), None)
    t["handoff"] = _j(t.get("handoff_json"), None)
    t["review"] = _j(t.get("review_json"), None)
    t["input"] = _j(t.get("input_json"), {})
    if t.get("assignee_employee_id"):
        t["assignee"] = {
            "id": t.get("assignee_employee_id"),
            "name": t.get("e_name"),
            "title": t.get("e_title"),
            "avatar": t.get("e_avatar"),
        }
    else:
        t["assignee"] = None
    for k in ("e_name", "e_title", "e_avatar"):
        t.pop(k, None)
    return t


def get_task(task_id):
    row = db.q1(_TASK_SQL + " WHERE t.id = ?", (task_id,))
    return _task_from_row(row) if row else None


def list_tasks(project_id=None, company_id=None, assignee=None, status=None, limit=200):
    sql = _TASK_SQL + " WHERE 1=1"
    args = []
    if project_id:
        sql += " AND t.project_id = ?"
        args.append(project_id)
    if company_id:
        sql += " AND t.company_id = ?"
        args.append(company_id)
    if assignee:
        sql += " AND t.assignee_employee_id = ?"
        args.append(assignee)
    if status:
        sql += " AND t.status = ?"
        args.append(status)
    sql += " ORDER BY t.created_at LIMIT ?"
    args.append(int(limit))
    return [_task_from_row(r) for r in db.q(sql, tuple(args))]


def _deps_done(task):
    for dep in task.get("depends_on") or []:
        d = db.q1("SELECT status FROM tasks WHERE id = ?", (dep,))
        if not d or d["status"] != "done":
            return False
    return True


def next_runnable(project_id):
    """可执行 = 依赖已全部完成 + 状态 todo。这样才能支持并行分支。

    一次取回本项目所有 todo 及其依赖状态，避免逐任务查库（旧实现每轮 O(N²)）。
    """
    rows = db.q(
        "SELECT id, depends_on_json FROM tasks WHERE project_id = ? AND status = 'todo' ORDER BY created_at",
        (project_id,),
    )
    if not rows:
        return []

    dep_ids = set()
    for r in rows:
        for dep in _j(r.get("depends_on_json"), []):
            dep_ids.add(dep)
    status_map = {}
    if dep_ids:
        marks = ",".join("?" * len(dep_ids))
        for d in db.q(f"SELECT id, status FROM tasks WHERE id IN ({marks})", tuple(dep_ids)):
            status_map[d["id"]] = d["status"]

    ready_ids = [
        r["id"]
        for r in rows
        if all(status_map.get(dep) == "done" for dep in _j(r.get("depends_on_json"), []))
    ]
    if not ready_ids:
        return []
    marks = ",".join("?" * len(ready_ids))
    by_id = {
        r["id"]: _task_from_row(r)
        for r in db.q(_TASK_SQL + f" WHERE t.id IN ({marks})", tuple(ready_ids))
    }
    return [by_id[i] for i in ready_ids if i in by_id]


def plan_project(project_id, playbook):
    """按剧本把项目拆成任务。

    after 字段形成依赖：同一层（after 指向同一批上游）的任务天然可并行，
    这正是「并行协作」不用另写调度器的原因 —— 依赖图本身就表达了并行度。
    """
    project = get_project(project_id)
    if not project:
        raise CompanyError(f"项目不存在：{project_id}", 404)
    by_role = {e["role"]: e for e in roster(project["company_id"])}
    created = {}
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


def handoff_context(task):
    """交接记录：把上游的交付物收成一段结构化上下文，而不是让下游重读全库。"""
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


def _estimate_tokens(prompt, output):
    # 中文约 1.5 字/token，取保守估计
    return int(len(prompt) / 1.5), int(len(output) / 1.5)


def run_task(task_id, force=False):
    """执行一个任务：这是任务协议真正落地的地方。"""
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

    # 知识库按「本单是什么服务 + 谁在看」取，不做全库召回：
    # 写烘焙文案的人不需要「出海选品四步」，财务也不该读到种草结构。
    ctx_block, kb_res = kb.context_block(
        f"{task['title']} {task.get('brief') or ''}",
        top_k=3,
        service_id=_service_id(project),
        role=emp.get("role"),
    )
    upstream = handoff_context(task)
    prompt = _build_prompt(company, project, emp, task, upstream, ctx_block)

    result = llm.complete(
        system=emp.get("system_prompt") or f"你是{company['name']}的{emp['title']}。",
        user=prompt,
        meta={
            "role": emp.get("role"),
            "task": task["title"],
            # 把项目上下文一并传下去：模拟器据此产出贴合本次需求的内容，
            # 不再套用与客户无关的通用话术。
            "project": project.get("name") or "",
            "goal": project.get("goal") or "",
            "client": project.get("client_name") or "",
            "service": _service_name(project),
            "service_id": _service_id(project),
            "kb": (kb_res or {}).get("hits", []),
            "feedback": (task.get("review") or {}).get("rejected_reason") or "",
        },
    )
    text = (result or {}).get("text") or ""
    mode = (result or {}).get("mode", "simulated")

    in_tok, out_tok = _estimate_tokens(prompt, text)
    catalog = MODEL_CATALOG.get(emp.get("model_name") or "", {"in_cents": 0, "out_cents": 0})
    model_cost = int(round(in_tok / 1000 * catalog["in_cents"] + out_tok / 1000 * catalog["out_cents"]))
    # 工时分摊：一个任务按 1/8 个工作日计。注意括号 —— 不加会变成 day_rate 原值。
    labor_cost = int(round((emp.get("day_rate_cents") or 0) / 8))
    cost = model_cost + labor_cost

    output = {
        "text": text,
        "summary": _summarize(text),
        "mode": mode,
        "model": emp.get("model_name"),
        "citations": (kb_res or {}).get("hits", [])[:3],
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


def force_auto_approve(company):
    return bool((company or {}).get("status") == "demo_auto")


def _summarize(text, limit=160):
    line = " ".join((text or "").split())
    return line[:limit] + ("…" if len(line) > limit else "")


def run_ready(project_id, workers=3):
    """并行跑当前所有可执行任务（依赖图的同一层）。

    并行度由 DAG 决定，不是拍脑袋定并发数：上游没完成的根本不会进 ready 队列。
    """
    from concurrent.futures import ThreadPoolExecutor

    ready = next_runnable(project_id)
    if not ready:
        return []
    batch = ready[:workers]
    with ThreadPoolExecutor(max_workers=len(batch), thread_name_prefix="sf-task") as ex:
        futures = [ex.submit(run_task, t["id"]) for t in batch]
        out = []
        for f in futures:
            try:
                out.append(f.result())
            except CompanyError as exc:
                out.append({"error": exc.message})
            except Exception as exc:  # noqa: BLE001 - 单个任务失败不该拖垮整个项目
                out.append({"error": f"{type(exc).__name__}: {exc}"})
        return out


def run_project(project_id, max_rounds=12, workers=3):
    """把项目推到「没有可执行任务」或「卡在人工审批」为止。"""
    project = get_project(project_id)
    if not project:
        raise CompanyError(f"项目不存在：{project_id}", 404)
    db.x("UPDATE projects SET status = 'executing', updated_at = ? WHERE id = ?", (db.now(), project_id))

    rounds, stopped = [], "completed"
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


def _service_name(project):
    """项目关联订单对应的服务名；无订单的项目返回空串。"""
    order_id = project.get("order_id")
    if not order_id:
        return ""
    row = db.q1(
        "SELECT p.name AS name FROM orders o JOIN products p ON p.id = o.product_id WHERE o.id = ?",
        (order_id,),
    )
    return (row or {}).get("name") or ""


def _service_id(project):
    """服务 id（svc_*）。服务名会改，id 不会 —— 岗位话术按 id 分支才稳。"""
    order_id = project.get("order_id")
    if not order_id:
        return ""
    row = db.q1("SELECT product_id FROM orders WHERE id = ?", (order_id,))
    return (row or {}).get("product_id") or ""


def _build_prompt(company, project, emp, task, upstream, ctx_block):
    parts = [
        f"公司：{company['name']}（{company.get('industry') or ''}）",
        f"项目：{project['name']}｜目标：{project.get('goal') or ''}",
        f"你的岗位：{emp['title']}（{emp.get('seniority') or 'mid'}）",
        f"技能：{'、'.join(emp.get('skills') or []) or '按岗位常规执行'}",
        f"本次任务：{task['title']}",
    ]
    if task.get("brief"):
        parts.append(f"要求：{task['brief']}")
    # 客户说过要多少字，就把它顶成硬约束传下去。
    # 剧本里的「5 个标题 + 2 版正文」是默认量；客户要 500 字时，以客户的话为准，
    # 否则写的人不知道总预算，事后只能靠切，切出来必然断在半句上。
    want = quality.wanted_chars(project.get("goal") or "")
    if want and (emp.get("role") or "") == "copywriter":
        if want.get("low") and want.get("high"):
            span = f"{want['low']}–{want['high']} 字"
        elif want.get("low"):
            span = f"不少于 {want['low']} 字"
        else:
            span = f"不超过 {want['high']} 字"
        parts.append(
            f"篇幅（硬要求）：客户原话是「{want['text']}」，成品整篇按 {span} 写。"
            "客户指定了篇幅，上面要求的「多个标题 / 多版备选」就作废："
            "只交付 1 版完整成品，整篇直接可发，不要给备选、不要附过程说明。"
            "超出篇幅等于没按要求做，写得再好也是白写。"
        )
    # 形态也是硬约束：客户点的是文案，交「需求拆解 + 验收标准」等于交错了东西。
    # 在写之前就说清楚，比事后按标题判不合格便宜得多。
    form = quality.wanted_form(project.get("goal") or "")
    if form in quality.FINISHED_FORMS and (emp.get("role") or "") == "copywriter":
        label = quality.FORMS[form]["label"]
        parts.append(
            f"形态（硬要求）：客户要的是{label}成品。整篇只放成品本身，"
            "开头直接进入正文；不要写需求理解、执行步骤、卖点分析、配图建议、"
            "验收标准、复核意见这类内部过程材料，也不要用「一、二、三」分章列工作大纲。"
            "客户拿到就应该能直接发出去。"
        )
    if upstream:
        lines = [
            f"- {u['from_employee'] or '上游'} 交付《{u['from_title']}》：{u['summary'][:120]}"
            for u in upstream
        ]
        parts.append("上游交接：\n" + "\n".join(lines))
    # 打回 / 客户意见：只给理由不给原稿，模型只能「另写一份」，返工就成了抽奖。
    # 上一版正文必须一起递下去，它才知道该动哪一句、哪些不许动。
    review = task.get("review") or {}
    reason = (review.get("rejected_reason") or "").strip()
    if reason:
        head = "客户看过成品后提了意见，这一版要按意见改" if review.get("client_feedback") else "这一版被打回了，按意见重做"
        block = [f"{head}：{reason[:400]}"]
        shown = (review.get("deliverable_text") or "").strip()
        if shown:
            block.append(
                "客户看到的成品（他就是对着这一段提的意见）：\n" + shown[:2500]
            )
        prev = (review.get("previous_text") or "").strip()
        if prev:
            block.append(
                "上一版产出（在它上面改，不要照抄；没被点到的部分原样保留，"
                "不要整版换一套说法）：\n" + prev[:5000]
            )
        block.append(
            "改完必须做到这三条：\n"
            "1. 逐条对上意见——说太官方，就删掉「尊敬的客户」「为您服务」「亲爱的顾客」这类敬语，"
            "换成店跟客人说话的语气；说事实不对，就把那处事实改对；说太长，就砍到客户要的篇幅。\n"
            "2. 客户要一眼看得出哪里变了：只改被点到的地方，其余段落保持原样。\n"
            "3. 不要照抄上一版——照抄等于没返工，这一版必须和上一版有实质差别。"
        )
        parts.append("\n".join(block))
    # 客户档案：同一个客户以前提过什么。让他把同一句抱怨说第二遍，是我们的失职。
    memo = ""
    try:
        from . import feedback as feedback_mod

        memo = feedback_mod.memo_for_project(project)
    except Exception:  # noqa: BLE001 - 档案取不到不影响正常写作
        memo = ""
    if memo:
        parts.append("这位客户以前提过的意见（这次别再犯）：\n" + memo)
    # 跨任务长期记忆（v0.5.0）：系统自己从上一单学到的教训。
    # 位置放在客户档案之后、知识库之前——离「本次要写什么」越近的约束越该被看见。
    # 开关与分域都在 memory 模块内部判断，这里只管把内容放进去。
    mem_block = memory.context_block(
        company.get("id"),
        service_id=_service_id(project),
        role=emp.get("role"),
    )
    if mem_block:
        parts.append(
            "你自己的经验（前面几单踩过的坑、同类客户提过的事，先按这些自查；"
            "不相关的当没看见，不要硬套）：\n" + mem_block
        )
    if ctx_block:
        parts.append(
            "公司知识库（只挑和本次任务直接相关的用；不相关的当没看见，不要硬套）：\n" + ctx_block
        )
    parts.append("请直接交付可用的工作成果，不要解释过程。")
    return "\n\n".join(parts)


# ------------------------------------------------------------------ 审批

def request_approval(company_id, project_id, task_id, kind, title, risk="medium", payload=None, requested_by=None):
    aid = db.new_id("apr")
    db.x(
        """INSERT INTO approvals (id, company_id, project_id, task_id, kind, title, risk, payload_json,
                                  requested_by, status, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (aid, company_id, project_id, task_id, kind, title, risk,
         json.dumps(payload or {}, ensure_ascii=False), requested_by, "pending", db.now()),
    )
    return get_approval(aid)


def get_approval(approval_id):
    a = db.q1("SELECT * FROM approvals WHERE id = ?", (approval_id,))
    if a:
        a["payload"] = _j(a.get("payload_json"), {})
    return a


def list_approvals(company_id, status=None, limit=50):
    sql = "SELECT * FROM approvals WHERE company_id = ?"
    args = [company_id]
    if status:
        sql += " AND status = ?"
        args.append(status)
    sql += " ORDER BY created_at DESC LIMIT ?"
    args.append(int(limit))
    return [dict(a, payload=_j(a.get("payload_json"), {})) for a in db.q(sql, tuple(args))]


def decide_approval(approval_id, decision, note="", decided_by="老板"):
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
                # 驳回即返工：任务回到 todo，保留上一版产出作为证据
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


def _advance_project(project_id):
    project = get_project(project_id)
    if not project:
        return
    rows = db.q("SELECT status, COUNT(*) AS n FROM tasks WHERE project_id = ? GROUP BY status", (project_id,))
    counts = {r["status"]: r["n"] for r in rows}
    total = sum(counts.values())
    if total and counts.get("done", 0) == total:
        db.x("UPDATE projects SET status = 'delivered', updated_at = ? WHERE id = ?", (db.now(), project_id))
    elif counts.get("running") or counts.get("review"):
        db.x("UPDATE projects SET status = 'executing', updated_at = ? WHERE id = ?", (db.now(), project_id))
    elif project["status"] == "planning" and total:
        db.x("UPDATE projects SET status = 'ready', updated_at = ? WHERE id = ?", (db.now(), project_id))


# ------------------------------------------------------------------ 经营数据

def pnl(company_id, projects=None):
    income = db.q1(
        "SELECT COALESCE(SUM(amount_cents),0) AS s FROM ledger WHERE company_id = ? AND kind = 'income'",
        (company_id,),
    )["s"]
    expense = db.q1(
        "SELECT COALESCE(SUM(amount_cents),0) AS s FROM ledger WHERE company_id = ? AND kind = 'expense'",
        (company_id,),
    )["s"]
    if projects is None:
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


def dashboard(company_id):
    company = company_or_404(company_id)
    emps = roster(company_id)
    projects = list_projects(company_id, limit=200)
    # 只取状态分布，不把几百个任务对象拉出来再数一遍
    task_rows = db.q(
        "SELECT status, COUNT(*) AS n FROM tasks WHERE company_id = ? GROUP BY status",
        (company_id,),
    )
    by_status = {r["status"]: r["n"] for r in task_rows}
    pending = list_approvals(company_id, status="pending")

    return {
        "company": company,
        "pnl": pnl(company_id, projects),
        "headcount": {
            "total": len(emps),
            "working": sum(1 for e in emps if e["status"] == "working"),
            "idle": sum(1 for e in emps if e["status"] == "idle"),
            "awaiting": sum(1 for e in emps if e["status"] == "awaiting_approval"),
        },
        "tasks": {"total": sum(by_status.values()), "by_status": by_status},
        "approvals_pending": len(pending),
        "projects": [
            {
                "id": p["id"], "name": p["name"], "status": p["status"], "client": p.get("client_name"),
                "budget": _money(p["budget_cents"]), "cost": _money(p["cost_cents"]),
                "revenue": _money(p["revenue_cents"]),
            }
            # 已取消的项目不算「在手」：退款单留下的空壳不该占着看板
            for p in [x for x in projects if x["status"] != "cancelled"][:6]
        ],
    }


def add_income(company_id, project_id, amount_cents, description, category="项目收入", ref_id=None):
    # 幂等：同一 ref_id 只入账一次。并发回填、重复轮询都不会让营收翻倍。
    inserted = db.xr(
        "INSERT OR IGNORE INTO ledger (id, company_id, project_id, kind, category, amount_cents, description, ref_id, occurred_at)"
        " VALUES (?,?,?,?,?,?,?,?,?)",
        (db.new_id("led"), company_id, project_id, "income", category, int(amount_cents),
         description, ref_id, db.now()),
    )
    if not inserted:
        return pnl(company_id)
    if project_id:
        db.x(
            "UPDATE projects SET revenue_cents = revenue_cents + ?, updated_at = ? WHERE id = ?",
            (int(amount_cents), db.now(), project_id),
        )
    return pnl(company_id)


def ledger_gap(company_id):
    """对账：已交付却没收过钱的订单。

    这个函数存在的理由很具体：收入是在订单「变成 delivered」的那一刻记的，
    如果某一单是通过别的路径变成 delivered（历史数据、手工改库、早期版本），
    那一刻就没人记账，而它又不会再变一次，于是永远漏在账外。
    演示时「账本收入」和「订单总额」对不上就是这么来的。
    """
    rows = db.q(
        """SELECT o.id, o.amount_cents, o.product_name, o.buyer_name, o.project_id
             FROM orders o
            WHERE o.status = 'delivered'
              AND NOT EXISTS (SELECT 1 FROM ledger l WHERE l.kind = 'income' AND l.ref_id = o.id)
              AND (o.project_id IS NULL
                   OR o.project_id IN (SELECT id FROM projects WHERE company_id = ?))""",
        (company_id,),
    )
    return {
        "count": len(rows),
        "amount_cents": sum(int(r["amount_cents"] or 0) for r in rows),
        "orders": [r["id"] for r in rows],
    }


def reconcile(company_id):
    """把漏记的收入补上。幂等：重复跑不会多记一分钱。"""
    rows = db.q(
        """SELECT o.id, o.amount_cents, o.product_name, o.buyer_name, o.project_id
             FROM orders o
            WHERE o.status = 'delivered'
              AND NOT EXISTS (SELECT 1 FROM ledger l WHERE l.kind = 'income' AND l.ref_id = o.id)
              AND (o.project_id IS NULL
                   OR o.project_id IN (SELECT id FROM projects WHERE company_id = ?))""",
        (company_id,),
    )
    fixed = []
    for r in rows:
        add_income(
            company_id,
            r["project_id"],
            int(r["amount_cents"] or 0),
            f"{r['buyer_name'] or '客户'} · {r['product_name'] or '服务'}",
            category="订单收入",
            ref_id=r["id"],
        )
        fixed.append({"order_id": r["id"], "amount_cents": int(r["amount_cents"] or 0)})
    return {
        "checked_orders": len(fixed),
        "fixed": fixed,
        "amount_cents": sum(f["amount_cents"] for f in fixed),
        "pnl": pnl(company_id),
    }


def ledger(company_id, limit=100):
    rows = db.q(
        "SELECT * FROM ledger WHERE company_id = ? ORDER BY occurred_at DESC LIMIT ?",
        (company_id, int(limit)),
    )
    for r in rows:
        r["amount"] = _money(r["amount_cents"])
    return rows


# ------------------------------------------------------------------ 客户资产
#
# 一家公司真正值钱的不是这一单，是「这个人还会不会再买」。
# 客户档案把散落在订单里的名字收成一份资产表：买过几次、花了多少、交付得怎么样、
# 下一步该卖他什么、多久没联系了。全部从已有数据算出来，不新增录入负担。

# 下一步卖什么：按「买完这一样，下一件缺什么」的顺序推荐，不是随机推高价
CROSS_SELL = {
    "svc_landing_sel": ("svc_compliance", "品选出来了，下一步是上架前体检，别等被下架才补"),
    "svc_compliance": ("svc_content", "体检过了就该开卖，还缺一套能直接发的文案"),
    "svc_content": ("svc_landing_sel", "这套写法能复用，但下一个品还得重新选一遍"),
}
SERVICE_SHORT = {"svc_landing_sel": "选品", "svc_compliance": "体检", "svc_content": "文案"}


def _days_since(ts):
    if not ts:
        return None
    try:
        when = datetime.fromisoformat(str(ts)[:26])
    except (ValueError, TypeError):
        return None
    return max(0, (datetime.now() - when).days)


def _deliver_score(raw):
    payload = _j(raw, None)
    if not isinstance(payload, dict):
        return None
    q = payload.get("quality")
    return int(q["score"]) if isinstance(q, dict) and isinstance(q.get("score"), int) else None


def _product_name_map():
    """服务改过名，历史订单里存的是旧名。展示时一律用现在的名字。"""
    return {r["id"]: r["name"] for r in db.q("SELECT id, name FROM products")}


def customer_book(company_id, revisit_days=7):
    """客户档案 + 回访雷达。一个客户一行，按「该回访、花得多」排前面。"""
    names = _product_name_map()
    rows = db.q(
        """SELECT p.id AS project_id, p.name AS project_name, p.client_name, p.cost_cents,
                  o.id AS order_id, o.product_id, o.product_name, o.amount_cents,
                  o.status AS order_status, o.contact, o.delivered_at, o.deliverable_json
           FROM projects p LEFT JOIN orders o ON o.id = p.order_id
           WHERE p.company_id = ?
           ORDER BY p.created_at""",
        (company_id,),
    )

    book = {}
    for r in rows:
        name = (r.get("client_name") or "").strip()
        if not name:
            name = "未署名客户" if r.get("order_id") else "内部项目"
        c = book.setdefault(
            name,
            {
                "name": name, "contact": r.get("contact") or "",
                "orders": 0, "spend_cents": 0, "cost_cents": 0,
                "services": [], "product_ids": [], "scores": [],
                "projects": 0, "last_delivered": None,
            },
        )
        c["projects"] += 1
        if not c["contact"] and r.get("contact"):
            c["contact"] = r["contact"]
        if not r.get("order_id"):
            continue
        pname = names.get(r.get("product_id")) or r.get("product_name")
        if pname and pname not in c["services"]:
            c["services"].append(pname)
        if r.get("order_status") != "delivered":
            continue
        c["orders"] += 1
        c["spend_cents"] += int(r.get("amount_cents") or 0)
        c["cost_cents"] += int(r.get("cost_cents") or 0)
        if r.get("product_id") and r["product_id"] not in c["product_ids"]:
            c["product_ids"].append(r["product_id"])
        if r.get("delivered_at") and (not c["last_delivered"] or r["delivered_at"] > c["last_delivered"]):
            c["last_delivered"] = r["delivered_at"]
        score = _deliver_score(r.get("deliverable_json"))
        if score is not None:
            c["scores"].append(score)

    items = []
    for c in book.values():
        days = _days_since(c["last_delivered"])
        if c["orders"] >= 4:
            stage = "老客"
        elif c["orders"] >= 2:
            stage = "复购"
        elif c["orders"] == 1:
            stage = "新客"
        else:
            stage = "未成交"

        suggest = None
        for pid in c["product_ids"]:
            nxt = CROSS_SELL.get(pid)
            if nxt and nxt[0] not in c["product_ids"]:
                suggest = {"name": SERVICE_SHORT.get(nxt[0], nxt[0]), "why": nxt[1]}
                break
        if not suggest and c["product_ids"]:
            suggest = {"name": "打包价", "why": "三样都买过了，可以按月打包，省得每次重新下单"}
        if not suggest:
            suggest = {"name": "选品", "why": "还没开过单，先帮他把第一个品定下来"}

        if days is None:
            revisit, revisit_txt = "未交付", "还没交付过"
        elif days >= revisit_days:
            revisit, revisit_txt = "该回访", f"上次交付 {days} 天前，该问一句了"
        elif days >= 2:
            revisit, revisit_txt = "刚交付", f"{days} 天前刚交付，先别催"
        else:
            revisit, revisit_txt = "刚交付", "今天刚交付，先别催"

        profit = c["spend_cents"] - c["cost_cents"]
        items.append(
            {
                "name": c["name"],
                "contact": c["contact"],
                "stage": stage,
                "orders": c["orders"],
                "projects": c["projects"],
                "services": c["services"],
                "spend": _money(c["spend_cents"]),
                "profit": _money(profit),
                "margin": round(profit / c["spend_cents"] * 100, 1) if c["spend_cents"] else 0.0,
                "quality": round(sum(c["scores"]) / len(c["scores"])) if c["scores"] else None,
                "last_delivered": c["last_delivered"],
                "days_since": days,
                "revisit": revisit,
                "revisit_note": revisit_txt,
                "suggest": suggest,
            }
        )

    order_key = {"该回访": 0, "刚交付": 1, "未交付": 3}
    items.sort(key=lambda i: (order_key.get(i["revisit"], 2), -i["spend"]))

    total = len(items)
    repeat = sum(1 for i in items if i["orders"] >= 2)
    revenue = sum(i["spend"] for i in items)
    return {
        "items": items,
        "summary": {
            "customers": total,
            "repeat": repeat,
            "repeat_rate": round(repeat / total * 100, 1) if total else 0.0,
            "revenue": round(revenue, 2),
            "avg_per_customer": round(revenue / total, 2) if total else 0.0,
            "due": sum(1 for i in items if i["revisit"] == "该回访"),
        },
    }


def _service_margins(company_id):
    """每门服务真实的毛利：收入看订单实付，成本看项目实际花了多少。"""
    rows = db.q(
        """SELECT o.product_id, o.product_name, COUNT(*) AS n,
                  SUM(p.budget_cents) AS rev, SUM(p.cost_cents) AS cost
           FROM projects p JOIN orders o ON o.id = p.order_id
           WHERE p.company_id = ? AND p.status = 'delivered'
           GROUP BY o.product_id""",
        (company_id,),
    )
    out = []
    names = _product_name_map()
    for r in rows:
        rev, cost = int(r["rev"] or 0), int(r["cost"] or 0)
        out.append(
            {
                "product_id": r["product_id"],
                "name": names.get(r["product_id"]) or r["product_name"],
                "orders": r["n"],
                "revenue": _money(rev),
                "margin": round((rev - cost) / rev * 100, 1) if rev else 0.0,
            }
        )
    out.sort(key=lambda x: -x["margin"])
    return out


def brief(company_id, days=7):
    """老板的每日简报：不堆指标，只讲今天该动哪几件事。"""
    c = company_or_404(company_id)
    projects = list_projects(company_id, limit=200)
    p = pnl(company_id, projects)
    pending = list_approvals(company_id, status="pending")
    book = customer_book(company_id)
    due = [i for i in book["items"] if i["revisit"] == "该回访"]
    running = [x for x in projects if x["status"] in ("planning", "ready", "executing")]

    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S")
    row = db.q1(
        "SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS s FROM ledger"
        " WHERE company_id = ? AND kind = 'income' AND occurred_at >= ?",
        (company_id, cutoff),
    )

    actions = []
    for a in pending[:2]:
        payload = a.get("payload") or {}
        actions.append(
            {
                "kind": "approve",
                "title": a["title"],
                "detail": ("高风险，必须你本人看" if a.get("risk") == "high" else "中风险，等你点头")
                + (f" · {payload.get('summary')[:40]}" if payload.get("summary") else ""),
                "tab": "approvals",
                "label": "去拍板",
            }
        )
    if due:
        d = due[0]
        actions.append(
            {
                "kind": "revisit",
                "title": f"回访 {d['name']}",
                "detail": f"{d['revisit_note']}；可以问一句：{d['suggest']['name']}要不要一起做",
                "tab": "customers",
                "label": "看客户",
            }
        )
    if running:
        actions.append(
            {
                "kind": "watch",
                "title": f"{len(running)} 个项目还在跑",
                "detail": "不用你盯，跑完会自动交付；卡在审批的会出现在上面",
                "tab": "projects",
                "label": "看进度",
            }
        )

    margins = _service_margins(company_id)
    advice = []
    if margins:
        best = margins[0]
        advice.append(
            f"「{best['name']}」做了 {best['orders']} 单，毛利 {best['margin']}%，是现在最赚的一门，"
            "报价别自己往下压"
        )
        fat = next((m for m in margins if m["margin"] >= 88 and m["orders"] >= 3), None)
        if fat:
            advice.append(
                f"「{fat['name']}」{fat['orders']} 单稳在 {fat['margin']}%，成本没涨，下次可以提价 10% 试水"
            )
        thin = next((m for m in margins if m["margin"] < 65), None)
        if thin:
            advice.append(f"「{thin['name']}」毛利只有 {thin['margin']}%，要么提价，要么砍掉最费时的那一环")
    if book["summary"]["due"]:
        advice.append(
            f"{book['summary']['due']} 个客户超过 {days} 天没联系，回访一句比投广告便宜得多"
        )
    if not advice:
        advice.append("还没有交付记录，先开一单，简报才有东西可算")

    if pending:
        headline = f"今天有 {len(pending)} 件要你点头"
        if due:
            headline += f"，{len(due)} 个客户该回访"
    elif due:
        headline = f"没有要你拍板的事，{len(due)} 个客户该回访"
    elif running:
        headline = f"今天没你非办不可的事，{len(running)} 个项目在跑"
    else:
        headline = "今天没你非办不可的事，可以去谈下一单"

    now = datetime.now()
    return {
        "company": c["name"],
        "date": f"{now.month}月{now.day}日",
        "headline": headline,
        "actions": actions[:3],
        "advice": advice[:3],
        "stats": {
            "pending": len(pending),
            "high_risk": sum(1 for a in pending if a.get("risk") == "high"),
            "due": len(due),
            "running": len(running),
            "orders_7d": int(row["n"] or 0),
            "revenue_7d": _money(row["s"] or 0),
            "revenue_total": p["revenue"],
            "margin": p["margin"],
        },
    }
