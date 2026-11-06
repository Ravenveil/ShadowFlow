/**
 * NeoQuickSchedule — 会话内快捷创建定时任务（2026-11-05，GrokBot「定时任务」对齐）。
 *
 * 触发：DM/群聊 composer 敲 /schedule（NeoComposer onScheduleCommand 回调）。
 * 表单三件套：任务内容 + 频率（一次性/每天/每周N/自定义 cron）+ 时间。
 * 提交 POST /api/schedules（CreateScheduleRequest），计划挂当前会话：
 *   - DM：group_id = 会话 id + agent_id = 对面那位（AgentSchedulesPanel 同款语义）
 *   - 群聊：group_id = 会话 id（Python 侧触发时按会话派活）
 * 成功 → 在聊天流里落一条系统样 toast 提示 + 关闭弹层；失败 → 表单内联报错。
 */
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../common/i18n';
import { createSchedule, type ScheduleRecord } from '../api/schedules';

export type QuickScheduleFreq = 'once' | 'daily' | 'weekly' | 'cron';

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 本地时间 → ISO（秒级；后端 DateTrigger 吃 ISO string）。 */
function localToIso(local: string): string {
  // local 形如 "YYYY-MM-DDTHH:mm"（datetime-local 值）
  const ts = Date.parse(local);
  if (Number.isNaN(ts)) return '';
  return new Date(ts).toISOString();
}

