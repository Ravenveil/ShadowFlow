/**
 * demo-exception-replay.test.ts — 「异常处理 / 老板决策」演示证据包的回归守卫（2026-11-06）。
 *
 * 为什么要守：评委速览会把计数为 0 的维度明写成「待造数据」。如果哪天样例脚本
 * 静默退化（冲突没落成 conflict、裁决没留痕、hop 没写进去），材料又会变回一张
 * 全是 0 的空表。这里直接把 CLI 真跑一遍，断言报告里的数字与三份产物。
 *
 * 子进程用 tsx 跑 .mjs（脚本内部才动态 import TS 存储层），因此不需要 dev 栈、
 * 不另起端口、不碰演示库；父进程只做只读断言。
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// 模块加载时捕获仓库根：别的测试文件会在 beforeAll 里 chdir 到临时库。
const REPO_ROOT = process.cwd();
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'demo-exception-replay.mjs');
const TSX_CLI = path.join(REPO_ROOT, 'server', 'node_modules', 'tsx', 'dist', 'cli.mjs');

interface DemoSummary {
  out_dir: string;
  files: { markdown: string; scorecard: string; csv: string; notice: string };
  merchant: {
    first_order_complete: boolean;
    orders_total: number;
    paid_orders: number;
    refunded_orders: number;
    revenue_cents: number;
    balanced: boolean;
  };
  memory: {
    audit_total: number;
    resolutions: number;
    pending_conflicts: number;
    handoffs: number;
    accepted_handoffs: number;
    pending_conflict_action: string;
    resolved_conflict_action: string;
    resolution_action: string;
  };
  collaboration: {
    total: number;
    failures: number;
    reworks: number;
    approval_rejections: number;
    open: number;
    available: boolean;
  };
  human_decisions: {
    resolutions: number;
    pending_conflicts: number;
    hop_failures: number;
    hop_approval_rejections: number;
    failed_feedback: number;
  };
  feedback_module_available: boolean;
  reproduction_has_demo_step: boolean;
  verdict: { ok: boolean; problems: string[] };
}

function runCli(outDir: string): DemoSummary {
  const stdout = execFileSync(
    process.execPath,
    [TSX_CLI, SCRIPT, `--out-dir=${outDir}`, '--json'],
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120000 },
  );
  // sqlite 初始化会先打一行日志，JSON 从第一个 '{' 开始。
  const start = stdout.indexOf('{');
  if (start < 0) throw new Error(`CLI 没有输出 JSON：${stdout.slice(0, 200)}`);
  return JSON.parse(stdout.slice(start)) as DemoSummary;
}

describe('demo-exception-replay 演示证据包', () => {
  it('真跑 CLI：三类人工决策、协作异常、退款冲成本同框，且自检通过', () => {
    expect(existsSync(SCRIPT)).toBe(true);
    expect(existsSync(TSX_CLI)).toBe(true);
    const outDir = mkdtempSync(path.join(tmpdir(), 'sf-demo-decisions-test-'));
    try {
      const s = runCli(outDir);
      expect(s.verdict.ok).toBe(true);
      expect(s.verdict.problems).toEqual([]);
      expect(s.reproduction_has_demo_step).toBe(true);

      // ① 经营闭环：第一单全通、有退款、账实一致。
      expect(s.merchant.first_order_complete).toBe(true);
      expect(s.merchant.refunded_orders).toBeGreaterThanOrEqual(1);
      expect(s.merchant.balanced).toBe(true);
      expect(s.merchant.orders_total).toBeGreaterThanOrEqual(2);

      // ③ 系统不擅自覆盖：两条同置信写回都落 conflict；一条人拍板、一条留给评委看。
      expect(s.memory.pending_conflict_action).toBe('conflict');
      expect(s.memory.resolved_conflict_action).toBe('conflict');
      expect(s.memory.resolution_action).toBe('override');
      expect(s.memory.resolutions).toBeGreaterThanOrEqual(1);
      expect(s.memory.pending_conflicts).toBeGreaterThanOrEqual(1);
      expect(s.memory.handoffs).toBeGreaterThanOrEqual(1);
      expect(s.memory.accepted_handoffs).toBeGreaterThanOrEqual(1);
      expect(s.memory.audit_total).toBeGreaterThan(0);

      // 编排层异常与人工审批拒绝，且不把 policy deny 混成老板决策。
      expect(s.collaboration.available).toBe(true);
      expect(s.collaboration.failures).toBeGreaterThanOrEqual(1);
      expect(s.collaboration.reworks).toBeGreaterThanOrEqual(1);
      expect(s.collaboration.approval_rejections).toBe(1);
      expect(s.human_decisions.hop_approval_rejections).toBe(1);

      // 不造反馈队列假表：PR #19 未合并时模块不可用，报告必须如实记 0；
      // 将来 #19 合并后模块自动可用，这里不断言「必须不可用」，避免无关 PR 把测试弄红。
      expect(typeof s.feedback_module_available).toBe('boolean');
      if (!s.feedback_module_available) expect(s.human_decisions.failed_feedback).toBe(0);
    } finally {
      try { rmSync(outDir, { recursive: true, force: true }); } catch { /* Windows EBUSY，忽略 */ }
    }
  });

  it('三份产物齐全：CSV 带 BOM、七章报告有协作留痕、速览不再是空表', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'sf-demo-decisions-files-'));
    try {
      const s = runCli(outDir);
      const md = readFileSync(path.join(outDir, s.files.markdown), 'utf8');
      const card = readFileSync(path.join(outDir, s.files.scorecard), 'utf8');
      const notice = readFileSync(path.join(outDir, s.files.notice), 'utf8');
      const csvBuf = readFileSync(path.join(outDir, s.files.csv));

      // 样例必须一眼可辨，防止被当成线上库导出。
      expect(md.startsWith('> **演示样例 · 非线上数据**')).toBe(true);
      expect(card.startsWith('> **演示样例 · 非线上数据**')).toBe(true);
      expect(notice).toContain('非线上数据');
      expect(notice).toContain('evidence-sample-decisions-orders.csv');

      expect(csvBuf[0]).toBe(0xef);
      expect(csvBuf[1]).toBe(0xbb);
      expect(csvBuf[2]).toBe(0xbf);
      expect(md).toContain('协作执行留痕');
      expect(md).toContain('〇、评委速览');
      expect(card).toContain('# ShadowFlow · 评委速览（一页）');
      expect(card).toContain('| 人机分工清晰 |');
      // 加分项「人机分工清晰」必须是有数据，而不是待造数据。
      const humanRow = card.split('\n').find((l) => l.includes('| 人机分工清晰 |')) ?? '';
      expect(humanRow).toContain('有数据');
      // 画像写回 / 交接包已有事实，空库提示应当消失。
      expect(card).not.toContain('本区间没有画像写回');
      expect(card).not.toContain('本区间没有协作交接');
      // 仍然如实列出未启用模块与模拟支付，不粉饰。
      expect(card).toContain('反馈自动写回队列模块尚未启用');
      expect(card).toContain('支付为演示用模拟回调');
    } finally {
      try { rmSync(outDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  });

  it('自检函数对缺项不放行（纯函数，不需要跑 CLI）', async () => {
    const scriptUrl = pathToFileURL(SCRIPT).href;
    const mod = (await import(scriptUrl)) as {
      verifyDemoEvidence(summary: Record<string, unknown>): { ok: boolean; problems: string[] };
      OUTPUT_FILES: { markdown: string; scorecard: string; csv: string; notice: string };
    };
    const empty = mod.verifyDemoEvidence({
      merchant: {}, memory: {}, collaboration: {}, human_decisions: {},
    });
    expect(empty.ok).toBe(false);
    expect(empty.problems.length).toBeGreaterThanOrEqual(8);
    expect(empty.problems.join('；')).toContain('系统擅自覆盖');
    expect(mod.OUTPUT_FILES.markdown).toContain('sample-decisions');
  });
});
