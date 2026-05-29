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
import { X, Pencil, Plus, Upload, FileText, FileCode, FileImage } from 'lucide-react';
import { ApprovalGatePanel } from '../../core/components/inbox/ApprovalGatePanel';
import { BriefBoardView } from '../../core/components/inbox/BriefBoardView';
import { fetchRecentMessages } from '../../api/groupApi';
import type { GroupItem, GroupMetrics, Message } from '../../common/types/inbox';
import styles from './chatFB.module.css';

type DrawerTab = 'thread' | 'tasks' | 'docs' | 'brief';

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

const PALETTE: Array<{ accent: string; ink: string }> = [
  { accent: '#A855F7', ink: '#7C3AED' },
  { accent: '#F59E0B', ink: '#B45309' },
  { accent: '#22D3EE', ink: '#0891B2' },
  { accent: '#EF4444', ink: '#B91C1C' },
  { accent: '#10B981', ink: '#059669' },
  { accent: '#3B82F6', ink: '#1D4ED8' },
];
function paletteOf(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initialOf(name?: string): string {
  const tn = (name ?? '').trim();
  if (!tn) return '?';
  const first = Array.from(tn)[0] ?? '?';
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
}

// ─────────────────────────────────────────────────────────────
// Mock docs（Stream G）— 等后端 GET /api/groups/{id}/docs endpoint
// 上线后改成 useEffect + fetch。此处先用本地 mock 让 UI 不空。
// ─────────────────────────────────────────────────────────────
type MockDocKind = 'md' | 'pdf' | 'img' | 'code';
interface MockDoc {
  id: string;
  name: string;
  type: MockDocKind;
  editedAt: string;
  editedBy: string;
}
const MOCK_DOCS: MockDoc[] = [
  { id: '1', name: 'methodology.md', type: 'md', editedAt: '2 hours ago', editedBy: 'reader' },
  { id: '2', name: 'review-v3.pdf', type: 'pdf', editedAt: 'yesterday', editedBy: 'critic' },
  { id: '3', name: 'figures.png', type: 'img', editedAt: '3 days ago', editedBy: 'reader' },
];
function docIcon(type: MockDocKind) {
  // lucide-react 单色线性，不使用 emoji
  switch (type) {
    case 'pdf':
      return <FileText size={16} strokeWidth={2} />;
    case 'img':
      return <FileImage size={16} strokeWidth={2} />;
    case 'code':
      return <FileCode size={16} strokeWidth={2} />;
    default:
      return <FileText size={16} strokeWidth={2} />;
  }
}
function docTypeChip(type: MockDocKind): string {
  switch (type) {
    case 'pdf':
      return 'PDF';
    case 'img':
      return 'IMG';
    case 'code':
      return 'CODE';
    default:
      return 'MD';
  }
}

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
    { k: 'tasks', label: tr('chat.tabTasks', '任务'), n: metrics.pendingApprovalsCount },
    { k: 'docs', label: tr('chat.tabDocs', '文档') },
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

  return (
    <div className={styles.drawer}>
      {/* Tabs */}
      <div className={styles.drTabs}>
        {tabs.map(tb => (
          <span
            key={tb.k}
            className={`${styles.drTab} ${tab === tb.k ? styles.drTabOn : ''}`}
            onClick={() => setTab(tb.k)}
          >
            {tb.label}
            {tb.n !== undefined && tb.n > 0 && (
              <span className={styles.drTabN}>{tb.n}</span>
            )}
          </span>
        ))}
        <span className={styles.drClose} onClick={onClose} title="关闭">
          <X size={14} strokeWidth={2} />
        </span>
      </div>

      {/* THREAD pane */}
      {tab === 'thread' && (
        <div className={styles.drPane}>
          {/* Stream G — dr-ctx 源消息预览（如果父组件传了 sourceMessage） */}
          {sourceMessage && (
            <div className={styles.drCtx}>
              <div className={styles.drCtxRow}>
                <span
                  className={styles.drCtxAv}
                  style={(() => {
                    const p = paletteOf(sourceMessage.senderName);
                    return {
                      background: `color-mix(in oklab, ${p.accent} 18%, var(--skin-panel-2))`,
                      borderColor: `color-mix(in oklab, ${p.accent} 45%, transparent)`,
                      color: p.ink,
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
                  const p = paletteOf(msg.sender_name ?? String(i));
                  return (
                    <div
                      key={i}
                      className={`${styles.drReply} ${isUser ? styles.drReplyUser : styles.drReplyAgent}`}
                    >
                      <span
                        className={styles.drAv}
                        style={{
                          background: `color-mix(in oklab, ${p.accent} 18%, var(--skin-panel-2))`,
                          borderColor: `color-mix(in oklab, ${p.accent} 45%, transparent)`,
                          color: p.ink,
                        }}
                      >
                        {initialOf(msg.sender_name)}
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
                                color: p.ink,
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
      )}

      {/* TASKS pane — 复用 ApprovalGatePanel */}
      {tab === 'tasks' && (
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
      )}

      {/* DOCS pane — Stream G mock 文件列表（TODO: 接 /api/groups/{id}/docs） */}
      {tab === 'docs' && (
        <div className={styles.drPane}>
          {groupId ? (
            <div className={styles.drDocList}>
              {MOCK_DOCS.map(doc => (
                <div key={doc.id} className={styles.drDocItem}>
                  <span className={styles.drDocIcon}>{docIcon(doc.type)}</span>
                  <div className={styles.drDocBody}>
                    <div className={styles.drDocName}>
                      {doc.name}
                      <span className={styles.drDocChip} data-kind={doc.type}>
                        {docTypeChip(doc.type)}
                      </span>
                    </div>
                    <div className={styles.drDocMeta}>
                      {doc.editedBy} · edited {doc.editedAt}
                    </div>
                  </div>
                </div>
              ))}
              <div className={styles.drDocTodo}>
                {tr(
                  'chat.docsMockNotice',
                  '* mock 数据 · 等后端 GET /api/groups/{id}/docs endpoint',
                )}
              </div>
            </div>
          ) : (
            <div className={styles.drEmpty}>{tr('chat.pickTeamFirst', '请先选择一个群组')}</div>
          )}
          <div className={styles.drActbar}>
            <button className={styles.drActBtn} type="button" disabled>
              <Upload size={13} strokeWidth={2} />
              上传 · 拖入或链接文件
            </button>
          </div>
        </div>
      )}

      {/* BRIEF pane — 复用 BriefBoardView */}
      {tab === 'brief' && (
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
      )}
    </div>
  );
}

export default ThreadDrawerFB;
