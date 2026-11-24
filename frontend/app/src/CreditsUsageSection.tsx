/**
 * CreditsUsageSection.tsx — 设置 → 计费 → 用量（模型积分消耗，2026-11-08）。
 *
 * 模仿使用统计页：剩余额度卡 / 活跃度 / 小米 MiMo 用量 / Token 活动热力图
 * （每日·每周·累计）/ 用量趋势（近 7·30 日按模型堆叠）/ 模型明细表。
 * 后端契约：backend/node routes/system/usage.ts
 *   GET /api/usage/credits?days=365 → 全景聚合（totals/month/activity/mimo/daily/models）
 *   GET /api/usage/config           → { quota, rate_per_k }
 *   PUT /api/usage/config           → body { quota?, ratePerK? }（写月度额度）
 * 积分口径：1 积分 = 1,000 tokens（输入+输出）× rate_per_k。
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { apiFetch } from "./chat-api";

interface UsageModelRow {
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  credits: number;
  is_mimo: boolean;
}

interface UsageDailyRow {
  day: number;
  calls: number;
  total_tokens: number;
  credits: number;
  models: Record<string, { calls: number; total_tokens: number }>;
}

interface UsageCredits {
  generated_at: number;
  days: number;
  config: { quota: number; rate_per_k: number };
  totals: { calls: number; input_tokens: number; output_tokens: number; total_tokens: number; credits: number };
  month: {
    month: string;
    quota: number;
    total_tokens: number;
    used_credits: number;
    remaining_credits: number | null;
    used_pct: number | null;
    reset_at: number;
  };
  activity: {
    total_tokens: number;
    peak_tokens: number;
    peak_day: number | null;
    active_days: number;
    current_streak: number;
    longest_streak: number;
    first_day: number | null;
  };
  mimo: { calls: number; total_tokens: number; credits: number; share_pct: number; models: UsageModelRow[] };
  daily: UsageDailyRow[];
  models: UsageModelRow[];
}

type HeatMode = "daily" | "weekly" | "cumulative";

const DAY_MS = 24 * 60 * 60 * 1000;
const MODEL_COLORS = ["#ff5e3a", "#2777e8", "#0ea5a4", "#c64f7d", "#7c5cff", "#d97b38", "#16a34a", "#9333ea"];

/** 大数字中文格式化：≥1 亿 → 亿，≥1 万 → 万。 */
function fmtBig(n: number): string {
  if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, "") + " 亿";
  if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, "") + " 万";
  return n.toLocaleString();
}

