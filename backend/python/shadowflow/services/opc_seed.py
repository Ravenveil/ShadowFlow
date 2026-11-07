"""OPC 种子数据：默认经营的公司「增长工场」+ 三款可售服务。

移植自 backend-poc/app/seed_data.py 的 OPC OS 部分（demo_team / KB 词条
属于 ShadowFlow 既有团队体系，不在此重复；products 的 team_id 字段保留
以兼容表结构，但仅作展示归属标注，不再绑定旧版 DAG 团队）。
"""

from .opc_company import (
    create_company,
    create_department,
    get_company,
    hire,
    list_companies,
    set_department_head,
)
from .opc_store import init as db_init, list_products, save_product

# ------------------------------------------------------------------ 默认经营的公司

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

# 展示归属：商品的 team_id 字段保留表结构兼容，语义为「出品团队」标签
TEAM_TAG = "growth-studio"

PRODUCTS = [
    {
        "id": "svc_landing_sel",
        "name": "出海选品作战包",
        "summary": "7 天内给出可执行的选品结论、定价区间与首单路径",
        "detail": "输入目标市场与品类，交付一份含数据来源的选品报告：候选品清单、利润测算、"
                  "竞品定价带、合规风险点、首单执行动作表（含负责人与时间窗）。",
        "price_cents": 9900,
        "team_id": TEAM_TAG,
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
        "team_id": TEAM_TAG,
        "deliverable": "合规检查表 + 风险等级 + 整改清单",
        "eta_hint": "约 6 分钟自动完成",
    },
    {
        "id": "svc_content",
        "name": "内容转化包",
        "summary": "一套能直接投放的文案，含审校与合规双签",
        "detail": "基于产品卖点产出多版本文案（标题/详情页/短文案），经审校打分与合规过闸后才交付。",
        "price_cents": 2900,
        "team_id": TEAM_TAG,
        "deliverable": "多版本文案 + 审校评分记录 + 合规结论",
        "eta_hint": "约 5 分钟自动完成",
    },
]


def ensure_company():
    """建默认公司、部门、九名数字员工。已存在则不动，避免覆盖用户改动。"""
    existing = list_companies()
    if existing:
        return existing[0]

    company = create_company(
        COMPANY["name"], COMPANY["industry"], COMPANY["mission"],
        owner_name=COMPANY["owner_name"], cash_cents=COMPANY["cash_cents"],
    )

    dept_ids = {}
    for i, d in enumerate(DEPARTMENTS):
        dept = create_department(
            company["id"], d["name"], charter=d["charter"], budget_cents=d["budget_cents"], sort=i
        )
        dept_ids[d["key"]] = dept["id"]

    for s in STAFF:
        emp = hire(
            company["id"], s["name"], s["role"],
            department_id=dept_ids.get(s["dept"]),
            title=s["title"], seniority=s["seniority"],
            system_prompt=s["prompt"], skills=s["skills"], tools=s["tools"],
            permissions=s["permissions"], model_name=s["model"], day_rate_cents=s["day_rate_cents"],
        )
        # 部门负责人 = 该部门第一位入职的员工
        set_department_head(dept_ids.get(s["dept"]), emp["id"])

    return get_company(company["id"])


def ensure_seed():
    """初始化 OPC 存储 + 默认公司 + 商品目录。幂等，启动时调用。"""
    db_init()
    if not list_products():
        for product in PRODUCTS:
            save_product({**product, "currency": "CNY", "active": 1})
    return ensure_company()
