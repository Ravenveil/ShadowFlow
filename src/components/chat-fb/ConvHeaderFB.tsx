/**
 * ConvHeaderFB · 中央对话区顶部 header（FB-HiFi 风）
 * 对照 _evidence/design-pkg-2026-05-28/chat-fb.html
 *   - CSS : 行 264-300（hdr / hdr-av / hdr-top / pill-live / pill / av-stack）
 *   - HTML: 行 1019-1096（含右上 DAG/搜索/任务/Thread/更多 + 更多下拉菜单 7 项）
 *
 * 接口尽量与旧 ChatPage.tsx 内 ConvHeader 对齐，加几个 chat-fb 特有的回调。
 * 菜单 7 项当前是 console.log 占位，等 Stream D 接 API 后再换实现。
 */

import { useEffect, useRef, useState } from 'react';
import {
  Hash, Search, CheckSquare, MessageSquare, MoreHorizontal,
  Settings, Megaphone, FolderOpen, BellOff, Pin, Users, QrCode,
  Archive, LogOut, type LucideIcon,
} from 'lucide-react';
import styles from './chatFB.module.css';

// ─── 与 src/common/types/inbox.ts 的 GroupItem 字段对齐（保持松耦合）─────────
interface GroupLike {
  id: string;
  name: string;
  status?: string;
  metrics?: {
    members?: number;
    activeRuns?: number;
  };
}

export interface ConvHeaderFBProps {
  group?: GroupLike;
  isRunning?: boolean;
  /** Hard-coded 在 ChatPage 里的 builderUrl，留 prop 兼容性 */
  builderUrl?: string;
  /** i18n 翻译函数，可选；不传走中文 fallback */
  t?: (k: string, opts?: Record<string, unknown>) => string;
  /** 右上角按钮回调 */
  onSearchToggle?: () => void;
  onTasksClick?: () => void;
  onThreadToggle?: () => void;
  onDagClick?: () => void;
  /** 当前 Thread 抽屉是否打开（控制 active 态） */
  threadOpen?: boolean;
  /** 任务数 badge */
  tasksCount?: number;
  /**
   * 群真实成员（来自 group.agent_ids → AgentRecord 解析；查不到时 ChatPage
   * 兜底全 workspace agents）。传入则替换 STUB_MEMBERS 渲染真实头像栈，
   * 成员数也用真实长度。空/未传 → 回退老 stub（保持设计稿观感）。
   */
  members?: Array<{ id: string; name: string; avatarColor?: string }>;
  /**
   * Stream J 2026-05-28 · ⋯ 按钮新行为：
   * 优先调用此 callback（一般打开 GroupSettingsModalFB）；如果没传则 fallback
   * 回退到原有的 9 项下拉菜单（round-1 B 的实现，标 deprecated 保留）。
   */
  onMoreClick?: () => void;
}

// ── 成员头像 mock 数据（设计稿固定 5 个色块）────────────────────────────
// TODO Stream D 接 API: 用 group.metrics.members + 真实 agent 列表换掉这段
const STUB_MEMBERS: Array<{ ch: string; color: string; fg: string }> = [
  { ch: '读', color: '#A855F7', fg: '#7C3AED' },
  { ch: '批', color: '#F59E0B', fg: '#B45309' },
  { ch: '查', color: '#22D3EE', fg: '#0891B2' },
  { ch: '写', color: '#EF4444', fg: '#B91C1C' },
  { ch: '审', color: '#10B981', fg: '#059669' },
];

// ChatPage 用 'b'|'r'|'g'|'p'|'o' 5 色给成员上色（hashColor）；这里映射回 hex。
const MEMBER_COLOR: Record<string, { color: string; fg: string }> = {
  b: { color: '#3B82F6', fg: '#2563EB' },
  r: { color: '#EF4444', fg: '#B91C1C' },
  g: { color: '#10B981', fg: '#059669' },
  p: { color: '#A855F7', fg: '#7C3AED' },
  o: { color: '#F59E0B', fg: '#B45309' },
};

