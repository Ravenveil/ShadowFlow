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
        "title": "OPC（一人公司 / One Person Company）",
        "kind": "term",
        "tags": ["OPC", "经营模式", "组织"],
        "content": "OPC 指由一个人主导、由一组 AI Agent 承担具体职能的经营主体。它把传统公司的岗位拆成可编排的角色节点，"
        "由 Loop 引擎驱动任务在反馈闭环中收敛，人只保留目标设定、关键门禁与风险兜底。"
        "ShadowFlow 的目标是让一支 Agent 团队像一家公司一样协作、循环与交付，而不是让一个模型反复试错。",
    },
    {
        "id": "kb_selection",
        "title": "跨境出海选品四步法",
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
        "title": "虚拟支付与首单闭环",
        "kind": "policy",
        "tags": ["支付", "交易平台", "闭环"],
        "content": "首单闭环由发布任务、接单执行、交付验收、收款四段构成。虚拟支付先行，真实或模拟交易均可作为比赛加分项。"
        "支付页必须写明资金流向、退款时效与争议处理入口，否则合规审核直接驳回。赛前至少完成两遍第一单彩排。",
    },
    {
        "id": "kb_four_eyes",
        "title": "四眼原则与人机协同风控",
        "kind": "policy",
        "tags": ["四眼原则", "风控", "human in the loop"],
        "content": "四眼原则要求产出者与审核者必须是不同主体：写手不能自审，也不能把自己的产出直接送法务或交付。"
        "在 ShadowFlow 中体现为策略矩阵的显式 deny 单元格，以及保存团队时的编译期校验。"
        "人机协同的关键门禁放在合规与支付两个环节，人保留否决权而不介入日常执行。",
    },
    {
        "id": "kb_loop",
        "title": "Loop 循环引擎与 PDCA 收敛",
        "kind": "term",
        "tags": ["Loop", "PDCA", "引擎"],
        "content": "Loop 引擎把循环做成 DAG 的一等公民：control.loop 节点的循环体执行完直接回归主流程子图，支持嵌套（深度上限 4）与断点续跑。"
        "每轮迭代产出 IterationRecord，记录做了什么、验证结论、为什么继续或停止，形成可审计证据链。"
        "它解决的不是模型多跑几遍，而是带验证器与控制器的工程化收敛。",
    },
    {
        "id": "kb_matrix",
        "title": "策略矩阵 Policy Matrix",
        "kind": "term",
        "tags": ["策略矩阵", "权限", "编排"],
        "content": "策略矩阵是一张 N×N 的显式授权表，存在团队 JSON 的 policy_matrix 字段里。DAG 每条边在派发前逐格查表，不依赖模型自觉。"
        "三种取值：allow 放行、deny 拦截并发系统消息、require_approval 走人工门。"
        "保存团队时先做最佳实践校验，运行期再做一次拦截，形成双层防线。",
    },
    {
        "id": "kb_evidence",
        "title": "证据链 IterationRecord",
        "kind": "term",
        "tags": ["证据链", "可审计", "验收"],
        "content": "每轮循环写一条 IterationRecord：轮次、动作、验证结论、决策（continue / stop）、得分。"
        "前端据此渲染逐轮验证面板，评委可以逐轮追问为什么继续或停止。断点续跑时按最近一条记录恢复。",
    },
    {
        "id": "kb_logistics",
        "title": "轻小件跨境物流时效基线",
        "kind": "case",
        "tags": ["物流", "时效", "案例"],
        "content": "东南亚与中东轻小件通道，稳定的端到端时效为 7–12 天，其中清关占 2–4 天。"
        "超过 15 天的线路不建议进入首单演示，退货成本会侵蚀毛利。选品阶段应把时效作为硬约束写入验收标准。",
    },
    {
        "id": "kb_roles",
        "title": "Agent 团队角色分工基线",
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
        "name": "出海选品作战包",
        "summary": "7 天内给出可执行的选品结论、定价区间与首单路径",
        "detail": "输入目标市场与品类，交付一份含数据来源的选品报告：候选品清单、利润测算、"
        "竞品定价带、合规风险点、首单执行动作表（含负责人与时间窗）。",
        "price_cents": 9900,
        "team_id": TEAM_ID,
        "deliverable": "选品报告（Markdown/PDF）+ 执行动作表 + 数据来源清单",
        "eta_hint": "约 10 分钟自动完成",
    },
    {
        "id": "svc_compliance",
        "name": "合规预审快检",
        "summary": "上架前先过一遍红线，避免被平台下架",
        "detail": "针对目标市场做合规扫描：四眼原则、支付与退款时效、广告用语、资质要求，"
        "逐条给出是否通过及整改建议。",
        "price_cents": 4900,
        "team_id": TEAM_ID,
        "deliverable": "合规检查表 + 风险等级 + 整改清单",
        "eta_hint": "约 6 分钟自动完成",
    },
    {
        "id": "svc_content",
        "name": "内容转化包",
        "summary": "一套能直接投放的文案，含审校与合规双签",
        "detail": "基于产品卖点产出多版本文案（标题/详情页/短文案），经审校打分与合规过闸后才交付。",
        "price_cents": 2900,
        "team_id": TEAM_ID,
        "deliverable": "多版本文案 + 审校评分记录 + 合规结论",
        "eta_hint": "约 5 分钟自动完成",
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
    "name": "增长工场 Growth Studio",
    "industry": "AI 增长营销",
    "mission": "让本地小商家用得起专业营销：不卖方案，卖能验收的客流",
    "owner_name": "老板",
    "cash_cents": 200000,  # 启动资金 2000 元
}

