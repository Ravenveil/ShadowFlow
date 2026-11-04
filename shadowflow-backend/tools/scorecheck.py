"""评分口径自检：确认「好稿不被冤枉」，也确认「空话照样过不去」。

为什么单独一个工具：v0.4.6 的真实事故是一篇 364 字、能直接发的小红书文案被判 46 分
不及格，客户侧看到「自检 46 分 · 退回补」。原因不在模型，在尺子：对题按逐字比对
（正文没写「小红书」「300 字」就算没答上来）、数字只认「个/天/元」、文案的
「现在预订」这种 CTA 不认。改完必须两头都验：好稿放行、空话仍拦住。

用法：python tools/scorecheck.py    退出码 0 = 口径没跑偏
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import orders, quality  # noqa: E402

REQ_BAKERY = "给一家烘焙店写中秋新品的小红书文案，300 字左右"

# v0.4.6 真模型交出来的那篇（364 字），被判 46 分。它本身是合格的投放文案。
GOOD_COPY = """中秋上新｜这家烘焙店的月饼我提前订了三盒

每年中秋前最头疼的就是选月饼，太甜的吃两口就腻，包装好看的又怕不好吃。上周路过常去的那家烘焙店，发现他们中秋新品已经上了，老板让我试了半块刚出炉的，当场就订了三盒。

先说最惊喜的流心奶黄。切开是真的会流，不是那种放凉了就凝固的假流心。咸蛋黄的味道很正，甜度压得比较低，我一口气吃完一整个也没觉得齁。老板说馅料是当天现调的，每天限量，卖完就没了。

第二款是低糖五仁。我知道很多人听到五仁就摇头，但这个真的不一样。坚果是整颗的，咬下去很香，没有那种廉价的糖浆味。家里长辈应该会喜欢，我准备给爸妈带一盒。

还有一款桂花乌龙，茶味很清爽，适合配下午茶。包装是简约的纸盒，送人不掉价，自己吃也不心疼。

