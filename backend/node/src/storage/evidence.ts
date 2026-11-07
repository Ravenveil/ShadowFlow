/**
 * evidence.ts — 演示证据包 / 运行记录导出（2026-11-06，功能线①③共同交付）。
 *
 * 赛题「提交要求」里有一条硬指标：运行与演示材料要能让评委核实作品效果。
 * 光有页面截图不够 —— 数字算错、账实不符、冲突被系统擅自覆盖，截图都看不出来。
 * 这里把两条功能线**已落库的事实**汇总成一份可下载材料：
 *   ① 经营口径 / 账实核对 / 第一单五步链路 / 订单明细；
 *   ③ 交接包 / 画像写回流水 / 待裁决冲突 / 反馈队列，以及「哪几步是人拍板」；
 *   另附一章协作 DAG 执行留痕（只读 agent_hops），把节点失败 / 返工 / 审批拒绝
 *   变成「异常处理」的可核实证据 —— 这一章读的是编排层已落库的表，
 *   **不改编排层任何代码**。
 *
 * 七章报告是给评委逐项核实的底稿；卷首另给一页「评委速览」，把赛题四个评分
 * 维度与加分项映射到具体数字和复现端点，并可单独下载。速览**不替评委打分**：
 * 只列已落库证据，数据为 0 时明说待补，绝不把没跑过的事写成已完成。
 *
 * 设计约束：
 *   - **纯只读**：只调两条线已有的查询函数，不写表、不触发模型、不改业务状态。
 *     导出前后库里的数据必须一模一样（有专门的测试守这条）。
 *   - **不另起后端 / 不另起端口**：由 /api/merchant 路由直接调用，主入口零改动。
 *   - **口径单一来源**：营收/毛利/客单价全部取自 overview()，区间边界取自
 *     overview().range，本文件不重新实现任何业务计算，避免「页面一个数字、
 *     导出的材料另一个数字」—— 现场演示时这是最容易露馅的地方。
 *     经营数字与画像写回流水按同一窗口；交接包/反馈队列的统计是**累计全量**
 *     （明细只取最近 N 条），报告里明确标注，不伪装成「本期发生」。
 *   - **不越界**：① 与 ③ 之间不互相 import；只用 ③ 在 main 上已稳定的只读查询，
 *     画像流水与反馈队列则在本层直接 SELECT（带表存在性检查），**不改 ③ 的存储层**。
 *     这样本功能对未合并的「反馈自动写回队列」没有编译期依赖：那边上线前报告照样
 *     能导出（队列一节记 0），上线后自动带上真实数据，无需改一行代码。
 */

import {
  firstOrderChain,
  listOrders,
  overview,
  reconcile,
  stats,
  type OrderRow,
} from './merchant-board';
import {
  contextReads,
  handoffStats,
  listConflicts,
  listHandoffs,
  type Handoff,
  type ProfileConflict,
} from './memory-handoff';
import { getDb } from './sqlite';

const CSV_ROW_CAP = 5000;
const ORDER_PAGE = 500;

type Db = ReturnType<typeof getDb>;

/** 表存在性检查：反馈队列是后加的模块，老库/未启用时不能让导出 500。 */
function tableExists(db: Db, name: string): boolean {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
}

export interface ProfileAuditEvent {
  id: number;
  subject_type: string;
  subject_id: string;
  key: string;
  action: string;
  new_value: string;
  confidence: number;
  source: string;
  actor: string;
  evidence: string;
  created_at: number;
}

export interface ProfileAuditTrail {
  /** 窗口内事件总数（不受明细 cap 影响） */
  total: number;
  by_action: Record<string, number>;
  /** 人工裁决次数（采纳 / 驳回都算），是「老板不可替代决策」的可核实证据 */
  resolutions: number;
  /** 最近 N 条明细，按时间正序 */
  events: ProfileAuditEvent[];
}

/**
 * 画像写回审计视图（只读 SELECT，不写表、不触发模型）。
 * 时间窗口沿用 overview().range 的 [from, to)，与经营数字讲同一段时间。
 */
