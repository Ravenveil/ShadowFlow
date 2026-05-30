/**
 * GroupSettingsModalFB · 钉钉风群设置抽屉（右侧 slide-in）
 *
 * 对照 _evidence/design-pkg-2026-05-28-v7/chat-fb.html
 *   - CSS  : 行 191-421（.gset-* 全套规则；overlay/dialog/card/members/rows/toggles/danger）
 *   - HTML : 行 1742-1842（gset-overlay → gset-dialog → 5 个 gset-sec）
 *   - JS   : 行 2022-2042（背景/✕/Esc 关；toggle 行内 flip 不关）
 *
 * 五大区段（按设计稿顺序）：
 *   1. group card    — 头像 / 群名 / "5 个 agent · 4 在线 · 启动于 09:14"
 *   2. members grid  — 5 个 agent + 1 邀请加号；右上 "查看全部 ▸"
 *   3. KV rows       — 群昵称 / 群公告 / 我的昵称(OWNER) / 查找聊天内容
 *   4. toggles       — 消息免打扰 / 置顶聊天 / 折叠该群 / 显示成员昵称
 *   5. danger zone   — 归档群聊 / 退出群聊（更红）
 *
 * 行为：
 *   - 点击 overlay 自身（非 dialog 子节点）→ 关
 *   - 点击 ✕ 按钮 → 关
 *   - Escape 键 → 关
 *   - toggle 行点击 → 翻 switch（不关 modal）
 *   - 其他 KV row 点击 → 触发 onEditField（不关 modal）
 *
 * 留给 J/K 接线的 TODO：
 *   - 头像兜底：当前用 props.avatarEmoji（如 📜）或群名首字 fallback；J 可以扩为 imageUrl
 *   - members 数据：J 在 ChatPage 用 GroupItem.metrics + agents list 喂入
 *   - settings 持久化：K 走 chat-fb 状态层；当前组件是受控的，外部存
 *   - "查看全部" / "邀请" / 5 个 KV row / archive / leave 的实际跳转/弹窗：本组件只回调
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { paletteFor, initialOf } from './agentAvatar';
import styles from './chatFB.module.css';

// ─── 类型 ──────────────────────────────────────────────────────────────────

export type GsetAvatarColor = 'b' | 'r' | 'g' | 'p' | 'o';

export interface GsetMember {
  id: string;
  name: string;
  role: string;
  /** 不传则按 id hash 选 5 色 */
  avatarColor?: GsetAvatarColor;
  /** 在线小绿点；默认 false 不显示 */
  online?: boolean;
}

export type GsetSettingKey = 'muted' | 'pinned' | 'folded' | 'showNickname';

export interface GsetSettings {
  muted: boolean;
  pinned: boolean;
  folded: boolean;
  showNickname: boolean;
}

export type GsetEditField = 'groupNickname' | 'announcement' | 'myNickname' | 'searchChat';

export interface GroupSettingsModalFBProps {
  open: boolean;
  onClose: () => void;

  // ── group card ──
  groupName: string;
  agentCount: number;
  onlineCount: number;
  /** "09:14" 之类的显示字符串；若传 ISO 由调用方先格式化好 */
  startedAt?: string;
  /** 群头像装饰（如 📜）；不传则取群名首字 */
  avatarEmoji?: string;

  // ── members ──
  members: GsetMember[];
  /** "5 / 12" 中的 12；不传按 members.length */
  totalMembers?: number;
  onInviteMember?: () => void;
  onViewAllMembers?: () => void;

  // ── editable KV ──
  groupNickname?: string;
  announcement?: string;
  myNickname?: string;
  isOwner?: boolean;
  /**
   * 兼容老签名：只回传 field key（由调用方自己弹 prompt 收新值）。
   * 新设计：使用 onUpdateField 做内联编辑（modal 内 row 变 input）。
   * 两者并存时优先 onUpdateField — onEditField 留给 searchChat 行（无 value 概念）。
   */
  onEditField?: (field: GsetEditField) => void;
  /**
   * 2026-05-28 · Stream L · 内联编辑保存回调。row 点击 → input → blur/Enter → 调用此 prop。
   * 调用方负责 PATCH + updateGroupMeta；返回 Promise 时 modal 行会显示 saving 态（未实现 UI）。
   */
  onUpdateField?: (field: 'groupNickname' | 'announcement' | 'myNickname', nextValue: string) => void | Promise<void>;

