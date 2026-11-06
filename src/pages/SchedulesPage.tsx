/**
 * SchedulesPage — 定时任务管理页（2026-11-06，GrokBot/OpenBot /routines 对齐）。
 *
 * GrokBot 教程「定时任务」章节 + OpenBot /routines surface 的合流：计划不再
 * 只藏在各 Agent 主机卡片里，而是有一个全局管理面——左栏「定时任务」导航行
 * 进入，列表区（rail schedules section）与中栏（本页）同源展示全部计划。
 *
 * 数据源：src/api/schedules.ts → GET /api/schedules（Python 后端，全量列表，
 * 不带过滤参数）。行内操作全部真实 API：
 *   PATCH /api/schedules/:id  — 启停（enabled toggle）
 *   DELETE /api/schedules/:id — 删除（NeoConfirmModal 二次确认）
 * 新建入口收敛在各 Agent 主机卡片（AgentSchedulesPanel）与群聊 /schedule
 * 快捷表单（NeoQuickSchedule）——本页只做「查看 + 管理」，不再造第二套
 * 创建表单（OpenBot 范式：routines 面就是只读列表 + 启停/删除）。
 *
 * 双形态：路由页 /schedules 全页；NeoApp 中栏 `<SchedulesPage embedded />`
 * 内嵌（rail 常驻，对齐 DashboardPage 模式）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CalendarCheck, Plus, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { useI18n } from '../common/i18n';
import {
  deleteSchedule,
  listSchedules,
  patchSchedule,
  type ScheduleRecord,
} from '../api/schedules';
import { listAgents, type AgentRecord } from '../api/agents';
import { AgentAvatar } from '../components/agent/AgentAvatar';
import { NeoConfirmModal } from '../neo/NeoConfirmModal';
import '../neo/neo.css';

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function SchedulesPage({ embedded = false }: { embedded?: boolean }) {
  const { t, language } = useI18n();

  const [schedules, setSchedules] = useState<ScheduleRecord[] | null>(null);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // 启停请求中的计划 id（行内按钮 loading，防止双击重复提交）
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await listSchedules();
      setSchedules(rows);
      setLoadError(null);
    } catch {
      setSchedules([]);
      setLoadError(
        t('neo.schedules.loadFailed', {
          defaultValue: language === 'zh' ? '加载失败，请确认 Python 后端已启动' : 'Failed to load schedules',
        }),
      );
    }
  }, [t, language]);

  useEffect(() => {
    void refresh();
    let alive = true;
    listAgents()
      .then((rows) => {
        if (alive) setAgents(rows);
      })
      .catch(() => {
        /* 头像反查失败静默：行内回退日历图标 */
      });
    return () => {
      alive = false;
    };
  }, [refresh]);

  const agentsById = useMemo(() => {
    const m = new Map<string, AgentRecord>();
    for (const a of agents) m.set(a.agent_id, a);
    return m;
  }, [agents]);

  // 排序：启用在前，其余按下次运行时间升序（null 落尾）
  const sorted = useMemo(() => {
    const rows = [...(schedules ?? [])];
    rows.sort((a, b) => {
      const ea = a.enabled !== false ? 0 : 1;
      const eb = b.enabled !== false ? 0 : 1;
      if (ea !== eb) return ea - eb;
      const na = a.next_run_time ? Date.parse(a.next_run_time) : Infinity;
      const nb = b.next_run_time ? Date.parse(b.next_run_time) : Infinity;
      return na - nb;
    });
    return rows;
  }, [schedules]);

  const handleToggle = useCallback(
    async (s: ScheduleRecord) => {
      setActionError(null);
      setToggleBusyId(s.schedule_id);
      try {
        await patchSchedule(s.schedule_id, { enabled: s.enabled === false });
        await refresh();
      } catch {
        setActionError(
          t('neo.schedules.toggleFailed', {
            defaultValue: language === 'zh' ? '切换启用状态失败' : 'Failed to toggle schedule',
          }),
        );
      } finally {
        setToggleBusyId(null);
      }
    },
    [refresh, t, language],
  );

  // 删除确认弹窗（对齐 NeoRail 管理面模式：NeoConfirmModal 二次确认）
  const [deleteTarget, setDeleteTarget] = useState<ScheduleRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const confirmDelete = useCallback(async () => {
    const s = deleteTarget;
    if (!s) return;
    setDeleteBusy(true);
    setActionError(null);
    try {
      await deleteSchedule(s.schedule_id);
      setDeleteTarget(null);
      await refresh();
    } catch {
      setActionError(
        t('neo.schedules.deleteFailed', {
          defaultValue: language === 'zh' ? '删除失败' : 'Failed to delete schedule',
        }),
      );
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, refresh, t, language]);

  // 归属 agent 名字徽标（被动展示，不做跳转——对齐 Dashboard/Memory/Knowledge
  // 嵌入页「内容阅读态无路由跳转」约定；计划触发结果本身回传在 DM 会话流）。
  const agentBadge = (a: AgentRecord | null) =>
    a ? (
      <span
        className="neo-sched-agent"
        title={t('neo.schedules.belongAgent', {
          defaultValue: language === 'zh' ? `归属：${a.name}` : `Owned by ${a.name}`,
        })}
        data-testid="neo-schedules-agent-badge"
      >
        {a.name}
      </span>
    ) : null;

  return (
    <div
      className={embedded ? 'neo-page-embedded' : 'neo-page-full'}
      data-testid="neo-schedules-page"
      style={{ padding: embedded ? '20px 24px' : '32px', overflowY: 'auto', height: '100%' }}
    >
      <header className="neo-sched-head">
        <h2 className="neo-sched-title">
          <CalendarClock size={18} strokeWidth={1.75} aria-hidden />
          {t('neo.schedules.title', { defaultValue: language === 'zh' ? '定时任务' : 'Schedules' })}
        </h2>
        <p className="neo-sched-sub">
          {t('neo.schedules.subtitle', {
            defaultValue:
              language === 'zh'
                ? '全部 Agent 的周期与一次性计划。新建入口在各 Agent 主机卡片的「定时任务」区块。'
                : 'All recurring and one-shot plans. Create new ones from each Agent host card.',
          })}
        </p>
      </header>

      {loadError && (
        <div className="neo-list-note neo-list-error" role="alert">
          <span className="neo-list-error-text">{loadError}</span>
        </div>
      )}
      {actionError && (
        <div className="neo-list-note neo-list-error" role="alert">
          <span className="neo-list-error-text">{actionError}</span>
        </div>
      )}

      {schedules === null && !loadError ? (
        <p style={{ fontSize: 13, opacity: 0.55 }}>
          {t('common.loading', { defaultValue: '加载中…' })}
        </p>
      ) : sorted.length === 0 ? (
        <div className="neo-sched-empty" data-testid="neo-schedules-empty">
          <CalendarCheck size={28} strokeWidth={1.5} aria-hidden />
          <p>
            {t('neo.schedules.empty', {
              defaultValue:
                language === 'zh'
                  ? '还没有定时任务。到 Agent 主机卡片或会话里用 /schedule 建一个，让 TA 按点开工。'
                  : 'No schedules yet. Create one from an Agent host card or /schedule in chat.',
            })}
          </p>
        </div>
      ) : (
        <div className="neo-sched-list" role="list">
          {sorted.map((s) => {
            const enabled = s.enabled !== false;
            const agent = s.agent_id ? agentsById.get(s.agent_id) ?? null : null;
            const runCount = s.runs?.length ?? 0;
            return (
              <div
                key={s.schedule_id}
                className="neo-sched-row"
                role="listitem"
                data-testid="neo-schedules-row"
                data-enabled={enabled}
              >
                <span className="neo-sched-avatar">
                  {agent ? (
                    <AgentAvatar
                      name={agent.name}
                      style={agent.avatar_style}
                      seed={agent.avatar_seed ?? agent.name}
                      image={agent.avatar_image ?? null}
                      size={32}
                    />
                  ) : (
                    <span className="neo-avatar" style={{ background: '#71717A' }} aria-hidden>
                      <CalendarClock size={15} strokeWidth={1.75} />
                    </span>
                  )}
                </span>
                <span className="neo-sched-text">
                  <span className="neo-sched-name" title={s.task_description}>
                    {s.task_description || t('neo.schedules.untitled', { defaultValue: '（无任务指令）' })}
                  </span>
                  <span className="neo-sched-meta">
                    <span className="neo-sched-cron">
                      {s.cron_expression ||
                        t('neo.schedules.oneshot', { defaultValue: '一次性' })}
                    </span>
                    <span className="neo-sched-dot">·</span>
                    <span>
                      {t('neo.schedules.nextRun', { defaultValue: '下次' })}:{fmtTime(s.next_run_time)}
                    </span>
                    {runCount > 0 && (
                      <>
                        <span className="neo-sched-dot">·</span>
                        <span>
                          {t('neo.schedules.runCount', { defaultValue: '已跑' })} {runCount}
                        </span>
                      </>
                    )}
                    {s.completed && (
                      <>
                        <span className="neo-sched-dot">·</span>
                        <span>
                          {t('neo.schedules.completed', { defaultValue: '已完成' })}
                        </span>
                      </>
                    )}
                  </span>
                </span>
                {agentBadge(agent)}
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={toggleBusyId === s.schedule_id}
                  onClick={() => void handleToggle(s)}
                  className="neo-sched-toggle"
                  data-testid="neo-schedules-toggle"
                  title={enabled
                    ? t('neo.schedules.disable', { defaultValue: language === 'zh' ? '停用' : 'Disable' })
                    : t('neo.schedules.enable', { defaultValue: language === 'zh' ? '启用' : 'Enable' })}
                >
                  {enabled ? (
                    <ToggleRight size={20} strokeWidth={1.75} aria-hidden />
                  ) : (
                    <ToggleLeft size={20} strokeWidth={1.75} aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  className="neo-icon-btn"
                  onClick={() => setDeleteTarget(s)}
                  title={t('common.delete', { defaultValue: language === 'zh' ? '删除' : 'Delete' })}
                  data-testid="neo-schedules-delete"
                >
                  <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 底部提示：新建入口指引（不在本页造第二套创建表单） */}
      {sorted.length > 0 && (
        <p className="neo-sched-footnote">
          <Plus size={12} strokeWidth={1.75} aria-hidden />
          {t('neo.schedules.footnote', {
            defaultValue:
              language === 'zh'
                ? '新建：点左侧会话行头像进 Agent 主机卡片，或在会话输入 /schedule'
                : 'Create: click an avatar in the sidebar for the Agent host, or type /schedule in chat',
          })}
        </p>
      )}

      {deleteTarget && (
        <NeoConfirmModal
          title={t('neo.schedules.deleteTitle', {
            defaultValue: language === 'zh' ? '删除定时任务' : 'Delete schedule',
          })}
          message={t('neo.schedules.deleteConfirm', {
            defaultValue: language === 'zh'
              ? '确定删除该计划？删除后不再触发。'
              : 'Delete this schedule? It will no longer fire.',
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

export default SchedulesPage;
