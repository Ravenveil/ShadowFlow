"""Token 实测脚本：从 10 个会话的事件流 JSON 中测量模型调用消耗。
两类数据：
  1) 管线记录值（agent-substep.tokens / message-patch thinking_finalize.tokens）——逐事件实测计数；
  2) 消息载荷字符数（message/thinking-chunk/text/step-artifact 的 text 字段）——真实文本量。
输出 UTF-8-BOM CSV 到指定目录。只读，不改数据。"""
import csv
import json
import os
import sys

RUNS_DIR = sys.argv[1] if len(sys.argv) > 1 else r"C:/Users/Terry Sun/Desktop/传输/.evidence-run/.shadowflow/runs"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else r"C:/Users/Terry Sun/Desktop/传输/提交材料8-成本与商业化分析"

rows = []
tot = {"recorded_substep": 0, "recorded_thinking": 0, "recorded_cached": 0, "payload_chars": 0, "events": 0}
for fn in sorted(os.listdir(RUNS_DIR)):
    if not fn.endswith(".json"):
        continue
    d = json.load(open(os.path.join(RUNS_DIR, fn), encoding="utf-8"))
    sid = d["id"]
    evs = d["events"]
    substep_t = 0
    cached_t = 0
    think_t = 0
    chars = 0
    substeps = 0
    llm_texts = 0
    for e in evs:
        name = e["event"]
        data = e.get("data", {})
        if name == "agent-substep":
            substeps += 1
            t = data.get("tokens", 0)
            substep_t += t
            if data.get("cached"):
                cached_t += t
        elif name == "message-patch" and data.get("op") == "thinking_finalize":
            think_t += data.get("tokens", 0)
        elif name in ("message", "thinking-chunk", "text", "step-artifact"):
            txt = data.get("text") or ""
            if isinstance(txt, str) and txt:
                chars += len(txt)
                llm_texts += 1
    rows.append({
        "会话ID": sid,
        "事件数": len(evs),
        "装配substep数": substeps,
        "记录Token-substep装配": substep_t,
        "其中缓存命中Token": cached_t,
        "记录Token-thinking": think_t,
        "记录Token-合计": substep_t + think_t,
        "文本条数": llm_texts,
        "文本载荷字符数": chars,
    })
    tot["recorded_substep"] += substep_t
    tot["recorded_thinking"] += think_t
    tot["recorded_cached"] += cached_t
    tot["payload_chars"] += chars
    tot["events"] += len(evs)

os.makedirs(OUT_DIR, exist_ok=True)
out = os.path.join(OUT_DIR, "token实测-按会话.csv")
with open(out, "w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)
    w.writerow({
        "会话ID": "合计", "事件数": tot["events"],
        "装配substep数": sum(r["装配substep数"] for r in rows),
        "记录Token-substep装配": tot["recorded_substep"],
        "其中缓存命中Token": tot["recorded_cached"],
        "记录Token-thinking": tot["recorded_thinking"],
        "记录Token-合计": tot["recorded_substep"] + tot["recorded_thinking"],
        "文本条数": sum(r["文本条数"] for r in rows),
        "文本载荷字符数": tot["payload_chars"],
    })
print(f"写出 {out}（{len(rows)} 会话 + 合计行）")
print(f"记录Token合计 {tot['recorded_substep'] + tot['recorded_thinking']}"
      f"（substep {tot['recorded_substep']} 其中缓存 {tot['recorded_cached']}，thinking {tot['recorded_thinking']}）")
print(f"文本载荷 {tot['payload_chars']} 字符")
