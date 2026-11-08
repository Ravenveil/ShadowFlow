"""提交材料 6 · 营业日志与经营流水 —— 一键导出（可重复执行）。

用法：
    python 导出脚本-export_evidence.py [数据目录=.evidence-run/.shadowflow] [API基址=http://127.0.0.1:8130]

从 ShadowFlow（Node 线）的 .shadowflow 数据目录与只读证据接口导出：
  经营流水/  —— 账本、订单、访问、商品、概览、对账、首单溯源、证据报告、记分卡
  Agent运行日志/ —— 会话清单、逐会话事件时间线(CSV)、可读运行日志(MD)、产物样例、原始事件流
导出只读：不调模型、不改数据。金额单位：元（保留 2 位）。
"""
import csv
import datetime
import json
import os
import shutil
import sqlite3
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else
                       os.path.join(HERE, "..", ".evidence-run", ".shadowflow"))
API = (sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8130").rstrip("/")
DB = os.path.join(DATA, "app.sqlite")

LEDGER_DIR = os.path.join(HERE, "经营流水")
LOG_DIR = os.path.join(HERE, "Agent运行日志")
os.makedirs(LEDGER_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)


def ts_ms(v):
    """epoch ms -> 本地时间字符串；原样返回无法解析的值。"""
    if v in (None, "", 0):
        return ""
    try:
        return datetime.datetime.fromtimestamp(int(v) / 1000).strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, OSError, TypeError):
        return str(v)


def yuan(cents):
    try:
        return f"{int(cents) / 100:.2f}"
    except (ValueError, TypeError):
        return ""


def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"  写出 {os.path.relpath(path, HERE)} ({len(rows)} 行)")


def get_json(path):
    with urllib.request.urlopen(API + path, timeout=30) as resp:
        return json.loads(resp.read().decode())


def get_text(path):
    with urllib.request.urlopen(API + path, timeout=30) as resp:
        return resp.read().decode("utf-8")


con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row

# ───────────────────────── 经营流水 ─────────────────────────
print("【经营流水】")

rows = con.execute("SELECT * FROM mb_ledger ORDER BY created_at").fetchall()
write_csv(os.path.join(LEDGER_DIR, "01-经营流水-ledger.csv"),
          ["记账时间", "类型", "金额(元)", "订单ID", "追踪ID"],
          [[ts_ms(r["created_at"]), r["kind"], yuan(r["amount_cents"]), r["order_id"], r["trace_id"]] for r in rows])

prod_name = {r["id"]: r["name"] for r in con.execute("SELECT id, name FROM mb_products")}
rows = con.execute("SELECT * FROM mb_orders ORDER BY created_at").fetchall()
write_csv(os.path.join(LEDGER_DIR, "02-订单明细-orders.csv"),
          ["下单时间", "支付时间", "订单ID", "商品", "售价(元)", "成本(元)", "状态", "支付流水号", "追踪ID"],
          [[ts_ms(r["created_at"]), ts_ms(r["paid_at"]), r["id"], prod_name.get(r["product_id"], r["product_id"]),
            yuan(r["amount_cents"]), yuan(r["cost_cents"]), r["status"], r["pay_txn_id"], r["trace_id"]] for r in rows])

rows = con.execute("SELECT * FROM mb_visits ORDER BY created_at").fetchall()
write_csv(os.path.join(LEDGER_DIR, "03-访问与复购-visits.csv"),
          ["访问时间", "访客ID", "渠道", "是否转化", "订单ID", "追踪ID"],
          [[ts_ms(r["created_at"]), r["visitor_id"], r["channel"], "是" if r["converted"] else "否",
            r["order_id"], r["trace_id"]] for r in rows])

rows = con.execute("SELECT * FROM mb_products ORDER BY created_at").fetchall()
write_csv(os.path.join(LEDGER_DIR, "04-商品成本-products.csv"),
          ["上架时间", "商品ID", "名称", "售价(元)", "成本(元)"],
          [[ts_ms(r["created_at"]), r["id"], r["name"], yuan(r["price_cents"]), yuan(r["cost_cents"])] for r in rows])

for fname, path in [("05-经营概览-overview.json", "/api/merchant/overview"),
                    ("06-对账结果-reconcile.json", "/api/merchant/reconcile"),
                    ("07-首单溯源-first-order.json", "/api/merchant/first-order")]:
    with open(os.path.join(LEDGER_DIR, fname), "w", encoding="utf-8") as f:
        json.dump(get_json(path), f, ensure_ascii=False, indent=2)
    print(f"  写出 经营流水/{fname}")

for fname, path in [("08-证据报告-evidence.md", "/api/merchant/evidence.md"),
                    ("09-记分卡-scorecard.md", "/api/merchant/evidence/scorecard.md"),
                    ("10-平台导出-orders.csv", "/api/merchant/evidence/orders.csv")]:
    with open(os.path.join(LEDGER_DIR, fname), "w", encoding="utf-8-sig") as f:
        f.write(get_text(path))
    print(f"  写出 经营流水/{fname}")

