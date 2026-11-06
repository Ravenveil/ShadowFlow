"""UI smoke check: load the console, auto-run a demo run, wait for completion, screenshot.

Usage: python tools/uicheck.py [out.png]
Requires Playwright + local Chrome (channel="chrome").
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "shot.png").resolve()
URL = "http://127.0.0.1:8787/?autorun=1"


def main():
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1480, "height": 940}, device_scale_factor=1.5)
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(1200)
        # 等运行结束（最多 30s）
        for _ in range(60):
            txt = page.inner_text("#kv-state")
            if txt in ("completed", "stopped", "failed"):
                break
            page.wait_for_timeout(500)
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT), full_page=False)
        stats = {
            "state": page.inner_text("#kv-state"),
            "events": page.inner_text("#evcount"),
            "iters": page.inner_text("#itercount"),
            "rollback": page.inner_text("#kv-rollback"),
            "btn_disabled": {
                "start": page.is_disabled("#start"),
                "stop": page.is_disabled("#stop"),
                "resume": page.is_disabled("#resume"),
            },
        }
        browser.close()
    print("screenshot:", OUT)
    print("stats:", stats)
    print("errors:", errors or "none")


if __name__ == "__main__":
    main()
