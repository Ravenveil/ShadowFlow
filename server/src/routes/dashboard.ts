/**
 * dashboard.ts — 数据看板聚合端点（2026-11-05，整合 OPC-OS PR#3 看板数据层）。
 *
 * GET /api/dashboard/overview?days=30   → 总调用/tokens/成本/run 成功率/活跃项目会话
 * GET /api/dashboard/timeseries?days=30&metric=tokens|calls|cost → 按天聚合数组
 * GET /api/dashboard/breakdown?days=30&by=model|session           → 分布 TopN
 * GET /api/dashboard/briefing?days=7    → 每日简报（零 LLM，纯库内现算）
 *
 * 指标来源全部从我们自己的域取材（token_usage / run_index / conversations /
 * projects），订单/客户/营收类指标按评审结论弃掉。聚合 group by 现算，
 * 不预建聚合表。每日简报对齐 OPC-OS briefing.py 的设计口径：落库事实挖、
 * 零 LLM 调用、同日同内容幂等。
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../storage/sqlite';
import {
  sumUsageBetween,
  usageDailyBetween,
  usageBreakdown,
  startOfDay,
} from '../storage/token-usage';

const router = Router();

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDays(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.round(n), 365);
}

function windowFor(days: number): { from: number; to: number; prevFrom: number; prevTo: number } {
  const to = Date.now();
  const from = to - days * DAY_MS;
  return { from, to, prevFrom: from - days * DAY_MS, prevTo: from };
}

// ── Overview ──────────────────────────────────────────────────────────────────

router.get('/overview', (req: Request, res: Response) => {
  const days = parseDays(req.query.days, 30);
  const { from, to, prevFrom, prevTo } = windowFor(days);

  const usage = sumUsageBetween(from, to);
  const prevUsage = sumUsageBetween(prevFrom, prevTo);

  const runRow = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0) AS succeeded,
              COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
              COALESCE(SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END), 0) AS canceled
       FROM run_index WHERE created_at >= ? AND created_at < ?`,
    )
    .get(from, to) as { total: number; succeeded: number; failed: number; canceled: number };

  const prevRunRow = getDb()
    .prepare(`SELECT COUNT(*) AS total FROM run_index WHERE created_at >= ? AND created_at < ?`)
    .get(prevFrom, prevTo) as { total: number };

  const activeRow = getDb()
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM projects WHERE updated_at >= ?) AS projects,
         (SELECT COUNT(*) FROM conversations WHERE updated_at >= ?) AS conversations`,
    )
    .get(from, from) as { projects: number; conversations: number };

  res.json({
    days,
    window: { from, to },
    usage: {
      calls: usage.calls,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.input_tokens + usage.output_tokens,
      cost_est_usd: round2(usage.cost_est_usd),
      deltas: {
        calls: pct(usage.calls, prevUsage.calls),
        total_tokens: pct(usage.input_tokens + usage.output_tokens, prevUsage.input_tokens + prevUsage.output_tokens),
        cost_est_usd: pct(usage.cost_est_usd, prevUsage.cost_est_usd),
      },
    },
    runs: {
      total: runRow.total,
      succeeded: runRow.succeeded,
      failed: runRow.failed,
      canceled: runRow.canceled,
      success_rate: runRow.total ? round1((runRow.succeeded / runRow.total) * 100) : null,
      delta_total: pct(runRow.total, prevRunRow.total),
    },
    active: {
      projects: activeRow.projects,
      conversations: activeRow.conversations,
    },
  });
});

// ── Timeseries ────────────────────────────────────────────────────────────────

router.get('/timeseries', (req: Request, res: Response) => {
  const days = parseDays(req.query.days, 30);
  const metric = typeof req.query.metric === 'string' ? req.query.metric : 'tokens';
  const { from, to } = windowFor(days);

  const daily = usageDailyBetween(from, to);
  // 补零：从窗口起点到今天的每一天都有一行（前端画图不跳轴）
  const series: Array<Record<string, number | string>> = [];
  const firstDay = startOfDay(from);
  const today = startOfDay(to);
  const map = new Map(daily.map((d) => [d.day, d]));
  for (let t = firstDay; t <= today; t += DAY_MS) {
    const hit = map.get(t);
    const base: Record<string, number | string> = { day: t, calls: hit?.calls ?? 0 };
    if (metric === 'calls') {
      // already included
    } else if (metric === 'cost') {
      base.cost = round2(hit?.cost_est_usd ?? 0);
    } else {
      base.tokens = (hit?.input_tokens ?? 0) + (hit?.output_tokens ?? 0);
    }
    series.push(base);
  }
  res.json({ days, metric, series });
});

// ── Breakdown ─────────────────────────────────────────────────────────────────

router.get('/breakdown', (req: Request, res: Response) => {
  const days = parseDays(req.query.days, 30);
  const by = req.query.by === 'session' ? 'session_id' : 'model';
  const { from, to } = windowFor(days);
  const items = usageBreakdown(from, to, by).map((r) => ({
    ...r,
    total_tokens: r.input_tokens + r.output_tokens,
    cost_est_usd: round2(r.cost_est_usd),
  }));
  res.json({ days, by, items });
});

// ── Briefing（每日简报，零 LLM，库内现算）────────────────────────────────────

router.get('/briefing', (req: Request, res: Response) => {
  const days = parseDays(req.query.days, 7);
  const { from, to } = windowFor(days);
  const today0 = startOfDay(Date.now());

  // 1. 今日 vs 昨日用量（成本突增提醒的依据）
  const todayUsage = sumUsageBetween(today0, today0 + DAY_MS);
  const yesterdayUsage = sumUsageBetween(today0 - DAY_MS, today0);

  // 2. run 失败 Top 原因：近 N 天失败 run，按 goal 聚个粗口径（我们没有独立
  //    的"失败原因"字段，goal + status 是库内已有事实；等 memory_lessons 的
  //    教训积累后再对齐 OPC-OS 的 rework_reason 口径）。
  const failedRuns = getDb()
    .prepare(
      `SELECT goal, COUNT(*) AS n FROM run_index
       WHERE status = 'failed' AND created_at >= ? AND created_at < ?
       GROUP BY goal ORDER BY n DESC LIMIT 5`,
    )
    .all(from, to) as Array<{ goal: string; n: number }>;

  // 3. 近 N 天经验记忆增量（教训/偏好/弱项）
  const lessonsRow = getDb()
    .prepare(
      `SELECT kind, COUNT(*) AS n FROM memory_lessons
       WHERE created_at >= ? AND created_at < ? AND archived = 0
       GROUP BY kind`,
    )
    .all(from, to) as Array<{ kind: string; n: number }>;

  // 4. 7 日趋势摘要（窗口即 7 天时复用同一组数；更长窗口取末 7 天）
  const trend7 = usageDailyBetween(Math.min(from, to - 7 * DAY_MS), to).slice(-7);
  const trend7Tokens = trend7.reduce((acc, d) => acc + d.input_tokens + d.output_tokens, 0);

  const alerts: string[] = [];
  if (yesterdayUsage.calls > 0 && todayUsage.cost_est_usd > yesterdayUsage.cost_est_usd * 1.5 && todayUsage.cost_est_usd > 0.01) {
    alerts.push(
      `今日估算成本 $${round2(todayUsage.cost_est_usd)} 已超昨日（$${round2(yesterdayUsage.cost_est_usd)}）的 1.5 倍，注意成本突增。`,
    );
  }
  if (failedRuns.length > 0 && failedRuns[0].n >= 3) {
    alerts.push(`近 ${days} 天同一目标失败 ${failedRuns[0].n} 次：「${failedRuns[0].goal || '(无目标)'}」，建议排查。`);
  }

  res.json({
    days,
    generated_at: Date.now(),
    today: {
      calls: todayUsage.calls,
      total_tokens: todayUsage.input_tokens + todayUsage.output_tokens,
      cost_est_usd: round2(todayUsage.cost_est_usd),
    },
    yesterday: {
      calls: yesterdayUsage.calls,
      total_tokens: yesterdayUsage.input_tokens + yesterdayUsage.output_tokens,
      cost_est_usd: round2(yesterdayUsage.cost_est_usd),
    },
    failed_top: failedRuns,
    lessons_learned: lessonsRow,
    trend_7d: {
      total_tokens: trend7Tokens,
      daily: trend7.map((d) => ({
        day: d.day,
        calls: d.calls,
        tokens: d.input_tokens + d.output_tokens,
        cost_est_usd: round2(d.cost_est_usd),
      })),
    },
    alerts,
  });
});

// ── helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
/** 环比百分比：上期 0 期返回 null（无意义），否则 (cur-prev)/prev*100，保留 1 位。 */
function pct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return round1(((cur - prev) / prev) * 100);
}

export default router;
