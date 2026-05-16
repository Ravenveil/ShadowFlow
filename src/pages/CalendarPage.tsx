import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Plus, Trash2, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { listSchedules, deleteSchedule, type Schedule } from '../api/schedules';
import { useInboxStore } from '../core/store/useInboxStore';
import { ScheduleDrawer, describeSchedule } from '../components/briefboard/ScheduleDrawer';
import { useWorkspaceStore } from '../store/workspaceStore';

const T = {
  bg:  'var(--t-bg)',
  p:   'var(--t-panel)',
  p2:  'var(--t-panel-2)',
  p3:  'var(--t-panel-3)',
  fg:  'var(--t-fg)',
  fg2: 'var(--t-fg-2)',
  fg3: 'var(--t-fg-3)',
  fg4: 'var(--t-fg-4)',
  fg5: 'var(--t-fg-5)',
  bd:  'var(--t-border)',
  bd2: 'var(--t-border-2)',
  ac:  'var(--t-accent)',
  acB: 'var(--t-accent-bright)',
  acT: 'var(--t-accent-tint)',
  ok:  'var(--t-ok)',
  err: 'var(--t-err)',
  warn:'var(--t-warn)',
  run: 'var(--t-run)',
  mono:'var(--font-mono)',
  pop: 'var(--shadow-pop)',
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function fmtFull(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

interface GroupSchedule {
  groupId: string;
  groupName: string;
  schedules: Schedule[];
}

export default function CalendarPage() {
  const groups = useInboxStore(s => s.groups);
  const currentId = useWorkspaceStore((s) => s.currentId);
  const [data, setData] = useState<GroupSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerGroupId, setDrawerGroupId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listSchedules();
      const all: Schedule[] = res.data ?? [];

      // Group by group_id, attach group names from store
      const byGroup = new Map<string, Schedule[]>();
      for (const s of all) {
        const arr = byGroup.get(s.group_id) ?? [];
        arr.push(s);
        byGroup.set(s.group_id, arr);
      }

      const result: GroupSchedule[] = [];
      // Known groups first
      for (const g of groups) {
        const schedules = byGroup.get(g.id);
        if (schedules && schedules.length > 0) {
          result.push({ groupId: g.id, groupName: g.name, schedules });
          byGroup.delete(g.id);
        }
      }
      // Orphaned group_ids (no match in store)
      for (const [gid, schedules] of byGroup) {
        result.push({ groupId: gid, groupName: gid, schedules });
      }

      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [groups, currentId]);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(scheduleId: string) {
    setDeleting(scheduleId);
    try {
      await deleteSchedule(scheduleId);
      await load();
    } finally {
      setDeleting(null);
    }
  }

  const totalSchedules = data.reduce((n, g) => n + g.schedules.length, 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: T.bg, color: T.fg }}>
      {/* Sub-header — workspace crumb is provided by HfLayout above */}
      <div style={{ padding: '10px 28px 10px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', gap: 10, background: T.p, flexShrink: 0 }}>
        <CalendarDays size={15} strokeWidth={1.6} style={{ color: T.acB }}/>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.fg }}>日历</span>
        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.fg5 }}>· {totalSchedules} 个计划</span>
        <div style={{ flex: 1 }}/>
        <button
          type="button"
          onClick={() => void load()}
          title="刷新"
          style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.bd}`, background: 'transparent', color: T.fg4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RefreshCw size={13} strokeWidth={1.7}/>
        </button>
        {groups.length > 0 && (
          <div style={{ position: 'relative' }}>
            <select
              onChange={e => { if (e.target.value) { setDrawerGroupId(e.target.value); e.target.value = ''; } }}
              defaultValue=""
              style={{ appearance: 'none', padding: '5px 28px 5px 10px', borderRadius: 7, border: `1px solid ${T.bd}`, background: T.p2, color: T.fg, fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>
              <option value="">+ 新建计划</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <Plus size={12} strokeWidth={2} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: T.fg4 }}/>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10, color: T.fg4 }}>
            <RefreshCw size={16} strokeWidth={1.7} style={{ animation: 'spin 1s linear infinite' }}/>
            <span style={{ fontFamily: T.mono, fontSize: 12 }}>加载中…</span>
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: '12px 16px', borderRadius: 8, background: `color-mix(in oklab, ${T.err} 10%, ${T.p})`, border: `1px solid color-mix(in oklab, ${T.err} 30%, transparent)`, color: T.err, fontSize: 12, fontFamily: T.mono }}>
            {error}
          </div>
        )}

        {!loading && !error && totalSchedules === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 14 }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: T.p, border: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.fg5 }}>
              <CalendarDays size={26} strokeWidth={1.4}/>
            </span>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: T.fg3 }}>暂无定时计划</p>
              <p style={{ margin: 0, fontSize: 12, color: T.fg5, lineHeight: 1.6 }}>
                在 Team 聊天页右上角「+ Schedule」添加定时触发<br/>
                或从上方「新建计划」选择团队快速创建
              </p>
            </div>
          </div>
        )}

        {!loading && data.map(gs => (
          <div key={gs.groupId} style={{ marginBottom: 28 }}>
            {/* Group header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: T.fg5, letterSpacing: '0.06em' }}>TEAM</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.fg }}>{gs.groupName}</span>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.fg5 }}>{gs.schedules.length} 个计划</span>
              <button
                type="button"
                onClick={() => setDrawerGroupId(gs.groupId)}
                style={{ marginLeft: 4, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 5, border: `1px solid ${T.bd}`, background: 'transparent', color: T.fg4, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Plus size={11} strokeWidth={2}/>
                添加
              </button>
            </div>

            {/* Schedule cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
              {gs.schedules.map(sc => {
                const lastRun = sc.runs?.[sc.runs.length - 1];
                const successCount = sc.runs?.filter(r => r.status === 'succeeded').length ?? 0;
                const failCount = sc.runs?.filter(r => r.status === 'failed').length ?? 0;

                return (
                  <div key={sc.schedule_id} style={{ background: T.p, border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden' }}>
                    {/* Card header */}
                    <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${T.bd}` }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.fg, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {sc.task_description || '定时任务'}
                          </div>
                          <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.acB, fontWeight: 600 }}>
                            {describeSchedule(sc)}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={deleting === sc.schedule_id}
                          onClick={() => void handleDelete(sc.schedule_id)}
                          title="删除"
                          style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', color: T.fg5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: deleting === sc.schedule_id ? 0.4 : 1, flexShrink: 0 }}>
                          <Trash2 size={13} strokeWidth={1.7}/>
                        </button>
                      </div>
                    </div>

                    {/* Meta row */}
                    <div style={{ padding: '8px 14px', display: 'flex', gap: 14, alignItems: 'center', background: T.p2, borderBottom: `1px solid ${T.bd}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Clock size={11} strokeWidth={1.7} style={{ color: T.fg5 }}/>
                        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.fg4 }}>下次 {fmt(sc.next_run_time)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.fg5 }}>cron</span>
                        <code style={{ fontFamily: T.mono, fontSize: 10, color: T.fg3, background: T.p3, padding: '1px 5px', borderRadius: 3 }}>{sc.cron_expression}</code>
                      </div>
                    </div>

                    {/* Run history */}
                    <div style={{ padding: '8px 14px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg5, letterSpacing: '0.04em' }}>执行记录</span>
                        <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg5 }}>
                          <span style={{ color: T.ok }}>✓ {successCount}</span>
                          {failCount > 0 && <span style={{ color: T.err, marginLeft: 6 }}>✗ {failCount}</span>}
                        </span>
                      </div>

                      {(!sc.runs || sc.runs.length === 0) && (
                        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.fg5, padding: '4px 0' }}>暂无执行记录</div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {(sc.runs ?? []).slice(-5).reverse().map((r, i) => (
                          <div key={r.run_id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 5, background: T.p2 }}>
                            {r.status === 'succeeded'
                              ? <CheckCircle size={12} strokeWidth={1.8} style={{ color: T.ok, flexShrink: 0 }}/>
                              : <XCircle size={12} strokeWidth={1.8} style={{ color: T.err, flexShrink: 0 }}/>}
                            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.fg3, flex: 1 }}>{fmtFull(r.triggered_at)}</span>
                            <span style={{ fontFamily: T.mono, fontSize: 9.5, color: r.status === 'succeeded' ? T.ok : T.err, fontWeight: 700 }}>
                              {r.status === 'succeeded' ? 'OK' : 'ERR'}
                            </span>
                          </div>
                        ))}
                      </div>

                      {lastRun && (
                        <div style={{ marginTop: 6, fontFamily: T.mono, fontSize: 9.5, color: T.fg5 }}>
                          最近 {fmtFull(lastRun.triggered_at)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ScheduleDrawer modal */}
      {drawerGroupId && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 499, background: 'rgba(0,0,0,0.45)' }}
            onClick={() => { setDrawerGroupId(null); void load(); }}
          />
          <ScheduleDrawer
            groupId={drawerGroupId}
            onClose={() => { setDrawerGroupId(null); void load(); }}
          />
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
