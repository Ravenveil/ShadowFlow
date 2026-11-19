/**
 * lessons 用例单测：注入内存 repo，零 IO、不启 server、不碰磁盘。
 * 证明依赖倒置成立（use_case 只认 LessonRepository 接口）。
 */

import { describe, it, expect } from 'vitest';
import {
  InMemoryLessonRepository,
  type LessonRepository,
} from '../lessons-repository';
import {
  makeRemember,
  makeRecall,
  makeListLessons,
  makeLessonStats,
  makeForgetLesson,
  makePromptBlock,
} from './lessons';
import {
  bumpScore,
  normalizeContent,
  inScope,
  type MemoryLesson,
} from '../lessons-model';

let seq = 0;
const deps = { newId: () => `id-${++seq}`, now: () => 1000 + seq };

function lesson(partial: Partial<MemoryLesson>): MemoryLesson {
  return {
    id: 'x', kind: 'lesson', scope_key: '', task_type: '', title: '',
    content: '', source: '', source_ref: '', score: 0.6, hits: 0,
    archived: 0, created_at: 0, updated_at: 0, ...partial,
  };
}

describe('lessons 领域纯函数', () => {
  it('重复检测：去标点空白后归一', () => {
    expect(normalizeContent('太官方了。')).toBe(normalizeContent('太官方了'));
  });

  it('分数加权：+0.1 且不超过 1.0', () => {
    expect(bumpScore(0.6)).toBe(0.7);
    expect(bumpScore(0.95)).toBe(1);
  });

  it('分域召回：空域通用、异域不召回', () => {
    const general = lesson({ id: 'g', content: 'general' });
    const scoped = lesson({ id: 's', scope_key: 'writer', content: 'scoped' });
    expect(inScope(general, 'reader', '')).toBe(true);
    expect(inScope(scoped, '', '')).toBe(false);
    expect(inScope(scoped, 'reader', '')).toBe(false);
    expect(inScope(scoped, 'writer', '')).toBe(true);
  });
});

describe('makeRemember', () => {
  it('新内容 → 新增一条', () => {
    const repo = new InMemoryLessonRepository();
    const remember = makeRemember(repo, deps);
    const row = remember({ content: '第一次失败的原因' });
    expect(row.content).toBe('第一次失败的原因');
    expect(repo.rows.size).toBe(1);
  });

  it('重复内容 → 加权不新增（同域）', () => {
    const repo = new InMemoryLessonRepository();
    const remember = makeRemember(repo, deps);
    remember({ content: '太官方了。', scope_key: 'writer' });
    const again = remember({ content: '太官方了', scope_key: 'writer' });
    expect(repo.rows.size).toBe(1);
    expect(again.hits).toBe(1);
    expect(again.score).toBe(0.7);
  });

  it('超长内容 → 截断到 CONTENT_MAX', () => {
    const repo = new InMemoryLessonRepository();
    const remember = makeRemember(repo, deps);
    const row = remember({ content: 'x'.repeat(1000) });
    expect(row.content.length).toBe(600);
  });

  it('空内容 → 抛领域错误', () => {
    const repo = new InMemoryLessonRepository();
    expect(() => makeRemember(repo, deps)({ content: '   ' })).toThrow();
  });

  it('每域超过 8 条 → 低优先级软归档', () => {
    const repo = new InMemoryLessonRepository();
    const remember = makeRemember(repo, deps);
    for (let i = 0; i < 10; i++) remember({ content: `不同的教训 ${i}`, scope_key: 'writer' });
    const active = repo.list({ scope_key: 'writer' });
    expect(active.length).toBe(8);
  });
});

describe('召回与统计', () => {
  it('recall 按 topK 截断', () => {
    const repo = new InMemoryLessonRepository(
      [1, 2, 3, 4, 5].map((n) => lesson({ id: `l${n}`, content: `c${n}`, score: n / 10 })),
    );
    const recall = makeRecall(repo);
    expect(recall('', '', 2)).toHaveLength(2);
    expect(recall('', '', 2)[0].content).toBe('c5');
  });

  it('stats 计数未归档', () => {
    const repo = new InMemoryLessonRepository([
      lesson({ id: 'a', kind: 'lesson' }),
      lesson({ id: 'b', kind: 'lesson' }),
      lesson({ id: 'c', kind: 'preference' }),
    ]);
    const stats = makeLessonStats(repo)();
    expect(stats.total).toBe(3);
    expect(stats.by_kind).toEqual({ lesson: 2, preference: 1 });
  });

  it('forget 软归档，重复 forget 抛 404', () => {
    const repo = new InMemoryLessonRepository([lesson({ id: 'a' })]);
    const forget = makeForgetLesson(repo);
    expect(forget('a').archived).toBe(1);
    expect(() => forget('missing')).toThrow();
  });

  it('promptBlock 关自动学习 → 空串', () => {
    const repo = new InMemoryLessonRepository([lesson({ id: 'a', content: 'c' })]);
    const block = makePromptBlock(repo, makeRecall(repo))('', '', { autoLearn: false });
    expect(block).toBe('');
  });
});
