/**
 * RunOverviewView — 纯展示组件，run 卡 + 历史列表 + 空态/骨架。
 *
 * 从 RunWorkPane.tsx 拆出；可被「Agent 工作台」「概览」子视图复用。
 * 数据通过 props 注入，不自己 fetch。
 *
 * Props:
 *   latest   — 最近一条 run（null = 无 run）
 *   history  — 其余历史条目
 *   loading  — 首载骨架（true 且 latest === null 时）
 *   onOpenRun — 可选：点击 run 卡/历史行时的回调。不传则 navigate 到整页。
 */
import { useNavigate } from 'react-router-dom';
import { Rocket, ArrowUpRight, RefreshCw, ExternalLink } from 'lucide-react';
import type { RunSessionSummary } from '../../api/runSessions';

// ────────────────────────────────────────
// 状态元数据（与 RunWorkPane 搬运保持一致）
// ────────────────────────────────────────
const STATUS_META: Record<string, { label: string; fg: string; bg: string; pulse?: boolean }> = {
  running:   { label: '运行中', fg: 'var(--t-accent)', bg: 'var(--t-accent-tint)', pulse: true },
  succeeded: { label: '已完成', fg: 'var(--t-ok, #16a34a)', bg: 'color-mix(in oklab, var(--t-ok, #16a34a) 12%, transparent)' },
  failed:    { label: '出错', fg: 'var(--t-err, #dc2626)', bg: 'color-mix(in oklab, var(--t-err, #dc2626) 12%, transparent)' },
  canceled:  { label: '已取消', fg: 'var(--t-fg-4)', bg: 'var(--t-panel-2)' },
  idle:      { label: '历史', fg: 'var(--t-fg-4)', bg: 'var(--t-panel-2)' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.idle;
  return (
    <span className="sf-wp-badge" style={{ color: meta.fg, background: meta.bg }}>
      {meta.pulse && (
        <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: meta.fg, animation: 'sf-pulse 1.4s ease-in-out infinite' }} />
      )}
      {meta.label}
    </span>
  );
}

function fmtTime(ts: number): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="sf-wp-label">{children}</div>;
}

/** 首载骨架（shimmer）——主卡 ×1 + 历史行 ×2，对齐真实卡片排版。 */
function WorkPaneSkeleton() {
  return (
    <div role="status" aria-label="加载运行记录" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="sf-wp-skel-card" aria-hidden>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="sf-skeleton" style={{ width: 56, height: 16, borderRadius: 'var(--r-full)' }} />
          <span style={{ flex: 1 }} />
          <span className="sf-skeleton" style={{ width: 36, height: 10 }} />
        </div>
        <div className="sf-skeleton" style={{ height: 13, width: '92%' }} />
        <div className="sf-skeleton" style={{ height: 13, width: '64%' }} />
      </div>
      <div className="sf-skeleton" aria-hidden style={{ height: 34, borderRadius: 'var(--r-row)' }} />
      <div className="sf-skeleton" aria-hidden style={{ height: 34, borderRadius: 'var(--r-row)' }} />
    </div>
  );
}

// ────────────────────────────────────────
// Props
// ────────────────────────────────────────
export interface RunOverviewViewProps {
  latest: RunSessionSummary | null;
  history: RunSessionSummary[];
  /** true 且 latest===null 时展示骨架屏 */
  loading: boolean;
  /**
   * 点击 run 卡或历史行时的回调（例如「就地展开」）。
   * 不传则降级为 navigate('/run-session/:id')，保持现有跳转行为。
   */
  onOpenRun?: (sessionId: string) => void;
  /** 提供时，在 Overview section-header 行右侧渲染刷新按钮。 */
  onReload?: () => void;
  /** true 时刷新按钮显示旋转动画。 */
  reloading?: boolean;
}

// ────────────────────────────────────────
// 主组件
// ────────────────────────────────────────
export function RunOverviewView({ latest, history, loading, onOpenRun, onReload, reloading }: RunOverviewViewProps) {
  const navigate = useNavigate();

  const openRun = (sid: string) => {
    if (onOpenRun) {
      onOpenRun(sid);
    } else {
      navigate(`/run-session/${sid}`);
    }
  };

  // runs === null 语义：从未加载完成（首载/切群瞬间）→ shimmer 骨架而非空态文字
  // 这里通过 loading && !latest 判断
  const initialLoading = loading && latest === null && history.length === 0;

  return (
    <div className="sf-wp">
      {/* OVERVIEW — 最近 run 主卡 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <SectionLabel>
            Overview{latest ? ` · Run #${latest.session_id.slice(0, 4)}` : ''}
          </SectionLabel>
          <div style={{ flex: 1 }} />
          {onReload && (
            <button
              type="button"
              aria-label="刷新"
              title="刷新"
              className="sf-wp-refresh"
              onClick={onReload}
            >
              <RefreshCw size={12} strokeWidth={2} aria-hidden className={reloading ? 'sf-spin' : undefined} />
            </button>
          )}
        </div>

        {initialLoading ? (
          <WorkPaneSkeleton />
        ) : !latest ? (
          /* 空态 — 设计稿式引导：这个会话还没有 run，从这里发起 */
          <div className="sf-wp-empty">
            <span style={{ width: 38, height: 38, borderRadius: 'var(--r-row)', background: 'var(--t-accent-tint)', color: 'var(--t-accent)', display: 'grid', placeItems: 'center' }}>
              <Rocket size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <div style={{ fontSize: 'var(--fs-sub)', color: 'var(--t-fg-3)', lineHeight: 1.6 }}>
              这个会话还没有运行记录。发起一个任务，运行过程会在这里同步。
            </div>
            <button
              type="button"
              className="sf-wp-cta"
              onClick={() => navigate('/chat?new=1')}
            >
              <Rocket size={13} aria-hidden /> 发起新任务
            </button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              data-testid="workpane-latest-run"
              className="sf-wp-card"
              onClick={() => openRun(latest.session_id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StatusBadge status={latest.status} />
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtTime(latest.updated_at)}</span>
              </div>
              <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--t-fg)', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {latest.goal || '（无目标描述）'}
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-sub)', fontWeight: 600, color: 'var(--t-accent)' }}>
                就地查看 <ArrowUpRight size={12} aria-hidden />
              </span>
            </button>
            {/* 整页打开小按钮：始终走 navigate，与 onOpenRun 回调无关 */}
            <button
              type="button"
              data-testid="workpane-open-fullpage"
              aria-label="整页打开 Run"
              title="整页打开 Run"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/run-session/${latest.session_id}`);
              }}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--t-fg-4)',
                padding: 4,
                borderRadius: 5,
                display: 'inline-flex',
                alignItems: 'center',
                opacity: 0.7,
              }}
            >
              <ExternalLink size={11} strokeWidth={2} aria-hidden />
            </button>
          </div>
        )}
      </div>

      {/* RUNS — 历史 */}
      {history.length > 0 && (
        <div>
          <SectionLabel>Runs · {history.length}</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map((r) => (
              <button
                key={r.session_id}
                type="button"
                className="sf-wp-row"
                onClick={() => openRun(r.session_id)}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-sub)', color: 'var(--t-fg-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.goal || r.session_id.slice(0, 8)}
                </span>
                <StatusBadge status={r.status} />
                <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>{fmtTime(r.updated_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
