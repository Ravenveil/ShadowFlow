"""LLM provider abstraction.

Two modes, switchable by environment, so the demo never dies on stage:
  live       — any OpenAI-compatible endpoint (SF_LLM_BASE_URL / SF_LLM_API_KEY / SF_LLM_MODEL)
  simulated  — deterministic role-aware generator (default), zero network, stable timing

The engine above this layer does not care which mode is active; it only consumes text
(or JSON when the role contract asks for it). That is what keeps "多智能体协作稳定输出" true
for front-end rehearsal.
"""

import json
import time
import urllib.error
import urllib.request

from .config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_TEMPERATURE, LLM_TIMEOUT

LIVE = bool(LLM_BASE_URL and LLM_API_KEY)


def mode():
    return "live" if LIVE else "simulated"


def info():
    return {
        "mode": mode(),
        "model": LLM_MODEL if LIVE else "shadowflow-simulator-v1",
        "base_url": LLM_BASE_URL or None,
        "note": "接入真实模型（OpenAI 兼容）" if LIVE else "未配置 API Key：使用确定性模拟器，保证演示链路稳定可复现",
    }


def complete(system, user, meta=None):
    """Return {"text", "mode", "latency_ms"}. Never raises."""
    meta = meta or {}
    started = time.time()
    if LIVE:
        try:
            text = _http_chat(system, user)
            return {"text": text, "mode": "live", "latency_ms": int((time.time() - started) * 1000)}
        except Exception as exc:  # noqa: BLE001 - degrade, never break the run
            fallback = _simulate(meta)
            return {
                "text": fallback,
                "mode": "simulated(fallback)",
                "latency_ms": int((time.time() - started) * 1000),
                "error": f"{type(exc).__name__}: {exc}",
            }
    return {"text": _simulate(meta), "mode": "simulated", "latency_ms": int((time.time() - started) * 1000)}


