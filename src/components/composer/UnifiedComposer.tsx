/**
 * UnifiedComposer — 统一会话内核 F1（2026-06-11）。
 *
 * 从 StartPage 整块搬移出来的"完整 composer"：textarea + chip 行、
 * CommandMenu（@ 技能 / `/` 命令）、SkillUrlChip / pendingSkill、
 * SkillPickerModal、附件、ModelPicker、DirPicker、知识库 popover、
 * Auto/single/team mode、⌘⏎ 提交、submitting/submitError。
 *
 * 设计契约（docs/design/unified-conversation-core-plan-2026-06-11.md §F1）：
 *  - 内部状态全部自管理（含 skill 列表加载 / compile-status 拉取）。
 *  - 提交逻辑【不】内聚：调用方在 onSubmit(payload) 里做 POST / 路由跳转。
 *    onSubmit 抛错时，组件在卡片内显示可关闭的错误条。
 *  - executor/model/cwd 由内部 ModelPicker / DirPicker 写 localStorage
 *    （sf.defaultExecutor / sf.model / sf.cwd）——与原 StartPage 现状一致，
 *    payload 不携带。
 *  - variant='hero' 为 StartPage 大框样式（视觉零回归）；variant='chat'
 *    为聊天底部紧凑布景（同一结构，高度收敛、圆角 10）。
 *
 * data-testid 保持原 StartPage 前缀（start-composer / start-submit /
 * start-chip-* / start-knowledge-* …）不变，避免测试与
 * E2E 脚本断链。
 */
import React, { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ComposerTokenMeter } from '../workbench/ComposerTokenMeter';
import { estimateTokens } from '../workbench/studioTokens';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Paperclip,
  Link2,
  Hash,
  Download,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  XCircle,
  Loader2,
  CircleDashed,
  FolderOpen,
} from 'lucide-react';
import { getApiBase } from '../../api/_base';
import { listPacks } from '../../api/knowledge';
import type { KnowledgePack } from '../../common/types/knowledge';
import { useI18n } from '../../common/i18n';
import { SkillUrlChip } from '../SkillUrlChip';
import ModelPicker from '../ModelPicker';
import DirPicker from '../DirPicker';
import { SkillPickerModal } from '../SkillPickerModal';
import {
  extractSkillUrl,
  listInstalledSkills,
  type SkillIngestSummary,
  type InstalledSkill,
} from '../../api/skillIngest';
import { listSkills, type SkillInfo } from '../../api/skills';
import { CommandMenu, detectTrigger, type CommandMenuItem } from './CommandMenu';
// Round 4 PR-E — canonical `@<id>` parser shared with the server route. The
// compile-status (已编译 / 编译中 / 降级 / 未编译) renders as an inline
// badge on each `@` skill row inside CommandMenu.
import { parseSkillToken } from '../../lib/skillToken';
import type { CompileStatus } from '../SkillDropdown';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

// Attachments shown as chips between the textarea and the chip row.
export type AttachmentType = 'file' | 'url' | 'cid';
export interface AttachedFile {
  id: string;
  type: AttachmentType;
  label: string;
  meta?: string;
}

export interface UnifiedComposerSubmitPayload {
  text: string;
  /** Resolved skill id — explicit CommandMenu pick (pendingSkill) wins, else
   *  auto-resolved from a `@<skill-id>` token in the text (S11 / PR-E parser). */
  skillName?: string;
  knowledge: string[]; // selected knowledge pack ids
  attachments: AttachedFile[];
  // executor/model/cwd are written to localStorage by the internal pickers
  // (sf.defaultExecutor / sf.model / sf.cwd) — read them there, as before.
}

export interface UnifiedComposerProps {
  /** Submit handler — the component shows an inline error bar if this throws. */
  onSubmit: (p: UnifiedComposerSubmitPayload) => Promise<void> | void;
  placeholder?: string;
  /** hero = StartPage 大框样式（默认）；chat = 聊天底部紧凑样式。 */
  variant?: 'hero' | 'chat';
  autoFocus?: boolean;
  /** 可选受控初始文本（模板 chips 预填用）。变化时覆盖当前草稿。 */
  initialText?: string;
  /**
   * 模板填充时高亮的占位符区间（如 `【主题】`）。配合 `initialText` 使用：
   * 当 initialText 变化且带 selectRange 时，textarea 聚焦并选中 [start,end)，
   * 用户可立即覆写第一个占位符。additive — 不传则行为不变。
   */
  selectRange?: { start: number; end: number };
  /**
   * variant='chat' 时用于计算 ComposerTokenMeter 已用量。
   * 传入会话历史消息文本（plain string），组件内累加 estimateTokens 估算 contextTokens。
   */
  messages?: string[];
  /**
   * 流式进行中（agent 正在回复）。传 true 时「✦ go」发送按钮原地变为「停止」按钮
   * （对齐 ChatGPT/Claude/Cherry Studio：发送↔停止同位切换，不另浮一个按钮）。
   */
  streaming?: boolean;
  /** 流式中点击停止按钮的回调（仅 streaming=true 时生效）。 */
  onStop?: () => void;
}


