"""OPC 管理台走查：逐页截图，收集控制台报错。"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8787"
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".workbuddy-tmp")
OUT.mkdir(parents=True, exist_ok=True)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True)
        pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        errors = []
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))

        pg.goto(f"{BASE}/api/os", wait_until="networkidle")
        pg.wait_for_timeout(1200)
        print("标题:", pg.inner_text("#h-title"))
        print("KPI 数量:", len(pg.query_selector_all(".kpi")))
        pg.screenshot(path=str(OUT / "os-1-overview.png"))

        for tab, name in [("org", "os-2-org"), ("roster", "os-3-roster"), ("projects", "os-4-projects"),
                          ("approvals", "os-5-approvals"), ("ledger", "os-6-ledger")]:
            pg.evaluate(f"go('{tab}')")
            pg.wait_for_timeout(900)
            print(f"{tab}: {pg.inner_text('#h-title')}")
            pg.screenshot(path=str(OUT / f"{name}.png"))

        pg.evaluate("go('projects')")
        pg.wait_for_timeout(800)
        card = pg.query_selector(".card[onclick]")
        if card:
            card.click()
            pg.wait_for_timeout(1200)
            print("项目详情:", pg.inner_text("#h-title"), "| 任务数:", len(pg.query_selector_all(".task")))
            pg.screenshot(path=str(OUT / "os-7-project.png"), full_page=True)

        print("控制台错误:", errors[:5] if errors else "无")
        b.close()


if __name__ == "__main__":
    main()
