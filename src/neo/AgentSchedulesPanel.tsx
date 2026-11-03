/**
 * AgentSchedulesPanel — Agent 主机卡片「定时任务」区块（os-unified 2026-11-04）。
 *
 * Grok Bot 范式（视频 11:55 定时任务章节）：Bot 卡片内直接配置周期任务，
 * 不用去 Settings。数据全部真实后端：
 *   GET  /api/schedules?agent_id=X   — 该 agent 的计划
 *   POST /api/schedules              — 新建（agent_id = 本 agent，
 *                                       group_id = 该 agent 的 DM 会话 id）
 *   PATCH /api/schedules/:id         — 启停
 *   DELETE /api/schedules/:id        — 删除
 *
 * group_id 语义：计划挂在「会话」上（CreateScheduleRequest.group_id 必填），
 * agent 维度的计划挂它的 DM 会话（resolveDmConversation find-or-create），
 * 触发结果自然回传到与该 agent 的聊天流。
 */
import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '../common/i18n';
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  patchSchedule,
  type ScheduleRecord,
} from '../api/schedules';
import { resolveDmConversation } from '../api/groupApi';

type PresetId = 'daily9' | 'weekdays9' | 'weeklyMon9' | 'hourly' | 'custom' | 'oneshot';

const PRESET_CRON: Record<Exclude<PresetId, 'custom' | 'oneshot'>, string> = {
  daily9: '0 9 * * *',
  weekdays9: '0 9 * * 1-5',
  weeklyMon9: '0 9 * * 1',
  hourly: '0 * * * *',
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 9px',
  fontSize: 12,
  borderRadius: 6,
  border: '1px solid var(--t-border, rgba(0,0,0,.12))',
  background: 'var(--t-bg, transparent)',
  color: 'inherit',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  opacity: 0.65,
  marginBottom: 4,
};

export interface AgentSchedulesPanelProps {
  agentId: string;
  workspaceId?: string | null;
}

