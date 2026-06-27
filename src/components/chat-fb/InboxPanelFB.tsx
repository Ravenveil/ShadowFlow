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

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Search, Pin, MessageSquare, Lock, Hash, Bot, Check } from 'lucide-react';
import type { GroupItem, AgentDMItem } from '../../common/types/inbox';
import { AGENT_PALETTE, ACCENT_PALETTE, hashIndex, initialOf } from './agentAvatar';
import { useFlipReorder } from '../../core/hooks/useFlipReorder';
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
  /**
   * Optional external ref forwarded to the search input.
   * Lets parent pages focus the search box via Cmd+K or other shortcuts
   * without InboxPanelFB needing to know about the shortcut.
   */
  searchInputRef?: RefObject<HTMLInputElement>;
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
  /** R3 — 列表入场 stagger 序号（clawsgo 化，配合全局 .sf-rail-in）。 */
  animIndex?: number;
  /** R6 — running→结束的瞬时「已完成」绿勾（clawsgo 任务完成反馈），覆盖状态点。 */
  done?: boolean;
  /** FLIP — 重排补位动画用的稳定 id（配合 useFlipReorder 的 [data-flip-id]）。 */
  flipId?: string;
}

function IbxRow(props: RowProps) {
  const palette = props.forcedPalette ?? HUE_PALETTE[hashIndex(props.hueKey, HUE_PALETTE.length)];
  const isUnread = (props.unread ?? 0) > 0;

  const rowCls = [
    styles.row,
    'sf-rail-in',
    isUnread ? styles.rowUnread : '',
    props.active ? styles.rowActive : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={rowCls}
      data-flip-id={props.flipId}
      onClick={props.onClick}
      style={props.animIndex !== undefined ? { animationDelay: `${Math.min(props.animIndex, 8) * 22}ms` } : undefined}
    >
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
        {/* R6 — 完成绿勾优先于运行/警告状态点 */}
        {props.done ? (
          <span className={styles.statDone}><Check strokeWidth={3.5} /></span>
        ) : (
          <>
            {props.statusKind === 'run' && <span className={`${styles.stat} ${styles.statRun}`} />}
            {props.statusKind === 'warn' && <span className={`${styles.stat} ${styles.statWarn}`} />}
          </>
        )}
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

  // ── 搜索 ──────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const internalSearchRef = useRef<HTMLInputElement>(null);
  // Use the caller-supplied ref if provided, otherwise fall back to the internal one.
  // This allows ChatPage (or other parents) to focus the box via Cmd+K without
  // InboxPanelFB needing to know about that shortcut.
  const resolvedSearchRef = (props.searchInputRef ?? internalSearchRef) as RefObject<HTMLInputElement>;

  // ── R6 任务完成反馈：running→结束 的瞬时绿勾（clawsgo「已完成」） ──────────────
  // 无持久「completed」状态（InboxItemStatus 结束即回 idle），故在前端追踪「上一帧
  // 在跑、这一帧不跑」的转变，给该行 2.4s 绿勾 pop 后自动清除。
  const runningKey = useMemo(() => {
    const ids: string[] = [];
    for (const g of props.groups) if (g.status === 'running') ids.push('g:' + g.id);
    for (const d of props.agentDMs) if (d.status === 'running') ids.push('d:' + d.agentId);
    return ids.sort().join(',');
  }, [props.groups, props.agentDMs]);
  const prevRunningRef = useRef<Set<string>>(new Set());
  // 待清绿勾 timer 按 id 存 ref Map —— 关键修复(reviewer-I)：不在 effect cleanup 里清
  // 它们，否则下一次 runningKey 变化时会误杀「还在显示、尚未到 2.4s」的绿勾 timer，
  // 导致先结束的那项绿勾永久卡住。只在「同 id 再次完成」重置、卸载时清全部。
  const doneTimersRef = useRef<Map<string, number>>(new Map());
  const [justDone, setJustDone] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const cur = new Set(runningKey ? runningKey.split(',') : []);
    const finished = [...prevRunningRef.current].filter((id) => !cur.has(id));
    prevRunningRef.current = cur;
    if (finished.length === 0) return;
    setJustDone((s) => { const n = new Set(s); finished.forEach((id) => n.add(id)); return n; });
    finished.forEach((id) => {
      const existing = doneTimersRef.current.get(id);
      if (existing) window.clearTimeout(existing); // 同 id 再次完成 → 重置计时
      const t = window.setTimeout(() => {
        doneTimersRef.current.delete(id);
        setJustDone((s) => { const n = new Set(s); n.delete(id); return n; });
      }, 2400);
      doneTimersRef.current.set(id, t);
    });
  }, [runningKey]);
  // 卸载时清所有待清绿勾 timer（避免泄漏 / 卸载后 setState）。
  useEffect(() => {
    const timers = doneTimersRef.current;
    return () => { timers.forEach((t) => window.clearTimeout(t)); };
  }, []);

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

  // ── 搜索过滤：在 chip filter 之上叠加文字匹配（名称 + 最后消息）──────────────
  const filteredPinned = useMemo(() => {
    if (!query.trim() || !pinnedGroup) return pinnedGroup;
    const lq = query.trim().toLowerCase();
    return (
      pinnedGroup.name.toLowerCase().includes(lq) ||
      pinnedGroup.lastMessage.toLowerCase().includes(lq)
    ) ? pinnedGroup : null;
  }, [pinnedGroup, query]);

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return visibleGroups;
    const lq = query.trim().toLowerCase();
    return visibleGroups.filter(
      g =>
        g.name.toLowerCase().includes(lq) ||
        g.lastMessage.toLowerCase().includes(lq),
    );
  }, [visibleGroups, query]);

  const filteredDMs = useMemo(() => {
    if (!query.trim()) return visibleDMs;
    const lq = query.trim().toLowerCase();
    return visibleDMs.filter(
      d =>
        d.agentName.toLowerCase().includes(lq) ||
        d.lastMessage.toLowerCase().includes(lq),
    );
  }, [visibleDMs, query]);

  // FLIP 重排：群组/DM 顺序或成员变化(删除补位、未读跳顶)时，下方行平滑滑动补位而非
  // 瞬跳(clawsgo)。容器 = .list，行带 data-flip-id；每次 commit 自测量。
  const listElRef = useRef<HTMLDivElement>(null);
  useFlipReorder(listElRef);

  // ── Cmd+F shortcut → focus search input (matches the ⌘F hint in the UI) ──
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        const active = document.activeElement as HTMLElement | null;
        // Don't steal focus from other text inputs (e.g. the composer textarea)
        if (active && active !== resolvedSearchRef.current && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) return;
        e.preventDefault();
        resolvedSearchRef.current?.focus();
        resolvedSearchRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // resolvedSearchRef is a stable object, no deps needed

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
      {/* 搜索 (chat-fb.html 行 879-885) — real input with live filtering */}
      <div className={styles.searchWrap}>
        <div
          className={styles.input}
          onClick={() => resolvedSearchRef.current?.focus()}
        >
          <Search />
          <input
            ref={resolvedSearchRef}
            type="text"
            className={styles.inputReal}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setQuery('');
                e.currentTarget.blur();
              }
            }}
            placeholder={L.searchPlaceholder}
            aria-label={L.searchPlaceholder}
          />
          {query ? (
            <button
              type="button"
              className={styles.inputClear}
              onClick={() => { setQuery(''); resolvedSearchRef.current?.focus(); }}
              aria-label="清除搜索"
            >
              ×
            </button>
          ) : (
            <span className={styles.kbd}>⌘F</span>
          )}
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

      {/* 置顶区 (chat-fb.html 行 894-910) — uses filteredPinned so it disappears when query doesn't match */}
      {filteredPinned && filter !== 'agent' && (
        <>
          <div className={styles.labRow}>
            <span className={styles.lab}>
              <Pin />
              {L.sectionPinned}
            </span>
          </div>
          <div className={styles.listInner}>
            <IbxRow
              name={filteredPinned.name}
              letter={initialOf(filteredPinned.name)}
              hueKey={filteredPinned.id}
              forcedPalette={ACCENT_PALETTE}
              countBadge={filteredPinned.metrics?.members}
              statusKind={groupStatus(filteredPinned)}
              live={filteredPinned.status === 'running'}
              unread={filteredPinned.unreadCount}
              timeLabel={filteredPinned.status === 'running' ? 'now' : formatRelativeTime(filteredPinned.lastActivityAt)}
              active={filteredPinned.id === props.groupId}
              done={justDone.has('g:' + filteredPinned.id)}
              onClick={() => props.onGroup(filteredPinned.id)}
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
        <span className={styles.labN}>{filteredGroups.length + filteredDMs.length}</span>
      </div>

      <div className={styles.list} ref={listElRef}>
        {filteredGroups.length === 0 && filteredDMs.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <Hash size={15} strokeWidth={1.7} />
            </div>
            <p className={styles.emptyText}>
              {filter === 'all' && !query.trim() ? L.emptyGroups : L.noMatched}
            </p>
          </div>
        ) : (
          <>
            {filteredGroups.map((g, i) => {
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
                  animIndex={i}
                  done={justDone.has('g:' + g.id)}
                  flipId={'g:' + g.id}
                  onClick={() => props.onGroup(g.id)}
                />
              );
            })}

            {filteredDMs.length > 0 && (
              <>
                <div className={styles.labRow} style={{ marginTop: 10 }}>
                  <span className={styles.lab}>
                    <Bot />
                    {L.sectionDMs}
                  </span>
                  <span className={styles.labN}>{filteredDMs.length}</span>
                </div>
                {filteredDMs.map((d, i) => (
                  <IbxRow
                    key={d.agentId}
                    name={d.agentName}
                    letter={initialOf(d.agentName)}
                    hueKey={d.agentName}
                    statusKind={dmStatus(d)}
                    live={d.status === 'running'}
                    unread={d.unreadCount}
                    timeLabel={formatRelativeTime(d.lastActivityAt)}
                    active={d.agentId === props.dmId}
                    animIndex={i}
                    done={justDone.has('d:' + d.agentId)}
                    flipId={'d:' + d.agentId}
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
