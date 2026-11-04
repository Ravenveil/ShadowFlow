"""交付自检：发货之前，机器先替老板挑一遍毛病。

为什么要有这一层：客户付了钱，看到的第一段文字就是这家公司的水平。
以前的链路是「任务全 done → 直接发货」，done 只代表流程走完，不代表东西能看。
这里加一道能算出来的闸门，四条硬指标，不打感情分：

  1. 分量   —— 字数够不够，也别忘了「是不是太长了」。客户要 500 字，给 7000 字
              同样是没按要求做：太短像没干活，太长等于把自己的活推给客户读。
              所以这一项看两头，客户说过的字数就按客户说的卡。
  2. 对题   —— 客户原话里的关键意思，交付里回应了没有。跑题是最贵的错误。
  3. 能照做 —— 有没有具体数字（价格、天数、数量、比例）。没有数字就只是感想。
  4. 有交代 —— 说清下一步先干什么，也说清哪里会踩坑。
  5. 形态   —— 客户点的是文案，就别交工作底稿。字数准、内容全，
              但通篇是「需求拆解 / 卖点分析 / 验收标准」，仍然是废品。
              这一项看的是「交付的标题里有没有一堆内部流程词」。

另外一道出街前的清洗：内部说法不能给客户看。
「引用词条：证据链 IterationRecord、Loop 循环引擎与 PDCA」这种句子，
是我们自己看的东西，客户只会觉得莫名其妙。这类句子在交付前直接摘掉，
能替换的换成大白话，摘了几处如实写进交付里。

四条都过才叫合格。有一条不过，不是硬发，而是回去补最弱的那一条；
补完还不合格，就如实写在交付里 —— 不假装合格，这本身也是交付质量的一部分。

设计约束：纯函数、无网络、无随机，同一个输入永远同一个分。可单测。
"""

import re

# 合格线：低于此分退回返工一次
PASS_SCORE = 62

# 评分口径的版本号。改打分规则（词表、权重、门槛、剥离规则）就把这个号往上抬，
# orders.backfill_quality() 会据此把历史交付全部重算一遍。
# 没有这个号的时候，每改一次口径就得手工补一次迁移（v0.4.4 补过 form，v0.4.7 又补一次），
# 忘一次就是「新单 100 分、老单 46 分」两套口径摆在同一个客户档案里。
RULES_VERSION = "q4"

# 中文虚词/代词不参与「对题」判断，否则任何文章都能蹭上分
STOP_CHARS = set(
    "的了我你他她它们要想做能可一个什么怎么这个那个就是还是但是因为所以如果然后"
    "帮我一下以及还有吗呢吧啊请把被让对给从到和与在是有没不也很都就才又再更最"
    "这那些自己为以于其上中下前后里外时候点种样件次元"
)

# 每项：key / 名称 / 权重 / 不过时给返工的指令
ITEMS = [
    ("topic", "对题", 30, "没有正面回应客户提的问题，先把客户原话里的诉求逐条答一遍"),
    ("actionable", "能照做", 25, "缺具体数字，补上价格、天数、数量、比例这类能直接照着做的信息"),
    ("volume", "分量", 25, "内容太薄，把结论写实：每一项给出具体做法和判断依据"),
    ("closing", "有交代", 20, "收尾要交代下一步先做什么，以及哪个环节容易踩坑"),
]

# 服务最低字数：内容类要成篇，体检类可以条目化
MIN_CHARS = {
    "svc_landing_sel": 520,
    "svc_compliance": 420,
    "svc_content": 480,
}
DEFAULT_MIN_CHARS = 450

# 没写篇幅要求时，交付超过「底线的这个倍数」也当作失控：
# 客户没说多少字，不等于愿意读一本小册子。
OVER_MULTIPLE = 6