function fmtDay(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fmtReset(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:00 重置`;
}

interface HeatCell {
  day: number;
  value: number;
  level: number;
}

/** 强度分级：0 = 无记录，1..4 按量分位（阈值取 max 的 25/50/75%）。 */
function heatLevel(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const r = value / max;
  if (r > 0.75) return 4;
  if (r > 0.5) return 3;
  if (r > 0.25) return 2;
  return 1;
}

/** 最近 weeks 周的热力网格（周一为每周起点），返回每周 7 天的列。 */
function buildWeeks(daily: UsageDailyRow[], weeks: number): HeatCell[][] {
  const today0 = daily.length ? daily[daily.length - 1].day : Date.now();
  const todayDow = (new Date(today0).getDay() + 6) % 7; // 周一=0
  const end = today0 + (6 - todayDow) * DAY_MS; // 本周日
  const start = end - (weeks * 7 - 1) * DAY_MS;
  const valueByDay = new Map<number, number>();
  for (const d of daily) {
    valueByDay.set(d.day, d.total_tokens);
  }
  const cells: HeatCell[][] = [];
  let max = 0;
  const flat: HeatCell[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const v = valueByDay.get(t) ?? 0;
    flat.push({ day: t, value: v, level: 0 });
    if (v > max) max = v;
  }
  for (const c of flat) c.level = heatLevel(c.value, max);
  for (let i = 0; i < flat.length; i += 7) cells.push(flat.slice(i, i + 7));
  return cells;
}

export default function CreditsUsageSection() {
  const [data, setData] = useState<UsageCredits | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [heat, setHeat] = useState<HeatMode>("daily");
  const [range, setRange] = useState<7 | 30>(30);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [quotaInput, setQuotaInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await apiFetch<UsageCredits>("/api/usage/credits?days=365");
      setData(json);
      setQuotaInput(String(json.config.quota));
      setRefreshedAt(Date.now());
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveQuota() {
    const q = Number(quotaInput);
    if (!Number.isFinite(q) || q < 0) {
      setNotice("额度需为不小于 0 的数字（0 = 不限额）");
      return;
    }
    try {
      await apiFetch("/api/usage/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quota: q }),
      });
      setNotice("套餐额度已更新");
      await load();
    } catch {
      setNotice("额度保存失败（公网通道禁止写配置，请本机操作）");
    }
  }

  function toggleModel(model: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  }

  if (state === "loading") return <p className="sf-live-tag">正在加载用量统计…</p>;
  if (state === "error" || !data) {
    return (
      <div className="sf-settings-placeholder">
        <AlertTriangle size={25} />
        <button type="button" onClick={() => void load()}>重试</button>
      </div>
    );
  }

  const { month, activity, mimo, totals } = data;
  const daily = data.daily;
  const today = daily[daily.length - 1];
  const remainPct = month.used_pct != null ? Math.max(0, Math.round((100 - month.used_pct) * 10) / 10) : null;

  // 热力图：cumulative 模式先把每日值换成累计值再进网格
  const heatDaily = heat === "cumulative"
    ? (() => {
        let run = 0;
        return daily.map((d) => {
          run += d.total_tokens;
          return { ...d, total_tokens: run };
        });
      })()
    : daily;
  const weeks = buildWeeks(heatDaily, 26);
  const weekTotals = weeks.map((w) => w.reduce((s, c) => s + c.value, 0));
  const weekMax = Math.max(1, ...weekTotals);

  // 趋势：近 range 天按模型堆叠
  const trendRows = daily.slice(-range);
  const modelOrder = [...new Set(trendRows.flatMap((d) => Object.keys(d.models)))]
    .map((m) => ({
      model: m,
      total: trendRows.reduce((s, d) => s + (d.models[m]?.total_tokens ?? 0), 0),
    }))
    .sort((a, b) => b.total - a.total)
    .map((x) => x.model);
  const visible = modelOrder.filter((m) => !hidden.has(m));
  const trendMax = Math.max(
    1,
    ...trendRows.map((d) => visible.reduce((s, m) => s + (d.models[m]?.total_tokens ?? 0), 0)),
  );

  return (
    <div className="sf-usage">
      <div className="sf-usage-head">
        <span>套餐积分 · 每 1,000 tokens（输入+输出）计 1 积分</span>
        <div className="sf-usage-head-right">
          {refreshedAt != null && (
            <em>最近刷新时间：{new Date(refreshedAt).toLocaleString("zh-CN", { hour12: false })}</em>
          )}
          <button type="button" className="sf-usage-refresh" onClick={() => void load()}>
            <RotateCcw size={12} />刷新
          </button>
        </div>
      </div>

      <div className="sf-usage-cards">
        <article className="sf-usage-card">
          <p>本月剩余</p>
          <strong>{remainPct != null ? `${remainPct}%` : "不限"}</strong>
          <div className="sf-usage-bar"><i style={{ width: `${remainPct ?? 100}%` }} /></div>
          <small>
            {month.remaining_credits != null
              ? `${month.remaining_credits} / ${month.quota} 积分 · ${fmtReset(month.reset_at)}`
              : "套餐额度不限"}
          </small>
        </article>
        <article className="sf-usage-card">
          <p>本月已消耗</p>
          <strong>{fmtBig(month.used_credits)}</strong>
          <div className="sf-usage-bar"><i style={{ width: `${month.used_pct ?? 0}%` }} /></div>
          <small>≈ {fmtBig(month.total_tokens)} tokens · {month.month}</small>
        </article>
        <article className="sf-usage-card">
          <p>今日消耗</p>
          <strong>{fmtBig(today?.credits ?? 0)}</strong>
          <div className="sf-usage-bar"><i style={{ width: `${Math.min(100, ((today?.credits ?? 0) / Math.max(1, month.quota || 10000)) * 100)}%` }} /></div>
          <small>≈ {fmtBig(today?.total_tokens ?? 0)} tokens · {today?.calls ?? 0} 次调用</small>
        </article>
        <article className="sf-usage-card">
          <p>小米 MiMo 占比</p>
          <strong>{mimo.share_pct}%</strong>
          <div className="sf-usage-bar sf-usage-bar-mimo"><i style={{ width: `${mimo.share_pct}%` }} /></div>
          <small>{mimo.models.length} 个 MiMo 模型 · {fmtBig(mimo.total_tokens)} tokens</small>
        </article>
      </div>

      <div className="sf-usage-quota-edit">
        <span>套餐额度</span>
        <input
          value={quotaInput}
          onChange={(e) => setQuotaInput(e.target.value)}
          inputMode="numeric"
          aria-label="套餐额度（积分/月）"
        />
        <span>积分 / 月（0 = 不限额）</span>
        <button type="button" onClick={() => void saveQuota()}>保存</button>
        {notice && <em>{notice}</em>}
      </div>

      <div className="sf-usage-activity">
        <div><strong>{fmtBig(activity.total_tokens)}</strong><span>累计 Token 数</span></div>
        <div><strong>{fmtBig(activity.peak_tokens)}</strong><span>峰值 Token 数{activity.peak_day ? ` · ${fmtDay(activity.peak_day)}` : ""}</span></div>
        <div><strong>{fmtBig(totals.calls)}</strong><span>窗口内调用次数</span></div>
        <div><strong>{activity.active_days} 天</strong><span>活跃天数</span></div>
        <div><strong>{activity.current_streak} 天</strong><span>当前连续天数</span></div>
        <div><strong>{activity.longest_streak} 天</strong><span>最长连续天数</span></div>
      </div>

      <section className="sf-usage-panel">
        <div className="sf-usage-panel-head">
          <h3>小米 MiMo 用量</h3>
          <em>内置 API · api.xiaomimimo.com</em>
        </div>
        {mimo.total_tokens > 0 ? (
          <div className="sf-usage-mimo">
            <div className="sf-usage-mimo-stats">
              <div><strong>{fmtBig(mimo.total_tokens)}</strong><span>累计 Token</span></div>
              <div><strong>{fmtBig(mimo.credits)}</strong><span>积分消耗</span></div>
              <div><strong>{fmtBig(mimo.calls)}</strong><span>调用次数</span></div>
              <div><strong>{mimo.share_pct}%</strong><span>占全量比</span></div>
            </div>
            <div className="sf-usage-chips">
              {mimo.models.map((m) => (
                <span key={m.model} className="sf-usage-chip sf-usage-chip-mimo">
                  {m.model} · {fmtBig(m.total_tokens)} tokens · {fmtBig(m.credits)} 积分
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="sf-usage-empty">暂无 MiMo 用量记录（token_usage 里还没有 model 含 mimo 的流水）。</p>
        )}
      </section>

      <section className="sf-usage-panel">
        <div className="sf-usage-panel-head">
          <h3>Token 活动</h3>
          <div className="sf-usage-seg">
            {(["daily", "weekly", "cumulative"] as HeatMode[]).map((m) => (
              <button key={m} type="button" className={heat === m ? "active" : ""} onClick={() => setHeat(m)}>
                {m === "daily" ? "每日" : m === "weekly" ? "每周" : "累计"}
              </button>
            ))}
          </div>
        </div>
        {heat === "weekly" ? (
          <div className="sf-usage-heat sf-usage-heat-week">
            {weekTotals.map((v, i) => (
              <i key={i} className={`lv${heatLevel(v, weekMax)}`} title={`${fmtBig(v)} tokens`} />
            ))}
          </div>
        ) : (
          <div className="sf-usage-heat">
            {weeks.map((week, i) => (
              <div key={i} className="sf-usage-heat-col">
                {week.map((c) => (
                  <i key={c.day} className={`lv${c.level}`} title={`${fmtDay(c.day)} · ${fmtBig(c.value)} tokens`} />
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="sf-usage-heat-months">
          {weeks.map((week, i) => {
            const d = new Date(week[0].day);
            const prev = i > 0 ? new Date(weeks[i - 1][0].day) : null;
            const show = i === 0 || !prev || d.getMonth() !== prev.getMonth();
            return <span key={i}>{show ? `${d.getMonth() + 1}月` : ""}</span>;
          })}
        </div>
        <div className="sf-usage-heat-legend">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((lv) => <i key={lv} className={`lv${lv}`} />)}
          <span>多</span>
        </div>
      </section>

      <section className="sf-usage-panel">
        <div className="sf-usage-panel-head">
          <h3>用量趋势</h3>
          <div className="sf-usage-seg">
            {([7, 30] as const).map((r) => (
              <button key={r} type="button" className={range === r ? "active" : ""} onClick={() => setRange(r)}>
                近 {r} 日
              </button>
            ))}
          </div>
        </div>
        <div className="sf-usage-legend">
          <span className="sf-usage-legend-total">
            消耗总量：{fmtBig(trendRows.reduce((s, d) => s + visible.reduce((x, m) => x + (d.models[m]?.total_tokens ?? 0), 0), 0))} tokens
          </span>
          {modelOrder.map((m, i) => (
            <button
              key={m}
              type="button"
              className={`sf-usage-legend-chip ${hidden.has(m) ? "off" : ""}`}
              onClick={() => toggleModel(m)}
            >
              <i style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
              {m}：{fmtBig(trendRows.reduce((s, d) => s + (d.models[m]?.total_tokens ?? 0), 0))} tokens
            </button>
          ))}
        </div>
        <div className="sf-usage-trend">
          {trendRows.map((d) => {
            const stacks = visible.map((m) => ({ model: m, v: d.models[m]?.total_tokens ?? 0 }));
            const total = stacks.reduce((s, x) => s + x.v, 0);
            return (
              <div
                key={d.day}
                className="sf-usage-trend-col"
                title={`${fmtDay(d.day)} · ${fmtBig(total)} tokens · ${d.calls} 次调用`}
              >
                {stacks.map((x) => (
                  <i
                    key={x.model}
                    style={{
                      height: `${(x.v / trendMax) * 100}%`,
                      background: MODEL_COLORS[modelOrder.indexOf(x.model) % MODEL_COLORS.length],
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
        <div className="sf-usage-trend-axis">
          <span>{trendRows[0] ? fmtDay(trendRows[0].day) : ""}</span>
          <span>{trendRows[trendRows.length - 1] ? fmtDay(trendRows[trendRows.length - 1].day) : ""}</span>
        </div>
      </section>

      <section className="sf-usage-panel">
        <div className="sf-usage-panel-head">
          <h3>模型明细</h3>
          <em>近 {data.days} 日 · 按 tokens 降序</em>
        </div>
        {data.models.length === 0 ? (
          <p className="sf-usage-empty">窗口内暂无用量记录。</p>
        ) : (
          <table className="sf-usage-table">
            <thead>
              <tr>
                <th>模型</th>
                <th>调用次数</th>
                <th>输入 tokens</th>
                <th>输出 tokens</th>
                <th>总 tokens</th>
                <th>积分消耗</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((m) => (
                <tr key={m.model}>
                  <td>
                    {m.model}
                    {m.is_mimo && <b className="sf-usage-badge">MiMo</b>}
                  </td>
                  <td>{fmtBig(m.calls)}</td>
                  <td>{fmtBig(m.input_tokens)}</td>
                  <td>{fmtBig(m.output_tokens)}</td>
                  <td>{fmtBig(m.total_tokens)}</td>
                  <td>{fmtBig(m.credits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
