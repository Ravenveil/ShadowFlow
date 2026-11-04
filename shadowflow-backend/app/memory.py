"""跨任务长期记忆：让员工记住上一次项目学到的东西。

为什么要有它
------------
公司现在的知识库是**人写的**（`kb_entries`）：谁都可以加词条，但没有人负责更新。
于是每接一单，「上次那单被客户打回是因为太官方」这件事，下次还得重新踩一遍。

记忆层补的是这一段：**系统自己在干活过程中把经验记下来，下一单自动带进提示词**。

和另外两样东西的区别，别混了：

| | 知识库 kb_entries | 客户档案 feedback | 记忆 memories |
| --- | --- | --- | --- |
| 谁写的 | 人手动加 | 客户说的 | 系统自动记 |
| 记什么 | 通用的方法与政策 | 这个客户提过什么 | 这次执行暴露出的**可复用教训** |
| 谁的 | 全公司 | 某一个客户 | 某个岗位 + 某类服务 |
| 例子 | 「四眼原则是什么」 | 「麦香烘焙说别太官方」 | 「文案返工三次都因为交成了工作底稿」 |

三条记录来源，都从已经存在的事实里挖，不额外调用模型（省成本、也不怕幻觉）：

1. **返工记录** —— 自检打回时，`rejected_reason` 就是一次教训的原文。
2. **客户意见** —— 客户说「太长了」，下次写稿的人就该知道。
3. **质检弱项** —— 「能照做 0 处具体数字」这种系统性缺陷。

分域规则和知识库一致（`scope_services` / `scope_roles`），所以烘焙文案的经验
不会串到出海选品去。

边界（有意为之）
----------------
- 只记**结构化的教训**，不记原文全文——记忆塞满提示词反而干扰写作。
- 同一岗位同一服务最多留 `MAX_PER_SCOPE` 条，超了按"最近+最有用"淘汰。
- 记忆**只影响提示词，不直接改产出**。模型听了不听是它的事，
  但我们的质检、返工、客户意见优先级都不变，记忆不能压过客户。
"""

import json
import re

from . import config, db

# 一次最多带几条记忆进提示词
TOP_K = config.MEMORY_RECALL_TOP_K

# 同一个（岗位+服务）最多留几条
MAX_PER_SCOPE = 8

# 记忆种类
KIND_LESSON = "lesson"      # 教训：这次为什么被打回
KIND_PREF = "preference"    # 偏好：客户/业务上的倾向
KIND_WEAK = "weakness"      # 弱项：反复出现的质量缺陷

KIND_LABEL = {
    KIND_LESSON: "教训",
    KIND_PREF: "偏好",
    KIND_WEAK: "弱项",
}


class MemoryError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


# ------------------------------------------------------------------ 写入


def remember(
    company_id,
    content,
    kind=KIND_LESSON,
    service_id="",
    role="",
    source="",
    source_ref="",
    title="",
    score=0.6,
):
    """记一条经验。同一条内容重复记时不新增，只给它加权。

    重复检测用的是「岗位+服务+内容」三元组——同一个岗位在同一类服务上
    反复栽同一个跟头，说明这条经验值得加重，不是新知识。
    """
    content = (content or "").strip()
    if not content:
        raise MemoryError("记忆内容不能为空")
    if len(content) > 600:
        content = content[:600]
    service_id = service_id or ""
    role = role or ""

    rows = db.q(
        "SELECT id, content, score FROM memories WHERE company_id = ? AND role = ? AND service_id = ?",
        (company_id, role, service_id),
    )
    for row in rows:
        if _same(row["content"], content):
            # 已有的那条加权：分越高越靠前，但不超过 1.0
            new_score = min(1.0, round((row["score"] or 0.6) + 0.1, 3))
            db.x(
                "UPDATE memories SET score = ?, hits = hits + 1, updated_at = ? WHERE id = ?",
                (new_score, db.now(), row["id"]),
            )
            return db.get_memory(row["id"])

    mem_id = db.new_id("mem")
    db.x(
        """INSERT INTO memories (id, company_id, kind, title, content, service_id, role,
                                 source, source_ref, score, hits, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)""",
        (mem_id, company_id, kind, title or _auto_title(content), content, service_id, role,
         source or "", source_ref or "", round(float(score), 3), db.now(), db.now()),
    )
    _trim(company_id, role, service_id)
    return db.get_memory(mem_id)