def wanted_chars(requirement=""):
    """从客户原话里读出「要写多少字」。

    返回 {"low", "high", "text"}，读不出要求就返回 None。
    客户怎么说就怎么算，不替客户加码：
      「500 字左右」→ 350–750   「500 字」→ 400–650
      「不超过 300 字」→ ≤300    「至少 800 字」→ ≥800
      「500–800 字」→ 500–800
    """
    req = requirement or ""
    m = re.search(r"(\d{2,5})\s*[-–—~～至到]\s*(\d{2,5})\s*字", req)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        return {"low": min(a, b), "high": max(a, b), "text": m.group(0)}
    m = re.search(r"(?:不超过|不多于|最多|别超过|少于|控制在)\s*(\d{2,5})\s*字", req)
    if m:
        return {"low": None, "high": int(m.group(1)), "text": m.group(0)}
    m = re.search(r"(?:至少|不少于|不低于|最少)\s*(\d{2,5})\s*字", req)
    if m:
        return {"low": int(m.group(1)), "high": None, "text": m.group(0)}
    m = re.search(r"(\d{2,5})\s*字\s*(以内|以下|以上)", req)
    if m:
        n = int(m.group(1))
        if m.group(2) == "以上":
            return {"low": n, "high": None, "text": m.group(0)}
        return {"low": None, "high": n, "text": m.group(0)}
    m = re.search(r"(\d{2,5})\s*字", req)
    if m:
        n = int(m.group(1))
        near = re.search(r"\d{2,5}\s*字\s*(?:左右|上下|上下浮动|差不多|的样子)", req)
        # 「左右」给宽一点，光秃秃一个数字按紧一点
        if near:
            return {"low": int(n * 0.7), "high": int(n * 1.5), "text": m.group(0)}
        return {"low": int(n * 0.8), "high": int(n * 1.3), "text": m.group(0)}
    return None

# ---- 形态贴合：客户要的是成品，不是我们内部的工作底稿 ----
# 为什么单拎一项：篇幅对了也可能给错东西。客户要 500 字文案，
# 收到的可以是「500 字的需求拆解 + 验收清单」，字数完美、全篇不是他要的。
# 这一项查的不是长度，是「这坨东西到底是不是客户点的那道菜」。
FORMS = {
    "copy": {"label": "文案", "kw": ("文案",)},
    "script": {"label": "脚本", "kw": ("脚本", "分镜")},
    "email": {"label": "邮件", "kw": ("邮件", "回信")},
    "article": {"label": "文章", "kw": ("文章", "长文", "专栏", "推文")},
    "list": {"label": "清单/表格", "kw": ("清单", "表格", "名单", "对照表")},
    "plan": {"label": "方案/计划", "kw": ("方案", "计划", "规划", "提案", "路线图")},
    "report": {"label": "报告", "kw": ("报告", "诊断", "体检", "复盘")},
}
# 只对「成品型」交付判形态。方案、报告、清单本来就是结构化文档，
# 里面出现「执行步骤」「预算」「风险」是本职，不是跑偏。
FINISHED_FORMS = ("copy", "article", "script", "email")
# 判定「这是工作底稿」的标题用词。只看标题行 —— 
# 正文里提一句「没有验收标准」是文案本身的内容，不能当证据。
DRAFT_HEADINGS = (
    "需求拆解", "需求理解", "需求分析", "任务拆解", "任务分解", "工作拆解",
    "执行步骤", "实施步骤", "落地步骤", "操作步骤", "执行方案", "执行计划",
    "交付清单", "交付物", "验收标准", "验收清单", "评分标准", "复核", "审校",
    "自检", "风险提示", "附录", "版本记录", "角色分工", "时间表", "排期",
    "配图建议", "发布节奏", "方法论", "预算", "报价",
)
HEADING_RE = re.compile(r"^\s*(?:#{1,6}\s*(?P<md>.+?)\s*$|(?P<num>[一二三四五六七八九十]{1,3})[、.．]\s*(?P<cn>.+?)\s*$)")


def wanted_form(requirement=""):
    """客户点的是哪道菜。认不出来就返回 None（不判形态）。

    顺序有讲究：「推广方案」里既有「推广」也有「方案」，客户要的是方案；
    「文案」两个字最明确，优先认它。
    """
    req = requirement or ""
    for key in ("copy", "script", "email", "plan", "report", "list", "article"):
        if any(w in req for w in FORMS[key]["kw"]):
            return key
    return None


def _headings(body):
    out = []
    for line in (body or "").split("\n"):
        m = HEADING_RE.match(line)
        if m:
            out.append((m.group("md") or m.group("cn") or "").strip())
    return out


