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
import React, { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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
  id: string;
  glyph: string;
  name: string;
  desc: string;
  prompt: string;
}

const SKILL_PACKS: SkillPack[] = [
  {
    id: 'bmad',
    glyph: '◈',
    name: 'BMAD Method',
    desc: '产品 · 架构 · 开发 · QA',
    prompt: '使用 BMAD 方法组建全栈产品团队：产品经理（愿景/PRD）、架构师（系统设计）、全栈工程师（实现）、QA 工程师（测试与验收）',
  },
  {
    id: 'gstack',
    glyph: '⬡',
    name: 'gSTACK',
    desc: '调研 → 策略 → 执行',
    prompt: '按 gSTACK 框架组建三段式工作流团队：研究员（信息收集与分析）、策略师（方案设计与评估）、执行者（任务落地与交付）',
  },
  {
    id: 'consulting',
    glyph: '◆',
    name: '咨询铁三角',
    desc: '研究 · 分析 · 策略',
    prompt: '组建顾问式分析团队：市场调研员（数据收集）、商业分析师（洞察提炼）、战略顾问（建议生成与报告撰写）',
  },
  {
    id: 'newsroom',
    glyph: '◇',
    name: '编辑部',
    desc: '采集 · 编辑 · 发布',
    prompt: '搭建内容生产团队：信息员（素材采集与事实核查）、内容编辑（润色与结构化）、审稿人（质量把关）、发布员（多渠道分发）',
  },
  {
    id: 'startup',
    glyph: '⬢',
    name: '创业小分队',
    desc: 'CEO · 产品 · 增长',
    prompt: '组建精益创业团队：CEO 视角（战略与决策）、产品设计师（用户体验与原型）、全栈工程师（快速迭代）、增长黑客（获客与留存）',
  },
];

interface SkillPackSectionProps {
  onSelect: (pack: SkillPack) => void;
  disabled?: boolean;
}

function SkillPackSection({ onSelect, disabled }: SkillPackSectionProps) {
  const { t } = useI18n();
  return (
    <section style={{ width: '100%' }}>
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
        {SKILL_PACKS.map((pack) => (
          <button
            key={pack.id}
            type="button"
            onClick={() => !disabled && onSelect(pack)}
            className="hf-card"
            data-testid={`skill-pack-${pack.id}`}
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
            </div>
          </button>
        ))}
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [knowledge, setKnowledge] = useState<string[]>([]); // selected pack IDs
  const [knowledgePacks, setKnowledgePacks] = useState<KnowledgePack[] | null>(null);
  const [knowledgePacksLoading, setKnowledgePacksLoading] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

    setSubmitting(true);

    // Forward the model-picker selection so the server uses the user's
    // chosen executor/model. Without these, the server falls back to
    // executor='cli:auto' (= claude) even when the picker shows glm-5.1.
    const executor = localStorage.getItem('sf.defaultExecutor') || undefined;
    const model = localStorage.getItem('sf.model') || undefined;

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
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { session_id: string };
        navigate(`/run-session/${data.session_id}?goal=${encodeURIComponent(text)}`);
        return;
      }
    } catch {
      // fall through to original behavior
    } finally {
      setSubmitting(false);
    }

    // Fallback: original behavior
    const params = new URLSearchParams();
    // 'auto' lets the backend decide single vs team based on goal complexity.
    params.set('mode', mode);
    if (text) params.set('goal', text);
    if (knowledge.length > 0) params.set('knowledge', knowledge.join(','));
    navigate(`/builder?${params.toString()}`);
  }

  function handleComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

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
      navigate('/builder?mode=team');
    } else {
      // Map suggestion to template gallery filtered by phrase
      navigate(`/templates?q=${encodeURIComponent(label)}`);
    }
  }

  async function handleSkillPack(pack: SkillPack) {
    setSubmitting(true);
    // Same as handleSubmit: forward executor/model so skill-pack one-clicks
    // honor the user's model-picker selection instead of defaulting to claude.
    const executor = localStorage.getItem('sf.defaultExecutor') || undefined;
    const model = localStorage.getItem('sf.model') || undefined;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (secrets.anthropic) headers['X-Anthropic-Key'] = secrets.anthropic;
      const resp = await fetch(`${getApiBase()}/api/run-sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ goal: pack.prompt, mode: 'team', executor, model }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { session_id: string };
        navigate(`/run-session/${data.session_id}?goal=${encodeURIComponent(pack.prompt)}`);
        return;
      }
    } catch {
      // fall through
    } finally {
      setSubmitting(false);
    }
    navigate(`/builder?mode=team&goal=${encodeURIComponent(pack.prompt)}`);
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
          {/* Hero */}
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.18em',
                color: 'var(--t-accent)',
                marginBottom: 18,
              }}
            >
              ✦ SHADOWFLOW
            </div>
            <h1
              style={{
                fontSize: 44,
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-.025em',
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
            <textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={handleComposerKey}
              placeholder={t('start.composerPlaceholder')}
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
                            notImpl(t('start.importSkill'));
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
              <PrimitiveCard
                testId="primitive-card-agent"
                glyph="◉"
                title={t('start.createAgent')}
                description={t('start.createAgentDesc')}
                onClick={() => navigate('/builder?mode=single')}
              />
              <PrimitiveCard
                testId="primitive-card-team"
                glyph="⊞"
                title={t('start.createTeam')}
                description={t('start.createTeamDesc')}
                onClick={() => navigate('/builder?mode=team')}
              />
              <PrimitiveCard
                testId="primitive-card-templates"
                glyph="◆"
                title={t('start.fromTemplate')}
                description={t('start.fromTemplateDesc')}
                onClick={() => navigate('/templates')}
              />
            </div>
          </div>

          {/* Skill Pack cards — select a team methodology to scaffold a team */}
          <SkillPackSection onSelect={handleSkillPack} disabled={submitting} />

          {/* Recent drafts — preserved feature */}
          <RecentDrafts onNavigateCatalog={() => navigate('/catalog')} />

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
    </div>
  );
}
