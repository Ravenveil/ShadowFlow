"""Seed data: one demo-ready team (OPC 出海增长小组) and a vocabulary of 词条 for the KB."""

from . import db
from . import company as company_mod
from .policy import APPROVAL, ALLOW, DENY, default_matrix

TEAM_ID = "team_opc_growth"


def demo_team():
    dag = {
        "nodes": [
            {
                "id": "n1",
                "type": "agent",
                "agent": "researcher",
                "title": "情报侦察",
                "instruction": "调研目标市场与竞品，给出三条可核查的情报要点，并标注来源词条。",
                "x": 0,
                "y": 1,
            },
            {
                "id": "n2",
                "type": "agent",
                "agent": "strategist",
                "title": "策略定盘",
                "instruction": "基于情报收敛出定位、路径、验收三条打法，供内容环节执行。",
                "x": 1,
                "y": 1,
            },
            {
                "id": "n3",
                "type": "loop",
                "title": "内容打磨闭环",
                "instruction": "写手产出 → 审校打分 → 未达阈值则带着意见重写，直至收敛。",
                "config": {
                    "max_rounds": 4,
                    "target_score": 0.85,
                    "body": ["w1", "r1"],
                    "verifier": "reviewer",
                },
                "x": 2,
                "y": 1,
            },
            {
                "id": "w1",
                "type": "agent",
                "agent": "writer",
                "title": "内容撰写",
                "instruction": "写一篇可直接发布的小红书种草文案，含标题、正文、标签。",
                "parent": "n3",
                "x": 2,
                "y": 0,
            },
            {
                "id": "r1",
                "type": "agent",
                "agent": "reviewer",
                "title": "审校验证",
                "instruction": "按可核查性、结构完整度打分，给出具体问题清单。",
                "parent": "n3",
                "x": 2,
                "y": 2,
            },
            {
                "id": "n4",
                "type": "agent",
                "agent": "legal",
                "title": "合规审核",
                "instruction": "审核文案与支付口径的合规风险，未通过则驳回上游重写。",
                "x": 3,
                "y": 1,
            },
            {
                "id": "n5",
                "type": "agent",
                "agent": "delivery",
                "title": "交付汇总",
                "instruction": "汇总交付物清单与下一步动作，形成可展示的交付卡。",
                "x": 4,
                "y": 1,
            },
        ],
        "edges": [
            ["n1", "n2"],
            ["n2", "n3"],
            ["n3", "n4"],
            ["n4", "n5"],
        ],
    }

    policy = default_matrix()
    policy["matrix"]["legal"]["delivery"] = APPROVAL
    policy["matrix"]["delivery"] = {}
    policy["matrix"]["writer"]["reviewer"] = ALLOW
    policy["matrix"]["reviewer"]["writer"] = ALLOW
    policy["matrix"]["writer"]["legal"] = DENY
    policy["notes"] = "写手不得直连法务（四眼原则）；法务交付需过人工门。"

    return {
        "id": TEAM_ID,
        "name": "OPC 出海增长小组",
        "description": "情报 → 策略 → 内容打磨闭环 → 合规 → 交付，覆盖经营 OPC 的主链路。",
        "dag": dag,
        "policy": policy,
        "version": 3,
    }


