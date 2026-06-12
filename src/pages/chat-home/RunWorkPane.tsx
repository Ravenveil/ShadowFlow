/**
 * RunWorkPane — 右栏「工作区」tab（三栏融合：run-session 右半部分进聊天）。
 *
 * 设计稿（cowork 原型）框架：右栏 = OVERVIEW（当前 run 卡 + 状态/进度）+
 * 历史 RUNS + 空态（发起新任务）。本组件是其真数据落地：
 *   - 数据源 GET /api/run-sessions?conversation_id=<groupId>（M3 新增）
 *   - 最近一条 run 渲染成主卡（goal/状态徽章/时间/「打开 Run」深链）
 *   - 其余按时间列出
 *   - 无关联 run → 空态 + 「发起新任务」（/chat?new=1）
 * M2 网关过程事件落库后，主卡可升级为实时步骤进度（FollowChip 同源）。
 *
 * 个人态（PersonalRightPane）与团队态（ThreadDrawerFB）共用。
 *
 * 2026-06-12 F6 批2 — 内联样式换装 sf-wp-* 类（src/index.css）：补
 * hover/active/focus 态 + 首载 shimmer 骨架屏；字号/圆角/时长走批1 token。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, ArrowUpRight, RefreshCw } from 'lucide-react';
import { listRunSessions, type RunSessionSummary } from '../../api/runSessions';

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

export function RunWorkPane({ groupId }: { groupId?: string | null }) {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSessionSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = (gid: string) => {
    setLoading(true);
    listRunSessions(gid)
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!groupId) { setRuns([]); return; }
    load(groupId);
    // 聊天内发起新 run（NewTaskComposer）后自动刷新本面板
    const onCreated = () => load(groupId);
    // F5 实时跟随：useGroupTimeline 发现本群 running run（网关 run 点亮）时
    // dispatch 'sf:gateway-run-active'（detail={groupId,sessionId}）——
    // groupId 匹配即刷新列表，主卡 StatusBadge 立即显示「运行中」。
    const onGatewayRunActive = (e: Event) => {
      const detail = (e as CustomEvent).detail as { groupId?: string } | undefined;
      if (detail?.groupId === groupId) load(groupId);
    };
    window.addEventListener('sf:run-created', onCreated);
    window.addEventListener('sf:gateway-run-active', onGatewayRunActive);
    return () => {
      window.removeEventListener('sf:run-created', onCreated);
      window.removeEventListener('sf:gateway-run-active', onGatewayRunActive);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const latest = runs?.[0] ?? null;
  const history = runs?.slice(1) ?? [];
  // runs === null = 从未加载完成（首载/切群瞬间）→ shimmer 骨架而非空态文字
  const initialLoading = runs === null;

  return (
    <div className="sf-wp">
      {/* OVERVIEW — 最近 run 主卡 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <SectionLabel>
            Overview{latest ? ` · Run #${latest.session_id.slice(0, 4)}` : ''}
          </SectionLabel>
          <div style={{ flex: 1 }} />
          {groupId && (
            <button
              type="button" aria-label="刷新" title="刷新"
              className="sf-wp-refresh"
              onClick={() => load(groupId)}
            >
              <RefreshCw size={12} strokeWidth={2} aria-hidden className={loading ? 'sf-spin' : undefined} />
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
          <button
            type="button"
            data-testid="workpane-latest-run"
            className="sf-wp-card"
            onClick={() => navigate(`/run-session/${latest.session_id}`)}
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
              打开 Run <ArrowUpRight size={12} aria-hidden />
            </span>
          </button>
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
                onClick={() => navigate(`/run-session/${r.session_id}`)}
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
