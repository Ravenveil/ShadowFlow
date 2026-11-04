"""前后端对齐走查（静态）：前端调的接口后端是否都有，后端的能力前端是否漏接。

用法：
    python tools/aligncheck.py

不需要起服务，纯静态比对，秒级出结果，适合每次改完页面顺手跑一次。
结论分三类：
  1. 前端调了但后端没有  —— 严重，点下去就 404 / 白屏
  2. 后端有但前端没调    —— 分两种：INTERNAL 里是运维/机器接口（正常），
                            其余属于「能力做了但没人用」，需人工判断是否补界面
  3. 数量对照            —— 只做观察，不追求相等

退出码：0 通过；1 有第 1 类问题。
"""

import glob
import os
import re
import sys
from pathlib import Path

ROOT = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 明确不需要界面的接口：运维、机器对接、第三方回调
INTERNAL = {
    "/api/meta",            # 契约清单，给联调脚本看
    "/api/ops/status",      # 运维体检
    "/api/ops/recover",     # 运维补位
    "/api/pay/notify",      # 支付回调，第三方打进来的
    "/api/health",
}


def norm(path):
    """把 /api/orders/${id} 之类的写法收敛成 /api/orders/{}，便于比对。"""
    p = re.sub(r"<[^>]*>", "{}", path)   # 文档里写 <id>
    p = re.sub(r"\$\{[^}]*\}", "{}", p)  # 页面里写 ${id}
    p = re.sub(r"\{[^}]*\}", "{}", p)    # 路由里写 {id}
    return p.rstrip("/")


def routes():
    out = set()
    for f in glob.glob(os.path.join(ROOT, "app", "*.py")):
        for line in open(f, encoding="utf-8"):
            m = re.search(r'@app\.(?:get|post|put|delete|patch)\("([^"]+)"', line)
            if m:
                out.add(norm(m.group(1)))
    return out


def calls():
    """扫静态页面里出现的接口路径（fetch / EventSource / 模板字符串都算）。"""
    out = {}
    for f in glob.glob(os.path.join(ROOT, "app", "static", "*.html")):
        txt = open(f, encoding="utf-8").read()
        for m in re.finditer(r"""['\"`](/api/[^'\"`?#\s]*)""", txt):
            out.setdefault(norm(m.group(1)), set()).add(os.path.basename(f))
    return out


def port_check():
    """文档/脚本里写的端口必须跟 config.PORT 一致，否则照着文档做会连不上。"""
    cfg = (ROOT / "app" / "config.py").read_text(encoding="utf-8")
    want = re.search(r'SF_PORT",\s*"(\d+)"', cfg)
    if not want:
        return None, []
    want = want.group(1)
    targets = [ROOT / "README.md"] + sorted((ROOT / "docs").glob("*.md")) + sorted((ROOT / "tools").glob("*.py"))
    bad = []
    for f in targets:
        for no, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            for m in re.finditer(r"127\.0\.0\.1:(\d+)", line):
                if m.group(1) != want:
                    bad.append((f.name, no, m.group(1)))
    return want, bad


def doc_check(route_set):
    """文档里写的接口必须真实存在，否则照文档联调会 404。"""
    seen = {}
    for f in [ROOT / "README.md"] + sorted((ROOT / "docs").glob("*.md")):
        for m in re.finditer(r"(/api/[A-Za-z0-9_/{}$<>.-]+)", f.read_text(encoding="utf-8")):
            p = norm(m.group(1)).rstrip(">.,);")
            if len(p) > 8 and "..." not in p:
                seen.setdefault(p, set()).add(f.name)
    return sorted(
        (p, sorted(s)) for p, s in seen.items()
        if not covered(p, route_set)
    )


def freshness(route_set, internal):
    """继续开发时的文档欠账：新接口没写进文档、版本号没登记。"""
    doc_files = [ROOT / "README.md"] + sorted((ROOT / "docs").glob("*.md"))
    doc_paths = set()
    all_text = ""
    for f in doc_files:
        txt = f.read_text(encoding="utf-8")
        all_text += txt
        for m in re.finditer(r"(/api/[A-Za-z0-9_/{}$<>.-]+)", txt):
            doc_paths.add(norm(m.group(1)).rstrip(">.,);"))

    undocumented = sorted(
        p for p in route_set
        if p.startswith("/api") and p not in internal
        and not any(p == d or p.startswith(d + "/") or d.startswith(p + "/") for d in doc_paths)
    )

    ver = re.search(r'CONTRACT_VERSION\s*=\s*"([\d.]+)"', (ROOT / "app" / "contract.py").read_text(encoding="utf-8"))
    contract_bad = bool(ver and f"| {ver.group(1)} |" not in all_text)
    app = re.search(r'APP_VERSION\s*=\s*"([\d.]+)"', (ROOT / "app" / "config.py").read_text(encoding="utf-8"))
    app_bad = bool(app and f"v{app.group(1)}" not in (ROOT / "README.md").read_text(encoding="utf-8"))
    return undocumented, ver.group(1) if ver else "?", contract_bad, app.group(1) if app else "?", app_bad


def covered(path, r):
    """前端常写 api('/api/orders/' + id)，静态扫到的是前缀，也算已覆盖。"""
    return path in r or any(x.startswith(path + "/") for x in r)


def main():
    r, c = routes(), calls()
    ghost = sorted((p, sorted(s)) for p, s in c.items() if not covered(p, r))
    hit = {p for p in c if covered(p, r)}
    idle = sorted(
        x for x in r
        if x.startswith("/api") and not any(x == h or x.startswith(h + "/") for h in hit)
    )

    print(f"后端路由 {len(r)} 个，前端引用 {len(c)} 个\n")

    print("① 前端调了但后端没有：")
    if ghost:
        for p, files in ghost:
            print(f"   [404] {p:<40} 出现于 {', '.join(files)}")
    else:
        print("   无（前端不会点到不存在的接口）")

    print("\n② 后端有但前端没调：")
    if idle:
        for p in idle:
            tag = "内部接口，正常" if p in INTERNAL else "未接界面，待判断"
            print(f"   [{tag}] {p}")
    else:
        print("   无")

    want, mism = port_check()
    print(f"\n③ 文档 / 脚本里的端口（以 config.PORT = {want} 为准）：")
    if mism:
        for name, no, found in mism:
            print(f"   [不一致] {name}:{no} 写着 {found}，应为 {want}")
    else:
        print("   全部一致（照文档复制命令不会连不上服务）")

    stale = doc_check(r)
    print("\n④ 文档里写的接口是否都还在：")
    if stale:
        for p, names in stale:
            print(f"   [已失效] {p:<40} 出现于 {', '.join(names)}")
    else:
        print("   全部命中（照文档联调不会 404）")

    undoc, cv, cb, av, ab = freshness(r, INTERNAL)
    print(f"\n⑤ 继续开发时的文档欠账（契约 {cv} / 应用 v{av}）：")
    if undoc:
        for p in undoc:
            print(f"   [新接口未收录] {p} —— 补进 docs/API.md")
    if cb:
        print(f"   [契约未登记] {cv} 不在「接口对接说明」的变更记录表里")
    if ab:
        print(f"   [版本未登记] README 里没有 v{av} 的说明")
    if not (undoc or cb or ab):
        print("   无欠账（改了接口/版本，文档都跟上了）")

    print("\n结论：不追求数量相等，只要求「用户能点的都有接口、接口都在、文档没说错」。")
    return 1 if (ghost or mism or stale or undoc or cb or ab) else 0


if __name__ == "__main__":
    sys.exit(main())