// ---------------------------------------------------------------------------
// ChipBtn — unified ghost/hover/active/configured chip button (moved verbatim
// from StartPage G6 redo).
//
// Visual contract:
//   default ghost:  transparent bg, no border, fg-3 color, h28 fs11 pad 0/8
//   hover:          panel-2 bg, fg-2 color
//   active (popover open): accent-tint bg, accent fg
//   configured (non-default value, popover closed): bg-elev-2/panel-2 fill,
//                                                    fg color, fontWeight 600
//   active && configured → active visual wins
// ---------------------------------------------------------------------------

interface ChipBtnProps {
  // Icon can be a Lucide component node or a Unicode glyph string. Prefer
  // Lucide — emoji renders inconsistently across OSes and breaks Skin Slot.
  glyph: ReactNode;
  label?: string;
  active?: boolean; // popover currently open
  configured?: boolean; // value differs from default / has content
  hasArrow?: boolean; // append ▾
  onClick: () => void;
  testId?: string;
  title?: string;
  badge?: number | string; // e.g. attachment count
}

function ChipBtn({
  glyph,
  label,
  active = false,
  configured = false,
  hasArrow = false,
  onClick,
  testId,
  title,
  badge,
}: ChipBtnProps) {
  const [hover, setHover] = useState(false);

  // Resolve the visual state — active wins, then configured, then hover, then ghost.
  let bg = 'transparent';
  let color = 'var(--t-fg-3)';
  let fontWeight: 400 | 500 | 600 | 700 = 500;

  if (active) {
    bg = 'var(--t-accent-tint)';
    color = 'var(--t-accent)';
    fontWeight = 600;
  } else if (configured) {
    bg = 'var(--t-bg-elev-2, var(--t-panel-2))';
    color = 'var(--t-fg)';
    fontWeight = 600;
  } else if (hover) {
    bg = 'var(--t-panel-2)';
    color = 'var(--t-fg-2)';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-testid={testId}
      title={title}
      className="sf-press sf-focus-ring"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 28,
        padding: '0 8px',
        borderRadius: 6,
        background: bg,
        border: 'none',
        color,
        fontSize: 11,
        fontWeight,
        fontFamily: 'inherit',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 14,
          height: 14,
          fontSize: 12,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        {glyph}
      </span>
      {label !== undefined && label !== '' && <span>{label}</span>}
      {badge !== undefined && badge !== '' && badge !== 0 && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 8,
            background: active ? 'var(--t-accent)' : 'var(--t-accent-tint)',
            color: active ? 'var(--t-accent-ink, #fff)' : 'var(--t-accent)',
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {badge}
        </span>
      )}
      {hasArrow && (
        <span aria-hidden style={{ fontSize: 9, opacity: 0.7, marginLeft: 1 }}>
          ▾
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// UnifiedComposer
// ---------------------------------------------------------------------------

export function UnifiedComposer({
  onSubmit,
  placeholder,
  variant = 'hero',
  autoFocus = false,
  initialText,
  selectRange,
  messages,
  streaming = false,
  onStop,
}: UnifiedComposerProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const isChat = variant === 'chat';

  const [composer, setComposer] = useState(initialText ?? '');
  // 受控初始文本：变化时覆盖草稿（模板 chips 预填场景）。
  useEffect(() => {
    if (initialText !== undefined) setComposer(initialText);
  }, [initialText]);

  // variant='chat' — 累加历史消息文本估算 contextTokens，喂给 ComposerTokenMeter。
  // Fix #2: include current draft so the meter updates while typing, not only after send.
  const usedTokens = useMemo(
    () => (messages ?? []).reduce((sum, text) => sum + estimateTokens(text), 0) + estimateTokens(composer),
    [messages, composer],
  );

  // 2026-05-29 — ModelPicker 选择（与 run-session/chat 共享 sf.defaultExecutor +
  // sf.model）。调用方提交时读这俩 localStorage key，onChange 写入即生效。
  const [pickExecutor, setPickExecutor] = useState<string>(
    () => localStorage.getItem('sf.defaultExecutor') ?? '',
  );
  const [pickModel, setPickModel] = useState<string>(
    () => localStorage.getItem('sf.model') ?? '',
  );
  // 2026-05-30 — CLI 工作目录(cwd)。DirPicker 选 → 存 sf.cwd → 调用方拼进
  // 请求(仅 cli:/acp:/mcp: 生效)。与 run-session/chat 同一 sf.cwd。
  const [pickCwd, setPickCwd] = useState<string>(() => localStorage.getItem('sf.cwd') ?? '');
  const [showDirPicker, setShowDirPicker] = useState(false);
  const dirAnchorRef = useRef<HTMLButtonElement>(null);
  // Skill-URL detection state. When the composer contains a github / raw-md
  // URL, we surface a chip offering to install it as a skill before submission.
  // dismissedUrls accumulates URLs the user explicitly said "no" to so we don't
  // re-prompt every keystroke.
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(() => new Set());
  const [pendingSkill, setPendingSkill] = useState<SkillIngestSummary | null>(null);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  // ── Claude-Code-style / + @ inline command menu ──────────────────────────
  // 2026-05-20 — replaces the SkillPickerModal as the primary way to attach
  // a skill: type `@paper-review` or `@bmad` in the composer, hit ↵, done.
  // The modal stays accessible via "+ Add ▾ → 导入 Skill" for URL ingest.
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[] | null>(null);
  // W2 (2026-05-22) — separately pull GET /api/skills which (post Lane B)
  // includes `<id>:<cmd>` sub-command entries with `description` text. Used
  // by `/` mode to mirror Claude Code's `/<id>:<cmd>` slash command list.
  // /api/skills/installed lacks `description`, so we keep both sources.
  const [catalogSkills, setCatalogSkills] = useState<SkillInfo[] | null>(null);
  const [commandMenu, setCommandMenu] = useState<{ mode: '@' | '/'; query: string; start: number; end: number } | null>(null);
  // 2026-06-01 — per-skill compile status, fetched lazily when the `@` menu is
  // open. Folds the old SkillDropdown overlay into a CommandMenu row badge.
  const [skillStatusById, setSkillStatusById] = useState<Record<string, CompileStatus>>({});
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  // 模板占位符高亮：当 selectRange 随 initialText 一起到来时，聚焦 textarea 并选中
  // 第一个占位符（如 `【主题】`），让用户落地即可直接覆写。additive — selectRange
  // 缺省时不触发。依赖 initialText 以便同一模板重复点击（seedKey 强制重渲染）也生效。
  useEffect(() => {
    if (!selectRange) return;
    const el = composerRef.current;
    if (!el) return;
    const { start, end } = selectRange;
    const id = window.setTimeout(() => {
      try {
        el.focus();
        el.setSelectionRange(start, end);
      } catch {
        /* setSelectionRange 在区间越界等极端情形下抛错，忽略即可 */
      }
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectRange, initialText]);
  // Lazy-load installed skills the first time either trigger opens — both
  // `@` and `/` list the same skill set as "skill-pack → agent/team物化"
  // entries, just sorted differently per the user's mental model.
  useEffect(() => {
    if (commandMenu && installedSkills === null) {
      listInstalledSkills()
        .then((items) => setInstalledSkills(items))
        .catch(() => setInstalledSkills([]));
    }
    if (commandMenu && commandMenu.mode === '/' && catalogSkills === null) {
      listSkills()
        .then((items) => setCatalogSkills(items))
        .catch(() => setCatalogSkills([]));
    }
  }, [commandMenu, installedSkills, catalogSkills]);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [knowledge, setKnowledge] = useState<string[]>([]); // selected pack IDs
  const [knowledgePacks, setKnowledgePacks] = useState<KnowledgePack[] | null>(null);
  const [knowledgePacksLoading, setKnowledgePacksLoading] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const knowledgeRef = useRef<HTMLDivElement | null>(null);
  // Close popovers on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (knowledgeOpen && knowledgeRef.current && !knowledgeRef.current.contains(t)) setKnowledgeOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [knowledgeOpen]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleSubmit() {
    const text = composer.trim();
    if (!text) return;

    // S11 fix — auto-resolve skill_name from `@<skill-id>` goal token when
    // pendingSkill is null. CommandMenu sets pendingSkill on explicit pick,
    // but a user who types `@paper-review …` and skips the menu (or hits the
    // first letters wrong) would otherwise fall back to the default skill.
    //
    // PR-E (Round 4) — uses the canonical `parseSkillToken` so the frontend
    // and the server route (`routes/run-sessions.ts`) agree byte-for-byte
    // on what is / isn't a token. Notably defends against `user@gmail.com`
    // accidentally matching as `@gmail`.
    let resolvedSkillName = pendingSkill?.skill_id;
    if (!resolvedSkillName && installedSkills && installedSkills.length > 0) {
      const { skill_id: parsedId } = parseSkillToken(text);
      if (parsedId) {
        // Case-insensitive lookup — server's canonical-id is case-sensitive
        // but the user might type any casing; prefer an exact-id hit first
        // (which would be a case match) and fall back to lowercase compare.
        const exact = installedSkills.find((s) => s.id === parsedId);
        const hit = exact ?? installedSkills.find(
          (s) => s.id.toLowerCase() === parsedId.toLowerCase(),
        );
        if (hit) {
          resolvedSkillName = hit.id;
          console.log(`[UnifiedComposer] auto-resolved skill_name from goal token: @${hit.id}`);
        }
      }
    }
    if (!resolvedSkillName) {
      console.log(`[UnifiedComposer] no skill resolved — backend will default to agent-team-blueprint`);
    } else {
      console.log(`[UnifiedComposer] submit with skill_name=${resolvedSkillName}`);
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        text,
        skillName: resolvedSkillName,
        knowledge,
        attachments,
      });
      // 提交成功后清空输入框 + 附件（对齐 ChatGPT/Claude/ClawsGO：发出即清，不残留）。
      // 失败则保留文字，方便用户重发（catch 分支不清）。
      setComposer('');
      setAttachments([]);
      // 2026-06-24 — skill 只在「当轮 @ 或显式选中」时生效，提交后清掉 pendingSkill，
      // 不再静默粘住（修「敲 hi 却触发上次选的 bmad 团队装配」根因）。对齐产品模型：
      // 默认走单 agent 对话（hermes 式），仅 @skill / 明确组队意图才触发装配。
      setPendingSkill(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // When the command menu is open, ↑↓↵ esc are owned by CommandMenu's
    // global keydown listener — don't double-submit on ↵.
    if (commandMenu && (e.key === 'Enter' || e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab')) {
      return;
    }
    // Enter = 发送，Shift+Enter = 换行（旧 Ctrl/Cmd+Enter 保留为备用快捷键）。
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSubmit();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit();
    }
  }

  // 2026-05-20 — composer onChange runs detectTrigger on the current
  // textarea + caret. When a `/` or `@` token is active the menu opens
  // with the live query. When the user types past a whitespace or
  // backspaces the trigger char away, the menu closes.
  function handleComposerChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setComposer(next);
    const caret = e.target.selectionStart ?? next.length;
    const trigger = detectTrigger(next, caret);
    if (trigger) {
      setCommandMenu(trigger);
    } else if (commandMenu) {
      setCommandMenu(null);
    }
  }

  // Selection: replace [start, end) with the chosen token + side-effect.
  function handleCommandPick(item: CommandMenuItem) {
    if (!commandMenu) return;
    const { mode: triggerMode, start, end } = commandMenu;
    const before = composer.slice(0, start);
    const after = composer.slice(end);
    // ── Skill items (id starts with 'skill:') — materialise the skill pack
    //    into agents/team. Same behaviour whether picked via @ or /. The
    //    inserted token uses the original trigger char so the user can see
    //    in the prompt which path they took.
    if (item.id.startsWith('skill:')) {
      const skillId = item.id.slice('skill:'.length);
      const insert = `${triggerMode}${skillId} `;
      setComposer(before + insert + after);
      // Pull the display name + counts from installedSkills so the toast
      // and pendingSkill carry the human-readable "论文评审团队" instead
      // of the bare id token "@paper-review".
      const skill = installedSkills?.find((s) => s.id === skillId);
      const displayName = skill?.name ?? skillId;
      setPendingSkill({
        skill_id: skillId,
        name: displayName,
        is_new: false,
        source_label: skill?.source ?? 'builtin',
        counts: skill?.counts ?? {},
        truncated: false,
      });
      setToast(`已选 Skill: ${displayName}`);
      setTimeout(() => {
        const el = composerRef.current;
        if (el) {
          const pos = start + insert.length;
          el.focus();
          el.setSelectionRange(pos, pos);
        }
      }, 0);
    } else {
      // Built-in slash command — replace the typed `/<query>` with nothing
      // and run the action.
      setComposer(before + after);
      handleSlashCommand(item.id);
    }
    setCommandMenu(null);
  }

  function handleSlashCommand(id: string) {
    switch (id) {
      case 'clear':
        setComposer('');
        setPendingSkill(null);
        setAttachments([]);
        setKnowledge([]);
        setToast('已清空');
        break;
      case 'skill':
        setSkillPickerOpen(true);
        break;
      case 'help':
        setToast('快捷键: @ 提及 Skill · / 命令');
        break;
      case 'inspect':
        navigate('/runs');
        break;
      case 'reload':
        // Hit POST /api/skills/reload so the server rescans the FS.
        fetch(`${getApiBase()}/api/skills/reload`, { method: 'POST' })
          .then((r) => r.json())
          .then((data: { reloaded?: number }) => {
            setInstalledSkills(null);
            setToast(`已重新加载 ${data.reloaded ?? '?'} 个 skill`);
          })
          .catch(() => setToast('reload 失败'));
        break;
      default:
        setToast(`/${id} 未实现`);
    }
  }

  // Compose menu items based on mode. Both modes surface skills as the
  // primary way to attach a skill pack (which the server then materialises
  // into a team via synthesizeTeamRun). `/` additionally shows built-in
  // commands plus `<id>:<cmd>` sub-commands (W2, mirrors Claude Code's
  // `/<plugin>:<command>` slash menu). The `skill:` id prefix lets
  // handleCommandPick dispatch.
  // Fetch compile-status for installed skills while the `@` menu is open so each
  // row can show a 已编译/编译中/降级/未编译 badge. Lifted verbatim-in-spirit from
  // the retired SkillDropdown overlay; cached per id so re-opening won't refetch.
  useEffect(() => {
    if (commandMenu?.mode !== '@' || !installedSkills) return;
    const toFetch = installedSkills
      .map((s) => s.id)
      .filter((id) => !skillStatusById[id]);
    if (toFetch.length === 0) return;
    let cancelled = false;
    void Promise.all(
      toFetch.map(async (id) => {
        try {
          const r = await fetch(
            `${getApiBase()}/api/skills/${encodeURIComponent(id)}/compile-status`,
          );
          if (!r.ok) return null;
          return { id, data: (await r.json()) as CompileStatus };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setSkillStatusById((prev) => {
        const next = { ...prev };
        for (const r of results) if (r && r.data) next[r.id] = r.data;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [commandMenu?.mode, installedSkills, skillStatusById]);

  // Build the inline compile-status badge for a skill row (theme-aware mid-tone
  // colours so it reads on the light panel — the old overlay used too-light -400
  // variants on a hardcoded dark bg).
  function skillStatusBadge(status: CompileStatus | undefined): React.ReactNode {
    const base: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 10,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    };
    if (!status) {
      return (
        <span style={{ ...base, color: 'var(--t-fg-5)' }}>
          <CircleDashed size={11} /> …
        </span>
      );
    }
    if (status.status === 'compiled' && status.compiled) {
      const c = status.compiled;
      const meta = c.mode === 'team' ? `team·${c.members_count ?? 0}` : c.mode;
      return (
        <span style={{ ...base, color: '#059669' }}>
          <CheckCircle2 size={11} /> {meta}
        </span>
      );
    }
    if (status.status === 'compiling') {
      return (
        <span style={{ ...base, color: '#0284c7' }}>
          <Loader2 size={11} className="animate-spin" /> 编译中
        </span>
      );
    }
    if (status.status === 'failed') {
      return (
        <span style={{ ...base, color: '#d97706' }}>
          <XCircle size={11} /> 降级
        </span>
      );
    }
    return (
      <span style={{ ...base, color: 'var(--t-fg-5)' }}>
        <CircleDashed size={11} /> 未编译
      </span>
    );
  }

  const commandMenuItems: CommandMenuItem[] = useMemo(() => {
    if (!commandMenu) return [];
    // Stable alphabetical order by display name so the menu doesn't shuffle
    // between renders (and so `paper-review` lands ahead of `bmad` by
    // localeCompare, matching docs).
    const sortedSkills = [...(installedSkills ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, 'zh-CN'),
    );
    const skillItems: CommandMenuItem[] = sortedSkills.map((s) => {
      const counts = s.counts as Record<string, number | undefined>;
      const agents = counts.agents;
      const edges = counts.edges;
      const detail =
        typeof agents === 'number'
          ? `${agents} agent${typeof edges === 'number' ? ` · ${edges} edge` : ''}`
          : Object.entries(s.counts).map(([k, v]) => `${k}=${v}`).join(' · ');
      return {
        id: `skill:${s.id}`,
        title: `${commandMenu.mode}${s.id}`,
        subtitle: `${s.name}${detail ? ` · ${detail}` : ''}`,
        hint: 'skill',
        // @ mode: inline compile-status badge (folds in the old SkillDropdown).
        // / mode: leave undefined so the 'skill' hint shows as before.
        badge: commandMenu.mode === '@' ? skillStatusBadge(skillStatusById[s.id]) : undefined,
      };
    });
    if (commandMenu.mode === '@') {
      // Mention mode — skills only (no sub-commands; @ targets top-level
      // skill packs that materialise into teams).
      return skillItems;
    }
    // Slash mode — built-in commands first, then sub-commands harvested
    // from /api/skills (entries whose skill_id contains `:`), then the
    // installed top-level skill set. Lane B (skill-loader) registers each
    // `<skill>/commands/*.md` file as its own SKILL with key `<id>:<cmd>`,
    // and the router resolves `/<id>:<cmd>` tokens.
    const subCommandItems: CommandMenuItem[] = (catalogSkills ?? [])
      .filter((s) => s.skill_id.includes(':'))
      .sort((a, b) => a.skill_id.localeCompare(b.skill_id, 'en'))
      .map((s) => ({
        id: `skill:${s.skill_id}`,
        title: `/${s.skill_id}`,
        subtitle: s.description || s.name,
        hint: 'command',
      }));
    const builtin: CommandMenuItem[] = [
      { id: 'clear', title: '/clear', subtitle: '清空 composer + 已选 skill / 附件', hint: 'command' },
      { id: 'skill', title: '/skill', subtitle: '打开 Skill picker（URL 导入）', hint: 'command' },
      { id: 'reload', title: '/reload', subtitle: '后端重新扫描 .shadowflow/skills/', hint: 'command' },
      { id: 'inspect', title: '/inspect', subtitle: '跳转到 Runs 历史页', hint: 'command' },
      { id: 'help', title: '/help', subtitle: '快捷键提示', hint: 'command' },
    ];
    return [...builtin, ...subCommandItems, ...skillItems];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandMenu, installedSkills, catalogSkills, skillStatusById]);

  function toggleKnowledgePack(packId: string) {
    setKnowledge((prev) =>
      prev.includes(packId) ? prev.filter((x) => x !== packId) : [...prev, packId],
    );
  }

  function openKnowledge() {
    setKnowledgeOpen((v) => !v);
    if (knowledgePacks === null && !knowledgePacksLoading) {
      setKnowledgePacksLoading(true);
      listPacks({ limit: 20 })
        .then((res) => setKnowledgePacks(res.data.packs))
        .catch(() => setKnowledgePacks([]))
        .finally(() => setKnowledgePacksLoading(false));
    }
  }

  // ── Variant styling — hero keeps the exact StartPage card; chat is the
  //    same structure in a compact bottom-bar dress (rounded-10, tighter). ──
  // UI5.0(2026-08-13):hero 卡默认中性边+软影(clawsgo 克制),常驻 accent 光晕
  // 改为聚焦才亮 —— 见 index.css .sf-uc-hero:focus-within。
  const cardStyle: React.CSSProperties = isChat
    ? {
        borderRadius: 10,
        padding: '8px 12px 6px',
        boxShadow: 'none',
      }
    : {
        borderColor: 'var(--t-border)',
        boxShadow: 'var(--ui30-shadow-md, 0 2px 6px rgba(15,23,42,.06), 0 8px 20px -8px rgba(15,23,42,.12))',
        padding: '14px 16px 12px',
      };

  return (
    <>
      {/* Composer — textarea + structured fields + chip row, all in one box */}
      <div className={`hf-card${isChat ? '' : ' sf-uc-hero'}`} data-testid="unified-composer" data-variant={variant} style={cardStyle}>
        {(() => {
          if (pendingSkill) {
            return (
              <div
                className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2 mb-2 text-sm"
                data-testid="skill-ready-chip"
              >
                <span className="text-green-300 font-medium">✓ {pendingSkill.name} 已装</span>
                <span className="text-xs text-zinc-400 truncate flex-1">
                  {Object.entries(pendingSkill.counts)
                    .filter(([, n]) => n > 0)
                    .map(([k, n]) => `${k}=${n}`)
                    .join(', ') || 'empty'}
                </span>
                <button
                  type="button"
                  onClick={() => setPendingSkill(null)}
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                >
                  取消
                </button>
              </div>
            );
          }
          const url = extractSkillUrl(composer);
          if (!url || dismissedUrls.has(url)) return null;
          return (
            <div className="mb-2">
              <SkillUrlChip
                url={url}
                onInstalled={(skill) => setPendingSkill(skill)}
                onDismiss={() =>
                  setDismissedUrls((prev) => {
                    const next = new Set(prev);
                    next.add(url);
                    return next;
                  })
                }
              />
            </div>
          );
        })()}
        <div style={{ position: 'relative' }}>
          <textarea
            ref={composerRef}
            value={composer}
            onChange={handleComposerChange}
            onKeyDown={handleComposerKey}
            onSelect={(e) => {
              // Re-detect trigger on caret moves (arrow keys / clicks)
              // — otherwise the menu would stay closed if the user
              // navigates back into a `@xxx` token already in the text.
              const el = e.target as HTMLTextAreaElement;
              const trigger = detectTrigger(el.value, el.selectionStart ?? 0);
              setCommandMenu(trigger);
            }}
            placeholder={placeholder ?? t('start.composerPlaceholder') + ' · 试试 @ 提及 Skill 或 / 命令'}
            data-testid="start-composer"
            autoFocus={autoFocus}
            style={{
              width: '100%',
              minHeight: isChat ? 44 : 88,
              resize: 'vertical',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              fontSize: isChat ? 13.5 : 15,
              lineHeight: 1.6,
              color: 'var(--t-fg)',
            }}
          />
          {/* 2026-06-01 — compile-status (已编译/编译中/降级/未编译) now renders
              as an inline badge on each `@` skill row (see commandMenuItems →
              skillStatusBadge). The old standalone dark SkillDropdown overlay
              was removed to kill the duplicate popover stacked on the input. */}
          <CommandMenu
            open={commandMenu !== null}
            mode={commandMenu?.mode ?? '@'}
            query={commandMenu?.query ?? ''}
            items={commandMenuItems}
            onSelect={handleCommandPick}
            onClose={() => setCommandMenu(null)}
          />
        </div>

        {/* Attached chips — only renders when attachments exist */}
        {attachments.length > 0 && (
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}
            data-testid="start-attachments"
          >
            {attachments.map((a) => (
              <span
                key={a.id}
                data-testid={`start-attachment-${a.type}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: 'var(--t-panel-2)',
                  border: '1px solid var(--t-border)',
                  fontSize: 11,
                  color: 'var(--t-fg-2)',
                  maxWidth: 260,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {a.type === 'file' ? (
                    <Paperclip size={12} strokeWidth={2} />
                  ) : a.type === 'url' ? (
                    <Link2 size={12} strokeWidth={2} />
                  ) : (
                    <Hash size={12} strokeWidth={2} />
                  )}
                </span>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.label}
                </span>
                {a.meta && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: 'var(--t-fg-5)',
                      flexShrink: 0,
                    }}
                  >
                    · {a.meta}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  aria-label={t('start.attachmentRemove')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--t-fg-4)',
                    cursor: 'pointer',
                    padding: 0,
                    marginLeft: 2,
                    fontSize: 13,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* ── Chip row · single layer · 5 chips + spacer + ⌘⏎ + ✦ go ──
            Micro-polish (clawsgo modular composer): the left config chips group
            into a soft pill rail so skill/model/dir/mode/knowledge read as one
            modular control set, with consistent ghost-hover + line icons.
            2026-08-15: 去掉虚线分隔——clawsgo/WorkBuddy composer 是无缝一体胶囊。 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'nowrap',
            marginTop: isChat ? 6 : 12,
            paddingTop: isChat ? 2 : 4,
          }}
        >
          {/* 导入 Skill — 直接打开 SkillPickerModal（URL ingest 真实后端）*/}
          <ChipBtn
            glyph={<Download size={14} strokeWidth={2} />}
            label={t('start.importSkill')}
            onClick={() => setSkillPickerOpen(true)}
            testId="start-chip-import-skill"
            title={t('start.importSkill')}
          />

          {/* 2026-05-29 — ModelPicker（CLI + API）。写 sf.defaultExecutor/sf.model，
              调用方提交时读它们拼进请求。 */}
          <div style={{ flexShrink: 0 }}>
            <ModelPicker
              value={{ executor: pickExecutor, model: pickModel }}
              variant="compact"
              onChange={(next) => {
                localStorage.setItem('sf.defaultExecutor', next.executor);
                setPickExecutor(next.executor);
                if (next.executor.startsWith('byok:') && next.model) {
                  localStorage.setItem('sf.model', next.model);
                  window.dispatchEvent(new Event('sf-model-changed'));
                  setPickModel(next.model);
                }
              }}
              onNavigateSettings={(target) => navigate(target)}
            />
          </div>

          {/* 2026-05-30 — CLI 工作目录(cwd)。选了 CLI executor 才真生效。
              Micro-polish (clawsgo modular row): match the ghost ChipBtn visual
              language — borderless h28 ghost, accent-tint when configured, soft
              panel-2 hover — so the whole row reads as one coherent control set. */}
          <div style={{ flexShrink: 0, position: 'relative' }}>
            <button
              ref={dirAnchorRef}
              type="button"
              title={pickCwd ? `CLI 工作目录: ${pickCwd}` : '选择 CLI 工作目录'}
              onClick={() => setShowDirPicker((v) => !v)}
              data-testid="start-chip-dir"
              className="sf-press sf-focus-ring"
              style={{
                width: 28, height: 28, display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', borderRadius: 6, cursor: 'pointer',
                background: showDirPicker
                  ? 'var(--t-accent-tint)'
                  : pickCwd
                    ? 'var(--t-bg-elev-2, var(--t-panel-2))'
                    : 'transparent',
                border: 'none',
                color: showDirPicker || pickCwd ? 'var(--t-accent)' : 'var(--t-fg-3)',
                transition: 'background 120ms ease, color 120ms ease',
              }}
              onMouseEnter={(e) => {
                if (!showDirPicker && !pickCwd) {
                  e.currentTarget.style.background = 'var(--t-panel-2)';
                  e.currentTarget.style.color = 'var(--t-fg-2)';
                }
              }}
              onMouseLeave={(e) => {
                if (!showDirPicker && !pickCwd) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--t-fg-3)';
                }
              }}
            >
              <FolderOpen size={14} strokeWidth={1.8} />
            </button>
            {showDirPicker && (
              <DirPicker
                value={pickCwd || undefined}
                anchorRef={dirAnchorRef}
                title="选择 CLI 工作目录"
                onPick={(p) => {
                  localStorage.setItem('sf.cwd', p);
                  setPickCwd(p);
                  setShowDirPicker(false);
                }}
                onClose={() => setShowDirPicker(false)}
              />
            )}
          </div>

          {/* KNOWLEDGE chip — calls /knowledge/packs */}
          <div ref={knowledgeRef} style={{ position: 'relative', flexShrink: 0 }}>
            <ChipBtn
              glyph={<BookOpen size={14} strokeWidth={2} />}
              label={knowledge.length > 0 ? String(knowledge.length) : undefined}
              hasArrow
              active={knowledgeOpen}
              configured={knowledge.length > 0}
              onClick={openKnowledge}
              testId="start-knowledge-chip"
              title={t('start.knowledgeAttach')}
            />
            {knowledgeOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 6px)',
                  left: 0,
                  minWidth: 220,
                  background: 'var(--t-panel)',
                  border: '1px solid var(--t-border)',
                  // ===== UI5.0 ===== · 弹层 10px 刻度 + clawsgo 浮起软影
                  borderRadius: 10,
                  padding: 4,
                  boxShadow: '0 1px 2px rgba(15,23,42,0.05), 0 8px 24px -8px rgba(15,23,42,0.16)',
                  zIndex: 20,
                }}
              >
                <div style={{ padding: '4px 10px 6px', fontSize: 10, color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                  {t('start.knowledgeLabel')}
                </div>
                {knowledgePacksLoading ? (
                  <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--t-fg-4)' }}>{t('start.knowledgeLoading')}</div>
                ) : knowledgePacks && knowledgePacks.length > 0 ? (
                  knowledgePacks.map((pack) => {
                    const on = knowledge.includes(pack.pack_id);
                    return (
                      <button
                        key={pack.pack_id}
                        type="button"
                        onClick={() => toggleKnowledgePack(pack.pack_id)}
                        data-testid={`start-knowledge-pack-${pack.pack_id}`}
                        style={{
                          display: 'flex',
                          width: '100%',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 10px',
                          background: on ? 'var(--t-accent-tint)' : 'transparent',
                          color: on ? 'var(--t-accent)' : 'var(--t-fg-2)',
                          border: 'none',
                          borderRadius: 4,
                          fontSize: 12,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 3,
                            border: on ? '1px solid var(--t-accent)' : '1px solid var(--t-fg-4)',
                            background: on ? 'var(--t-accent)' : 'transparent',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pack.name}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div style={{ padding: '6px 10px 8px' }}>
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--t-fg-3)' }}>
                      {t('start.knowledgeEmpty')}
                    </p>
                    <button
                      type="button"
                      onClick={() => { setKnowledgeOpen(false); navigate('/settings?section=knowledge'); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--t-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                    >
                      <ArrowRight size={11} strokeWidth={2} aria-hidden />
                      {t('start.knowledgeManage')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>


          {isChat && (
            <ComposerTokenMeter used={usedTokens} window={0} compact />
          )}
          <div style={{ flex: 1, minWidth: 6 }} />
          {streaming ? (
            /* 流式中：发送按钮原地变为「停止」按钮（同位切换，对齐竞品）。
               chat 变体用 32px 圆角方钮（■ 图标）；hero 用带文字的红钮。 */
            isChat ? (
              <button
                type="button"
                onClick={() => onStop?.()}
                className="sf-press sf-focus-ring"
                style={{
                  width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', cursor: 'pointer',
                  color: '#fff', background: 'var(--t-err, #dc3545)',
                }}
                data-testid="composer-stop"
                aria-label="停止生成"
                title="停止生成"
              >
                <span aria-hidden style={{ width: 11, height: 11, borderRadius: 2.5, background: 'currentColor', display: 'inline-block' }} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onStop?.()}
                className="sf-press sf-focus-ring"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 800, padding: '7px 14px', height: 28, borderRadius: 8,
                  border: '1px solid var(--t-err, #dc3545)', color: 'var(--t-err, #dc3545)',
                  background: 'color-mix(in oklab, var(--t-err, #dc3545) 8%, transparent)', cursor: 'pointer',
                }}
                data-testid="composer-stop"
                aria-label="停止生成"
              >
                <span aria-hidden style={{ width: 9, height: 9, borderRadius: 2, background: 'currentColor', display: 'inline-block' }} />
                停止
              </button>
            )
          ) : isChat ? (
            /* chat 变体：竞品式 32px 圆角方形发送钮（↑ 箭头），空文本时禁用变灰。 */
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || !composer.trim()}
              className="sf-press sf-focus-ring"
              style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: 'none',
                color: '#fff',
                background: composer.trim() ? 'var(--t-accent)' : 'var(--t-border)',
                boxShadow: composer.trim() ? '0 6px 16px -6px color-mix(in oklab, var(--t-accent) 60%, transparent)' : 'none',
                cursor: submitting ? 'wait' : composer.trim() ? 'pointer' : 'not-allowed',
                transition: 'background 140ms ease, box-shadow 140ms ease',
              }}
              data-testid="start-submit"
              aria-label={t('start.submit')}
              title={t('start.submit')}
            >
              {submitting ? <Loader2 size={15} className="sf-spin" /> : <ArrowUp size={17} strokeWidth={2.4} />}
            </button>
          ) : (
            /* hero 变体：与 chat 同款 32px 圆角方形发送钮（↑ 箭头），
               空文本时灰底禁用（2026-08-15 统一，替换原「✦ go」文字胶囊）。 */
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || !composer.trim()}
              className="sf-press sf-focus-ring"
              style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: 'none',
                color: '#fff',
                background: composer.trim() ? 'var(--t-accent)' : 'var(--t-border)',
                boxShadow: composer.trim() ? '0 6px 16px -6px color-mix(in oklab, var(--t-accent) 60%, transparent)' : 'none',
                cursor: submitting ? 'wait' : composer.trim() ? 'pointer' : 'not-allowed',
                transition: 'background 140ms ease, box-shadow 140ms ease',
              }}
              data-testid="start-submit"
              aria-label={t('start.submit')}
              title={t('start.submit')}
            >
              {submitting ? <Loader2 size={15} className="sf-spin" /> : <ArrowUp size={17} strokeWidth={2.4} />}
            </button>
          )}
        </div>

        {/* Submit error bar — shown when onSubmit throws (F1 contract). Same
            visual language as the StartPage page-level alert. */}
        {submitError && (
          <div
            role="alert"
            data-testid="composer-submit-error"
            style={{
              width: '100%',
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'var(--t-danger-tint, rgba(220, 53, 69, .12))',
              border: '1px solid var(--t-danger, #dc3545)',
              color: 'var(--t-danger-fg, #dc3545)',
              fontSize: 12.5,
              lineHeight: 1.55,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              boxSizing: 'border-box',
            }}
          >
            <span style={{ flex: 1 }}>{submitError}</span>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              aria-label="关闭"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: 0,
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          data-testid="start-toast"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 14px',
            // ===== UI5.0 ===== · toast 10px 刻度 + 软影
            borderRadius: 10,
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            color: 'var(--t-fg-2)',
            fontSize: 12,
            boxShadow: '0 1px 2px rgba(15,23,42,0.05), 0 8px 24px -8px rgba(15,23,42,0.16)',
            zIndex: 50,
          }}
        >
          {toast}
        </div>
      )}

      <SkillPickerModal
        open={skillPickerOpen}
        onClose={() => setSkillPickerOpen(false)}
        onPicked={(skill) => setPendingSkill(skill)}
      />
    </>
  );
}

export default UnifiedComposer;