export function AgentSchedulesPanel({ agentId, workspaceId }: AgentSchedulesPanelProps) {
  const { t } = useI18n();

  const [schedules, setSchedules] = useState<ScheduleRecord[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [formPreset, setFormPreset] = useState<PresetId>('daily9');
  const [formCron, setFormCron] = useState('');
  const [formStartAt, setFormStartAt] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await listSchedules(undefined, agentId);
      setSchedules(data);
      setLoadError('');
    } catch {
      setSchedules([]);
      setLoadError(t('neo.soul.schedulesLoadFailed', { defaultValue: '加载失败，请稍后重试' }));
    }
  }, [agentId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate() {
    setActionError('');
    if (!formDesc.trim()) {
      setActionError(t('neo.soul.schedulesErrNoDesc', { defaultValue: '请填写任务指令' }));
      return;
    }
    const req: Parameters<typeof createSchedule>[0] = {
      agent_id: agentId,
      task_description: formDesc.trim(),
      group_id: '', // resolve 后填充
    };
    if (formPreset === 'oneshot') {
      if (!formStartAt) {
        setActionError(t('neo.soul.schedulesErrNoStartAt', { defaultValue: '请选择触发时间' }));
        return;
      }
      req.start_at = new Date(formStartAt).toISOString();
    } else {
      req.cron_expression = formPreset === 'custom' ? formCron.trim() : PRESET_CRON[formPreset];
    }
    setSubmitting(true);
    try {
      // 计划挂在 agent 的 DM 会话上（find-or-create；失败置空 id 让后端 422 提示）
      const gid = await resolveDmConversation(agentId, workspaceId ?? undefined);
      if (!gid) throw new Error('dm-resolve-failed');
      req.group_id = gid;
      await createSchedule(req);
      setShowForm(false);
      setFormDesc('');
      setFormCron('');
      setFormStartAt('');
      await refresh();
    } catch (err) {
      const code = err instanceof Error && 'code' in err ? String((err as { code: string }).code) : '';
      if (code === 'invalid_cron') {
        setActionError(t('neo.soul.schedulesErrInvalidCron', { defaultValue: 'cron 表达式无效，示例：0 8 * * 1-5' }));
      } else {
        setActionError(t('neo.soul.schedulesCreateFailed', { defaultValue: '创建失败，请检查输入后重试' }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(s: ScheduleRecord) {
    setActionError('');
    try {
      await patchSchedule(s.schedule_id, { enabled: !s.enabled });
      await refresh();
    } catch {
      setActionError(t('neo.soul.schedulesToggleFailed', { defaultValue: '切换启用状态失败' }));
    }
  }

  async function handleDelete(s: ScheduleRecord) {
    if (!window.confirm(t('neo.soul.schedulesDeleteConfirm', { defaultValue: '确定删除该计划？删除后不再触发。' }))) {
      return;
    }
    setActionError('');
    try {
      await deleteSchedule(s.schedule_id);
      await refresh();
    } catch {
      setActionError(t('neo.soul.schedulesDeleteFailed', { defaultValue: '删除失败' }));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="neo-soul-schedules">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="neo-modal-label" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <CalendarClock size={13} strokeWidth={1.75} aria-hidden />
          {t('neo.soul.schedulesTitle', { defaultValue: '定时任务' })}
        </span>
        {!showForm && (
          <button
            type="button"
            className="neo-list-retry"
            onClick={() => setShowForm(true)}
            data-testid="neo-soul-schedules-new"
          >
            <Plus size={11} strokeWidth={2} aria-hidden />
            {t('neo.soul.schedulesNew', { defaultValue: '新建' })}
          </button>
        )}
      </div>

      {/* 新建表单（紧凑：频率预设 + 指令，对齐 soul 页密度） */}
      {showForm && (
        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            padding: 10, borderRadius: 10, border: '1px solid var(--t-border, rgba(0,0,0,.12))',
          }}
          data-testid="neo-soul-schedules-form"
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>{t('neo.soul.schedulesFreq', { defaultValue: '触发频率' })}</label>
              <select
                value={formPreset}
                onChange={(e) => setFormPreset(e.target.value as PresetId)}
                style={inputStyle}
                data-testid="neo-soul-schedules-freq"
              >
                <option value="daily9">{t('neo.soul.schedulesDaily9', { defaultValue: '每天 09:00' })}</option>
                <option value="weekdays9">{t('neo.soul.schedulesWeekdays9', { defaultValue: '工作日 09:00' })}</option>
                <option value="weeklyMon9">{t('neo.soul.schedulesWeeklyMon9', { defaultValue: '每周一 09:00' })}</option>
                <option value="hourly">{t('neo.soul.schedulesHourly', { defaultValue: '每小时整点' })}</option>
                <option value="custom">{t('neo.soul.schedulesCustom', { defaultValue: '自定义 cron…' })}</option>
                <option value="oneshot">{t('neo.soul.schedulesOneshot', { defaultValue: '一次性（指定时间）' })}</option>
              </select>
            </div>
            <div>
              {formPreset === 'custom' ? (
                <>
                  <label style={labelStyle}>cron</label>
                  <input
                    value={formCron}
                    onChange={(e) => setFormCron(e.target.value)}
                    placeholder="0 8 * * 1-5"
                    style={{ ...inputStyle, fontFamily: 'var(--font-mono, monospace)' }}
                  />
                </>
              ) : formPreset === 'oneshot' ? (
                <>
                  <label style={labelStyle}>{t('neo.soul.schedulesStartAt', { defaultValue: '触发时间' })}</label>
                  <input
                    type="datetime-local"
                    value={formStartAt}
                    onChange={(e) => setFormStartAt(e.target.value)}
                    style={inputStyle}
                  />
                </>
              ) : (
                <>
                  <label style={labelStyle}>cron</label>
                  <input value={PRESET_CRON[formPreset]} disabled style={{ ...inputStyle, opacity: 0.55, fontFamily: 'var(--font-mono, monospace)' }} />
                </>
              )}
            </div>
          </div>
          <div>
            <label style={labelStyle}>{t('neo.soul.schedulesTask', { defaultValue: '任务指令' })}</label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={t('neo.soul.schedulesTaskPlaceholder', { defaultValue: '例如：每天早上扫描新商机并生成简报' })}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          {actionError && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--t-err, #b91c1c)' }}>{actionError}</p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="neo-btn-primary"
              style={{ height: 28, padding: '0 14px', fontSize: 12 }}
              disabled={submitting}
              onClick={() => void handleCreate()}
              data-testid="neo-soul-schedules-create"
            >
              {submitting
                ? t('neo.soul.schedulesCreating', { defaultValue: '创建中…' })
                : t('neo.soul.schedulesCreate', { defaultValue: '创建计划' })}
            </button>
            <button
              type="button"
              className="neo-list-retry"
              onClick={() => { setShowForm(false); setActionError(''); }}
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        </div>
      )}

      {/* 列表 */}
      {loadError ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--t-err, #b91c1c)' }}>{loadError}</p>
      ) : schedules === null ? (
        <p style={{ margin: 0, fontSize: 12, opacity: 0.55 }}>{t('common.loading', { defaultValue: '加载中…' })}</p>
      ) : schedules.length === 0 && !showForm ? (
        <p style={{ margin: 0, fontSize: 12, opacity: 0.55 }} data-testid="neo-soul-schedules-empty">
          {t('neo.soul.schedulesEmpty', { defaultValue: '还没有定时任务，点「新建」让 TA 按点开工。' })}
        </p>
      ) : (
        schedules.map((s) => {
          const enabled = s.enabled !== false;
          return (
            <div
              key={s.schedule_id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', borderRadius: 8,
                border: '1px solid var(--t-border, rgba(0,0,0,.12))',
              }}
              data-testid="neo-soul-schedule-row"
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block', fontSize: 12, fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {s.task_description || t('neo.soul.schedulesUntitled', { defaultValue: '（无任务指令）' })}
                </span>
                <span style={{ display: 'block', fontSize: 10.5, opacity: 0.6, marginTop: 2 }}>
                  {s.cron_expression || t('neo.soul.schedulesOneshot', { defaultValue: '一次性' })}
                  {' · '}
                  {t('neo.soul.schedulesNextRun', { defaultValue: '下次' })}
                  {': '}
                  {formatTime(s.next_run_time)}
                  {s.completed ? ` · ${t('neo.soul.schedulesCompleted', { defaultValue: '已完成' })}` : ''}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => void handleToggle(s)}
                className="neo-list-retry"
                style={{
                  color: enabled ? 'var(--t-ok, #15803d)' : undefined,
                  borderColor: enabled ? 'var(--t-ok, #15803d)' : undefined,
                }}
                data-testid="neo-soul-schedule-toggle"
              >
                {enabled
                  ? t('neo.soul.schedulesEnabled', { defaultValue: '已启用' })
                  : t('neo.soul.schedulesDisabled', { defaultValue: '已停用' })}
              </button>
              <button
                type="button"
                className="neo-icon-btn"
                onClick={() => void handleDelete(s)}
                title={t('common.delete', { defaultValue: '删除' })}
                style={{ color: 'var(--t-err, #b91c1c)', width: 22, height: 22 }}
                data-testid="neo-soul-schedule-delete"
              >
                <Trash2 size={12} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          );
        })
      )}

      {actionError && !showForm && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--t-err, #b91c1c)' }}>{actionError}</p>
      )}
    </div>
  );
}