def form_fit(body, requirement=""):
    """交付的「形态」对不对题。

    证据只有一条：正文的**标题**里有没有一堆内部流程词。
    客户要文案，交上来的却是「一、需求拆解 / 二、卖点分析 / 三、验收标准」，
    那就是把工作底稿发出去了。文案里提一句「没有验收标准」不算。
    """
    want = wanted_form(requirement)
    heads = _headings(body)
    hits = [h for h in heads if any(k in h for k in DRAFT_HEADINGS)]
    checked = want in FINISHED_FORMS
    mismatch = bool(checked and len(hits) >= 2)
    if not want:
        verdict = "客户没指定形态，不判"
    elif not checked:
        verdict = f"客户要{FORMS[want]['label']}，本来就可以分章节"
    elif mismatch:
        verdict = f"客户要{FORMS[want]['label']}，交上来的是工作底稿（{len(hits)} 个流程标题）"
    else:
        verdict = f"客户要{FORMS[want]['label']}，形态对得上"
    return {
        "wanted": want,
        "label": FORMS[want]["label"] if want else None,
        "checked": checked,
        "fit": not mismatch,
        "mismatch": mismatch,
        "headings": len(heads),
        "signals": hits[:5],
        "note": verdict,
    }


# 「有交代」的两个半项
NEXT_WORDS = ("下一步", "接下来", "第一步", "先做", "先按", "先从", "建议", "直接", "本周", "天内",
              "第 1", "三步", "两步", "四步", "怎么做", "照着做", "照着", "发布位置", "发在", "投放",
              "试试", "现在就", "留言", "私信")
RISK_WORDS = ("注意", "风险", "避免", "别急", "踩坑", "不能", "禁止", "谨慎", "需确认", "不合规", "会被")
# 文案类交付不写「风险提示」，写清楚发在哪、怎么用就是交代
CHANNEL_WORDS = ("发布位置", "发在", "投放", "朋友圈", "公众号", "社群", "渠道", "落地页", "首页", "私信")
# 文案的「有交代」= 结尾把读者往下一步带。常见形态是「现在预订…」「评论区留言…」
# 「想订的可以早点去」。这些不是「下一步做什么」的分析口吻，NEXT_WORDS 抓不到，
# 但它们确实完成了收口，判 0 分等于把一篇合格的投放文案当成没写完。
# 词表按投放场景收，宁窄勿宽：「可以」「试试」这种到处都有的词放进来，
# 空话也能蹭满分，那就白设这项了。
COPY_CTA_WORDS = ("预订", "预定", "下单", "到店", "评论区", "主页", "链接", "扫码", "二维码",
                  "关注", "收藏", "点赞", "转发", "回复", "私信", "留言", "预约", "抢",
                  "戳", "搜一下", "来试", "来逛", "别错过", "手慢无", "早鸟价")

# 「能照做」的数字门槛按服务定：咨询报告要铺满数字，文案有几个具体量就够了
NUM_TARGET = {"svc_content": 5, "svc_landing_sel": 9, "svc_compliance": 8}
DEFAULT_NUM_TARGET = 11

_CTX_PREFIX = ("项目：", "本次要解决的问题：", "这次要解决的事：")

# ---- 出街清洗：只清「我们自己看得懂、客户看不懂」的东西 ----
# 整行摘除：以这些词开头、且带内部名词的句子，本质是给我们自己留的索引
REF_LINE_PREFIX = ("引用词条", "依据来源", "依据：", "依据:", "参考词条", "参考来源", "内部备注", "注：")
# 行内替换：能换成大白话的就换，不能换的在摘行规则里处理
PLAIN_WORDS = [
    ("Agent 团队角色分工基线", "岗位分工"),
    ("Agent 团队", "团队"),
    ("Loop 循环引擎", "反复修改的流程"),
    ("IterationRecord", "修改记录"),
    ("PDCA", "计划—执行—检查—改进"),
    ("DAG", "任务先后顺序"),
    ("checkpoint", "存档"),
    ("run_id", "任务编号"),
    ("prompt", "指令"),
]
# 判定「这是内部说法」的词
JARGON = [k for k, _ in PLAIN_WORDS] + ["证据链", "词条", "基线", "埋点", "回归测试"]