KB = [
    {
        "id": "kb_opc",
        "title": "一人公司是什么",
        "kind": "term",
        "tags": ["OPC", "经营模式", "组织"],
        "content": "OPC 指由一个人主导、由一组 AI Agent 承担具体职能的经营主体。它把传统公司的岗位拆成可编排的角色节点，"
        "由 Loop 引擎驱动任务在反馈闭环中收敛，人只保留目标设定、关键门禁与风险兜底。"
        "ShadowFlow 的目标是让一支 Agent 团队像一家公司一样协作、循环与交付，而不是让一个模型反复试错。",
    },
    {
        "id": "kb_selection",
        "title": "出海选品怎么做（四步）",
        "kind": "method",
        "tags": ["选品", "跨境", "方法论"],
        "content": "四步法：一、需求验证，用搜索量与竞品评价密度判断真实需求；二、供给缺口，找出同质化供给里缺失的场景；"
        "三、履约可行性，核算轻小件物流时效与退货成本；四、内容可讲性，判断能否用一条短视频讲清价值点。"
        "四步全部通过才进入上架，任一步不通过则退回选品池，不进入内容生产。",
    },
    {
        "id": "kb_seeding",
        "title": "小红书种草内容结构",
        "kind": "method",
        "tags": ["内容", "种草", "小红书"],
        "content": "有效的种草内容通常是四段结构：场景钩子（前两行必须让目标人群认领问题）、可验证证据（数据、对比、真实使用记录）、"
        "行动清单（三步以内可执行动作）、合规声明（资质、功效、退款口径）。"
        "缺少证据段的文案在审校环节普遍得分低于 0.7，需要重写。",
    },
    {
        "id": "kb_payment",
        "title": "收款怎么才算真到账",
        "kind": "policy",
        "tags": ["支付", "交易平台", "闭环"],
        "content": "首单闭环由发布任务、接单执行、交付验收、收款四段构成。虚拟支付先行，真实或模拟交易均可作为比赛加分项。"
        "支付页必须写明资金流向、退款时效与争议处理入口，否则合规审核直接驳回。赛前至少完成两遍第一单彩排。",
    },
    {
        "id": "kb_four_eyes",
        "title": "为什么写稿的和审核的必须是两个人",
        "kind": "policy",
        "tags": ["四眼原则", "风控", "human in the loop"],
        "content": "四眼原则要求产出者与审核者必须是不同主体：写手不能自审，也不能把自己的产出直接送法务或交付。"
        "在 ShadowFlow 中体现为策略矩阵的显式 deny 单元格，以及保存团队时的编译期校验。"
        "人机协同的关键门禁放在合规与支付两个环节，人保留否决权而不介入日常执行。",
    },
    {
        "id": "kb_loop",
        "title": "做不好怎么返工（来回改到合格）",
        "kind": "term",
        "tags": ["Loop", "PDCA", "引擎"],
        "content": "Loop 引擎把循环做成 DAG 的一等公民：control.loop 节点的循环体执行完直接回归主流程子图，支持嵌套（深度上限 4）与断点续跑。"
        "每轮迭代产出 IterationRecord，记录做了什么、验证结论、为什么继续或停止，形成可审计证据链。"
        "它解决的不是模型多跑几遍，而是带验证器与控制器的工程化收敛。",
    },
    {
        "id": "kb_matrix",
        "title": "哪些事 AI 能自己定，哪些要人拍板",
        "kind": "term",
        "tags": ["策略矩阵", "权限", "编排"],
        "content": "策略矩阵是一张 N×N 的显式授权表，存在团队 JSON 的 policy_matrix 字段里。DAG 每条边在派发前逐格查表，不依赖模型自觉。"
        "三种取值：allow 放行、deny 拦截并发系统消息、require_approval 走人工门。"
        "保存团队时先做最佳实践校验，运行期再做一次拦截，形成双层防线。",
    },
    {
        "id": "kb_evidence",
        "title": "每一步都留记录：谁干的、改了什么",
        "kind": "term",
        "tags": ["证据链", "可审计", "验收"],
        "content": "每轮循环写一条 IterationRecord：轮次、动作、验证结论、决策（continue / stop）、得分。"
        "前端据此渲染逐轮验证面板，评委可以逐轮追问为什么继续或停止。断点续跑时按最近一条记录恢复。",
    },
    {
        "id": "kb_logistics",
        "title": "小件跨境一般几天到",
        "kind": "case",
        "tags": ["物流", "时效", "案例"],
        "content": "东南亚与中东轻小件通道，稳定的端到端时效为 7–12 天，其中清关占 2–4 天。"
        "超过 15 天的线路不建议进入首单演示，退货成本会侵蚀毛利。选品阶段应把时效作为硬约束写入验收标准。",
    },
    {
        "id": "kb_roles",
        "title": "AI 员工怎么分工",
        "kind": "method",
        "tags": ["角色", "多智能体", "协作"],
        "content": "一条完整链路通常包含：规划者（拆任务）、情报侦察（找事实）、策略定盘（收敛打法）、内容撰写（产出交付物）、"
        "审校验证（打分与问题清单）、合规审核（风险否决）、交付汇总（收口）。"
        "角色之间只通过 DAG 边通信，边受策略矩阵约束，因此协作权限是显式可控的。",
    },
]


