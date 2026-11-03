"""买家页（扫码入口）走查：填表 -> 支付 -> 等交付 -> 三张截图。"""

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8787"
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".workbuddy-tmp")
OUT.mkdir(parents=True, exist_ok=True)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True)
        pg = b.new_page(viewport={"width": 400, "height": 860}, device_scale_factor=2)
        errors = []
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))

        pg.goto(f"{BASE}/q/svc_landing_sel", wait_until="networkidle")
        pg.wait_for_timeout(600)
        print("表单页标题:", pg.inner_text("h1"))
        print("价格:", pg.inner_text(".price"))
        pg.screenshot(path=str(OUT / "buyer-1-form.png"), full_page=True)

        pg.fill("#req", "我想做东南亚市场的轻小件，预算两万，希望 7 天内跑通第一单，需要知道先上哪几个品。")
        pg.fill("#name", "李雷")
        pg.fill("#contact", "wx_lilei")
        pg.click("#pay")
        pg.wait_for_timeout(1200)
        print("支付页金额:", pg.inner_text(".big-amount"))
        print("URL:", pg.url)
        pg.screenshot(path=str(OUT / "buyer-2-pay.png"), full_page=True)

        pg.click("#confirm")
        pg.wait_for_timeout(2500)
        pg.screenshot(path=str(OUT / "buyer-3-running.png"), full_page=True)
        print("执行中:", pg.inner_text(".center"))

        deadline = time.time() + 90
        while time.time() < deadline:
            pg.wait_for_timeout(1500)
            if pg.query_selector(".body-text"):
                break
        pg.wait_for_timeout(600)
        pg.screenshot(path=str(OUT / "buyer-4-done.png"), full_page=True)
        print("出现交付物:", bool(pg.query_selector(".body-text")))
        print("交付物长度:", len(pg.inner_text(".body-text")) if pg.query_selector(".body-text") else 0)
        print("控制台错误:", errors[:5] if errors else "无")
        b.close()


if __name__ == "__main__":
    main()
