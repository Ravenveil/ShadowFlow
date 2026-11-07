/**
 * NeoTimeline 表格渲染测试（2026-11-07）。
 *
 * 群聊截图实证：assistant_text 里的 GFM pipe 表格此前整块漏成带竖线的纯文本
 * （`|---|` 分隔行原样露出）。extractRows 切出 `table` 行型后，Neo 面应渲成
 * 语义 <table>，cell 内行内 markdown（**bold** 等）仍生效。
 */
import { describe, it, expect } from 'vitest';
import { render } from '../../test/utils';
import { NeoTimeline } from '../NeoTimeline';
import type { TimelineMessage } from '../../components/run-session/timeline/types';

function mkAssistant(body: string): TimelineMessage {
  return {
    id: 'a1',
    kind: 'assistant_text',
    turn_id: 't1',
    ts: Date.now(),
    body,
  } as TimelineMessage;
}

const TABLE_MD = [
  '进度同步：',
  '',
  '| 环节 | 状态 | 缺什么 |',
  '|---|---|---|',
  '| 需求梳理 | ✅ 完成 | — |',
  '| 验证复盘 | ⏸️ **等上游** | 我在这一环 |',
].join('\n');

describe('NeoTimeline — GFM pipe 表格渲染', () => {
  it('表格渲成语义 <table>，不再是裸竖线文本', () => {
    render(<NeoTimeline messages={[mkAssistant(TABLE_MD)]} />);
    const table = document.querySelector('.neo-tl-md-table');
    expect(table).not.toBeNull();
    expect(table!.querySelectorAll('th')).toHaveLength(3);
    expect(table!.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(table!.textContent).toContain('需求梳理');
    // 分隔行不再以字面文本漏出
    expect(document.body.textContent).not.toContain('|---|');
  });

  it('cell 内行内 markdown 照常渲染（**bold** → strong）', () => {
    render(<NeoTimeline messages={[mkAssistant(TABLE_MD)]} />);
    const table = document.querySelector('.neo-tl-md-table');
    const strong = table!.querySelector('td strong');
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe('等上游');
  });

  it('表格前后的散文仍是文本行', () => {
    render(<NeoTimeline messages={[mkAssistant(TABLE_MD)]} />);
    expect(document.body.textContent).toContain('进度同步：');
  });
});
