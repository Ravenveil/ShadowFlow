"""LLM provider abstraction.

Two modes, switchable by environment, so the demo never dies on stage:
  live       — any OpenAI-compatible endpoint (SF_LLM_BASE_URL / SF_LLM_API_KEY / SF_LLM_MODEL)
  simulated  — deterministic role-aware generator (default), zero network, stable timing

The engine above this layer does not care which mode is active; it only consumes text
(or JSON when the role contract asks for it). That is what keeps "多智能体协作稳定输出" true
for front-end rehearsal.
"""

import json
import re
import time
import urllib.error
import urllib.request

from .config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_TEMPERATURE, LLM_TIMEOUT

LIVE = bool(LLM_BASE_URL and LLM_API_KEY)

# 最近一次调用的结果。给 /api/health 和 tools/llmcheck.py 用：
# 「配了 key 但一直失败」和「压根没配 key」是两回事，必须能一眼分清。
LAST = {"ok": None, "mode": None, "model": None, "latency_ms": None, "error": None, "at": None}
RETRIES = 2


def _mark(ok, mode_, latency_ms, error=None):
    LAST.update(
        {
            "ok": ok,
            "mode": mode_,
            "model": LLM_MODEL if LIVE else None,
            "latency_ms": latency_ms,
            "error": error,
            "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
    )


def _dedup_heading(text):
    """去掉重复标题：【回头查一遍】回头查一遍 -> 【回头查一遍】。"""
    return re.sub(r"【([^】]{2,10})】\1", r"【\1】", text or "")


def mode():
    return "live" if LIVE else "simulated"


def info():
    return {
        "mode": mode(),
        "model": LLM_MODEL if LIVE else "shadowflow-simulator-v1",
        "base_url": LLM_BASE_URL or None,
        "configured": LIVE,
        "note": "接入真实模型（OpenAI 兼容）" if LIVE else "未配置 API Key：使用确定性模拟器，保证演示链路稳定可复现",
        "last": dict(LAST),
    }


def status():
    """最近一次调用状态，供 /api/health 或自检脚本直接读。"""
    return dict(LAST)


def complete(system, user, meta=None):
    """Return {"text", "mode", "latency_ms"}. Never raises."""
    meta = meta or {}
    started = time.time()
    if LIVE:
        try:
            text = _http_chat(system, user)
            ms = int((time.time() - started) * 1000)
            _mark(True, "live", ms)
            return {"text": _dedup_heading(text), "mode": "live", "latency_ms": ms}
        except Exception as exc:  # noqa: BLE001 - degrade, never break the run
            ms = int((time.time() - started) * 1000)
            err = f"{type(exc).__name__}: {exc}"
            _mark(False, "simulated(fallback)", ms, err)
            fallback = _simulate(meta)
            return {
                "text": _dedup_heading(fallback),
                "mode": "simulated(fallback)",
                "latency_ms": ms,
                "error": err,
            }
    ms = int((time.time() - started) * 1000)
    _mark(None, "simulated", ms)
    return {"text": _dedup_heading(_simulate(meta)), "mode": "simulated", "latency_ms": ms}


def _chat_url():
    """把常见填法统一成 `.../chat/completions`。

    兼容三种写法，避免「地址少写 /v1 就 404」这种坑：
      https://api.deepseek.com          -> 补 /v1/chat/completions
      https://api.openai.com/v1         -> 直接接 /chat/completions
      https://x.com/v1/chat/completions -> 原样使用
    """
    base = (LLM_BASE_URL or "").rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    if not re.search(r"/v\d+$", base):
        base += "/v1"
    return base + "/chat/completions"


def _http_chat(system, user):
    body = {
        "model": LLM_MODEL,
        "temperature": LLM_TEMPERATURE,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    data = json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {LLM_API_KEY}"}
    url = _chat_url()
    last_exc = None
    for attempt in range(RETRIES + 1):
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=LLM_TIMEOUT) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            return payload["choices"][0]["message"]["content"].strip()
        except urllib.error.HTTPError as exc:
            last_exc = exc
            # 400/401/403/404 是配置或参数错，重试只会拖慢，直接抛
            if exc.code in (400, 401, 403, 404):
                break
        except Exception as exc:  # noqa: BLE001 - 网络抖动/超时才值得重试
            last_exc = exc
        if attempt < RETRIES:
            time.sleep(0.8 * (attempt + 1))
    raise last_exc


# ------------------------------------------------------------------ simulator

def _cites(kb_hits, n=2):
    return [h["title"] for h in (kb_hits or [])[:n]]


def _svc_kind(meta):
    """把服务归成三类，供岗位话术分支。

    优先认 service_id（svc_compliance / svc_content / svc_landing_sel），
    其次才看服务名里的关键词 —— 名字是给人看的，随时会改，不能当唯一依据。
    """
    hay = f"{meta.get('service') or ''} {(meta.get('service_id') or '').lower()}"
    if any(k in hay for k in ("合规", "体检", "上架", "预审", "compliance")):
        return "合规"
    if any(k in hay for k in ("内容", "文案", "推广", "种草", "content")):
        return "内容"
    return "选品"


def _simulate(meta):
    """确定性生成：不联网、不编造市场数字，只产出该岗位的作业稿。

    三条原则：
      1) 只引用真实输入（项目目标、客户、任务要求），不自造行业结论；
      2) 需要数据的地方写清「查什么、从哪查」，由人去核实后填入；
      3) 同一输入同一输出，保证演示可复现、可对比。
    """
    role = meta.get("role", "writer")
    task = (meta.get("task") or "本次经营任务").strip().replace("\n", " ")
    project = (meta.get("project") or "").strip()
    goal = (meta.get("goal") or "").strip().replace("\n", " ")
    client = (meta.get("client") or "").strip()
    kb = meta.get("kb") or []
    rnd = int(meta.get("round", 1) or 1)
    feedback = meta.get("feedback") or ""
    task_short = task[:38]
    focus = (goal or task)[:110]
    cites = _cites(kb, 3)
    cite_line = "、".join(cites) if cites else "（知识库里没有对得上的条目，建议先补本行业资料）"
    who = f"｜客户：{client}" if client and client not in project else ""
    ctx = f"项目：{project or task_short}{who}\n这次要解决的事：{focus}"

    # ---- 旧版引擎团队（无公司时的回退路径）----

    if role == "researcher":
        return (
            f"【要查的资料 · 第 {rnd} 轮】\n{ctx}\n"
            f"1. 需求：查目标市场近 12 个月的搜索量和销量，看是在涨还是在跌。"
            f"（从哪查：平台关键词工具、行业月报）\n"
            f"2. 供给：看同样的东西在卖的有多少家、前 10 名占了多少销量，判断是太挤还是有空位。\n"
            f"3. 价格：把卖得最好的 20 家价格排一排，看主流价在哪、哪个价位没人做。\n"
            f"4. 风险：要不要许可证、要什么认证、会不会侵权，先列出来交给合规岗确认。\n"
            f"参考：{cite_line}\n"
            f"注：以上是待查清单，数字核实后才能当结论用，没核实的不能直接拿去报价。"
        )

    if role == "strategist":
        return (
            f"【定方向】\n{ctx}\n"
            f"· 主推三个：每个写清卖给谁、凭什么选它、另外几个为什么不做。\n"
            f"· 拿什么比：到货快 / 资质全 / 组合装 / 售后好，只主打一个，其余当支撑。\n"
            f"· 怎么试：先小批量卖，卖得动再加量，卖不动就换。\n"
            f"· 判断标准：每个方向写清「加到多少算成、到什么程度就放弃」。\n"
            f"参考：{cite_line}"
        )

    if role == "writer":
        revise = f"【已按上游意见改过】{feedback[:70]}…\n" if feedback else ""
        tone = {1: "初稿", 2: "二稿", 3: "定稿"}.get(min(rnd, 3), "精修稿")
        return (
            f"{revise}【写文案 · {tone} / 第 {rnd} 轮】\n{ctx}\n"
            f"标题 A（讲痛点）：把「{focus[:16]}」这件事，拆成能照着做的几步\n"
            f"标题 B（讲结果）：同样的钱，为什么有人更快出了第一单\n"
            f"正文顺序：客户现在什么处境 → 常犯的错 → 我们怎么做 → 能看到的结果 → 下一步做什么\n"
            f"短句：一句话说清好处 + 一个具体动作 + 一个能核对的数字\n"
            f"参考：{cite_line}"
        )

    # ---- OPC OS 岗位（公司层的九个数字员工）----

    if role == "chief_of_staff":
        svc = _svc_kind(meta)
        if "合规" in svc:
            chain = "定范围 → 查能不能卖 → 查广告词 → 改稿（同时做）→ 分轻重 → 出结论"
            budget = "按 7 件事分摊，最花时间的是查能不能卖 → 查广告词 → 分轻重"
        elif "内容" in svc:
            chain = "定目标 → 挑卖点 → 定说法 → 文案和配图（同时做）→ 审稿 → 发前检查"
            budget = "按 7 件事分摊，最花时间的是挑卖点 → 定说法 → 写文案 → 审稿"
        else:
            chain = "拆任务 → 查市场 → 定主推 → 文案和主图（同时做）→ 算账 → 第一单计划 → 复查 → 查合规"
            budget = "按 9 件事分摊，最花时间的是查市场 → 定主推 → 算账 → 第一单计划"
        return (
            f"【干活计划】\n{ctx}\n"
            f"一、分几步：{chain}\n"
            f"二、谁来做：调研岗负责查资料和记出处，策略岗定方向，创意岗写文案做图，"
            f"数据岗算账，客户岗写执行清单\n"
            f"三、哪里要停：对外发的东西要老板先看过；风险高的结论要合规复查；超预算要重新报批\n"
            f"四、怎么算合格：每一步交出来的东西都要写出处，没出处的不往下传\n"
            f"五、时间：{budget}"
        )

    if role == "market_researcher":
        svc = _svc_kind(meta)
        if "合规" in svc:
            block = (
                "1. 能不能卖：这个品类在当地是不是要许可证或备案，要哪些证书、检测报告。\n"
                "2. 包装上写什么：产地、成分、警示语、认证标志，以及对语言的要求。\n"
                "3. 平台让不让卖：查禁售和限售清单，看有没有撞上。\n"
                "4. 办证多久：各项资质的办理时间和有效期，倒推什么时候开始办。\n"
                "从哪查：海关和市场监管的公告、平台规则页；每条注明文号和生效日期。"
            )
        elif "内容" in svc:
            block = (
                "1. 产品事实：列出能核对的东西（材质、尺寸、做工、售后），不写形容词。\n"
                "2. 能用的卖点：从这些事实里挑 3 个拍得出来、比得出来的。\n"
                "3. 谁会买：每个卖点对应什么场景、解决什么具体麻烦。\n"
                "4. 不能说的话：没法证明的效果、绝对化用词、暗示治病或保健。\n"
                "从哪查：检测报告、详情页参数、真实买家评价（注明看了多少条）。"
            )
        else:
            block = (
                "1. 需求：查近 12 个月搜索量和销量的走势，标清数据是哪个月的。\n"
                "2. 供给：看同类在卖的有多少家、前 10 名占多少销量，判断是太挤还是有机会。\n"
                "3. 价格：把销量前 20 名的价格排开，划出主流价位和没人做的价位。\n"
                "4. 风险：要不要资质、要什么认证、哪里容易侵权，列成待确认清单。\n"
                "从哪查：平台关键词工具 / 行业月报 / 海关数据；每条写清怎么算的、哪段时间。"
            )
        return f"【先查资料】{task_short}\n{ctx}\n{block}\n参考：{cite_line}"

    if role == "brand_strategist":
        svc = _svc_kind(meta)
        if "合规" in svc:
            block = (
                "· 绝对化用词：最、第一、唯一、100%，逐条挑出来，给出能替换的说法。\n"
                "· 效果承诺：涉及效果、疗效、安全性的说法，有没有依据、有没有写清适用条件。\n"
                "· 跟别人比：和竞品对比有没有可查的来源，没有就删掉。\n"
                "· 该加的声明：缺哪些声明，放在哪（首屏还是详情页最后）。"
            )
        elif "内容" in svc:
            block = (
                "· 三个角度：场景共鸣 / 前后对比 / 反常识，各写清适合发在哪。\n"
                "· 核心一句话：必须能用产品事实撑住，不能是空口号。\n"
                "· 让人记住：一个能反复用的画面或说法，各平台保持一致。\n"
                "· 不讨好谁：说清这个角度不覆盖哪类人，别想打动所有人。"
            )
        else:
            block = (
                "· 主推方向：留 3 个，逐个写「卖给谁 / 凭什么 / 为什么不推」。\n"
                "· 让人记住：一句主张 + 一个能反复用的画面或说法。\n"
                "· 差异从哪来：到货快、资质全、组合装、售后好——只主打一个，其余当支撑。\n"
                "· 怎么验证：先小批量卖，定好加到多少算成、到什么程度放弃。"
            )
        return f"【定方向】{task_short}\n{ctx}\n{block}\n参考：{cite_line}"

    if role == "copywriter":
        svc = _svc_kind(meta)
        if "合规" in svc:
            block = (
                "· 改词对照表：原句 → 问题在哪 → 改成什么，一条一行，运营拿到就能改。\n"
                "· 高风险词：绝对化改成有条件的说法，效果承诺补上适用条件和例外。\n"
                "· 必须加上的：资质编号、产地成分、退换货和投诉入口。\n"
                "· 交付格式：表格，一列原文一列改后，附上改的依据。"
            )
        elif "内容" in svc:
            block = (
                "标题方向 1（场景共鸣）：第一句就写使用场景，让人对号入座。\n"
                "标题方向 2（前后对比）：用前后的差别代替形容词，别空夸。\n"
                "标题方向 3（反常识）：先给一个没想到的结论，再给依据。\n"
                "小红书版：场景痛点 → 用前用后 → 3 个能验证的卖点 → 价格 → 怎么买。\n"
                "抖音版：3 秒提问 → 演示动作 → 差异画面 → 口播收尾（多少钱、在哪买）。\n"
                "共同的底线：卖点要能验证；不写绝对化用词；说效果要带条件。"
            )
        else:
            block = (
                "标题 A（讲痛点）：别急着上架，先看这 3 个判断。\n"
                "标题 B（讲结果）：同样的钱，为什么有人 7 天就出了第一单。\n"
                "标题 C（做对比）：自己摸索和照着流程走，差在哪一步。\n"
                "详情页 5 条：使用场景 → 和别家不一样在哪 → 规格参数 → 发货与售后 → 注意事项。\n"
                "短句：一句话说清好处 + 一个具体动作 + 一个能核对的数字（数字等实测后填）。\n"
                "提醒：不写绝对化用词，说效果要带条件。"
            )
        return f"【写文案】{task_short}\n{ctx}\n{block}"

    if role == "visual_designer":
        return (
            f"【图和版式】{task_short}\n{ctx}\n"
            f"· 主图：产品占画面 60% 以上，左上放差异点，右下放规格；不放做出来的假效果图。\n"
            f"· 看的顺序：一句话主张（最大）→ 关键参数（次之）→ 资质标志（小但看得清）。\n"
            f"· 尺寸：按平台实际要求出图（主图 1:1、详情页宽 750/790），交之前再核一遍。\n"
            f"· 素材从哪来：优先自己拍；用图库要留授权凭证；字体只用能商用的。"
        )

    if role == "data_analyst":
        return (
            f"【算账、定价】{task_short}\n{ctx}\n"
            f"· 要算的钱：进价 + 运费（工厂到海外仓）+ 平台抽成 + 支付手续费 + 退货损耗 + 推广费。\n"
            f"· 不亏本的价 =（进价 + 运费 + 每件推广费）÷（1 − 平台抽成比例 − 退货率 − 想赚的净利率）。\n"
            f"· 卖多少钱：上限看同行主流价，下限是不亏本的价，中间按差异化程度取。\n"
            f"· 万一卖不动：算出卖价降 10%、退货翻倍两种情况，利润还剩多少。\n"
            f"· 数字标清楚：每个数字写上是「实测 / 问来的价 / 估的」，估的不能直接对外报价。"
        )

    if role == "account_manager":
        return (
            f"【第一单怎么做】{task_short}\n{ctx}\n"
            f"· 第 1–2 天：定下方向和预算，选 1–2 个款先试。\n"
            f"· 第 3–4 天：把上架要的东西备齐（文案、主图、详情页），资质材料归档。\n"
            f"· 第 5–7 天：小批量试卖，每天看点击和加购，卖得动就加投，卖不动就换款。\n"
            f"· 要客户拍板：备多少货、最长多久回本、售后怎么处理。\n"
            f"· 交什么：一张时间表 + 每天的跟进记录 + 做完的复盘。"
        )

    if role == "quality_reviewer":
        return (
            f"【回头查一遍】{task_short}\n{ctx}\n"
            f"· 有出处吗：每条市场结论有没有写来源和时间，没写的逐条退回。\n"
            f"· 算得对吗：该算的钱都算了吗，不亏本的价和卖价对得上吗。\n"
            f"· 能做吗：每个动作有没有人负责、有没有时间，换个人能不能照着做。\n"
            f"· 有没有含糊：是不是把「待确认」写成了「已确认」。\n"
            f"· 结论：上面四条有一条不满足就退回，并写清缺哪一条。"
        )

    if role == "compliance_officer":
        return (
            f"【上架前检查】{task_short}\n{ctx}\n"
            f"· 能不能卖：当地要不要强制认证、备案或经营资质，缺一项就不能上架。\n"
            f"· 广告词：有没有绝对化说法、有没有承诺疗效、有没有编出来的对比数据。\n"
            f"· 版权：图片、字体、商标有没有授权，会不会和别人的在先权利撞上。\n"
            f"· 个人信息：收集买家信息有没有说明用途，能不能撤回。\n"
            f"· 结论：按「能上架 / 改完能上架 / 不建议上架」三档给，附要改的清单和负责岗位。"
        )

    # ---- 通用角色 ----

    if role == "reviewer":
        base = 0.60 + 0.15 * (rnd - 1) + (0.30 if meta.get("external_feedback") else 0.0)
        score = round(min(base, 0.97), 2)
        issues = []
        if score < 0.85:
            issues = [
                "缺少能核对的数据来源，只有定性描述" if rnd == 1 else "引用还缺具体页码和统计时间",
                "动作清单没写谁负责、什么时候做",
            ]
        verdict = "pass" if score >= 0.85 else "revise"
        return json.dumps(
            {
                "score": score,
                "verdict": verdict,
                "issues": issues,
                "note": f"合格线 0.85，本轮得分 {score}，{'交给合规复查' if verdict == 'pass' else '退回重写'}",
            },
            ensure_ascii=False,
        )

    if role == "legal":
        reject = bool(meta.get("force_reject"))
        if reject:
            return json.dumps(
                {
                    "verdict": "REJECT",
                    "risks": ["广告词缺合规声明", "支付页没写清钱去哪了、怎么退"],
                    "required_changes": [
                        "在文案最后补上声明和资质说明",
                        "支付页写清钱去哪、多久退、有问题找谁",
                    ],
                },
                ensure_ascii=False,
            )
        return json.dumps(
            {
                "verdict": "APPROVE",
                "risks": ["低风险：广告词要留档备查"],
                "required_changes": [],
                "note": "第二轮复查通过，可以交付",
            },
            ensure_ascii=False,
        )

    if role == "delivery":
        return (
            f"【交付说明】{task_short}\n{ctx}\n"
            f"· 交了什么：分析结论 1 份、时间表 1 份、过程记录 1 组\n"
            f"· 质量：复查通过；标了「待确认」的单独列出，没有混进结论\n"
            f"· 下一步：照时间表做第一单，7 天后回头看，把真实数字填进去\n"
            f"参考：{cite_line}"
        )

    return f"【{role}】已处理：{task_short}（第 {rnd} 轮）"
