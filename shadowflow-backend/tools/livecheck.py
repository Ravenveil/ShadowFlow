"""联动走查：一条命令确认「这边一动，那边立刻收到」。

不测「接口能不能返回」，测的是最容易被忽略的那件事——页面之间到底有没有通。
用 urllib 裸读 SSE（不引第三方库，包内能直接跑），顺序是：

  1. 挂上管理侧事件流（老板 OS 用的那条）
  2. 真下一单 → 应该立刻出现 order.created
  3. 真付一单 → 应该立刻出现 order.paid
  4. 挂上买家侧事件流（只带这一单的凭据）→ 应该能补到刚发生的事件
  5. 买家侧不带凭据 → 必须 403（不能让人听别人的单）
  6. 取消这一单收尾 → 应该出现 order.cancelled，且 stream 能收到

任何一步没在时限内到，退出码 1。
"""

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request

BASE = os.getenv("SF_BASE", "http://127.0.0.1:8787").rstrip("/")
TIMEOUT = float(os.getenv("SF_LIVE_TIMEOUT", "12"))
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

FAILED = []


def ok(msg):
    print(f"  OK   {msg}")


def bad(msg):
    FAILED.append(msg)
    print(f"  FAIL {msg}")


def call(path, payload=None, method="GET"):
    data = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Content-Type": "application/json"},
    )
    with _OPENER.open(req, timeout=15) as r:
        return json.loads(r.read().decode() or "{}")


class Stream(threading.Thread):
    """裸读一条 SSE：收到什么就记什么，断开也不影响主流程判断。"""

    def __init__(self, path, label):
        super().__init__(daemon=True)
        self.path = path
        self.label = label
        self.events = []
        self.status = None
        self.error = None
        self._stop = False

    def run(self):
        try:
            req = urllib.request.Request(BASE + self.path)
            self.resp = _OPENER.open(req, timeout=TIMEOUT + 5)
            self.status = self.resp.status
            etype = ""
            for raw in self.resp:
                if self._stop:
                    break
                line = raw.decode("utf-8", "ignore").strip()
                if line.startswith("event:"):
                    etype = line[6:].strip()
                elif line.startswith("data:"):
                    try:
                        ev = json.loads(line[5:].strip())
                    except ValueError:
                        continue
                    ev["_type"] = etype or ev.get("type")
                    self.events.append(ev)
        except urllib.error.HTTPError as exc:
            self.status = exc.code
            self.error = exc.read().decode("utf-8", "ignore")[:120]
        except Exception as exc:  # noqa: BLE001 - 流断开是常态，交给上层判断
            self.error = str(exc)

    def stop(self):
        self._stop = True

    def wait_for(self, type_, timeout=None):
        """等某类事件到达。每条只消费一次，避免同一个事件被当成两次用。"""
        end = time.time() + (timeout if timeout is not None else TIMEOUT)
        while time.time() < end:
            for ev in list(self.events):
                if ev.get("_type") == type_ and not ev.get("_consumed"):
                    ev["_consumed"] = True
                    return ev
            time.sleep(0.1)
        return None


