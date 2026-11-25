/**
 * deliverables.test.ts — 「谁交了什么」推导的回归网。
 *
 * 这块决定右栏按成员看产物时会不会给人贴错标签：宁可少归一件（留在「全部」里
 * 谁都能看见），也不能把别人的文件算到某人头上。所以逐条钉死：
 *   - 消息登记的产物名 → 硬归属
 *   - 文件名出现在谁那句话里 → 才算关联文件
 *   - 谁都没提的磁盘文件 → 不归属任何人
 */
import { describe, expect, it } from 'vitest';
import {
  claimedPaths,
  deliverablesOf,
  groupDeliverables,
  sameMember,
} from '@/shared/data/deliverables';
import type { ArtifactEntry, Message, PanelStep } from '@/shared/data/types';

function file(name: string, isDir = false): ArtifactEntry {
  return { name, path: `/ws/${name}`, isDir, size: 10, mtime: 0, ext: '' };
}

const entries: ArtifactEntry[] = [
  file('综述骨架-v0.3.md'),
  file('references.bib'),
  file('paper.tex'),
  file('logs', true),
  file('orphan.png'),
];

const thread: Message[] = [
  {
    id: 'm1',
    role: 'agent',
    author: '主控',
    time: '17:07',
    kind: 'text',
    text: '骨架版先给你过一眼结构',
    artifacts: [
      { name: '综述骨架-v0.3.md', kind: 'paper', size: '24 KB' },
      { name: 'references.bib', kind: 'bib', size: '52 条' },
    ],
  },
  {
    id: 'm2',
    role: 'agent',
    author: '章节主笔',
    time: '17:12',
    kind: 'text',
    text: '第 3 节改完了，paper.tex 里已经替换',
  },
  { id: 'm3', role: 'user', time: '17:13', kind: 'text', text: '继续' },
];

const steps: PanelStep[] = [
  { label: '核准综述范围', done: true, agent: '主控' },
  { label: '并行撰写 4 个 section', done: true, agent: '章节主笔' },
];

describe('groupDeliverables', () => {
  const groups = groupDeliverables(thread, steps, entries);

  it('attributes registered artifacts to their author', () => {
    const lead = deliverablesOf(groups, { name: '主控' });
    // 有时间的交付排前（最新在上），没有时间的执行步骤跟在后面
    expect(lead?.items.map((i) => i.label)).toEqual(['综述骨架-v0.3.md', 'references.bib', '核准综述范围']);
    expect(lead?.files.map((f) => f.name).sort()).toEqual(['references.bib', '综述骨架-v0.3.md']);
  });

  it('links a file only when its name shows up in that member words', () => {
    const writer = deliverablesOf(groups, { name: '章节主笔' });
    expect(writer?.files.map((f) => f.name)).toEqual(['paper.tex']);
    // 步骤名里没提文件名 → 那条交付不带文件
    expect(writer?.items.find((i) => i.label.includes('并行撰写'))?.files).toEqual([]);
  });

  it('never assigns an unmentioned file to anyone', () => {
    expect(claimedPaths(groups).has('/ws/orphan.png')).toBe(false);
    expect(claimedPaths(groups).has('/ws/logs')).toBe(false);
  });

  it('skips user messages and empty labels', () => {
    expect(groups.some((g) => g.agent === '')).toBe(false);
    expect(groups.flatMap((g) => g.items).some((i) => i.label === '继续')).toBe(false);
  });

  it('dedupes the same label reported by both message and step', () => {
    const once = groupDeliverables(
      [{ id: 'x', role: 'agent', author: '主控', time: '09:00', kind: 'text', text: '核准综述范围' }],
      [{ label: '核准综述范围', done: true, agent: '主控' }],
      entries,
    );
    expect(deliverablesOf(once, { name: '主控' })?.items).toHaveLength(1);
  });

  it('sorts the busiest member first and tracks the latest time', () => {
    expect(groups[0].agent).toBe('主控');
    expect(deliverablesOf(groups, { name: '主控' })?.latest).toBe('17:07');
  });

  it('returns an empty list when nothing was delivered', () => {
    expect(groupDeliverables([], [], entries)).toEqual([]);
  });
});

describe('sameMember', () => {
  it('matches full name, short name and the role segment', () => {
    const member = { name: 'Analyst · 结果分析', short: '分析' };
    expect(sameMember('Analyst · 结果分析', member)).toBe(true);
    expect(sameMember('分析', member)).toBe(true);
    expect(sameMember('Analyst', { name: 'Analyst · 结果分析' })).toBe(true);
  });

  it('ignores spacing differences and unrelated people', () => {
    expect(sameMember('章节 主笔', { name: '章节主笔' })).toBe(true);
    expect(sameMember('润色编辑', { name: '章节主笔' })).toBe(false);
  });

  it('returns null when the member never delivered', () => {
    expect(deliverablesOf(groupDeliverables(thread, steps, entries), { name: '润色编辑' })).toBeNull();
  });
});
