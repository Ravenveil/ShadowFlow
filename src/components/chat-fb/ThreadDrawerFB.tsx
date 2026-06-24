/**
 * ThreadDrawerFB · 右侧 Thread / 任务 / 文档 / Brief 抽屉（FB-HiFi 风）
 * 对照 _evidence/design-pkg-2026-05-28/chat-fb.html
 *   - CSS : 行 599-818（drawer / dr-tabs / dr-pane / dr-replies / dr-tasks / dr-docs / dr-brief / dr-actbar）
 *   - HTML: 行 1313-1556
 *
 * 数据来源：
 *   - Thread:  fetchRecentMessages(groupId) — 复用旧 ChatDrawer 的接线
 *              （Stream G）头部源消息预览 + 底部 mini composer 支持「同时发到主频道」勾选
 *   - 任务:    ApprovalGatePanel（沿用 Epic 4 已有组件）
 *   - 文档:    Stream G 落 3 个 mock 文件（等 /api/groups/{id}/docs endpoint 上线后切真实数据）
 *   - Brief:   BriefBoardView
 */

import { useEffect, useState } from 'react';
import { X, Pencil, Plus, User } from 'lucide-react';
import { useResizableWidth } from '../../core/hooks/useResizableWidth';
import { paletteFor, initialOf } from './agentAvatar';
import { RightPaneTabs } from '../run-session/RightPaneTabs';
import { ApprovalGatePanel } from '../../core/components/inbox/ApprovalGatePanel';
import { BriefBoardView } from '../../core/components/inbox/BriefBoardView';
import { AgentWorkspacePane } from '../../pages/chat-home/AgentWorkspacePane';
import { fetchRecentMessages } from '../../api/groupApi';
import type { GroupItem, GroupMetrics, Message } from '../../common/types/inbox';
import styles from './chatFB.module.css';

type DrawerTab = 'thread' | 'work' | 'tasks' | 'brief';

export interface ThreadSourceMessage {
  id: string;
  senderName: string;
  senderAvatar?: string;
  excerpt: string;
  timestamp?: string;
}

export interface ThreadDrawerFBProps {
  groupId?: string;
  group?: GroupItem;
  metrics: GroupMetrics;
  /** Stream G — 源消息预览。不传则不渲染（向后兼容）。 */
  sourceMessage?: ThreadSourceMessage;
  /** Stream G — 回复提交。返回 Promise，组件根据 await 状态切 loading。 */
  onReplySubmit?: (text: string, postToMain: boolean) => Promise<void>;
  t?: (k: string, opts?: Record<string, unknown>) => string;
  onClose?: () => void;
  /**
   * Stream L 2026-05-28 · 当某个 agent 正在 thread 内输入时填它名字。
   * 传 undefined / 空字符串则不显示 dr-typing 行（设计稿 v7 line 1546）。
   */
  typingAgentName?: string;
  /**
   * Stream L 2026-05-28 · 0G 同步状态显示在 dr-comp 右下（v7 line 1559）。
   * 不传则隐藏角标。传 { synced: true, txHash: "0x3f7a…bc91" } 显示绿点 + mono 文本。
   */
  syncStatus?: { synced: boolean; txHash?: string };
}

// 头像配色统一从 agentAvatar 取（单一事实来源，跨页面同 agent 同色）

// 2026-06-24 — 删除 Mock docs（Stream G）整段：MockDoc 类型 / MOCK_DOCS 假数据 /
// docIcon / docTypeChip。DOCS pane 改为空态，等 GET /api/groups/{id}/docs 上线后接真数据。