PRODUCTS = [
    {
        "id": "svc_landing_sel",
        "name": "出海选品包",
        "summary": "帮你挑出先卖哪三款，每款定多少钱",
        "detail": "下单前先想好两件事：卖到哪个国家、卖哪一类东西。\n"
        "\n"
        "我们帮你看三样：\n"
        "一、那边的人最近在买什么 —— 看销量和搜索量，不靠猜。\n"
        "二、同样的东西别人卖多少钱 —— 看卖得最好的 20 家，找出没人占的价位。\n"
        "三、上架要不要许可证、会不会踩到侵权 —— 列成一张要办的事。\n"
        "\n"
        "最后给你一张单子：先试哪三款、每款定多少钱、第一单找谁进货。",
        "price_cents": 9900,
        "team_id": TEAM_ID,
        "deliverable": "一张选品单子：先卖哪三款、每款定多少钱、第一单找谁进货",
        "eta_hint": "下单后自动开工，做完就能看到",
    },
    {
        "id": "svc_compliance",
        "name": "上架前体检",
        "summary": "先查一遍，别等上架后被下架",
        "detail": "东西准备好了，上架之前先查一遍，免得白忙一场。\n"
        "\n"
        "查三样：\n"
        "一、你卖的东西要不要许可证 —— 化妆品的备案、电器的认证，一样一样列出来。\n"
        "二、广告词有没有说大话 —— 「最好」「第一」「包治」这类词，平台不让写。\n"
        "三、该写的字写全了没 —— 成分、产地、警告语，缺一样都可能被退回。\n"
        "\n"
        "最后给你一张体检表：哪条过了、哪条没过、没过该怎么改。",
        "price_cents": 4900,
        "team_id": TEAM_ID,
        "deliverable": "一张体检表：哪条没过、该怎么改",
        "eta_hint": "下单后自动开工，做完就能看到",
    },
    {
        "id": "svc_content",
        "name": "推广文案包",
        "summary": "写好三版广告词，挑一个直接发",
        "detail": "东西有了，还缺一句话让人想买。\n"
        "\n"
        "我们写三样：\n"
        "一、一句能记住的卖点 —— 别人为什么买你的，不买隔壁的。\n"
        "二、三个标题，三种口气 —— 一个讲痛点，一个讲结果，一个做对比。\n"
        "三、发之前过一遍 —— 把不能说的词换掉，免得发出去被限流。\n"
        "\n"
        "最后给你三个版本，挑一个顺手的直接用。",
        "price_cents": 2900,
        "team_id": TEAM_ID,
        "deliverable": "三个版本的广告词，挑一个直接发",
        "eta_hint": "下单后自动开工，做完就能看到",
    },
]


def ensure_seed():
    db.init()
    if not db.list_teams():
        db.save_team(demo_team())
    if not db.all_kb():
        for entry in KB:
            db.upsert_kb({**entry, "source": "seed"})
    if not db.list_products():
        for product in PRODUCTS:
            db.save_product({**product, "currency": "CNY", "active": 1})
    ensure_company()


# ------------------------------------------------------------------ OPC OS：默认经营的公司

COMPANY = {
    "name": "增长工场",
    "industry": "帮小商家把货卖出去",
    "mission": "不卖方案，卖能验收的结果：谁干的、花了多少、卡在哪，都能查",
    "owner_name": "老板",
    "cash_cents": 200000,  # 启动资金 2000 元
}

DEPARTMENTS = [
    {"key": "gm", "name": "总经办", "charter": "拆任务、排时间、替你把关交付", "budget_cents": 60000},
    {"key": "strategy", "name": "品牌策略部", "charter": "定方向、定说法、把内容和合规关", "budget_cents": 80000},
    {"key": "market", "name": "市场研究部", "charter": "看客户、看同行、看数据", "budget_cents": 50000},
    {"key": "creative", "name": "创意制作部", "charter": "写文案、做图", "budget_cents": 70000},
    {"key": "client", "name": "客户成功部", "charter": "跟客户沟通、盯交付、管回头客", "budget_cents": 40000},
]

