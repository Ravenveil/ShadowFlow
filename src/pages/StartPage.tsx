/**
 * StartPage — Hi-Fi v2 reskin (Pages-A T2).
 *
 * Visual blueprint: `hf-start.jsx` HfStart (centered hero + composer + chips).
 * Wrapped by `<HfLayout>` from AppRoutes — this component renders only the
 * inner content column (HfTopBar + body), NOT another sidebar / <main>.
 *
 * Functional preservations from the previous implementation:
 *  - 3 primitive cards (Agent / Team / Templates) with their data-testids
 *    (primitive-card-agent / -team / -templates) and navigation targets.
 *  - "Recent drafts" section driven by listCatalogApps({ page_size: 3 }) with
 *    the same empty-state text "暂无最近记录" and the same console.warn fallback.
 *  - GoalClarityWizard inline trigger + the ?wizard=1 URL param auto-open.
 *  - Composer textarea with ⌘⏎ submit, navigates to /builder (mode=team) so
 *    "describe a goal" naturally lands in the team builder — matching the
 *    spec's "✦ 生成 team" CTA.
 */
import React, { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Sparkles,
  User,
  Users,
  Workflow,
  BookOpen,
  Paperclip,
  Link2,
  Hash,
  Clipboard,
  History,
  Download,
  ArrowRight,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Trash2,
} from 'lucide-react';
import { getApiBase } from '../api/_base';
import { useSecretsStore } from '../core/hooks/useSecretsStore';
import { listCatalogApps } from '../api/catalog';
import { listPacks } from '../api/knowledge';
import type { KnowledgePack } from '../common/types/knowledge';
import { listRuns, deleteRun } from '../api/runs';
import type { RunRecord } from '../api/runs';
import type { CatalogAppSummary } from '../common/types/catalog';
import { GoalClarityWizard } from '../core/components/builder/GoalClarityWizard';
import { HfTopBar } from '../components/hifi';
import { useI18n } from '../common/i18n';
import { SkillUrlChip } from '../components/SkillUrlChip';
import { SkillPickerModal } from '../components/SkillPickerModal';
import { extractSkillUrl, listInstalledSkills, type SkillIngestSummary, type InstalledSkill } from '../api/skillIngest';
import { listSkills, type SkillInfo } from '../api/skills';
import { CommandMenu, detectTrigger, type CommandMenuItem } from '../components/composer/CommandMenu';
// Round 4 PR-E — canonical `@<id>` parser shared with the server route, plus
// the live compile-status dropdown that surfaces "已编译 · team · 6 agents"
// next to the existing CommandMenu.
import { parseSkillToken } from '../lib/skillToken';
import { SkillDropdown } from '../components/SkillDropdown';

// ---------------------------------------------------------------------------
// Recent drafts helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <div
        style={{
          width: 128,
          height: 12,
          borderRadius: 4,
          background: 'var(--t-panel-2)',
        }}
      />
      <div
        style={{
          width: 56,
          height: 10,
          borderRadius: 4,
          background: 'var(--t-panel-2)',
        }}
      />
    </div>
  );
}

interface RecentDraftsProps {
  onNavigateCatalog: () => void;
}

