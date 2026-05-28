/**
 * ThreadDrawerFB · 右侧 Thread / 任务 / 文档 / Brief 抽屉（FB-HiFi 风）
 * 对照 _evidence/design-pkg-2026-05-28/chat-fb.html
 *   - CSS : 行 599-818（drawer / dr-tabs / dr-pane / dr-replies / dr-tasks / dr-docs / dr-brief / dr-actbar）
 *   - HTML: 行 1313-1556
 *
 * 数据来源：
 *   - Thread:  fetchRecentMessages(groupId) — 复用旧 ChatDrawer 的接线
 *   - 任务:    ApprovalGatePanel（沿用 Epic 4 已有组件）
 *   - 文档:    占位（chat-fb 设计稿是静态 mock，等 Story 文档系统接入再补）
 *   - Brief:   BriefBoardView
 */

import { useEffect, useState } from 'react';
import { X, Pencil, Plus, Upload } from 'lucide-react';
import { ApprovalGatePanel } from '../../core/components/inbox/ApprovalGatePanel';
import { BriefBoardView } from '../../core/components/inbox/BriefBoardView';
import { fetchRecentMessages } from '../../api/groupApi';
import type { GroupItem, GroupMetrics, Message } from '../../common/types/inbox';
import styles from './chatFB.module.css';

type DrawerTab = 'thread' | 'tasks' | 'docs' | 'brief';

export interface ThreadDrawerFBProps {
  groupId?: string;
  group?: GroupItem;
  metrics: GroupMetrics;
  t?: (k: string, opts?: Record<string, unknown>) => string;
  onClose?: () => void;
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

export function ThreadDrawerFB({ groupId, group, metrics, t, onClose }: ThreadDrawerFBProps) {
  const tr = (k: string, fb: string) => {
    if (!t) return fb;
    const v = t(k);
    return v && v !== k ? v : fb;
  };
  const [tab, setTab] = useState<DrawerTab>('thread');
  const [threads, setThreads] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

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
          {!groupId ? (
            <div className={styles.drEmpty}>{tr('chat.pickTeamFirst', '请先选择一个群组')}</div>
          ) : loading ? (
            <div className={styles.drEmpty}>{tr('common.loading', '加载中…')}</div>
          ) : threads.length === 0 ? (
            <div className={styles.drEmpty}>{tr('chat.noMessages', '暂无消息')}</div>
          ) : (
            <>
              <div className={styles.drCtx}>
                <div className={styles.drCtxCount}>
                  {threads.length} 条消息 · {group?.metrics?.members ?? 0} 人
                </div>
              </div>
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

      {/* DOCS pane — 占位 */}
      {tab === 'docs' && (
        <div className={styles.drPane}>
          <div className={styles.drEmpty}>
            {tr('chat.noLinkedDocs', '暂无关联文档')}
            <br />
            <span style={{ fontSize: 10, opacity: 0.7 }}>文档系统待后续 story 接入</span>
          </div>
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
