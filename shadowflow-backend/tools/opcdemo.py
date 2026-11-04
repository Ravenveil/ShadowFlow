"""经营演示：下一单 -> 执行 -> 审批 -> 交付 -> 收款，全程走前端交互。"""

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8787"
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".workbuddy-tmp")
OUT.mkdir(parents=True, exist_ok=True)


def wait_text(pg, text, timeout=45):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if text in pg.inner_text("body"):
            return True
        pg.wait_for_timeout(400)
    return False


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True)
        pg = b.new_page(viewport={"width": 1440, "height": 940})
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        pg.goto(f"{BASE}/api/os", wait_until="networkidle")
        pg.wait_for_timeout(1000)

        # 1. 老板下达目标
        pg.click("text=下达业务目标")
        pg.wait_for_timeout(400)
        pg.fill("#g-goal", "给一家新开的社区面包店做开业首月获客，目标 80 个到店客户，预算 500 元以内")
        pg.fill("#g-client", "麦香烘焙")
        pg.fill("#g-budget", "499")
        pg.screenshot(path=str(OUT / "demo-1-goal.png"))
        pg.click("#g-ok")

        # 2. 自动拆解并跑到第一个审批卡点
        ok = wait_text(pg, "项目卡在人工审批", timeout=60)
        print("到达中转审批:", ok, "| 任务数:", len(pg.query_selector_all(".task")))
        pg.screenshot(path=str(OUT / "demo-2-approval.png"), full_page=True)

        # 3. 通过 -> 继续执行 -> 合规审批
        for i in range(2):
            btn = pg.query_selector("button:has-text('通过')")
            if not btn:
                print(f"第 {i+1} 次审批：未找到通过按钮")
                break
            btn.click()
            pg.wait_for_timeout(900)
            run = pg.query_selector("#runbtn")
            if run:
                run.click()
                pg.wait_for_timeout(1200)
            wait_text(pg, "已完成", timeout=40)
            pg.wait_for_timeout(1200)
            print(f"第 {i+1} 次审批后状态:", pg.inner_text("#h-right").replace("\n", " ")[:60])

        # 4. 交付完成
        wait_text(pg, "已交付", timeout=40)
        pg.wait_for_timeout(800)
        pg.screenshot(path=str(OUT / "demo-3-delivered.png"), full_page=True)
        print("项目状态:", pg.inner_text("#h-right").replace("\n", " ")[:50])

        # 5. 记一笔收款
        pg.evaluate("go('ledger')")
        pg.wait_for_timeout(900)
        pg.click("text=记一笔收款")
        pg.wait_for_timeout(400)
        pg.fill("#i-amt", "499")
        pg.fill("#i-desc", "麦香烘焙 · 首期款")
        pg.click("text=入账")
        pg.wait_for_timeout(1200)
        pg.screenshot(path=str(OUT / "demo-4-ledger.png"))
        print("账本页:", pg.inner_text("#h-title"), "|", len(pg.query_selector_all(".ledger-row")), "条流水")

        # 6. 回总览
        pg.evaluate("go('overview')")
        pg.wait_for_timeout(1200)
        pg.screenshot(path=str(OUT / "demo-5-overview.png"))
        print("总览 KPI:", [k.inner_text().replace("\n", " ") for k in pg.query_selector_all(".kpi")])

        print("控制台错误:", errors[:5] if errors else "无")
        b.close()


if __name__ == "__main__":
    main()