export function ThreadDrawerFB({
  groupId,
  group,
  metrics,
  sourceMessage,
  onReplySubmit,
  t,
  onClose,
  typingAgentName,
  syncStatus,
}: ThreadDrawerFBProps) {
  const tr = (k: string, fb: string) => {
    if (!t) return fb;
    const v = t(k);
    return v && v !== k ? v : fb;
  };
  const [tab, setTab] = useState<DrawerTab>('thread');
  const [threads, setThreads] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // 可拖拽宽度（与 PersonalRightPane 共享同一 localStorage key）
  const { width: drawerWidth, dragging: drawerDragging, onDragStart: drawerDragStart } = useResizableWidth('sf-rightpane-w', 360, { min: 280, max: 720 });

  // Stream G — composer state
  const [replyText, setReplyText] = useState('');
  const [postToMain, setPostToMain] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!groupId || tab !== 'thread') return;
    setLoading(true);
    fetchRecentMessages(groupId, 12)
      .then(setThreads)
      .catch(() => setThreads([]))
      .finally(() => setLoading(false));
  }, [groupId, tab]);

  const tabs: Array<{ k: DrawerTab; label: string; n?: number }> = [
    { k: 'thread', label: 'Thread' },
    { k: 'work', label: tr('chat.tabWork', '工作区') },
    { k: 'tasks', label: tr('chat.tabTasks', '任务'), n: metrics.pendingApprovalsCount },
    { k: 'brief', label: 'Brief' },
  ];

  // Stream G — 提交回复
  const handleReplySubmit = async () => {
    const text = replyText.trim();
    if (!text || !onReplySubmit || sending) return;
    setSending(true);
    try {
      await onReplySubmit(text, postToMain);
      setReplyText('');
    } catch {
      // 让父组件用自己的 toast / 错误条提示；这里不静默吞但也不强弹
    } finally {
      setSending(false);
    }
  };

  // M3a 三栏融合 — 四个 pane 构造成 JSX 常量，交给共享 RightPaneTabs shell
  // 渲染（与 run-session / 个人态右栏同一框架）。内容零改动。

  // THREAD pane
  const threadPane = (
        <div className={styles.drPane}>
          {/* Stream G — dr-ctx 源消息预览（如果父组件传了 sourceMessage） */}
          {sourceMessage && (
            <div className={styles.drCtx}>
              <div className={styles.drCtxRow}>
                <span
                  className={styles.drCtxAv}
                  style={(() => {
                    const p = paletteFor(sourceMessage.senderName);
                    return {
                      background: p.bg,
                      borderColor: p.border,
                      color: p.fg,
                    };
                  })()}
                >
                  {initialOf(sourceMessage.senderName)}
                </span>
                <div className={styles.drCtxBody}>
                  <div className={styles.drCtxHead}>
                    <span className={styles.drCtxNm}>{sourceMessage.senderName}</span>
                    {sourceMessage.timestamp && (
                      <span className={styles.drCtxMeta}>
                        {new Date(sourceMessage.timestamp).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                  <div className={styles.drCtxExcerpt}>
                    {sourceMessage.excerpt.length > 80
                      ? sourceMessage.excerpt.slice(0, 80) + '…'
                      : sourceMessage.excerpt}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!groupId ? (
            <div className={styles.drEmpty}>{tr('chat.pickTeamFirst', '请先选择一个群组')}</div>
          ) : loading ? (
            <div className={styles.drEmpty}>{tr('common.loading', '加载中…')}</div>
          ) : threads.length === 0 ? (
            <div className={styles.drEmpty}>{tr('chat.noMessages', '暂无消息')}</div>
          ) : (
            <>
              {!sourceMessage && (
                <div className={styles.drCtx}>
                  <div className={styles.drCtxCount}>
                    {threads.length} 条消息 · {group?.metrics?.members ?? 0} 人
                  </div>
                </div>
              )}
              <div className={styles.drReplies}>
                {threads.map((msg, i) => {
                  const isUser = msg.sender_kind === 'user';
                  const p = paletteFor(msg.sender_name ?? String(i));
                  return (
                    <div
                      key={i}
                      className={`${styles.drReply} ${isUser ? styles.drReplyUser : styles.drReplyAgent}`}
                    >
                      <span
                        className={styles.drAv}
                        style={{
                          background: p.bg,
                          borderColor: p.border,
                          color: p.fg,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {isUser ? <User size={14} strokeWidth={2} aria-hidden /> : initialOf(msg.sender_name)}
                      </span>
                      <div
                        className={styles.drReplyBody}
                        style={isUser ? undefined : { borderLeftColor: p.accent }}
                      >
                        <div className={styles.drReplyHd}>
                          <span className={styles.drReplyNm}>{msg.sender_name ?? 'Unknown'}</span>
                          {!isUser && (
                            <span
                              className={styles.drReplyAg}
                              style={{
                                color: p.fg,
                                background: `color-mix(in oklab, ${p.accent} 15%, transparent)`,
                              }}
                            >
                              AGENT
                            </span>
                          )}
                          <span className={styles.drReplyT}>
                            {msg.timestamp
                              ? new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </span>
                        </div>
                        {isUser ? (
                          <div className={styles.drReplyBubble}>{msg.content ?? ''}</div>
                        ) : (
                          <div className={styles.drReplyTxt}>{msg.content ?? ''}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Stream L 2026-05-28 — dr-typing 行 (v7 line 1546)
              当 typingAgentName 在场时显示「—— Agent 正在输入 ⋯ ——」（mono 9px，置中） */}
          {typingAgentName && (
            <div className={styles.drTyping}>
              <span>
                {tr(
                  'chat.threadTyping',
                  `—— ${typingAgentName} 正在输入 ⋯ ——`,
                )}
              </span>
            </div>
          )}

          {/* Stream G — dr-comp 底部 mini composer */}
          {groupId && onReplySubmit && (
            <div className={styles.drComp}>
              <textarea
                className={styles.drCompInput}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder={tr('chat.replyPlaceholder', '回复 thread…（Cmd+Enter 发送）')}
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void handleReplySubmit();
                  }
                }}
                disabled={sending}
                rows={2}
              />
              <div className={styles.drCompOpts}>
                <label className={styles.drCompCheck}>
                  <input
                    type="checkbox"
                    checked={postToMain}
                    onChange={e => setPostToMain(e.target.checked)}
                    disabled={sending}
                  />
                  <span>{tr('chat.alsoPostToMain', '同时发到主频道')}</span>
                </label>
                {/* Stream L 2026-05-28 — 0G synced 角标 (v7 line 1559)
                    syncStatus 不传时此 span 完全不渲染 */}
                {syncStatus && (
                  <span className={styles.drCompSyncRight}>
                    {syncStatus.synced && <span className={styles.drCompSyncDot} aria-hidden />}
                    <span className={styles.drCompSyncText}>
                      {syncStatus.synced ? '0G synced' : '0G pending'}
                      {syncStatus.txHash ? ` · ${syncStatus.txHash}` : ''}
                    </span>
                  </span>
                )}
                <button
                  className={styles.drCompSend}
                  type="button"
                  onClick={handleReplySubmit}
                  disabled={sending || !replyText.trim()}
                >
                  {sending ? tr('common.sending', '发送中…') : tr('common.send', '发送')}
                </button>
              </div>
            </div>
          )}
        </div>
  );

  // TASKS pane — 复用 ApprovalGatePanel
  const tasksPane = (
        <div className={styles.drPane}>
          {groupId ? (
            <div style={{ padding: 14, overflow: 'auto', flex: 1 }}>
              <ApprovalGatePanel groupId={groupId} />
            </div>
          ) : (
            <div className={styles.drEmpty}>{tr('chat.pickTeamFirst', '请先选择一个群组')}</div>
          )}
          <div className={styles.drActbar}>
            <button className={styles.drActBtn} type="button" onClick={() => {/* TODO 接 task 创建 */}}>
              <Plus size={13} strokeWidth={2} />
              新建任务 · 指派给 agent
            </button>
          </div>
        </div>
  );

  // BRIEF pane — 复用 BriefBoardView
  const briefPane = (
        <div className={styles.drPane}>
          {groupId ? (
            <div style={{ padding: 14, overflow: 'auto', flex: 1 }}>
              <BriefBoardView groupId={groupId} />
            </div>
          ) : (
            <div className={styles.drEmpty}>{tr('chat.pickTeamFirst', '请先选择一个群组')}</div>
          )}
          <div className={styles.drActbar}>
            <button className={styles.drActBtn} type="button" disabled>
              <Pencil size={13} strokeWidth={2} />
              编辑 Brief · 重启 run
            </button>
          </div>
        </div>
  );

  return (
    <div
      className={styles.drawer}
      style={{
        width: drawerWidth,
        position: 'relative',
        userSelect: drawerDragging ? 'none' : undefined,
        // 拖拽过程中关闭 CSS transition，避免每帧宽度更新产生 160ms 延迟感
        transition: drawerDragging ? 'none' : undefined,
      }}
    >
      {/* 左边缘拖拽手柄 */}
      <div
        onMouseDown={drawerDragStart}
        title="拖拽调整宽度"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          cursor: 'col-resize',
          zIndex: 10,
          background: drawerDragging ? 'var(--t-accent-tint, rgba(99,102,241,0.12))' : 'transparent',
          transition: 'background 120ms',
        }}
      />
      <RightPaneTabs<DrawerTab>
        activeTab={tab}
        onTabChange={setTab}
        tabs={tabs.map(tb => ({ key: tb.k, label: tb.label }))}
        tabCounts={{ tasks: metrics.pendingApprovalsCount }}
        ariaLabel="聊天右栏标签"
        trailing={
          onClose ? (
            <button
              type="button"
              onClick={onClose}
              title="关闭"
              aria-label="关闭右栏"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--t-fg-4)',
                padding: 6,
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <X size={14} strokeWidth={2} />
            </button>
          ) : undefined
        }
        panels={{
          thread: threadPane,
          work: (
            <div className={styles.drPane}>
              <AgentWorkspacePane groupId={groupId} />
            </div>
          ),
          tasks: tasksPane,
          brief: briefPane,
        }}
      />
    </div>
  );
}

export default ThreadDrawerFB;