interface MenuItemDef {
  key: string;
  Icon: LucideIcon;
  label: string;
  hint?: string;
  toggle?: boolean;
  initialOn?: boolean;
  danger?: boolean;
}

const MENU_GROUPS: MenuItemDef[][] = [
  [
    { key: 'settings', Icon: Settings, label: '群设置' },
    { key: 'announce', Icon: Megaphone, label: '群公告', hint: '2' },
    { key: 'files', Icon: FolderOpen, label: '群文件', hint: '3' },
  ],
  [
    { key: 'mute', Icon: BellOff, label: '消息免打扰', toggle: true },
    { key: 'pin', Icon: Pin, label: '置顶聊天', toggle: true, initialOn: true },
  ],
  [
    { key: 'members', Icon: Users, label: '成员管理', hint: '5' },
    { key: 'qr', Icon: QrCode, label: '群二维码' },
  ],
  [
    { key: 'archive', Icon: Archive, label: '归档群聊' },
    { key: 'quit', Icon: LogOut, label: '退出群聊', danger: true },
  ],
];

export default function ConvHeaderFB({
  group,
  isRunning = false,
  t,
  onSearchToggle,
  onTasksClick,
  onThreadToggle,
  onDagClick,
  threadOpen = false,
  tasksCount,
  members,
  onMoreClick,
}: ConvHeaderFBProps) {
  // missing-key 回退到中文 fb（useI18n 未命中时返回 key 本身）
  const tr = (k: string, fb: string, opts?: Record<string, unknown>) => {
    if (!t) return fb;
    const v = t(k, opts);
    return v && v !== k ? v : fb;
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    MENU_GROUPS.flat().forEach((it) => {
      if (it.toggle) init[it.key] = !!it.initialOn;
    });
    return init;
  });
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const handleMenuClick = (item: MenuItemDef) => {
    if (item.toggle) {
      setToggles((s) => ({ ...s, [item.key]: !s[item.key] }));
      // 不关菜单，方便连续开关
      return;
    }
    // TODO Stream D 接 API: settings/announce/files/members/qr/archive/quit
    // eslint-disable-next-line no-console
    console.log('[ConvHeaderFB] menu action:', item.key);
    setMenuOpen(false);
  };

  // 真实成员优先；为空回退到老 stub（设计稿观感）。成员数同理。
  const realMembers = members ?? [];
  const useReal = realMembers.length > 0;
  const memberCount = useReal ? realMembers.length : (group?.metrics?.members ?? 0);
  const runCount = group?.metrics?.activeRuns ?? 0;
  const taskN = tasksCount ?? 5;
  const MAX_AV = 6; // 头像栈最多显示几个，多出折叠为 +N

  return (
    <div className={styles.hdr}>
      <div className={styles.hdrAv}>
        <Hash strokeWidth={1.7} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={styles.hdrTop}>
          <span className={styles.hdrNm}>
            {group?.name ?? tr('chat.selectTeam', '选择一个群组')}
          </span>
          {group && (
            <>
              <span className={styles.hdrMeta}>
                · {tr('chat.memberCount', `${memberCount} 人`, { count: memberCount })}
              </span>
              <span className={`${styles.hdrDot} ${styles.hdrDotOk}`} />
              <span className={styles.hdrMeta}>
                {Math.max(0, memberCount - 1)} 在线
              </span>
              {isRunning && (
                <span className={styles.pillLive}>
                  RUNNING · #{String(runCount || 1).padStart(3, '0')}
                </span>
              )}
              <span className={styles.pill}>POLICY · L2-strict</span>
            </>
          )}
        </div>

        {group && (
          <div className={styles.hdrSubline}>
            <span className={styles.avStack}>
              {useReal
                ? realMembers.slice(0, MAX_AV).map((m, i) => {
                    const pal = MEMBER_COLOR[m.avatarColor ?? 'b'] ?? MEMBER_COLOR.b;
                    const ch = Array.from(m.name.trim())[0] ?? '?';
                    return (
                      <span
                        key={m.id || i}
                        className={styles.avMini}
                        title={m.name}
                        style={{
                          background: `color-mix(in oklab, ${pal.color} 14%, var(--skin-panel))`,
                          borderColor: `color-mix(in oklab, ${pal.color} 35%, transparent)`,
                          color: pal.fg,
                        }}
                      >
                        {ch}
                      </span>
                    );
                  })
                : STUB_MEMBERS.map((m, i) => (
                    <span
                      key={i}
                      className={styles.avMini}
                      style={{
                        background: `color-mix(in oklab, ${m.color} 14%, var(--skin-panel))`,
                        borderColor: `color-mix(in oklab, ${m.color} 35%, transparent)`,
                        color: m.fg,
                      }}
                    >
                      {m.ch}
                    </span>
                  ))}
              {useReal && realMembers.length > MAX_AV && (
                <span
                  className={styles.avMini}
                  title={`+${realMembers.length - MAX_AV}`}
                  style={{
                    background: 'var(--skin-panel-2, var(--t-panel-2))',
                    borderColor: 'var(--t-border)',
                    color: 'var(--t-fg-4)',
                  }}
                >
                  +{realMembers.length - MAX_AV}
                </span>
              )}
            </span>
            <span>
              {runCount > 0 ? `run ${runCount}m` : `${memberCount} agents`}
            </span>
          </div>
        )}
      </div>

      {group && (
        <>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
            onClick={onDagClick}
            title="DAG"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              width={13}
              height={13}
            >
              <circle cx="5" cy="6" r="2" />
              <circle cx="19" cy="6" r="2" />
              <circle cx="12" cy="18" r="2" />
              <path d="M7 7l4 9M17 7l-4 9" />
            </svg>
            DAG
          </button>

          <button
            type="button"
            className={`${styles.btn} ${styles.btnIcon}`}
            title="搜索 ⌘F"
            onClick={onSearchToggle}
          >
            <Search size={15} strokeWidth={1.6} />
          </button>

          <button
            type="button"
            className={`${styles.btn} ${styles.btnIcon}`}
            title={`任务 ${taskN}`}
            onClick={onTasksClick}
          >
            <CheckSquare size={15} strokeWidth={1.6} />
            {taskN > 0 && <span className={styles.badge}>{taskN}</span>}
          </button>

          <button
            type="button"
            className={`${styles.btn} ${styles.btnIcon} ${threadOpen ? styles.btnIconActive : ''}`}
            title="Thread"
            onClick={onThreadToggle}
          >
            <MessageSquare size={15} strokeWidth={1.6} />
            {isRunning && <span className={styles.pulseDot} />}
          </button>

          <div className={styles.hdrMenuWrap} ref={menuRef}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnIcon}`}
              title="更多"
              onClick={() => {
                // Stream J 2026-05-28 · 优先走新 modal；老调用方未传 → fallback 菜单
                if (onMoreClick) {
                  onMoreClick();
                  return;
                }
                setMenuOpen((p) => !p);
              }}
            >
              <MoreHorizontal size={15} strokeWidth={1.6} />
            </button>
            <div
              className={`${styles.hdrMenu} ${menuOpen ? styles.hdrMenuOpen : ''}`}
              role="menu"
            >
              {MENU_GROUPS.map((mg, gi) => (
                <div key={gi}>
                  {gi > 0 && <div className={styles.hdrMenuSep} />}
                  {mg.map((it) => {
                    const on = it.toggle ? !!toggles[it.key] : false;
                    return (
                      <button
                        key={it.key}
                        type="button"
                        role="menuitem"
                        className={[
                          styles.hdrMenuItem,
                          it.danger ? styles.hdrMenuItemDanger : '',
                          on ? styles.hdrMenuItemOn : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => handleMenuClick(it)}
                      >
                        <it.Icon size={14} strokeWidth={1.6} />
                        <span className={styles.menuLabel}>{it.label}</span>
                        {it.hint && <span className={styles.menuHint}>{it.hint}</span>}
                        {it.toggle && <span className={styles.menuSw} />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
