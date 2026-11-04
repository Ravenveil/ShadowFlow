/**
 * SchedulesSection — Settings: 定时任务管理面板
 *
 * 获客卖点「每天自动扫商机」的管理面：列出 / 新建 / 启停 / 删除计划，
 * 并可展开查看某个计划的触发记录（runs）。
 *
 * 数据源（全部为真实后端，无 mock）：
 *   GET/POST/PATCH/DELETE /api/schedules + GET /api/schedules/{id}/runs
 *     → src/api/schedules.ts（Python shadowflow/api/schedules.py）
 *   目标下拉：GET /api/teams（group_id）、GET /api/agents（agent_id，可选）
 */
import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '../../common/i18n';
import {
  createSchedule,
  deleteSchedule,
  getScheduleRuns,
  listSchedules,
  patchSchedule,
  type ScheduleRecord,
  type ScheduleRun,
} from '../../api/schedules';
import { listTeams, type TeamRecord } from '../../api/teams';
import { listAgents, type AgentRecord } from '../../api/agents';
import { NeoConfirmModal } from '../../neo/NeoConfirmModal';

// ── 常用频率预设 ─────────────────────────────────────────────────────────────

type PresetId = 'daily9' | 'weekdays9' | 'weeklyMon9' | 'hourly' | 'custom' | 'oneshot';

const PRESET_CRON: Record<Exclude<PresetId, 'custom' | 'oneshot'>, string> = {
  daily9: '0 9 * * *',
  weekdays9: '0 9 * * 1-5',
  weeklyMon9: '0 9 * * 1',
  hourly: '0 * * * *',
};

// ── 小组件 ──────────────────────────────────────────────────────────────────

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 12.5,
  borderRadius: 6,
  border: '1px solid var(--t-border)',
  background: 'var(--t-bg)',
  color: 'var(--t-fg)',
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--t-fg-3)',
  marginBottom: 4,
};

// ── 主组件 ──────────────────────────────────────────────────────────────────

