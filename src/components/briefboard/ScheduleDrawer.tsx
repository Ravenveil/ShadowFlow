import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSchedule,
  deleteSchedule,
  getScheduleRuns,
  listSchedules,
  ScheduleApiError,
  type Schedule,
  type ScheduleRun,
} from '../../api/schedules';

interface ScheduleDrawerProps {
  groupId: string;
  onClose: () => void;
}

type FreqMode = 'daily' | 'weekly' | 'custom';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_CRON = ['1', '2', '3', '4', '5', '6', '0'];

function buildCron(mode: FreqMode, time: string, weekday: string, custom: string): string {
  const [h, m] = time.split(':');
  const min = parseInt(m ?? '0', 10);
  const hour = parseInt(h ?? '8', 10);
  if (mode === 'daily') return `${min} ${hour} * * *`;
  if (mode === 'weekly') return `${min} ${hour} * * ${weekday}`;
  return custom.trim();
}

function describeSchedule(schedule: Schedule): string {
  const expr = schedule.cron_expression;
  const parts = expr.trim().split(/\s+/);
  if (parts.length === 5) {
    const [min, hour, dom, month, dow] = parts;
    if (dom === '*' && month === '*') {
      const h = hour.padStart(2, '0');
      const m = min.padStart(2, '0');
      if (dow === '*') return `Daily ${h}:${m} ✓`;
      const idx = DAY_CRON.indexOf(dow);
      const label = idx >= 0 ? DAYS[idx] : dow;
      return `Weekly ${label} ${h}:${m} ✓`;
    }
  }
  return 'Custom ✓';
}

export { describeSchedule };

function SkeletonRow() {
  return (
    <div style={{ height: 18, borderRadius: 4, background: 'var(--t-panel-2, #1c1c1c)', marginBottom: 6 }} />
  );
}