function RecentDrafts({ onNavigateCatalog }: RecentDraftsProps) {
  const { t } = useI18n();
  const [apps, setApps] = useState<CatalogAppSummary[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listCatalogApps({ page_size: 3 })
      .then((resp) => {
        if (!cancelled) setApps(resp.data.apps.slice(0, 3));
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[StartPage] listCatalogApps failed:', err);
        if (!cancelled) setApps([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section style={{ width: '100%' }}>
      <div className="hf-label" style={{ marginBottom: 10 }}>
        {t('start.recentLabel')}
      </div>
      <div className="hf-card" style={{ padding: 14 }}>
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : !apps || apps.length === 0 ? (
          <p style={{ padding: '6px 2px', fontSize: 13, color: 'var(--t-fg-3)', margin: 0 }}>
            {t('start.recentEmpty')}
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {apps.map((app, i) => (
              <li
                key={app.app_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 2px',
                  borderTop: i > 0 ? '1px dashed var(--t-border)' : 'none',
                }}
              >
                <button
                  type="button"
                  onClick={onNavigateCatalog}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--t-fg-2)',
                  }}
                >
                  {app.name}
                </button>
                <span className="hf-meta" style={{ fontSize: 10 }}>
                  {fmtDate(app.published_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Composer structured-field helpers — FieldGroup label + horizontal Pill row
// ---------------------------------------------------------------------------

interface FieldGroupProps {
  label: string;
  right?: string;
  children: React.ReactNode;
}

// Kept for future composer extensions (G6 chip-row redo replaced its usage).
// Exported (instead of deleted) per CLAUDE.md "只能加，不能删" rule.
export function _FieldGroup({ label, right, children }: FieldGroupProps) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span className="hf-label">{label}</span>
        {right && (
          <span className="hf-meta" style={{ fontSize: 10 }}>
            {right}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
    </div>
  );
}

interface PillProps {
  active: boolean;
  onClick: () => void;
  testId?: string;
  children: React.ReactNode;
}

// Kept for future composer extensions (G6 chip-row redo replaced its usage).
// Exported (instead of deleted) per CLAUDE.md "只能加，不能删" rule.
export function _Pill({ active, onClick, testId, children }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 999,
        border: active
          ? '1px solid var(--t-accent)'
          : '1px solid var(--t-border)',
        background: active ? 'var(--t-accent-tint)' : 'transparent',
        color: active ? 'var(--t-accent)' : 'var(--t-fg-2)',
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 140ms ease, color 140ms ease, border-color 140ms ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          border: active
            ? '3px solid var(--t-accent)'
            : '1px solid var(--t-fg-4)',
          background: active ? 'var(--t-accent-ink)' : 'transparent',
          flexShrink: 0,
        }}
      />
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// ChipBtn — unified ghost/hover/active/configured chip button (G6 redo).
//
// Visual contract:
//   default ghost:  transparent bg, no border, fg-3 color, h28 fs11 pad 0/8
//   hover:          panel-2 bg, fg-2 color
//   active (popover open): accent-tint bg, accent fg
//   configured (non-default value, popover closed): bg-elev-2/panel-2 fill,
//                                                    fg color, fontWeight 600
//   active && configured → active visual wins
//
// Used by Mode / Output / Knowledge / Audience / +Add chips in the composer.
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
// Primitive cards (preserved from previous design — folded under the chips)
// ---------------------------------------------------------------------------

interface PrimitiveCardProps {
  testId: string;
  glyph: string;
  title: string;
  description: string;
  onClick: () => void;
}

function PrimitiveCard({ testId, glyph, title, description, onClick }: PrimitiveCardProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="hf-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        textAlign: 'left',
        cursor: 'pointer',
        background: 'var(--t-panel)',
        color: 'var(--t-fg)',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          background: 'var(--t-accent-tint)',
          color: 'var(--t-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          fontWeight: 800,
        }}
      >
        {glyph}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-fg)' }}>{title}</div>
        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            lineHeight: 1.55,
            color: 'var(--t-fg-3)',
          }}
        >
          {description}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// RecentRuns — 2-col grid showing last few runs (from Wireframe v2 design)
// ---------------------------------------------------------------------------

const RUN_STATUS_META: Record<string, { label: string; color: string; Icon: typeof Play }> = {
  // Legacy projection statuses — kept for forward-compat if list ever
  // returns a mix of in-flight runs and persisted records.
  running:         { label: 'running',   color: '#22c55e', Icon: Play },
  paused:          { label: 'paused',    color: '#f59e0b', Icon: Pause },
  waiting_user:    { label: 'waiting',   color: '#f59e0b', Icon: Pause },
  awaiting_approval:{ label: 'approval', color: '#f59e0b', Icon: Pause },
  succeeded:       { label: 'done',      color: '#6b7280', Icon: CheckCircle2 },
  cancelled:       { label: 'cancelled', color: '#6b7280', Icon: XCircle },
  // Story 15.8 — RunRecord statuses returned by the persisted /api/runs.
  completed:       { label: 'done',      color: '#6b7280', Icon: CheckCircle2 },
  failed:          { label: 'failed',    color: '#ef4444', Icon: XCircle },
};

function fmtRelative(iso: string): string {
  /* TODO: i18n — relative time strings (刚刚 / N 分钟前 / N 小时前 / N 天前) need locale-aware keys */
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return `${m} 分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小时前`;
    return `${Math.floor(h / 24)} 天前`;
  } catch {
    return '—';
  }
}

function RecentRuns() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRuns()
      .then((data) => { if (!cancelled) setRuns(data.slice(0, 6)); })
      .catch(() => { if (!cancelled) setRuns([]); });
    return () => { cancelled = true; };
  }, []);

  const handleDelete = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation();
    setRuns(prev => prev?.filter(r => r.run_id !== runId) ?? prev);
    try { await deleteRun(runId); } catch { /* best-effort */ }
  };

  if (runs !== null && runs.length === 0) return null;

  return (
    <section style={{ width: '100%' }}>
      <div className="hf-label" style={{ marginBottom: 10 }}>
        {t('start.recentRunsLabel')}
      </div>
      {runs === null ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ height: 60, borderRadius: 8, background: 'var(--t-panel-2)', animation: 'sf-pulse 1.4s ease-in-out infinite' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {runs.map((run) => {
            const meta = RUN_STATUS_META[run.status] ?? { label: run.status, color: 'var(--t-fg-4)', Icon: Play };
            const title = run.goal && run.goal.trim().length > 0
              ? run.goal
              : (run.skill_display_name || run.run_id.slice(0, 8));
            return (
              <div
                key={run.run_id}
                className="hf-card"
                onClick={() => navigate(`/run-session/${run.session_id}?goal=${encodeURIComponent(run.goal ?? '')}`)}
                style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', position: 'relative', overflow: 'hidden', minWidth: 0 }}
                title={run.goal}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                    {title}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: meta.color, flexShrink: 0 }}>
                    <meta.Icon size={10} strokeWidth={2.5} aria-hidden />
                    {meta.label}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, run.run_id)}
                    title="删除"
                    style={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, borderRadius: 4, cursor: 'pointer', color: 'var(--t-fg-4)', flexShrink: 0, opacity: 0.5 }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--t-err, #ef4444)'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--t-fg-4)'; }}
                  ><Trash2 size={12} strokeWidth={2} /></button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {run.skill_display_name}
                  </span>
                  <span style={{ flexShrink: 0 }}>{fmtRelative(run.completed_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// StartPage
// ---------------------------------------------------------------------------

const SUGGESTIONS: Array<[string, string]> = [
  ['◇', '论文深读 — 找漏洞 + 写 review'],
  ['◈', '新闻编辑部 — 抓 → 编 → 审'],
  ['⬢', '创业速配 — BD/Dev/Marketing'],
  ['☷', '咨询小队 — 调研 + 报告'],
  ['◆', '客服分流 — inbox → DM 路由'],
  ['✦', '从零开始'],
];

interface SkillPack {
  glyph: string;
  name: string;
  desc: string;
  /** 真实 GitHub 仓库 URL。点击安装时由 daemon clone 到 .shadowflow/skills/<id>/,
   *  注册后真实 skill 内容（SKILL.md / 角色定义 / 子命令）由 skill registry 接管。
   *  canonical id 由 server 端从 URL slug 派生（OpenDesign 风格），前端不再
   *  携带 forced_id —— 详见 docs/architecture/orchestration-transport.md。 */
  source: {
    url: string;
    ref?: string;
    path?: string;
  };
  homepage?: string;
}

/** Stable React key + data-testid 友好的本地 slug。仅用于前端 DOM，不参与
 *  后端 skill 注册（后端会用自己派生的 canonical id）。 */
function packSlug(pack: SkillPack): string {
  return pack.name.toLowerCase().replace(/\s+/g, '-');
}

const SKILL_PACKS: SkillPack[] = [
  {
    glyph: '◈',
    name: 'BMAD Method',
    desc: 'Build, Measure, Architect, Deploy · 完整研发方法论',
    source: {
      url: 'https://github.com/bmadcode/BMAD-METHOD',
      ref: 'main',
    },
    homepage: 'https://github.com/bmadcode/BMAD-METHOD',
  },
  {
    glyph: '⬡',
    name: 'gSTACK',
    desc: 'Garry Tan 的 AI 研发工作流 · 调研→策略→执行',
    source: {
      url: 'https://github.com/garrytan/gstack',
      ref: 'main',
    },
    homepage: 'https://github.com/garrytan/gstack',
  },
];

interface SkillPackSectionProps {
  onSelect: (pack: SkillPack) => void;
  disabled?: boolean;
}

function SkillPackSection({ onSelect, disabled }: SkillPackSectionProps) {
  const { t } = useI18n();
  return (
    <section style={{ width: '100%' }} data-section="skill-pack">
      <div className="hf-label" style={{ marginBottom: 10 }}>
        {t('start.skillPacksLabel')}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 8,
        }}
      >
        {SKILL_PACKS.map((pack) => {
          const slug = packSlug(pack);
          return (
          <button
            key={slug}
            type="button"
            onClick={() => !disabled && onSelect(pack)}
            className="hf-card"
            data-testid={`skill-pack-${slug}`}
            disabled={disabled}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              textAlign: 'left',
              cursor: disabled ? 'not-allowed' : 'pointer',
              background: 'var(--t-panel)',
              color: 'var(--t-fg)',
              fontFamily: 'inherit',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <span
              aria-hidden
              style={{
                fontSize: 16,
                color: 'var(--t-accent)',
                lineHeight: 1,
                marginTop: 1,
                flexShrink: 0,
              }}
            >
              {pack.glyph}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t-fg)' }}>
                {pack.name}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 10.5,
                  color: 'var(--t-fg-4)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {pack.desc}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 9.5,
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--t-fg-5)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={pack.source.url}
              >
                {pack.source.url.replace(/^https?:\/\/(www\.)?github\.com\//, 'github.com/')}
              </div>
            </div>
          </button>
          );
        })}
      </div>
    </section>
  );
}

type Mode = 'auto' | 'single' | 'team';

// Attachments shown as chips between the textarea and the chip row.
type AttachmentType = 'file' | 'url' | 'cid';
interface Attachment {
  id: string;
  type: AttachmentType;
  label: string;
  meta?: string;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent);

export default function StartPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const { secrets } = useSecretsStore();
  const [showWizard, setShowWizard] = useState(false);
  const [composer, setComposer] = useState('');
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
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [knowledge, setKnowledge] = useState<string[]>([]); // selected pack IDs
  const [knowledgePacks, setKnowledgePacks] = useState<KnowledgePack[] | null>(null);
  const [knowledgePacksLoading, setKnowledgePacksLoading] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('auto');
  const [modeOpen, setModeOpen] = useState(false);
  const modeRef = useRef<HTMLDivElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const knowledgeRef = useRef<HTMLDivElement | null>(null);
  const addRef = useRef<HTMLDivElement | null>(null);
  // Close popovers on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (knowledgeOpen && knowledgeRef.current && !knowledgeRef.current.contains(t)) setKnowledgeOpen(false);
      if (modeOpen && modeRef.current && !modeRef.current.contains(t)) setModeOpen(false);
      if (addOpen && addRef.current && !addRef.current.contains(t)) setAddOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [knowledgeOpen, modeOpen, addOpen]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  function notImpl(label: string) {
    setToast(`${label} · ${t('common.comingSoon')}`);
  }

  // Add attachment (📎 file / 🔗 url / ⛓ cid). Prompts the user, pushes a chip
  // into the visible attachments list. TODO: replace mock prompt with real
  // file picker / URL input / 0G CID resolver once those flows ship.
  function addAttachment(type: AttachmentType) {
    const ask = type === 'file'
      ? t('start.filenameMock')
      : type === 'url'
        ? 'URL'
        : '0G CID';
    const value = typeof window !== 'undefined' ? window.prompt(ask, '') : null;
    if (!value || !value.trim()) return;
    const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const label = value.trim();
    let meta: string | undefined;
    if (type === 'file') meta = `${(Math.random() * 4 + 0.5).toFixed(1)}MB`;
    else if (type === 'url') meta = 'feed';
    else meta = '0G';
    setAttachments((prev) => [...prev, { id, type, label, meta }]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  // Auto-open wizard via ?wizard=1 (Story 13.4)
  useEffect(() => {
    if (searchParams.get('wizard') === '1') {
      setShowWizard(true);
    }
  }, [searchParams]);

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
          console.log(`[StartPage] auto-resolved skill_name from goal token: @${hit.id}`);
        }
      }
    }
    if (!resolvedSkillName) {
      console.log(`[StartPage] no skill resolved — backend will default to agent-team-blueprint`);
    } else {
      console.log(`[StartPage] POST with skill_name=${resolvedSkillName}`);
    }

    setSubmitting(true);

    // Forward the model-picker selection so the server uses the user's
    // chosen executor/model. Without these, the server falls back to
    // executor='cli:auto' (= claude) even when the picker shows glm-5.1.
    const executor = localStorage.getItem('sf.defaultExecutor') || undefined;
    const model = localStorage.getItem('sf.model') || undefined;
    // For byok:<provider>, derive `provider` so the server can:
    //   1. validate the provider id against PROVIDER_IDS
    //   2. look up the right BYOK key (header → byok-config → env)
    // Without `provider`, the server defaults validated_provider='anthropic'
    // and pulls the wrong key out of byok-config.
    const provider =
      executor && executor.startsWith('byok:') ? executor.slice(5) : undefined;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (secrets.anthropic) headers['X-Anthropic-Key'] = secrets.anthropic;
      const resp = await fetch(`${getApiBase()}/api/run-sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          goal: text,
          mode: mode !== 'auto' ? mode : undefined,
          executor,
          model,
          provider,
          // Story 16.x — when the user accepted the URL chip, forward the
          // ingested skill id so the server uses it instead of the default
          // 'agent-team-blueprint' template.
          skill_name: resolvedSkillName,
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { session_id: string };
        navigate(`/run-session/${data.session_id}?goal=${encodeURIComponent(text)}`);
        return;
      }
      const body = await resp.text().catch(() => '');
      setSubmitError(
        `创建 run-session 失败（HTTP ${resp.status}）。请检查后端 server 是否在运行（默认 :8002），或在「设置 → BYOK」配置 API Key。${body ? ` 详情：${body.slice(0, 200)}` : ''}`,
      );
    } catch (err) {
      setSubmitError(
        `无法连接后端 server。请确认 server 已启动（默认 :8002）并刷新页面。${err instanceof Error ? ` 错误：${err.message}` : ''}`,
      );
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
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
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
    const { mode, start, end } = commandMenu;
    const before = composer.slice(0, start);
    const after = composer.slice(end);
    // ── Skill items (id starts with 'skill:') — materialise the skill pack
    //    into agents/team. Same behaviour whether picked via @ or /. The
    //    inserted token uses the original trigger char so the user can see
    //    in the prompt which path they took.
    if (item.id.startsWith('skill:')) {
      const skillId = item.id.slice('skill:'.length);
      const insert = `${mode}${skillId} `;
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
        setToast('快捷键: ⌘↵ 发送 · @ 提及 Skill · / 命令');
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
  }, [commandMenu, installedSkills, catalogSkills]);

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

  function handleSuggestion(label: string) {
    if (label.startsWith('从零开始')) {
      // /builder route has been retired — keep the user on /start. The composer
      // textarea is right below; surfaces the action without an extra page.
      setSubmitError(null);
    } else {
      // Map suggestion to template gallery filtered by phrase
      navigate(`/templates?q=${encodeURIComponent(label)}`);
    }
  }

  async function handleSkillPack(pack: SkillPack) {
    setSubmitting(true);
    const executor = localStorage.getItem('sf.defaultExecutor') || undefined;
    const model = localStorage.getItem('sf.model') || undefined;
    const provider =
      executor && executor.startsWith('byok:') ? executor.slice(5) : undefined;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secrets.anthropic) headers['X-Anthropic-Key'] = secrets.anthropic;
    try {
      // Step 1 — install skill from the real GitHub URL via the existing
      // skill-ingest pipeline (server/src/skill-ingest/*). The daemon clones
      // pack.source.url into .shadowflow/skills/<id>/ and registers it. Re-runs
      // are idempotent: same URL → same cache → same skill id.
      // W1 (2026-05-22) — drop forced_id. Server derives canonical id from
      // the URL slug (OpenDesign-style), so any UI-side id would just race
      // the real one. installResp.id below is authoritative.
      // Real endpoint is POST /api/skills/ingest (see server/src/routes/skills.ts:293)
      // — POST /api/skills doesn't exist and proxy-fallback would forward to Python:8000.
      const installResp = await fetch(`${getApiBase()}/api/skills/ingest`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ source: pack.source.url }),
      });
      if (!installResp.ok) {
        const body = await installResp.text().catch(() => '');
        setSubmitError(
          `Skill Pack「${pack.name}」安装失败（HTTP ${installResp.status}）。源地址 ${pack.source.url}。${body ? ` 详情：${body.slice(0, 200)}` : ''}`,
        );
        return;
      }
      // Response shape from POST /api/skills/ingest:
      //   { data: { skill_id, name, is_new, probe, source_label, source_hash, prompt_block } }
      // (see server/src/routes/skills.ts:325)
      const installData = (await installResp.json()) as {
        data?: { skill_id?: string; name?: string };
      };
      // Fallback to local slug only when server response is missing id —
      // shouldn't happen post-W1 but keeps the launch flow resilient.
      const skill_id = installData.data?.skill_id ?? packSlug(pack);

      // Step 2 — launch a run session using the freshly installed skill_id.
      // The user goal is generic ("帮我用 <skill> 开始工作")—the real BMAD
      // / gstack content lives inside the cloned repo's SKILL.md and is read
      // by skill-loader.ts on register, not invented from a frontend prompt.
      const goal = `请使用刚安装的 ${pack.name} skill 开始协作。我的需求稍后会补充——先帮我把团队结构和工作流准备好。`;
      const resp = await fetch(`${getApiBase()}/api/run-sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ goal, skill_name: skill_id, mode: 'team', executor, model, provider }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { session_id: string };
        navigate(`/run-session/${data.session_id}?goal=${encodeURIComponent(goal)}`);
        return;
      }
      const body = await resp.text().catch(() => '');
      setSubmitError(
        `Skill Pack「${pack.name}」启动失败（HTTP ${resp.status}）。请确认后端 server 已启动（默认 :8002），或在「设置 → BYOK」配置 API Key。${body ? ` 详情：${body.slice(0, 200)}` : ''}`,
      );
    } catch (err) {
      setSubmitError(
        `无法连接后端 server，Skill Pack「${pack.name}」未能启动。请确认 server 已启动（默认 :8002）。${err instanceof Error ? ` 错误：${err.message}` : ''}`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid="start-page"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: 'var(--t-bg)',
        color: 'var(--t-fg)',
      }}
    >
      <HfTopBar hideWorkspace />

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '48px 32px 60px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 720,
            display: 'flex',
            flexDirection: 'column',
            gap: 32,
          }}
        >
          {/* Hero — design-pkg aligned (Geist heavy display + eyebrow pill + lead).
              Decorative purple glow sits behind, accent-tint eyebrow, sf-display-l
              scale heading (clamp for responsive), single-line lead. Additive only:
              all original copy preserved, no sections removed. */}
          <div style={{ textAlign: 'center', position: 'relative' }}>
            {/* Decorative glow ornament — pointer-events none, sits behind text */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: -120,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 560,
                height: 360,
                borderRadius: '50%',
                background:
                  'radial-gradient(ellipse, color-mix(in oklab, var(--t-accent) 18%, transparent) 0%, transparent 60%)',
                filter: 'blur(40px)',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
            <h1
              style={{
                position: 'relative',
                zIndex: 1,
                // Bricolage Grotesque variable display font — opsz axis lets it
                // read with extra display character at this large size.
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(36px, 6.2vw, 64px)',
                fontWeight: 800,
                lineHeight: 1.04,
                letterSpacing: '-.04em',
                margin: 0,
                color: 'var(--t-fg)',
              }}
            >
              {t('start.heroTitle')}
            </h1>
          </div>

          {/* Composer — textarea + structured fields + chip row, all in one box */}
          <div
            className="hf-card"
            style={{
              borderColor: 'color-mix(in oklab, var(--t-accent) 30%, var(--t-border))',
              boxShadow:
                '0 0 0 4px var(--t-accent-tint), 0 12px 32px -16px color-mix(in oklab, var(--t-accent) 35%, transparent)',
              padding: '14px 16px 12px',
            }}
          >
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
                placeholder={t('start.composerPlaceholder') + ' · 试试 @ 提及 Skill 或 / 命令'}
                data-testid="start-composer"
                style={{
                  width: '100%',
                  minHeight: 88,
                  resize: 'vertical',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: 'var(--t-fg)',
                }}
              />
              <CommandMenu
                open={commandMenu !== null}
                mode={commandMenu?.mode ?? '@'}
                query={commandMenu?.query ?? ''}
                items={commandMenuItems}
                onSelect={handleCommandPick}
                onClose={() => setCommandMenu(null)}
              />
              {/* PR-E (Round 4) — compile-status overlay. Mirrors the
                  CommandMenu's `@<id>` filter via the canonical token
                  parser so the user sees "已编译 · team · 6 agents"
                  before submitting. Hides when there's no @-token. */}
              <SkillDropdown
                composerText={composer}
                installedSkills={installedSkills}
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

            {/* ── Chip row · single layer · 5 chips + spacer + ⌘⏎ + ✦ go ── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                flexWrap: 'nowrap',
                marginTop: 12,
                paddingTop: 10,
                borderTop: '1px dashed var(--t-border)',
              }}
            >
              {/* + Add ▾ — aggregates 5 attachment actions */}
              <div ref={addRef} style={{ position: 'relative', flexShrink: 0 }}>
                <ChipBtn
                  glyph={<Plus size={14} strokeWidth={2} />}
                  label={attachments.length > 0 ? undefined : t('common.add')}
                  badge={attachments.length > 0 ? attachments.length : undefined}
                  hasArrow
                  active={addOpen}
                  configured={attachments.length > 0}
                  onClick={() => setAddOpen((v) => !v)}
                  testId="start-chip-add"
                  title={t('start.addAttachment')}
                />
                {addOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 6px)',
                      left: 0,
                      minWidth: 220,
                      background: 'var(--t-panel)',
                      border: '1px solid var(--t-border)',
                      borderRadius: 8,
                      padding: 4,
                      boxShadow: '0 8px 24px -8px rgba(0,0,0,.35)',
                      zIndex: 30,
                    }}
                  >
                    {(
                      [
                        {
                          glyph: <Paperclip size={14} strokeWidth={2} />,
                          label: t('start.uploadFile'),
                          testId: 'start-chip-attach',
                          onClick: () => {
                            setAddOpen(false);
                            addAttachment('file');
                          },
                        },
                        {
                          glyph: <Link2 size={14} strokeWidth={2} />,
                          label: 'URL',
                          testId: 'start-chip-url',
                          onClick: () => {
                            setAddOpen(false);
                            addAttachment('url');
                          },
                        },
                        {
                          glyph: <Hash size={14} strokeWidth={2} />,
                          label: '0G CID',
                          testId: 'start-chip-cid',
                          onClick: () => {
                            setAddOpen(false);
                            addAttachment('cid');
                          },
                        },
                        {
                          glyph: <Clipboard size={14} strokeWidth={2} />,
                          label: t('start.pasteClipboard'),
                          testId: 'start-chip-paste',
                          onClick: () => {
                            setAddOpen(false);
                            notImpl(t('start.pasteClipboard'));
                          },
                        },
                        {
                          glyph: <History size={14} strokeWidth={2} />,
                          label: t('start.recentPrompts'),
                          testId: 'start-chip-history',
                          onClick: () => {
                            setAddOpen(false);
                            notImpl(t('start.recentPrompts'));
                          },
                        },
                        {
                          glyph: <Download size={14} strokeWidth={2} />,
                          label: t('start.importSkill'),
                          testId: 'start-chip-import-skill',
                          onClick: () => {
                            setAddOpen(false);
                            setSkillPickerOpen(true);
                          },
                          accent: true,
                        },
                        {
                          glyph: <Workflow size={14} strokeWidth={2} />,
                          label: t('start.importWorkflow'),
                          testId: 'start-chip-import-workflow',
                          onClick: () => {
                            setAddOpen(false);
                            notImpl(t('start.importWorkflow'));
                          },
                          accent: true,
                        },
                      ] as Array<{
                        glyph: ReactNode;
                        label: string;
                        testId: string;
                        onClick: () => void;
                        accent?: boolean;
                      }>
                    ).map((item, idx) => (
                      <React.Fragment key={item.testId}>
                        {idx === 5 && (
                          <div style={{ height: 1, background: 'var(--t-border)', margin: '4px 6px' }} />
                        )}
                        <button
                          type="button"
                          onClick={item.onClick}
                          data-testid={item.testId}
                          style={{
                            display: 'flex',
                            width: '100%',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 10px',
                            background: 'transparent',
                            color: item.accent ? 'var(--t-accent)' : 'var(--t-fg-2)',
                            border: 'none',
                            borderRadius: 5,
                            fontSize: 12,
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background 120ms ease',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background =
                              item.accent ? 'var(--t-accent-tint)' : 'var(--t-panel-2)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              display: 'inline-flex',
                              width: 18,
                              height: 18,
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 14,
                              flexShrink: 0,
                            }}
                          >
                            {item.glyph}
                          </span>
                          <span style={{ flex: 1 }}>{item.label}</span>
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>

              {/* MODE chip · Auto (default) / Single / Team */}
              <div ref={modeRef} style={{ position: 'relative', flexShrink: 0 }}>
                <ChipBtn
                  glyph={
                    mode === 'auto' ? (
                      <Sparkles size={14} strokeWidth={2} />
                    ) : mode === 'single' ? (
                      <User size={14} strokeWidth={2} />
                    ) : (
                      <Users size={14} strokeWidth={2} />
                    )
                  }
                  label={
                    mode === 'auto'
                      ? t('start.modeAuto')
                      : mode === 'single'
                        ? t('start.modeSingle')
                        : t('start.modeTeam')
                  }
                  hasArrow
                  active={modeOpen}
                  configured={mode !== 'auto'}
                  onClick={() => setModeOpen((v) => !v)}
                  testId="start-mode-chip"
                  title={t('start.modeLabel')}
                />
                {modeOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 6px)',
                      left: 0,
                      minWidth: 140,
                      background: 'var(--t-panel)',
                      border: '1px solid var(--t-border)',
                      borderRadius: 8,
                      padding: 4,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                      zIndex: 30,
                    }}
                  >
                    {(['auto', 'single', 'team'] as Mode[]).map((m) => {
                      const on = mode === m;
                      const glyph: ReactNode =
                        m === 'auto' ? (
                          <Sparkles size={14} strokeWidth={2} />
                        ) : m === 'single' ? (
                          <User size={14} strokeWidth={2} />
                        ) : (
                          <Users size={14} strokeWidth={2} />
                        );
                      const label =
                        m === 'auto'
                          ? t('start.modeAutoDesc')
                          : m === 'single'
                            ? t('start.modeSingleDesc')
                            : t('start.modeTeamDesc');
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setMode(m);
                            setModeOpen(false);
                          }}
                          data-testid={`start-mode-${m}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: 5,
                            border: 'none',
                            background: on ? 'var(--t-accent-tint)' : 'transparent',
                            color: on ? 'var(--t-accent)' : 'var(--t-fg-2)',
                            fontWeight: on ? 700 : 500,
                            fontSize: 12,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            textAlign: 'left',
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              display: 'inline-flex',
                              width: 14,
                              height: 14,
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {glyph}
                          </span>
                          <span style={{ flex: 1 }}>{label}</span>
                          {on && <span aria-hidden>✓</span>}
                        </button>
                      );
                    })}
                  </div>
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
                      borderRadius: 8,
                      padding: 4,
                      boxShadow: '0 8px 24px -8px rgba(0,0,0,.35)',
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


              <div style={{ flex: 1, minWidth: 6 }} />
              <span className="hf-kbd">{isMac ? '⌘ ⏎' : 'Ctrl ⏎'}</span>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="hf-btn hf-btn-pri"
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '7px 14px',
                  height: 28,
                  boxShadow:
                    '0 8px 20px -6px color-mix(in oklab, var(--t-accent) 55%, transparent)',
                  opacity: submitting ? 0.7 : 1,
                  cursor: submitting ? 'wait' : 'pointer',
                }}
                data-testid="start-submit"
              >
                {submitting ? t('start.submitting') : t('start.submit')}
              </button>
            </div>
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
                borderRadius: 8,
                background: 'var(--t-panel)',
                border: '1px solid var(--t-border)',
                color: 'var(--t-fg-2)',
                fontSize: 12,
                boxShadow: '0 8px 24px -8px rgba(0,0,0,.45)',
                zIndex: 50,
              }}
            >
              {toast}
            </div>
          )}

          {/* Suggestion chips */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
            }}
          >
            {SUGGESTIONS.map(([g, t]) => (
              <button
                key={t}
                type="button"
                onClick={() => handleSuggestion(t)}
                className="hf-chip"
                style={{
                  fontSize: 12,
                  padding: '7px 12px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  gap: 6,
                  background: 'var(--t-panel-2)',
                  color: 'var(--t-fg-2)',
                  border: '1px solid var(--t-border)',
                }}
              >
                <span style={{ color: 'var(--t-accent)' }}>{g}</span>
                {t}
              </button>
            ))}
          </div>

          {/* Recent runs — from Wireframe v2 "继续上一次" */}
          <RecentRuns />

          {/* Three primitives — preserved feature */}
          <div>
            <div className="hf-label" style={{ marginBottom: 10 }}>
              {t('start.primitiveTitle')}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              {/* 2026-05-20 — 三张 PrimitiveCard 跳转目标重定。
                  /builder 已 redirect 到 /start（旧 Builder 流程作废），原本
                  在这里点"创建 Agent / 创建 Team / 从模板"会回旋回当前页。
                  新方向：Agent / Team 卡片直接到列表页（Quick Hire / Team 组装
                  在那里）；模板卡片滚到下面 Skill Pack 区。 */}
              <PrimitiveCard
                testId="primitive-card-agent"
                glyph="◉"
                title={t('start.createAgent')}
                description={t('start.createAgentDesc')}
                onClick={() => navigate('/agents')}
              />
              <PrimitiveCard
                testId="primitive-card-team"
                glyph="⊞"
                title={t('start.createTeam')}
                description={t('start.createTeamDesc')}
                onClick={() => navigate('/teams')}
              />
              <PrimitiveCard
                testId="primitive-card-templates"
                glyph="◆"
                title={t('start.fromTemplate')}
                description={t('start.fromTemplateDesc')}
                onClick={() => {
                  document
                    .querySelector('[data-section="skill-pack"]')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              />
            </div>
          </div>

          {submitError && (
            <div
              role="alert"
              style={{
                width: '100%',
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

          {/* Skill Pack cards — select a team methodology to scaffold a team */}
          <SkillPackSection onSelect={handleSkillPack} disabled={submitting} />

          {/* Recent drafts — preserved feature */}
          {/* 2026-05-20 — RecentDrafts 原本跳 /catalog（已下架的 published Agents
              库），现在统一跳 /agents（Agent 列表 = Agent 一等公民页）。
              prop 名 onNavigateCatalog 保留不动避免到处改类型 + 测试。 */}
          <RecentDrafts onNavigateCatalog={() => navigate('/agents')} />

          {/* GoalClarityWizard trigger — preserved feature */}
          {!showWizard && (
            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                data-testid="goal-clarity-wizard-trigger"
                onClick={() => setShowWizard(true)}
                className="hf-btn"
                style={{
                  fontSize: 12,
                  padding: '8px 16px',
                  borderRadius: 999,
                }}
              >
                {t('start.wizardTrigger')}
              </button>
            </div>
          )}

          {/* GoalClarityWizard inline expand */}
          {showWizard && <GoalClarityWizard onSkip={() => setShowWizard(false)} />}
        </div>
      </div>
      <SkillPickerModal
        open={skillPickerOpen}
        onClose={() => setSkillPickerOpen(false)}
        onPicked={(skill) => setPendingSkill(skill)}
      />
    </div>
  );
}
