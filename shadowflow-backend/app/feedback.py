"""客户反馈回流：交付之后说「这段不行」，要能真的改，并且记住。

三件事，缺一件这条链就是断的：

1. 收得到 —— 客户在交付页圈一段、写一句，原话存下来（不改写、不总结）。
2. 改得动 —— 原话作为「打回理由」交给写稿的人，重出一版；改差了留原版。
   只把意见记进数据库、正文一个字不动，那是工单，不是服务。
3. 记得住 —— 同一个客户下次下单，上一单的意见要进提示词，不能让他把同一句
   抱怨说第二遍。

成本纪律：一单最多改两轮。第三轮起直接告诉客户「剩下的我人工接」——
模型改不动的，通常不是多跑一次能解决的，再跑只是继续烧钱。
"""

import json
import threading

from . import company, db

# 一单最多按客户意见改几轮
MAX_ROUNDS = 2
# 客户原话长度（太短抓不住重点，太长说明他想要的是重新沟通而不是返工）
NOTE_MIN = 4
NOTE_MAX = 600
# 圈中的原文片段：只用来定位，不参与语义
EXCERPT_MAX = 400
# 反馈标签：客户不会写 prompt，给他几个能点的词
TAGS = ("太官方", "不像我们说话", "事实不对", "太长", "没说到点上", "漏了重点")

_REWORK_LOCK = threading.RLock()
_BUSY = set()


class FeedbackError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _clean(text, limit):
    s = (text or "").strip() if isinstance(text, str) else ""
    # 客户可能从 Word 里粘一串不可见字符进来，去掉再判长度
    s = "".join(ch for ch in s if ch == "\n" or ch >= " ")
    return s[:limit]


def buyer_key(order):
    """认人：先看联系方式，没有就退回称呼。

    联系方式是客户自己填的，同一串手机号就是他；只有称呼时重名会串档，
    这是可接受的退让 —— 总比完全不认人强，而且只在「近半年、被采纳过」的范围里生效。
    """
    o = order or {}
    contact = _clean(o.get("contact"), 120).lower().replace(" ", "")
    if contact:
        return "c:" + contact
    name = _clean(o.get("buyer_name"), 60)
    return ("n:" + name) if name else ""


def _order_ok(order_id):
    order = db.get_order(order_id)
    if not order:
        raise FeedbackError(f"订单不存在：{order_id}", 404)
    if order["status"] != "delivered":
        raise FeedbackError("这单还没交付，暂时没法提意见；交付后这里会出现「哪里不对」", 409)
    if not order.get("project_id"):
        raise FeedbackError("这单是早期单人执行版本，没有可返工的项目", 409)
    project = company.get_project(order["project_id"])
    if not project or project["status"] != "delivered":
        raise FeedbackError("项目状态已变化，请联系人工处理", 409)
    return order, project


def submit(order_id, note, excerpt="", tags=None, async_=True, dry_run=False):
    """收下意见，排队返工。返回反馈记录（不等返工做完）。

    dry_run=True：只做校验，不落库、不返工。
    接入方拿不准字段结构时可以先试一把（契约走查也走这条），不会白烧一次返工。
    """
    order, project = _order_ok(order_id)
    note = _clean(note, NOTE_MAX)
    if len(note) < NOTE_MIN:
        raise FeedbackError("请用一句话说清哪里不对（比如「太官方了，不像我们店说话」）", 422)

    history = db.list_feedback(order_id, limit=20)
    if len(history) >= MAX_ROUNDS:
        raise FeedbackError(
            f"这一单已经按你的意见改过 {len(history)} 版了，再自动改下去不一定更好。"
            "把你的要求发给我们，人工接着处理。",
            409,
        )

    picked = [t for t in (tags or []) if t in TAGS][:4]
    if dry_run:
        return {
            "id": "fb_dry_run",
            "order_id": order_id,
            "project_id": project["id"],
            "buyer_key": buyer_key(order),
            "excerpt": _clean(excerpt, EXCERPT_MAX),
            "note": note,
            "tags": picked,
            "status": "dry_run",
            "round": len(history) + 1,
            "created_at": db.now(),
        }

    fb = db.create_feedback(
        {
            "id": db.new_id("fb"),
            "order_id": order_id,
            "project_id": project["id"],
            "buyer_key": buyer_key(order),
            "excerpt": _clean(excerpt, EXCERPT_MAX),
            "note": note,
            "tags": picked,
            "status": "open",
            "round": len(history) + 1,
        }
    )
    db.emit_order(
        order_id,
        "order.feedback",
        {"feedback_id": fb["id"], "round": fb["round"], "note": note, "tags": picked},
    )
    if async_:
        threading.Thread(target=_run_safe, args=(fb["id"],), daemon=True, name=f"fb-{fb['id']}").start()
    else:
        _run_safe(fb["id"])
    return db.get_feedback(fb["id"])


