/**
 * QuickScheduleModal — 会话/页内快捷创建定时任务（搬 legacy NeoQuickSchedule）。
 *
 * 表单三件套：任务内容 + 频率（一次性/每天/每周N/自定义 cron）+ 时间。
 * 提交 POST /api/schedules：cron 周期与 start_at 一次性二选一（cron 优先）。
 * 频率形态：once → start_at（datetime-local 转 ISO）；
 *   daily → 每分钟每小时通配 cron；weekly → dow 多选逗号拼接（APScheduler 语义 0=周一）；
 *   cron → 原样透传。
 */
import { useMemo, useState } from 'react';
import { SCHEDULES } from '@/shared/content/views';
import { IconClose } from '@/shared/ui/icons';
import { createSchedule } from '@/shared/data/http/generic';

type Freq = 'once' | 'daily' | 'weekly' | 'cron';

const WEEKDAY_LABELS = SCHEDULES.weekdays;

/** datetime-local 值 → ISO（秒级；后端 DateTrigger 吃 ISO string）。 */
function localToIso(local: string): string {
  const ts = Date.parse(local);
  return Number.isNaN(ts) ? '' : new Date(ts).toISOString();
}

export function QuickScheduleModal({
  groupId,
  agentId,
  onClose,
  onCreated,
}: {
  /** 计划挂哪个会话（群聊 = 会话 id；独立页可传任意归属键）。 */
  groupId: string;
  /** DM 对面 agent（可选；群聊缺省）。 */
  agentId?: string | null;
  onClose: () => void;
  /** 创建成功回调（调用方刷新列表 / 落提示）。 */
  onCreated?: () => void;
}) {
  const [task, setTask] = useState('');
  const [freq, setFreq] = useState<Freq>('daily');
  const [startAt, setStartAt] = useState('');
  const [dailyTime, setDailyTime] = useState('09:00');
  const [weekdays, setWeekdays] = useState<number[]>([0]);
  const [cronExpr, setCronExpr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cronPreview = useMemo(() => {
    switch (freq) {
      case 'once':
        return startAt ? SCHEDULES.previewOnce(startAt.replace('T', ' ')) : '';
      case 'daily':
        return SCHEDULES.previewDaily(dailyTime);
      case 'weekly':
        return weekdays.length === 0
          ? SCHEDULES.previewWeeklyPick
          : SCHEDULES.previewWeekly(weekdays.map((d) => WEEKDAY_LABELS[d]).join('、'), dailyTime);
      case 'cron':
        return cronExpr.trim() || SCHEDULES.previewCronEmpty;
    }
  }, [freq, startAt, dailyTime, weekdays, cronExpr]);

  function buildCron(): string | undefined {
    if (freq === 'cron') return cronExpr.trim() || undefined;
    const [h, m] = dailyTime.split(':').map((x) => Number(x));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
    if (freq === 'daily') return `${m} ${h} * * *`;
    if (freq === 'weekly') {
      if (weekdays.length === 0) return undefined;
      // APScheduler cron: day_of_week 0=周一
      const dow = [...weekdays].sort((a, b) => a - b).join(',');
      return `${m} ${h} * * ${dow}`;
    }
    return undefined;
  }

  async function submit() {
    const taskDescription = task.trim();
    if (!taskDescription) {
      setErr(SCHEDULES.errNeedTask);
      return;
    }
    let payload: Parameters<typeof createSchedule>[0];
    if (freq === 'once') {
      const iso = localToIso(startAt);
      if (!iso) {
        setErr(SCHEDULES.errNeedTime);
        return;
      }
      payload = { group_id: groupId, start_at: iso, task_description: taskDescription };
    } else {
      const cron = buildCron();
      if (!cron) {
        setErr(SCHEDULES.errBadCron);
        return;
      }
      payload = { group_id: groupId, cron_expression: cron, task_description: taskDescription };
    }
    if (agentId) payload.agent_id = agentId;
    setBusy(true);
    setErr(null);
    try {
      await createSchedule(payload);
      onCreated?.();
      onClose();
    } catch {
      setErr(SCHEDULES.errCreate);
    } finally {
      setBusy(false);
    }
  }

  const FREQS: Array<[Freq, string]> = [
    ['once', SCHEDULES.freqOnce],
    ['daily', SCHEDULES.freqDaily],
    ['weekly', SCHEDULES.freqWeekly],
    ['cron', SCHEDULES.freqCron],
  ];

  return (
    <div className="kb-mask" role="dialog" aria-modal onClick={onClose}>
      <div className="kb-confirm qs-card" onClick={(e) => e.stopPropagation()}>
        <div className="qs-head">
          <b>{SCHEDULES.new}</b>
          <button type="button" className="kb-srcdel" onClick={onClose} aria-label={SCHEDULES.cancel}>
            <IconClose size={13} />
          </button>
        </div>

        <label className="qs-field">
          <span className="qs-label">{SCHEDULES.taskLabel}</span>
          <textarea
            className="subview-textarea"
            value={task}
            onChange={(e) => setTask(e.currentTarget.value)}
            rows={2}
            placeholder={SCHEDULES.taskHint}
            autoFocus
          />
        </label>

        <div className="qs-field">
          <span className="qs-label">{SCHEDULES.freqLabel}</span>
          <div className="qs-freqrow" role="radiogroup">
            {FREQS.map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={freq === v}
                className="qs-freq"
                data-on={freq === v ? 'true' : undefined}
                onClick={() => setFreq(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="qs-field">
          {freq === 'once' ? (
            <label className="qs-inline">
              <span className="qs-label">{SCHEDULES.timeLabel}</span>
              <input type="datetime-local" className="subview-input" value={startAt} onChange={(e) => setStartAt(e.currentTarget.value)} />
            </label>
          ) : null}
          {freq === 'daily' ? (
            <label className="qs-inline">
              <span className="qs-label">{SCHEDULES.timeLabel}</span>
              <input type="time" className="subview-input" value={dailyTime} onChange={(e) => setDailyTime(e.currentTarget.value)} />
            </label>
          ) : null}
          {freq === 'weekly' ? (
            <div className="qs-inline">
              <span className="qs-label">{SCHEDULES.weekdayLabel}</span>
              <div className="qs-weekrow">
                {WEEKDAY_LABELS.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    className="qs-week"
                    data-on={weekdays.includes(i) ? 'true' : undefined}
                    onClick={() =>
                      setWeekdays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input type="time" className="subview-input" value={dailyTime} onChange={(e) => setDailyTime(e.currentTarget.value)} />
            </div>
          ) : null}
          {freq === 'cron' ? (
            <label className="qs-inline">
              <span className="qs-label">{SCHEDULES.cronLabel}</span>
              <input
                type="text"
                className="subview-input"
                value={cronExpr}
                onChange={(e) => setCronExpr(e.currentTarget.value)}
                placeholder="30 9 * * 1-5"
              />
            </label>
          ) : null}
          <div className="qs-preview">{cronPreview}</div>
        </div>

        {err ? <div className="subview-state" role="alert">{err}</div> : null}

        <div className="kb-confirm-actions">
          <button type="button" className="subview-btn" onClick={onClose}>
            {SCHEDULES.cancel}
          </button>
          <button type="button" className="subview-btn" data-primary="true" disabled={busy} onClick={() => void submit()}>
            {busy ? SCHEDULES.creating : SCHEDULES.createBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