def _same(a, b):
    """判两条是不是同一件事。去掉标点空白后比对，避免「太官方了。」和「太官方了」算两条。"""
    norm = lambda s: re.sub(r"[\s，。、！？；：,.!?;:（）()「」\"']", "", s or "")
    return norm(a) == norm(b)


def _auto_title(content):
    head = re.split(r"[。！？\n]", content.strip())[0]
    return (head or content)[:30]


def _trim(company_id, role, service_id):
    """同一岗位+服务最多留 MAX_PER_SCOPE 条，多了淘汰最没用的一条。"""
    rows = db.q(
        """SELECT id, score, hits FROM memories
           WHERE company_id = ? AND role = ? AND service_id = ?
           ORDER BY score DESC, hits DESC, created_at DESC""",
        (company_id, role, service_id),
    )
    for row in rows[MAX_PER_SCOPE:]:
        db.x("UPDATE memories SET archived = 1 WHERE id = ?", (row["id"],))


def learn_from_project(project, tasks=None):
    """一个项目跑完后，把这次暴露出来的问题记成经验。

    三个来源，全部基于已经落库的事实，不额外调模型：
    1. 返工记录（`output.rework`）——被打回的原因就是教训原文
    2. 客户反馈（`order_feedback`）——客户原话
    3. 质检弱项（`deliverable.quality`）——反复掉分的那一项
    """
    if not config.MEMORY_ENABLED or not project:
        return []

    company_id = project.get("company_id")
    if not company_id:
        return []
    service_id = project.get("service_id") or _service_of(project)
    tasks = tasks or db.q(
        "SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at", (project["id"],)
    )
    written = []

    # 1. 返工记录
    for task in tasks:
        rework = (task.get("output_json") and _j(task.get("output_json")) or {}).get("rework")
        if not isinstance(rework, dict):
            continue
        reason = (rework.get("reason") or "").strip()
        if not reason:
            continue
        role = _role_of(task, company_id)
        mem = _safe(
            remember,
            company_id,
            f"「{task['title']}」被自检打回：{reason}。下次交这一类东西先按这条自查。",
            kind=KIND_LESSON,
            service_id=service_id,
            role=role,
            source="rework",
            source_ref=task.get("id") or "",
            score=0.85,
        )
        if mem:
            written.append(mem)

    # 2. 客户意见（按岗位沉淀：写稿的人该知道这个客户在意什么）
    order_id = project.get("order_id")
    if order_id:
        for fb in db.list_feedback(order_id):
            note = (fb.get("note") or "").strip()
            if not note:
                continue
            tags = "、".join(fb.get("tags") or [])
            role = _writer_role(tasks, company_id)
            mem = _safe(
                remember,
                company_id,
                f"客户提过：{note}" + (f"（{tags}）" if tags else "") +
                "。同类客户交付时先按这条自查。",
                kind=KIND_PREF,
                service_id=service_id,
                role=role,
                source="client_feedback",
                source_ref=fb.get("id") or "",
                score=0.9,
            )
            if mem:
                written.append(mem)

    # 3. 质检弱项
    quality = _quality_of(project)
    if quality:
        weakest = quality.get("weakest")
        items = {i.get("key"): i for i in (quality.get("items") or [])}
        item = items.get(weakest)
        if item and not item.get("ok"):
            role = _writer_role(tasks, company_id)
            mem = _safe(
                remember,
                company_id,
                f"自检「{item.get('name')}」这项没拿分（{item.get('note')}）。"
                f"下次写完先自查这一项：{(item.get('advice') or '')}",
                kind=KIND_WEAK,
                service_id=service_id,
                role=role,
                source="quality",
                source_ref=project.get("id") or "",
                score=0.75,
            )
            if mem:
                written.append(mem)

    return written


def _safe(fn, *args, **kwargs):
    """记忆写失败不该影响主流程——它是加分项，不是必经环节。"""
    try:
        return fn(*args, **kwargs)
    except Exception:  # noqa: BLE001
        return None


def _j(raw):
    try:
        return json.loads(raw or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}


def _role_of(task, company_id):
    emp_id = task.get("assignee_employee_id")
    if not emp_id:
        return ""
    emp = db.q1("SELECT role FROM employees WHERE id = ?", (emp_id,))
    return (emp or {}).get("role") or ""