def main():
    print(f"基地址 {BASE}")
    try:
        stats = call("/api/events/stats")
    except Exception as exc:  # noqa: BLE001
        print(f"服务没起或不可达：{exc}")
        return 1
    print(f"总线现状：已发 {stats.get('seq')} 条，当前 {stats.get('listeners')} 路在听")

    # 1) 管理侧事件流
    boss = Stream("/api/events?types=order.", "老板侧")
    boss.start()
    time.sleep(0.6)
    if boss.status == 200:
        ok("管理侧事件流已连上（HTTP 200）")
    else:
        bad(f"管理侧事件流连不上：{boss.status} {boss.error or ''}")

    # 2) 下单
    order = call("/api/orders", {
        "product_id": "svc_content",
        "buyer_name": "联动走查",
        "requirement": "联动走查用，请忽略：写一句今天天气不错",
    }, method="POST")
    oid = order["order"]["id"]
    key = order["order"].get("access_key") or ""
    pay_info = order.get("payment") or {}
    print(f"下单 {oid}（{pay_info.get('mode')}）")

    ev = boss.wait_for("order.created", timeout=6)
    if ev and (ev.get("data") or {}).get("product"):
        ok("老板侧立刻收到 order.created：" + str((ev["data"].get("product") or {}).get("name")))
    else:
        bad("下单了但老板侧没收到 order.created")

    # 3) 支付
    call("/api/pay/notify", {
        "provider": pay_info.get("mode") or "simulated",
        "order_id": oid,
        "txn_id": pay_info.get("txn_id") or "",
        "access_key": key,
    }, method="POST")
    ev = boss.wait_for("order.paid", timeout=8)
    if ev is not None:
        ok("付款后立刻收到 order.paid（不用等下一次轮询）")
    else:
        bad("付款了但老板侧没收到 order.paid")

    # 4) 买家侧只订自己的单
    buyer = Stream(f"/api/orders/{oid}/events?k={key}", "买家侧")
    buyer.start()
    time.sleep(1.0)
    if buyer.status == 200:
        types = [e.get("_type") for e in buyer.events]
        if types:
            ok(f"买家侧连上并补到历史：{', '.join(types[:4])}")
        else:
            bad("买家侧连上了但一条历史都没补到（新开页面会看不到刚才的进度）")
    else:
        bad(f"买家侧事件流打不开：{buyer.status} {buyer.error or ''}")

    # 5) 只听得见自己的单
    #    本机回环默认就是管理员（本机演示不该还要输令牌），所以「不带凭据被挡」这条
    #    在有 SF_ADMIN_TOKEN 时才有意义；没设时改为校验「推来的每条都只属于这一单」。
    if os.getenv("SF_ADMIN_TOKEN"):
        try:
            probe = _OPENER.open(BASE + f"/api/orders/{oid}/events", timeout=5)
            probe.read(10)
            bad("买家侧不带凭据也能听，别人能偷看别人的单")
        except urllib.error.HTTPError as exc:
            if exc.code == 403:
                ok("买家侧不带凭据被挡（403）")
            else:
                bad(f"买家侧不带凭据返回 {exc.code}，预期 403")
    else:
        ids = {e.get("order_id") for e in buyer.events}
        if ids == {oid}:
            ok("买家侧只收到自己这一单的事件（本机回环默认管理员，故不测 403）")
        else:
            bad(f"买家侧收到了别的单的事件：{ids}")

    # 6) 收尾：取消这一单（已付款的会走退款），看事件有没有出
    try:
        call(f"/api/orders/{oid}/cancel", {"reason": "live check"}, method="POST")
        ev = boss.wait_for("order.cancelled", timeout=4) or boss.wait_for("order.refunded", timeout=4)
        if ev is not None:
            ok(f"取消后收到 {ev.get('_type')}（已付款的单走退款，不叫取消）")
        else:
            bad("取消了但老板侧没收到 order.cancelled / order.refunded")
    except Exception as exc:  # noqa: BLE001
        bad(f"取消失败：{exc}")

    # 7) 总线计数必须真的在走
    after = call("/api/events/stats")
    if after.get("seq", 0) > stats.get("seq", 0):
        ok(f"总线计数在走：{stats.get('seq')} → {after.get('seq')}")
    else:
        bad("总线计数没动，说明事件压根没发出来")

    boss.stop()
    buyer.stop()
    print()
    if FAILED:
        print(f"联动走查不通过：{len(FAILED)} 项")
        for f in FAILED:
            print(f"  - {f}")
        return 1
    print("联动走查通过：下单、付款、取消都能实时到达两端，买家只能听自己的单")
    return 0


if __name__ == "__main__":
    sys.exit(main())