DEPARTMENTS = [
    {"key": "gm", "name": "总经办", "charter": "目标拆解、项目排程、对外验收", "budget_cents": 60000},
    {"key": "strategy", "name": "品牌策略部", "charter": "定位、打法、质量与合规把关", "budget_cents": 80000},
    {"key": "market", "name": "市场研究部", "charter": "客群、竞品、转化数据", "budget_cents": 50000},
    {"key": "creative", "name": "创意制作部", "charter": "文案与视觉物料生产", "budget_cents": 70000},
    {"key": "client", "name": "客户成功部", "charter": "客户沟通、交付跟进、复购", "budget_cents": 40000},
]

STAFF = [
    {
        "key": "cos", "name": "陈明远", "role": "chief_of_staff", "title": "CEO 助理 · 项目经理",
        "dept": "gm", "seniority": "senior", "model": "claude-sonnet", "day_rate_cents": 2000,
        "skills": ["目标拆解", "项目排程", "跨部门协调", "验收汇总"],
        "tools": ["任务看板", "日程", "会议纪要"],
        "permissions": ["派发任务", "修改排期", "召集评审"],
        "prompt": "你是 CEO 助理。把老板的一句话目标拆成可执行、可验收的任务，标清依赖与卡点。"
                  "不做业务判断，只做拆解与推进；任何需要花钱或对外承诺的事一律上报老板。",
    },
    {
        "key": "research", "name": "林研", "role": "market_researcher", "title": "市场研究员",
        "dept": "market", "seniority": "senior", "model": "gpt-4o", "day_rate_cents": 1200,
        "skills": ["客群画像", "竞品分析", "需求洞察", "数据来源核查"],
        "tools": ["网页检索", "知识库", "表格"],
        "permissions": ["读取公开数据", "提交调研报告"],
        "prompt": "你是市场研究员。结论必须带可核查依据（来源、时间、口径），"
                  "禁止用「一般认为」这类无出处表述。调研不出结论时直接说缺什么数据。",
    },
    {
        "key": "brand", "name": "苏策", "role": "brand_strategist", "title": "品牌策划师",
        "dept": "strategy", "seniority": "senior", "model": "claude-sonnet", "day_rate_cents": 1800,
        "skills": ["品牌定位", "营销策略", "活动设计", "验收口径定义"],
        "tools": ["知识库", "案例库"],
        "permissions": ["制定策略", "定义验收标准"],
        "prompt": "你是品牌策划师。每个策略必须给出可量化的验收口径，"
                  "并说明为什么是这个打法而不是别的。避免堆砌形容词。",
    },
    {
        "key": "copy", "name": "何文", "role": "copywriter", "title": "文案运营",
        "dept": "creative", "seniority": "mid", "model": "deepseek-chat", "day_rate_cents": 800,
        "skills": ["社媒文案", "标题打磨", "活动话术", "多版本产出"],
        "tools": ["知识库", "文案模板"],
        "permissions": ["生产文案", "提交多版本"],
        "prompt": "你是文案运营。一次至少给两个标题方向，正文要能直接投放，不要写解释性文字。",
    },
    {
        "key": "design", "name": "江设", "role": "visual_designer", "title": "视觉设计师",
        "dept": "creative", "seniority": "mid", "model": "gemini-flash", "day_rate_cents": 1500,
        "skills": ["海报设计", "版式规范", "物料清单", "版权合规"],
        "tools": ["设计稿", "素材库"],
        "permissions": ["使用素材", "定义视觉规范"],
        "prompt": "你是视觉设计师。交付可执行的设计说明（尺寸、层级、字体、格式），"
                  "并主动标注版权风险点。",
    },
    {
        "key": "data", "name": "周数", "role": "data_analyst", "title": "数据分析师",
        "dept": "market", "seniority": "mid", "model": "deepseek-chat", "day_rate_cents": 1200,
        "skills": ["漏斗分析", "归因", "指标定义", "方案复测"],
        "tools": ["数据表", "计算器"],
        "permissions": ["读取业务数据", "提交分析结论"],
        "prompt": "你是数据分析师。先定义指标口径再给数字，缺少数据时要说明假设，"
                  "不允许编造占比。",
    },
    {
        "key": "account", "name": "沈客", "role": "account_manager", "title": "客户经理",
        "dept": "client", "seniority": "mid", "model": "gpt-4o", "day_rate_cents": 1000,
        "skills": ["客户沟通", "需求确认", "交付跟进", "复购推进"],
        "tools": ["客户档案", "日程"],
        "permissions": ["联系客户", "确认需求"],
        "prompt": "你是客户经理。只记录客户真实表达过的内容，不要代替客户做决定；"
                  "任何超出合同范围的承诺必须上报。",
    },
    {
        "key": "qa", "name": "陆审", "role": "quality_reviewer", "title": "质量审核",
        "dept": "strategy", "seniority": "senior", "model": "claude-sonnet", "day_rate_cents": 1400,
        "skills": ["完整性检查", "一致性核对", "可执行性评估"],
        "tools": ["检查清单"],
        "permissions": ["退回不合格产出"],
        "prompt": "你是质量审核。按完整性、一致性、可执行性三项打分，"
                  "不通过要写明缺什么，禁止只说「建议优化」。",
    },
    {
        "key": "legal", "name": "罗法", "role": "compliance_officer", "title": "合规审核",
        "dept": "strategy", "seniority": "senior", "model": "qwen-max", "day_rate_cents": 1600,
        "skills": ["广告法", "隐私合规", "资质审查", "风险定级"],
        "tools": ["法规库", "检查清单"],
        "permissions": ["否决对外物料", "要求补充说明"],
        "prompt": "你是合规审核。按风险等级给出结论（通过/有条件通过/否决），"
                  "有条件通过必须逐条列出补充要求。拿不准的宁可上报老板，不要放行。",
    },
]