export function SchedulesSection() {
  const { t } = useI18n();

  const [schedules, setSchedules] = useState<ScheduleRecord[] | null>(null);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  // 新建表单状态
  const [showForm, setShowForm] = useState(false);
  const [formGroupId, setFormGroupId] = useState('');
  const [formAgentId, setFormAgentId] = useState('');
  const [formPreset, setFormPreset] = useState<PresetId>('daily9');
  const [formCron, setFormCron] = useState('');
  const [formStartAt, setFormStartAt] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // runs 展开状态
  const [runsFor, setRunsFor] = useState<string | null>(null);
  const [runs, setRuns] = useState<ScheduleRun[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listSchedules();
      setSchedules(data);
      setLoadError('');
    } catch {
      setSchedules([]);
      setLoadError(t('settings.schedules.loadFailed', { defaultValue: '加载失败，请稍后重试' }));
    }
  }, [t]);

  useEffect(() => {
    refresh();
    // team / agent 只用于名称展示与目标下拉，失败不阻塞计划列表。
    listTeams().then(setTeams).catch(() => setTeams([]));
    listAgents().then(setAgents).catch(() => setAgents([]));
  }, [refresh]);

  const teamName = (id: string) => teams.find((tm) => tm.team_id === id)?.name ?? id;
  const agentName = (id: string | null) =>
    id ? agents.find((a) => a.agent_id === id)?.name ?? id : null;

  async function handleCreate() {
    setActionError('');
    if (!formGroupId) {
      setActionError(t('settings.schedules.errNoTeam', { defaultValue: '请选择目标团队' }));
      return;
    }
    if (!formDesc.trim()) {
      setActionError(t('settings.schedules.errNoDesc', { defaultValue: '请填写任务指令' }));
      return;
    }
    const req: Parameters<typeof createSchedule>[0] = {
      group_id: formGroupId,
      task_description: formDesc.trim(),
    };
    if (formAgentId) req.agent_id = formAgentId;
    if (formPreset === 'oneshot') {
      if (!formStartAt) {
        setActionError(t('settings.schedules.errNoStartAt', { defaultValue: '请选择触发时间' }));
        return;
      }
      req.start_at = new Date(formStartAt).toISOString();
    } else {
      req.cron_expression = formPreset === 'custom' ? formCron.trim() : PRESET_CRON[formPreset];
    }
    setSubmitting(true);
    try {
      await createSchedule(req);
      setShowForm(false);
      setFormDesc('');
      setFormCron('');
      setFormStartAt('');
      await refresh();
    } catch (err) {
      const code = err instanceof Error && 'code' in err ? String((err as { code: string }).code) : '';
      setActionError(
        code === 'invalid_cron'
          ? t('settings.schedules.errInvalidCron', { defaultValue: 'cron 表达式无效，示例：0 8 * * 1-5' })
          : t('settings.schedules.createFailed', { defaultValue: '创建失败，请检查输入后重试' }),
      );
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
      setActionError(t('settings.schedules.toggleFailed', { defaultValue: '切换启用状态失败' }));
    }
  }

  // 删除确认弹窗（2026-11-04 用户反馈批）：window.confirm 原生框替换为
  // NeoConfirmModal（应用内弹窗，红色危险确认钮）。
  const [deleteTarget, setDeleteTarget] = useState<ScheduleRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function openDelete(s: ScheduleRecord) {
    setActionError('');
    setDeleteTarget(s);
  }

  async function confirmDelete() {
    const s = deleteTarget;
    if (!s) return;
    setDeleteBusy(true);
    setActionError('');
    try {
      await deleteSchedule(s.schedule_id);
      setDeleteTarget(null);
      if (runsFor === s.schedule_id) {
        setRunsFor(null);
        setRuns(null);
      }
      await refresh();
    } catch {
      setActionError(t('settings.schedules.deleteFailed', { defaultValue: '删除失败' }));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleToggleRuns(s: ScheduleRecord) {
    if (runsFor === s.schedule_id) {
      setRunsFor(null);
      setRuns(null);
      return;
    }
    setRunsFor(s.schedule_id);
    setRuns(null);
    try {
      setRuns(await getScheduleRuns(s.schedule_id));
    } catch {
      setRuns([]);
    }
  }

  // ── 渲染 ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 标题块 — 对齐 ComingSoonSection 的层级规范 */}
      <div>
        <div className="hf-label" style={{ color: 'var(--t-accent)' }}>
          {t('settings.schedules.group', { defaultValue: 'AUTOMATION' }).toUpperCase()}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4, letterSpacing: '-.01em', color: 'var(--t-fg)' }}>
          {t('settings.schedules.title', { defaultValue: '定时任务' })}
        </div>
        <p style={{ fontSize: 13, color: 'var(--t-fg-3)', marginTop: 6 }}>
          {t('settings.schedules.subtitle', { defaultValue: '让团队按计划自动执行，例如每天早上 9 点扫描新商机。' })}
        </p>
      </div>

      {/* 新建入口 / 表单 */}
      <div className="hf-card" style={{ padding: 16 }}>
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'var(--t-accent)', color: 'var(--t-accent-ink)',
              fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            <Plus size={14} />
            {t('settings.schedules.new', { defaultValue: '新建计划' })}
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="sf-sched-team" style={labelStyle}>{t('settings.schedules.fieldTeam', { defaultValue: '目标团队' })}</label>
                <select
                  id="sf-sched-team"
                  value={formGroupId}
                  onChange={(e) => setFormGroupId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">{t('settings.schedules.selectTeam', { defaultValue: '选择团队…' })}</option>
                  {teams.map((tm) => (
                    <option key={tm.team_id} value={tm.team_id}>{tm.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sf-sched-agent" style={labelStyle}>{t('settings.schedules.fieldAgent', { defaultValue: '指派 Agent（可选）' })}</label>
                <select
                  id="sf-sched-agent"
                  value={formAgentId}
                  onChange={(e) => setFormAgentId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">{t('settings.schedules.noAgent', { defaultValue: '不指派' })}</option>
                  {agents.map((a) => (
                    <option key={a.agent_id} value={a.agent_id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="sf-sched-freq" style={labelStyle}>{t('settings.schedules.fieldFreq', { defaultValue: '触发频率' })}</label>
              <select
                id="sf-sched-freq"
                value={formPreset}
                onChange={(e) => setFormPreset(e.target.value as PresetId)}
                style={inputStyle}
              >
                <option value="daily9">{t('settings.schedules.presetDaily9', { defaultValue: '每天 09:00' })}</option>
                <option value="weekdays9">{t('settings.schedules.presetWeekdays9', { defaultValue: '工作日 09:00' })}</option>
                <option value="weeklyMon9">{t('settings.schedules.presetWeeklyMon9', { defaultValue: '每周一 09:00' })}</option>
                <option value="hourly">{t('settings.schedules.presetHourly', { defaultValue: '每小时整点' })}</option>
                <option value="custom">{t('settings.schedules.presetCustom', { defaultValue: '自定义 cron…' })}</option>
                <option value="oneshot">{t('settings.schedules.presetOneshot', { defaultValue: '一次性（指定时间）' })}</option>
              </select>
            </div>

            {formPreset === 'custom' && (
              <div>
                <label style={labelStyle}>cron</label>
                <input
                  value={formCron}
                  onChange={(e) => setFormCron(e.target.value)}
                  placeholder="0 8 * * 1-5"
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                />
              </div>
            )}
            {formPreset === 'oneshot' && (
              <div>
                <label style={labelStyle}>{t('settings.schedules.fieldStartAt', { defaultValue: '触发时间' })}</label>
                <input
                  type="datetime-local"
                  value={formStartAt}
                  onChange={(e) => setFormStartAt(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            <div>
              <label style={labelStyle}>{t('settings.schedules.fieldTask', { defaultValue: '任务指令' })}</label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={t('settings.schedules.taskPlaceholder', { defaultValue: '例如：扫描今天的新商机并生成简报' })}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            {actionError && showForm && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--t-err)' }}>{actionError}</p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={submitting}
                onClick={handleCreate}
                style={{
                  padding: '7px 14px', borderRadius: 6, border: 'none',
                  cursor: submitting ? 'default' : 'pointer',
                  background: 'var(--t-accent)', color: 'var(--t-accent-ink)',
                  fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting
                  ? t('settings.schedules.creating', { defaultValue: '创建中…' })
                  : t('settings.schedules.create', { defaultValue: '创建计划' })}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setActionError(''); }}
                style={{
                  padding: '7px 14px', borderRadius: 6,
                  border: '1px solid var(--t-border)', background: 'transparent',
                  color: 'var(--t-fg-2)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('settings.schedules.cancel', { defaultValue: '取消' })}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 列表 */}
      <div className="hf-card" style={{ padding: 8 }}>
        {loadError ? (
          <p style={{ padding: '24px 12px', margin: 0, fontSize: 12.5, color: 'var(--t-err)', textAlign: 'center' }}>
            {loadError}
          </p>
        ) : schedules === null ? (
          <p style={{ padding: '24px 12px', margin: 0, fontSize: 12.5, color: 'var(--t-fg-4)', textAlign: 'center' }}>
            {t('settings.schedules.loading', { defaultValue: '加载中…' })}
          </p>
        ) : schedules.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '40px 16px', gap: 8,
          }}>
            <CalendarClock size={28} strokeWidth={1.25} color="var(--t-fg-4)" />
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--t-fg-3)' }}>
              {t('settings.schedules.empty', { defaultValue: '还没有定时任务，点击「新建计划」让团队自动开工。' })}
            </p>
          </div>
        ) : (
          schedules.map((s) => {
            const enabled = s.enabled !== false;
            const expanded = runsFor === s.schedule_id;
            return (
              <div
                key={s.schedule_id}
                style={{
                  padding: '10px 12px', borderRadius: 8, marginBottom: 4,
                  border: '1px solid var(--t-border)', background: 'var(--t-bg)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* runs 展开 */}
                  <button
                    type="button"
                    onClick={() => handleToggleRuns(s)}
                    title={t('settings.schedules.runs', { defaultValue: '触发记录' })}
                    style={{
                      display: 'inline-flex', border: 'none', background: 'transparent',
                      cursor: 'pointer', color: 'var(--t-fg-3)', padding: 0,
                    }}
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  <span style={{
                    flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--t-fg)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {s.task_description || t('settings.schedules.untitled', { defaultValue: '（无任务指令）' })}
                  </span>

                  {/* 启用/停用开关 */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => handleToggle(s)}
                    style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.06em', cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${enabled ? 'var(--t-ok)' : 'var(--t-border)'}`,
                      background: enabled ? 'color-mix(in oklab, var(--t-ok) 12%, transparent)' : 'transparent',
                      color: enabled ? 'var(--t-ok)' : 'var(--t-fg-4)',
                    }}
                  >
                    {enabled
                      ? t('settings.schedules.enabled', { defaultValue: '已启用' })
                      : t('settings.schedules.disabled', { defaultValue: '已停用' })}
                  </button>

                  <button
                    type="button"
                    onClick={() => openDelete(s)}
                    title={t('settings.schedules.delete', { defaultValue: '删除' })}
                    style={{
                      width: 22, height: 22, display: 'inline-flex', alignItems: 'center',
                      justifyContent: 'center', borderRadius: 5,
                      border: '1px solid var(--t-border)', background: 'var(--t-panel)',
                      cursor: 'pointer', color: 'var(--t-err)',
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* meta 行：频率 / 目标 / 下次触发 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6, paddingLeft: 22 }}>
                  <span className="hf-mono" style={{ fontSize: 10.5, color: 'var(--t-fg-3)' }}>
                    {s.cron_expression
                      ? s.cron_expression
                      : t('settings.schedules.oneshot', { defaultValue: '一次性' })}
                    {s.completed ? ` · ${t('settings.schedules.completed', { defaultValue: '已完成' })}` : ''}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--t-fg-3)' }}>
                    {t('settings.schedules.target', { defaultValue: '目标' })}: {teamName(s.group_id)}
                    {agentName(s.agent_id) ? ` / ${agentName(s.agent_id)}` : ''}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--t-fg-3)' }}>
                    {t('settings.schedules.nextRun', { defaultValue: '下次触发' })}: {formatTime(s.next_run_time)}
                  </span>
                </div>

                {/* runs 列表 */}
                {expanded && (
                  <div style={{
                    marginTop: 8, marginLeft: 22, padding: '8px 10px',
                    borderRadius: 6, border: '1px dashed var(--t-border)',
                  }}>
                    {runs === null ? (
                      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--t-fg-4)' }}>
                        {t('settings.schedules.loading', { defaultValue: '加载中…' })}
                      </p>
                    ) : runs.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--t-fg-4)' }}>
                        {t('settings.schedules.noRuns', { defaultValue: '尚未触发过' })}
                      </p>
                    ) : (
                      runs.map((r) => (
                        <div key={r.run_id} style={{ display: 'flex', gap: 10, fontSize: 11.5, padding: '2px 0' }}>
                          <span style={{ color: 'var(--t-fg-2)' }}>{formatTime(r.triggered_at)}</span>
                          <span style={{ color: r.status === 'succeeded' ? 'var(--t-ok)' : 'var(--t-err)' }}>
                            {r.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {actionError && !showForm && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--t-err)' }}>{actionError}</p>
      )}

      {/* 删除确认弹窗（2026-11-04 用户反馈批，替换 window.confirm 原生框） */}
      {deleteTarget && (
        <NeoConfirmModal
          title={t('settings.schedules.deleteTitle', { defaultValue: '删除定时任务' })}
          message={t('settings.schedules.deleteConfirm', {
            defaultValue: '确定删除该计划？删除后不再触发。',
          })}
          busy={deleteBusy}
          onConfirm={() => void confirmDelete()}
          onClose={() => {
            if (deleteBusy) return;
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}
