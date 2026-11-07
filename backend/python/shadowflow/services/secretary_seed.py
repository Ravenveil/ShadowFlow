"""内置秘书播种（2026-11-06，GrokBot「主Bot派活」范式；显示名同日定稿「总经理」）。

产品口径：
  - 用户第一次进产品就有一个贴身主控 Agent 可对话：接需求 → 拆活 →
    推荐招募员工/组建团队 → 派活 → 汇报。
  - 它的第一句话是常规欢迎语（SECRETARY_GREETING），播种时直接写进会话
    日志，用户点进来就有一条欢迎消息，而不是空会话。

幂等设计：
  - Agent 以固定 id ``agent-shadow-secretary`` 存于 .shadowflow/agents/，
    已存在（含被用户改过名/改过 soul）则**完全不碰**——用户编辑后重启不回滚。
  - 记录带 ``source: "secretary"`` 标记（AgentRecord.source union 前端扩展），
    前端据此渲染常驻入口与去重。
  - DM 会话在用户首次 resolve 时由 groups.resolve_dm_conversation 预置问候，
    这里不预建会话（避免在用户没进过产品时就占一条侧栏会话行）。

失败策略：任何异常只告警不阻塞启动（与 opc_seed 同款纪律）。
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger("shadowflow.secretary")

# 固定 id：幂等锚点（不随改名变动，改 id 会孤儿化存量会话）。
# alllowlist 正则 ^[a-zA-Z0-9_-]+$ 兼容。
SECRETARY_AGENT_ID = "agent-shadow-secretary"
SECRETARY_NAME = "总经理"
# 发给用户的开场白（2026-11-07：改「手工艺品代卖」主线开场——问想卖什么，
# 引导发文字/图片/产品文档，并说明素材自动同步知识库可随时调用）。
SECRETARY_GREETING = (
    "你好，我是你的总经理。想卖什么手工艺品？把产品介绍发给我吧——"
    "文字（产品介绍）、图片、或者产品文档都行，发来的素材会自动同步到知识库，"
    "之后可以随时调用知识库功能来辅助回答和推广。其他想做的事也尽管吩咐。"
)

# soul 按 GrokBot「主Bot派活」精神写：接需求 → 拆活 → 招人/组队 → 派活 → 汇报。
# 2026-11-07：加「手工艺品代卖」主线（主控代卖团队：搭建/派活/登记业务动作）。
# 2026-11-08：对齐「AI 营销公司」组织架构图——AI 总经理 CEO（理解目标·拆解任务·
# 调度员工·汇总结果）+ 6 部门核心员工；控制点（合规打回/品牌定稿与对外发布审批）
# 写进 soul。
SECRETARY_SOUL = (
    "你是「总经理」（AI 总经理 CEO），AI 营销公司的统管者，向创始人（=董事长）汇报。"
    "你的职责：1) 理解创始人的业务目标与关键审批意见；2) 把目标拆解为可执行任务；"
    "3) 按部门统一派单调度员工；4) 汇总六部门成果向创始人回传。"
    "你的风格：简洁、可靠、有分寸。老板不在场时守好大本营，老板发话时便使唤动。"
    "\n【当前主线：手工艺品代卖】帮手艺人卖手工艺品——对方只需上架商品，"
    "我们负责品牌策划、商品文案、营销推广、联系快递员寄出，并把订单/盈利/快递"
    "情况同步到平台。"
    "\n开场引导：先问用户想卖什么手工艺品，引导用户发送产品素材——文字（产品介绍）、"
    "图片、或者产品文档都行；并告诉用户素材会自动同步到知识库，之后可随时调用"
    "知识库功能辅助回答和推广。"
    "\n你主控「手工艺品代卖团队」（6 部门核心员工：市场分析师（市场研究部）、"
    "品牌策划师（品牌策划部）、内容策划师（内容创作部）、运营专员（电商运营部）、"
    "商务专员（商务拓展部）、合规审核员（风控审核部））：团队不存在时输出 "
    "[build-team] 标记搭建团队；把活派给团队时输出 [dispatch] 标记（to 写派给谁、"
    "text 写干什么，可一次派给多人）；登记业务动作用 [intake]（上架）/[order]"
    "（出单）/[ship]（寄出）/[report]（盈利汇报）。"
    "\n【输出协议】需要登记业务动作时，回复里输出独占一行的标记（JSON 紧凑单行，"
    "金额单位「元」）："
    "\n[build-team] {} ——搭建手工艺品代卖团队（已存在则复用）"
    "\n[dispatch] {\"to\":\"市场分析师、品牌策划师\",\"text\":\"任务说明\"} ——把活派给团队"
    "\n[intake] {\"name\":\"商品名\",\"price\":68,\"cost\":20,\"shipping\":8}"
    " ——上架商品（售价/成本/快递费）"
    "\n[order] {\"product\":\"商品名\",\"qty\":2} ——登记销售出单"
    "\n[ship] {\"product\":\"商品名\",\"qty\":2,\"tracking\":\"SF123\",\"receiver\":\"张三\",\"phone\":\"13800138000\",\"address\":\"…\"} ——寄出商品"
    "\n[report] {\"summary\":\"盈利汇报摘要\"} ——输出盈利汇报"
    "\n标记会自动落到「产品盈利」看板并从聊天里隐藏；除此之外正常用中文输出给用户。"
    "\n定价信息（售价/成本/快递费）由界面固定提问卡收集——用户发来产品图片后"
    "提问卡会自动弹出，不要在回复里重复提问这三项，等用户回答后直接 [intake] "
    "登记上架（我们是手艺人自己在平台营销售卖：成本就是制作成本，没有给手艺人"
    "分成和营销分摊）。"
    "\n【控制点】合规审核员可打回并阻断高风险内容；品牌定稿与对外发布须创始人"
    "（董事长）人工批准后才继续；资金操作由人负责，你只做方案与汇总，不执行任何"
    "资金动作。"
)

_AGENTS_DIR = Path(__file__).resolve().parents[4] / ".shadowflow" / "agents"


def _agents_dir() -> Path:
    _AGENTS_DIR.mkdir(parents=True, exist_ok=True)
    return _AGENTS_DIR


def ensure_secretary() -> Dict[str, Any] | None:
    """幂等播种内置秘书。已存在则返回 None；新建则返回记录 dict。

    注意：与 agents.py 的 _save_agent 不同，这里不做 path-traversal 校验
    （固定常量 id，无用户输入），保持模块零依赖（不 import fastapi）。
    """
    target = _agents_dir() / f"{SECRETARY_AGENT_ID}.json"
    if target.exists():
        return None  # 幂等：用户可能已改名/改 soul，绝不覆盖

    now = datetime.now(timezone.utc).isoformat()
    record: Dict[str, Any] = {
        "agent_id": SECRETARY_AGENT_ID,
        "name": SECRETARY_NAME,
        "soul": SECRETARY_SOUL,
        "workspace_id": None,  # 全工作区可见（listAgents 不带过滤时返回）
        "blueprint": {
            "name": SECRETARY_NAME,
            "goal": SECRETARY_SOUL,
            "role_profiles": [],
            "tool_policies": [],
            "metadata": {"source": "secretary"},
        },
        "status": "idle",
        "source": "secretary",
        "created_at": now,
        "avatar_color": None,
        "claw_id": None,
        "avatar_style": "lorelei",
        # 固定 seed：头像稳定不随 hash 抖动（2026-11-06 换默认头像：
        # dylan 大汉款 → lorelei·mishu 暖笑亲和款）。
        "avatar_seed": "mishu",
        "avatar_image": None,
    }
    target.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
    return record
