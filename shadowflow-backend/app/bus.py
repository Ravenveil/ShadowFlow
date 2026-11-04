"""全局事件总线：让三个页面（引擎台 / 买家页 / 老板 OS）看到同一件事。

之前每个页面各刷各的：老板页 8 秒轮一次，买家页 1.5 秒轮一次，引擎台只盯自己那一个 run。
结果是「这边点完，那边没反应」——不是没做，是没到下一次轮询。轮询还有个副作用：
一台机器开三个页面，每秒十几个请求，全是空转。

这里做一件很小的事：谁写库，谁顺手喊一声；谁在听，谁立刻收到。
- 事件带全局自增 id，断线重连用 Last-Event-ID 补齐，不丢也不重。
- 历史只留最近 300 条（内存环形），够补断线，不占内存。
- 订阅者可带过滤条件（只看某订单 / 某 run / 某几类事件），买家页只能听自己的单。

刻意的边界：总线只负责「通知」，不负责「数据」。事件里放的是 id 和少量摘要，
页面收到后仍走正常接口取详情——这样权限校验只有一处，不会因为推送泄了数据。
"""

import queue
import threading
import time
from collections import deque

# 断线补历史的上限。开三个页面挂着，断线几秒，300 条足够补上。
_MAX_HISTORY = 300
# 单个订阅者积压上限。页面卡住不来取，宁可丢旧的，也不让后端内存涨。
_SUB_QUEUE = 200

_LOCK = threading.Lock()
_SEQ = 0
_HISTORY = deque(maxlen=_MAX_HISTORY)
_SUBS = {}  # sub_id -> {"queue": Queue, "filter": dict|None, "since": int}
_NEXT_SUB = [0]


def _now():
    t = time.time()
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(t)) + ".%03d" % int((t % 1) * 1000)


def _match(filt, ev):
    """过滤条件：order_id / run_id 精确匹配，types 前缀匹配（如 "order." 收全部订单事件）。"""
    if not filt:
        return True
    oid = filt.get("order_id")
    if oid and ev["order_id"] != oid:
        return False
    rid = filt.get("run_id")
    if rid and ev["run_id"] != rid:
        return False
    types = filt.get("types")
    if types and not any(ev["type"].startswith(p) for p in types):
        return False
    return True


def publish(type_, payload=None, order_id="", run_id=""):
    """发一条事件。写库的地方顺手调用，调用方不用关心有没有人在听。"""
    global _SEQ
    with _LOCK:
        _SEQ += 1
        ev = {
            "id": _SEQ,
            "type": type_,
            "at": _now(),
            "order_id": order_id or "",
            "run_id": run_id or "",
            "data": payload or {},
        }
        _HISTORY.append(ev)
        targets = [(sid, sub) for sid, sub in _SUBS.items() if _match(sub["filter"], ev)]

    for sid, sub in targets:
        try:
            sub["queue"].put_nowait(ev)
        except queue.Full:
            # 页面落后太多：丢掉最旧的一条再塞。丢通知比丢连接好，页面还有轮询兜底。
            try:
                sub["queue"].get_nowait()
                sub["queue"].put_nowait(ev)
            except (queue.Empty, queue.Full):
                pass
    return ev


def subscribe(filter_=None, since=0):
    """订阅。返回 (sub_id, queue)。since 用来决定从哪条开始补历史。"""
    with _LOCK:
        _NEXT_SUB[0] += 1
        sid = _NEXT_SUB[0]
        _SUBS[sid] = {"queue": queue.Queue(maxsize=_SUB_QUEUE), "filter": filter_, "since": since}
    return sid, _SUBS[sid]["queue"]


def unsubscribe(sid):
    with _LOCK:
        _SUBS.pop(sid, None)


def backlog(since=0, filter_=None):
    """补历史：拿 since 之后、且符合过滤条件的事件（最多 _MAX_HISTORY 条）。"""
    with _LOCK:
        items = list(_HISTORY)
    return [ev for ev in items if ev["id"] > since and _match(filter_, ev)]


def stats():
    with _LOCK:
        return {
            "seq": _SEQ,
            "listeners": len(_SUBS),
            "history": len(_HISTORY),
            "last": _HISTORY[-1] if _HISTORY else None,
        }
