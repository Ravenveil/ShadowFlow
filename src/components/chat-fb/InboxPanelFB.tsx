/**
 * InboxPanelFB — FB-HiFi 风格 Inbox 左栏 (Stream A)
 *
 * 设计稿来源：_evidence/design-pkg-2026-05-28/chat-fb.html
 *   · CSS 规格：行 194-260
 *   · HTML 标记：行 878-1018
 *
 * 视觉规格速查：
 *   宽 296px / 顶部 search 32px / chips 行（全部/未读/@我/Agent）
 *   区段标签 font-mono 9.5px UPPERCASE letter-spacing .12em
 *   行 34x34 圆角 8px 头像 + 名字 + 时间戳 + 未读红点 + @徽章 + LIVE pulse
 *
 * 数据契约：props 形状对齐旧版 InboxPanel（src/pages/ChatPage.tsx 行 135-141），
 * 接 useInboxStore.groups / agentDMs。本组件不直接消费 store，
 * 完全由 props 驱动，方便 Stream D 在 ChatPage 整合时按需注入。
 */

import { useMemo, useState } from 'react';
import { Search, Pin, MessageSquare, Lock, Hash, Bot } from 'lucide-react';
import type { GroupItem, AgentDMItem } from '../../common/types/inbox';
import { AGENT_PALETTE, ACCENT_PALETTE, hashIndex, initialOf } from './agentAvatar';
import styles from './chatFB.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// 类型
// ─────────────────────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'unread' | 'mention' | 'agent';