export function ScheduleDrawer({ groupId, onClose }: ScheduleDrawerProps) {
  const [existing, setExisting] = useState<Schedule | null>(null);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'idle'>('loading');
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  // Form state
  const [mode, setMode] = useState<FreqMode>('daily');
  const [time, setTime] = useState('08:00');
  const [weekday, setWeekday] = useState('1');
  const [custom, setCustom] = useState('');
  const [agentId, setAgentId] = useState('');
  const [description, setDescription] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const drawerRef = useRef<HTMLDivElement>(null);

  const loadExisting = useCallback(async () => {
    setLoadStatus('loading');
    try {
      const res = await listSchedules(groupId);
      const found = res.data[0] ?? null;
      setExisting(found);
      if (found) {
        setAgentId(found.agent_id);
        setDescription(found.task_description);
        // parse cron back to form state
        const parts = found.cron_expression.trim().split(/\s+/);
        if (parts.length === 5) {
          const [min, hour, , , dow] = parts;
          setTime(`${hour.padStart(2, '0')}:${min.padStart(2, '0')}`);
          if (dow === '*') { setMode('daily'); }
          else { setMode('weekly'); setWeekday(dow); }
        } else {
          setMode('custom'); setCustom(found.cron_expression);
        }
      }
    } catch { /* ignore */ }
    setLoadStatus('idle');
  }, [groupId]);

  const loadRuns = useCallback(async (scheduleId: string) => {
    setRunsLoading(true);
    try {
      const res = await getScheduleRuns(scheduleId);
      setRuns(res.data.slice(0, 5));
    } catch { setRuns([]); }
    setRunsLoading(false);
  }, []);

  useEffect(() => {
    loadExisting().then(() => {});
  }, [loadExisting]);

  useEffect(() => {
    if (existing) loadRuns(existing.schedule_id);
  }, [existing, loadRuns]);

  // Focus trap: focus drawer on open
  useEffect(() => {
    drawerRef.current?.focus();
  }, []);

  // ESC closes
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  async function handleSave() {
    setSaveState('saving');
    setErrorMsg('');
    try {
      // Delete existing schedule first if any
      if (existing) {
        await deleteSchedule(existing.schedule_id);
      }
      const cron = buildCron(mode, time, weekday, custom);
      const res = await createSchedule({
        group_id: groupId,
        cron_expression: cron,
        agent_id: agentId || 'default',
        task_description: description,
      });
      setExisting(res.data);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (err) {
      setSaveState('error');
      if (err instanceof ScheduleApiError) {
        const detail = err.detail as Record<string, unknown>;
        setErrorMsg(
          typeof detail?.detail === 'string'
            ? detail.detail
            : typeof detail?.error === 'string'
            ? detail.error
            : `Error ${err.status}`,
        );
      } else {
        setErrorMsg('Save failed');
      }
    }
  }

  async function handleDelete() {
    if (!existing) return;
    try {
      await deleteSchedule(existing.schedule_id);
      setExisting(null);
      setRuns([]);
    } catch { /* ignore */ }
  }

  const drawerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    right: 0,
    width: 320,
    height: '100vh',
    background: 'var(--t-panel, #141414)',
    borderLeft: '1px solid var(--t-border, rgba(255,255,255,0.08))',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 500,
    outline: 'none',
  };

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12 };

  return (
    <div
      ref={drawerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Schedule Drawer"
      tabIndex={-1}
      style={drawerStyle}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--t-border, rgba(255,255,255,0.08))' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--t-fg, #fff)' }}>
          Schedule
        </span>
        <button
          onClick={onClose}
          aria-label="关闭 Schedule Drawer"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-fg-4, #71717A)', fontSize: 18, lineHeight: 1, padding: '2px 4px' }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {loadStatus === 'loading' ? (
          <>{[0,1,2].map((i) => <SkeletonRow key={i} />)}</>
        ) : (
          <>
            {/* Frequency */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...mono, color: 'var(--t-fg-4, #71717A)', marginBottom: 6 }}>频率</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['daily', 'weekly', 'custom'] as FreqMode[]).map((f) => (
                  <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="freq"
                      value={f}
                      checked={mode === f}
                      onChange={() => setMode(f)}
                      style={{ accentColor: 'var(--t-accent, #6366F1)' }}
                    />
                    <span style={{ ...mono, color: 'var(--t-fg-2, #D4D4D8)', textTransform: 'capitalize' }}>{f}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Time picker */}
            {mode !== 'custom' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...mono, color: 'var(--t-fg-4, #71717A)', marginBottom: 6 }}>时间（24h）</div>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  style={{
                    ...mono,
                    background: 'var(--t-panel-2, #1c1c1c)',
                    border: '1px solid var(--t-border, rgba(255,255,255,0.1))',
                    borderRadius: 5,
                    color: 'var(--t-fg, #fff)',
                    padding: '5px 8px',
                    width: '100%',
                  }}
                />
              </div>
            )}

            {/* Weekday selector */}
            {mode === 'weekly' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...mono, color: 'var(--t-fg-4, #71717A)', marginBottom: 6 }}>星期</div>
                <select
                  value={weekday}
                  onChange={(e) => setWeekday(e.target.value)}
                  style={{ ...mono, background: 'var(--t-panel-2, #1c1c1c)', border: '1px solid var(--t-border, rgba(255,255,255,0.1))', borderRadius: 5, color: 'var(--t-fg, #fff)', padding: '5px 8px', width: '100%' }}
                >
                  {DAYS.map((d, i) => (
                    <option key={d} value={DAY_CRON[i]}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Custom cron */}
            {mode === 'custom' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...mono, color: 'var(--t-fg-4, #71717A)', marginBottom: 6 }}>Cron 表达式</div>
                <input
                  type="text"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="0 8 * * 1-5"
                  style={{ ...mono, background: 'var(--t-panel-2, #1c1c1c)', border: '1px solid var(--t-border, rgba(255,255,255,0.1))', borderRadius: 5, color: 'var(--t-fg, #fff)', padding: '5px 8px', width: '100%' }}
                />
              </div>
            )}

            {/* Agent ID */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...mono, color: 'var(--t-fg-4, #71717A)', marginBottom: 6 }}>执行 Agent ID</div>
              <input
                type="text"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="agent-id"
                style={{ ...mono, background: 'var(--t-panel-2, #1c1c1c)', border: '1px solid var(--t-border, rgba(255,255,255,0.1))', borderRadius: 5, color: 'var(--t-fg, #fff)', padding: '5px 8px', width: '100%' }}
              />
            </div>

            {/* Task description */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ ...mono, color: 'var(--t-fg-4, #71717A)' }}>任务描述</span>
                <span style={{ ...mono, fontSize: 10, color: description.length > 100 ? 'var(--t-warn, #F59E0B)' : 'var(--t-fg-5, #52525B)' }}>
                  {description.length}/500
                </span>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="每日早报摘要…"
                rows={3}
                maxLength={500}
                style={{ ...mono, background: 'var(--t-panel-2, #1c1c1c)', border: '1px solid var(--t-border, rgba(255,255,255,0.1))', borderRadius: 5, color: 'var(--t-fg, #fff)', padding: '5px 8px', width: '100%', resize: 'vertical' }}
              />
            </div>

            {/* Next run */}
            {existing?.next_run_time && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...mono, color: 'var(--t-fg-4, #71717A)', marginBottom: 4 }}>下次执行</div>
                <span style={{ ...mono, color: 'var(--t-fg-3, #A1A1AA)' }}>
                  {new Date(existing.next_run_time).toLocaleString('zh-CN')}
                </span>
              </div>
            )}

            {/* Error */}
            {saveState === 'error' && (
              <div style={{ ...mono, color: 'var(--t-err)', marginBottom: 10, fontSize: 11 }}>
                {errorMsg}
              </div>
            )}

            {/* Save / Delete buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button
                onClick={handleSave}
                disabled={saveState === 'saving'}
                style={{
                  flex: 1,
                  ...mono,
                  background: saveState === 'saved' ? '#065F46' : 'var(--t-accent, #6366F1)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '7px 12px',
                  cursor: saveState === 'saving' ? 'wait' : 'pointer',
                  opacity: saveState === 'saving' ? 0.7 : 1,
                }}
              >
                {saveState === 'saving' ? '保存中…' : saveState === 'saved' ? 'Saved ✓' : '保存'}
              </button>
              {existing && (
                <button
                  onClick={handleDelete}
                  style={{ ...mono, background: 'none', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--t-err)', borderRadius: 6, padding: '7px 10px', cursor: 'pointer' }}
                >
                  删除
                </button>
              )}
            </div>

            {/* History */}
            <div>
              <div style={{ ...mono, color: 'var(--t-fg-4, #71717A)', marginBottom: 8 }}>最近运行</div>
              {runsLoading ? (
                <>{[0,1,2,3,4].map((i) => <SkeletonRow key={i} />)}</>
              ) : runs.length === 0 ? (
                <span style={{ ...mono, color: 'var(--t-fg-5, #52525B)', fontSize: 11 }}>No runs yet</span>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {runs.map((r) => (
                    <li key={r.run_id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.status === 'succeeded' ? 'var(--t-ok)' : 'var(--t-err)', flexShrink: 0 }} />
                      <span style={{ ...mono, fontSize: 11, color: 'var(--t-fg-3, #A1A1AA)' }}>
                        {new Date(r.triggered_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ ...mono, fontSize: 10, color: r.status === 'succeeded' ? 'var(--t-ok)' : 'var(--t-err)' }}>{r.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ScheduleDrawer;