  // ── toggles ──
  settings?: GsetSettings;
  onToggleSetting?: (key: GsetSettingKey) => void;

  // ── danger ──
  onArchive?: () => void;
  onLeave?: () => void;

  /**
   * "查找聊天内容" 行的快捷回调（J 已在 ChatPage 走这个直接打开顶栏 search bar）。
   * 若传了此 prop，则点该行优先走它；否则走 onEditField('searchChat')。
   */
  onSearchInChat?: () => void;

  /** 可选 i18n */
  t?: (k: string) => string;
}

// ─── 默认 / 工具 ──────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: GsetSettings = {
  muted: false,
  pinned: true,
  folded: false,
  showNickname: true,
};

function firstChar(s: string): string {
  // 取首个字形（中文一个字、英文一个字母）
  return s ? Array.from(s)[0] ?? '' : '';
}

// 极简兜底翻译函数（中文 fallback）
const ZH: Record<string, string> = {
  'gset.title': '群设置',
  'gset.close': '关闭',
  'gset.statsTpl': '{agents} 个 agent · {online} 在线{started}',
  'gset.startedAt': ' · 启动于 ',
  'gset.members': '群成员',
  'gset.viewAll': '查看全部 ▸',
  'gset.invite': '邀请',
  'gset.row.groupNickname': '群昵称',
  'gset.row.announcement': '群公告',
  'gset.row.myNickname': '我的昵称',
  'gset.row.searchChat': '查找聊天内容',
  'gset.row.searchChatPh': '按关键字、agent、文件、issue 检索本 run',
  'gset.owner': 'OWNER',
  'gset.sw.muted': '消息免打扰',
  'gset.sw.pinned': '置顶聊天',
  'gset.sw.folded': '折叠该群',
  'gset.sw.foldedHint': '不显示在最近会话顶部',
  'gset.sw.showNickname': '显示成员昵称',
  'gset.archive': '归档群聊',
  'gset.leave': '退出群聊',
};
const fallbackT = (k: string) => ZH[k] ?? k;

// ─── 组件 ─────────────────────────────────────────────────────────────────