现在预订有早鸟价，比中秋前买划算。店就在老地方，想订的可以早点去，流心那款真的抢手。"""

# 空话：句式漂亮，一个具体信息都没有，也没有把读者往下带
EMPTY_TALK = """在这个快速变化的时代，我们始终坚持用心做好每一件事。
品质是我们的底线，服务是我们的初心，创新是我们的动力。
我们相信，只有真正理解客户，才能做出打动人心的产品。
未来，我们将继续深耕行业，与更多伙伴一起成长，共同创造更大的价值。
选择我们，就是选择放心。"""

# 抒情：文字很好，但客户要的是能发的投放文案，不是散文
LYRIC = """秋风起了，桂花落在案板上，像一层薄薄的月光。
面团在掌心慢慢变软，烤箱亮起橘色的光，整个屋子都是甜的。
我记得小时候，外婆总在中秋前一夜开始忙，她说月亮圆的时候，人心也该是圆的。
如今我也站在同样的位置，看着同样的月亮，只是身边的人换了一批又一批。
愿每一个团圆的日子，都有人陪你吃一块刚出炉的月饼。"""

# 跑题：文字完整、有细节，但客户要烘焙，交的是健身课
OFF_TOPIC = """这家健身房的私教课值得报，教练姓陈，带过三个减脂营。
我第一次去是三月，体脂 28%，现在 21%，靠的是每周三次、每次一小时的力量训练。
课程按 12 节一买，一节 300 元，比商场里那些连锁便宜一半。
想试的可以先约一节体验课，前台报我的名字能免 99 元。"""

# 咨询报告：本来就该铺数字、写步骤、提风险，不能按文案的尺子判
GOOD_REPORT = """一、先定切口
轻小件里先做「单价 30–80 元、重量 200 克以内、不带电不带液」这一档，退货率能压在 5% 以内。
二、七天怎么跑
第 1–2 天选 20 个候选，按 1688 起订量、毛利空间、是否可空运三条筛到 6 个。
第 3–4 天各拍 3 组主图，跑小额测试，每个 SKU 预算 100 元，看点击率和加购率。
第 5–7 天留下加购率超过 8% 的 2 个，其余砍掉，别舍不得。
三、成本与时效
头程走空运，7–12 天到仓，单件运费 12–18 元；定价按成本 3 倍起，留出 20% 的广告位。
四、风险提示
先小批量试单，别一次性压 500 件以上；带电池、带品牌 logo 的品类不要碰，容易被扣关。"""


def _score_item(report, key):
    for item in report["items"]:
        if item["key"] == key:
            return item
    return {}


def main():
    bad = []

    def fail(msg):
        bad.append(msg)
        print(f"  FAIL {msg}")

    # ① 好稿必须放行：分数够、四项里对题满分、能照做和收口都不能是 0
    r = quality.check(GOOD_COPY, REQ_BAKERY, "svc_content")
    print(f"  好文案：{r['score']} 分 · {r['level']} · 对题 {_score_item(r, 'topic')['note']}"
          f" · {_score_item(r, 'actionable')['note']} · {_score_item(r, 'closing')['note']}")
    if not r["passed"]:
        fail(f"好文案被判不及格（{r['verdict']}）")
    if r["score"] < 85:
        fail(f"好文案分数偏低（{r['score']}），尺子还是偏严")
    if _score_item(r, "actionable")["score"] == 0:
        fail("好文案「能照做」仍是 0 分：中文量词（三盒/半块）没算成具体信息")
    if _score_item(r, "closing")["score"] == 0:
        fail("好文案「有交代」仍是 0 分：CTA（现在预订/早点去）没被认出来")

    # ② 对题不该被「文案 / 小红书 / 300 字」这类格式词拖累
    if r["topic_ratio"] < 0.85:
        fail(f"对题率只有 {r['topic_ratio']:.2f}：格式词（形态/篇幅/平台）还在算作未命中")

    # ②b 口径版本号必须在报告里：没有它，改完口径老单不会重算，两套分数并存
    if r.get("rules") != quality.RULES_VERSION:
        fail(f"报告缺口径版本号（{r.get('rules')} != {quality.RULES_VERSION}），老单不会自动重算")

    # ③ 空话、抒情、跑题：该拦住的必须拦住
    for name, text, want_pass in (
        ("空话", EMPTY_TALK, False),
        ("纯抒情", LYRIC, False),
        ("跑题", OFF_TOPIC, False),
    ):
        rr = quality.check(text, REQ_BAKERY, "svc_content")
        print(f"  {name}：{rr['score']} 分 · {rr['level']}")
        if rr["passed"] != want_pass:
            fail(f"{name}判定反了（{rr['score']} 分、passed={rr['passed']}）")

    # ④ 咨询报告不能被文案的尺子误伤
    rr = quality.check(GOOD_REPORT, "东南亚轻小件怎么选品，7天跑通首单", "svc_landing_sel")
    print(f"  咨询报告：{rr['score']} 分 · {rr['level']}")
    if not rr["passed"]:
        fail(f"合格咨询报告被判不合格（{rr['verdict']}）")

    # ⑤ 篇幅区间不能自相矛盾（曾出现「底线 480 / 上限 450」）
    for label, report in (("好文案", r), ("咨询报告", rr)):
        ln = report.get("length") or {}
        if ln.get("floor") and ln.get("ceiling") and ln["floor"] > ln["ceiling"]:
            fail(f"{label}的篇幅区间自相矛盾：底线 {ln['floor']} > 上限 {ln['ceiling']}")

    # ⑥ 返工必须派给写稿的人，不是「字数最长的那段」
    tasks = [
        {"id": "t_copy", "title": "写三版文案", "assignee_employee_id": "e_copy",
         "output": {"text": "真正要交付的文案" * 20}},
        {"id": "t_pic", "title": "配图怎么配", "assignee_employee_id": "e_pic",
         "output": {"text": "配图建议" * 400}},
    ]
    roles = {"e_copy": "copywriter", "e_pic": "visual_designer"}
    picked = orders._pick_rework_target(tasks, roles)
    print(f"  返工目标：{picked['title']}")
    if picked["id"] != "t_copy":
        fail("返工派错了人：挑的是字数最长的那段，不是写稿的人")

    print()
    if bad:
        print(f"评分口径有问题：{len(bad)} 项不符预期")
        return 1
    print("评分口径稳定：好稿放行、空话拦住、返工找对人")
    return 0


if __name__ == "__main__":
    sys.exit(main())