STAFF = [
    {
        "key": "cos", "name": "陈明远", "role": "chief_of_staff", "title": "CEO 助理 · 项目经理",
        "dept": "gm", "seniority": "senior", "model": "claude-sonnet", "day_rate_cents": 2000,
        "skills": ["拆目标成任务", "排时间", "跨部门协调", "验收汇总"],
        "tools": ["任务看板", "日程", "会议纪要"],
        "permissions": ["派发任务", "修改排期", "召集评审"],
        "prompt": "你是 CEO 助理。把老板的一句话目标拆成可执行、可验收的任务，标清依赖与卡点。"
                  "不做业务判断，只做拆解与推进；任何需要花钱或对外承诺的事一律上报老板。",
    },
    {
        "key": "research", "name": "林研", "role": "market_researcher", "title": "市场研究员",
        "dept": "market", "seniority": "senior", "model": "gpt-4o", "day_rate_cents": 1200,
        "skills": ["看买家是谁", "看同行卖得怎样", "找出真实需求", "核对数据出处"],
        "tools": ["网页检索", "知识库", "表格"],
        "permissions": ["读取公开数据", "提交调研报告"],
        "prompt": "你是市场研究员。结论必须带可核查依据（来源、时间、口径），"
                  "禁止用「一般认为」这类无出处表述。调研不出结论时直接说缺什么数据。",
    },
    {
        "key": "brand", "name": "苏策", "role": "brand_strategist", "title": "品牌策划师",
        "dept": "strategy", "seniority": "senior", "model": "claude-sonnet", "day_rate_cents": 1800,
        "skills": ["定品牌方向", "定怎么卖", "设计活动", "定验收标准"],
        "tools": ["知识库", "案例库"],
        "permissions": ["制定策略", "定义验收标准"],
        "prompt": "你是品牌策划师。每个策略必须给出可量化的验收口径，"
                  "并说明为什么是这个打法而不是别的。避免堆砌形容词。",
    },
    {
        "key": "copy", "name": "何文", "role": "copywriter", "title": "文案运营",
        "dept": "creative", "seniority": "mid", "model": "deepseek-chat", "day_rate_cents": 800,
        "skills": ["写社媒文案", "打磨标题", "写活动话术", "出多个版本"],
        "tools": ["知识库", "文案模板"],
        "permissions": ["生产文案", "提交多版本"],
        "prompt": "你是文案运营。一次至少给两个标题方向，正文要能直接投放，不要写解释性文字。",
    },
    {
        "key": "design", "name": "江设", "role": "visual_designer", "title": "视觉设计师",
        "dept": "creative", "seniority": "mid", "model": "gemini-flash", "day_rate_cents": 1500,
        "skills": ["做海报", "定版式", "列要做哪些图", "查图片版权"],
        "tools": ["设计稿", "素材库"],
        "permissions": ["使用素材", "定义视觉规范"],
        "prompt": "你是视觉设计师。交付可执行的设计说明（尺寸、层级、字体、格式），"
                  "并主动标注版权风险点。",
    },
    {
        "key": "data", "name": "周数", "role": "data_analyst", "title": "数据分析师",
        "dept": "market", "seniority": "mid", "model": "deepseek-chat", "day_rate_cents": 1200,
        "skills": ["看每一步掉多少人", "找出掉人的原因", "定指标", "回头验证效果"],
        "tools": ["数据表", "计算器"],
        "permissions": ["读取业务数据", "提交分析结论"],
        "prompt": "你是数据分析师。先定义指标口径再给数字，缺少数据时要说明假设，"
                  "不允许编造占比。",
    },
    {
        "key": "account", "name": "沈客", "role": "account_manager", "title": "客户经理",
        "dept": "client", "seniority": "mid", "model": "gpt-4o", "day_rate_cents": 1000,
        "skills": ["跟客户沟通", "确认需求", "盯交付进度", "促成回头单"],
        "tools": ["客户档案", "日程"],
        "permissions": ["联系客户", "确认需求"],
        "prompt": "你是客户经理。只记录客户真实表达过的内容，不要代替客户做决定；"
                  "任何超出合同范围的承诺必须上报。",
    },
    {
        "key": "qa", "name": "陆审", "role": "quality_reviewer", "title": "质量审核",
        "dept": "strategy", "seniority": "senior", "model": "claude-sonnet", "day_rate_cents": 1400,
        "skills": ["查有没有漏", "查前后对不对得上", "查能不能照着做"],
        "tools": ["检查清单"],
        "permissions": ["退回不合格产出"],
        "prompt": "你是质量审核。按完整性、一致性、可执行性三项打分，"
                  "不通过要写明缺什么，禁止只说「建议优化」。",
    },
    {
        "key": "legal", "name": "罗法", "role": "compliance_officer", "title": "合规审核",
        "dept": "strategy", "seniority": "senior", "model": "qwen-max", "day_rate_cents": 1600,
        "skills": ["广告法", "买家信息保护", "查资质", "分风险高低"],
        "tools": ["法规库", "检查清单"],
        "permissions": ["否决对外物料", "要求补充说明"],
        "prompt": "你是合规审核。按风险等级给出结论（通过/有条件通过/否决），"
                  "有条件通过必须逐条列出补充要求。拿不准的宁可上报老板，不要放行。",
    },
]

