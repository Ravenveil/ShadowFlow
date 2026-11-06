/**
 * evidence.ts — 演示证据包 / 运行记录导出（2026-11-06，功能线①③共同交付）。
 *
 * 赛题「提交要求」里有一条硬指标：运行与演示材料要能让评委核实作品效果。
 * 光有页面截图不够 —— 数字算错、账实不符、冲突被系统擅自覆盖，截图都看不出来。
 * 这里把两条功能线**已落库的事实**汇总成一份可下载材料：
 *   ① 经营口径 / 账实核对 / 第一单五步链路 / 订单明细；
 *   ③ 交接包 / 画像写回流水 / 待裁决冲突 / 反馈队列，以及「哪几步是人拍板」。
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
    .prepare(`SELECT subject_id, status, actions_json, conflicts, source, created_at
                FROM memory_feedback_queue ORDER BY created_at DESC LIMIT ?`)
    .all(cap) as Array<{
    subject_id: string; status: string; actions_json: string;
    conflicts: number; source: string; created_at: number;
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
    })),
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
  };
  /** 「老板不可替代决策」的可核实计数，单独成节给评委看。 */
  human_decisions: {
    pending_conflicts: number;
    resolutions: number;
    failed_feedback: number;
    pending_feedback: number;
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
    },
    human_decisions: {
      pending_conflicts: ms.pending_conflicts,
      resolutions: audit.resolutions,
      failed_feedback: feedback.stats.failed,
      pending_feedback: feedback.stats.pending,
      note: '系统自动完成下单、记账、反馈提炼与低置信写回；遇到同置信冲突只留痕不覆盖，由人在裁决台决定采纳或驳回；处理失败的反馈由人点补跑。',
    },
    notes: [
      '营收 = 收入流水 − 退款流水；成本 = 费用流水（退款会补一条负数 expense 冲回成本）；毛利 = 营收 − 成本。',
      '客单价 = 营收 ÷ 未退款成交单数；区间按记账时间切，跨期退款计入退款发生的那一段。',
      '分时流水的成交额含后续退款的历史成交，与净营收口径不同，两者不相等属正常。',
      '支付为演示用模拟回调，未接真实支付渠道；金额为整数分，展示时换算成元。',
      '画像写回是规则式提炼（零模型消耗）；同置信不同说法记 conflict 并保留原值，不擅自覆盖。',
      '本材料由已落库事实汇总生成，导出过程只读，不改写任何业务数据。',
      '经营数字与画像写回流水按所选统计区间；交接包与反馈队列的计数是累计全量、明细只取最近 N 条，两类口径在报告中分开标注。',
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
        'GET /api/merchant/evidence/orders.csv',
        'GET /api/memory/handoff/stats',
        'GET /api/memory/handoff/profiles/conflicts',
        'GET /api/memory/handoff/feedback',
      ],
      steps: [
        'POST /api/merchant/products 建商品 → /visits 埋点 → /orders 下单 → /orders/:id/pay 支付',
        '打开商家数据看板核对营收/毛利，再看 /reconcile 是否账实一致',
        'POST /api/memory/handoff/feedback 投递客户反馈，系统自动提炼写回画像',
        '出现同置信冲突时到「设置 — 记忆」的裁决台人工采纳或驳回',
        '在商家数据看板点「导出演示证据」，得到本 Markdown 与订单 CSV',
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

/** Markdown 报告：评委不用打开系统也能核实数字与分工，且能当答辩附件。 */
export function evidenceMarkdown(report: EvidenceReport): string {
  const { merchant: m, memory: mm, human_decisions: hd } = report;
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  const table = (head: string[], rows: string[][]) => {
    push(`| ${head.join(' | ')} |`);
    push(`| ${head.map(() => '---').join(' | ')} |`);
    for (const row of rows) push(`| ${row.map(mdCell).join(' | ')} |`);
  };

  push('# ShadowFlow · 一人公司演示证据包');
  push();
  push(`- 生成时间：${stamp(report.generated_at)}（本地时间）`);
  push(`- 统计区间：${report.window.label}`);
  push(`- 数据来源：Node/Express + SQLite 已落库事实；导出只读，不调模型、不改数据`);
  push(`- 材料版本：${report.schema_version}`);
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

  push('## 四、运行记录明细');
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
    table(['时间', '主体', '状态', '写回动作', '冲突', '来源'], mm.feedback.items.map((f) => [
      stamp(f.created_at), f.subject_id, f.status, f.actions.join('/') || '—',
      String(f.conflicts), f.source,
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

  push('## 五、口径与边界');
  push();
  for (const n of report.notes) push(`- ${n}`);
  push();

  push('## 六、复现与复用');
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
export function evidenceFilename(kind: 'md' | 'csv', generatedAt = Date.now()): string {
  const d = new Date(generatedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  const tag = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `shadowflow-evidence-${tag}.${kind === 'md' ? 'md' : 'csv'}`;
}
