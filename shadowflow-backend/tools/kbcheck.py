"""知识库分域自检：员工只该查到自己这单用得上的手册。

起因：写烘焙文案的任务，检索结果里混着「出海选品四步」「小件跨境几天到」，
被整段塞进提示词。成品没跑偏是模型自己忽略的结果，不是系统的设计。
改成按「本单服务 + 本岗位」过滤之后，要能证明三件事：

  · 该查不到的查不到（跨境词条不进内容岗的提示词）
  · 该查得到的还查得到（选品单必须命中选品手册，通用词条谁都能用）
  · 老调用方式不被搞坏（管理台全库搜、无上下文的老库）

用法：python tools/kbcheck.py     退出码 0 = 分域没跑偏
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import db, kb  # noqa: E402


def titles(hits):
    return [h["entry_id"] for h in hits]


def main():
    bad = []

    def fail(msg):
        bad.append(msg)
        print(f"  FAIL {msg}")

    # 老库第一次跑这个脚本时，种子的适用范围还没回填（回填在服务启动时做）。
    # 脚本要能独立跑：先建表/补列，再回填，再重建索引。
    db.init()
    kb.backfill_scope()
    kb.build_index(force=True)

    # ① 内容岗 + 内容服务：不该捞到跨境选品 / 物流
    res = kb.search("麦香烘焙 门店 中秋 新品 文案 需求拆解", top_k=4,
                    service_id="svc_content", role="copywriter")
    got = titles(res["hits"])
    print(f"  内容岗（烘焙文案）：{got}")
    for bad_id in ("kb_selection", "kb_logistics"):
        if bad_id in got:
            fail(f"内容岗仍然查到了跨行业词条 {bad_id}")

    # ② 该查到的必须查到：选品单要命中选品手册
    res2 = kb.search("东南亚轻小件怎么选品，7天跑通首单", top_k=4,
                     service_id="svc_landing_sel", role="market_researcher")
    got2 = titles(res2["hits"])
    print(f"  选品单（市场研究）：{got2}")
    if "kb_selection" not in got2:
        fail("选品单没命中选品手册：分域把该给的也挡掉了")

    # ③ 岗位专属词条不跨岗：四眼原则只给审核/合规，收款只给客户经理
    res3 = kb.search("写稿和审核为什么必须两个人 收款怎么算到账", top_k=6,
                     service_id="svc_content", role="copywriter")
    got3 = titles(res3["hits"])
    print(f"  文案岗查风控/收款：{got3}")
    for bad_id in ("kb_four_eyes", "kb_payment"):
        if bad_id in got3:
            fail(f"文案岗查到了不属于它的岗位词条 {bad_id}")

    # ④ 通用词条谁都能用（返工/证据/分工）—— 分域不能把常识也锁起来
    res4 = kb.search("做不好怎么返工 每一步怎么留记录", top_k=4,
                     service_id="svc_content", role="copywriter")
    got4 = titles(res4["hits"])
    print(f"  通用词条：{got4}")
    if not ({"kb_loop", "kb_evidence"} & set(got4)):
        fail("通用词条被误挡：返工/证据链本来对任何岗位都有用")

    # ⑤ 向后兼容：不传上下文（管理台全库搜）时，行为与分域前一致
    res5 = kb.search("出海选品怎么做", top_k=4)
    if "kb_selection" not in titles(res5["hits"]):
        fail("管理台全库搜查不到选品手册：分域把「不筛」也筛了")

    # ⑥ 没有订单上下文的项目（service_id 取不到）不该拿到服务专属词条
    res6 = kb.search("出海选品怎么做 小件跨境几天到", top_k=6, service_id="", role="")
    if set(titles(res6["hits"])) & {"kb_selection", "kb_logistics"}:
        fail("没有服务上下文时仍召回服务专属词条（等于没分域）")

    # ⑦ 归档词条不再参与召回，但记录还在
    archived = [e for e in db.all_kb() if e.get("archived")]
    res7 = kb.search("fuzz", top_k=8)
    leaked = [h["entry_id"] for h in res7["hits"] if h["entry_id"] in {a["id"] for a in archived}]
    print(f"  归档词条 {len(archived)} 条，检索命中 {len(leaked)} 条")
    if leaked:
        fail(f"归档词条仍在召回：{leaked[:3]}")

    # ⑧ 分域不能把结果清空：内容岗在内容服务下，至少还能查到内容手册
    if not res["hits"]:
        fail("内容岗在内容服务下一条词条都查不到：过滤条件过严")

    # ⑨ 别的进程改了库，正在跑的服务要立刻看得见（索引指纹）。
    #    这条曾经是真事故：脚本归档了词条，服务还拿旧索引召回，状态里出现「11 条有效 / 11 条归档」。
    tmp_id = "kb_selfcheck_tmp"
    db.upsert_kb({"id": tmp_id, "title": "指纹验证词条", "content": "关键词：蓝莓司康", "kind": "term"})
    if tmp_id not in titles(kb.search("蓝莓司康", top_k=3)["hits"]):
        fail("新增词条后检索不到：索引没跟着库变")
    db.set_kb_scope(tmp_id, archived=True)
    # 注意：这里故意不调 reindex，模拟「另一个进程改了库、本进程没收到通知」
    if tmp_id in titles(kb.search("蓝莓司康", top_k=3)["hits"]):
        fail("词条归档后仍在召回：索引不会自己发现库变了")

    print()
    if bad:
        print(f"知识库分域有问题：{len(bad)} 项不符预期")
        return 1
    print("知识库分域稳定：跨行业的查不到，本行业的查得到，通用词条不被锁")
    return 0


if __name__ == "__main__":
    sys.exit(main())
