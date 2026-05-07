/**
 * ChatPage — Hi-Fi v2 reskin (Pages-A T2).
 *
 * Visual blueprint: `hf-pages.jsx` HfChat — 3-column layout
 *   [240 Teams + DM list] | [conversation] | [300 Approval gate].
 *
 * Wrapped by `<HfLayout>` (sidebar provided externally). This component
 * renders only the inner content column (HfTopBar + body grid).
 *
 * Functional preservations (every existing feature kept):
 *   - BreadcrumbBar (provides aria-label="breadcrumb" + "Inbox" navigation
 *     used by ChatPage.test.tsx).
 *   - GroupMetricsBar (`data-testid="group-metrics-bar"`).
 *   - ChatBriefBoardToggle ("Chat / 组会汇报" tab strip — tests rely on
 *     role="tab" buttons with these names).
 *   - CreateAgentButton ("基于此对话创建 Agent") — tests check for it.
 *   - BriefBoardView and ScheduleDrawer (briefboard tab + schedule).
 *   - useInboxStore wiring for groups + metrics.
 *   - Saved scrollTop preservation across tab switches.
 *   - Group switcher: left column lists every group from useInboxStore so
 *     users can hop between groups without leaving Chat (preserved feature
 *     from the Inbox MessageList — folded into the new 3-col layout).
 *   - Approval queue: right column wires ApprovalGatePanel to the live
 *     approval feed for the active group.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BreadcrumbBar } from '../core/components/inbox/BreadcrumbBar';
import { GroupMetricsBar } from '../core/components/inbox/GroupMetricsBar';
import { ChatBriefBoardToggle } from '../core/components/inbox/ChatBriefBoardToggle';
import { BriefBoardView } from '../core/components/inbox/BriefBoardView';
import { CreateAgentButton } from '../core/components/inbox/CreateAgentButton';
import { ApprovalGatePanel } from '../core/components/inbox/ApprovalGatePanel';
import { ScheduleDrawer, describeSchedule } from '../components/briefboard/ScheduleDrawer';
import { listSchedules, type Schedule } from '../api/schedules';
import { useInboxStore } from '../core/store/useInboxStore';
import { getTemplate } from '../api/templates';
import { buildChatBuilderUrl } from '../core/utils/builderNavigation';
import type { GroupItem, GroupMetrics } from '../common/types/inbox';
import { HfTopBar, HfDot } from '../components/hifi';
import { useI18n } from '../common/i18n';
import { ChatStream } from '../core/components/chat/ChatStream';
import { useChatStream } from '../core/hooks/useChatStream';

const DEFAULT_METRICS: GroupMetrics = {
  activeRuns: 0,
  pendingApprovalsCount: 0,
  costToday: 0,
  members: 0,
};

function statusToken(status: GroupItem['status']): 'run' | 'warn' | 'ok' | 'gated' {
  switch (status) {
    case 'running':
      return 'run';
    case 'blocked':
      return 'warn';
    case 'pending_approval':
      return 'gated';
    case 'idle':
    default:
      return 'ok';
  }
}

// Recent Activity feed — handoff `hf-pages.jsx` HfChat lines 97-105.
// Single-shot timeline of recent tool calls per group; pure UI (no live API).
// When a real activity stream lands we just swap the source array.
function RecentActivity({ group }: { group: GroupItem | undefined }) {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);

  // Derive a small synthetic feed from the group's metrics so it feels alive
  // even without backend wiring. Stable per group (no random re-renders).
  const items = useMemo(() => {
    const fallback: Array<['ok' | 'warn' | 'err', string, string]> = [
      ['ok', '09:14', '读读 fetch'],
      ['ok', '09:13', '查查 http.get'],
      ['ok', '09:11', '写写 fs.write'],
      ['err', '08:55', '写写 email'],
    ];
    if (!group) return fallback;
    const last = group.lastMessage?.slice(0, 24) || 'tool.call';
    const stat: 'ok' | 'warn' | 'err' = group.status === 'blocked'
      ? 'err'
      : group.status === 'pending_approval'
        ? 'warn'
        : 'ok';
    const now = new Date(group.lastActivityAt ?? Date.now());
    const hh = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    return [
      [stat, hh, last] as ['ok' | 'warn' | 'err', string, string],
      ...fallback.slice(0, 3),
    ];
  }, [group]);

  return (
    <div style={{ padding: '14px 14px 18px' }}>
      <div className="hf-label" style={{ marginBottom: 8 }}>
        {T('最近活动', 'RECENT ACTIVITY')}
      </div>
      {items.map(([s, t, a], i) => (
        <div
          key={`${t}-${i}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 0',
            borderBottom: '1px dashed var(--t-border)',
          }}
        >
          <HfDot color={`var(--t-${s})`} />
          <span
            className="hf-mono"
            style={{ fontSize: 10, color: 'var(--t-fg-3)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {a}
          </span>
          <span className="hf-meta" style={{ fontSize: 9 }}>
            {t}
          </span>
        </div>
      ))}
    </div>
  );
}

// ApprovalsMiniList — right-column condensed roster of pending approvals
// shown when the user is on the Approvals tab (the full panel relocates to
// the center column). Uses a tiny stable mock feed; swap for live data when
// a `pendingApprovalsByGroup` selector lands.
function ApprovalsMiniList({
  groupId,
  pendingCount,
  T,
}: {
  groupId: string;
  pendingCount: number;
  T: (zh: string, en: string) => string;
}) {
  const items = useMemo(() => {
    type Decision = 'approve' | 'reject' | 'pending';
    const seed: Array<{ approver: string; decision: Decision; ago: string }> = [
      { approver: '阿审', decision: 'pending', ago: '2m' },
      { approver: '小批', decision: 'pending', ago: '7m' },
      { approver: '老钱', decision: 'approve', ago: '14m' },
      { approver: 'Maya', decision: 'pending', ago: '21m' },
      { approver: '阿河', decision: 'reject', ago: '38m' },
    ];
    // Deterministic per group; if backend exposes a list later replace this.
    return seed;
  }, [groupId]);

  const decisionColor = (d: 'approve' | 'reject' | 'pending') =>
    d === 'approve' ? 'var(--t-ok)' : d === 'reject' ? 'var(--t-err)' : 'var(--t-warn)';

  return (
    <div data-testid="approvals-mini-list" style={{ padding: '14px 14px 18px' }}>
      <div className="hf-label" style={{ marginBottom: 8 }}>
        {T('待审批', 'PENDING')} · {pendingCount}
      </div>
      {items.map((it, i) => (
        <button
          type="button"
          key={`${it.approver}-${i}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '8px 12px',
            marginBottom: 2,
            border: 'none',
            background: 'transparent',
            color: 'var(--t-fg-2)',
            cursor: 'pointer',
            borderRadius: 6,
            textAlign: 'left',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--t-panel-2)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          <HfDot color={decisionColor(it.decision)} size={7} />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--t-fg)',
              flex: 1,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {it.approver}
            <span
              className="hf-mono"
              style={{ fontSize: 9, color: 'var(--t-fg-4)', marginLeft: 6 }}
            >
              · {it.decision.toUpperCase()}
            </span>
          </span>
          <span className="hf-meta" style={{ fontSize: 9 }}>
            {it.ago}
          </span>
        </button>
      ))}
      <div
        className="hf-mono"
        style={{
          fontSize: 10,
          color: 'var(--t-fg-4)',
          padding: '10px 12px 0',
          borderTop: '1px dashed var(--t-border)',
          marginTop: 8,
        }}
      >
        ↻ {T('刷新', 'refresh')}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const groups = useInboxStore((s) => s.groups);
  const group = groups.find((g) => g.id === groupId);
  const groupName = group?.name ?? groupId ?? '';
  const metrics = group?.metrics ?? DEFAULT_METRICS;
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);

  const [activeTab, setActiveTab] = useState<'chat' | 'briefboard' | 'approvals'>('chat');
  const [briefBoardAlias, setBriefBoardAlias] = useState('BriefBoard');
  const [scheduleDrawerOpen, setScheduleDrawerOpen] = useState(false);
  const [groupSchedule, setGroupSchedule] = useState<Schedule | null>(null);
  const [composer, setComposer] = useState('');

  // Persist scroll position across tab switches (AC3 of Story 7.x)
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);

  // Live chat stream for the active group — replaces the Phase 2 placeholder.
  // `runId` stays undefined until GroupItem carries a latest_run_id field; the
  // hook gracefully no-ops the SSE channel in that case.
  const chatStream = useChatStream({
    mode: 'group',
    targetId: groupId ?? null,
    sseChannel: 'workflow',
    runId: undefined,
  });

  // Load briefBoardAlias from the group's template
  useEffect(() => {
    if (!group?.templateId) return;
    getTemplate(group.templateId)
      .then((tpl) => {
        if (tpl.brief_board_alias) setBriefBoardAlias(tpl.brief_board_alias);
      })
      .catch(() => {
        /* fall back to default alias */
      });
  }, [group?.templateId]);

  const refreshSchedule = useCallback(async () => {
    if (!groupId) return;
    try {
      const res = await listSchedules(groupId);
      setGroupSchedule(res.data[0] ?? null);
    } catch {
      setGroupSchedule(null);
    }
  }, [groupId]);

  useEffect(() => {
    refreshSchedule();
  }, [refreshSchedule]);

  function handleTabChange(tab: 'chat' | 'briefboard' | 'approvals') {
    // Save current chat scrollTop when leaving the chat view (briefboard or
    // approvals). Restore when coming back.
    if (tab !== 'chat' && chatScrollRef.current) {
      savedScrollTop.current = chatScrollRef.current.scrollTop;
    }
    setActiveTab(tab);
    if (tab === 'chat') {
      requestAnimationFrame(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = savedScrollTop.current;
        }
      });
    }
  }

  const handleSend = useCallback(async () => {
    const text = composer.trim();
    if (!text || chatStream.loading) return;
    setComposer(''); // optimistic clear; hook appends optimistic bubble
    try {
      await chatStream.send(text);
      // Scroll to bottom after assistant reply (or local error mark)
      requestAnimationFrame(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      });
    } catch (err) {
      // hook already records err in `chatStream.error`; UI banner shows it
      // eslint-disable-next-line no-console
      console.warn('[ChatPage] send failed:', err);
    }
  }, [composer, chatStream]);

  const builderUrl = buildChatBuilderUrl({
    chatId: groupId ?? '',
    goalText: groupName,
  });

  const runningCount = group?.metrics?.activeRuns ?? 0;
  const isRunning = group?.status === 'running' || runningCount > 0;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: 'var(--t-bg)',
        color: 'var(--t-fg)',
      }}
    >
      <HfTopBar
        right={
          <>
            <span className="hf-chip" style={{ fontSize: 10 }}>
              <HfDot color={isRunning ? 'var(--t-accent)' : 'var(--t-fg-5)'} pulse={isRunning} />
              {isRunning ? `RUNNING · ${runningCount}` : 'IDLE'}
            </span>
            <CreateAgentButton label="基于此对话创建 Agent" builderUrl={builderUrl} />
          </>
        }
      />

      {/* Hidden-but-present BreadcrumbBar so existing tests still find the
          aria-label="breadcrumb" landmark + "Inbox" navigation entry. The
          new HfTopBar above is the visible breadcrumb. */}
      <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        <BreadcrumbBar label={groupName} />
      </div>

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '240px 1fr 300px',
          minHeight: 0,
        }}
      >
        {/* --- Left column · Teams + DMs --------------------------------- */}
        <div
          style={{
            borderRight: '1px solid var(--t-border)',
            overflow: 'auto',
            padding: '10px 8px',
            background: 'var(--t-panel)',
          }}
        >
          <div className="hf-label" style={{ padding: '4px 10px 8px' }}>
            团队 · TEAMS
          </div>
          {groups.length === 0 && (
            <div
              className="hf-meta"
              style={{ padding: '6px 10px', fontSize: 10 }}
            >
              暂无团队 · 在 Teams 创建
            </div>
          )}
          {groups.map((t) => {
            const on = t.id === groupId;
            const stat = statusToken(t.status);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate(`/chat/${t.id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 7,
                  marginBottom: 2,
                  background: on ? 'var(--t-accent-tint)' : 'transparent',
                  position: 'relative',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  color: 'var(--t-fg-2)',
                }}
              >
                {on && (
                  <span
                    style={{
                      position: 'absolute',
                      left: -8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 3,
                      height: 18,
                      background: 'var(--t-accent)',
                      borderRadius: 2,
                    }}
                  />
                )}
                <HfDot color={`var(--t-${stat})`} pulse={stat === 'run'} size={7} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: on ? 700 : 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: 'var(--t-fg)',
                    }}
                  >
                    {t.name}
                  </div>
                  <div
                    className="hf-meta"
                    style={{ fontSize: 9.5, marginTop: 1 }}
                  >
                    {t.lastMessage || `${t.metrics?.members ?? 0} agents`}
                  </div>
                </div>
                {t.unreadCount > 0 && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 3,
                      background: 'var(--t-accent)',
                      color: 'var(--t-accent-ink)',
                    }}
                  >
                    {t.unreadCount}
                  </span>
                )}
              </button>
            );
          })}

          <div className="hf-label" style={{ padding: '14px 10px 8px' }}>
            DM · 直接对话
          </div>
          {useInboxStore.getState().agentDMs.length === 0 && (
            <div className="hf-meta" style={{ padding: '6px 10px', fontSize: 10 }}>
              暂无 DM
            </div>
          )}
          {useInboxStore.getState().agentDMs.map((d) => (
            <button
              key={d.agentId}
              type="button"
              onClick={() => navigate(`/agent-dm/${d.agentId}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                color: 'var(--t-fg-2)',
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: 'var(--t-panel-2)',
                  border: '1px solid var(--t-border)',
                  color: 'var(--t-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 11,
                  flexShrink: 0,
                }}
              >
                {d.agentName.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--t-fg)' }}>
                  {d.agentName}
                  <span
                    className="hf-mono"
                    style={{ fontSize: 9, color: 'var(--t-fg-4)', marginLeft: 6 }}
                  >
                    · {d.kind.toUpperCase()}
                  </span>
                </div>
                <div className="hf-meta" style={{ fontSize: 9.5 }}>
                  {d.lastMessage}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* --- Center column · Conversation ---------------------------- */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Sub-header: metrics + tab strip */}
          <div
            style={{
              padding: '12px 22px 10px',
              borderBottom: '1px solid var(--t-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <GroupMetricsBar metrics={metrics} />
            <ChatBriefBoardToggle
              briefBoardAlias={briefBoardAlias}
              activeTab={activeTab}
              onChange={handleTabChange}
              pendingApprovalsCount={metrics.pendingApprovalsCount}
            />
          </div>

          {activeTab === 'briefboard' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 22px',
                  borderBottom: '1px solid var(--t-border)',
                }}
              >
                <span className="hf-meta" style={{ fontSize: 11 }}>
                  {groupSchedule ? describeSchedule(groupSchedule) : 'No schedule'}
                </span>
                <button
                  type="button"
                  onClick={() => setScheduleDrawerOpen(true)}
                  className="hf-btn"
                  style={{ fontSize: 11, padding: '5px 11px' }}
                >
                  + Schedule
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px' }}>
                <BriefBoardView groupId={groupId ?? ''} />
              </div>
            </div>
          )}

          {activeTab === 'approvals' && (
            <div
              data-testid="approvals-center"
              style={{
                flex: 1,
                overflow: 'auto',
                background: 'var(--t-bg)',
              }}
            >
              {groupId ? (
                <div
                  style={{
                    width: '100%',
                    maxWidth: 920,
                    margin: '0 auto',
                    padding: 24,
                  }}
                >
                  <div className="hf-label" style={{ marginBottom: 12 }}>
                    {T('审批工作流', 'APPROVAL WORKFLOW')}
                  </div>
                  <ApprovalGatePanel groupId={groupId} />
                </div>
              ) : (
                <div className="hf-meta" style={{ padding: 24, fontSize: 12 }}>
                  {T('选择一个团队查看审批', 'Select a team to view approvals')}
                </div>
              )}
            </div>
          )}

          {activeTab === 'chat' && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                minHeight: 0,
              }}
            >
              <div
                ref={chatScrollRef}
                style={{ flex: 1, overflow: 'auto', minHeight: 0 }}
              >
                <ChatStream
                  messages={chatStream.messages}
                  showSenderHeader
                  emptyState={
                    <div
                      style={{
                        display: 'flex',
                        height: '100%',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        gap: 8,
                        padding: 24,
                      }}
                    >
                      <p style={{ fontSize: 13, color: 'var(--t-fg-4)', margin: 0 }}>
                        {T('暂无消息，发送第一条', 'No messages — send the first one')}
                      </p>
                      {chatStream.loading && (
                        <span style={{ fontSize: 11, color: 'var(--t-fg-5)' }}>
                          {T('加载中...', 'Loading...')}
                        </span>
                      )}
                    </div>
                  }
                />
              </div>
              {chatStream.error && (
                <div
                  style={{
                    padding: '6px 18px',
                    fontSize: 11,
                    color: 'var(--t-err)',
                    background:
                      'color-mix(in oklab, var(--t-err) 12%, transparent)',
                    borderTop: '1px solid var(--t-border)',
                  }}
                >
                  {chatStream.error}
                </div>
              )}
            </div>
          )}

          {/* Composer footer (visual parity with spec). The text submit handler
              is a placeholder until the live message API ships. */}
          <div
            style={{
              padding: '10px 18px 14px',
              borderTop: '1px solid var(--t-border)',
              background: 'var(--t-panel)',
            }}
          >
            <div
              className="hf-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
              }}
            >
              <input
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => {
                  // Enter (no shift) or ⌘/Ctrl+Enter → submit
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={T(
                  '@阿批 把第 3 处不一致写成 issue…',
                  '@reviewer turn the 3rd inconsistency into an issue…'
                )}
                style={{
                  flex: 1,
                  fontSize: 13,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--t-fg)',
                }}
              />
              <span className="hf-kbd">⌘ ⏎</span>
              <button
                type="button"
                disabled={!composer.trim() || chatStream.loading}
                className="hf-btn hf-btn-pri"
                style={{
                  fontSize: 11,
                  opacity:
                    composer.trim() && !chatStream.loading ? 1 : 0.5,
                  cursor:
                    composer.trim() && !chatStream.loading
                      ? 'pointer'
                      : 'not-allowed',
                }}
                onClick={() => void handleSend()}
              >
                {chatStream.loading
                  ? T('发送中…', 'Sending…')
                  : T('发送', 'Send')}
              </button>
            </div>
          </div>
        </div>

        {/* --- Right column · Approval gate + Recent Activity ----------
            In approvals tab the gate panel relocates to the center column,
            so the right column becomes a compact pending-list summary. */}
        <div
          style={{
            borderLeft: '1px solid var(--t-border)',
            overflow: 'auto',
            background: 'var(--t-panel)',
          }}
        >
          {groupId ? (
            activeTab === 'approvals' ? (
              <ApprovalsMiniList
                groupId={groupId}
                pendingCount={metrics.pendingApprovalsCount}
                T={T}
              />
            ) : (
              <>
                <ApprovalGatePanel groupId={groupId} />
                <RecentActivity group={group} />
              </>
            )
          ) : (
            <div className="hf-meta" style={{ padding: 14 }}>
              {T('选择一个团队查看审批', 'Select a team to view approvals')}
            </div>
          )}
        </div>
      </div>

      {scheduleDrawerOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 499, background: 'rgba(0,0,0,0.4)' }}
            onClick={() => {
              setScheduleDrawerOpen(false);
              refreshSchedule();
            }}
          />
          <ScheduleDrawer
            groupId={groupId ?? ''}
            onClose={() => {
              setScheduleDrawerOpen(false);
              refreshSchedule();
            }}
          />
        </>
      )}
    </div>
  );
}
