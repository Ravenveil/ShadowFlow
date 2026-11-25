/**
 * markdown.test.ts — Markdown 子集解析器回归网（vitest）。
 *
 * 用例从 app 的 node:test 版逐条搬来（断言换成 expect，语义不变）：
 * 这类解析器最容易「悄悄坏」——某一版正则改错了，页面上只是少了个粗体，
 * 不会报错。所以行内、块级、表格、列表收口、纯文本剥离各钉一组。
 */
import { describe, expect, it } from 'vitest';
import { parseMarkdown, safeHref, stripMarkdown, type MdBlock, type MdInline } from '@/shared/data/markdown';

/** 把行内节点拼成纯文本，便于断言内容而非结构。 */
function plain(inls: MdInline[]): string {
  return inls
    .map((x) => {
      switch (x.t) {
        case 'text':
        case 'code':
          return x.v;
        case 'br':
          return '\n';
        default:
          return plain(x.c);
      }
    })
    .join('');
}

/** 取第一个段落块（多数用例都是单段）。 */
function firstP(text: string): Extract<MdBlock, { t: 'p' }> {
  const p = parseMarkdown(text)[0];
  if (p.t !== 'p') throw new Error(`期望段落，实际是 ${p.t}`);
  return p;
}

describe('行内语法', () => {
  it('粗体 / 斜体 / 删除线 / 行内码 / 链接 / 裸 URL 各就各位', () => {
    const p = firstP('**粗** *斜* ~~删~~ `码` [站](https://a.com) https://b.com');
    expect(p.c.map((x) => x.t)).toEqual([
      'strong',
      'text',
      'em',
      'text',
      'del',
      'text',
      'code',
      'text',
      'link',
      'text',
      'link',
    ]);
    const strong = p.c[0];
    expect(strong.t === 'strong' ? plain(strong.c) : '').toBe('粗');
    const link = p.c[8];
    expect(link.t === 'link' ? link.href : '').toBe('https://a.com');
    expect(link.t === 'link' ? plain(link.c) : '').toBe('站');
    const bare = p.c[10];
    expect(bare.t === 'link' ? bare.href : '').toBe('https://b.com');
  });

  it('中文粗体与尾随标点（Agent 常见句式）', () => {
    const p = firstP('请先回复第 1 个问题： **你想卖的这件东西是什么？**');
    const last = p.c[p.c.length - 1];
    expect(last.t).toBe('strong');
    expect(last.t === 'strong' ? plain(last.c) : '').toBe('你想卖的这件东西是什么？');
  });

  it('裸 URL 尾随的中文标点要剥回正文', () => {
    const p = firstP('看 https://a.com/x。');
    expect(p.c.map((x) => x.t)).toEqual(['text', 'link', 'text']);
    const link = p.c[1];
    expect(link.t === 'link' ? link.href : '').toBe('https://a.com/x');
    expect(plain([p.c[2]])).toBe('。');
  });

  it('单星不成对时不当斜体（2*3*4 不能被吃掉）', () => {
    const p = firstP('2*3*4');
    expect(p.c.every((x) => x.t !== 'em')).toBe(true);
  });

  it('safeHref 白名单：伪协议一律拒绝', () => {
    expect(safeHref('https://a.com')).toBe('https://a.com');
    expect(safeHref('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
  });

  it('段内单换行保留为 br（聊天习惯）', () => {
    expect(firstP('第一行\n第二行').c.map((x) => x.t)).toEqual(['text', 'br', 'text']);
  });
});

describe('块级结构', () => {
  it('标题 / hr / 引用 / 围栏代码块', () => {
    const blocks = parseMarkdown('## 标题\n---\n> 引用一行\n```js\nconst a = 1;\n```');
    expect(blocks.map((b) => b.t)).toEqual(['h', 'hr', 'quote', 'code']);
    const h = blocks[0];
    expect(h.t === 'h' ? h.level : 0).toBe(2);
    const code = blocks[3];
    expect(code.t === 'code' ? code.lang : '').toBe('js');
    expect(code.t === 'code' ? code.v : '').toBe('const a = 1;');
  });

  it('有序列表：起始编号 + 粗体项 + 嵌套无序列表', () => {
    const blocks = parseMarkdown('2. **卖什么**——产品？\n3. 目标客户\n   - 手作爱好者\n   - 礼品采购');
    expect(blocks).toHaveLength(1);
    const list = blocks[0];
    if (list.t !== 'list') throw new Error('期望列表');
    expect(list.ordered).toBe(true);
    expect(list.start).toBe(2);
    expect(list.items).toHaveLength(2);
    const first = list.items[0][0];
    expect(first.t === 'p' ? first.c[0].t : '').toBe('strong');
    const nested = list.items[1].find((b) => b.t === 'list');
    expect(nested).toBeTruthy();
    expect(nested && nested.t === 'list' ? nested.items.length : 0).toBe(2);
  });

  it('表格：对齐标记 + 多格裁掉 + 缺格补空', () => {
    const table = parseMarkdown('|顺序|任务|负责|\n|:--|:-:|--:|\n|①|市场摸底|市场分析师|多余|\n|②|品牌定位|')[0];
    if (table.t !== 'table') throw new Error('期望表格');
    expect(table.align).toEqual(['left', 'center', 'right']);
    expect(plain(table.head[0])).toBe('顺序');
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toHaveLength(3);
    expect(plain(table.rows[1][2])).toBe('');
  });

  it('列表后没有缩进的行不吞进末项（聊天风格收口）', () => {
    const blocks = parseMarkdown('1. 甲\n**小结**：完了');
    expect(blocks.map((b) => b.t)).toEqual(['list', 'p']);
    const p = blocks[1];
    expect(p.t === 'p' ? p.c[0].t : '').toBe('strong');
  });

  it('混合长消息：段落 / 列表 / 表格依次分块', () => {
    const sample = [
      '**必须澄清的 4 个问题：**',
      '1. **卖什么**——具体产品是什么？',
      '2. **目标客户**——卖给谁？',
      '',
      '**建议执行顺序（信息齐后立即派单）：**',
      '|顺序|任务|负责|',
      '|---|---|---|',
      '|①|市场与竞品摸底|市场分析师|',
      '|②|品牌定位|品牌策划师|',
      '',
      '请先回复第 1 个问题： **你想卖的这件东西是什么？**',
    ].join('\n');
    const blocks = parseMarkdown(sample);
    expect(blocks.map((b) => b.t)).toEqual(['p', 'list', 'p', 'table', 'p']);
    const table = blocks[3];
    expect(table.t === 'table' ? table.rows.length : 0).toBe(2);
  });

  it('空文本返回空块列表', () => {
    expect(parseMarkdown('')).toEqual([] as MdBlock[]);
    expect(stripMarkdown('')).toBe('');
  });
});

describe('纯文本剥离（会话列表预览）', () => {
  it('stripMarkdown 不留语法残渣', () => {
    const out = stripMarkdown('**标题**\n- 项目 `x` [链接](https://a.com)\n|a|b|\n|-|-|\n|1|2|');
    expect(out).not.toContain('**');
    expect(out).not.toContain('|');
    expect(out).toContain('标题');
    expect(out).toContain('项目 x 链接');
  });
});
