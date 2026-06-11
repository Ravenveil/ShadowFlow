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
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 8px', borderRadius: 999,
        fontSize: 10, fontWeight: 700, letterSpacing: '.02em',
        color: meta.fg, background: meta.bg, flexShrink: 0,
      }}
    >
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
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        fontSize: 9.5, fontWeight: 700, letterSpacing: '.14em',
        textTransform: 'uppercase', color: 'var(--t-fg-4)',
        padding: '2px 2px 8px',
      }}
    >
      {children}
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
    window.addEventListener('sf:run-created', onCreated);
    return () => window.removeEventListener('sf:run-created', onCreated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const latest = runs?.[0] ?? null;
  const history = runs?.slice(1) ?? [];

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              onClick={() => load(groupId)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--t-fg-5)', padding: 4, borderRadius: 6, display: 'inline-flex' }}
            >
              <RefreshCw size={12} strokeWidth={2} aria-hidden style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            </button>
          )}
        </div>

        {!latest ? (
          /* 空态 — 设计稿式引导：这个会话还没有 run，从这里发起 */
          <div
            style={{
              border: '1px dashed var(--t-border)', borderRadius: 12,
              padding: '22px 16px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 10, textAlign: 'center',
            }}
          >
            <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--t-accent-tint)', color: 'var(--t-accent)', display: 'grid', placeItems: 'center' }}>
              <Rocket size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <div style={{ fontSize: 12, color: 'var(--t-fg-3)', lineHeight: 1.6 }}>
              {loading ? '加载中…' : '这个会话还没有运行记录。发起一个任务，运行过程会在这里同步。'}
            </div>
            <button
              type="button"
              onClick={() => navigate('/chat?new=1')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: 'var(--t-accent)', color: 'var(--t-accent-ink)',
                fontWeight: 700, fontSize: 12,
              }}
            >
              <Rocket size={13} aria-hidden /> 发起新任务
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-testid="workpane-latest-run"
            onClick={() => navigate(`/run-session/${latest.session_id}`)}
            style={{
              width: '100%', textAlign: 'left', cursor: 'pointer',
              border: '1px solid var(--t-border)', borderRadius: 12,
              background: 'var(--t-panel-2)', padding: 12,
              display: 'flex', flexDirection: 'column', gap: 8,
              fontFamily: 'inherit',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusBadge status={latest.status} />
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtTime(latest.updated_at)}</span>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t-fg)', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {latest.goal || '（无目标描述）'}
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: 'var(--t-accent)' }}>
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
                onClick={() => navigate(`/run-session/${r.session_id}`)}
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer',
                  border: '1px solid var(--t-border)', borderRadius: 9,
                  background: 'transparent', padding: '8px 10px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--t-fg-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.goal || r.session_id.slice(0, 8)}
                </span>
                <StatusBadge status={r.status} />
                <span style={{ fontSize: 9.5, color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>{fmtTime(r.updated_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
