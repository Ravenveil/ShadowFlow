/**
 * StartLanding — 进站首屏 start 视觉（2026-06-15）。
 *
 * 港自历史富设计稿 _handoff_tmp/.../v2-start-hifi.jsx（用户要的"之前的 html 版本"）：
 *   点阵背景 + 渐变 hero(badge + 渐变标题 + 副标题) + 模板画廊 + 最近 run 列表。
 * **零 mock**：模板来自 StartGallery(真实 skills)，最近 run 来自 listRunSessions(真实)；
 * 原设计的「团队预览卡」是假 agent，按"不要 mock"原则不港。
 *
 * 作为 NewTaskComposer 空态(start 形态)的内容区——composer 由 NewTaskComposer 常驻底部。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { listRunSessions, type RunSessionSummary } from '../../api/runSessions';
import { useAuth } from '../../core/auth/AuthContext';
import { StartGallery } from './StartGallery';

/** UI4.0(2026-08-13)— clawsgo 式时段问候(对齐 tmpD65C「早上好, Jane」)。 */
function greetingByHour(h: number): string {
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

const STATUS_TOKEN: Record<string, { v: string; label: string; pulse?: boolean }> = {
  running:   { v: 'var(--status-run)', label: '运行中', pulse: true },
  succeeded: { v: 'var(--status-ok)', label: '已完成' },
  failed:    { v: 'var(--status-reject)', label: '出错' },
  canceled:  { v: 'var(--status-pending)', label: '已取消' },
  idle:      { v: 'var(--status-pending)', label: '历史' },
};

function fmtTime(ts: number): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function RecentRuns() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSessionSummary[] | null>(null);
  useEffect(() => {
    let alive = true;
    listRunSessions()
      .then((rows) => { if (alive) setRuns(rows.slice(0, 5)); })
      .catch(() => { if (alive) setRuns([]); });
    return () => { alive = false; };
  }, []);

  if (runs === null) {
    return (
      <div className="sl-recent">
        <div className="sl-recent-head"><span className="sl-recent-lbl">CONTINUE · RECENT RUNS</span></div>
        <div className="sl-recent-list">
          {[0, 1, 2].map((i) => <div key={i} className="sf-skeleton" style={{ height: 50, borderRadius: 'var(--r-card)' }} />)}
        </div>
      </div>
    );
  }
  if (runs.length === 0) return null;

  return (
    <div className="sl-recent">
      <div className="sl-recent-head">
        <span className="sl-recent-lbl">CONTINUE · RECENT RUNS</span>
      </div>
      <div className="sl-recent-list">
        {runs.map((r) => {
          const st = STATUS_TOKEN[r.status] ?? STATUS_TOKEN.idle;
          return (
            <button
              key={r.session_id}
              type="button"
              className="sl-run"
              data-testid={`sl-run-${r.session_id}`}
              onClick={() => navigate(`/run-session/${r.session_id}`)}
            >
              <span className="sl-run-dot" style={{ background: st.v, animation: st.pulse ? 'sf-pulse 1.4s ease-in-out infinite' : 'none' }} />
              <span className="sl-run-goal">{r.goal || `run #${r.session_id.slice(0, 6)}`}</span>
              <span className="sl-run-state" style={{ color: st.v, background: `color-mix(in oklab, ${st.v} 14%, transparent)`, borderColor: `color-mix(in oklab, ${st.v} 35%, transparent)` }}>
                {st.label}
              </span>
              <span className="sl-run-time">{fmtTime(r.updated_at)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StartLanding({
  onPickTemplate,
  composer,
}: {
  onPickTemplate: (token: string) => void;
  /** clawsgo 式：传入则在 hero 正下方居中渲染 composer（个人态）。 */
  composer?: ReactNode;
}) {
  const { user } = useAuth();
  const greeting = `${greetingByHour(new Date().getHours())}${user?.display_name ? `, ${user.display_name}` : ''}`;
  return (
    <div className="sl-wrap">
      {/* 点阵背景（radial-gradient + 顶部椭圆遮罩，对齐 v2-start-hifi） */}
      <div className="sl-dotgrid" aria-hidden />
      <div className="sl-inner">
        {/* UI4.0:clawsgo 式问候 hero(时段问候 + 用户名,纯色大标题) */}
        <div className="sl-hero">
          <h1 className="sl-title">{greeting}</h1>
          <p className="sl-sub">
            一句话目标 · 一份 skill · 一个模板都行 — ShadowFlow 把它孵成一支
            <span style={{ color: 'var(--t-fg-2)', fontWeight: 600 }}> 带规则、可追溯 </span>的 team。
          </p>
        </div>

        {composer && <div className="sl-composer">{composer}</div>}
        <StartGallery onPick={onPickTemplate} />
        <RecentRuns />
      </div>
    </div>
  );
}
