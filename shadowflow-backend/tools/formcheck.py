"""形态贴合自检：确认「字数对、东西不对」拦得住，也确认不会误伤正常交付。

为什么单独一个工具：这一项最容易两头出错——
  · 太松：客户要文案，交上去一份工作计划，照样 100 分；
  · 太紧：正常的方案/报告也被判「工作底稿」，好单子被打回。
两边的样本都写死在下面，改判定规则后跑一遍，退出码 0 才算没改坏。

用法：python tools/formcheck.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import quality  # noqa: E402

COPY_REQ = "帮我写一篇 500 字左右的推广文案，讲智能办公工具对小商家的价值，发朋友圈和社群"
PLAN_REQ = "给我一份小商家智能办公的落地方案，要有三个阶段和预算"

# 真模型 v0.4.3 交出来的那篇（节选）：客户要文案，它给了一篇文案
GOOD_COPY = """很多小商家不是不会卖货，是每天被琐事拖住了手。订单散在微信、表格、平台后台，
客户问一句“发货没”，要翻三遍记录；晚上想复盘一天卖了多少、哪款该补货，数据还没凑齐，人已经困了。
智能办公工具的价值，不是让你多学一个软件，而是把这些重复动作接过去：订单自动汇总，
库存变动有提醒，客户常见问题有统一话术，日报周报到点生成。
你省下来的不是几分钟，是每天能多想一步生意的时间。
增长工场服务小商家时发现，真正跑得快的店，往往不是人手多，而是把“记、查、回、跟”这几件事交给了工具。
工具不替你选品，也不替你谈客户，但它能让你在同样一天里，多回十个咨询、多盯一次库存、多睡一小时。
小生意的增长，常常就是从少做一点杂事开始的。
如果你也在被订单和消息追着跑，先从一件最耗时间的事交给工具试试，别急着上全套，
跑通一个动作，比装十个应用更有用。朋友圈发的时候配一张自己店里的实拍图，社群发的时候加一句今天的新货，
效果比纯文字好得多。"""

# 客户要文案，交上来是一份工作计划：字数再准也不能发
DRAFT_AS_COPY = """一、需求拆解
客户要的是三天内出一版能发的推广文案，主投朋友圈和社群，预算 3000 元以内。
二、卖点分析
1. 自动汇总订单，一天省两小时。
2. 库存预警，少压货。
三、执行步骤
第一步调研，第二步定角度，第三步出三版备选。
四、验收标准
每条卖点必须带一个可核对的数字，复核通过才能交付。
五、配图建议
建议用实拍图两张，价格标签要露出。"""

# 客户要的就是方案：分章节、写预算、写风险，是本职不是跑偏
GOOD_PLAN = """一、先定方向
三个月内把线上订单做起来，先不扩张品类。
二、执行步骤
1. 第一个月重做商品页，主图三张、详情页五屏。
2. 第二个月开两个渠道，各投 1500 元测试。
3. 第三个月按转化数据砍掉差的那个。
三、预算
每月 3000 元投放，人力不新增。
四、风险提示
先小规模测试，别一次性压货，库存周转控制在 45 天以内。"""

CASES = [
    ("正常文案：应判形态对得上", GOOD_COPY, COPY_REQ, "copy", True),
    ("工作底稿冒充文案：应判形态不对", DRAFT_AS_COPY, COPY_REQ, "copy", False),
    ("客户要方案：方案分章节不算跑偏", GOOD_PLAN, PLAN_REQ, "plan", True),
    ("客户没指定形态：不判", GOOD_COPY, "帮我把店里的问题理一理", None, True),
    ("文案类需求但客户其实要清单：按清单判", GOOD_COPY, "列一个开店前要准备的清单", "list", True),
]


def main():
    bad = 0
    for name, text, req, want_form, want_fit in CASES:
        report = quality.check(text, req, "svc_content")
        form = report["form"]
        ok = form["wanted"] == want_form and form["mismatch"] == (not want_fit)
        print(
            f"  {'OK  ' if ok else 'FAIL'} {name}\n"
            f"       形态={form['wanted']} fit={form['fit']} 分数={report['score']} "
            f"等级={report['level']}｜{form['note']}"
        )
        if not ok:
            bad += 1

    # 形态不对必须真的拦下来，不能只是「提示一下」
    r = quality.check(DRAFT_AS_COPY, COPY_REQ, "svc_content")
    if r["passed"] or r["score"] > 55:
        print(f"  FAIL 形态不对却仍算通过（分数 {r['score']}、passed={r['passed']}）")
        bad += 1
    else:
        print(f"  OK   形态不对被拦下：{r['verdict']}")

    # 反过来：好文案不能被打回（90 分以上才算没误伤）
    r = quality.check(GOOD_COPY, COPY_REQ, "svc_content")
    if not r["passed"] or r["score"] < 90:
        print(f"  FAIL 正常文案被误伤（分数 {r['score']}）")
        bad += 1
    else:
        print(f"  OK   正常文案放行：{r['score']} 分")

    print()
    if bad:
        print(f"形态判定有问题：{bad} 项不符预期")
        return 1
    print("形态判定稳定：该拦的拦住了，该放的放行了")
    return 0


if __name__ == "__main__":
    sys.exit(main())
