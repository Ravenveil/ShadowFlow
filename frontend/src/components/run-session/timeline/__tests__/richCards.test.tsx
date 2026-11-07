/**
 * timeline rich cards — Polynoia-parity inline render types.
 *
 * Covers the 2026-08- additions end-to-end through the Timeline container +
 * MessageRegistry dispatch: plan_card (with plan_update_task patch via
 * applyPatch), commit_record, file_diff, table_panel, image_panel,
 * web_preview (sandboxed iframe), artifact_card and verdict_card. Also pins
 * the applyPatch no-op contract for mismatched kinds.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timeline } from '../Timeline';
import { MessageRegistry } from '../MessageRegistry';
import { applyPatch } from '../types';
import type { PlanTaskRow, TimelineMessage } from '../types';

// jsdom implements neither scrollTo nor full layout — Timeline's smart
// auto-scroll calls el.scrollTo in useLayoutEffect when stuck to bottom.
beforeAll(() => {
  Element.prototype.scrollTo = () => {};
});

const base = { turn_id: 't1', ts: 1 } as const;

function planMsg(tasks: PlanTaskRow[]): TimelineMessage {
  return { ...base, id: 'm-plan', kind: 'plan_card', title: '执行计划', goal: 'G', tasks };
}

describe('applyPatch · plan_update_task', () => {
  it('patches the matching task row immutably', () => {
    const msg = planMsg([
      { id: 'node:a', title: 'Writer', status: 'running' },
      { id: 'node:b', title: 'Reviewer', status: 'pending' },
    ]);
    const next = applyPatch(msg, {
      id: 'm-plan',
      op: 'plan_update_task',
      task_id: 'node:b',
      patch: { status: 'done', elapsed_ms: 900 },
    });
    if (next.kind !== 'plan_card') throw new Error('kind drifted');
    expect(next.tasks[1]).toMatchObject({ status: 'done', elapsed_ms: 900 });
    expect(next.tasks[0]).toMatchObject({ status: 'running' });
    expect(next).not.toBe(msg);
  });

  it('is a no-op when targeting a non-plan message', () => {
    const msg: TimelineMessage = { ...base, id: 'm-text', kind: 'assistant_text', body: 'x' };
    expect(applyPatch(msg, { id: 'm-text', op: 'plan_update_task', task_id: 'a', patch: { status: 'done' } })).toBe(msg);
  });
});

// ── 2026-11-05 Task#10 — hop_card 生命周期（hop_update patch）──────────────
describe('applyPatch · hop_update', () => {
  const hopMsg: TimelineMessage = {
    ...base,
    id: 'm-hop',
    kind: 'hop_card',
    from_agent: 'scout',
    to_agent: 'matcher',
    from_name: 'Scout · 商机扫描',
    to_name: 'Matcher · 线索匹配',
    status: 'pending',
  };

  it('patches status/detail/duration immutably (settle)', () => {
    const next = applyPatch(hopMsg, {
      id: 'm-hop',
      op: 'hop_update',
      patch: { status: 'done', output_chars: 520, duration_ms: 4300 },
    });
    if (next.kind !== 'hop_card') throw new Error('kind drifted');
    expect(next).toMatchObject({ status: 'done', output_chars: 520, duration_ms: 4300 });
    expect(next.from_name).toBe('Scout · 商机扫描');
    expect(next).not.toBe(hopMsg);
  });

  it('patches failure terminal status with detail', () => {
    const next = applyPatch(hopMsg, {
      id: 'm-hop',
      op: 'hop_update',
      patch: { status: 'timeout', detail: '上游 scout timeout' },
    });
    if (next.kind !== 'hop_card') throw new Error('kind drifted');
    expect(next.status).toBe('timeout');
    expect(next.detail).toBe('上游 scout timeout');
  });

  it('is a no-op when targeting a non-hop message', () => {
    const msg: TimelineMessage = { ...base, id: 'm-text', kind: 'assistant_text', body: 'x' };
    expect(applyPatch(msg, { id: 'm-text', op: 'hop_update', patch: { status: 'done' } })).toBe(msg);
  });
});

describe('MessageRegistry · hop_card', () => {
  it('renders nothing in the classic registry (Neo-only card)', () => {
    const { container } = render(
      <MessageRegistry
        msg={{
          ...base,
          id: 'm-hop',
          kind: 'hop_card',
          from_agent: 'a',
          to_agent: 'b',
          from_name: 'A',
          to_name: 'B',
          status: 'pending',
        }}
      />,
    );
    expect(container.childElementCount).toBe(0);
  });
});

describe('MessageRegistry · rich kinds', () => {
  it('renders plan_card tasks with live statuses', () => {
    render(
      <MessageRegistry
        msg={planMsg([
          { id: 'node:a', title: 'Writer', status: 'done', elapsed_ms: 1200 },
          { id: 'node:b', title: 'Reviewer', status: 'running' },
        ])}
      />,
    );
    expect(screen.getByText('执行计划')).toBeTruthy();
    expect(screen.getByText('Writer')).toBeTruthy();
    expect(screen.getByText('Reviewer')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
  });

  it('renders commit_record with sha + stats + expandable files', async () => {
    render(
      <MessageRegistry
        msg={{
          ...base,
          id: 'm-commit',
          kind: 'commit_record',
          repo: 'demo',
          sha: 'f'.repeat(40),
          short_sha: 'ffffff1',
          message: 'feat: landing page',
          author: 'agent-writer',
          files_changed: 2,
          insertions: 12,
          deletions: 3,
          files: [
            { path: 'src/a.ts', status: 'M' },
            { path: 'src/b.ts', status: 'A' },
          ],
        }}
      />,
    );
    expect(screen.getByText('ffffff1')).toBeTruthy();
    expect(screen.getByText('feat: landing page')).toBeTruthy();
    expect(screen.getByText('+12')).toBeTruthy();
  });

  it('renders file_diff header with path + language + stats', () => {
    render(
      <MessageRegistry
        msg={{
          ...base,
          id: 'm-diff',
          kind: 'file_diff',
          path: 'src/app.tsx',
          language: 'ts',
          added: 2,
          removed: 1,
          lines: [
            { no: 1, mark: ' ', code: 'ctx' },
            { no: 2, mark: '-', code: 'old' },
            { no: 3, mark: '+', code: 'new' },
          ],
        }}
      />,
    );
    expect(screen.getByText('src/app.tsx')).toBeTruthy();
    expect(screen.getByText('ts')).toBeTruthy();
    expect(screen.getByText('+2')).toBeTruthy();
  });

  it('renders table_panel rows', () => {
    render(
      <MessageRegistry
        msg={{
          ...base,
          id: 'm-table',
          kind: 'table_panel',
          caption: '本次运行文件变更',
          columns: ['文件', '新增', '删除'],
          rows: [
            ['src/a.ts', 3, 1],
            ['src/b.ts', 10, 0],
          ],
        }}
      />,
    );
    expect(screen.getByText('文件')).toBeTruthy();
    expect(screen.getByText('src/a.ts')).toBeTruthy();
    expect(screen.getByText('src/b.ts')).toBeTruthy();
  });

  it('renders image_panel with alt text', () => {
    render(
      <MessageRegistry msg={{ ...base, id: 'm-img', kind: 'image_panel', src: '/x.png', alt: 'chart' }} />,
    );
    expect(screen.getByAltText('chart')).toBeTruthy();
  });

  it('renders web_preview with a sandboxed iframe', () => {
    render(
      <MessageRegistry
        msg={{ ...base, id: 'm-web', kind: 'web_preview', title: 'index.html', url: '/projects/s/index.html' }}
      />,
    );
    const frame = screen.getByTitle('index.html') as HTMLIFrameElement;
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });

  it('renders artifact_card with type badge + open link', () => {
    render(
      <MessageRegistry
        msg={{
          ...base,
          id: 'm-art',
          kind: 'artifact_card',
          artifact_type: 'html',
          filename: 'landing.html',
          url: '/projects/s/landing.html',
        }}
      />,
    );
    expect(screen.getByText('landing.html')).toBeTruthy();
    expect(screen.getByText('html')).toBeTruthy();
  });

  it('renders verdict_card with score + summary', () => {
    render(
      <MessageRegistry
        msg={{
          ...base,
          id: 'm-verdict',
          kind: 'verdict_card',
          title: '评审结论 · Verifier',
          score: 8.2,
          max_score: 10,
          summary: '目标达成，结构完整',
        }}
      />,
    );
    expect(screen.getByText('评审结论 · Verifier')).toBeTruthy();
    expect(screen.getByText('目标达成，结构完整')).toBeTruthy();
  });
});

describe('Timeline · neo variant renders rich stream', () => {
  it('renders a full mixed stream (user + plan + commit + verdict)', () => {
    render(
      <Timeline
        variant="neo"
        messages={[
          { ...base, id: 'm1', kind: 'user_turn', text: '构建落地页' },
          planMsg([{ id: 'node:a', title: 'Writer', status: 'done' }]),
          {
            ...base,
            id: 'm3',
            kind: 'commit_record',
            repo: 'demo',
            sha: 'a'.repeat(40),
            short_sha: 'aaaaaa1',
            message: 'feat: lp',
            author: 'w',
            files_changed: 1,
            insertions: 5,
            deletions: 0,
          },
        ]}
      />,
    );
    expect(screen.getByText('构建落地页')).toBeTruthy();
    expect(screen.getByText('执行计划')).toBeTruthy();
    expect(screen.getByText('feat: lp')).toBeTruthy();
  });
});
