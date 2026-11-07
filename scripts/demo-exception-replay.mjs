#!/usr/bin/env node
/**
 * demo-exception-replay.mjs — 一键生成「异常处理 + 老板不可替代决策」演示证据包。
 *
 * 为什么需要：评委速览的「局限与待补证据」会直说空库没事实可核。上一轮的
 * `first-order-replay.mjs` 解决「第一单能不能现场重放」，这一轮补齐另一半：
 * 同置信画像冲突（系统只留痕不覆盖）、人工裁决、岗位交接、协作节点失败/返工/
 * 人工审批拒绝，以及退款冲成本，让四个评分维度里的「创新性 / 人机分工」
 * 在**同一份材料里**有可核实的数字，而不是 0。
 *
 * 纪律（与项目演示纪律一致）：
 *   - 全程在**临时 cwd 的独立 SQLite** 里造数：不碰正在跑的演示库、不碰主库、
 *     不需要 dev 栈、不另起端口、不调模型、不改任何业务表结构。
 *   - 产物是**演示样例**，不是服务当前库的导出；文件名带 `-sample-decisions`，
 *     报告卷首也会标注，绝不允许拿它冒充线上数字。
 *   - 反馈队列是真模块真表（PR #19 已合并）：「失败反馈 → 人工补跑」走真实的
 *     runFeedbackQueue 重放路径；演示只模拟「写回失败」的现场（公开 API 无法
 *     确定性逼出写回异常），绝不伪造整个队列表。
 *
 * 运行（仓库根目录，需先 `cd server && npm ci` 装 tsx）：
 *   node server/node_modules/tsx/dist/cli.mjs scripts/demo-exception-replay.mjs
 *   node server/node_modules/tsx/dist/cli.mjs scripts/demo-exception-replay.mjs --json
 *   node server/node_modules/tsx/dist/cli.mjs scripts/demo-exception-replay.mjs --out-dir=.shadowflow
 * Git Bash / macOS / Linux 也可以直接 `./server/node_modules/.bin/tsx scripts/demo-exception-replay.mjs`。
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SCRIPT_NAME = 'demo-exception-replay.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

export const OUTPUT_FILES = {
  markdown: 'evidence-sample-decisions.md',
  scorecard: 'evidence-sample-decisions-scorecard.md',
  csv: 'evidence-sample-decisions-orders.csv',
  notice: 'evidence-sample-decisions.README.md',
};

/** 样例必须一眼可辨，绝不能被当成线上库导出拿去汇报。 */
export const SAMPLE_BANNER = [
  '> **演示样例 · 非线上数据**：本文件由 `scripts/demo-exception-replay.mjs` 在**临时独立 SQLite** 中造数生成，',
  '> 用于展示「异常处理 / 老板不可替代决策」的证据形态；**不是演示库或生产库的导出**，数字不可用于对外汇报。',
  '> 现场要核对真实数据，请用服务的 `GET /api/merchant/evidence.md` / `/evidence/scorecard.md` / `/evidence/orders.csv`。',
  '',
].join('\n');

const NOTICE_BODY = [
  '# 异常处理 / 老板决策演示样例 · 使用说明',
  '',
  SAMPLE_BANNER,
  '生成命令（仓库根目录，需先 `cd server && npm ci`）：',
  '',
  '```bash',
  `node server/node_modules/tsx/dist/cli.mjs scripts/${SCRIPT_NAME}`,
  '```',
  '',
  '| 文件 | 内容 |',
  '| --- | --- |',
  `| \`${OUTPUT_FILES.markdown}\` | 七章完整报告（含协作执行留痕、卷首评委速览） |`,
  `| \`${OUTPUT_FILES.scorecard}\` | 一页评委速览（评分维度 → 可核实证据） |`,
  `| \`${OUTPUT_FILES.csv}\` | 订单明细 CSV，UTF-8 BOM；为保持格式干净不加注释行，**同样是样例数据** |`,
  '',
  '脚本在临时库里造的事实：一单成交 + 一单退款（冲成本、账实一致）、客户反馈规则式画像写回、',
  '反馈写回失败留痕 + 人工补跑重放（另留一条待补跑）、两条同置信冲突（一条留待裁决、一条人工裁决）、',
  '岗位交接包并接班、协作 hop 的正常/失败/返工/人工审批拒绝/策略拦截/悬挂。',
  '不碰演示库、不碰主库、不需要 dev 栈、不调模型、不改表结构。',
  '',
  '反馈队列的「失败」态是演示模拟（公开 API 无法确定性逼出写回异常）；补跑走真实的 runFeedbackQueue 重放路径，幂等不重复写回。',
  '',
].join('\n');