def _http_chat(system, user):
    body = {
        "model": LLM_MODEL,
        "temperature": LLM_TEMPERATURE,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    req = urllib.request.Request(
        f"{LLM_BASE_URL}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {LLM_API_KEY}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=LLM_TIMEOUT) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload["choices"][0]["message"]["content"].strip()


# ------------------------------------------------------------------ simulator

def _cites(kb_hits, n=2):
    return [h["title"] for h in (kb_hits or [])[:n]]


def _simulate(meta):
    role = meta.get("role", "writer")
    task = meta.get("task", "本次经营任务")
    kb = meta.get("kb") or []
    rnd = int(meta.get("round", 1) or 1)
    feedback = meta.get("feedback") or ""
    task_short = task.strip().replace("\n", " ")[:38]

    if role == "researcher":
        cites = _cites(kb, 3)
        return (
            f"【情报侦察 · 第 {rnd} 轮】目标：{task_short}\n"
            f"1. 市场面：东南亚跨境轻小件需求连续两个季度上行，客单价集中在 79–199 元区间。\n"
            f"2. 供给面：同类供给同质化严重，差异点主要在交付时效与内容种草质量。\n"
            f"3. 风险面：平台合规与虚拟支付资质是硬门槛，需法务前置确认。\n"
            f"引用词条：{'、'.join(cites) if cites else '（知识库未命中，建议先补词条）'}"
        )

    if role == "strategist":
        cites = _cites(kb, 2)
        return (
            f"【策略定盘】围绕「{task_short}」收敛为三条打法：\n"
            f"· 定位：轻决策、高频复购的出海选品，以「一单品一场景」切入。\n"
            f"· 路径：情报 → 选品 → 内容种草 → 转化 → 复购，各环节由独立 Agent 承担并留痕。\n"
            f"· 验收：每轮产出需带可核查证据，未达阈值不放行到法务。\n"
            f"依据词条：{'、'.join(cites) if cites else '（无命中）'}"
        )

    if role == "writer":
        revise = f"【已按上游意见修订】{feedback[:70]}…\n" if feedback else ""
        tone = {1: "初稿", 2: "二稿", 3: "定稿"}.get(min(rnd, 3), "精修稿")
        cites = _cites(kb, 2)
        return (
            f"{revise}【内容撰写 · {tone} / 第 {rnd} 轮】主题：{task_short}\n"
            f"标题：这个出海小单品，把「{task_short[:12]}」做成了可复制的生意\n"
            f"正文：我们拆了 3 个同类案例，发现真正的差别不在货，而在交付链路——"
            f"谁能把「选品验证 → 内容种草 → 首单转化」压进 7 天，谁就先拿到复购。"
            f"这篇给出可落地的四步动作清单，以及每步的验收标准。\n"
            f"标签：#跨境出海 #选品方法 #AI团队协作\n"
            f"引用：{'、'.join(cites) if cites else '（无命中词条）'}"
        )

    if role == "reviewer":
        # converges over rounds; a revision pass carrying an upstream rejection jumps straight to pass
        base = 0.60 + 0.15 * (rnd - 1) + (0.30 if meta.get("external_feedback") else 0.0)
        score = round(min(base, 0.97), 2)
        issues = []
        if score < 0.85:
            issues = [
                "缺少可核验的数据来源，论据停留在定性描述" if rnd == 1 else "引用仍缺具体页码/时间口径",
                "动作清单未标注负责人与时间窗",
            ]
        verdict = "pass" if score >= 0.85 else "revise"
        return json.dumps(
            {
                "score": score,
                "verdict": verdict,
                "issues": issues,
                "note": f"阈值为 0.85，本轮得分 {score}，{'放行至合规审核' if verdict == 'pass' else '退回重写'}",
            },
            ensure_ascii=False,
        )

    if role == "legal":
        reject = bool(meta.get("force_reject"))
        if reject:
            return json.dumps(
                {
                    "verdict": "REJECT",
                    "risks": ["跨境宣传用语缺乏合规声明", "虚拟支付环节未标注资金流向与退款口径"],
                    "required_changes": [
                        "在文案尾部补充合规声明与资质说明",
                        "支付环节写明资金流向、退款时效与争议处理入口",
                    ],
                },
                ensure_ascii=False,
            )
        return json.dumps(
            {
                "verdict": "APPROVE",
                "risks": ["低风险：宣传用语需持续留档"],
                "required_changes": [],
                "note": "二轮复核通过，可交付",
            },
            ensure_ascii=False,
        )

    if role == "delivery":
        cites = _cites(kb, 1)
        return (
            f"【交付汇总】任务「{task_short}」已完成：\n"
            f"· 交付物：内容定稿 1 份（含合规声明）、策略卡 1 张、证据链记录 1 组\n"
            f"· 质量：审校得分达标，法务二轮复核通过\n"
            f"· 下一步：进入交易平台上架，转入虚拟支付首单彩排\n"
            f"依据：{'、'.join(cites) if cites else '（无命中）'}"
        )

    # ---- OPC OS 岗位（公司层的九个数字员工）----

    if role == "chief_of_staff":
        return (
            f"【项目执行计划】目标：{task_short}\n"
            f"一、拆解：市场研究 → 品牌策略 → 内容与视觉（并行）→ 转化分析 → 客户跟进 → 验收\n"
            f"二、分工：市场研究部出客群与竞品，品牌部定调性，创意部出文案与物料，客户部负责触达\n"
            f"三、关键卡点：对外物料发布前需老板审批；客户沟通口径需合规复核\n"
            f"四、验收标准：每个环节交付物必须含可核查依据，缺依据不进入下游\n"
            f"五、预算：按 6 个执行任务分摊，单任务成本上限 30 元"
        )

    if role == "market_researcher":
        cites = _cites(kb, 3)
        return (
            f"【市场研究报告】{task_short}\n"
            f"1. 客群：目标集中在 25–40 岁、本地生活半径 3 公里内，决策链短、复购依赖体验。\n"
            f"2. 竞品：同商圈 3 家同类门店，差异化主要落在「首次体验门槛」与「社群留存」。\n"
            f"3. 需求缺口：新店最大问题是开业首月无人知道，而非产品本身。\n"
            f"4. 可执行结论：以「到店体验券 + 社群裂变」作为首周主抓手，预算优先投本地生活平台。\n"
            f"引用：{'、'.join(cites) if cites else '（知识库未命中，建议补充本行业词条）'}"
        )

    if role == "brand_strategist":
        cites = _cites(kb, 2)
        return (
            f"【品牌营销方案】围绕「{task_short}」\n"
            f"· 定位：不是「又一家咖啡店」，而是「这条街的第三空间」——主打停留时长而非单品价格。\n"
            f"· 记忆点：一句主张 + 一个视觉符号（杯贴），让人一眼记住。\n"
            f"· 打法三段：首周造势（到店礼）→ 次周扩散（社群裂变）→ 三周沉淀（会员日）。\n"
            f"· 验收口径：7 天内新增可触达客户 50 人，其中到店转化不低于 30%。\n"
            f"依据：{'、'.join(cites) if cites else '（无命中词条）'}"
        )

    if role == "copywriter":
        return (
            f"【社媒内容包】{task_short}\n"
            f"标题 A：这条街终于有了一家可以坐一下午的咖啡店\n"
            f"标题 B：开业第一周，第二杯我们请\n"
            f"正文：我们没打算做最便宜的咖啡，只想做一个你愿意多待 20 分钟的地方。"
            f"本周到店出示这条消息，第二杯免费；带上一个朋友，两人都可领杯贴。\n"
            f"短文案（朋友圈）：新店开业｜第二杯免费｜带朋友来，杯贴可以收集\n"
            f"标签：#本地生活 #咖啡新店 #开业活动"
        )

    if role == "visual_designer":
        return (
            f"【视觉物料说明】{task_short}\n"
            f"· 主视觉：暖木色底 + 单色插画（一只马克杯 + 窗边座位），不用人像，降低拍摄成本。\n"
            f"· 尺寸：朋友圈 1080×1080 一张、门店立牌 A3 一张、杯贴 60mm 圆一张。\n"
            f"· 信息层级：主张（最大）→ 活动机制（次之）→ 地址与二维码（最小但不小于 20mm）。\n"
            f"· 交付格式：PNG + 可编辑源文件，字体使用免费商用字库，避免版权风险。"
        )

    if role == "data_analyst":
        return (
            f"【转化分析】{task_short}\n"
            f"· 漏斗：曝光 → 领取 → 到店 → 复购，当前预估转化分别为 12% / 45% / 22%。\n"
            f"· 瓶颈：领取到店之间流失最大，说明活动吸引力够、履约路径不顺。\n"
            f"· 归因：主要卡在「券的使用门槛表述不清」，而非价格。\n"
            f"· 建议：把使用条件压到一行字，并增加「到店即核销」提示；次周复测同一漏斗。"
        )

    if role == "account_manager":
        return (
            f"【客户跟进记录】{task_short}\n"
            f"· 客户画像：新开业单店，老板本人决策，关注首月客流而非长期品牌。\n"
            f"· 本次沟通：确认预算区间与可用档期，客户对「到店礼」形式认可，担心物料制作周期。\n"
            f"· 待确认：门店地址与营业时间、能否提供店内实拍、可否配合社群转发。\n"
            f"· 下一步：48 小时内给出物料清单与排期，签约后 3 天内交付首版。"
        )

    if role == "quality_reviewer":
        return (
            f"【质量复核】{task_short}\n"
            f"· 完整性：四项交付要素（客群、主张、物料、验收口径）齐全。\n"
            f"· 一致性：品牌主张与文案口径一致，未出现前后矛盾。\n"
            f"· 可执行性：动作均带时间窗与负责人，可落地。\n"
            f"· 结论：通过，建议补一条「活动结束后的留存动作」，否则客流会在第二周回落。"
        )

    if role == "compliance_officer":
        return (
            f"【合规审查】{task_short}\n"
            f"· 广告用语：未出现「最」「第一」等绝对化表述，符合要求。\n"
            f"· 价格表述：需明确活动期限与适用范围，避免构成误导。\n"
            f"· 个人信息：社群收集用户信息需告知用途，不得二次转让。\n"
            f"· 结论：有条件通过 —— 补充活动期限与信息使用说明后可对外发布。"
        )

    return f"【{role}】已处理任务：{task_short}（第 {rnd} 轮）"