export interface InboxPanelFBProps {
  groups: GroupItem[];
  groupId?: string;
  agentDMs: AgentDMItem[];
  /** DM 当前选中的 agentId，用于左侧高亮（可选） */
  dmId?: string;
  onGroup: (id: string) => void;
  onDm: (id: string) => void;
  /** 占位文本 i18n 注入；未提供则用中文默认值，便于独立 mount */
  i18n?: {
    searchPlaceholder?: string;
    filterAll?: string;
    filterUnread?: string;
    filterMention?: string;
    filterAgent?: string;
    sectionPinned?: string;
    sectionRecent?: string;
    sectionDMs?: string;
    emptyGroups?: string;
    noMatched?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 头像配色：统一从 agentAvatar 取（单一事实来源，跨页面同 agent 同色）
// ─────────────────────────────────────────────────────────────────────────────

const HUE_PALETTE = AGENT_PALETTE;

/** ISO 时间戳格式化为相对显示：now / HH:mm / 昨日 / 周一 */
function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = diffMs / 60000;
  if (diffMin < 2) return 'now';
  if (diffMin < 60 * 24 && now.toDateString() === d.toDateString()) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (yest.toDateString() === d.toDateString()) return '昨日';
  const dayDiff = Math.floor(diffMs / (24 * 3600 * 1000));
  if (dayDiff < 7) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return weekdays[d.getDay()];
  }
  // 超过 7 天显示日期
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 单行 Row（共用：group 行 + agentDM 行）
// ─────────────────────────────────────────────────────────────────────────────

interface RowProps {
  name: string;
  /** 头像首字 */
  letter: string;
  /** 头像配色 key（用于稳定 hue） */
  hueKey: string;
  /** 强制配色（例如置顶组用 accent） */
  forcedPalette?: { bg: string; border: string; fg: string };
  /** 计数徽章（agent ×N） */
  countBadge?: number;
  /** 状态点：running / blocked */
  statusKind?: 'run' | 'warn' | null;
  /** 是否 LIVE pulse 标识 */
  live?: boolean;
  /** 是否有 @我 */
  mention?: boolean;
  /** 未读数（>0 显示红点 + 名字加粗） */
  unread?: number;
  /** 时间戳（已格式化） */
  timeLabel?: string;
  /** 是否锁定（机密组） */
  locked?: boolean;
  active?: boolean;
  onClick?: () => void;
}

function IbxRow(props: RowProps) {
  const palette = props.forcedPalette ?? HUE_PALETTE[hashIndex(props.hueKey, HUE_PALETTE.length)];
  const isUnread = (props.unread ?? 0) > 0;

  const rowCls = [
    styles.row,
    isUnread ? styles.rowUnread : '',
    props.active ? styles.rowActive : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rowCls} onClick={props.onClick}>
      <span
        className={styles.av}
        style={{
          background: palette.bg,
          borderColor: palette.border,
          color: palette.fg,
        }}
      >
        {props.locked ? <Lock /> : props.letter}
        {props.countBadge !== undefined && props.countBadge > 0 && (
          <span className={styles.cnt}>×{props.countBadge}</span>
        )}
        {props.statusKind === 'run' && <span className={`${styles.stat} ${styles.statRun}`} />}
        {props.statusKind === 'warn' && <span className={`${styles.stat} ${styles.statWarn}`} />}
      </span>

      <div className={styles.meta}>
        <div className={styles.top}>
          <span className={styles.nm}>{props.name}</span>
          {props.live && <span className={styles.live}>LIVE</span>}
          {props.mention && <span className={styles.at}>@</span>}
          {props.timeLabel && <span className={styles.t}>{props.timeLabel}</span>}
        </div>
      </div>

      {isUnread && <span className={styles.unr}>{props.unread}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────────────────────────────────────

export default function InboxPanelFB(props: InboxPanelFBProps) {
  const i18n = props.i18n ?? {};
  const L = {
    searchPlaceholder: i18n.searchPlaceholder ?? '搜索 / 跳转',
    filterAll: i18n.filterAll ?? '全部',
    filterUnread: i18n.filterUnread ?? '未读',
    filterMention: i18n.filterMention ?? '@我',
    filterAgent: i18n.filterAgent ?? 'Agent',
    sectionPinned: i18n.sectionPinned ?? '置顶',
    sectionRecent: i18n.sectionRecent ?? '最近会话',
    sectionDMs: i18n.sectionDMs ?? 'Agent DM',
    emptyGroups: i18n.emptyGroups ?? '暂无会话',
    noMatched: i18n.noMatched ?? '没有匹配的会话',
  };

  const [filter, setFilter] = useState<FilterKey>('all');

  // ── 计数（chips 上的徽章） ────────────────────────────────────────────────
  const unreadGroupCount = useMemo(
    () => props.groups.reduce((acc, g) => acc + (g.unreadCount > 0 ? 1 : 0), 0)
        + props.agentDMs.reduce((acc, d) => acc + (d.unreadCount > 0 ? 1 : 0), 0),
    [props.groups, props.agentDMs],
  );
  // TODO: GroupItem 暂无 mentionCount 字段，@我 用 unread 兜底；待 Story 7.4 之后补
  const mentionCount = unreadGroupCount;

  // ── 分流：置顶 / 普通 / DM ────────────────────────────────────────────────
  // TODO: GroupItem 暂无 pinned 字段。第一条 running 群组当置顶占位，
  //       后续 Story 应在 GroupItem 上加 pinned: boolean 字段。
  const pinnedGroup = useMemo(() => {
    const runningOne = props.groups.find(g => g.status === 'running');
    return runningOne ?? null;
  }, [props.groups]);

  function filterGroup(g: GroupItem): boolean {
    if (filter === 'agent') return false;
    if (filter === 'unread') return g.unreadCount > 0;
    if (filter === 'mention') return g.unreadCount > 0; // 同上 TODO
    return true;
  }
  function filterDM(d: AgentDMItem): boolean {
    if (filter === 'unread' || filter === 'mention') return d.unreadCount > 0;
    return true;
  }

  const visibleGroups = useMemo(() => {
    const list = props.groups.filter(filterGroup);
    // 置顶 group 从最近会话区抽走
    return pinnedGroup ? list.filter(g => g.id !== pinnedGroup.id) : list;
  }, [props.groups, filter, pinnedGroup]);

  const visibleDMs = useMemo(() => props.agentDMs.filter(filterDM), [props.agentDMs, filter]);

  // ── status 映射 ────────────────────────────────────────────────────────────
  function groupStatus(g: GroupItem): 'run' | 'warn' | null {
    if (g.status === 'running') return 'run';
    if (g.status === 'blocked' || g.status === 'pending_approval') return 'warn';
    return null;
  }
  function dmStatus(d: AgentDMItem): 'run' | 'warn' | null {
    if (d.status === 'running') return 'run';
    if (d.status === 'blocked' || d.status === 'pending_approval') return 'warn';
    return null;
  }

  // ── chips 配置 ────────────────────────────────────────────────────────────
  const chips: Array<{ key: FilterKey; label: string; count?: number }> = [
    { key: 'all', label: L.filterAll },
    { key: 'unread', label: L.filterUnread, count: unreadGroupCount },
    { key: 'mention', label: L.filterMention, count: mentionCount },
    { key: 'agent', label: L.filterAgent },
  ];

  return (
    <div className={styles.inbox}>
      {/* 搜索 (chat-fb.html 行 879-885) */}
      <div className={styles.searchWrap}>
        <div className={styles.input}>
          <Search />
          <span className={styles.inputPh}>{L.searchPlaceholder}</span>
          <span className={styles.kbd}>⌘F</span>
        </div>
      </div>

      {/* 过滤 chips (chat-fb.html 行 887-892) */}
      <div className={styles.chips}>
        {chips.map(c => {
          const on = filter === c.key;
          const label = c.count !== undefined && c.count > 0 ? `${c.label}·${c.count}` : c.label;
          return (
            <span
              key={c.key}
              className={`${styles.chip} ${on ? styles.chipOn : ''}`}
              onClick={() => setFilter(c.key)}
            >
              {label}
            </span>
          );
        })}
      </div>

      {/* 置顶区 (chat-fb.html 行 894-910) */}
      {pinnedGroup && filter !== 'agent' && (
        <>
          <div className={styles.labRow}>
            <span className={styles.lab}>
              <Pin />
              {L.sectionPinned}
            </span>
          </div>
          <div className={styles.listInner}>
            <IbxRow
              name={pinnedGroup.name}
              letter={initialOf(pinnedGroup.name)}
              hueKey={pinnedGroup.id}
              forcedPalette={ACCENT_PALETTE}
              countBadge={pinnedGroup.metrics?.members}
              statusKind={groupStatus(pinnedGroup)}
              live={pinnedGroup.status === 'running'}
              unread={pinnedGroup.unreadCount}
              timeLabel={pinnedGroup.status === 'running' ? 'now' : formatRelativeTime(pinnedGroup.lastActivityAt)}
              active={pinnedGroup.id === props.groupId}
              onClick={() => props.onGroup(pinnedGroup.id)}
            />
          </div>
        </>
      )}

      {/* 最近会话区 (chat-fb.html 行 912-1013) */}
      <div className={styles.labRow} style={{ marginTop: 10 }}>
        <span className={styles.lab}>
          <MessageSquare />
          {L.sectionRecent}
        </span>
        <span className={styles.labN}>{visibleGroups.length + visibleDMs.length}</span>
      </div>

      <div className={styles.list}>
        {visibleGroups.length === 0 && visibleDMs.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <Hash size={15} strokeWidth={1.7} />
            </div>
            <p className={styles.emptyText}>
              {filter === 'all' ? L.emptyGroups : L.noMatched}
            </p>
          </div>
        ) : (
          <>
            {visibleGroups.map(g => {
              // 文献综述-机密 这种命名带"机密"/"lock"的当作 locked
              const locked = /机密|secret|lock/i.test(g.name);
              return (
                <IbxRow
                  key={g.id}
                  name={g.name}
                  letter={initialOf(g.name)}
                  hueKey={g.id}
                  countBadge={g.metrics?.members}
                  statusKind={groupStatus(g)}
                  live={g.status === 'running'}
                  unread={g.unreadCount}
                  timeLabel={formatRelativeTime(g.lastActivityAt)}
                  locked={locked}
                  active={g.id === props.groupId}
                  onClick={() => props.onGroup(g.id)}
                />
              );
            })}

            {visibleDMs.length > 0 && (
              <>
                <div className={styles.labRow} style={{ marginTop: 10 }}>
                  <span className={styles.lab}>
                    <Bot />
                    {L.sectionDMs}
                  </span>
                  <span className={styles.labN}>{visibleDMs.length}</span>
                </div>
                {visibleDMs.map(d => (
                  <IbxRow
                    key={d.agentId}
                    name={d.agentName}
                    letter={initialOf(d.agentName)}
                    hueKey={d.agentId}
                    statusKind={dmStatus(d)}
                    live={d.status === 'running'}
                    unread={d.unreadCount}
                    timeLabel={formatRelativeTime(d.lastActivityAt)}
                    active={d.agentId === props.dmId}
                    onClick={() => props.onDm(d.agentId)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