/**
 * 在**当前 cwd 的库**里造一整套演示事实并导出证据包。
 * 调用方负责先切到独立临时库并 reset sqlite；返回摘要与生成的文件名。
 */
export async function generateDemoEvidence({ outDir = path.join(repoRoot, '.shadowflow') } = {}) {
  const board = await import('../server/src/storage/merchant-board');
  const memory = await import('../server/src/storage/memory-handoff');
  const hopsStore = await import('../server/src/storage/agent-hops');
  const evidence = await import('../server/src/storage/evidence');

  // ① 经营闭环：一单成交 + 一单退款，让第一单链路、单位经济、账实核对都有事实可核。
  const product = board.createProduct({ name: '手冲咖啡·演示', price_cents: 19900, cost_cents: 4300 });
  const visit = board.recordVisit({ visitor_id: 'demo-visitor-1', channel: 'wechat', trace_id: 'demo-trace-1' });
  const first = board.createOrder({ product_id: product.id, visit_id: visit.id, trace_id: 'demo-trace-1' });
  board.payOrder(first.id, 'demo-txn-1');
  const refunded = board.createOrder({ product_id: product.id, trace_id: 'demo-trace-2' });
  board.payOrder(refunded.id, 'demo-txn-2');
  board.refundOrder(refunded.id);

  // ③ 客户反馈 → 规则式画像写回（零模型消耗）。
  memory.ingestFeedback({
    subject_id: 'demo-customer-1',
    text: '客户偏好简洁的文案，不要长篇；预算 2 万以内；下周五截止',
    actor: 'client',
  });

  // ③ 反馈写回失败的留痕 + 人工补跑（队列规定三：失败可重跑）。
  // 线上失败态由 processFeedbackRow 的 catch 落库（status='failed' + error 等补跑）；
  // 演示没法从公开 API 确定性逼出写回异常，直接把「上次自动写回挂了」的失败态种进
  // 同一条真表（不造假表、不改结构），补跑则走真实的 runFeedbackQueue 重放路径。
  const sqlite = await import('../server/src/storage/sqlite');
  const plantFailedFeedback = (id, subjectId, text, error) =>
    sqlite.getDb()
      .prepare(
        `INSERT INTO memory_feedback_queue
           (id, subject_type, subject_id, text_hash, text, source, source_ref,
            status, keys_json, actions_json, conflicts, error, actor, created_at)
         VALUES (?, 'customer', ?, ?, ?, 'demo-replay', 'demo-exception-replay',
                 'failed', '[]', '[]', 0, ?, 'system', ?)`,
      )
      .run(id, subjectId, `demo-fail-${id}`, text, error, Date.now());
  plantFailedFeedback(
    'demo-feedback-failed-1', 'demo-customer-2',
    '行业做的是烘焙，主营线下门店',
    '模拟写回失败：库忙超时（演示补跑场景）',
  );
  const failedBeforeRerun = memory.feedbackQueue({ status: 'failed', limit: 10 }).stats.failed;
  // 人点「补跑」→ runFeedbackQueue({ include_failed: true }) 重放失败记录，幂等。
  const rerun = memory.runFeedbackQueue({ include_failed: true, limit: 10 });
  // 再留一条失败记录不补跑：速览的「待补跑反馈」要有真实数字，而不是 0。
  plantFailedFeedback(
    'demo-feedback-failed-2', 'demo-customer-3',
    '返工太多，客户不满意，反复改太慢',
    '模拟写回失败：写回流水表锁等待（演示待补跑）',
  );
  const queueAfter = memory.feedbackQueue({ limit: 20 }).stats;

  // ③ 两次「同置信、不同说法」的写回 → 系统记 conflict 且不覆盖原值。
  // 一条留给评委看见「待裁决」，一条由人拍板采纳，两种状态同框。
  const conflictPair = (key, keep, proposed) => {
    memory.writeback({
      subject_id: 'demo-customer-1', key, value: keep, confidence: 0.7,
      source: 'feedback', evidence: `初次反馈：${keep}`, actor: 'system',
    });
    return memory.writeback({
      subject_id: 'demo-customer-1', key, value: proposed, confidence: 0.7,
      source: 'feedback', evidence: `二次反馈：${proposed}`, actor: 'system',
    });
  };
  const pendingConflict = conflictPair('budget', '预算 2 万以内', '预算 3 万以内');
  const resolvedConflict = conflictPair('deadline', '下周五截止', '下下周一截止');
  const resolution = memory.resolveConflict({
    subject_id: 'demo-customer-1',
    key: 'deadline',
    decision: 'accept',
    actor: '老板（人工裁决）',
  });

  // ③ 岗位交接包：生成快照 → 接班人确认接班。
  const { handoff } = memory.createHandoff({
    shift_id: 'demo-shift-1',
    from_agent: '文案岗',
    to_agent: '交付岗',
    scope_key: 'demo-service',
    task_type: 'copy',
    summary: '客户偏好简洁文案；预算口径有冲突待老板裁决',
  });
  memory.acceptHandoff(handoff.id, '交付岗');
  // B 接班后真实拉一次上下文：消费留痕自动落库，证明「交接出来的记忆被用上了」，
  // 闭环变成 交接 → 接班 → 消费 → 反馈写回 → 冲突裁决。
  const consumed = memory.contextFor('交付岗', 'demo-service', 'copy', 20);

  // 编排层协作留痕（别人的模块，这里只写事实表，不改其代码）：
  // 正常交接 / 失败 / 返工 / 人工审批拒绝 / 系统策略拦截 / 悬挂中的交接。
  const turn = hopsStore.nextTurnSeq('demo-group');
  const open = (from, to) =>
    hopsStore.openHop({ group_id: 'demo-group', turn_seq: turn, from_agent: from, to_agent: to });
  hopsStore.settleHop(open('pm', 'arch'), 'done', { outputChars: 120 });
  hopsStore.settleHop(open('arch', 'dev'), 'failed', { detail: 'agent 超时无响应，需人决定是否重试' });
  hopsStore.settleHop(open('qa', 'dev'), 'done', { detail: 'rework round 1', outputChars: 80 });
  hopsStore.settleHop(open('dev', 'qa'), 'denied', { detail: '审批被拒：dev 未获批准，交接未发生' });
  hopsStore.settleHop(open('arch', 'qa'), 'denied', { detail: 'policy deny' });
  open('pm', 'qa'); // 悬挂，未结算

  const report = evidence.buildEvidence({});
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, OUTPUT_FILES.markdown), SAMPLE_BANNER + evidence.evidenceMarkdown(report), 'utf8');
  writeFileSync(path.join(outDir, OUTPUT_FILES.scorecard), SAMPLE_BANNER + evidence.evidenceScorecard(report), 'utf8');
  // CSV 保持与线上导出逐字同构，方便评委比对字段；样例身份由 README 与两个 Markdown 卷首说明。
  writeFileSync(path.join(outDir, OUTPUT_FILES.csv), evidence.evidenceOrdersCsv({}), 'utf8');
  writeFileSync(path.join(outDir, OUTPUT_FILES.notice), NOTICE_BODY, 'utf8');

  const summary = {
    generated_at: report.generated_at,
    out_dir: outDir,
    files: OUTPUT_FILES,
    merchant: {
      first_order_complete: report.merchant.first_order.complete,
      orders_total: report.merchant.overview.orders_total,
      paid_orders: report.merchant.overview.paid_orders,
      refunded_orders: report.merchant.overview.refunded_orders,
      revenue_cents: report.merchant.overview.revenue_cents,
      balanced: report.merchant.reconcile.balanced,
    },
    memory: {
      audit_total: report.memory.audit.total,
      resolutions: report.memory.audit.resolutions,
      pending_conflicts: report.human_decisions.pending_conflicts,
      handoffs: report.memory.stats.handoffs,
      accepted_handoffs: report.memory.stats.accepted,
      context_reads: report.memory.context_reads.total,
      context_items: consumed.count,
      pending_conflict_action: pendingConflict.action,
      resolved_conflict_action: resolvedConflict.action,
      resolution_action: resolution.action,
    },
    collaboration: {
      total: report.collaboration.total,
      failures: report.collaboration.failures,
      reworks: report.collaboration.reworks,
      approval_rejections: report.collaboration.approval_rejections,
      open: report.collaboration.open,
      available: report.collaboration.available,
    },
    human_decisions: {
      resolutions: report.human_decisions.resolutions,
      pending_conflicts: report.human_decisions.pending_conflicts,
      hop_failures: report.human_decisions.hop_failures,
      hop_approval_rejections: report.human_decisions.hop_approval_rejections,
      failed_feedback: report.human_decisions.failed_feedback,
    },
    feedback: {
      total: queueAfter.total,
      processed: queueAfter.processed,
      skipped: queueAfter.skipped,
      failed: queueAfter.failed,
      failed_before_rerun: failedBeforeRerun,
      rerun_scanned: rerun.scanned,
      rerun_processed: rerun.processed,
    },
    feedback_module_available: report.memory.feedback.available,
    // 材料与现场操作必须一一对应：报告里得能找到这条命令，否则评委拿到报告也重放不了。
    reproduction_has_demo_step: report.reproduction.steps.some((s) => String(s).includes(SCRIPT_NAME)),
  };
  return { report, summary };
}