def _writer_role(tasks, company_id):
    """客户意见与质检弱项都落在「交成品的人」身上，不是落在复核/合规身上。"""
    for task in tasks:
        emp_id = task.get("assignee_employee_id")
        if not emp_id:
            continue
        emp = db.q1("SELECT role FROM employees WHERE id = ?", (emp_id,))
        role = (emp or {}).get("role") or ""
        if role in ("copywriter", "writer", "designer"):
            return role
    for task in tasks:
        emp_id = task.get("assignee_employee_id")
        if emp_id:
            emp = db.q1("SELECT role FROM employees WHERE id = ?", (emp_id,))
            return (emp or {}).get("role") or ""
    return ""


def _service_of(project):
    order_id = project.get("order_id")
    if not order_id:
        return ""
    row = db.q1("SELECT product_id FROM orders WHERE id = ?", (order_id,))
    return (row or {}).get("product_id") or ""


def _quality_of(project):
    """交付物里的质检结果。订单侧已经把结果写进 deliverable，这里只是读。"""
    order_id = project.get("order_id")
    if not order_id:
        return {}
    order = db.get_order(order_id)
    if not order:
        return {}
    deliverable = order.get("deliverable") or {}
    return deliverable.get("quality") or {}


# ------------------------------------------------------------------ 召回


def recall(company_id, service_id="", role="", top_k=None, exclude_kind=""):
    """取这次该带进提示词的记忆。

    分域口径与知识库一致：
    - `service_id` 传了就只取该服务或通用的；传空串表示"有上下文但取不到值"，
      服务专属的一条都不给（不知道是什么活，别乱套）。
    - `role` 同理。
    """
    if not config.MEMORY_ENABLED:
        return []
    top_k = top_k or TOP_K
    rows = db.q(
        """SELECT * FROM memories
           WHERE company_id = ? AND archived = 0
           ORDER BY score DESC, hits DESC, updated_at DESC
           LIMIT 60""",
        (company_id,),
    )
    hits = []
    for row in rows:
        if exclude_kind and row.get("kind") == exclude_kind:
            continue
        if not _in_scope(row, service_id, role):
            continue
        hits.append(row)
        if len(hits) >= top_k:
            break
    return hits


def _in_scope(row, service_id, role):
    mem_service = row.get("service_id") or ""
    mem_role = row.get("role") or ""
    # 服务：空=通用；不匹配=不召回
    if mem_service:
        if not service_id or mem_service != service_id:
            return False
    # 岗位：空=通用；不匹配=不召回
    if mem_role:
        if not role or mem_role != role:
            return False
    return True


def context_block(company_id, service_id="", role="", top_k=None):
    """进提示词的那段话。空字符串表示没有可用记忆（不塞废话）。"""
    hits = recall(company_id, service_id=service_id, role=role, top_k=top_k)
    if not hits:
        return ""
    lines = []
    for row in hits:
        label = KIND_LABEL.get(row.get("kind"), "经验")
        lines.append(f"- [{label}] {row['content']}")
    return "\n".join(lines)


# ------------------------------------------------------------------ 管理


def list_memories(company_id, role="", service_id="", include_archived=False, limit=100):
    sql = "SELECT * FROM memories WHERE company_id = ?"
    args = [company_id]
    if role:
        sql += " AND role = ?"
        args.append(role)
    if service_id:
        sql += " AND service_id = ?"
        args.append(service_id)
    if not include_archived:
        sql += " AND archived = 0"
    sql += " ORDER BY score DESC, updated_at DESC LIMIT ?"
    args.append(int(limit))
    return db.q(sql, tuple(args))


def stats(company_id):
    rows = db.q(
        "SELECT kind, COUNT(*) AS n FROM memories WHERE company_id = ? AND archived = 0 GROUP BY kind",
        (company_id,),
    )
    by_kind = {r["kind"]: r["n"] for r in rows}
    total = sum(by_kind.values())
    return {
        "enabled": config.MEMORY_ENABLED,
        "total": total,
        "by_kind": {
            KIND_LESSON: by_kind.get(KIND_LESSON, 0),
            KIND_PREF: by_kind.get(KIND_PREF, 0),
            KIND_WEAK: by_kind.get(KIND_WEAK, 0),
        },
        "top_k": TOP_K,
        "max_per_scope": MAX_PER_SCOPE,
    }


def forget(memory_id):
    """删掉一条记忆（记错了就该能删）。归档而非物理删除，留痕。"""
    row = db.get_memory(memory_id)
    if not row:
        raise MemoryError("记忆不存在", 404)
    db.x("UPDATE memories SET archived = 1, updated_at = ? WHERE id = ?", (db.now(), memory_id))
    return db.get_memory(memory_id)