# ------------------------------------------------------------------ 项目剧本（按服务定制）
#
# 员工编制固定 9 人，剧本复用同一批岗位，只把「这次要做什么」换成该服务真正的作业流程。
# 一个剧本 = 一张依赖图：after 指向的上游完成后本任务才可执行，同一批上游天然可并行。

# 出海选品包：从查市场到查合规的一整套选品流程
PLAYBOOK_SELECTION = [
    {"key": "plan", "title": "拆任务、排时间", "role": "chief_of_staff", "after": [],
     "risk": "low", "mode": "pipeline",
     "brief": "把客户说的市场、品类、预算，拆成 9 件要做的事，写清谁先谁后、"
              "每件做到什么算完成、大概花几天。"},
    {"key": "scan", "title": "先看那边卖什么", "role": "market_researcher", "after": ["plan"],
     "risk": "low", "mode": "pipeline",
     "brief": "查目标市场的需求走势、常见价格、同行有多少家、有没有淡旺季。"
              "每个数字注明从哪查的、查的是哪个月；查不到的写「待确认」。"},
    {"key": "select", "title": "定三个主推款", "role": "brand_strategist", "after": ["scan"],
     "risk": "low", "mode": "pipeline",
     "brief": "从候选里挑 3 个重点推，写清卖给谁、凭什么选它，"
              "以及另外几个为什么不推。"},
    {"key": "listing", "title": "写标题和卖点", "role": "copywriter", "after": ["select"],
     "risk": "low", "mode": "parallel",
     "brief": "写 3 个标题、5 条卖点、1 段短介绍，要合当地人的说法和搜索习惯。"},
    {"key": "visual", "title": "主图和详情页怎么排", "role": "visual_designer", "after": ["select"],
     "risk": "medium", "mode": "parallel",
     "brief": "说明主图放什么、卖点按什么顺序、平台要求多大尺寸，以及字体图片的版权注意事项。"},
    {"key": "pricing", "title": "算成本、定价格", "role": "data_analyst", "after": ["listing", "visual"],
     "risk": "low", "mode": "pipeline",
     "brief": "把进价、运费、平台抽成、退货损耗逐项算清，给出不亏本的价和建议卖价；"
              "每个数字标清是实测、问来的价还是估的。"},
    {"key": "exec", "title": "第一单怎么干", "role": "account_manager", "after": ["pricing"],
     "risk": "low", "mode": "pipeline",
     "brief": "写清备多少货、什么时候上架、试卖预算多少、每天做什么、谁负责，"
              "以及哪些事要客户点头。"},
    {"key": "qa", "title": "回头查一遍", "role": "quality_reviewer", "after": ["exec"],
     "risk": "low", "mode": "review",
     "brief": "检查每条结论有没有出处、账算得对不对、动作能不能照着做；"
              "不合格就写清缺什么，别放过去。"},
    {"key": "legal", "title": "查能不能上架", "role": "compliance_officer", "after": ["qa"],
     "risk": "high", "mode": "review",
     "brief": "查当地要不要认证、广告词有没有问题、图片字体有没有侵权，"
              "最后给结论：能上 / 改完能上 / 不建议上，附要改的清单。"},
]

# 上架前体检：上架前把该查的查一遍，不产出选品结论
PLAYBOOK_COMPLIANCE = [
    {"key": "plan", "title": "要准备哪些材料", "role": "chief_of_staff", "after": [],
     "risk": "low", "mode": "pipeline",
     "brief": "先确认卖到哪个国家、什么品类、在哪个平台上架，列出需要客户提供的证件和资料。"},
    {"key": "scan", "title": "查能不能卖", "role": "market_researcher", "after": ["plan"],
     "risk": "low", "mode": "pipeline",
     "brief": "查这个品类在当地要不要许可证、要哪些认证、标签怎么写、平台有没有禁售，"
              "标清依据出自哪条规定。"},
    {"key": "claim", "title": "查广告词", "role": "brand_strategist", "after": ["scan"],
     "risk": "low", "mode": "pipeline",
     "brief": "把现有文案逐条看一遍，找出「最好」「第一」「包治」这类不能说的话，"
              "以及没有依据的效果承诺。"},
    {"key": "copy", "title": "改广告词、补声明", "role": "copywriter", "after": ["claim"],
     "risk": "low", "mode": "parallel",
     "brief": "把不能说的句子改成能说的，另附一份声明模板，客户拿到就能用。"},
    {"key": "visual", "title": "标签怎么写", "role": "visual_designer", "after": ["claim"],
     "risk": "medium", "mode": "parallel",
     "brief": "说明认证标志、警示语、产地和成分标在什么位置、多大字号。"},
    {"key": "qa", "title": "按严重程度列要改的", "role": "quality_reviewer", "after": ["copy", "visual"],
     "risk": "low", "mode": "review",
     "brief": "把问题分成高、中、低三档，列成一张清单，写清谁改、什么时候改完。"},
    {"key": "legal", "title": "出结论", "role": "compliance_officer", "after": ["qa"],
     "risk": "high", "mode": "review",
     "brief": "给最终结论：能上架 / 改完能上架 / 不建议上架，并写明依据。"},
]

