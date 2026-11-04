"""订单编排层：把「一次付款」翻译成「一次真实交付」。

状态机（单向，除退款）：
    created -> pending_payment -> paid -> running -> delivered
                                      \\-> failed
    任意态 -> cancelled（未付款）/ refunded（已付款，需人工）

设计原则：订单不认识引擎内部，只认两件事 —— run_id 和最终交付物。
这样将来把 Python 引擎换成集群版，订单层不用动。
"""

import json
import re
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from . import company, db, orchestrator, pay, quality, seed_data

# 订单进入这些状态后不再接受重复支付回调
SETTLED = {"paid", "running", "delivered", "failed", "refunded"}

# 客户原话的上限。实测一单真实需求在 50–300 字，给到 2000 已经很宽松；
# 再长基本是复制了整份文档，模型抓不住重点，交付质量反而下降。
REQUIREMENT_MAX = 2000

# 后台推进项目。
# 这里的取舍：宁可排队，也不能丢单。
# 早先的写法是「拿不到槽位就发一个 queued 事件」——那等于把单扔了，
# 因为没有任何东西会回头再推它，客户会永远看到「正在做」。
# 现在：线程池负责限并发，池满了就排队；只有排队堆到 MAX_QUEUE 才拒单（背压）。
EXEC_WORKERS = 4
MAX_QUEUE = 200
_EXEC_POOL = ThreadPoolExecutor(max_workers=EXEC_WORKERS, thread_name_prefix="sf-order")
_PENDING = 0
_PENDING_LOCK = threading.Lock()

# 同一个项目同一时刻只能有一个推进者，否则两个线程会抢到同一批 todo 任务重复做。
_RUNNING = set()
_RUNNING_LOCK = threading.Lock()

# 连续推进失败计数。没有这个，一个坏项目会被补位线程每 20 秒重试一次，永远试下去。
_FAILS = {}
_FAIL_LOCK = threading.Lock()
MAX_FAILS = 3

# 每个项目只返工一次：记在内存里就够了，交付是同一进程里的一次性动作
_REWORKED = set()
_REWORK_LOCK = threading.Lock()


def _claim(project_id):
    with _RUNNING_LOCK:
        if project_id in _RUNNING:
            return False
        _RUNNING.add(project_id)
        return True


def _release(project_id):
    with _RUNNING_LOCK:
        _RUNNING.discard(project_id)


def _spawn_project(project_id):
    """把项目交给后台推进。已经有人在推就返回 True（不重复投递）。"""
    global _PENDING
    with _RUNNING_LOCK:
        if project_id in _RUNNING:
            return True
    with _PENDING_LOCK:
        if _PENDING >= MAX_QUEUE:
            return False
        _PENDING += 1

    def run():
        global _PENDING
        if not _claim(project_id):
            with _PENDING_LOCK:
                _PENDING -= 1
            return
        try:
            _execute_project(project_id)
        finally:
            _release(project_id)
            with _PENDING_LOCK:
                _PENDING -= 1

    try:
        _EXEC_POOL.submit(run)
    except RuntimeError:  # 池已关闭（进程正在退出）
        with _PENDING_LOCK:
            _PENDING -= 1
        return False
    return True


class OrderError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _clean(text, limit=2000):
    """把任意入参收敛成安全的短文本。

    前端传错类型是常事（数组、对象、数字），原先这里直接 .strip() 就把接口打成 500；
    对方看到 Internal Server Error 只会来问你，不会想到是自己传错了。
    现在非字符串一律当空处理，由上层给出 422 说清哪里不对。
    """
    if text is None:
        return ""
    if not isinstance(text, str):
        if isinstance(text, (int, float)) and not isinstance(text, bool):
            text = str(text)
        else:
            return ""
    return text.strip()[:limit]