export function GroupSettingsModalFB(props: GroupSettingsModalFBProps) {
  const {
    open,
    onClose,
    groupName,
    agentCount,
    onlineCount,
    startedAt,
    avatarEmoji,
    members,
    totalMembers,
    onInviteMember,
    onViewAllMembers,
    groupNickname,
    announcement,
    myNickname,
    isOwner,
    onEditField,
    onUpdateField,
    settings = DEFAULT_SETTINGS,
    onToggleSetting,
    onArchive,
    onLeave,
    onSearchInChat,
    t,
  } = props;

  const tx = t ?? fallbackT;
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // ── Stream L 2026-05-28 · 内联编辑 state ─────────────────────────────────
  // 哪个 KV 行处于编辑态（一次只能一个）。null 表示无编辑。
  type EditableField = 'groupNickname' | 'announcement' | 'myNickname';
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  // 当前 input 缓冲值（避免每次 keystroke 触发 props 回调）
  const [editingValue, setEditingValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const beginEdit = useCallback((field: EditableField, current: string) => {
    setEditingField(field);
    setEditingValue(current);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingField(null);
    setEditingValue('');
  }, []);

  const commitEdit = useCallback(async () => {
    if (!editingField) return;
    const field = editingField;
    const next = editingValue.trim();
    // 关 editor 先，让 UI 立刻摆脱 input（防止 onBlur 二次触发）
    setEditingField(null);
    setEditingValue('');
    // 空值或没变都 no-op
    if (!next) return;
    const prev = field === 'groupNickname' ? (groupNickname ?? groupName)
               : field === 'announcement' ? (announcement ?? '')
               : (myNickname ?? '');
    if (next === prev) return;
    try {
      await onUpdateField?.(field, next);
    } catch (err) {
      // 失败时让用户看到 modal 还在；console.warn 让上层调试
      // eslint-disable-next-line no-console
      console.warn('[GroupSettingsModal] onUpdateField failed:', err);
    }
  }, [editingField, editingValue, onUpdateField, groupName, groupNickname, announcement, myNickname]);

  // open 切换或切换 editing field 时聚焦 input
  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  // 关 modal 时清理编辑态 + 把焦点移走（避免 a11y warning：focused element 进 aria-hidden 子树）
  useEffect(() => {
    if (!open) {
      setEditingField(null);
      setEditingValue('');
      // 若聚焦还在 dialog 内（如 toggle button），主动 blur 它，避免浏览器
      // 「Blocked aria-hidden on an element because its descendant retained focus」警告
      if (typeof document !== 'undefined') {
        const active = document.activeElement as HTMLElement | null;
        if (active && overlayRef.current?.contains(active)) {
          active.blur();
        }
      }
    }
  }, [open]);

  // Escape 键关；只在 open 时挂监听
  // 注：若处于内联编辑态，Escape 优先取消编辑而不是关 modal
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingField) {
          cancelEdit();
          e.stopPropagation();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, editingField, cancelEdit]);

  // 点 overlay 自身关闭（点 dialog 内部冒泡到这里时 e.target 已是 dialog 子节点，不关）
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  // 头像装饰：emoji 优先；否则取群名首字
  const avatarContent = avatarEmoji ?? firstChar(groupName) ?? '·';

  // stats 字符串
  const statsText = (() => {
    const base = `${agentCount} 个 agent · ${onlineCount} 在线`;
    return startedAt ? `${base} · 启动于 ${startedAt}` : base;
  })();

  const total = totalMembers ?? members.length;

  // KV row 显示值兜底
  const groupNicknameText = groupNickname ?? groupName;
  const announcementText = announcement ?? '—';
  const myNicknameText = myNickname ?? '—';

  // toggle 行点击处理
  const onSwRowClick = (key: GsetSettingKey) => () => {
    onToggleSetting?.(key);
  };

  // 单个 toggle 行渲染
  const renderSwitchRow = (
    key: GsetSettingKey,
    label: string,
    hint?: string,
  ) => {
    const on = settings[key];
    const rowClass = `${styles.gsetRow} ${styles.gsetRowSw} ${on ? styles.on : ''}`.trim();
    return (
      <button
        type="button"
        className={rowClass}
        onClick={onSwRowClick(key)}
        aria-pressed={on}
        aria-label={label}
        key={key}
      >
        <div className={styles.gsetRowK}>{label}</div>
        <div className={`${styles.gsetRowV} ${hint ? styles.gsetRowVMute : ''}`.trim()}>
          {hint && <span>{hint}</span>}
        </div>
        <span className={styles.gsetSw} aria-hidden />
      </button>
    );
  };

  return (
    <div
      ref={overlayRef}
      className={`${styles.gsetOverlay} ${open ? styles.open : ''}`.trim()}
      data-overlay="gset"
      onClick={handleOverlayClick}
      aria-hidden={!open}
    >
      <div
        className={styles.gsetDialog}
        role="dialog"
        aria-modal="true"
        aria-label={tx('gset.title')}
      >
        {/* ── header ─────────────────────────────── */}
        <div className={styles.gsetHd}>
          <div className={styles.gsetTitle}>{tx('gset.title')}</div>
          <button
            type="button"
            className={styles.gsetX}
            data-act="close"
            title={tx('gset.close')}
            aria-label={tx('gset.close')}
            onClick={onClose}
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>

        {/* ── body (scroll) ──────────────────────── */}
        <div className={styles.gsetBd}>

          {/* 1) group card */}
          <div className={styles.gsetCard}>
            <div className={styles.gsetCardAv} aria-hidden>{avatarContent}</div>
            <div className={styles.gsetCardMeta}>
              <div className={styles.gsetCardNm}>{groupName}</div>
              <div className={styles.gsetCardStats}>{statsText}</div>
            </div>
          </div>

          <div className={styles.gsetSep} />

          {/* 2) members grid */}
          <div className={styles.gsetSec}>
            <div className={styles.gsetSecHd}>
              <div className={styles.gsetSecTtl}>{tx('gset.members')}</div>
              <div className={styles.gsetSecCnt}>{`${members.length} / ${total}`}</div>
              <div className={styles.gsetSpacer} />
              <button
                type="button"
                className={styles.gsetLink}
                data-act="members-all"
                onClick={() => onViewAllMembers?.()}
              >
                {tx('gset.viewAll')}
              </button>
            </div>
            <div className={styles.gsetMembers}>
              {members.map((m) => {
                // 按 agent 显示名取浅墨兰迪色，和 DM 列表 / 聊天气泡 / 全 app 同 agent 同色
                const pal = paletteFor(m.name);
                return (
                  <button
                    type="button"
                    className={styles.gsetM}
                    key={m.id}
                    aria-label={`${m.name} · ${m.role}`}
                  >
                    <div
                      className={styles.gsetMAv}
                      style={{ background: pal.bg, color: pal.fg, border: `1px solid ${pal.border}` }}
                    >
                      {initialOf(m.name)}
                      {m.online && <span className={styles.onDot} aria-hidden />}
                    </div>
                    <div className={styles.gsetMNm}>{m.name}</div>
                    <div className={styles.gsetMRole}>{m.role}</div>
                  </button>
                );
              })}
              {/* 邀请加号 */}
              <button
                type="button"
                className={styles.gsetM}
                aria-label={tx('gset.invite')}
                onClick={() => onInviteMember?.()}
              >
                <div className={styles.gsetMAvAdd}>+</div>
                <div className={styles.gsetMNm}>{tx('gset.invite')}</div>
                <div className={styles.gsetMRole}>&nbsp;</div>
              </button>
            </div>
          </div>

          <div className={styles.gsetSep} />

          {/* 3) editable KV rows · Stream L 2026-05-28: 点击 → row 变 input → Enter/blur 保存 */}
          <div className={styles.gsetSec}>
            {renderEditableRow({
              field: 'groupNickname',
              label: tx('gset.row.groupNickname'),
              displayValue: groupNicknameText,
              rawValue: groupNickname ?? groupName,
              extraTag: null,
              styles,
              editingField,
              editingValue,
              setEditingValue,
              inputRef,
              beginEdit,
              commitEdit,
              cancelEdit,
              onEditField,
              hasInlineUpdate: Boolean(onUpdateField),
            })}
            {renderEditableRow({
              field: 'announcement',
              label: tx('gset.row.announcement'),
              displayValue: announcementText,
              rawValue: announcement ?? '',
              extraTag: null,
              styles,
              editingField,
              editingValue,
              setEditingValue,
              inputRef,
              beginEdit,
              commitEdit,
              cancelEdit,
              onEditField,
              hasInlineUpdate: Boolean(onUpdateField),
            })}
            {renderEditableRow({
              field: 'myNickname',
              label: tx('gset.row.myNickname'),
              displayValue: myNicknameText,
              rawValue: myNickname ?? '',
              extraTag: isOwner ? (
                <span className={styles.gsetTagOwner}>{tx('gset.owner')}</span>
              ) : null,
              styles,
              editingField,
              editingValue,
              setEditingValue,
              inputRef,
              beginEdit,
              commitEdit,
              cancelEdit,
              onEditField,
              hasInlineUpdate: Boolean(onUpdateField),
            })}
            <button
              type="button"
              className={styles.gsetRow}
              onClick={() => {
                if (onSearchInChat) onSearchInChat();
                else onEditField?.('searchChat');
              }}
            >
              <div className={styles.gsetRowK}>{tx('gset.row.searchChat')}</div>
              <div className={`${styles.gsetRowV} ${styles.gsetRowVMute}`}>
                <span>{tx('gset.row.searchChatPh')}</span>
              </div>
              <div className={styles.gsetRowChev}>›</div>
            </button>
          </div>

          <div className={styles.gsetSep} />

          {/* 4) toggles */}
          <div className={styles.gsetSec}>
            {renderSwitchRow('muted', tx('gset.sw.muted'))}
            {renderSwitchRow('pinned', tx('gset.sw.pinned'))}
            {renderSwitchRow('folded', tx('gset.sw.folded'), tx('gset.sw.foldedHint'))}
            {renderSwitchRow('showNickname', tx('gset.sw.showNickname'))}
          </div>

          <div className={styles.gsetSep} />

          {/* 5) danger zone */}
          <div className={styles.gsetDanger}>
            <button
              type="button"
              className={styles.gsetDangerBtn}
              onClick={() => onArchive?.()}
            >
              {tx('gset.archive')}
            </button>
            <button
              type="button"
              className={`${styles.gsetDangerBtn} ${styles.gsetDangerBtnRed}`}
              onClick={() => onLeave?.()}
            >
              {tx('gset.leave')}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

export default GroupSettingsModalFB;

// ─── 内联编辑行渲染 helper ────────────────────────────────────────────────
// 抽离成函数而非组件，是为了把所有 state 都从 modal 主组件透传——避免再多一层 React 组件
// 边界引入受控/非受控难调的问题。
interface EditableRowArgs {
  field: 'groupNickname' | 'announcement' | 'myNickname';
  label: string;
  /** 兜底显示（如 '—'） */
  displayValue: string;
  /** 进入编辑时填进 input 的真实原值 */
  rawValue: string;
  /** 右侧附加 tag（如 OWNER 徽章），不要时传 null */
  extraTag: React.ReactNode | null;
  styles: Record<string, string>;
  editingField: 'groupNickname' | 'announcement' | 'myNickname' | null;
  editingValue: string;
  setEditingValue: (v: string) => void;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  beginEdit: (field: 'groupNickname' | 'announcement' | 'myNickname', current: string) => void;
  commitEdit: () => void | Promise<void>;
  cancelEdit: () => void;
  onEditField?: (field: GsetEditField) => void;
  /**
   * 当调用方接了 onUpdateField 走真·内联编辑时为 true，此时 onEditField 不再被触发
   * （否则老调用方会弹 window.prompt 干扰）。
   */
  hasInlineUpdate: boolean;
}

function renderEditableRow(args: EditableRowArgs): React.ReactNode {
  const {
    field, label, displayValue, rawValue, extraTag,
    styles, editingField, editingValue, setEditingValue, inputRef,
    beginEdit, commitEdit, cancelEdit, onEditField, hasInlineUpdate,
  } = args;

  const isEditing = editingField === field;

  if (isEditing) {
    return (
      <div
        className={styles.gsetRow}
        key={field}
        data-editing="true"
        // 编辑态用 div 而非 button，避免点 input 时被父 button 抢焦点
      >
        <div className={styles.gsetRowK}>{label}</div>
        <div className={styles.gsetRowV}>
          <input
            ref={inputRef}
            type="text"
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={() => { void commitEdit(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelEdit();
              }
            }}
            // 设计稿没专门 input 样式；用 inline style 贴齐 row 排版（避免污染 CSS module）
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12,
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--accent, #7c3aed)',
              outline: 'none',
              background: 'var(--bg, transparent)',
              color: 'var(--fg-1, inherit)',
              textAlign: 'right',
              font: 'inherit',
            }}
            aria-label={label}
          />
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={styles.gsetRow}
      key={field}
      onClick={() => {
        if (hasInlineUpdate) {
          // 真·内联编辑：进入 input 模式，不再触发外部 onEditField
          beginEdit(field, rawValue);
        } else {
          // Legacy：回退到旧 onEditField（调用方自己弹 window.prompt 等）
          onEditField?.(field);
        }
      }}
    >
      <div className={styles.gsetRowK}>{label}</div>
      <div className={styles.gsetRowV}>
        <span>{displayValue}</span>
        {extraTag}
      </div>
      <div className={styles.gsetRowChev}>›</div>
    </button>
  );
}
