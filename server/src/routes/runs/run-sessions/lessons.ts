/**
 * run-sessions/lessons.ts — 经验记忆召回块 + 自动沉淀（OPC-OS PR#3 设计整合）。
 */
import { promptBlock, remember } from '../../../storage/memory-lessons';
import { getSetting } from '../../../storage/settings';

/**
 * 经验记忆召回块（run 提示词注入用）。按 skill_name 分域，空块返回 ''。
 * 开关：settings.memory.autoLearn（默认开）；settings.memory.recallTopK（默认 4）。
 * 2026-11-07 — 开关/条数/格式统一走 storage/memory-lessons.promptBlock。
 */
export function lessonsBlockForSession(skillName: string): string {
  return promptBlock(skillName ?? '', '');
}

/** skill 层内容 + 经验块拼接（两者都可能为空）。 */
export function joinLessons(base: string | undefined, lessonsBlock: string): string | undefined {
  const baseStr = base ?? '';
  if (!baseStr) return lessonsBlock || undefined;
  return baseStr + lessonsBlock;
}

/**
 * 经验记忆自动沉淀（2026-11-05，整合 OPC-OS PR#3 memory.py 设计）。
 *
 * 口径对齐对方"从已有事实里挖、不额外调模型"：
 *   - run 失败 → 教训（kind=lesson, source='run_failed'）：失败原因原文就是教训。
 *   - 用户中断 → 偏好（kind=preference, source='user_abort'）：用户不想让它跑完
 *     是对该类任务的明确态度。
 * 分域：scope_key 取 skill_name（与对方 employees.role 对齐）；task_type 一期留空。
 * 开关：settings.memory.autoLearn（默认开）。调用方已 try/catch，这里再兜一层。
 */
export function recordRunLesson(
  session: { skill_name?: string; goal?: string },
  outcome: { aborted: boolean; failed: boolean; errorMessage?: string | null },
): void {
  if (getSetting('memory.autoLearn') === false) return;
  const scopeKey = (session.skill_name ?? '').slice(0, 120);
  const goal = (session.goal ?? '').trim();
  if (outcome.failed) {
    const reason = (outcome.errorMessage ?? '').trim().slice(0, 400);
    if (!reason) return; // 没有原因原文就不硬编——不造事实
    remember({
      content: `任务「${goal.slice(0, 80) || '(无目标)'}」失败：${reason}。同类任务执行前先按这条自查规避。`,
      kind: 'lesson',
      scope_key: scopeKey,
      source: 'run_failed',
      source_ref: '',
      score: 0.85,
    });
  } else if (outcome.aborted) {
    remember({
      content: `用户中断了「${goal.slice(0, 80) || '(无目标)'}」这类任务。再次执行同类目标时先与用户确认范围与方式，再动手。`,
      kind: 'preference',
      scope_key: scopeKey,
      source: 'user_abort',
      source_ref: '',
      score: 0.9,
    });
  }
}
