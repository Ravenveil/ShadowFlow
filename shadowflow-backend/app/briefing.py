"""主动经营：老板不打开页面，系统也知道自己该干什么。

以前「今天先做这几件」是打开页面才现算的 —— 老板一周不开一次页面，这事就等于没有。
而且现算的结果不落库：今天看到的和明天看到的是两次临时计算，没法对比，也没法回看。

这里把这件事改成「定时自动生成并落库」：

  1) 调度器线程常驻，到点（默认早 8 点）扫一遍公司状态，生成当天简报并写进 daily_briefs；
  2) 生成完往事件总线发一条 brief.ready，页面开着就会自己刷新，不用手动 F5；
  3) 配了 webhook（SF_BRIEF_WEBHOOK）就把同一条内容推出去 —— 企业微信机器人、
     飞书、自己的服务都行，标准 markdown 格式。

三条原则：
  · **不调模型**。简报是照着库里已经有的事实算出来的（待审批、该回访、在跑的项目、
    真实毛利），调模型只会让它说得像个人话，而不是更准。
  · **同一天只有一份**。当天重跑会覆盖当天那份，不堆历史噪音。
  · **推不出去不算失败**。webhook 挂了只记状态，简报本身照样落库、照样能在页面看。
"""

import threading
import time
import urllib.error
import urllib.request
from datetime import datetime

from . import bus, db
from .config import BRIEF_ENABLED, BRIEF_HOUR, BRIEF_WEBHOOK

_LOCK = threading.RLock()

STATE = {
    "enabled": bool(BRIEF_ENABLED),
    "hour": int(BRIEF_HOUR),
    "webhook": bool(BRIEF_WEBHOOK),
    "last_run_at": None,
    "last_result": None,
    "last_error": None,
    "next_run_at": None,
    "runs": 0,
}


def today():
    return datetime.now().strftime("%Y-%m-%d")


def _compute_next_run(now=None):
    """下一次触发时刻。今天的点过了就算明天。"""
    from datetime import timedelta

    now = now or datetime.now()
    nxt = now.replace(hour=STATE["hour"], minute=0, second=0, microsecond=0)
    if nxt <= now:
        nxt = nxt + timedelta(days=1)
    return nxt.strftime("%Y-%m-%d %H:%M:%S")


def build(company_id, days=7):
    """算今天的简报内容，但不落库。

    算的过程完全基于已落库事实：待审批、该回访的客户、在跑的项目、真实毛利。
    """
    from . import company as company_mod

    return company_mod.brief(company_id, days=days)


def push(brief_payload, company_name=""):
    """把简报推到 webhook。推不出去只记状态，不抛异常。

    返回 (ok, detail)。内容用 markdown，企业微信/飞书机器人都能直接显示。
    """
    if not BRIEF_WEBHOOK:
        return False, "未配置 webhook"

    actions = brief_payload.get("actions") or []
    lines = [
        f"**{company_name or brief_payload.get('company') or ''} · {brief_payload.get('date', '')} 经营待办**",
        "",
        brief_payload.get("headline") or "",
        "",
    ]
    for a in actions:
        lines.append(f"- **{a.get('title', '')}** —— {a.get('detail', '')}")
    for x in brief_payload.get("advice") or []:
        lines.append(f"> {x}")
    body = "\n".join(lines).encode("utf-8")

    req = urllib.request.Request(
        BRIEF_WEBHOOK,
        data=body,
        method="POST",
        headers={"Content-Type": "text/plain; charset=utf-8"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return (200 <= resp.status < 300), f"HTTP {resp.status}"
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code}"
    except Exception as exc:  # noqa: BLE001 - 推送失败不该影响主流程
        return False, f"{type(exc).__name__}: {exc}"


def generate(company_id, source="scheduler", days=7, do_push=True):
    """生成 + 落库 + 推送。返回落库后的那一条。"""
    from . import company as company_mod

    payload = build(company_id, days=days)
    brief_date = today()
    row = db.save_daily_brief(
        company_id,
        brief_date,
        payload.get("headline") or "",
        payload,
        source=source,
    )

    ok, detail = (False, "未配置 webhook")
    if do_push:
        ok, detail = push(payload, company_name=payload.get("company") or "")
        row["push_status"] = "ok" if ok else ("skipped" if not BRIEF_WEBHOOK else "failed")
        row["push_detail"] = detail
    else:
        row["push_status"] = "skipped"
        row["push_detail"] = "本次未推送"

    # 页面开着的话，立刻知道「今天这份来了」
    bus.publish(
        "brief.ready",
        {
            "company_id": company_id,
            "brief_date": brief_date,
            "headline": payload.get("headline") or "",
            "source": source,
            "push_status": row.get("push_status"),
        },
    )
    return row


def run_due(force=False, company_id=None):
    """扫描是否该生成今天的简报。返回生成了几份。

    规则：到点了、今天还没生成过 → 生成。已经有今天的了 → 跳过（除非 force）。
    """
    from . import company as company_mod

    if not STATE["enabled"] and not force:
        return 0

    comps = company_mod.list_companies()
    if company_id:
        comps = [c for c in comps if c["id"] == company_id]
    if not comps:
        return 0

    d = today()
    made = 0
    for c in comps:
        if not force and db.get_daily_brief(c["id"], d):
            continue
        try:
            generate(c["id"], source="scheduler")
            made += 1
        except Exception as exc:  # noqa: BLE001 - 一家失败不影响其他家
            STATE["last_error"] = f"{c.get('name')}: {type(exc).__name__}: {exc}"
    return made


def status():
    """给运维面板看的调度器状态。"""
    with _LOCK:
        s = dict(STATE)
    s["today_brief"] = today()
    s["next_run_at"] = _compute_next_run()
    return s


# ---------------------------------------------------------------- 调度线程

_THREAD = None
_STOP = threading.Event()


def _loop():
    """每 30 秒醒一次：到点了就生成当天的简报。

    醒得勤是为了「服务在 8 点之后才启动」这种情况也能补上当天那份 —— 补跑是幂等的，
    当天已经有就不重复生成。
    """
    while not _STOP.is_set():
        try:
            now = datetime.now()
            if now.hour >= STATE["hour"]:
                run_due()
        except Exception as exc:  # noqa: BLE001 - 调度线程不能因为一次异常就死掉
            with _LOCK:
                STATE["last_error"] = f"{type(exc).__name__}: {exc}"
        _STOP.wait(30)


def start():
    """启动调度线程。已经在跑就什么都不做。"""
    global _THREAD
    if not STATE["enabled"]:
        return False
    with _LOCK:
        if _THREAD and _THREAD.is_alive():
            return False
        _THREAD = threading.Thread(target=_loop, name="brief-scheduler", daemon=True)
        _THREAD.start()
    return True


def stop():
    _STOP.set()


def trigger(company_id=None):
    """手动触发一次（管理端「现在就跑一遍」用）。"""
    from . import company as company_mod

    comps = company_mod.list_companies()
    if company_id:
        comps = [c for c in comps if c["id"] == company_id]
    out = []
    for c in comps:
        try:
            row = generate(c["id"], source="manual")
            out.append({"company_id": c["id"], "ok": True, "headline": row.get("headline")})
        except Exception as exc:  # noqa: BLE001
            out.append({"company_id": c["id"], "ok": False, "error": str(exc)})
    with _LOCK:
        STATE["last_run_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        STATE["runs"] += 1
        STATE["last_result"] = out
    return out