def _minutes_ago(minutes):
    """当前时间往前推 n 分钟，格式与库里的 created_at 一致。"""
    return (datetime.now() - timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%S")


def place_order(product_id, buyer_name="", contact="", requirement=""):
    """建单 + 出支付凭据。未配置真实网关时直接拒绝，不产生脏单。"""
    info = pay.info()
    if not info["configured"]:
        raise OrderError(info["note"], 503)

    product_id = _clean(product_id, 64)
    if not product_id:
        raise OrderError("请指定要买的服务", 422)
    product = db.get_product(product_id)
    if not product or not product.get("active"):
        raise OrderError(f"服务不存在或已下架：{product_id}", 404)

    raw_requirement = requirement if isinstance(requirement, str) else ""
    if not raw_requirement.strip():
        raise OrderError("请至少用一句话描述你要交付的内容", 422)
    # 超长不静默截断：截掉的那部分可能是客户最在意的条件，必须让下单的人知道
    if len(raw_requirement.strip()) > REQUIREMENT_MAX:
        raise OrderError(f"需求请控制在 {REQUIREMENT_MAX} 字以内，太长了我们抓不住重点", 422)
    requirement = _clean(requirement, REQUIREMENT_MAX)
    if len(requirement) < 4:
        raise OrderError("请至少用一句话描述你要交付的内容", 422)

    buyer = _clean(buyer_name, 60)

    # 买家连点两下「立即购买」是很常见的。十分钟内、同一个人、同一个服务、
    # 同一句需求、还没付款的，直接复用那一张单 —— 否则一次误点会在后台多跑一整个项目。
    existing = db.q1(
        "SELECT * FROM orders WHERE product_id = ? AND buyer_name = ? AND requirement = ?"
        " AND status IN ('created', 'pending_payment') AND created_at > ?"
        " ORDER BY created_at DESC LIMIT 1",
        (product["id"], buyer, requirement, _minutes_ago(10)),
    )
    if existing:
        # 走 get_order 而不是直接用这行原始数据：出站字段（amount/amount_text）是在那里补的，
        # 否则「第一次下单」和「复用同一张单」返回的结构会不一样。
        existing = db.get_order(existing["id"])
        try:
            payment = pay.create_payment(existing)
        except pay.PayNotConfigured as exc:
            raise OrderError(str(exc), 503)
        return {"order": existing, "payment": payment, "idempotent": True}

    order = db.create_order(
        {
            "id": db.new_id("ord"),
            "product_id": product["id"],
            "product_name": product["name"],
            "buyer_name": buyer,
            "contact": _clean(contact, 120),
            "requirement": requirement,
            "amount_cents": product["price_cents"],
            "status": "created",
            "access_key": "ak_" + uuid.uuid4().hex,
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
    return {"order": order, "payment": payment, "idempotent": False}


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

    # 原子幂等：只有「尚未付款」的订单能被推进，并发回调进来只有一个能改成 paid。
    changed = db.xr(
        "UPDATE orders SET status = 'paid', paid_at = ?, pay_txn_id = ?"
        " WHERE id = ? AND status IN ('created', 'pending_payment')",
        (db.now(), txn_id or order.get("pay_txn_id") or "", order_id),
    )
    if not changed:
        return {"order": db.get_order(order_id), "idempotent": True}
    order = db.get_order(order_id)
    db.emit_order(
        order_id,
        "order.paid",
        {"amount_cents": order["amount_cents"], "channel": channel, "txn_id": order["pay_txn_id"]},
    )

    # 付款与取消可能同时发生（客户点完支付又点取消、或后台对账退款）。
    # 这里再看一眼：已经不是 paid/running 就别建项目，否则退了款还在后台烧钱。
    current = db.get_order(order_id)
    if current and current["status"] not in ("paid", "running"):
        db.emit_order(order_id, "order.dispatch_skipped", {"status": current["status"]})
        return {"order": current, "idempotent": True}

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
        tasks = company.plan_project(project["id"], seed_data.playbook_for(product.get("id")))
        order = db.update_order(order_id, project_id=project["id"], status="running")
        db.emit_order(
            order_id,
            "order.dispatched",
            {"project_id": project["id"], "tasks": len(tasks), "team": "增长工场"},
        )
        if not _spawn_project(project["id"]):
            # 只有排队堆到上限才会走到这里。订单不会被丢：定时补位线程会把它捞起来。
            db.emit_order(order_id, "order.queued", {"reason": "系统繁忙，已进入排队，稍后自动开始"})
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
        except Exception as exc:  # noqa: BLE001 - 后台失败不能影响订单接口
            _note_failure(project_id, exc)
            return
        _clear_failures(project_id)
        if res.get("stopped") != "approval":
            break
        if not auto_approve:
            return
        pending = res.get("pending_approvals") or []
        if not pending:
            break
        for a in pending:
            try:
                company.decide_approval(a["id"], "approved", note="已付款订单，系统代为验收", decided_by="系统代批")
            except company.CompanyError:
                pass

    # 环节都走完了，发货前先自检：不合格就补最弱的那一环
    try:
        _self_check(project_id, auto_approve=auto_approve)
    except Exception:  # noqa: BLE001 - 自检失败不该让订单卡死
        pass


def _clear_failures(project_id):
    with _FAIL_LOCK:
        _FAILS.pop(project_id, None)


def _note_failure(project_id, exc):
    """连续失败到上限就把订单标记失败，别让它在后台无限重试、无限烧成本。

    单次失败大概率是瞬时问题（库锁、进程忙），重试是对的；
    连续三次还失败，说明这一单有硬问题，如实告诉客户比装作还在进行要诚实。
    """
    with _FAIL_LOCK:
        n = _FAILS.get(project_id, 0) + 1
        _FAILS[project_id] = n
    if n < MAX_FAILS:
        return
    with _FAIL_LOCK:
        _FAILS.pop(project_id, None)
    order = db.q1("SELECT id FROM orders WHERE project_id = ? AND status IN ('paid', 'running')", (project_id,))
    if not order:
        return
    db.x("UPDATE orders SET status = 'failed' WHERE id = ? AND status IN ('paid', 'running')", (order["id"],))
    db.emit_order(order["id"], "order.failed", {"reason": f"连续 {n} 次推进失败：{exc}"})
    db.x("UPDATE projects SET status = 'cancelled', updated_at = ? WHERE id = ? AND status != 'delivered'",
         (db.now(), project_id))


def _pick_rework_target(tasks, roles):
    """返工派给谁：先找写稿的人，实在没有才挑最长的一段。

    抽成纯函数是为了能被 tools/scorecheck.py 直接钉住 ——
    这段逻辑一旦退化成「谁长重写谁」，钱花了、分数不动，页面上还显示「已返工」。
    """
    writers = [t for t in tasks if roles.get(t.get("assignee_employee_id")) == PRIMARY_ROLE]
    return max(writers or tasks, key=lambda t: len((t.get("output") or {}).get("text") or ""))


def _self_check(project_id, auto_approve=True):
    """发货前自检，不合格就回去补一次。

    只补一次、只补最弱的一环，理由：
      · 交付有时间成本，反复重做会把小单做成亏本单；
      · 「补一次还不合格」本身就是要如实告诉客户的信息，不是靠重试掩盖的事。
    """
    project = company.get_project(project_id)
    if not project or project["status"] != "delivered":
        return None

    payload = _project_deliverable(project_id) or {}
    report = payload.get("quality") or {}
    if not report or report.get("passed"):
        return report

    tasks = [
        t for t in company.list_tasks(project_id=project_id)
        if (t.get("output") or {}).get("text")
    ]
    # 只补一次。进程内用集合互斥，跨重启靠任务产出里的 rework 标记 ——
    # 光靠内存会在服务重启后把同一单再补一遍。
    if any((t.get("output") or {}).get("rework") for t in tasks):
        return report
    with _REWORK_LOCK:
        if project_id in _REWORKED:
            return report
        _REWORKED.add(project_id)
    # 补正文，不补结论：结论类任务是复核/合规，它们本来就不该承载篇幅
    verdict_kw = ("复核", "审查", "审校", "评分", "合规")
    cands = [t for t in tasks if not any(k in t["title"] for k in verdict_kw)] or tasks
    if not cands:
        return report
    # 返工找谁：永远先找「写稿的人」。
    # 以前是「谁写得多就重写谁」——低分单里最长的那段往往是配图建议/卖点分析，
    # 于是把辅助产出重写一遍，真正的文案一个字没动：模型钱白烧，分数一点没变。
    # 分数低是成品的质量问题，就该让出成品的人再写一版。
    roles = {e["id"]: (e.get("role") or "") for e in company.roster(project["company_id"])}
    target = _pick_rework_target(cands, roles)

    # 把自检意见当作「打回理由」传下去，模拟器/真模型都会据此重写这一段
    review = dict(target.get("review") or {})
    review["rejected_reason"] = report.get("advice") or "内容不够具体"
    # 上一版必须一起给：只给理由不给原稿，模型只能「另写一份」，返工等于抽奖
    review["previous_text"] = ((_project_deliverable(project_id) or {}).get("final_text") or "")[:6000]
    db.x("UPDATE tasks SET status = 'todo', review_json = ? WHERE id = ?",
         (json.dumps(review, ensure_ascii=False), target["id"]))
    old_raw = (db.q1("SELECT output_json FROM tasks WHERE id = ?", (target["id"],)) or {}).get("output_json")

    try:
        res = company.run_task(target["id"], force=True)
    except company.CompanyError:
        return report
    approval = (res or {}).get("approval")
    if approval and auto_approve:
        try:
            company.decide_approval(approval["id"], "approved", note="返工后系统代为验收", decided_by="系统代批")
        except company.CompanyError:
            pass

    after = (_project_deliverable(project_id) or {}).get("quality") or {}
    after_score = after.get("score", 0)
    note = {
        "round": 1,
        "task": target["title"],
        "reason": report.get("advice") or "",
        "score_before": report.get("score", 0),
        "score_after": after_score,
    }
    # 返工不保证一定更好。改完还不如原来，就留原来那一版 —— 至少不能越改越差。
    if old_raw and after_score <= report.get("score", 0):
        try:
            kept = json.loads(old_raw)
        except (TypeError, json.JSONDecodeError):
            kept = None
        if isinstance(kept, dict) and kept.get("text"):
            note["kept"] = "original"
            kept["rework"] = note
            db.x("UPDATE tasks SET output_json = ? WHERE id = ?",
                 (json.dumps(kept, ensure_ascii=False), target["id"]))
            note["score_after"] = report.get("score", 0)
            return report

    task = company.get_task(target["id"]) or {}
    out = dict(task.get("output") or {})
    out["rework"] = note
    db.x("UPDATE tasks SET output_json = ? WHERE id = ?",
         (json.dumps(out, ensure_ascii=False), target["id"]))
    return after


# ---- 交付物组装：客户付钱要的是「成品」，不是我们内部的过程记录 ----
# 真正出成品的那个人。三个剧本里都是 copywriter，按角色认人比按标题猜可靠。
PRIMARY_ROLE = "copywriter"
# 结论性任务：复核 / 合规是给我们自己把关的，不进交付正文
VERDICT_KW = ("复核", "审查", "审校", "评分", "合规", "查能不能", "出结论", "按严重程度")
# 客户侧收口：告诉客户拿到东西以后怎么用
CLOSE_KW = ("执行动作", "动作表", "交付说明", "客户跟进", "第一单怎么干")
CLOSE_MAX = 240       # 收口最多这么长，再多就是在抢正文的篇幅
APPENDIX_MAX = 1200   # 附录单段上限
APPENDIX_LIMIT = 6    # 附录最多留几段


def _strip_ctx(text):
    """去掉段落里重复的项目上下文行（拼接多段时只保留首段一份）。"""
    keep = [
        line for line in (text or "").split("\n")
        if not line.startswith(("项目：", "本次要解决的问题：", "这次要解决的事："))
    ]
    return "\n".join(keep).strip()


def _clip(text, limit):
    """超长就截到 limit，末尾给个明确的省略号，不装作这就是全文。"""
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    # 尽量断在句末，别把一句话劈成两半
    for mark in ("。", "！", "？", "\n", "；"):
        idx = cut.rfind(mark)
        if idx > limit * 0.6:
            return cut[: idx + 1].rstrip()
    return cut.rstrip() + "…"


def _cut_head(text, limit):
    """从开头往下收，收到 limit 为止，尽量断在句末。"""
    if len(text) <= limit:
        return text
    paras = [p for p in text.split("\n") if p.strip()]
    kept, used = [], 0
    for p in paras:
        if used + len(p) > limit and kept:
            break
        kept.append(p)
        used += len(p) + 1
    # 第一段就超了：段落切分不管用，退回句子级切
    if len("\n".join(kept)) > limit:
        kept = []
    if not kept:
        buf = ""
        for s in re.split(r"(?<=[。！？；!?;])", text):
            if len(buf) + len(s) > limit and buf:
                break
            buf += s
        kept = [buf] if buf else [text[:limit]]
    return "\n".join(kept).strip()


def _cut_tail(text, limit):
    """从结尾往上收，保住结论和行动建议——那才是客户最需要的部分。"""
    if len(text) <= limit:
        return text
    buf, used, picked = [], 0, []
    for s in reversed(re.split(r"(?<=[。！？；!?;])", text)):
        if used + len(s) > limit and picked:
            break
        picked.append(s)
        used += len(s)
    buf = "".join(reversed(picked)).strip()
    return buf if buf else text[-limit:]


def _trim_to(text, limit, tail_share=0.35):
    """按客户要的篇幅收：头尾都留，砍中间。

    只留开头会把「下一步怎么做」砍掉，那正是客户最值钱的部分；
    只留结尾又读不懂在说什么。所以头和尾各留一段，中间如实标出省略。
    """
    if not limit or len(text) <= limit:
        return text, False
    head, tail = "", ""
    if limit >= 240:
        head_budget = int(limit * (1 - tail_share))
        head = _cut_head(text, head_budget)
        tail = _cut_tail(text, limit - head_budget)
    if not head or not tail or len(head) + len(tail) >= len(text):
        return _cut_head(text, limit), True
    return f"{head}\n\n……（中间省略，完整版见附录原稿）……\n\n{tail}", True


def _project_deliverable(project_id):
    project = company.get_project(project_id)
    if not project:
        return None
    tasks = company.list_tasks(project_id=project_id)
    done = [t for t in tasks if t["status"] == "done"]
    roles = {e["id"]: (e.get("role") or "") for e in company.roster(project["company_id"])}
    texts = [(t, (t.get("output") or {}).get("text") or "") for t in tasks]
    texts = [(t, x) for t, x in texts if x]
    goal = project.get("goal") or ""
    want = quality.wanted_chars(goal)

    # ① 成品：按「谁负责写」认人，不按「谁最后说话」认。
    #    复核和合规是内部把关，客户付钱要的是能直接拿去用的东西。
    main = ""
    for t, x in texts:
        if roles.get(t.get("assignee_employee_id")) == PRIMARY_ROLE and len(x) > len(main):
            main = x

    # ② 收口：客户拿到以后先干什么。只留一段，且不许长过正文的一个零头。
    close = ""
    for t, x in reversed(texts):
        if x != main and any(k in t["title"] for k in CLOSE_KW):
            close = _strip_ctx(x)
            break

    # ③ 附录：其余实质产出留档，但不塞进正文——客户要看再展开，别逼着他读。
    appendix = []
    for t, x in texts:
        if x == main or x == close:
            continue
        if any(k in t["title"] for k in VERDICT_KW):
            continue
        appendix.append({"title": t["title"], "text": _clip(_strip_ctx(x), APPENDIX_MAX)})

    # 成品缺失时退回老办法：取最后几段实质产出，至少能发货
    if not main:
        parts = [
            _strip_ctx(x) for t, x in texts
            if not any(k in t["title"] for k in VERDICT_KW) and x != close
        ]
        main = "\n\n".join(parts[-4:])
        appendix = []

    # ④ 按客户说的篇幅收。客户要 500 字，就不该收到 7000 字。
    #    收口段也占篇幅，先给它留位置，剩下的才是正文的额度。
    ceiling = (want or {}).get("high")
    close_cap = min(CLOSE_MAX, int(ceiling * 0.3)) if ceiling else CLOSE_MAX
    close_clip = _clip(close, close_cap) if (close and close not in main) else ""
    budget = max(200, ceiling - len(close_clip)) if ceiling else None
    raw_main = main
    main, trimmed = _trim_to(main, budget)

    # 剪过就得留底：客户想看全文时有地方去，不能让人觉得东西被吞了
    if trimmed:
        writer_title = next(
            (t["title"] for t, x in texts
             if x == raw_main and roles.get(t.get("assignee_employee_id")) == PRIMARY_ROLE),
            "完整原稿",
        )
        appendix.insert(0, {
            "title": f"{writer_title} · 未精简原稿",
            "text": _clip(raw_main, APPENDIX_MAX * 3),
        })

    pieces = [main, close_clip]
    final_text = "\n\n".join(p for p in pieces if p).strip()

    # 出街清洗：内部索引、行话一律不进客户的眼睛
    final_text, polish_notes = quality.client_polish(final_text)
    report = quality.check(final_text, goal, company._service_id(project) or "")
    report["polish"] = polish_notes
    # 返工痕迹：确实改过就如实写，不装作一次做对
    for t in tasks:
        rw = (t.get("output") or {}).get("rework")
        if rw:
            report["rework"] = rw
            break

    return {
        "project_id": project_id,
        "status": project["status"],
        "final_text": final_text,
        "quality": report,
        # 客户说过的每一句、改到第几版：这是客户自己的话，不该只活在我们的工单里
        "feedback": _feedback_section(project_id),
        # 剪过就说剪过：客户比对原稿时不能觉得「你少给我东西了」
        "trimmed": {
            "on": True,
            "from": len(raw_main),
            "to": len(main),
            "wanted": (want or {}).get("text"),
        } if trimmed else None,
        "appendix": appendix[:APPENDIX_LIMIT],
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


def _feedback_section(project_id):
    """交付物里的客户意见段。延迟导入：feedback 依赖本模块的返工规则。"""
    try:
        from . import feedback

        project = company.get_project(project_id) or {}
        if not project.get("order_id"):
            return {"total": 0, "changed": 0, "items": []}
        return feedback.deliverable_section(project_id, project["order_id"])
    except Exception:  # noqa: BLE001 - 反馈段出问题不该让交付失败
        return {"total": 0, "changed": 0, "items": []}


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
            # 原子幂等：并发轮询只有一个线程能把订单推进到 delivered，
            # 其余线程 rowcount=0 直接返回，不会重复发事件、更不会重复记收入。
            changed = db.xr(
                "UPDATE orders SET status = 'delivered', delivered_at = ?, deliverable_json = ?"
                " WHERE id = ? AND status IN ('paid', 'running')",
                (db.now(), json.dumps(payload, ensure_ascii=False), order_id),
            )
            if not changed:
                return db.get_order(order_id)
            db.emit_order(
                order_id,
                "order.delivered",
                {
                    "project_id": project_id,
                    "evidence": (payload or {}).get("evidence", {}),
                    "preview": (payload or {}).get("final_text", "")[:120],
                },
            )
            # 交付即确认收入：账本层还有 (kind, ref_id) 唯一约束兜底
            if project.get("company_id"):
                company.add_income(
                    project["company_id"],
                    project_id,
                    order["amount_cents"],
                    f"{order.get('buyer_name') or '客户'} · {order.get('product_name') or '服务'}",
                    category="订单收入",
                    ref_id=order_id,
                )
            # 交付即学习（v0.5.0）：这一单暴露出来的问题记成经验，下一单自动带上。
            # 记失败不影响交付——记忆是加分项，不是必经环节。
            try:
                from . import memory as memory_mod

                memory_mod.learn_from_project(project)
            except Exception:  # noqa: BLE001
                pass
            return db.get_order(order_id)
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
        changed = db.xr(
            "UPDATE orders SET status = 'delivered', delivered_at = ?, deliverable_json = ?"
            " WHERE id = ? AND status IN ('paid', 'running')",
            (db.now(), json.dumps(payload, ensure_ascii=False), order_id),
        )
        if not changed:
            return db.get_order(order_id)
        db.emit_order(
            order_id,
            "order.delivered",
            {
                "run_id": run_id,
                "evidence": payload["evidence"] if payload else {},
                "preview": (payload or {}).get("final_text", "")[:120],
            },
        )
        return db.get_order(order_id)
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
        pid = order.get("project_id")
        if pid:
            project = company.get_project(pid)
            if project and project["status"] == "delivered":
                raise OrderError("项目已交付，不能再取消", 409)
            # 停项目：未开工的任务不再派发，避免退款后还在继续烧成本
            db.x(
                "UPDATE tasks SET status = 'cancelled'"
                " WHERE project_id = ? AND status IN ('todo', 'blocked', 'review')",
                (pid,),
            )
            db.x(
                "UPDATE projects SET status = 'cancelled', updated_at = ?"
                " WHERE id = ? AND status != 'delivered'",
                (db.now(), pid),
            )
            db.emit_order(order_id, "order.project_stopped", {"project_id": pid})
        # 竞态兜底：项目可能是取消之后才建出来的（order.project_id 当时还是空），
        # 所以按 order_id 再扫一遍，别让退了款的项目继续挂在「在手项目」里跑。
        for row in db.q("SELECT id, status FROM projects WHERE order_id = ?", (order_id,)):
            if row["status"] == "delivered":
                continue
            db.x(
                "UPDATE tasks SET status = 'cancelled'"
                " WHERE project_id = ? AND status IN ('todo', 'blocked', 'review', 'running')",
                (row["id"],),
            )
            db.x("UPDATE projects SET status = 'cancelled', updated_at = ? WHERE id = ?", (db.now(), row["id"]))
        order = db.update_order(order_id, status="refunded")
        db.emit_order(order_id, "order.refunded", {"reason": reason, "manual": True})
        return order
    order = db.update_order(order_id, status="cancelled")
    db.emit_order(order_id, "order.cancelled", {"reason": reason})
    return order


# ------------------------------------------------------------------ 自愈
# 进程会死：断电、Ctrl+C、部署重启。后台线程池里的活儿随进程一起没了，
# 但数据库里那一行还写着 running。下面两个函数负责把这种「僵尸单」找出来并推完。


def stuck(minutes=10):
    """列出卡住的订单：还挂着 paid/running，但项目没在推进、也没交付。

    判断依据是项目自己的 updated_at —— 项目每次推进都会刷新它，
    所以「很久没动」就是真的卡住了，不依赖内存里的线程状态（重启后内存是空的）。
    """
    rows = db.q(
        "SELECT id, status, paid_at, created_at, project_id FROM orders"
        " WHERE status IN ('paid', 'running') ORDER BY created_at"
    )
    out = []
    for r in rows:
        pid = r.get("project_id")
        project = company.get_project(pid) if pid else None
        if project and project["status"] == "delivered":
            out.append({**r, "reason": "项目已完成，订单待收口", "idle_minutes": 0})
            continue
        if not project:
            out.append({**r, "reason": "没有关联项目，无法推进", "idle_minutes": None})
            continue
        idle = _idle_minutes(project.get("updated_at"))
        if idle is None or idle >= minutes:
            out.append({**r, "reason": f"项目停在「{project['status']}」", "idle_minutes": idle})
    return out


def _idle_minutes(stamp):
    if not stamp:
        return None
    try:
        then = datetime.strptime(stamp[:19], "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return None
    return int((datetime.now() - then).total_seconds() // 60)


def recover(limit=20, minutes=0):
    """把「已付款但没收尾」的订单重新推起来。

    minutes=0 表示不看空闲时长，启动时用它兜底；
    运维手动调用时可以传 minutes=10，只救真的卡住的那些。

    幂等：项目已完成 → 只把订单收口（sync_order），不重跑；
          项目还在执行 → 重新投递，run_project 只挑 todo/ready 的任务，不会重复做。
    """
    rows = db.q(
        "SELECT id FROM orders WHERE status IN ('paid', 'running') ORDER BY created_at LIMIT ?",
        (limit,),
    )
    resumed, finished, skipped = [], [], []
    for r in rows:
        oid = r["id"]
        order = sync_order(oid)
        if order and order["status"] not in ("paid", "running"):
            finished.append(oid)
            continue
        pid = (order or {}).get("project_id")
        if not pid:
            skipped.append(oid)
            continue
        project = company.get_project(pid)
        if not project or project["status"] in ("delivered", "cancelled"):
            skipped.append(oid)
            continue
        if minutes:
            idle = _idle_minutes(project.get("updated_at"))
            if idle is not None and idle < minutes:
                skipped.append(oid)
                continue
        if _spawn_project(pid):
            db.emit_order(oid, "order.resumed", {"project_id": pid, "reason": "服务重启后自动续跑"})
            resumed.append(oid)
        else:
            skipped.append(oid)
    return {
        "scanned": len(rows),
        "resumed": resumed,
        "finished": finished,
        "skipped": skipped,
    }


def inflight():
    """已经交给后台、还没跑完的项目数（含排队）。"""
    with _PENDING_LOCK:
        return _PENDING


def backfill_quality(limit=300):
    """按当前口径重算历史交付的分数，并补齐交付物新增的字段。

    判据是 `quality.rules` 版本号，不再逐项查缺字段：口径一改，老单跟着重算，
    客户档案里不会出现「新单 100 分、老单 46 分」两套尺子。
    只补能算出来的部分（分数、四项、形态、反馈段）；当年的返工与清洗记录原样保留，
    那是历史事实，不能因为算法更新就把痕迹抹掉。
    """
    rows = db.q(
        "SELECT id, project_id, deliverable_json FROM orders "
        "WHERE deliverable_json IS NOT NULL ORDER BY rowid DESC LIMIT ?",
        (limit,),
    )
    fixed = []
    for row in rows:
        try:
            payload = json.loads(row["deliverable_json"] or "{}")
        except (TypeError, json.JSONDecodeError):
            continue
        changed = False

        # ① 反馈段（v0.4.9 新增）：老单的快照里没这个字段，对接方按契约取会缺。
        #    补的是「客户说过什么」，从反馈表重新算，不是猜的。
        fb = _feedback_section(row["project_id"]) if row.get("project_id") else {
            "total": 0, "changed": 0, "items": []
        }
        if payload.get("feedback") != fb:
            payload["feedback"] = fb
            changed = True

        # ② 分数：口径版本对不上才重算
        old = payload.get("quality") or {}
        if old.get("rules") != quality.RULES_VERSION:
            text = payload.get("final_text") or ""
            if text:
                project = company.get_project(row["project_id"]) or {}
                report = quality.check(text, project.get("goal") or "", company._service_id(project) or "")
                report["polish"] = old.get("polish") or []
                if old.get("rework"):
                    report["rework"] = old["rework"]
                payload["quality"] = report
                changed = True

        # ③ 交付物结构字段（v0.4.x 新增）：trimmed / appendix。
        #    老单交付的时候这两段还不存在，所以快照里没有这两个键。
        #    对接方按契约取字段时不该炸，所以补空值 —— 补「空」而不是编一段出来：
        #    那单确实没走过精简、也没留附录，硬造内容就是伪造历史。
        #    买家页本身按 `d.trimmed ?` / `d.appendix.length` 判断，补了不会多显示东西。
        if "trimmed" not in payload:
            payload["trimmed"] = None
            changed = True
        if "appendix" not in payload:
            payload["appendix"] = []
            changed = True

        if not changed:
            continue
        db.x(
            "UPDATE orders SET deliverable_json = ? WHERE id = ?",
            (json.dumps(payload, ensure_ascii=False), row["id"]),
        )
        fixed.append(row["id"])
    return fixed


def stats():
    """订单侧概况：各状态计数 + 卡单数，健康检查与运维面板共用。"""
    rows = db.q("SELECT status, COUNT(*) AS n FROM orders GROUP BY status")
    by_status = {r["status"]: int(r["n"]) for r in rows}
    return {
        "total": sum(by_status.values()),
        "by_status": by_status,
        "inflight": inflight(),
        "workers": EXEC_WORKERS,
        "queue_limit": MAX_QUEUE,
        "stuck": len(stuck(minutes=10)),
    }


def watchdog_tick(minutes=1, limit=5):
    """定时补位：把「没人推、也没完成」的订单重新投递一遍。

    为什么需要它：并发超过线程池容量时单会排队，排队就得有人记得去推；
    线程池里的任务也可能因为异常提前退出。这个函数每 20 秒跑一次，
    保证「已付款的单最终一定会被推完」——这是对客户唯一的承诺。
    """
    try:
        return recover(limit=limit, minutes=minutes)
    except Exception:  # noqa: BLE001 - 补位失败不能影响进程
        return {"scanned": 0, "resumed": [], "finished": [], "skipped": []}