def _run_safe(fb_id):
    try:
        rework(fb_id)
    except Exception as exc:  # noqa: BLE001 - 后台线程不能把异常吞成静默失败
        cur = db.get_feedback(fb_id)
        db.update_feedback(
            fb_id,
            status="failed",
            applied_at=db.now(),
            result_json=json.dumps({"error": str(exc)[:300]}, ensure_ascii=False),
        )
        if cur:
            db.emit_order(cur["order_id"], "order.feedback_failed", {"feedback_id": fb_id, "reason": str(exc)[:200]})


def _target_task(project_id, project):
    """返工还是找写稿的人 —— 客户说的是「正文不对」，不是「配图建议不对」。"""
    from .orders import PRIMARY_ROLE, VERDICT_KW, _pick_rework_target

    tasks = [t for t in company.list_tasks(project_id=project_id) if (t.get("output") or {}).get("text")]
    if not tasks:
        raise FeedbackError("这单没有可返工的正文", 409)
    verdict_kw = ("复核", "审查", "审校", "评分", "合规") + tuple(VERDICT_KW)
    cands = [t for t in tasks if not any(k in t["title"] for k in verdict_kw)] or tasks
    roles = {e["id"]: (e.get("role") or "") for e in company.roster(project["company_id"])}
    target = _pick_rework_target(cands, roles)
    if not target:
        raise FeedbackError("找不到该改哪一段，请联系人工", 409)
    return target


def rework(fb_id):
    """按客户原话重出一版。改差了就留原版 —— 客户的意见不能被执行成更差的成品。"""
    fb = db.get_feedback(fb_id)
    if not fb:
        return None
    order = db.get_order(fb["order_id"])
    if not order:
        return None
    project = company.get_project(order["project_id"])
    if not project:
        return None

    with _REWORK_LOCK:
        if fb_id in _BUSY:
            return fb
        _BUSY.add(fb_id)
    try:
        before = json.loads(order.get("deliverable_json") or "{}")
        score_before = (before.get("quality") or {}).get("score", 0)
        text_before = before.get("final_text") or ""

        target = _target_task(project["id"], project)
        review = dict(target.get("review") or {})
        reason = "客户原话：" + fb["note"]
        if fb.get("excerpt"):
            reason += f"（他圈的是这段：「{fb['excerpt'][:120]}」）"
        review["rejected_reason"] = reason
        # 上一版必须给「这个任务自己的产出」，不是订单里裁剪过的成品。
        # 给错了东西模型会照抄：任务是「写三版文案」(1200 字)，给它的却是
        # 裁剪后的 193 字成品，它照着写一遍，交付出来自然一个字没变。
        prev_task_text = (target.get("output") or {}).get("text") or ""
        review["previous_text"] = prev_task_text[:6000] or text_before[:6000]
        review["deliverable_text"] = text_before[:3000]
        review["client_feedback"] = True
        db.x(
            "UPDATE tasks SET status = 'todo', review_json = ? WHERE id = ?",
            (json.dumps(review, ensure_ascii=False), target["id"]),
        )
        old_raw = (db.q1("SELECT output_json FROM tasks WHERE id = ?", (target["id"],)) or {}).get("output_json")

        db.emit_order(order["id"], "order.rework_started", {"feedback_id": fb_id, "task": target["title"]})
        try:
            res = company.run_task(target["id"], force=True)
        except company.CompanyError as exc:
            _restore(target["id"], old_raw, review)
            raise FeedbackError(f"返工没跑起来：{exc.message}", 409)

        approval = (res or {}).get("approval")
        if approval:
            try:
                company.decide_approval(approval["id"], "approved", note="客户反馈返工，系统代为验收", decided_by="系统代批")
            except company.CompanyError:
                pass

        after = company_project_deliverable(project["id"])
        score_after = (after.get("quality") or {}).get("score", 0)
        text_after = after.get("final_text") or ""
        changed = text_after.strip() != text_before.strip()

        # 客户意见优先于自检分数：他说太官方，我们照做；自检分从 80 掉到 75，
        # 那是这套尺子跟客户口味不一样，不是他的意见错。只有两种情况退回原版：
        #   ① 压根没改（模型照抄了一遍，等于没返工）
        #   ② 改出来是残的（空/断裂/短得离谱）
        # 「客户提了意见，我们改了一版更烂的」比不改更伤人 —— 但那是自检返工该守的规矩，
        # 客户点名要的东西，得由客户说了算。
        broken = (not text_after.strip()) or (len(text_after) < max(60, len(text_before) * 0.4))
        kept = "original" if (not changed or broken) else ""
        score_after_raw = score_after          # 改出来那版的真实分数（哪怕没用它）
        new_preview = text_after[:200]
        if kept:
            dropped = "没改出实质变化" if not changed else "改出来的版本残缺"
            _restore(target["id"], old_raw, review)
            after = company_project_deliverable(project["id"])
            score_after = (after.get("quality") or {}).get("score", score_before)
        else:
            dropped = ""

        result = {
            "round": fb["round"],
            "task": target["title"],
            "score_before": score_before,
            "score_after": score_after,
            "score_after_new": score_after_raw,
            "changed": changed,
            "kept": kept,
            "dropped": dropped,
            "new_preview": new_preview,
            "note": fb["note"],
            "tags": fb.get("tags") or [],
            "at": db.now(),
        }
        after["feedback"] = _section(project["id"], order["id"])
        # 交付物是快照：返工后必须重写，否则客户刷新还是旧正文
        db.update_order(order["id"], deliverable_json=json.dumps(after, ensure_ascii=False))
        db.update_feedback(
            fb["id"],
            status="applied" if not kept else "kept",
            applied_at=db.now(),
            result_json=json.dumps(result, ensure_ascii=False),
        )
        db.emit_order(order["id"], "order.reworked", result)
        # 客户意见也要沉淀成经验（v0.5.0）：这次客户嫌长，下一单同类活的写稿人该知道。
        # 交付时的那次 learn 只跑过一次，这里是改版之后的新事实，得再记一次。
        try:
            from . import memory as memory_mod

            memory_mod.learn_from_project(project)
        except Exception:  # noqa: BLE001 - 记经验失败不影响已完成的返工
            pass
        return db.get_feedback(fb["id"])
    finally:
        with _REWORK_LOCK:
            _BUSY.discard(fb_id)


