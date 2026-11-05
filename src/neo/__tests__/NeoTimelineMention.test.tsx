/**
 * NeoTimeline.mention.test.tsx — 用户气泡 @token 高亮测试（2026-11-05，迭代五）。
 *
 * renderUserTextWithMentions（导出的纯渲染辅助）：@token 切成 .neo-tl-mention
 * 徽章 + 普通文本；规则与后端 mentions.ts 分词对齐（@ 须在文首/空白/中文标点后，
 * token 非空白非标点）。无 @ 整段透传（数组单元素、零 DOM 差异）。
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/utils';
import { NeoTimeline, renderUserTextWithMentions } from '../NeoTimeline';
import type { TimelineMessage } from '../../components/run-session/timeline/types';

describe('renderUserTextWithMentions — 纯函数切分', () => {
  it('无 @ → 单段原文透传', () => {
    expect(renderUserTextWithMentions('帮我看看这个设计')).toEqual(['帮我看看这个设计']);
  });

  it('文首 @token → 徽章 + 剩余文本', () => {
    const out = renderUserTextWithMentions('@架构汪 帮我评审');
    expect(out).toHaveLength(2);
    expect(out[1]).toBe(' 帮我评审');
    // 第一段是元素（徽章），内文含 @架构汪
    expect(out[0]).toBeTruthy();
  });

  it('中文标点后 @token 也高亮（「一下。@架构汪」场景）', () => {
    const out = renderUserTextWithMentions('先看一下。@架构汪 再说');
    expect(out.length).toBeGreaterThanOrEqual(2);
  });

  it('@ 前是汉字（紧贴）不高亮 — 与后端 parseMentions 同规则', () => {
    // 「让@架构汪」：@ 前非空白非标点 → 后端不会派发，前端同样不高亮（一致）。
    expect(renderUserTextWithMentions('先让@架构汪，看一下这个')).toEqual([
      '先让@架构汪，看一下这个',
    ]);
  });

  it('邮件式 user@dev01.com 不高亮（@ 前非空白非标点）', () => {
    const out = renderUserTextWithMentions('联系我 user@dev01.com');
    expect(out).toEqual(['联系我 user@dev01.com']);
  });
});

describe('NeoTimeline — user_turn 气泡渲染 mention 徽章', () => {
  it('含 @token 的用户消息出 .neo-tl-mention 徽章', () => {
    const msg = {
      id: 'u1',
      kind: 'user_turn',
      text: '@架构汪 帮我评审这个设计',
      turn_id: 't1',
      ts: Date.now(),
    } as TimelineMessage;
    render(<NeoTimeline messages={[msg]} />);
    const badge = document.querySelector('.neo-tl-mention');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('@架构汪');
    expect(screen.getByText('帮我评审这个设计')).toBeInTheDocument();
  });

  it('普通文本消息不出徽章', () => {
    const msg = {
      id: 'u2',
      kind: 'user_turn',
      text: '大家好',
      turn_id: 't2',
      ts: Date.now(),
    } as TimelineMessage;
    render(<NeoTimeline messages={[msg]} />);
    expect(document.querySelector('.neo-tl-mention')).toBeNull();
    expect(screen.getByText('大家好')).toBeInTheDocument();
  });
});
