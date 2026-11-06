/**
 * NeoComposer — Neo 中栏 composer（clawsgo 形态），阶段 2.5 纯 Neo 重写。
 *
 * 硬规则合规：不再 import 旧体系渲染组件（UnifiedComposer / CommandMenu /
 * ModelPicker / DirPicker / SkillPickerModal / SkillUrlChip / ComposerTokenMeter
 * 全部 Neo 化重写为本文件内的 neo-cp-* 子组件）。旧体系只 import 纯逻辑：
 *   - api：    listPacks / listSkills / skillIngest（extractSkillUrl·preview·ingest·
 *              listInstalledSkills）/ fsBrowse（fsHome·fsList·fsPickNative）/ getApiBase
 *   - 纯函数：  parseSkillToken（lib/skillToken，与服务端 canonical parser 同源）
 *   - 常量/IO： common/constants/modelPicker（无 React 的数据加载 + label + 缓存）
 *   - type-only：UnifiedComposerSubmitPayload / AttachedFile
 *              （提交 payload 形状契约不变，NeoChat / NeoGroupChat 调用零改动）、
 *              CompileStatus（SkillDropdown 的编译状态类型）
 *
 * 功能等价于旧 UnifiedComposer：多行输入（Enter 发送 / Shift+Enter 换行 /
 * ⌘⏎ 备用）、`@` 提及 Skill 与 `/` 命令菜单（detectTrigger 为等价本地拷贝，
 * 规则逐行对齐旧实现）、compile-status 行内徽章、模型（CLI+API，写
 * sf.defaultExecutor/sf.model）、CLI 工作目录
 * （sf.cwd + 原生对话框）、知识包勾选、Skill URL 识别 chip、SkillPicker
 * 弹窗（URL ingest）、提交错误条、toast、流式中发送钮同位切停止。
 *
 * 视觉：卡壳沿用 hf-card / sf-uc-hero 全局类（neo-chat.css 的
 * .neo-composer .hf-card 覆写继续生效，观感零回归）；内部全部 neo-cp-*。
 * 差异说明：token 用量计（旧 variant='chat' + messages prop 才渲染）在 Neo
 * 调用方从未传 messages，属死路径，未移植。
 */
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AtSign,
  Slash,
  BookOpen,
  Paperclip,
  Link2,
  Hash,
  Plus,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  XCircle,
  Loader2,
  CircleDashed,
  FolderOpen,
  Folder,
  ChevronRight,
  Check,
  X,
  HardDrive,
  MonitorUp,
  Cpu,
  ExternalLink,
  PawPrint,
  Search,
} from 'lucide-react';
import { getApiBase } from '../api/_base';
import { listDetectedClis, type DetectedCli } from '../api/cli';
import { resolveClawMeta } from '../config/clawhub';
import { listPacks } from '../api/knowledge';
import type { KnowledgePack } from '../common/types/knowledge';
import { useI18n } from '../common/i18n';
import {
  extractSkillUrl,
  ingestSkill,
  previewSkill,
  listInstalledSkills,
  type SkillIngestSummary,
  type SkillPreview,
  type InstalledSkill,
} from '../api/skillIngest';
import { listSkills, type SkillInfo } from '../api/skills';
import { fsHome, fsList, fsPickNative, type FsEntry } from '../api/fsBrowse';
import { parseSkillToken } from '../lib/skillToken';
import {
  fetchPickerCliItems,
  fetchPickerApiItems,
  loadCachedPicker,
  saveCachedPicker,
  pickerLabel,
  type PickerCliItem,
  type PickerApiItem,
  type PickerItem,
  type ModelPickerValue,
} from '../common/constants/modelPicker';
import type {
  UnifiedComposerSubmitPayload,
  AttachedFile,
} from '../components/composer/UnifiedComposer';
import type { CompileStatus } from '../components/SkillDropdown';
import type { NeoNav } from './types';
// ClawHub（2026-06）：.claw-target-chip / .claw-badge-mini 样式（增量引入）
import '../pages/clawhub/clawhub.css';
// 2026-11-06 美化批：官方品牌 logo（选择器 monogram 色块 → 品牌 SVG，未收录回落）
import { BrandGlyph } from '../common/icons/brandIcons';
import './neo-composer.css';

export type { UnifiedComposerSubmitPayload };

export interface NeoComposerProps {
  /** 提交逻辑不内聚：调用方在 onSubmit 里做 POST / 状态切换；抛错时
   *  composer 在卡片内显示可关闭的错误条。 */
  onSubmit: (p: UnifiedComposerSubmitPayload) => Promise<void> | void;
  placeholder?: string;
  /** hero = 空态居中大框（clawsgo 首页态）；chat = 底部紧凑（默认）。 */
  variant?: 'hero' | 'chat';
  /** 流式进行中：发送按钮原地切换为「停止」。 */
  streaming?: boolean;
  onStop?: () => void;
  /** 预填文本（如模板画廊点选后注入 `@<skill_id> `）。值变化时覆盖当前草稿。 */
  initialText?: string;
  /** NeoApp 内部导航（中栏视图切换，如 {view:'runs'}）——/inspect 等内建
   *  slash 命令走它；runs 是 NeoApp 内部视图而非 react-router 路由。
   *  由 NeoApp → NeoChat/NeoGroupChat → 本组件逐级透传；缺省（独立路由页）
   *  时回落 react-router navigate。 */
  onNavigate?: (nav: NeoNav) => void;
  /** ClawHub（2026-06，FR-03）：当前 Claw 聊天 target（非空时 chip 行显示
   *  Claw 徽章，提示用户对话将由该 Claw 驱动）。 */
  clawTarget?: { cliId: string; name: string } | null;
  /** ClawHub（2026-06）：清除 Claw target。 */
  onClearClawTarget?: () => void;
  /** ClawHub（2026-10-31 加号菜单）：从菜单挑选 Claw → 父级设为聊天 target。 */
  onPickClaw?: (cliId: string) => void;
  /** 群聊 @ 提及成员（2026-11-05，OpenBot 定向派活语义）：非空时 @ 菜单在
   *  Skills 之前列出这些成员（选中插入 @token，后端据此只派活给被点名者）。
   *  id 必须是成员 id（后端 mention 解析的锚点），title 用显示名。 */
  mentionItems?: Array<{ id: string; name: string; role?: string }>;
  /** 2026-11-05 GrokBot 对齐 — /schedule 斜杠命令回调：弹出轻量定时任务表单。
   *  缺省（调用方未接）→ /schedule 不出现在命令菜单（单聊页传入）。 */
  onScheduleCommand?: () => void;
}

// ---------------------------------------------------------------------------
// detectTrigger — `@` / `/` 触发检测。等价本地拷贝（旧体系 CommandMenu.tsx
// 的同名纯函数，规则逐行一致：触发符须在文首或空白后；query = 触发符到光标
// 的非空白连续串；光标须在 query 内）。Neo 壳不 import 旧组件模块，故拷贝。
// ---------------------------------------------------------------------------

type NeoCommandMode = '@' | '/';

interface NeoDetectedTrigger {
  mode: NeoCommandMode;
  query: string;
  /** char index of the trigger ('/' or '@') */
  start: number;
  /** char index right after the query — equal to caret if caret is at the end */
  end: number;
}

function detectTrigger(text: string, caret: number): NeoDetectedTrigger | null {
  if (caret < 1 || caret > text.length) return null;
  // Walk backwards from the caret to find a `/` or `@`, abort on whitespace.
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '\n' || ch === ' ' || ch === '\t') return null;
    if (ch === '/' || ch === '@') {
      // The char before the trigger must be whitespace OR start-of-text.
      if (i > 0) {
        const prev = text[i - 1];
        if (prev !== ' ' && prev !== '\n' && prev !== '\t') return null;
      }
      // Anything after the caret that's a non-whitespace char extends the
      // query token — include it so the menu filters correctly when the
      // caret is in the middle of a word.
      let j = caret;
      while (j < text.length && text[j] !== ' ' && text[j] !== '\n' && text[j] !== '\t') j += 1;
      const fullQuery = text.slice(i + 1, j);
      return { mode: ch as NeoCommandMode, query: fullQuery, start: i, end: j };
    }
    i -= 1;
  }
  return null;
}