def company_project_deliverable(project_id):
    """交付物重算（含反馈段）。单独包一层，方便脚本直接调用。"""
    from . import orders

    return orders._project_deliverable(project_id) or {}


def _restore(task_id, old_raw, review):
    """把任务产出还原成原版，并留下「改过但没采纳」的痕迹。"""
    try:
        kept = json.loads(old_raw) if old_raw else None
    except (TypeError, json.JSONDecodeError):
        kept = None
    if isinstance(kept, dict) and kept.get("text"):
        kept["feedback_kept"] = {
            "reason": review.get("rejected_reason", ""),
            "at": db.now(),
        }
        db.x(
            "UPDATE tasks SET status = 'done', output_json = ? WHERE id = ?",
            (json.dumps(kept, ensure_ascii=False), task_id),
        )
    else:
        db.x("UPDATE tasks SET status = 'done' WHERE id = ?", (task_id,))


def _section(project_id, order_id):
    """交付物里的「客户意见」段：客户要能看见自己的话被记下来、改到哪一步。

    没有意见时也给一个空壳而不是 null —— 对接方拿到字段就能用，
    不用先判它存不存在。
    """
    rows = db.list_feedback(order_id, limit=10) if order_id else []
    if not rows:
        return {"total": 0, "changed": 0, "items": []}
    rows.reverse()  # 按时间正序，读起来像一件事的经过
    return {
        "total": len(rows),
        "changed": len([r for r in rows if r["status"] == "applied"]),
        "items": [
            {
                "round": r["round"],
                "note": r["note"],
                "tags": r.get("tags") or [],
                "excerpt": r.get("excerpt") or "",
                "status": r["status"],
                "at": r.get("applied_at") or r["created_at"],
                "result": (r.get("result") or {}),
            }
            for r in rows
        ],
    }


def deliverable_section(project_id, order_id):
    return _section(project_id, order_id)


def memo_for_project(project):
    """进提示词的「客户档案」：同一客户以前提过什么。

    只取被采纳过的、近半年的，最多三条。客户档案不是垃圾桶，
    塞一堆旧意见进去，模型会以为每条都还成立。
    """
    if not project or not project.get("order_id"):
        return ""
    order = db.get_order(project["order_id"])
    if not order:
        return ""
    key = buyer_key(order)
    if not key:
        return ""
    rows = db.feedback_for_buyer(key, exclude_order=order["id"], limit=3)
    if not rows:
        return ""
    lines = []
    for r in rows:
        tag = ("（" + "、".join(r.get("tags") or []) + "）") if r.get("tags") else ""
        lines.append(f"- {r['note']}{tag}")
    return "\n".join(lines)


def list_for_order(order_id):
    return {
        "items": db.list_feedback(order_id),
        "max_rounds": MAX_ROUNDS,
        "tags": list(TAGS),
    }


def stats():
    row = db.q1("SELECT COUNT(*) AS n FROM order_feedback")
    by = db.q(
        "SELECT status, COUNT(*) AS n FROM order_feedback GROUP BY status"
    )
    return {
        "total": int((row or {}).get("n") or 0),
        "max_rounds": MAX_ROUNDS,
        "tags": list(TAGS),
        "by_status": {r["status"]: r["n"] for r in by},
    }