/** 校验「这份样例确实能补上速览里的空格」，脚本和测试共用同一套断言。 */
export function verifyDemoEvidence(summary) {
  const problems = [];
  const need = (cond, msg) => { if (!cond) problems.push(msg); };
  need(summary.merchant.first_order_complete === true, '第一单五步链路未通');
  need(summary.merchant.balanced === true, '账实核对未通过');
  need(summary.merchant.refunded_orders >= 1, '缺少退款单，冲成本口径无从核实');
  need(summary.memory.pending_conflict_action === 'conflict', '同置信冲突没有落 conflict');
  need(summary.memory.resolved_conflict_action === 'conflict', '第二条同置信冲突没有落 conflict');
  need(summary.memory.resolutions >= 1, '人工裁决留痕为 0');
  need(summary.memory.pending_conflicts >= 1, '待裁决冲突为 0（系统擅自覆盖了？）');
  need(summary.memory.handoffs >= 1 && summary.memory.accepted_handoffs >= 1, '岗位交接包未接班');
  need((summary.memory.context_reads ?? 0) >= 1, '记忆消费留痕为 0（交接出来的记忆没人读过）');
  need(summary.collaboration.failures >= 1, '协作异常终态为 0');
  need(summary.collaboration.reworks >= 1, '返工留痕为 0');
  need(summary.collaboration.approval_rejections >= 1, '人工审批拒绝为 0');
  need(summary.human_decisions.resolutions + summary.human_decisions.pending_conflicts
    + summary.human_decisions.hop_approval_rejections >= 3, '三次人工决策没有同框');
  const fb = summary.feedback ?? {};
  need(summary.feedback_module_available === true, '反馈自动写回队列模块不可用（表没建出来）');
  need((fb.failed_before_rerun ?? 0) >= 1, '没有造出失败反馈留痕');
  need((fb.rerun_processed ?? 0) >= 1, '人工补跑没有重放失败反馈');
  need(((summary.human_decisions ?? {}).failed_feedback ?? 0) >= 1, '速览「待补跑反馈」为 0（失败留痕没进报告）');
  need(summary.reproduction_has_demo_step === true, '报告复现步骤没有列出本演示脚本');
  return { ok: problems.length === 0, problems };
}