export function NeoQuickSchedule({
  groupId,
  agentId,
  onClose,
  onCreated,
}: {
  groupId: string;
  /** DM 对面 agent（可选；群聊缺省）。 */
  agentId?: string | null;
  onClose: () => void;
  /** 创建成功回调（群聊页用它往流里落提示）。 */
  onCreated?: (s: ScheduleRecord) => void;
}) {
  const { t } = useI18n();
  const [task, setTask] = useState('');
  const [freq, setFreq] = useState<QuickScheduleFreq>('daily');
  /** datetime-local 值（once 用）。 */
  const [startAt, setStartAt] = useState('');
  /** HH:mm（daily 用）。 */
  const [dailyTime, setDailyTime] = useState('09:00');
  /** 0-6 周几（weekly 用，多选）。 */
  const [weekdays, setWeekdays] = useState<number[]>([0]);
  /** 自定义 cron（cron 用）。 */
  const [cronExpr, setCronExpr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cronPreview = useMemo(() => {
    switch (freq) {
      case 'once':
        return startAt ? t('neo.qs.onceAt', { defaultValue: '一次性：{{time}} 触发', time: startAt.replace('T', ' ') }) : '';
      case 'daily':
        return t('neo.qs.dailyAt', { defaultValue: '每天 {{time}} 触发', time: dailyTime });
      case 'weekly':
        return weekdays.length === 0
          ? t('neo.qs.weeklyPick', { defaultValue: '每周：先选星期' })
          : t('neo.qs.weeklyAt', {
              defaultValue: '每{{days}} {{time}} 触发',
              days: weekdays.map((d) => WEEKDAY_LABELS[d]).join('、'),
              time: dailyTime,
            });
      case 'cron':
        return cronExpr.trim() || t('neo.qs.cronEmpty', { defaultValue: '自定义 cron 表达式' });
    }
  }, [freq, startAt, dailyTime, weekdays, cronExpr, t]);

  function buildCron(): string | undefined {
    if (freq === 'cron') return cronExpr.trim() || undefined;
    if (freq === 'daily') {
      const [h, m] = dailyTime.split(':').map((x) => Number(x));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
      return `${m} ${h} * * *`;
    }
    if (freq === 'weekly') {
      if (weekdays.length === 0) return undefined;
      const [h, m] = dailyTime.split(':').map((x) => Number(x));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
      // APScheduler cron: day_of_week 0=mon
      const dow = [...weekdays].sort((a, b) => a - b).join(',');
      return `${m} ${h} * * ${dow}`;
    }
    return undefined; // once → start_at
  }

  async function submit() {
    const taskDescription = task.trim();
    if (!taskDescription) {
      setErr(t('neo.qs.needTask', { defaultValue: '先写一句任务内容' }));
      return;
    }
    let req: Parameters<typeof createSchedule>[0];
    if (freq === 'once') {
      const iso = localToIso(startAt);
      if (!iso) {
        setErr(t('neo.qs.needTime', { defaultValue: '选一个触发时间' }));
        return;
      }
      req = { group_id: groupId, start_at: iso, task_description: taskDescription };
    } else {
      const cron = buildCron();
      if (!cron) {
        setErr(t('neo.qs.badCron', { defaultValue: '频率参数不完整（时间/星期/cron）' }));
        return;
      }
      req = { group_id: groupId, cron_expression: cron, task_description: taskDescription };
    }
    if (agentId) req.agent_id = agentId;
    setBusy(true);
    setErr(null);
    try {
      const created = await createSchedule(req);
      onCreated?.(created);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="neo-qs-backdrop" data-testid="neo-quick-schedule" role="dialog" aria-modal>
      <div className="neo-qs-card">
        <div className="neo-qs-head">
          <span className="neo-qs-title">
            {t('neo.qs.title', { defaultValue: '新建定时任务' })}
          </span>
          <button
            type="button"
            className="neo-qs-close"
            onClick={onClose}
            aria-label={t('common.close', { defaultValue: '关闭' })}
          >
            <X size={14} strokeWidth={1.9} aria-hidden />
          </button>
        </div>

        <label className="neo-qs-field">
          <span className="neo-qs-label">{t('neo.qs.task', { defaultValue: '任务内容' })}</span>
          <textarea
            className="neo-qs-task"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={2}
            placeholder={t('neo.qs.taskHint', { defaultValue: '到点要干什么，比如：整理今天的新闻要点发到群里' })}
            autoFocus
          />
        </label>

        <div className="neo-qs-field">
          <span className="neo-qs-label">{t('neo.qs.freq', { defaultValue: '频率' })}</span>
          <div className="neo-qs-freq-row" role="radiogroup">
            {(
              [
                ['once', '一次性'],
                ['daily', '每天'],
                ['weekly', '每周'],
                ['cron', 'Cron'],
              ] as Array<[QuickScheduleFreq, string]>
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={freq === v}
                className={`neo-qs-freq${freq === v ? ' on' : ''}`}
                onClick={() => setFreq(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="neo-qs-field">
          {freq === 'once' && (
            <label className="neo-qs-inline">
              <span className="neo-qs-label">{t('neo.qs.time', { defaultValue: '触发时间' })}</span>
              <input
                type="datetime-local"
                className="neo-qs-input"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </label>
          )}
          {freq === 'daily' && (
            <label className="neo-qs-inline">
              <span className="neo-qs-label">{t('neo.qs.time', { defaultValue: '触发时间' })}</span>
              <input
                type="time"
                className="neo-qs-input"
                value={dailyTime}
                onChange={(e) => setDailyTime(e.target.value)}
              />
            </label>
          )}
          {freq === 'weekly' && (
            <div className="neo-qs-inline">
              <span className="neo-qs-label">{t('neo.qs.weekday', { defaultValue: '星期' })}</span>
              <div className="neo-qs-week-row">
                {WEEKDAY_LABELS.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    className={`neo-qs-week${weekdays.includes(i) ? ' on' : ''}`}
                    onClick={() =>
                      setWeekdays((prev) =>
                        prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                      )
                    }
                  >
                    {label.slice(1)}
                  </button>
                ))}
              </div>
              <input
                type="time"
                className="neo-qs-input"
                value={dailyTime}
                onChange={(e) => setDailyTime(e.target.value)}
              />
            </div>
          )}
          {freq === 'cron' && (
            <label className="neo-qs-inline">
              <span className="neo-qs-label">{t('neo.qs.cron', { defaultValue: 'Cron 表达式' })}</span>
              <input
                type="text"
                className="neo-qs-input"
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="30 9 * * 1-5"
              />
            </label>
          )}
          <div className="neo-qs-preview">{cronPreview}</div>
        </div>

        {err && <div className="neo-qs-error" role="alert">{err}</div>}

        <div className="neo-qs-actions">
          <button type="button" className="neo-qs-cancel" onClick={onClose}>
            {t('common.cancel', { defaultValue: '取消' })}
          </button>
          <button
            type="button"
            className="neo-qs-submit"
            disabled={busy}
            onClick={() => void submit()}
            data-testid="neo-qs-submit"
          >
            {busy ? t('neo.qs.creating', { defaultValue: '创建中…' }) : t('neo.qs.create', { defaultValue: '创建' })}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NeoQuickSchedule;
