/**
 * SchedulesView - scheduled task workbench subview.
 * All visible copy comes from content/views.ts; no literals live in this file.
 */
import { useCallback, useEffect, useState } from 'react';
import { SCHEDULES, SUBVIEW } from '@/shared/content/views';
import {
  deleteSchedule,
  getSchedules,
  toggleSchedule,
  type Schedule,
} from '@/shared/data/http/generic';
import { QuickScheduleModal } from './QuickScheduleModal';

type LoadState = 'loading' | 'ready' | 'error';

const keyOf = (s: Schedule) => String(s.schedule_id ?? s.id ?? '');

export default function SchedulesView() {
  const [rows, setRows] = useState<Schedule[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(() => {
    setState('loading');
    setNotice(null);
    getSchedules()
      .then((list) => {
        setRows(Array.isArray(list) ? list : []);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => {
    load();
  }, [load, reload]);

  async function toggle(row: Schedule) {
    const id = keyOf(row);
    if (!id) return;
    const enabled = !row.enabled;
    setNotice(null);
    setRows((prev) => prev.map((r) => (r === row ? { ...r, enabled } : r)));
    try {
      await toggleSchedule(id, enabled);
    } catch {
      setRows((prev) => prev.map((r) => (r === row ? { ...r, enabled: row.enabled } : r)));
      setNotice(SCHEDULES.loadFailed);
    }
  }

  async function remove(row: Schedule) {
    const id = keyOf(row);
    if (!id) return;
    setNotice(null);
    const previous = rows;
    setRows((current) => current.filter((r) => r !== row));
    try {
      await deleteSchedule(id);
    } catch {
      setRows(previous);
      setNotice(SCHEDULES.loadFailed);
    }
  }

  return (
    <section className="subview">
      <header className="subview-head">
        <h1 className="subview-title">{SCHEDULES.title}</h1>
      </header>

      <div className="subview-toolbar">
        <button className="subview-btn" type="button" data-primary="true" onClick={() => setModalOpen(true)}>
          {SCHEDULES.new}
        </button>
        <button className="subview-btn" type="button" onClick={load}>
          {SUBVIEW.retry}
        </button>
      </div>

      {notice && <div className="subview-state">{notice}</div>}

      {state === 'loading' && <div className="subview-state">{SCHEDULES.loading}</div>}

      {state === 'error' && (
        <div className="subview-state">
          <span>{SCHEDULES.loadFailed}</span>
          <button className="subview-btn" onClick={() => setReload((n) => n + 1)}>
            {SUBVIEW.retry}
          </button>
        </div>
      )}

      {state === 'ready' && rows.length === 0 && (
        <div className="subview-state">{SCHEDULES.empty}</div>
      )}

      {state === 'ready' && rows.length > 0 && (
        <div className="subview-list">
          {rows.map((row, index) => (
            <div className="subview-card" key={keyOf(row) || row.name || String(index)}>
              <div className="subview-kv">
                <span>{SCHEDULES.name}</span>
                <span>{row.name ?? keyOf(row)}</span>
              </div>
              <div className="subview-kv">
                <span>{SCHEDULES.cron}</span>
                <span>{row.cron_expression ?? row.start_at ?? ''}</span>
              </div>
              <div className="subview-kv">
                <span>{SCHEDULES.prompt}</span>
                <span>{row.task_description ?? ''}</span>
              </div>
              <div className="subview-kv">
                <span>last_run_at</span>
                <span>{row.last_run_at || SCHEDULES.never}</span>
              </div>
              <div className="subview-kv">
                <span className="subview-tag">
                  {row.enabled ? SCHEDULES.enabled : SCHEDULES.disabled}
                </span>
                <span>
                  <button className="subview-btn" onClick={() => toggle(row)}>
                    {row.enabled ? SCHEDULES.pause : SCHEDULES.resume}
                  </button>
                  <button className="subview-btn" onClick={() => remove(row)}>
                    {SCHEDULES.delete}
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen ? (
        <QuickScheduleModal
          groupId="default"
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setNotice(SCHEDULES.created);
            setReload((n) => n + 1);
          }}
        />
      ) : null}
    </section>
  );
}