function printHuman(summary, verdict) {
  console.log('ShadowFlow · 异常处理 / 老板决策演示证据包（临时独立库样例，非线上库导出）');
  console.log(`输出目录：${summary.out_dir}`);
  console.log(`① 第一单 ${summary.merchant.first_order_complete ? '五步全通 ✓' : '未通 ×'} · 订单 ${summary.merchant.orders_total}（成交 ${summary.merchant.paid_orders} / 退款 ${summary.merchant.refunded_orders}）· 营收 ${summary.merchant.revenue_cents} 分 · 账实一致 ${summary.merchant.balanced ? '✓' : '×'}`);
  console.log(`③ 写回事件 ${summary.memory.audit_total} · 人工裁决 ${summary.memory.resolutions} · 待裁决 ${summary.memory.pending_conflicts} · 交接包 ${summary.memory.handoffs}（已接班 ${summary.memory.accepted_handoffs}）· 记忆消费 ${summary.memory.context_reads} 次（带出 ${summary.memory.context_items} 条）`);
  console.log(`协作 hop ${summary.collaboration.total} · 异常 ${summary.collaboration.failures} · 返工 ${summary.collaboration.reworks} · 人工审批拒绝 ${summary.collaboration.approval_rejections} · 悬挂 ${summary.collaboration.open}`);
  console.log(`反馈自动写回队列：${summary.feedback_module_available
    ? `已启用 · 累计 ${summary.feedback.total}（已处理 ${summary.feedback.processed} / 跳过 ${summary.feedback.skipped} / 失败待补跑 ${summary.feedback.failed}）· 人工补跑重放 ${summary.feedback.rerun_processed} 条`
    : '不可用（表不存在），报告如实记 0，不造假表'}`);
  for (const [k, v] of Object.entries(summary.files)) console.log(`  ${k}: ${v}`);
  console.log(`自检：${verdict.ok ? 'PASS' : `FAIL — ${verdict.problems.join('；')}`}`);
}