function readAuditTrail(
  db: Db,
  input: { limit: number; from: number | null; to: number | null },
): ProfileAuditTrail {
  const params: unknown[] = [];
  let where = 'WHERE 1 = 1';
  if (input.from !== null) {
    where += ' AND created_at >= ?';
    params.push(input.from);
  }
  if (input.to !== null) {
    where += ' AND created_at < ?';
    params.push(input.to);
  }
  const groups = db
    .prepare(`SELECT action, COUNT(*) AS n FROM memory_profile_events ${where} GROUP BY action`)
    .all(...params) as Array<{ action: string; n: number }>;
  const by_action: Record<string, number> = {};
  let total = 0;
  for (const g of groups) {
    by_action[g.action] = g.n;
    total += g.n;
  }
  const resolutions = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM memory_profile_events ${where} AND source = 'conflict_resolution'`)
      .get(...params) as { n: number }
  ).n;
  const rows = db
    .prepare(
      `SELECT id, subject_type, subject_id, key, action, new_value, confidence,
              source, actor, evidence, created_at
         FROM memory_profile_events ${where} ORDER BY id DESC LIMIT ?`,
    )
    .all(...params, input.limit) as ProfileAuditEvent[];
  return { total, by_action, resolutions, events: rows.reverse() };
}

export interface FeedbackItem {
  subject_id: string;
  status: string;
  actions: string[];
  conflicts: number;
  source: string;
  created_at: number;
  /** 写回失败时的失败原因（processFeedbackRow 的 catch 落下的 error）；正常行为空串。 */
  error: string;
}

export interface FeedbackSnapshot {
  /** false = 反馈队列模块尚未启用（表不存在）；计数为 0，报告其余部分照常可用 */
  available: boolean;
  stats: {
    total: number; pending: number; processed: number;
    skipped: number; failed: number; conflicts: number;
  };
  items: FeedbackItem[];
}

function jsonArray(raw: unknown): string[] {
  try {
    const parsed: unknown = JSON.parse(String(raw ?? '[]'));
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** 反馈队列快照：模块没上线时返回空快照，绝不让导出崩在缺表上。 */
function readFeedback(db: Db, cap: number): FeedbackSnapshot {
  const emptyStats = { total: 0, pending: 0, processed: 0, skipped: 0, failed: 0, conflicts: 0 };
  if (!tableExists(db, 'memory_feedback_queue')) {
    return { available: false, stats: emptyStats, items: [] };
  }
  const groups = db
    .prepare(`SELECT status, COUNT(*) AS n, COALESCE(SUM(conflicts), 0) AS c
                FROM memory_feedback_queue GROUP BY status`)
    .all() as Array<{ status: string; n: number; c: number }>;
  const stats = { ...emptyStats };
  for (const g of groups) {
    stats.total += g.n;
    stats.conflicts += g.c;
    if (g.status === 'pending' || g.status === 'processed' || g.status === 'skipped' || g.status === 'failed') {
      stats[g.status] += g.n;
    }
  }
  const rows = db
    .prepare(`SELECT subject_id, status, actions_json, conflicts, source, created_at, error
                FROM memory_feedback_queue ORDER BY created_at DESC LIMIT ?`)
    .all(cap) as Array<{
    subject_id: string; status: string; actions_json: string;
    conflicts: number; source: string; created_at: number; error: string;
  }>;
  return {
    available: true,
    stats,
    items: rows.map((r) => ({
      subject_id: r.subject_id,
      status: r.status,
      actions: jsonArray(r.actions_json),
      conflicts: r.conflicts,
      source: r.source,
      created_at: r.created_at,
      error: r.error ?? '',
    })),
  };
}

/**
 * 协作 DAG 交接留痕（hop）—— 编排层每条前向边 A→B 落一行，全生命周期可审计。
 * 这里只做只读投影，不 import 编排层、不调用它的写入函数：
 * 证据包是「已经发生的事」的记录者，不是执行者，改编排层的口子一律不开。
 */
export interface HopEvent {
  id: string;
  group_id: string;
  turn_seq: number;
  from_agent: string;
  to_agent: string;
  status: string;
  output_chars: number;
  detail: string;
  created_at: number;
  settled_at: number | null;
}

export interface CollaborationTrail {
  /** false = 老库里没有 agent_hops 表；计数记 0，报告其余章节照常可用 */
  available: boolean;
  /** 窗口内 hop 总数（与经营数字同一 [from, to)） */
  total: number;
  by_status: Record<string, number>;
  /** 已结算（settled_at 非空）/ 尚未结算（悬挂中的交接） */
  settled: number;
  open: number;
  /** 异常终态：failed / timeout / denied / aborted / empty —— 需要人介入或重试 */
  failures: number;
  /** 返工 hop：detail 以 'rework round ' 开头（conditional 驳回触发的真实标记） */
  reworks: number;
  /**
   * 人工审批门拒绝：detail 以「审批被拒」开头。
   * 注意 status='denied' 还可能是系统的 'policy deny'，那种不算老板拍板，
   * 所以这里按 detail 精确识别，绝不把系统策略拦截包装成「人的决策」。
   */
  approval_rejections: number;
  /** 最近 N 条明细，按时间正序 */
  events: HopEvent[];
}

const HOP_ABNORMAL = ['failed', 'timeout', 'denied', 'aborted', 'empty'];

/** 协作 DAG 留痕只读汇总；表不存在时返回空快照，不让导出 500。 */
function readCollaboration(
  db: Db,
  opts: { limit: number; from: number | null; to: number | null },
): CollaborationTrail {
  const empty: CollaborationTrail = {
    available: false, total: 0, by_status: {}, settled: 0, open: 0,
    failures: 0, reworks: 0, approval_rejections: 0, events: [],
  };
  if (!tableExists(db, 'agent_hops')) return empty;

  const params: unknown[] = [];
  let where = 'WHERE 1 = 1';
  if (opts.from !== null) {
    where += ' AND created_at >= ?';
    params.push(opts.from);
  }
  if (opts.to !== null) {
    where += ' AND created_at < ?';
    params.push(opts.to);
  }
  const rows = db
    .prepare(
      `SELECT status,
              COUNT(*) AS n,
              COALESCE(SUM(CASE WHEN settled_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS settled,
              COALESCE(SUM(CASE WHEN settled_at IS NULL THEN 1 ELSE 0 END), 0) AS open,
              COALESCE(SUM(CASE WHEN detail LIKE 'rework round %' THEN 1 ELSE 0 END), 0) AS reworks,
              COALESCE(SUM(CASE WHEN detail LIKE '审批被拒%' THEN 1 ELSE 0 END), 0) AS approval_rejections
         FROM agent_hops ${where} GROUP BY status`,
    )
    .all(...params) as Array<{
    status: string; n: number; settled: number; open: number;
    reworks: number; approval_rejections: number;
  }>;
  const by_status: Record<string, number> = {};
  let total = 0;
  let settled = 0;
  let open = 0;
  let failures = 0;
  let reworks = 0;
  let approval_rejections = 0;
  for (const r of rows) {
    by_status[r.status] = r.n;
    total += r.n;
    settled += r.settled;
    open += r.open;
    if (HOP_ABNORMAL.includes(r.status)) failures += r.n;
    reworks += r.reworks;
    approval_rejections += r.approval_rejections;
  }
  const events = db
    .prepare(
      `SELECT id, group_id, turn_seq, from_agent, to_agent, status, output_chars,
              detail, created_at, settled_at
         FROM agent_hops ${where} ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(...params, opts.limit) as HopEvent[];
  return {
    available: true, total, by_status, settled, open,
    failures, reworks, approval_rejections, events: events.reverse(),
  };
}

export interface EvidenceReport {
  schema_version: 'evidence-1';
  generated_at: number;
  window: { from: number | null; to: number | null; label: string };
  merchant: {
    stats: ReturnType<typeof stats>;
    overview: ReturnType<typeof overview>;
    reconcile: ReturnType<typeof reconcile>;
    first_order: ReturnType<typeof firstOrderChain>;
    orders: { total: number; shown: number; items: OrderRow[] };
  };
  memory: {
    stats: ReturnType<typeof handoffStats>;
    conflicts: ProfileConflict[];
    audit: ProfileAuditTrail;
    feedback: FeedbackSnapshot;
    handoffs: Handoff[];
    /** 记忆消费留痕：contextFor 被调用的记录（谁 / 作用域 / 带出几条 / 来源）。 */
    context_reads: ReturnType<typeof contextReads>;
  };
  /** 协作 DAG 执行留痕（只读 agent_hops），把「异常处理」变成可核实的运行记录。 */
  collaboration: CollaborationTrail;
  /** 「老板不可替代决策」的可核实计数，单独成节给评委看。 */
  human_decisions: {
    pending_conflicts: number;
    resolutions: number;
    failed_feedback: number;
    pending_feedback: number;
    /** 异常终态的交接节点：需要人重试 / 介入 */
    hop_failures: number;
    /** 人工审批门拒绝执行：老板否决了某个节点 */
    hop_approval_rejections: number;
    note: string;
  };
  notes: string[];
  reproduction: { endpoints: string[]; steps: string[] };
}

export interface EvidenceInput {
  start?: unknown;
  end?: unknown;
  limit?: unknown;
}

function capNum(v: unknown, fallback: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), max) : fallback;
}