# ───────────────────────── Agent 运行日志 ─────────────────────────
print("【Agent 运行日志】")

runs = con.execute("SELECT * FROM runs ORDER BY created_at").fetchall()
write_csv(os.path.join(LOG_DIR, "01-运行会话清单.csv"),
          ["会话ID", "运行ID", "项目ID", "目标", "技能", "产物", "状态", "开始时间", "完成时间", "项目目录"],
          [[r["session_id"], r["run_id"], r["project_id"], r["goal"], r["skill_display_name"] or r["skill_name"],
            r["artifact_filename"], r["status"], ts_ms(r["created_at"]), ts_ms(r["completed_at"]), r["project_dir"]]
           for r in runs])

KEY_EVENTS = {"classify": "意图分类", "compose": "上下文组装", "assemble": "管线步骤", "node": "团队节点",
              "edge": "协作边", "agent-persona": "角色设定", "agent-substep": "员工装配",
              "plan_card": "计划卡", "blueprint": "阶段产物", "artifact": "产物", "complete": "完成",
              "critique-result": "质检评审", "thinking-chunk": "思考"}


def event_summary(ev, data):
    if ev == "classify":
        return f"分类为 {data.get('output_type')}/{data.get('mode')} 置信 {data.get('confidence')}"
    if ev == "assemble":
        return f"步骤「{data.get('step')}」{data.get('status')}（耗时 {data.get('elapsed_ms')}ms）"
    if ev == "agent-substep":
        return f"{data.get('node_id')} 装配 {data.get('substep')} {data.get('status')}" + \
               (f"（tokens {data.get('tokens')}）" if data.get("tokens") else "")
    if ev == "node":
        return f"{data.get('node_id')} {data.get('title')}（{data.get('sub')}）"
    if ev == "blueprint":
        head = str(data.get("yaml", ""))[:60].replace("\n", " ")
        return f"产物: {head}…"
    if ev == "message" and data.get("kind") == "plan_card":
        tasks = data.get("tasks") or data.get("content", {}).get("tasks") or []
        return f"计划卡：{len(tasks)} 个任务行"
    if ev == "complete":
        return f"会话完成 run_id={data.get('run_id')}"
    return json.dumps(data, ensure_ascii=False)[:100]


for r in runs:
    sid = r["session_id"]
    fpath = os.path.join(DATA, "runs", f"{sid}.json")
    if not os.path.exists(fpath):
        continue
    raw = json.load(open(fpath, encoding="utf-8"))
    events = raw.get("events", [])
    short = sid[:8]

    write_csv(os.path.join(LOG_DIR, f"02-运行事件时间线-{short}.csv"),
              ["序号", "时间", "事件", "含义", "摘要"],
              [[e.get("id"), ts_ms(e.get("ts")), e.get("event"),
                KEY_EVENTS.get(e.get("event"), ""), event_summary(e.get("event"), e.get("data") or {})]
               for e in events])

    shutil.copyfile(fpath, os.path.join(LOG_DIR, f"05-事件流原始-{short}.json"))

    # 可读运行日志 MD
    lines = [f"# Agent 运行日志 · 会话 {sid}", "",
             f"- 目标（Brief）：{r['goal']}",
             f"- 状态：{r['status']}　开始：{ts_ms(r['created_at'])}　完成：{ts_ms(r['completed_at'])}",
             f"- 技能：{r['skill_display_name'] or r['skill_name']}　产物：{r['artifact_filename']}",
             f"- 事件总数：{len(events)}（完整原始流见 05-事件流原始-{short}.json）", "",
             "## 关键时间线", "", "| 时间 | 事件 | 摘要 |", "|---|---|---|"]
    for e in events:
        if e.get("event") in KEY_EVENTS and e.get("event") != "thinking-chunk":
            summary = event_summary(e.get("event"), e.get("data") or {}).replace("|", "\\|")
            lines.append(f"| {ts_ms(e.get('ts'))} | {KEY_EVENTS[e['event']]} | {summary} |")
    with open(os.path.join(LOG_DIR, f"03-运行日志-{short}.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"  写出 Agent运行日志/03-运行日志-{short}.md（事件 {len(events)} 条）")

    # 产物样例（project_dir 相对服务 cwd，即数据目录的上一级）
    src = r["project_dir"]
    if src and not os.path.isabs(src):
        src = os.path.join(os.path.dirname(DATA), src)
    if src and os.path.isdir(src):
        dst = os.path.join(LOG_DIR, f"04-产物-{short}")
        os.makedirs(dst, exist_ok=True)
        for g in os.listdir(src):
            gp = os.path.join(src, g)
            if os.path.isfile(gp):
                shutil.copyfile(gp, os.path.join(dst, g))
            elif os.path.isdir(gp):
                shutil.copytree(gp, os.path.join(dst, g), dirs_exist_ok=True)
        print(f"  写出 Agent运行日志/04-产物-{short}/")

con.close()
print("\n导出完成。")
