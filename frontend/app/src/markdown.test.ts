/**
 * markdown.test.ts — Markdown 子集解析器用例（node:test）。
 *
 * 运行（零依赖，Node ≥ 22.6 自带类型剥离）：
 *   node --experimental-strip-types --test src/markdown.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, safeHref, stripMarkdown, type MdBlock, type MdInline } from "./markdown.ts";

function plain(inls: MdInline[]): string {
  return inls
    .map((x) => {
      switch (x.t) {
        case "text":
        case "code":
          return x.v;
        case "br":
          return "\n";
        default:
          return plain(x.c);
      }
    })
    .join("");
}

test("行内语法：粗体/斜体/删除线/行内码/链接/裸 URL", () => {
  const blocks = parseMarkdown("**粗** *斜* ~~删~~ `码` [站](https://a.com) https://b.com");
  assert.equal(blocks.length, 1);
  const p = blocks[0];
  assert.equal(p.t, "p");
  if (p.t !== "p") return;
  const kinds = p.c.map((x) => x.t);
  assert.deepEqual(kinds, ["strong", "text", "em", "text", "del", "text", "code", "text", "link", "text", "link"]);
  const strong = p.c[0];
  if (strong.t === "strong") assert.equal(plain(strong.c), "粗");
  const link = p.c[8];
  if (link.t === "link") {
    assert.equal(link.href, "https://a.com");
    assert.equal(plain(link.c), "站");
  }
  const bare = p.c[10];
  if (bare.t === "link") assert.equal(bare.href, "https://b.com");
});

test("中文粗体与尾随标点（截图消息形态）", () => {
  const blocks = parseMarkdown("请先回复第 1 个问题： **你想卖的这件东西是什么？**");
  const p = blocks[0];
  assert.equal(p.t, "p");
  if (p.t !== "p") return;
  const last = p.c[p.c.length - 1];
  assert.equal(last.t, "strong");
  if (last.t === "strong") assert.equal(plain(last.c), "你想卖的这件东西是什么？");
});

test("裸 URL 尾随标点剥回正文", () => {
  const p = parseMarkdown("看 https://a.com/x。")[0];
  if (p.t !== "p") throw new Error("not p");
  assert.deepEqual(p.c.map((x) => x.t), ["text", "link", "text"]);
  const link = p.c[1];
  if (link.t === "link") {
    assert.equal(link.href, "https://a.com/x");
    assert.equal(plain([link]), "https://a.com/x");
  }
  assert.equal(plain([p.c[2]]), "。");
});

test("safeHref 白名单：javascript: 拒绝", () => {
  assert.equal(safeHref("https://a.com"), "https://a.com");
  assert.equal(safeHref("mailto:a@b.com"), "mailto:a@b.com");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,x"), null);
});

test("段内单换行保留为 br", () => {
  const p = parseMarkdown("第一行\n第二行")[0];
  if (p.t !== "p") throw new Error("not p");
  assert.deepEqual(p.c.map((x) => x.t), ["text", "br", "text"]);
});

test("标题/hr/引用/围栏码", () => {
  const blocks = parseMarkdown("## 标题\n---\n> 引用一行\n```js\nconst a = 1;\n```");
  assert.deepEqual(
    blocks.map((b) => b.t),
    ["h", "hr", "quote", "code"],
  );
  const h = blocks[0];
  if (h.t === "h") assert.equal(h.level, 2);
  const code = blocks[3];
  if (code.t === "code") {
    assert.equal(code.lang, "js");
    assert.equal(code.v, "const a = 1;");
  }
});

test("有序列表：编号起始 + 粗体项 + 嵌套无序列表", () => {
  const blocks = parseMarkdown("2. **卖什么**——产品？\n3. 目标客户\n   - 手作爱好者\n   - 礼品采购");
  assert.equal(blocks.length, 1);
  const list = blocks[0];
  if (list.t !== "list") throw new Error("not list");
  assert.equal(list.ordered, true);
  assert.equal(list.start, 2);
  assert.equal(list.items.length, 2);
  const first = list.items[0][0];
  if (first.t === "p") assert.equal(first.c[0].t, "strong");
  const nested = list.items[1].find((b) => b.t === "list");
  assert.ok(nested, "第 2 项内应有嵌套无序列表");
  if (nested && nested.t === "list") assert.equal(nested.items.length, 2);
});

test("表格：对齐标记 + 少格补空/多格裁掉", () => {
  const blocks = parseMarkdown("|顺序|任务|负责|\n|:--|:-:|--:|\n|①|市场摸底|市场分析师|多余|\n|②|品牌定位|");
  const table = blocks[0];
  if (table.t !== "table") throw new Error("not table");
  assert.deepEqual(table.align, ["left", "center", "right"]);
  assert.equal(plain(table.head[0]), "顺序");
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0].length, 3); // 多余列裁掉
  assert.equal(plain(table.rows[1][2]), ""); // 缺格补空
});

test("截图全形态混合消息：段落/列表/表格分块正确", () => {
  const sample = [
    "**必须澄清的 4 个问题：**",
    "1. **卖什么**——具体产品是什么？",
    "2. **目标客户**——卖给谁？",
    "",
    "**建议执行顺序（信息齐后立即派单）：**",
    "|顺序|任务|负责|",
    "|---|---|---|",
    "|①|市场与竞品摸底|市场分析师|",
    "|②|品牌定位|品牌策划师|",
    "",
    "请先回复第 1 个问题： **你想卖的这件东西是什么？**",
  ].join("\n");
  const blocks = parseMarkdown(sample);
  assert.deepEqual(
    blocks.map((b) => b.t),
    ["p", "list", "p", "table", "p"],
  );
  const table = blocks[3];
  if (table.t === "table") assert.equal(table.rows.length, 2);
});

test("stripMarkdown 剥语法取纯文本", () => {
  const out = stripMarkdown("**标题**\n- 项目 `x` [链接](https://a.com)\n|a|b|\n|-|-|\n|1|2|");
  assert.ok(!out.includes("**"), "不应残留 **");
  assert.ok(!out.includes("|"), "不应残留表格竖线");
  assert.ok(out.includes("标题"));
  assert.ok(out.includes("项目 x 链接"));
});

test("单星不成对不当斜体（数字运算不误伤）", () => {
  const p = parseMarkdown("2*3*4")[0];
  if (p.t !== "p") throw new Error("not p");
  assert.ok(p.c.every((x) => x.t !== "em"), "2*3*4 不应解析出斜体");
});

test("列表后无缩进行不吞进末项（聊天风格收口）", () => {
  const blocks = parseMarkdown("1. 甲\n**小结**：完了");
  assert.deepEqual(
    blocks.map((b) => b.t),
    ["list", "p"],
  );
  const p = blocks[1];
  if (p.t === "p") assert.equal(p.c[0].t, "strong");
});

test("空文本返回空块列表", () => {
  assert.deepEqual(parseMarkdown(""), [] as MdBlock[]);
  assert.equal(stripMarkdown(""), "");
});