# 推广文案包：从卖点到文案，审完、查完再交付
PLAYBOOK_CONTENT = [
    {"key": "plan", "title": "这次要解决什么", "role": "chief_of_staff", "after": [],
     "risk": "low", "mode": "pipeline",
     "brief": "先说清这次是拉新客、促下单还是让老客回购，投在哪个渠道，怎样算做成了。"},
    {"key": "insight", "title": "挑出卖点", "role": "market_researcher", "after": ["plan"],
     "risk": "low", "mode": "pipeline",
     "brief": "从产品本身挑 3 个说得清、看得见的卖点，说明对应哪类人、解决什么麻烦，并写明依据。"},
    {"key": "angle", "title": "定说法", "role": "brand_strategist", "after": ["insight"],
     "risk": "low", "mode": "pipeline",
     "brief": "给 2–3 个切入角度和一句核心的话，说明各适合发在哪、给谁看。"},
    {"key": "copy", "title": "写三版文案", "role": "copywriter", "after": ["angle"],
     "risk": "low", "mode": "parallel",
     "brief": "按选定的角度写 5 个标题、2 版正文、3 条短文案，标明每版发在哪。"},
    {"key": "visual", "title": "配图怎么配", "role": "visual_designer", "after": ["angle"],
     "risk": "medium", "mode": "parallel",
     "brief": "说明配图方向、信息怎么排、各渠道要多大尺寸，以及素材版权要求。"},
    {"key": "qa", "title": "审稿打分", "role": "quality_reviewer", "after": ["copy", "visual"],
     "risk": "low", "mode": "review",
     "brief": "按准不准、有没有说服力、合不合渠道打分，不及格打回重写并写清问题。"},
    {"key": "legal", "title": "发之前查一遍", "role": "compliance_officer", "after": ["qa"],
     "risk": "high", "mode": "review",
     "brief": "检查有没有夸大、乱承诺、用了没授权的图，给出能不能发的结论。"},
]

# 未指定服务时的兜底剧本（内容转化那一套最通用）
PLAYBOOK = PLAYBOOK_CONTENT

PLAYBOOKS = {
    "svc_landing_sel": PLAYBOOK_SELECTION,
    "svc_compliance": PLAYBOOK_COMPLIANCE,
    "svc_content": PLAYBOOK_CONTENT,
}


def playbook_for(product_id=None):
    """按服务选剧本；未知服务退回通用剧本。"""
    return PLAYBOOKS.get(product_id or "", PLAYBOOK)



def ensure_company():
    """建默认公司、部门、九名数字员工。已存在则不动，避免覆盖用户改动。"""
    if company_mod.list_companies():
        return company_mod.list_companies()[0]

    company = company_mod.create_company(
        COMPANY["name"], COMPANY["industry"], COMPANY["mission"],
        owner_name=COMPANY["owner_name"], team_id=TEAM_ID, cash_cents=COMPANY["cash_cents"],
    )

    dept_ids = {}
    for i, d in enumerate(DEPARTMENTS):
        dept = company_mod.create_department(
            company["id"], d["name"], charter=d["charter"], budget_cents=d["budget_cents"], sort=i
        )
        dept_ids[d["key"]] = dept["id"]

    emp_ids = {}
    for s in STAFF:
        emp = company_mod.hire(
            company["id"], s["name"], s["role"],
            department_id=dept_ids.get(s["dept"]),
            title=s["title"], seniority=s["seniority"],
            system_prompt=s["prompt"], skills=s["skills"], tools=s["tools"],
            permissions=s["permissions"], model_name=s["model"], day_rate_cents=s["day_rate_cents"],
        )
        emp_ids[s["key"]] = emp["id"]
        # 部门负责人 = 该部门第一位入职的员工
        db.x(
            "UPDATE departments SET head_employee_id = ? WHERE id = ? AND head_employee_id IS NULL",
            (emp["id"], dept_ids.get(s["dept"])),
        )

    return company_mod.get_company(company["id"])