/** 分 → ¥。金额一律整数分，只有展示时换算。 */
export function yuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

/** 本地时间，不用 UTC —— 国内演示场景 UTC 会把早上 8 点前的单算到昨天。 */
export function stamp(ts: number | null | undefined): string {
  if (ts === null || ts === undefined || !Number.isFinite(ts)) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function windowLabel(from: number | null, to: number | null): string {
  if (from === null && to === null) return '全部（开张至今）';
  return `${stamp(from)} ~ ${to === null ? '现在' : stamp(to)}`;
}

/** 取全量订单：listOrders 单页封顶 500，导出不能悄悄只给前 500 行。 */
function allOrders(start: unknown, end: unknown): { items: OrderRow[]; total: number; truncated: boolean } {
  const items: OrderRow[] = [];
  let offset = 0;
  let total = 0;
  for (;;) {
    const page = listOrders({ start, end, limit: ORDER_PAGE, offset });
    total = page.total;
    items.push(...page.items);
    if (!page.has_more || items.length >= CSV_ROW_CAP) break;
    offset = items.length;
  }
  return { items, total, truncated: items.length < total };
}

export function buildEvidence(input: EvidenceInput = {}): EvidenceReport {
  const cap = capNum(input.limit, 50, 200);
  // overview 里已做 start/end 校验（非法 → MerchantError 400）并返回解析后的窗口，
  // 记忆流水复用同一个窗口，保证「经营数字」和「人机协作记录」讲的是同一段时间。
  const ov = overview({ start: input.start, end: input.end, compare: true });
  const { from, to } = ov.range;
  const orders = allOrders(input.start, input.end);

  const db = getDb();
  const ms = handoffStats();
  const feedback = readFeedback(db, cap);
  const conflicts = listConflicts({ limit: cap });
  const audit = readAuditTrail(db, { limit: cap, from, to });
  const handoffs = listHandoffs({ limit: cap });
  const context_reads = contextReads({ limit: cap, from, to });
  const collaboration = readCollaboration(db, { limit: cap, from, to });

  return {
    schema_version: 'evidence-1',
    generated_at: Date.now(),
    window: { from, to, label: windowLabel(from, to) },
    merchant: {
      stats: stats(),
      overview: ov,
      reconcile: reconcile(),
      first_order: firstOrderChain(''),
      orders: {
        total: orders.total,
        shown: Math.min(orders.items.length, cap),
        items: orders.items.slice(0, cap),
      },
    },
    memory: {
      stats: ms,
      conflicts,
      audit,
      feedback,
      handoffs,
      context_reads,
    },
    collaboration,
    human_decisions: {
      pending_conflicts: ms.pending_conflicts,
      resolutions: audit.resolutions,
      failed_feedback: feedback.stats.failed,
      pending_feedback: feedback.stats.pending,
      hop_failures: collaboration.failures,
      hop_approval_rejections: collaboration.approval_rejections,
      note: '系统自动完成下单、记账、反馈提炼、低置信写回与 DAG 分层调度；遇到同置信冲突只留痕不覆盖，由人在裁决台决定采纳或驳回；处理失败的反馈由人点补跑；被审批门驳回或异常终态的协作节点由人决定是否重试。',
    },
    notes: [
      '营收 = 收入流水 − 退款流水；成本 = 费用流水（退款会补一条负数 expense 冲回成本）；毛利 = 营收 − 成本。',
      '客单价 = 营收 ÷ 未退款成交单数；区间按记账时间切，跨期退款计入退款发生的那一段。',
      '分时流水的成交额含后续退款的历史成交，与净营收口径不同，两者不相等属正常。',
      '支付为演示用模拟回调，未接真实支付渠道；金额为整数分，展示时换算成元。',
      '画像写回是规则式提炼（零模型消耗）；同置信不同说法记 conflict 并保留原值，不擅自覆盖。',
      '本材料由已落库事实汇总生成，导出过程只读，不改写任何业务数据。',
      '经营数字、画像写回流水、记忆消费留痕与协作 hop 留痕按所选统计区间；交接包与反馈队列的计数是累计全量、明细只取最近 N 条，两类口径在报告中分开标注。',
      '记忆消费留痕 = 每次调用 GET /api/memory/handoff/context 读上下文时自动落的一条访问记录（谁 / 作用域 / 带出几条 / 来源），只证明「记忆被用上」，不含任何产出内容；计数为 0 只说明还没人读过，不代表功能缺失。',
      '协作 hop 取自编排层已落库的 agent_hops（每条 DAG 边一行）；只记状态、产出字符数与终态原因，产出全文不落库。本材料只读汇总，不改编排层。',
      '异常终态 = failed / timeout / denied / aborted / empty；返工按 detail「rework round」识别，人工审批拒绝按「审批被拒」识别；系统策略 deny 与人工审批拒绝都记为 denied，只有后者算人的决策。',
      ...(collaboration.available ? [] : ['协作留痕表 agent_hops 不存在（老库），本章计数为 0；其余章节不受影响。']),
      ...(feedback.available ? [] : ['反馈自动写回队列模块尚未启用（数据表不存在），本节计数为 0；启用后导出会自动包含真实数据，无需改代码。']),
      ...(orders.truncated ? [`订单明细超过 ${CSV_ROW_CAP} 行，CSV 只导出前 ${CSV_ROW_CAP} 行；完整数据请翻页查询 /api/merchant/orders。`] : []),
    ],
    reproduction: {
      endpoints: [
        'GET /api/merchant/overview?start=&end=&compare=1',
        'GET /api/merchant/reconcile',
        'GET /api/merchant/first-order',
        'GET /api/merchant/orders',
        'GET /api/merchant/evidence',
        'GET /api/merchant/evidence.md',
        'GET /api/merchant/evidence/scorecard.md',
        'GET /api/merchant/evidence/orders.csv',
        'GET /api/memory/handoff/stats',
        'GET /api/memory/handoff/context?agent=B',
        'GET /api/memory/handoff/context/reads',
        'GET /api/memory/handoff/profiles/conflicts',
        'GET /api/memory/handoff/feedback',
      ],
      steps: [
        '一键重放：node scripts/first-order-replay.mjs --apply（默认 dry-run 只打印计划；--apply 会往当前库写 1 访客/1 单/1 支付，演示库上台前按纪律 reset）',
        '异常处理 / 老板决策演示样例：node server/node_modules/tsx/dist/cli.mjs scripts/demo-exception-replay.mjs（临时独立库造数，不碰演示库；产物带 -sample-decisions 标记，不可冒充线上导出）',
        '上台前材料自检：node server/node_modules/tsx/dist/cli.mjs scripts/demo-readiness.mjs（只读；校验产物齐全、CSV BOM、附件与看板数字一致、账实一致、第一单链路；--offline 可在没起服务时只跑材料形态）',
        '或手工复现：POST /api/merchant/products 建商品 → /visits 埋点 → /orders 下单 → /orders/:id/pay 支付',
        '打开商家数据看板核对营收/毛利，再看 /reconcile 是否账实一致',
        'POST /api/memory/handoff/feedback 投递客户反馈，系统自动提炼写回画像',
        '出现同置信冲突时到「设置 — 记忆」的裁决台人工采纳或驳回',
        '（可选）在已绑团队的群发消息触发 DAG：节点失败、返工与人工审批拒绝会落 agent_hops，导出时自动进入「协作执行留痕」一章',
        '在商家数据看板点「演示证据包」，分别得到评委速览一页、七章 Markdown 报告与订单 CSV',
      ],
    },
  };
}

function mdCell(v: unknown): string {
  return String(v ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .slice(0, 160);
}

/** 七章报告与评委速览共用同一套表格写法，避免两份材料的转义/截断口径漂移。 */
function appendTable(lines: string[], head: string[], rows: string[][]): void {
  lines.push(`| ${head.join(' | ')} |`);
  lines.push(`| ${head.map(() => '---').join(' | ')} |`);
  for (const row of rows) lines.push(`| ${row.map(mdCell).join(' | ')} |`);
}

const STATUS_LABEL: Record<string, string> = {
  created: '待支付',
  paid: '已支付',
  refunded: '已退款',
};

const ACTION_LABEL: Record<string, string> = {
  create: '新建',
  update: '更新',
  conflict: '冲突留痕（待人裁决）',
  keep: '低置信保留原值',
  override: '人工采纳',
  dismiss: '人工驳回',
};

const STEP_LABEL: Record<string, string> = {
  visit_landed: '落地页到访',
  order_created: '下单',
  order_paid: '支付成功',
  ledger_income: '记入流水',
  dashboard_visible: '看板可见',
};

/** agent_hops 状态的中文化，报告里不直接甩英文枚举给评委。 */
const HOP_STATUS_LABEL: Record<string, string> = {
  pending: '待开始',
  running: '执行中',
  done: '完成',
  failed: '失败',
  timeout: '超时',
  empty: '空产出',
  denied: '拒绝 / 策略拦截',
  aborted: '已中止',
};

/**
 * 评委速览正文（七章报告卷首与独立一页共用同一份，避免两处口径漂移）。
 *
 * 纪律：只做「赛题评分维度 / 加分项 → 已落库证据 → 复现端点」的映射，
 * **不替评委打分、不自评完成度**；数字全取自 report，计数为 0 时明写「待造数据」，
 * 绝不把没跑过的功能写成「已展示」。空库上台是最容易当场露馅的地方。
 */
function scorecardBody(report: EvidenceReport): string[] {
  const { merchant: m, memory: mm, collaboration: dag, human_decisions: hd } = report;
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  const table = (head: string[], rows: string[][]) => appendTable(lines, head, rows);

  const delta = m.overview.comparison?.delta_pct;
  const trend = delta
    ? `；较上一等长区间营收 ${delta.revenue === null ? '新增' : `${delta.revenue}%`}`
    : '';
  const unitEconomics = [
    `营收 ${yuan(m.overview.revenue_cents)}`,
    `毛利 ${yuan(m.overview.gross_profit_cents)}`,
    m.overview.gross_margin_pct === null ? '毛利率 —' : `毛利率 ${m.overview.gross_margin_pct}%`,
    `客单价 ${yuan(m.overview.avg_order_cents)}`,
    `成交 ${m.overview.paid_orders} 单 / 退款 ${m.overview.refunded_orders} 单`,
  ].join(' · ') + trend;
  const firstOrder = m.first_order.complete
    ? `五步全通 ✓（订单 ${m.first_order.order_id || '—'}）`
    : '五步未通 ×（需按复现步骤跑通第一单）';
  const human = `人工裁决 ${hd.resolutions} 次 · 待裁决 ${hd.pending_conflicts} · 人工审批拒绝 ${dag.approval_rejections} · 待补跑反馈 ${hd.failed_feedback + hd.pending_feedback}`;
  const collab = `交接 hop ${dag.total}（异常 ${dag.failures} / 返工 ${dag.reworks}）`;
  const balanced = m.reconcile.balanced ? '账实一致' : '账实有差额';
  const chainSteps = m.first_order.steps.filter((s) => s.ok).length;

  push('**评分维度 → 可核实证据**（分值照抄赛题评分表，本页不打分）');
  push();
  table(['维度（分值）', '赛题评分依据', '本材料的可核实证据', '现场复现'], [
    ['创新性（35）', '公司形态 / 组织设计 / 业务闭环有新意；体现 AI 员工独特价值',
      `交接包 ${mm.stats.handoffs}（已接班 ${mm.stats.accepted}）· 画像写回 ${mm.audit.total} 事件 · 记忆消费 ${mm.context_reads.total} 次 · 冲突只留痕不覆盖（待裁决 ${hd.pending_conflicts}）· ${collab}`,
      '报告第三、四章；GET /api/memory/handoff/stats、/context/reads'],
    ['商业化潜力（25）', '定价 / 获客方式 / 单位经济合理，业务能持续运行',
      `${unitEconomics} · ${balanced}`,
      '报告第一、二章；GET /api/merchant/overview?compare=1、/reconcile'],
    ['完成度（25）', '产品可访问、闭环可演示、达到真实可用的交付水准',
      `第一单${firstOrder} · 订单 ${m.overview.orders_total} 单 · ${balanced} · 可复现端点 ${report.reproduction.endpoints.length} 个`,
      '报告第一、七章；GET /api/merchant/first-order、/orders'],
    ['原创性（15）', '自己提出并实现方案，而非套用现成工具或仅展示 Agent 编排',
      '规则式画像写回（零模型消耗）+ 同置信冲突进人工裁决台；退款补负数 expense 冲成本 + reconcile 账实核对；演示证据包纯只读导出',
      '报告第三、六、七章；GET /api/merchant/evidence'],
  ]);

  push();
  push('**加分表现 → 证据状态**（计数为 0 表示尚未造数据，不代表功能已完成）');
  push();
  table(['加分项', '可核实证据', '证据状态'], [
    ['第一单（真实或模拟交易）',
      `第一单${firstOrder}；区间内订单 ${m.orders.total} 单；营收 ${yuan(m.overview.revenue_cents)}`,
      m.first_order.complete && m.overview.paid_orders > 0 ? '有数据' : '待跑通'],
    ['人机分工清晰', human,
      hd.resolutions + hd.pending_conflicts + dag.approval_rejections > 0 ? '有数据' : '待造数据'],
    ['跨多个生产力场景形成完整闭环',
      `落地页 → 下单 → 支付 → 入账 → 看板（${chainSteps}/5 步）；客户反馈 → 画像写回 → 岗位交接 → 记忆消费；DAG 调度 → 返工 → 审批`,
      m.first_order.complete && (mm.audit.total > 0 || mm.stats.handoffs > 0 || mm.context_reads.total > 0 || dag.total > 0)
        ? '有数据' : '部分待补'],
    ['项目可被他人复用',
      `端点清单 ${report.reproduction.endpoints.length} 个 · 复现步骤 ${report.reproduction.steps.length} 步 · 导出只读不脏库`,
      '材料常驻'],
  ]);

  push();
  push('**局限与待补证据**（上台前照此补齐，别拿空库演示）');
  push();
  const gaps = ['支付为演示用模拟回调，未接真实支付渠道；金额以整数分记账，展示时换算成元。'];
  if (!m.first_order.complete) gaps.push('第一单五步链路未通：按第七章步骤建商品 → 埋点 → 下单 → 支付后重新导出。');
  if (!mm.feedback.available) gaps.push('反馈自动写回队列模块尚未启用（表不存在），队列计数为 0。');
  if (hd.failed_feedback > 0 || hd.pending_feedback > 0) {
    gaps.push(`反馈队列还有 ${hd.failed_feedback} 条写回失败 / ${hd.pending_feedback} 条待处理：在「设置 — 记忆」点「补跑待处理 / 失败」重放后重新导出，失败原因见七章报告的反馈队列表。`);
  }
  if (mm.audit.total === 0 && mm.stats.handoffs === 0) {
    gaps.push('本区间没有画像写回 / 交接包留痕：投递客户反馈或触发一次岗位交接后重新导出，创新性与人机分工两格才有事实可核。');
  }
  if ((mm.audit.total > 0 || mm.stats.handoffs > 0) && mm.context_reads.total === 0) {
    gaps.push('画像 / 交接有了但还没有记忆消费记录：让接班 agent 调 GET /api/memory/handoff/context 拉一次上下文（每次调用自动落痕）后重新导出，「记忆被用上」才有事实可核。');
  }
  if (!dag.available) gaps.push('老库不存在 agent_hops 表，协作留痕计数为 0。');
  else if (dag.total === 0) gaps.push('本区间没有协作交接：在已绑团队的群触发一次 DAG（含失败 / 返工 / 审批拒绝）后重新导出。');
  if (!m.reconcile.balanced) gaps.push(`账实有差额：${m.reconcile.issues.slice(0, 3).join('；')}`);
  for (const g of gaps) push(`- ${g}`);
  push();
  push('**材料索引**（同一 Node 服务，不另起端口）');
  push();
  push('- 完整七章报告：`GET /api/merchant/evidence.md`');
  push('- 订单明细 CSV：`GET /api/merchant/evidence/orders.csv`');
  push('- 机器可读全量：`GET /api/merchant/evidence`');
  push('- 本页单独下载：`GET /api/merchant/evidence/scorecard.md`');
  return lines;
}

/** 一页速览：可单独发给评委，也可当答辩首页打印。 */
export function evidenceScorecard(report: EvidenceReport): string {
  const lines = [
    '# ShadowFlow · 评委速览（一页）',
    '',
    `- 生成时间：${stamp(report.generated_at)}（本地时间）`,
    `- 统计区间：${report.window.label}`,
    `- 材料版本：${report.schema_version}`,
    '',
    '本页只把赛题评分维度与加分项映射到 **已落库、可复现的证据**，不代替评委打分；所有数字与 `GET /api/merchant/evidence` 同源，导出过程只读。',
    '',
    ...scorecardBody(report),
  ];
  return `${lines.join('\n')}\n`;
}

/** Markdown 报告：评委不用打开系统也能核实数字与分工，且能当答辩附件。 */
export function evidenceMarkdown(report: EvidenceReport): string {
  const { merchant: m, memory: mm, collaboration: dag, human_decisions: hd } = report;
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  const table = (head: string[], rows: string[][]) => appendTable(lines, head, rows);

  push('# ShadowFlow · 一人公司演示证据包');
  push();
  push(`- 生成时间：${stamp(report.generated_at)}（本地时间）`);
  push(`- 统计区间：${report.window.label}`);
  push(`- 数据来源：Node/Express + SQLite 已落库事实；导出只读，不调模型、不改数据`);
  push(`- 材料版本：${report.schema_version}`);
  push();

  // 卷首一页速览：评委先看这张对照表，再按章节号下钻核实。
  // 用「〇」不打乱后面一~七的编号，也不让两处速览内容各自漂移。
  push('## 〇、评委速览（对照赛题评分表）');
  push();
  lines.push(...scorecardBody(report));
  push();

  push('## 一、业务闭环：第一单与经营口径');
  push();
  table(['指标', '数值'], [
    ['营收（已扣退款）', yuan(m.overview.revenue_cents)],
    ['成本', yuan(m.overview.cost_cents)],
    ['毛利', yuan(m.overview.gross_profit_cents)],
    ['毛利率', m.overview.gross_margin_pct === null ? '—' : `${m.overview.gross_margin_pct}%`],
    ['客单价', yuan(m.overview.avg_order_cents)],
    ['订单总数 / 已支付 / 已退款', `${m.overview.orders_total} / ${m.overview.paid_orders} / ${m.overview.refunded_orders}`],
    ['表计数（商品 / 访客 / 订单 / 流水）', `${m.stats.products} / ${m.stats.visits} / ${m.stats.orders} / ${m.stats.ledger}`],
  ]);
  if (m.overview.comparison) {
    const d = m.overview.comparison.delta_pct;
    push();
    push(`较上一等长区间：营收 ${d.revenue === null ? '新增' : `${d.revenue}%`} · 毛利 ${d.gross_profit === null ? '新增' : `${d.gross_profit}%`} · 订单 ${d.orders === null ? '新增' : `${d.orders}%`}（由后端算好，报告不二次计算）`);
  }
  push();
  push(`**第一单链路**：${m.first_order.complete ? '五步全通 ✓' : '链路未通 ×'}${m.first_order.order_id ? `（订单 ${m.first_order.order_id}）` : ''}`);
  push();
  for (const s of m.first_order.steps) {
    push(`- ${s.ok ? '✓' : '×'} ${STEP_LABEL[s.step] ?? s.step}`);
  }
  push();

  push('## 二、账实核对（数字能不能自证）');
  push();
  push(`- 结论：**${m.reconcile.balanced ? '账实一致' : '账实有差额'}**`);
  push(`- 收入流水 ${yuan(m.reconcile.ledger.income)} / 退款流水 ${yuan(m.reconcile.ledger.refund)} / 费用流水 ${yuan(m.reconcile.ledger.expense)}`);
  for (const issue of m.reconcile.issues) push(`- ⚠ ${issue}`);
  push();

  push('## 三、人机分工与异常处理（评委重点）');
  push();
  push(hd.note);
  push();
  if (!mm.feedback.available) {
    push('> 反馈自动写回队列模块尚未启用，队列相关计数为 0；其余留痕不受影响。');
    push();
  }
  table(['事项', '数量', '谁负责'], [
    ['Agent 交接包（已接班）', `${mm.stats.handoffs}（${mm.stats.accepted}）`, '系统自动汇总快照 / B 确认接班'],
    ['画像写回事件', String(mm.audit.total), '系统自动（规则式，零模型）'],
    ['冲突留痕（累计）', String(mm.stats.conflicts), '系统只留痕，不擅自覆盖'],
    ['待裁决冲突', String(hd.pending_conflicts), '**人**在裁决台决定采纳 / 驳回'],
    ['人工裁决已发生', String(hd.resolutions), '**人**拍板，事件带 actor 与证据'],
    ['反馈自动写回·累计（总 / 已处理 / 跳过 / 失败）', `${mm.feedback.stats.total} / ${mm.feedback.stats.processed} / ${mm.feedback.stats.skipped} / ${mm.feedback.stats.failed}`, '系统自动；失败由**人**补跑'],
    ['待补跑反馈（pending / failed）', `${hd.pending_feedback} / ${hd.failed_feedback}`, '**人**点补跑后重放，幂等不重复写回'],
    ['协作 DAG 交接 hop（本区间）', String(dag.total), '系统按拓扑调度，每条边逐行落库'],
    ['异常终态节点（失败 / 超时 / 拒绝 / 空产出 / 中止）', String(dag.failures), '**人**决定是否重试，不静默吞掉'],
    ['人工审批门拒绝执行', String(dag.approval_rejections), '**人**否决节点，系统不擅自放行'],
  ]);
  push();
  push('写回动作分布（窗口内）：');
  push();
  const actions = Object.entries(mm.audit.by_action);
  if (actions.length === 0) push('- 暂无写回事件');
  else for (const [action, n] of actions) push(`- ${ACTION_LABEL[action] ?? action}：${n}`);
  push();
  if (mm.conflicts.length > 0) {
    push('当前待裁决（系统没有替老板做决定）：');
    push();
    table(['主体', '字段', '当前值', '提议值', '证据'], mm.conflicts.slice(0, 10).map((c) => [
      c.subject_id, c.key, c.current_value, c.proposed_value, c.evidence,
    ]));
    push();
  }

  push('## 四、协作执行留痕（DAG 异常处理可核实）');
  push();
  push('数据来源：编排层每次 DAG 边遍历（A→B 交接）落一行 `agent_hops`，全生命周期状态可审计。本材料**只读汇总，不改编排层任何代码**；产出全文不落库，只保留状态、产出字符数与终态原因。');
  push();
  if (!dag.available) {
    push('> 老库中不存在 `agent_hops` 表，本章计数为 0；其余章节不受影响。');
    push();
  }
  table(['指标', '数值', '含义'], [
    ['交接 hop 总数（本区间）', String(dag.total), '与上方经营数字同一统计区间'],
    ['已结算 / 未结算', `${dag.settled} / ${dag.open}`, '未结算 = 悬挂中的交接，巡检可发现'],
    ['异常终态', String(dag.failures), 'failed / timeout / denied / aborted / empty'],
    ['其中返工（conditional 驳回）', String(dag.reworks), '评审节点驳回 → 被评审方带意见重跑'],
    ['其中人工审批拒绝', String(dag.approval_rejections), '老板否决带审批入边的节点'],
  ]);
  push();
  const hopStatuses = Object.entries(dag.by_status);
  push(`状态分布：${hopStatuses.length === 0
    ? '本区间未发生 DAG 交接'
    : hopStatuses.map(([s, n]) => `${HOP_STATUS_LABEL[s] ?? s} ${n}`).join(' · ')}`);
  push();
  push(`### 交接明细（最近 ${dag.events.length} 条，按时间正序）`);
  push();
  if (dag.events.length === 0) {
    push('_本区间没有协作交接记录；如需核实异常处理，可在已绑团队的群触发一次 DAG（含节点失败 / 返工 / 审批拒绝）后重新导出。_');
  } else {
    table(['时间', '群 / 回合', '交出 → 接手', '状态', '产出字符', '终态原因'], dag.events.map((h) => [
      stamp(h.created_at), `${h.group_id} / #${h.turn_seq}`,
      `${h.from_agent} → ${h.to_agent}`, HOP_STATUS_LABEL[h.status] ?? h.status,
      String(h.output_chars), h.detail || '—',
    ]));
  }
  push();

  push('## 五、运行记录明细');
  push();
  push(`### 订单明细（区间内共 ${m.orders.total} 单，下列 ${m.orders.shown} 单）`);
  push();
  if (m.orders.items.length === 0) {
    push('_区间内还没有订单_');
  } else {
    table(['时间', '商品', '状态', '金额', '成本', '毛利'], m.orders.items.map((o) => [
      stamp(o.created_at), o.product_name, STATUS_LABEL[o.status] ?? o.status,
      yuan(o.amount_cents), yuan(o.cost_cents),
      o.status === 'paid' ? yuan(o.gross_profit_cents) : '—',
    ]));
  }
  push();
  push(`### 画像写回流水（最近 ${mm.audit.events.length} 条，按时间正序）`);
  push();
  if (mm.audit.events.length === 0) {
    push('_窗口内还没有写回事件_');
  } else {
    table(['时间', '主体', '字段', '动作', '值', '来源', '操作者'], mm.audit.events.map((e) => [
      stamp(e.created_at), e.subject_id, e.key, ACTION_LABEL[e.action] ?? e.action,
      e.new_value, e.source, e.actor,
    ]));
  }
  push();
  push(`### 反馈队列最近 ${mm.feedback.items.length} 条`);
  push();
  if (mm.feedback.items.length === 0) {
    push('_还没有反馈投递_');
  } else {
    table(['时间', '主体', '状态', '写回动作', '冲突', '来源', '失败原因'], mm.feedback.items.map((f) => [
      stamp(f.created_at), f.subject_id, f.status, f.actions.join('/') || '—',
      String(f.conflicts), f.source,
      f.status === 'failed' ? (f.error || '（未留原因）').slice(0, 60) : '—',
    ]));
  }
  push();
  if (mm.handoffs.length > 0) {
    push(`### 交接包最近 ${mm.handoffs.length} 条`);
    push();
    table(['时间', '班次', '交出 → 接手', '状态', '上下文条数'], mm.handoffs.map((h) => [
      stamp(h.created_at), h.shift_id, `${h.from_agent} → ${h.to_agent}`,
      h.status === 'accepted' ? '已接班' : '待接班', String(h.context_items),
    ]));
    push();
  }

  push(`### 记忆消费留痕（窗口内共 ${mm.context_reads.total} 次，下列最近 ${mm.context_reads.items.length} 条，按时间正序）`);
  push();
  if (mm.context_reads.items.length === 0) {
    push('_窗口内还没有记忆消费记录：让接班 agent 调 `GET /api/memory/handoff/context` 拉一次上下文即可留下痕迹（每次调用自动落一条访问记录）。_');
  } else {
    table(['时间', '消费方', '作用域', '带出条数', '来源'], mm.context_reads.items.map((c) => [
      stamp(c.created_at), c.agent,
      [c.scope_key, c.task_type].filter(Boolean).join(' / ') || '—',
      String(c.item_count), c.sources.join('、') || '—',
    ]));
  }
  push();

  push('## 六、口径与边界');
  push();
  for (const n of report.notes) push(`- ${n}`);
  push();

  push('## 七、复现与复用');
  push();
  push('复现步骤：');
  push();
  report.reproduction.steps.forEach((s, i) => push(`${i + 1}. ${s}`));
  push();
  push('相关端点（同一 Node 服务，不另起端口）：');
  push();
  for (const ep of report.reproduction.endpoints) push(`- \`${ep}\``);
  push();
  return `${lines.join('\n')}\n`;
}

/**
 * CSV 单元格：Excel 会把以 = + - @ 开头的文本当公式执行（CSV 注入），
 * 因此文本列统一加双引号并对这些前缀补一个单引号。数字列不走这里，
 * 否则负数金额会被改成文本，导出来没法直接求和。
 */
function csvText(v: unknown): string {
  let s = String(v ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** 订单明细 CSV：UTF-8 BOM 让 Excel 直接认中文，不乱码。 */
export function evidenceOrdersCsv(input: EvidenceInput = {}): string {
  const { items } = allOrders(input.start, input.end);
  const rows: string[] = [
    ['订单号', '商品', '状态', '金额(元)', '成本(元)', '毛利(元)', '下单时间', '支付时间', '交易号', '来源trace_id']
      .map(csvText)
      .join(','),
  ];
  for (const o of items) {
    const numeric = (cents: number) => (cents / 100).toFixed(2);
    rows.push([
      csvText(o.id),
      csvText(o.product_name),
      csvText(STATUS_LABEL[o.status] ?? o.status),
      numeric(o.amount_cents),
      numeric(o.cost_cents),
      o.status === 'paid' ? numeric(o.gross_profit_cents) : '0.00',
      csvText(stamp(o.created_at)),
      csvText(stamp(o.paid_at)),
      csvText(o.pay_txn_id),
      csvText(o.trace_id),
    ].join(','));
  }
  return `\uFEFF${rows.join('\r\n')}\r\n`;
}

/** ASCII 文件名，避免 Content-Disposition 的中文编码在浏览器间不一致。 */
export function evidenceFilename(kind: 'md' | 'csv' | 'scorecard', generatedAt = Date.now()): string {
  const d = new Date(generatedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  const tag = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  const base = kind === 'scorecard' ? 'shadowflow-scorecard' : 'shadowflow-evidence';
  return `${base}-${tag}.${kind === 'csv' ? 'csv' : 'md'}`;
}