// ---------------------------------------------------------------------------
// NeoCommandMenu — `@`/`/` 内联弹出菜单（旧 CommandMenu 的 Neo 重写）。
// 纯展示 + 自管 selectedIndex；↑↓↵ Tab 选择、Esc 关闭（window capture 监听，
// 与旧实现一致，textarea 侧据此跳过回车提交）。
// ---------------------------------------------------------------------------

interface NeoMenuItem {
  id: string;
  title: string;
  subtitle?: string;
  /** 行右端提示（如 'skill' / 'command'）。 */
  hint?: string;
  /** 行右端富节点（`@` skill 行的编译状态徽章），优先于 hint。 */
  badge?: ReactNode;
  disabled?: boolean;
}

function neoMenuMatch(query: string, item: NeoMenuItem): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    item.id.toLowerCase().includes(q) ||
    item.title.toLowerCase().includes(q) ||
    (item.subtitle ?? '').toLowerCase().includes(q)
  );
}

function NeoCommandMenu({
  open,
  mode,
  query,
  items,
  onSelect,
  onClose,
}: {
  open: boolean;
  mode: NeoCommandMode;
  query: string;
  items: NeoMenuItem[];
  onSelect: (item: NeoMenuItem) => void;
  onClose: () => void;
}) {
  const filtered = useMemo(
    () => items.filter((it) => !it.disabled && neoMenuMatch(query, it)),
    [items, query],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Clamp selection when filtered shrinks below the cursor.
  useEffect(() => {
    if (selectedIndex >= filtered.length) setSelectedIndex(0);
  }, [filtered.length, selectedIndex]);

  // Reset cursor each time the menu opens or the mode changes.
  useEffect(() => {
    if (open) setSelectedIndex(0);
  }, [open, mode]);

  // Keyboard glue — window capture 阶段接管 ↑↓/↵/Tab/Esc（与旧实现一致）。
  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered.length === 0) return;
        e.preventDefault();
        onSelect(filtered[selectedIndex]);
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, filtered, selectedIndex, onSelect, onClose]);

  // Scroll active row into view when arrow keys move it past the viewport.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLDivElement>(
      `[data-cmd-row="${selectedIndex}"]`,
    );
    node?.scrollIntoView({ block: 'nearest' });
  }, [open, selectedIndex]);

  if (!open) return null;

  const HeaderIcon = mode === '@' ? AtSign : Slash;
  const headerLabel = mode === '@' ? 'mention' : 'command';
  const placeholder = mode === '@' ? '搜索 Skill / Agent…' : '搜索命令…';

  return (
    <div className="neo-cp-menu" data-component="command-menu" data-mode={mode} role="listbox">
      <div className="neo-cp-menu-head">
        <HeaderIcon size={12} strokeWidth={2.2} aria-hidden />
        <span className="neo-cp-menu-head-label">{headerLabel}</span>
        <span className="neo-cp-menu-head-query">{query ? `"${query}"` : placeholder}</span>
      </div>
      <div ref={listRef} className="neo-cp-menu-list">
        {filtered.length === 0 ? (
          <div className="neo-cp-menu-empty">
            没有匹配项。{mode === '@' ? '试试 @paper-review 或 @bmad' : '试试 /help'}
          </div>
        ) : (
          filtered.map((item, i) => {
            const active = i === selectedIndex;
            return (
              <div
                key={item.id}
                data-cmd-row={i}
                role="option"
                aria-selected={active}
                className={`neo-cp-menu-row${active ? ' on' : ''}`}
                onMouseEnter={() => setSelectedIndex(i)}
                onMouseDown={(e) => {
                  // Prevent textarea blur before onClick fires.
                  e.preventDefault();
                }}
                onClick={() => onSelect(item)}
              >
                <span className="neo-cp-menu-row-main">
                  <span className="neo-cp-menu-row-title">{item.title}</span>
                  {item.subtitle && (
                    <span className="neo-cp-menu-row-sub">{item.subtitle}</span>
                  )}
                </span>
                {item.badge ? (
                  <span className="neo-cp-menu-row-badge">{item.badge}</span>
                ) : (
                  item.hint && <span className="neo-cp-menu-hint">{item.hint}</span>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="neo-cp-menu-foot">
        <span>↑↓ 导航</span>
        <span>↵ 选择</span>
        <span>esc 关闭</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NeoChipBtn — 幽灵 chip 按钮（旧 ChipBtn 的 Neo 重写，hover 交回 CSS）。
//   默认 ghost → hover 浅灰 → configured（非默认值）填充 → on（弹层开着）
//   accent tint；on 优先级最高（CSS 类顺序保证）。
// ---------------------------------------------------------------------------

function NeoChipBtn({
  glyph,
  label,
  active = false,
  configured = false,
  hasArrow = false,
  onClick,
  testId,
  title,
  badge,
}: {
  glyph: ReactNode;
  label?: string;
  active?: boolean;
  configured?: boolean;
  hasArrow?: boolean;
  onClick: () => void;
  testId?: string;
  title?: string;
  badge?: number | string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      title={title}
      className={`neo-cp-chip sf-press sf-focus-ring${active ? ' on' : ''}${configured ? ' configured' : ''}`}
    >
      <span aria-hidden className="neo-cp-chip-icon">
        {glyph}
      </span>
      {label !== undefined && label !== '' && <span>{label}</span>}
      {badge !== undefined && badge !== '' && badge !== 0 && (
        <span className="neo-cp-chip-badge">{badge}</span>
      )}
      {hasArrow && (
        <span aria-hidden className="neo-cp-chip-arrow">
          ▾
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// NeoModelPicker — 模型/执行器选择（旧 ModelPicker compact 的 Neo 重写）。
// 数据/缓存/label 全部复用 common/constants/modelPicker（纯逻辑模块）；
// 不写 localStorage —— onChange 抛给 NeoComposer 落库（同旧契约）。
// ---------------------------------------------------------------------------

function NeoModelPicker({
  value,
  onChange,
  onNavigateSettings,
}: {
  value: ModelPickerValue;
  onChange: (next: ModelPickerValue) => void;
  onNavigateSettings?: (target: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [cliItems, setCliItems] = useState<PickerCliItem[]>(() => loadCachedPicker()?.cli ?? []);
  const [apiItems, setApiItems] = useState<PickerApiItem[]>(() => loadCachedPicker()?.api ?? []);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState(460);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 });

  // Prewarm on mount + refresh on open（抓到新装 CLI / 新配 key）。
  const refresh = () => {
    const apiBase = getApiBase();
    const hasData = cliItems.length > 0 || apiItems.length > 0;
    if (!hasData) setLoading(true);
    Promise.all([fetchPickerCliItems(apiBase), fetchPickerApiItems(apiBase)])
      .then(([cli, api]) => {
        setCliItems(cli);
        setApiItems(api);
        saveCachedPicker(cli, api);
      })
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) refresh(); }, [open]);

  // 点外关闭（下拉 portal 到 body，须同时排除 dropdownRef）。
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const tgt = e.target as Node;
      if (wrapRef.current?.contains(tgt)) return;
      if (dropdownRef.current?.contains(tgt)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // 打开/滚动/resize 时按按钮 rect 算 fixed 坐标（composer 底部，默认向上弹，
  // 上方空间不够翻下）；useLayoutEffect 保证 paint 前定位不闪。
  useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const btn = wrapRef.current?.querySelector('button');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const GAP = 6;
      const DROP_W = 260;
      const spaceAbove = rect.top - 12;
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const dir: 'up' | 'down' = spaceAbove < 360 && spaceBelow > spaceAbove ? 'down' : 'up';
      setMaxH(Math.max(180, Math.min(460, dir === 'up' ? spaceAbove : spaceBelow)));
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - DROP_W - 8));
      setPos(dir === 'up'
        ? { left, bottom: window.innerHeight - rect.top + GAP }
        : { left, top: rect.bottom + GAP });
    };
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [open]);

  const { label, tooltip } = pickerLabel(value.executor, value.model);

  const select = (it: PickerItem) => {
    if (it.kind === 'cli') onChange({ executor: `cli:${it.agentId}`, model: value.model });
    else onChange({ executor: `byok:${it.providerId}`, model: it.modelId });
    setOpen(false);
  };

  const renderItem = (it: PickerItem) => {
    const active = it.kind === 'cli'
      ? value.executor === `cli:${it.agentId}`
      : value.executor === `byok:${it.providerId}` && value.model === it.modelId;
    const key = it.kind === 'cli' ? `cli:${it.agentId}` : `byok:${it.providerId}:${it.modelId}`;
    const title = it.kind === 'cli' ? it.name : it.modelId;
    const sub = it.kind === 'cli' ? (it.version ? it.version : 'CLI · installed') : it.providerName;
    // 2026-11-06 美化批：官方品牌 SVG 优先（CLI 按 agentId、API 按 providerId 解析），
    // 未收录回落 monogram。色块容器着色逻辑不变。
    const brandId = it.kind === 'cli' ? it.agentId : it.providerId;
    const glyph = BrandGlyph({ brandId, size: 14 });
    return (
      <button
        key={key}
        type="button"
        title={it.kind === 'cli' ? `${title} · ${sub}` : `${title} — ${sub}`}
        onClick={() => select(it)}
        className={`neo-cp-model-item${active ? ' on' : ''}`}
      >
        {/* 品牌图标/monogram 色块：tint 来自数据（CLI/厂商元表），颜色值内联、布局走 class */}
        <span
          aria-hidden
          className="neo-cp-model-mono"
          style={{
            background: `color-mix(in oklab, ${it.tint} 14%, var(--t-panel))`,
            border: `1px solid color-mix(in oklab, ${it.tint} ${active ? 60 : 30}%, transparent)`,
            color: it.tint,
          }}
        >
          {glyph ?? it.monogram}
        </span>
        <span className="neo-cp-model-item-main">
          <span className="neo-cp-model-item-title">{title}</span>
          <span className="neo-cp-model-item-sub">{sub}</span>
        </span>
        {active && <Check size={12} strokeWidth={2.5} className="neo-cp-model-check" aria-hidden />}
      </button>
    );
  };

  const emptyHint = (text: string, target: string) => (
    <button
      type="button"
      onClick={() => { onNavigateSettings?.(target); setOpen(false); }}
      className="neo-cp-model-empty"
    >
      <span>{text}</span>
      <ExternalLink size={10} strokeWidth={1.8} aria-hidden />
    </button>
  );

  return (
    <div className="neo-cp-model" data-model-picker ref={wrapRef}>
      <button
        type="button"
        title={tooltip}
        onClick={() => setOpen((v) => !v)}
        className={`neo-cp-model-btn sf-press sf-focus-ring${open ? ' on' : ''}`}
      >
        <Cpu size={13} strokeWidth={1.8} aria-hidden className="neo-cp-model-btn-icon" />
        <span className="neo-cp-model-btn-label">{label}</span>
      </button>
      {open && createPortal(
        <div
          ref={dropdownRef}
          data-model-picker-pop
          className="neo-cp-model-pop"
          style={{
            left: pos.left,
            maxHeight: maxH,
            ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom ?? 0 }),
          }}
        >
          <div className="neo-cp-model-sec">CLI</div>
          {loading && cliItems.length === 0 ? (
            <div className="neo-cp-model-note">{t('common.detecting')}</div>
          ) : cliItems.length === 0 ? (
            emptyHint(
              t('neo.composer.noCli', { defaultValue: '未检测到已安装的 CLI · 去设置' }),
              '/settings#local-cli',
            )
          ) : (
            cliItems.map(renderItem)
          )}
          <div className="neo-cp-model-sep" />
          <div className="neo-cp-model-sec">API</div>
          {loading && apiItems.length === 0 ? (
            <div className="neo-cp-model-note">{t('common.loading')}</div>
          ) : apiItems.length === 0 ? (
            emptyHint(
              t('neo.composer.noApiKey', { defaultValue: '未配置 API Key · 去设置 BYOK' }),
              '/settings#byok',
            )
          ) : (
            apiItems.map(renderItem)
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NeoDirPicker — CLI 工作目录选择浮层（旧 DirPicker 的 Neo 重写）。
// 目录树由 Node 后端读磁盘（api/fsBrowse），portal 到 body + fixed 定位逃裁切。
// ---------------------------------------------------------------------------

function NeoDirPicker({
  value,
  onPick,
  onClose,
  anchorRef,
  title,
}: {
  value?: string;
  onPick: (absPath: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  title?: string;
}) {
  const { t } = useI18n();
  const [cur, setCur] = useState<string | undefined>(value);
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 });
  const [draft, setDraft] = useState<string>(value ?? '');
  const [nativePicking, setNativePicking] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 加载某目录（undefined=home；'ROOT'=盘符；绝对路径=跳转）。
  const load = (p?: string) => {
    setLoading(true);
    setErr(null);
    fsList(p)
      .then((r) => {
        if (!r) {
          setErr(
            p && p !== 'ROOT'
              ? t('neo.composer.dirUnreadable', { defaultValue: `读不到该目录：${p}（检查路径是否存在、是否是文件夹）` })
              : t('neo.composer.dirNoBackend', { defaultValue: '无法读取目录（后端未响应）' }),
          );
          return;
        }
        const real = r.path === 'ROOT' ? undefined : r.path;
        setCur(real);
        setDraft(real ?? '');
        setParent(r.parent);
        setEntries(r.entries);
      })
      .finally(() => setLoading(false));
  };

  // 初始：有 value 从它开始，否则 home。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (value) load(value);
    else fsHome().then((h) => load(h?.home));
  }, []);

  // 定位浮层（锚点上方优先，空间不够翻下）。
  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const GAP = 6;
    const PANEL_H = 380;
    const PANEL_W = 360;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8));
    const spaceAbove = r.top;
    if (spaceAbove > PANEL_H + GAP) {
      setPos({ left, bottom: window.innerHeight - r.top + GAP });
    } else {
      setPos({ left, top: r.bottom + GAP });
    }
  }, [anchorRef]);

  // 点外关闭。
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const tgt = e.target as Node;
      if (panelRef.current?.contains(tgt)) return;
      if (anchorRef.current?.contains(tgt)) return;
      onClose();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={panelRef}
      className="neo-cp-dir"
      style={{
        left: pos.left,
        top: pos.top,
        bottom: pos.bottom,
      }}
    >
      <div className="neo-cp-dir-head">
        <FolderOpen size={14} strokeWidth={1.8} aria-hidden className="neo-cp-dir-head-icon" />
        <span className="neo-cp-dir-title">
          {title ?? t('neo.composer.dirPickTitle', { defaultValue: '选择工作目录' })}
        </span>
        <button
          type="button"
          title={t('neo.composer.dirNativeHint', { defaultValue: '弹出系统文件夹对话框选择' })}
          disabled={nativePicking}
          onClick={() => {
            setNativePicking(true);
            setErr(null);
            fsPickNative()
              .then((p) => { if (p) onPick(p); })
              .finally(() => setNativePicking(false));
          }}
          className="neo-cp-dir-native"
        >
          <MonitorUp size={12} strokeWidth={2} aria-hidden />
          {nativePicking
            ? t('neo.composer.dirNativeBusy', { defaultValue: '已弹出…' })
            : t('neo.composer.dirNative', { defaultValue: '系统选择' })}
        </button>
        <button type="button" onClick={onClose} className="neo-cp-dir-x" aria-label={t('common.close', { defaultValue: '关闭' })}>
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="neo-cp-dir-pathbar">
        <button
          type="button"
          title={t('neo.composer.dirUp', { defaultValue: '上一级' })}
          onClick={() => load(parent ?? 'ROOT')}
          disabled={parent === null && !cur}
          className="neo-cp-dir-up"
        >
          <ArrowUp size={12} strokeWidth={2} aria-hidden />
        </button>
        <input
          type="text"
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) { e.preventDefault(); load(draft.trim()); }
          }}
          placeholder={t('neo.composer.dirPasteHint', { defaultValue: '粘贴绝对路径回车跳转，如 D:\\我的项目' })}
          className="neo-cp-dir-input"
        />
        <button
          type="button"
          title={t('neo.composer.dirGoHint', { defaultValue: '转到该路径' })}
          disabled={!draft.trim()}
          onClick={() => { if (draft.trim()) load(draft.trim()); }}
          className="neo-cp-dir-go"
        >
          {t('neo.composer.dirGo', { defaultValue: '转到' })}
        </button>
      </div>

      <div className="neo-cp-dir-list">
        {loading ? (
          <div className="neo-cp-dir-note">{t('common.loading')}</div>
        ) : err ? (
          <div className="neo-cp-dir-note neo-cp-dir-note-err">{err}</div>
        ) : entries.length === 0 ? (
          <div className="neo-cp-dir-note">{t('neo.composer.dirEmpty', { defaultValue: '（无子目录）' })}</div>
        ) : (
          entries.map((e) => (
            <button
              key={e.path}
              type="button"
              onClick={() => load(e.path)}
              className="neo-cp-dir-entry"
            >
              {cur === undefined
                ? <HardDrive size={13} strokeWidth={1.8} aria-hidden className="neo-cp-dir-entry-drive" />
                : <Folder size={13} strokeWidth={1.8} aria-hidden className="neo-cp-dir-entry-folder" />}
              <span className="neo-cp-dir-entry-name">{e.name}</span>
              <ChevronRight size={12} strokeWidth={1.8} aria-hidden className="neo-cp-dir-entry-chevron" />
            </button>
          ))
        )}
      </div>

      <div className="neo-cp-dir-foot">
        <span className="neo-cp-dir-foot-hint">
          {cur
            ? t('neo.composer.dirPickHint', { defaultValue: '选「此目录」= 该文件夹当 CLI 工作目录' })
            : t('neo.composer.dirPickRootHint', { defaultValue: '进入一个盘符后可选目录' })}
        </span>
        <button
          type="button"
          disabled={!cur}
          onClick={() => { if (cur) onPick(cur); }}
          className="neo-cp-dir-pick"
        >
          <Check size={12} strokeWidth={2.5} aria-hidden />
          {t('neo.composer.dirPick', { defaultValue: '选此目录' })}
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// NeoSkillUrlChip — composer 里出现 skill 形 URL 时的识别 chip（旧
// SkillUrlChip 的 Neo 重写）：preview → 「装并用」/「当普通链接」。
// ---------------------------------------------------------------------------

function NeoSkillUrlChip({
  url,
  onInstalled,
  onDismiss,
}: {
  url: string;
  onInstalled: (skill: SkillIngestSummary) => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<SkillPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    previewSkill(url)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((err: Error) => {
        if (!cancelled) setPreviewError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function handleInstall() {
    setInstalling(true);
    setInstallError(null);
    try {
      const result = await ingestSkill(url);
      onInstalled(result);
    } catch (err) {
      setInstallError((err as Error).message);
    } finally {
      setInstalling(false);
    }
  }

  const kindLabel =
    preview?.kind === 'git-repo'
      ? t('neo.composer.skillKindGit', { defaultValue: 'github 仓库' })
      : preview?.kind === 'raw-file'
        ? t('neo.composer.skillKindRaw', { defaultValue: '远程 markdown' })
        : preview
          ? t('neo.composer.skillKindText', { defaultValue: '文本' })
          : t('neo.composer.skillKindDetecting', { defaultValue: '识别中…' });

  return (
    <div className="neo-cp-urlchip" data-testid="skill-url-chip">
      <Link2 size={16} strokeWidth={2} aria-hidden className="neo-cp-urlchip-icon" />
      <div className="neo-cp-urlchip-body">
        <div className="neo-cp-urlchip-title">
          {t('neo.composer.skillDetected', { defaultValue: '检测到 skill 资源' })} · {kindLabel}
        </div>
        <div className="neo-cp-urlchip-url">{preview?.inferred_name ?? url}</div>
        {previewError && <div className="neo-cp-urlchip-err">{previewError}</div>}
        {installError && <div className="neo-cp-urlchip-err">{installError}</div>}
      </div>
      <button
        type="button"
        onClick={handleInstall}
        disabled={installing || !preview}
        className="neo-cp-urlchip-install"
      >
        {installing ? (
          <>
            <Loader2 size={12} className="neo-cp-spin" aria-hidden />
            {t('neo.composer.skillInstalling', { defaultValue: '装中' })}
          </>
        ) : (
          <>
            <Check size={12} strokeWidth={2.5} aria-hidden />
            {t('neo.composer.skillInstall', { defaultValue: '装并用' })}
          </>
        )}
      </button>
      <button type="button" onClick={onDismiss} className="neo-cp-urlchip-dismiss">
        <X size={12} strokeWidth={2} aria-hidden />
        {t('neo.composer.skillDismiss', { defaultValue: '当普通链接' })}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NeoSkillPickerModal — 已装 skill 列表 + URL ingest 弹窗（旧
// SkillPickerModal 的 Neo 重写）。两条路径殊途同归：回 SkillIngestSummary
// 给调用方 pin 成 pendingSkill。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// NeoPlusMenu — 加号两层弹出菜单（2026-10-31 用户需求：参考 WorkBuddy 交互 —
// 第一层竖排入口行，光标移入带「›」的行即在右侧弹出第二层列表面板）。
//   Layer 1：ClawHub ›（Claw 选择）/ Skill ›（已装 Skill 选择 + URL 导入）
//   Layer 2：搜索框 + 列表 + 底部动作（去 ClawHub 安装更多 / 打开 SkillPicker）
// 两个面板同处一个 fixed portal 容器（flex 排布），容器 mouseleave 才收起
// 第二层 —— 光标跨 8px 间隙移动不会闪断。空间不足时第二层翻到左侧。
// ---------------------------------------------------------------------------

function NeoPlusMenu({
  anchorRef,
  onClose,
  onPickClaw,
  onPickSkill,
  onOpenSkillPicker,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onPickClaw: (cliId: string) => void;
  onPickSkill: (item: InstalledSkill) => void;
  onOpenSkillPicker: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [claws, setClaws] = useState<DetectedCli[] | null>(null);
  const [skills, setSkills] = useState<InstalledSkill[] | null>(null);
  const [clawQuery, setClawQuery] = useState('');
  const [skillQuery, setSkillQuery] = useState('');
  // 当前展开的第二层（hover 驱动；null = 只显示第一层）。
  const [sub, setSub] = useState<'claw' | 'skill' | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    listDetectedClis()
      .then((snap) => { if (alive) setClaws(snap.items.filter((i) => i.is_claw && i.installed)); })
      .catch(() => { if (alive) setClaws([]); });
    listInstalledSkills()
      .then((items) => { if (alive) setSkills(items); })
      .catch(() => { if (alive) setSkills([]); });
    return () => { alive = false; };
  }, []);

  // 定位：锚点上方弹出，第二层默认在第一层右侧、空间不足翻左侧。
  const [pos, setPos] = useState<{ left: number; bottom: number; dir: 'right' | 'left' } | null>(null);
  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const L1_W = 232;
    const L2_W = 320;
    const dir: 'right' | 'left' =
      r.left + L1_W + 8 + L2_W > window.innerWidth - 8 && r.left - 8 - L2_W >= 8
        ? 'left'
        : 'right';
    setPos({ left: r.left, bottom: window.innerHeight - r.top + 8, dir });
  }, [anchorRef]);

  // 外点关闭（容器含两层面板，data-plus-menu 统一标识）。
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (rootRef.current?.contains(e.target)) return;
      if (anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [anchorRef, onClose]);

  if (!pos) return null;

  const q = (s: string) => s.trim().toLowerCase();
  const filteredClaws = (claws ?? []).filter(
    (c) =>
      !q(clawQuery) ||
      c.id.toLowerCase().includes(q(clawQuery)) ||
      (c.description ?? '').toLowerCase().includes(q(clawQuery)),
  );
  const filteredSkills = (skills ?? []).filter(
    (s) => !q(skillQuery) || s.id.toLowerCase().includes(q(skillQuery)) || s.name.toLowerCase().includes(q(skillQuery)),
  );

  return createPortal(
    <div
      ref={rootRef}
      className="neo-plus-root"
      data-plus-menu
      data-testid="neo-plus-menu"
      style={{
        left: pos.left,
        bottom: pos.bottom,
        flexDirection: pos.dir === 'left' ? 'row-reverse' : 'row',
      }}
      onMouseLeave={() => setSub(null)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Layer 1：竖排入口行（hover 带 › 的行弹出第二层）────────────────── */}
      <div className="neo-plus-menu">
        <button
          type="button"
          className={`neo-plus-item${sub === 'claw' ? ' on' : ''}`}
          data-testid="neo-plus-row-claw"
          onMouseEnter={() => setSub('claw')}
          onClick={() => setSub('claw')}
        >
          <span
            className="neo-plus-item-icon"
            style={{ color: '#f59e0b' }}
            aria-hidden
          >
            <PawPrint size={14} strokeWidth={2} />
          </span>
          <span className="neo-plus-item-name">
            {t('neo.composer.plusClawLabel', { defaultValue: 'ClawHub' })}
          </span>
          <ChevronRight size={13} strokeWidth={2} aria-hidden className="neo-plus-item-chev" />
        </button>

        <div className="neo-plus-divider" aria-hidden />

        <button
          type="button"
          className={`neo-plus-item${sub === 'skill' ? ' on' : ''}`}
          data-testid="neo-plus-row-skill"
          onMouseEnter={() => setSub('skill')}
          onClick={() => setSub('skill')}
        >
          <span className="neo-plus-item-icon" aria-hidden>
            <BookOpen size={14} strokeWidth={2} />
          </span>
          <span className="neo-plus-item-name">
            {t('neo.composer.plusSkillLabel', { defaultValue: 'Skill' })}
          </span>
          <ChevronRight size={13} strokeWidth={2} aria-hidden className="neo-plus-item-chev" />
        </button>
      </div>

      {/* ── Layer 2 · ClawHub：搜索 + 已装 Claw 列表 + 去 ClawHub ──────────── */}
      {sub === 'claw' && (
        <div className="neo-plus-sub" data-testid="neo-plus-sub-claw">
          <div className="neo-plus-sub-search">
            <Search size={13} strokeWidth={2} aria-hidden />
            <input
              value={clawQuery}
              onChange={(e) => setClawQuery(e.target.value)}
              placeholder={t('neo.composer.plusSearchClaw', { defaultValue: '搜索 Claw' })}
              className="neo-plus-sub-search-input"
            />
          </div>
          <div className="neo-plus-sub-list">
            {claws === null && (
              <div className="neo-plus-note">{t('common.loading', { defaultValue: '加载中…' })}</div>
            )}
            {claws !== null && filteredClaws.length === 0 && (
              <div className="neo-plus-note">
                {t('neo.composer.plusClawNone', { defaultValue: '还没有已安装的 Claw，去 ClawHub 装一个' })}
              </div>
            )}
            {filteredClaws.map((c) => {
              const brand = resolveClawMeta(c.id);
              // 2026-11-06 美化批：官方品牌 SVG 优先，未收录回落 monogram
              const glyph = BrandGlyph({ brandId: c.id, size: 14 });
              return (
                <button
                  key={c.id}
                  type="button"
                  className="neo-plus-item"
                  data-testid={`neo-plus-claw-${c.id}`}
                  title={c.description ?? c.id}
                  onClick={() => { onPickClaw(c.id); onClose(); }}
                >
                  <span
                    className="claw-brand-badge"
                    style={{
                      background: `color-mix(in oklab, ${brand.tint} 18%, transparent)`,
                      color: brand.tint,
                    }}
                    aria-hidden
                  >
                    {glyph ?? brand.monogram}
                  </span>
                  <span className="neo-plus-item-main">
                    <span className="neo-plus-item-name">{c.id}</span>
                    {c.description && (
                      <span className="neo-plus-item-desc">{c.description}</span>
                    )}
                  </span>
                  <span className="neo-plus-item-tag">Claw</span>
                </button>
              );
            })}
          </div>
          <div className="neo-plus-sub-foot">
            <button
              type="button"
              className="neo-plus-item neo-plus-item--more"
              data-testid="neo-plus-clawhub-more"
              onClick={() => { onClose(); navigate('/settings#clawhub'); }}
            >
              <span className="neo-plus-item-icon"><ExternalLink size={13} strokeWidth={2} aria-hidden /></span>
              <span className="neo-plus-item-name">
                {t('neo.composer.plusClawMore', { defaultValue: '去 ClawHub 浏览 / 安装更多' })}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── Layer 2 · Skill：搜索 + 已装 Skill 列表 + URL 导入 ─────────────── */}
      {sub === 'skill' && (
        <div className="neo-plus-sub" data-testid="neo-plus-sub-skill">
          <div className="neo-plus-sub-search">
            <Search size={13} strokeWidth={2} aria-hidden />
            <input
              value={skillQuery}
              onChange={(e) => setSkillQuery(e.target.value)}
              placeholder={t('neo.composer.plusSearchSkill', { defaultValue: '搜索 Skill' })}
              className="neo-plus-sub-search-input"
            />
          </div>
          <div className="neo-plus-sub-list">
            {skills === null && (
              <div className="neo-plus-note">{t('common.loading', { defaultValue: '加载中…' })}</div>
            )}
            {skills !== null && filteredSkills.length === 0 && (
              <div className="neo-plus-note">
                {t('neo.composer.plusSkillNone', { defaultValue: '还没有已装的 Skill' })}
              </div>
            )}
            {filteredSkills.map((s) => (
              <button
                key={s.id}
                type="button"
                className="neo-plus-item"
                data-testid={`neo-plus-skill-${s.id}`}
                title={s.name}
                onClick={() => { onPickSkill(s); onClose(); }}
              >
                <span className="neo-plus-item-icon" aria-hidden>
                  <BookOpen size={13} strokeWidth={2} />
                </span>
                <span className="neo-plus-item-main">
                  <span className="neo-plus-item-name">{s.name}</span>
                  <span className="neo-plus-item-desc">{s.source}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="neo-plus-sub-foot">
            <button
              type="button"
              className="neo-plus-item neo-plus-item--more"
              data-testid="neo-plus-import-skill"
              onClick={() => { onClose(); onOpenSkillPicker(); }}
            >
              <span className="neo-plus-item-icon"><Link2 size={13} strokeWidth={2} aria-hidden /></span>
              <span className="neo-plus-item-name">
                {t('neo.composer.plusImportSkill', { defaultValue: '导入 Skill（URL / 已装列表）' })}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function NeoSkillPickerModal({
  open,
  onClose,
  onPicked,
}: {
  open: boolean;
  onClose: () => void;
  onPicked: (skill: SkillIngestSummary) => void;
}) {
  const { t } = useI18n();
  const [installed, setInstalled] = useState<InstalledSkill[] | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setUrlInput('');
    listInstalledSkills()
      .then((items) => setInstalled(items))
      .catch(() => setInstalled([]));
  }, [open]);

  if (!open) return null;

  async function handleAddFromUrl() {
    const src = urlInput.trim();
    if (!src) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ingestSkill(src);
      onPicked(result);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handlePickInstalled(item: InstalledSkill) {
    // 已装 skill 合成 summary 形状，与新鲜 ingest 走同一代码路径。
    onPicked({
      skill_id: item.id,
      name: item.name,
      is_new: false,
      source_label: item.source,
      counts: item.counts,
      truncated: false,
    });
    onClose();
  }

  return (
    <div className="neo-cp-overlay" onClick={onClose} data-testid="skill-picker-modal">
      <div className="neo-cp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="neo-cp-modal-head">
          <div className="neo-cp-modal-title">
            {t('neo.composer.skillPickTitle', { defaultValue: '选择 Skill' })}
          </div>
          <button type="button" onClick={onClose} className="neo-cp-modal-x" aria-label={t('common.close', { defaultValue: '关闭' })}>
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="neo-cp-modal-sec">
          <div className="neo-cp-modal-label">
            {t('neo.composer.skillAddFromUrl', { defaultValue: '从 URL 或文本添加' })}
          </div>
          <div className="neo-cp-modal-urlrow">
            <div className="neo-cp-modal-urlbox">
              <Link2 size={14} strokeWidth={2} aria-hidden className="neo-cp-modal-urlbox-icon" />
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={t('neo.composer.skillUrlPlaceholder', { defaultValue: 'https://github.com/... 或粘贴 SKILL.md 内容' })}
                className="neo-cp-modal-urlinput"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddFromUrl();
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => void handleAddFromUrl()}
              disabled={busy || !urlInput.trim()}
              className="neo-cp-modal-add"
            >
              {busy ? <Loader2 size={14} className="neo-cp-spin" aria-hidden /> : null}
              {t('neo.composer.skillInstall', { defaultValue: '装并用' })}
            </button>
          </div>
          {error && <div className="neo-cp-modal-err">{error}</div>}
        </div>

        <div className="neo-cp-modal-list">
          <div className="neo-cp-modal-label">
            {t('neo.composer.skillInstalled', { defaultValue: '已装 Skill' })} ({installed?.length ?? '…'})
          </div>
          {installed === null && (
            <div className="neo-cp-modal-note">{t('common.loading')}</div>
          )}
          {installed && installed.length === 0 && (
            <div className="neo-cp-modal-note">
              {t('neo.composer.skillNone', { defaultValue: '还没装任何 skill。把 github URL 粘到上面即可。' })}
            </div>
          )}
          {installed && installed.length > 0 && (
            <ul className="neo-cp-modal-ul">
              {installed.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handlePickInstalled(item)}
                    className="neo-cp-modal-skill"
                    data-testid={`skill-picker-installed-${item.id}`}
                  >
                    <div className="neo-cp-modal-skill-name">{item.name}</div>
                    <div className="neo-cp-modal-skill-source">{item.source}</div>
                    <div className="neo-cp-modal-skill-counts">
                      {Object.entries(item.counts)
                        .filter(([, n]) => n > 0)
                        .map(([k, n]) => `${k}=${n}`)
                        .join(' · ') || 'empty'}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NeoComposer 本体
// ---------------------------------------------------------------------------

export function NeoComposer({
  onSubmit,
  placeholder,
  variant = 'chat',
  initialText,
  streaming = false,
  onStop,
  onNavigate,
  clawTarget,
  onClearClawTarget,
  onPickClaw,
  mentionItems,
  onScheduleCommand,
}: NeoComposerProps) {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [composer, setComposer] = useState(initialText ?? '');
  // 受控初始文本：变化时覆盖草稿（模板 chips 预填场景）。
  useEffect(() => {
    if (initialText !== undefined) setComposer(initialText);
  }, [initialText]);

  // ModelPicker 选择（与 run-session/chat 共享 sf.defaultExecutor + sf.model）。
  const [pickExecutor, setPickExecutor] = useState<string>(
    () => localStorage.getItem('sf.defaultExecutor') ?? '',
  );
  const [pickModel, setPickModel] = useState<string>(
    () => localStorage.getItem('sf.model') ?? '',
  );
  // CLI 工作目录（cwd）：选 → 存 sf.cwd → 调用方拼进请求（仅 cli:/acp:/mcp: 生效）。
  const [pickCwd, setPickCwd] = useState<string>(() => localStorage.getItem('sf.cwd') ?? '');
  const [showDirPicker, setShowDirPicker] = useState(false);
  const dirAnchorRef = useRef<HTMLButtonElement>(null);
  // Skill-URL 识别：dismissedUrls 记用户说「不」的 URL，免得每次击键重弹。
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(() => new Set());
  const [pendingSkill, setPendingSkill] = useState<SkillIngestSummary | null>(null);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  // 加号竖版菜单（2026-10-31）：Claw 挑选 + Skill 导入聚合入口。
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const plusAnchorRef = useRef<HTMLDivElement>(null);
  // `@` / `/` 内联命令菜单。
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[] | null>(null);
  // `/` 模式额外拉 GET /api/skills（含 `<id>:<cmd>` 子命令 + description）。
  const [catalogSkills, setCatalogSkills] = useState<SkillInfo[] | null>(null);
  const [commandMenu, setCommandMenu] = useState<NeoDetectedTrigger | null>(null);
  // 每个 skill 的编译状态（`@` 菜单打开时懒拉，作行内徽章；按 id 缓存）。
  const [skillStatusById, setSkillStatusById] = useState<Record<string, CompileStatus>>({});
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [knowledge, setKnowledge] = useState<string[]>([]); // selected pack IDs
  const [knowledgePacks, setKnowledgePacks] = useState<KnowledgePack[] | null>(null);
  const [knowledgePacksLoading, setKnowledgePacksLoading] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const knowledgeRef = useRef<HTMLDivElement | null>(null);

  // 点外关闭（knowledge 弹层）。
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const tgt = e.target as Node;
      if (knowledgeOpen && knowledgeRef.current && !knowledgeRef.current.contains(tgt)) setKnowledgeOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [knowledgeOpen]);

  // toast 自动消失。
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  // 首次打开菜单时懒拉已装 skill；`/` 模式另拉 catalog（含子命令描述）。
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

  // `@` 菜单开着时为未缓存的 skill 拉编译状态（行内徽章）。
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

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleSubmit() {
    const text = composer.trim();
    if (!text) return;

    // pendingSkill（菜单显式选择）优先；否则用 canonical parseSkillToken
    // 从文本里的 `@<skill-id>` 自动解析（与服务端路由逐字节一致，防
    // `user@gmail.com` 误判为 `@gmail`）。
    let resolvedSkillName = pendingSkill?.skill_id;
    if (!resolvedSkillName && installedSkills && installedSkills.length > 0) {
      const { skill_id: parsedId } = parseSkillToken(text);
      if (parsedId) {
        const exact = installedSkills.find((s) => s.id === parsedId);
        const hit = exact ?? installedSkills.find(
          (s) => s.id.toLowerCase() === parsedId.toLowerCase(),
        );
        if (hit) {
          resolvedSkillName = hit.id;
          console.log(`[NeoComposer] auto-resolved skill_name from goal token: @${hit.id}`);
        }
      }
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
      // 提交成功清空输入框 + 附件（发出即清，不残留）；失败保留文字方便重发。
      setComposer('');
      setAttachments([]);
      // skill 只在「当轮 @ 或显式选中」生效，提交后清 pendingSkill 不静默粘住。
      setPendingSkill(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // 菜单开着时 ↑↓↵ Esc Tab 归 NeoCommandMenu 的全局监听管，不重复提交。
    if (commandMenu && (e.key === 'Enter' || e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab')) {
      return;
    }
    // Enter = 发送，Shift+Enter = 换行（⌘/Ctrl+Enter 保留为备用快捷键）。
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

  // onChange 时对当前文本 + 光标跑 detectTrigger；敲过空白/删光触发符即关。
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

  // 选中：把 [start, end) 换成所选 token + 副作用。
  function handleCommandPick(item: NeoMenuItem) {
    if (!commandMenu) return;
    const { mode: triggerMode, start, end } = commandMenu;
    const before = composer.slice(0, start);
    const after = composer.slice(end);
    if (item.id.startsWith('member:')) {
      // 群聊 @ 提及成员（OpenBot 定向派活）：插入 `@<成员id> ` token。token 用
      // id 而非显示名——后端 parseMentions 按 id/name 双锚匹配，id 恒唯一稳定；
      // 显示名放 title 供菜单展示，不进文本。纯文本插入，无 skill 副作用。
      const memberId = item.id.slice('member:'.length);
      const insert = `${triggerMode}${memberId} `;
      setComposer(before + insert + after);
      setToast(t('neo.composer.memberMentioned', { defaultValue: `已点名 ${item.title}，消息将定向派发` }));
      setTimeout(() => {
        const el = composerRef.current;
        if (el) {
          const pos = start + insert.length;
          el.focus();
          el.setSelectionRange(pos, pos);
        }
      }, 0);
    } else if (item.id.startsWith('skill:')) {
      const skillId = item.id.slice('skill:'.length);
      const insert = `${triggerMode}${skillId} `;
      setComposer(before + insert + after);
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
      setToast(t('neo.composer.skillSelected', { defaultValue: `已选 Skill: ${displayName}` }));
      setTimeout(() => {
        const el = composerRef.current;
        if (el) {
          const pos = start + insert.length;
          el.focus();
          el.setSelectionRange(pos, pos);
        }
      }, 0);
    } else {
      // 内建 slash 命令：抹掉已敲的 `/<query>` 并执行动作。
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
        setToast(t('neo.composer.cleared', { defaultValue: '已清空' }));
        break;
      case 'skill':
        setSkillPickerOpen(true);
        break;
      case 'help':
        setToast(t('neo.composer.helpHint', { defaultValue: '快捷键: @ 提及 Skill · / 命令' }));
        break;
      case 'inspect':
        // runs 历史列表是 NeoApp 内部视图（view:'runs'），不是 react-router
        // 路由（navigate('/runs') 会被 catch-all 重定向回 '/'）——走 NeoApp
        // 透传的 onNavigate；独立路由页无 NeoApp 壳时回落原行为。
        if (onNavigate) onNavigate({ view: 'runs' });
        else navigate('/runs');
        break;
      case 'schedule':
        // GrokBot 对齐（2026-11-05）— /schedule 弹轻量定时任务表单（调用方
        // 持有会话上下文：DM 挂 agent / 群挂 group_id）。
        onScheduleCommand?.();
        break;
      case 'reload':
        // POST /api/skills/reload 让服务端重扫 FS。
        fetch(`${getApiBase()}/api/skills/reload`, { method: 'POST' })
          .then((r) => r.json())
          .then((data: { reloaded?: number }) => {
            setInstalledSkills(null);
            setToast(t('neo.composer.reloaded', { defaultValue: `已重新加载 ${data.reloaded ?? '?'} 个 skill` }));
          })
          .catch(() => setToast(t('neo.composer.reloadFailed', { defaultValue: 'reload 失败' })));
        break;
      default:
        setToast(t('neo.composer.cmdUnimplemented', { defaultValue: `/${id} 未实现` }));
    }
  }

  // 编译状态行内徽章（theme-aware 令牌色）。
  function skillStatusBadge(status: CompileStatus | undefined): ReactNode {
    if (!status) {
      return (
        <span className="neo-cp-badge">
          <CircleDashed size={11} aria-hidden /> …
        </span>
      );
    }
    if (status.status === 'compiled' && status.compiled) {
      const c = status.compiled;
      const meta = c.mode === 'team' ? `team·${c.members_count ?? 0}` : c.mode;
      return (
        <span className="neo-cp-badge" data-tone="ok">
          <CheckCircle2 size={11} aria-hidden /> {meta}
        </span>
      );
    }
    if (status.status === 'compiling') {
      return (
        <span className="neo-cp-badge" data-tone="run">
          <Loader2 size={11} className="neo-cp-spin" aria-hidden />
          {t('neo.composer.compiling', { defaultValue: '编译中' })}
        </span>
      );
    }
    if (status.status === 'failed') {
      return (
        <span className="neo-cp-badge" data-tone="warn">
          <XCircle size={11} aria-hidden />
          {t('neo.composer.compileFailed', { defaultValue: '降级' })}
        </span>
      );
    }
    return (
      <span className="neo-cp-badge">
        <CircleDashed size={11} aria-hidden />
        {t('neo.composer.notCompiled', { defaultValue: '未编译' })}
      </span>
    );
  }

  const commandMenuItems: NeoMenuItem[] = useMemo(() => {
    if (!commandMenu) return [];
    const sortedSkills = [...(installedSkills ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, 'zh-CN'),
    );
    const skillItems: NeoMenuItem[] = sortedSkills.map((s) => {
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
        badge: commandMenu.mode === '@' ? skillStatusBadge(skillStatusById[s.id]) : undefined,
      };
    });
    if (commandMenu.mode === '@') {
      // 群聊 @ 提及成员排在 Skills 之前（点名活人 > 挂技能，高频动作优先）。
      const memberItems: NeoMenuItem[] = (mentionItems ?? []).map((a) => ({
        id: `member:${a.id}`,
        title: `@${a.name}`,
        subtitle: a.role?.trim() || `定向派活 · ${a.id}`,
        hint: 'member',
      }));
      return [...memberItems, ...skillItems];
    }
    const subCommandItems: NeoMenuItem[] = (catalogSkills ?? [])
      .filter((s) => s.skill_id.includes(':'))
      .sort((a, b) => a.skill_id.localeCompare(b.skill_id, 'en'))
      .map((s) => ({
        id: `skill:${s.skill_id}`,
        title: `/${s.skill_id}`,
        subtitle: s.description || s.name,
        hint: 'command',
      }));
    const builtin: NeoMenuItem[] = [
      { id: 'clear', title: '/clear', subtitle: '清空 composer + 已选 skill / 附件', hint: 'command' },
      { id: 'skill', title: '/skill', subtitle: '打开 Skill picker（URL 导入）', hint: 'command' },
      { id: 'reload', title: '/reload', subtitle: '后端重新扫描 .shadowflow/skills/', hint: 'command' },
      { id: 'inspect', title: '/inspect', subtitle: '跳转到 Runs 历史页', hint: 'command' },
      // GrokBot 对齐（2026-11-05）— 会话内快捷建定时任务（仅调用方接了回调才出）。
      ...(onScheduleCommand
        ? [{ id: 'schedule', title: '/schedule', subtitle: '给这个会话加一个定时任务', hint: 'command' }]
        : []),
      { id: 'help', title: '/help', subtitle: '快捷键提示', hint: 'command' },
    ];
    return [...builtin, ...subCommandItems, ...skillItems];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandMenu, installedSkills, catalogSkills, skillStatusById, mentionItems]);

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

  const hasText = composer.trim().length > 0;

  return (
    <div className={`neo-composer neo-composer-${variant}`}>
      {/* 卡壳沿用 hf-card / sf-uc-hero：neo-chat.css 的 radius/阴影覆写继续生效 */}
      <div
        className={`neo-cp-card hf-card${variant === 'hero' ? ' sf-uc-hero' : ''}`}
        data-testid="unified-composer"
        data-variant={variant}
      >
        {(() => {
          if (pendingSkill) {
            return (
              <div className="neo-cp-skill-ready" data-testid="skill-ready-chip">
                <span className="neo-cp-skill-ready-name">✓ {pendingSkill.name} 已装</span>
                <span className="neo-cp-skill-ready-counts">
                  {Object.entries(pendingSkill.counts)
                    .filter(([, n]) => n > 0)
                    .map(([k, n]) => `${k}=${n}`)
                    .join(', ') || 'empty'}
                </span>
                <button
                  type="button"
                  onClick={() => setPendingSkill(null)}
                  className="neo-cp-skill-ready-x"
                >
                  {t('common.cancel', { defaultValue: '取消' })}
                </button>
              </div>
            );
          }
          const url = extractSkillUrl(composer);
          if (!url || dismissedUrls.has(url)) return null;
          return (
            <div className="neo-cp-urlchip-wrap">
              <NeoSkillUrlChip
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
        <div className="neo-cp-input-wrap">
          <textarea
            ref={composerRef}
            value={composer}
            onChange={handleComposerChange}
            onKeyDown={handleComposerKey}
            onSelect={(e) => {
              // 光标移动（方向键/点击）时重新检测触发符，否则回到文本中已有
              // 的 `@xxx` token 里菜单不会复开。
              const el = e.target as HTMLTextAreaElement;
              const trigger = detectTrigger(el.value, el.selectionStart ?? 0);
              setCommandMenu(trigger);
            }}
            placeholder={placeholder ?? t('start.composerPlaceholder') + ' · 试试 @ 提及 Skill 或 / 命令'}
            data-testid="start-composer"
            className="neo-cp-textarea"
          />
          <NeoCommandMenu
            open={commandMenu !== null}
            mode={commandMenu?.mode ?? '@'}
            query={commandMenu?.query ?? ''}
            items={commandMenuItems}
            onSelect={handleCommandPick}
            onClose={() => setCommandMenu(null)}
          />
        </div>

        {/* 附件 chips —— 仅在有附件时渲染 */}
        {attachments.length > 0 && (
          <div className="neo-cp-attachments" data-testid="start-attachments">
            {attachments.map((a) => (
              <span
                key={a.id}
                data-testid={`start-attachment-${a.type}`}
                className="neo-cp-attach"
              >
                <span aria-hidden className="neo-cp-attach-icon">
                  {a.type === 'file' ? (
                    <Paperclip size={12} strokeWidth={2} />
                  ) : a.type === 'url' ? (
                    <Link2 size={12} strokeWidth={2} />
                  ) : (
                    <Hash size={12} strokeWidth={2} />
                  )}
                </span>
                <span className="neo-cp-attach-label">{a.label}</span>
                {a.meta && <span className="neo-cp-attach-meta">· {a.meta}</span>}
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  aria-label={t('start.attachmentRemove')}
                  className="neo-cp-attach-x"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* ── chip 行：导入 Skill ｜ Claw target ｜ 模型 ｜ 目录 ｜ 模式 ｜ 知识 ｜ 发送 ── */}
        <div className="neo-cp-bar">
          {/* 加号 = 竖版弹出菜单（2026-10-31）：从 ClawHub 挑选 / 导入 Skill。
              原行为（直接开 SkillPicker）移入菜单第二项。 */}
          <div ref={plusAnchorRef} className="neo-cp-pop-anchor">
            <NeoChipBtn
              glyph={<Plus size={16} strokeWidth={1.75} />}
              onClick={() => setPlusMenuOpen((v) => !v)}
              testId="start-chip-import-skill"
              title={t('start.importSkill')}
            />
            {plusMenuOpen && (
              <NeoPlusMenu
                anchorRef={plusAnchorRef}
                onClose={() => setPlusMenuOpen(false)}
                onPickClaw={(id) => onPickClaw?.(id)}
                onPickSkill={(item) => {
                  // 已装 skill 合成 summary 形状，与 SkillPicker 走同一代码路径。
                  setPendingSkill({
                    skill_id: item.id,
                    name: item.name,
                    is_new: false,
                    source_label: item.source,
                    counts: item.counts,
                    truncated: false,
                  });
                  setToast(t('neo.composer.skillSelected', { defaultValue: `已选 Skill: ${item.name}` }));
                }}
                onOpenSkillPicker={() => setSkillPickerOpen(true)}
              />
            )}
          </div>

          {/* ClawHub（2026-06，FR-03）：Claw 聊天 target 徽章（增量；点击 × 清除） */}
          {clawTarget && (
            <span className="neo-cp-chip claw-target-chip" data-testid="claw-target-chip">
              <span aria-hidden className="neo-cp-chip-icon">
                <PawPrint size={13} strokeWidth={2} />
              </span>
              <span>{clawTarget.name || clawTarget.cliId}</span>
              <span className="claw-badge-mini">Claw</span>
              {onClearClawTarget && (
                <button
                  type="button"
                  className="neo-cp-attach-x"
                  onClick={onClearClawTarget}
                  aria-label={t('clawhub.composer.clearTarget', { defaultValue: '取消 Claw 对话' })}
                  data-testid="claw-target-clear"
                >
                  ×
                </button>
              )}
            </span>
          )}

          <NeoModelPicker
            value={{ executor: pickExecutor, model: pickModel }}
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

          <div className="neo-cp-dir-anchor">
            <button
              ref={dirAnchorRef}
              type="button"
              title={
                pickCwd
                  ? t('neo.composer.dirCurrent', { defaultValue: `CLI 工作目录: ${pickCwd}` })
                  : t('neo.composer.dirSelect', { defaultValue: '选择 CLI 工作目录' })
              }
              onClick={() => setShowDirPicker((v) => !v)}
              data-testid="start-chip-dir"
              className={`neo-cp-dir-btn sf-press sf-focus-ring${showDirPicker ? ' on' : ''}${pickCwd ? ' configured' : ''}`}
            >
              <FolderOpen size={14} strokeWidth={1.8} aria-hidden />
            </button>
            {showDirPicker && (
              <NeoDirPicker
                value={pickCwd || undefined}
                anchorRef={dirAnchorRef}
                title={t('neo.composer.dirPickTitle', { defaultValue: '选择 CLI 工作目录' })}
                onPick={(p) => {
                  localStorage.setItem('sf.cwd', p);
                  setPickCwd(p);
                  setShowDirPicker(false);
                }}
                onClose={() => setShowDirPicker(false)}
              />
            )}
          </div>

          {/* KNOWLEDGE chip — 调 /knowledge/packs */}
          <div ref={knowledgeRef} className="neo-cp-pop-anchor">
            <NeoChipBtn
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
              <div className="neo-cp-pop neo-cp-pop--wide">
                <div className="neo-cp-pop-head">{t('start.knowledgeLabel')}</div>
                {knowledgePacksLoading ? (
                  <div className="neo-cp-pop-note">{t('start.knowledgeLoading')}</div>
                ) : knowledgePacks && knowledgePacks.length > 0 ? (
                  knowledgePacks.map((pack) => {
                    const on = knowledge.includes(pack.pack_id);
                    return (
                      <button
                        key={pack.pack_id}
                        type="button"
                        onClick={() => toggleKnowledgePack(pack.pack_id)}
                        data-testid={`start-knowledge-pack-${pack.pack_id}`}
                        className={`neo-cp-pop-row neo-cp-pop-row--pack${on ? ' on' : ''}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`neo-cp-checkbox${on ? ' on' : ''}`}
                        />
                        <span className="neo-cp-pop-row-label">{pack.name}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="neo-cp-pop-empty">
                    <p className="neo-cp-pop-empty-text">{t('start.knowledgeEmpty')}</p>
                    <button
                      type="button"
                      onClick={() => { setKnowledgeOpen(false); navigate('/knowledge'); }}
                      className="neo-cp-pop-empty-link"
                    >
                      <ArrowRight size={11} strokeWidth={2} aria-hidden />
                      {t('start.knowledgeManage')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="neo-cp-bar-spacer" />
          {streaming ? (
            /* 流式中：发送钮原地变「停止」（同位切换，对齐竞品）。 */
            <button
              type="button"
              onClick={() => onStop?.()}
              className="neo-cp-stop sf-press sf-focus-ring"
              data-testid="composer-stop"
              aria-label={t('neo.composer.stop', { defaultValue: '停止生成' })}
              title={t('neo.composer.stop', { defaultValue: '停止生成' })}
            >
              <span aria-hidden className="neo-cp-stop-square" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || !hasText}
              className={`neo-cp-submit sf-press sf-focus-ring${hasText ? '' : ' is-empty'}`}
              data-testid="start-submit"
              aria-label={t('start.submit')}
              title={t('start.submit')}
            >
              {submitting ? <Loader2 size={15} className="neo-cp-spin" aria-hidden /> : <ArrowUp size={14} strokeWidth={2} aria-hidden />}
            </button>
          )}
        </div>

        {/* 提交错误条（onSubmit 抛错时展示，可关闭） */}
        {submitError && (
          <div role="alert" data-testid="composer-submit-error" className="neo-cp-error">
            <span className="neo-cp-error-text">{submitError}</span>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              aria-label={t('common.close', { defaultValue: '关闭' })}
              className="neo-cp-error-x"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div role="status" data-testid="start-toast" className="neo-cp-toast">
          {toast}
        </div>
      )}

      <NeoSkillPickerModal
        open={skillPickerOpen}
        onClose={() => setSkillPickerOpen(false)}
        onPicked={(skill) => setPendingSkill(skill)}
      />
    </div>
  );
}

export default NeoComposer;