function parseArgs(argv) {
  const opts = { outDir: path.join(repoRoot, '.shadowflow'), json: false, help: false };
  for (const arg of argv) {
    if (arg === '--json') opts.json = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--out-dir') throw new Error('--out-dir 请用 --out-dir=<path> 写法');
    else if (arg.startsWith('--out-dir=')) opts.outDir = path.resolve(arg.slice('--out-dir='.length));
    else throw new Error(`未知参数：${arg}`);
  }
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`参数错误：${err.message}`);
    process.exitCode = 2;
    return;
  }
  if (opts.help) {
    console.log(`用法：node server/node_modules/tsx/dist/cli.mjs scripts/${SCRIPT_NAME} [--out-dir=<path>] [--json]\n在临时独立库造数并导出演示证据包，不碰演示库/主库。`);
    return;
  }
  const outDir = opts.outDir;
  const tmp = mkdtempSync(path.join(tmpdir(), 'sf-demo-decisions-'));
  process.chdir(tmp);
  try {
    const sqlite = await import('../server/src/storage/sqlite');
    sqlite._resetForTests();
    sqlite.getDb();
    const { summary } = await generateDemoEvidence({ outDir });
    const verdict = verifyDemoEvidence(summary);
    if (opts.json) console.log(JSON.stringify({ ...summary, verdict }, null, 2));
    else printHuman(summary, verdict);
    if (!verdict.ok) process.exitCode = 1;
  } finally {
    const sqlite = await import('../server/src/storage/sqlite').catch(() => null);
    try { sqlite?._resetForTests(); } catch { /* best-effort */ }
    process.chdir(repoRoot);
    // Windows 上 SQLite 句柄释放有延迟，临时目录可能删不掉；留在 %TEMP% 无害。
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) await main();