# 增长营销剧本：一条流水线 + 一处并行 + 两个人工卡点
PLAYBOOK = [
    {"key": "plan", "title": "目标拆解与项目排程", "role": "chief_of_staff", "after": [],
     "risk": "low", "mode": "pipeline",
     "brief": "把老板的业务目标拆成可执行任务，标清依赖关系与验收卡点。"},
    {"key": "research", "title": "市场研究与竞品分析", "role": "market_researcher", "after": ["plan"],
     "risk": "low", "mode": "pipeline",
     "brief": "给出客群画像、竞品差异点和需求缺口，每条结论都要有依据。"},
    {"key": "brand", "title": "品牌定位与营销策略", "role": "brand_strategist", "after": ["research"],
     "risk": "low", "mode": "pipeline",
     "brief": "基于调研收敛定位与三段打法，定义可量化的验收口径。"},
    {"key": "copy", "title": "社媒内容制作", "role": "copywriter", "after": ["brand"],
     "risk": "low", "mode": "parallel",
     "brief": "产出可直接投放的社媒文案，至少两个标题方向。"},
    {"key": "design", "title": "视觉物料设计", "role": "visual_designer", "after": ["brand"],
     "risk": "medium", "mode": "parallel",
     "brief": "给出物料清单、尺寸规范与设计说明，标注版权风险。"},
    {"key": "data", "title": "转化漏斗分析", "role": "data_analyst", "after": ["copy", "design"],
     "risk": "low", "mode": "pipeline",
     "brief": "拆解曝光到复购的漏斗，指出最大流失环节与归因。"},
    {"key": "account", "title": "客户跟进与交付说明", "role": "account_manager", "after": ["data"],
     "risk": "low", "mode": "pipeline",
     "brief": "整理交付说明与下一步动作，写清客户确认项。"},
    {"key": "qa", "title": "质量复核", "role": "quality_reviewer", "after": ["account"],
     "risk": "low", "mode": "review",
     "brief": "按完整性、一致性、可执行性复核，不通过写明缺什么。"},
    {"key": "legal", "title": "合规审查与放行", "role": "compliance_officer", "after": ["qa"],
     "risk": "high", "mode": "review",
     "brief": "对外发布前的最后一道闸门，按风险定级给出结论。"},
]


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