def _body(text):
    """去掉多段拼接时重复的项目上下文行，只对真正的正文打分。"""
    lines = [ln for ln in (text or "").split("\n") if not ln.startswith(_CTX_PREFIX)]
    return "\n".join(lines).strip()


def _plain_md(text):
    """把 markdown 排版符号去掉。

    客户拿到的是要直接发出去的东西，满屏 `##` `**` `---` 会让它看起来像草稿。
    只去符号、不动文字，表格和代码块原样留着。
    """
    out, in_code = [], False
    for line in (text or "").split("\n"):
        if line.strip().startswith("```"):
            in_code = not in_code
            out.append(line)
            continue
        if in_code:
            out.append(line)
            continue
        if re.match(r"^\s*-{3,}\s*$", line):
            out.append("")
            continue
        m = re.match(r"^#{1,6}\s+(.*)$", line)
        if m:
            out.append(m.group(1).strip())
            continue
        m = re.match(r"^(\s*)[-*+]\s+(.*)$", line)
        if m:
            out.append(f"{m.group(1)}· {m.group(2)}")
            continue
        out.append(line)

    t = "\n".join(out)
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)
    t = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"\1", t)
    t = re.sub(r"`([^`\n]+)`", r"\1", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def client_polish(text):
    """交付给客户之前，把内部说法摘掉、能换白的换掉。

    返回 (干净的正文, 改动说明)。改动说明会写进交付页，客户能看到「我们清了几处」。
    """
    removed = []
    kept = []
    for line in (text or "").split("\n"):
        stripped = line.strip()
        has_jargon = any(j in stripped for j in JARGON)
        if has_jargon and stripped.startswith(REF_LINE_PREFIX):
            removed.append(stripped[:40])
            continue
        kept.append(line)

    out = "\n".join(kept)
    replaced = 0
    for raw, plain in PLAIN_WORDS:
        if raw in out:
            replaced += out.count(raw)
            out = out.replace(raw, plain)

    # 摘行后可能留下连续空行，收一下
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    # 最后一道：把 markdown 符号去掉，交到客户手上的是成品不是草稿
    marked = _plain_md(out)
    md_changed = marked != out
    out = marked
    notes = []
    if removed:
        notes.append(f"摘掉 {len(removed)} 处内部索引")
    if replaced:
        notes.append(f"改掉 {replaced} 处行话")
    if md_changed:
        notes.append("去掉排版符号")
    return out, notes


_FORMAT_NOISE = re.compile(
    # 篇幅：300 字 / 300字左右 / 500-800 字 / 不超过 300 字
    r"\d+\s*[-–—~～至到]\s*\d+\s*字|\d+\s*字\s*(?:左右|上下|以内|以下|以上|的样子)?"
    r"|(?:不超过|不多于|最多|至少|不少于|不低于|最少)\s*\d+\s*字"
    # 形态：客户点的是哪道菜
    r"|文案|文章|长文|推文|专栏|脚本|分镜|邮件|回信|清单|表格|名单|对照表|方案|报告|策划案"
    # 平台/渠道：发在哪里不等于写什么
    r"|小红书|公众号|朋友圈|微博|抖音|视频号|社群|私域|落地页|首页|直播间|淘宝|京东|拼多多"
    # 交付动作：谁写、写几篇
    r"|帮我|给我|替我|麻烦|写一篇|写一份|写一条|出一份|做一份|来一份|一篇|一份|一条|一版"
    r"|撰写|拟一份|草拟|写"
)


def _ratio_topic(body, requirement):
    """客户诉求覆盖率：只看**内容**诉求，不看格式要求。

    为什么先剥一层：客户原话里「文案 / 小红书 / 300 字左右」是「要什么形态、多少字、
    发哪儿」，不是「要写什么」。一段合格的小红书文案，正文里当然不会出现「小红书」
    三个字，也不会写「本文共 300 字」——按逐字比对就会被判「没回应客户」。
    这些格式要求已经由 form（形态）和 volume（篇幅）两项单独管，这里再算一遍就是重复扣分。
    """
    req = _FORMAT_NOISE.sub("", requirement or "")
    req = "".join(re.findall(r"[\u4e00-\u9fff]", req))
    keys = {c for c in req if c not in STOP_CHARS}
    if not keys:
        return 1.0
    hit = sum(1 for c in keys if c in body)
    return hit / len(keys)


def _numbers(body):
    """具体数字的个数（去重）。价格、天数、件数、比例都算。

    中文数字也算：文案里写「三天」「两版」「一小时」，和写「3 天」是一回事。
    只认阿拉伯数字会把一整篇正常中文文案判成「没有具体信息」。
    """
    found = re.findall(r"\d+(?:\.\d+)?", body)
    # 「一个 / 一次 / 一遍」这类在中文里多半是虚指（他一个人、看了一遍又一遍），
    # 数进去等于给废话加分；带时间单位的「一小时 / 一天」才算数。
    vague = {"一个", "一次", "一遍", "一点", "一份", "一条", "一番", "一件", "一款"}
    # 量词要收全：文案里的具体信息往往是「三盒 / 半块 / 两杯 / 一斤」，
    # 只认「个/天/元」会把一篇有细节的稿子判成「0 处具体数字」。
    # 「半」也算数：半块、半斤、半价都是客户能感知的实指。
    found += [
        w for w in re.findall(
            r"[一二三四五六七八九十百千万两半]{1,3}"
            r"(?:小时|分钟|毫升|公斤|个|天|周|月|年|版|步|次|元|块|人|条|篇|倍|成|分|点|件|轮|遍|份"
            r"|盒|款|杯|斤|张|家|位|瓶|包|套|支|片|袋|箱|颗|只|层|粒|台|克|寸|米)",
            body,
        )
        if w not in vague
    ]
    return len(set(found))


def check(text, requirement="", service_id=""):
    """给一段交付正文打分。

    返回结构固定，页面、订单、客户档案都直接用它，不再各算一套。
    """
    body = _body(text)
    chars = len(re.sub(r"\s", "", body))
    min_chars = MIN_CHARS.get(service_id or "", DEFAULT_MIN_CHARS)
    nums = _numbers(body)
    topic = _ratio_topic(body, requirement)
    has_next = any(w in body for w in NEXT_WORDS)
    has_risk = any(w in body for w in RISK_WORDS)
    # 篇幅看两头：客户说了字数就按客户说的，没说要防「写成一本册子」
    want = wanted_chars(requirement)
    floor = min_chars
    if want and want.get("low"):
        floor = max(floor, want["low"])
    ceiling = (want or {}).get("high") or (floor * OVER_MULTIPLE)
    # 客户说的上限是硬上限。服务底线（内容类要成篇 480 字）不能顶到客户上限 450 之上，
    # 否则会出现「底线 480 / 上限 450」这种自相矛盾的区间，前端照着显示也解释不清。
    floor = min(floor, ceiling)
    # 客户说了下限，就拿客户的数字当尺子（198 字对 210 的要求是「差一点」，
    # 不是「只有三分之一」）。客户没说，才用「服务底线 × 1.35」这种宽松口径兜。
    if want and want.get("low"):
        low_ratio = min(1.0, chars / want["low"])
    else:
        low_ratio = min(1.0, chars / (floor * 1.35)) if floor else 1.0
    high_ratio = 1.0 if chars <= ceiling else max(0.0, 1 - (chars - ceiling) / ceiling)
    # 客户给了区间，落在区间里就是照做了，不该再按「接近下限」扣分
    in_band = bool(want) and want.get("low") and want.get("high") and want["low"] <= chars <= want["high"]
    volume_ratio = 1.0 if in_band else min(low_ratio, high_ratio)
    # 超出一倍以上：不是「写得多了点」，是根本没按要求交付
    overlong = bool(want) and chars > ceiling * 2

    if want:
        if want.get("low") and want.get("high"):
            span = f"{want['low']}–{want['high']} 字"
        elif want.get("low"):
            span = f"至少 {want['low']} 字"
        else:
            span = f"不超过 {want['high']} 字"
        volume_note = f"{chars} 字 / 客户要 {span}"
        span_text = f"「{want['text']}」"
    else:
        volume_note = f"{chars} 字 / 底线 {floor} 字、上限 {ceiling} 字"
        span_text = f"底线 {floor} 字"

    topic_ratio = min(1.0, topic / 0.62)
    num_ratio = min(1.0, nums / NUM_TARGET.get(service_id or "", DEFAULT_NUM_TARGET))
    has_channel = any(w in body for w in CHANNEL_WORDS)
    has_cta = any(w in body for w in COPY_CTA_WORDS)
    if service_id == "svc_content":
        # 文案不写「风险提示」，写了反而不像文案。说清发在哪、怎么用、往哪儿引流就是交代。
        if has_next:
            closing_ratio, closing_note = 1.0, "有行动指引"
        elif has_cta:
            closing_ratio, closing_note = 1.0, "结尾把读者往下单/到店/留言带"
        elif has_channel:
            closing_ratio, closing_note = 1.0, "写清了发在哪"
        else:
            closing_ratio, closing_note = 0.0, "没写怎么用、发在哪"
    else:
        closing_ratio = (0.5 if has_next else 0.0) + (0.5 if has_risk else 0.0)
        closing_note = ("有下一步" if has_next else "没写下一步") + "、" + ("有风险提示" if has_risk else "没提风险")

    raw = {
        "topic": (topic_ratio, f"客户诉求命中 {round(topic * 100)}%"),
        "actionable": (num_ratio, f"{nums} 处具体数字"),
        "volume": (volume_ratio, volume_note),
        "closing": (closing_ratio, closing_note),
    }

    items = []
    total = 0.0
    for key, name, weight, advice in ITEMS:
        ratio, note = raw[key]
        if key == "volume" and chars > ceiling:
            advice = f"客户要{span_text}，这版 {chars} 字；按客户说的篇幅重写，砍掉过程说明和铺垫，只留成品"
        total += weight * ratio
        items.append(
            {
                "key": key, "name": name, "weight": weight, "score": round(weight * ratio),
                "ok": ratio >= 0.999, "note": note, "advice": advice,
            }
        )

    score = int(round(total))
    form = form_fit(body, requirement)
    # 形态不对是硬伤，不是「扣几分」：字数再准，给的也不是客户点的东西。
    if form["mismatch"]:
        score = min(score, 55)
    failed = [i for i in items if not i["ok"]]
    weakest_item = min(items, key=lambda i: i["score"] / i["weight"])
    weakest = weakest_item["key"]

    if overlong:
        level = "fail"
        verdict = f"自检 {score} 分 · 篇幅超了：客户要{span_text}，这版 {chars} 字"
    elif form["mismatch"]:
        level = "fail"
        verdict = f"自检 {score} 分 · 形态不对：客户要{form['label']}，这版是工作底稿"
    elif not failed:
        level, verdict = "pass", f"自检 {score} 分 · 四项全过"
    elif score >= 85:
        level = "pass"
        verdict = f"自检 {score} 分 · 可以发出"
    elif score >= PASS_SCORE:
        level = "warn"
        verdict = f"自检 {score} 分 · 能发，「{weakest_item['name']}」偏弱"
    else:
        level = "fail"
        verdict = f"自检 {score} 分 · 退回补「{weakest_item['name']}」"

    if form["mismatch"]:
        weakest = "form"
        advice = (
            f"客户要的是能直接拿去用的{form['label']}，不是内部过程材料。"
            "删掉需求拆解、执行步骤、验收标准、配图建议这类章节，只留成品本身；"
            "整篇从头到尾就是客户能直接发出去的那一篇。"
        )
    else:
        key = "volume" if overlong else weakest
        advice = next((i["advice"] for i in items if i["key"] == key), "")

    return {
        "rules": RULES_VERSION,
        "score": score,
        "passed": score >= PASS_SCORE and not overlong and not form["mismatch"],
        "level": level,
        "verdict": verdict,
        "weakest": "volume" if overlong else weakest,
        "advice": advice,
        "items": items,
        "form": form,
        "chars": chars,
        "topic_ratio": round(topic, 2),
        "numbers": nums,
        "length": {
            "chars": chars, "floor": floor, "ceiling": ceiling,
            "wanted": want["text"] if want else None,
            "over": bool(want) and chars > ceiling,
            "overlong": overlong,
        },
    }
