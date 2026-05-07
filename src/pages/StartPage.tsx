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
  FileText,
  MessageSquareQuote,
  MessageCircle,
  Workflow,
  BookOpen,
  Target,
  Paperclip,
  Link2,
  Hash,
  Clipboard,
  History,
} from 'lucide-react';
import { listCatalogApps } from '../api/catalog';
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
        最近使用
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
            暂无最近记录
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

type Mode = 'auto' | 'single' | 'team';
type Output = 'answer' | 'report' | 'review' | 'workflow';
type KSource = 'documents' | 'urls' | 'pack' | 'none';

const KNOWLEDGE_OPTIONS: Array<[KSource, string]> = [
  ['documents', 'Documents'],
  ['urls', 'URLs'],
  ['pack', 'Knowledge Pack'],
  ['none', 'None · decide later'],
];

const OUTPUT_OPTIONS: Array<[Output, string]> = [
  ['answer', 'Answer'],
  ['report', 'Report'],
  ['review', 'Review'],
  ['workflow', 'Workflow draft'],
];

// Attachments shown as chips between the textarea and the chip row.
type AttachmentType = 'file' | 'url' | 'cid';
interface Attachment {
  id: string;
  type: AttachmentType;
  label: string;
  meta?: string;
}

export default function StartPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const [showWizard, setShowWizard] = useState(false);
  const [composer, setComposer] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [audience, setAudience] = useState('');
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [knowledge, setKnowledge] = useState<KSource[]>([]);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('auto');
  const [modeOpen, setModeOpen] = useState(false);
  const modeRef = useRef<HTMLDivElement | null>(null);
  const [output, setOutput] = useState<Output>('report');
  const [toast, setToast] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const audienceRef = useRef<HTMLDivElement | null>(null);
  const knowledgeRef = useRef<HTMLDivElement | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const addRef = useRef<HTMLDivElement | null>(null);
  // Close popovers on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (audienceOpen && audienceRef.current && !audienceRef.current.contains(t)) setAudienceOpen(false);
      if (knowledgeOpen && knowledgeRef.current && !knowledgeRef.current.contains(t)) setKnowledgeOpen(false);
      if (outputOpen && outputRef.current && !outputRef.current.contains(t)) setOutputOpen(false);
      if (modeOpen && modeRef.current && !modeRef.current.contains(t)) setModeOpen(false);
      if (addOpen && addRef.current && !addRef.current.contains(t)) setAddOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [audienceOpen, knowledgeOpen, outputOpen, modeOpen, addOpen]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  function notImpl(label: string) {
    setToast(T(`${label} · 功能开发中`, `${label} · coming soon`));
  }

  // Add attachment (📎 file / 🔗 url / ⛓ cid). Prompts the user, pushes a chip
  // into the visible attachments list. TODO: replace mock prompt with real
  // file picker / URL input / 0G CID resolver once those flows ship.
  function addAttachment(type: AttachmentType) {
    const ask = type === 'file'
      ? T('文件名（mock）', 'Filename (mock)')
      : type === 'url'
        ? T('URL', 'URL')
        : T('0G CID', '0G CID');
    const value = typeof window !== 'undefined' ? window.prompt(ask, '') : null;
    if (!value || !value.trim()) return;
    const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const label = value.trim();
    let meta: string | undefined;
    if (type === 'file') meta = `${(Math.random() * 4 + 0.5).toFixed(1)}MB`;
    else if (type === 'url') meta = T('feed', 'feed');
    else meta = '0G';
    setAttachments((prev) => [...prev, { id, type, label, meta }]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  const OUTPUT_LABELS: Record<Output, [string, string]> = {
    answer: ['Answer', 'Answer'],
    report: ['Report', 'Report'],
    review: ['Review', 'Review'],
    workflow: ['Workflow draft', 'Workflow draft'],
  };
  const OUTPUT_GLYPH: Record<Output, ReactNode> = {
    answer: <MessageCircle size={14} strokeWidth={2} />,
    report: <FileText size={14} strokeWidth={2} />,
    review: <MessageSquareQuote size={14} strokeWidth={2} />,
    workflow: <Workflow size={14} strokeWidth={2} />,
  };
  const KNOWLEDGE_LABELS: Record<KSource, [string, string]> = {
    documents: [T('文档', 'Documents'), 'Documents'],
    urls: ['URLs', 'URLs'],
    pack: [T('知识包', 'Knowledge Pack'), 'Knowledge Pack'],
    none: [T('跳过', 'Skip'), 'Skip'],
  };

  // Auto-open wizard via ?wizard=1 (Story 13.4)
  useEffect(() => {
    if (searchParams.get('wizard') === '1') {
      setShowWizard(true);
    }
  }, [searchParams]);

  function handleSubmit() {
    const text = composer.trim();
    const params = new URLSearchParams();
    // 'auto' lets the backend decide single vs team based on goal complexity.
    params.set('mode', mode);
    if (text) params.set('goal', text);
    if (audience.trim()) params.set('audience', audience.trim());
    if (knowledge.length > 0) params.set('knowledge', knowledge.join(','));
    if (output) params.set('output', output);
    navigate(`/builder?${params.toString()}`);
  }

  function handleComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

  function toggleKnowledge(k: KSource) {
    setKnowledge((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  }

  function handleSuggestion(label: string) {
    if (label.startsWith('从零开始')) {
      navigate('/builder?mode=team');
    } else {
      // Map suggestion to template gallery filtered by phrase
      navigate(`/templates?q=${encodeURIComponent(label)}`);
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
              今天要做什么？
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
              placeholder="描述一个目标，或粘贴一份 brief…"
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
                      aria-label={T('移除', 'Remove')}
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
                  label={attachments.length > 0 ? undefined : T('Add', 'Add')}
                  badge={attachments.length > 0 ? attachments.length : undefined}
                  hasArrow
                  active={addOpen}
                  configured={attachments.length > 0}
                  onClick={() => setAddOpen((v) => !v)}
                  testId="start-chip-add"
                  title={T('添加附件 / 引用', 'Add attachment / reference')}
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
                          label: T('上传文件', 'Upload file'),
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
                          label: T('从剪贴板粘贴', 'Paste from clipboard'),
                          testId: 'start-chip-paste',
                          onClick: () => {
                            setAddOpen(false);
                            notImpl(T('从剪贴板', 'Paste'));
                          },
                        },
                        {
                          glyph: <History size={14} strokeWidth={2} />,
                          label: T('历史 prompt', 'Recent prompts'),
                          testId: 'start-chip-history',
                          onClick: () => {
                            setAddOpen(false);
                            notImpl(T('最近 prompt', 'Recent prompts'));
                          },
                        },
                      ] as Array<{
                        glyph: ReactNode;
                        label: string;
                        testId: string;
                        onClick: () => void;
                      }>
                    ).map((item) => (
                      <button
                        key={item.testId}
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
                          color: 'var(--t-fg-2)',
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
                            'var(--t-panel-2)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background =
                            'transparent';
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
                      ? T('Auto', 'Auto')
                      : mode === 'single'
                        ? T('单兵', 'Single')
                        : T('团队', 'Team')
                  }
                  hasArrow
                  active={modeOpen}
                  configured={mode !== 'auto'}
                  onClick={() => setModeOpen((v) => !v)}
                  testId="start-mode-chip"
                  title={T('运行模式', 'Run mode')}
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
                          ? T('Auto · 自动决定', 'Auto · decide for me')
                          : m === 'single'
                            ? T('单兵 · 1 个 Agent', 'Single · 1 Agent')
                            : T('团队 · 多 Agent', 'Team · multi-Agent');
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

              {/* OUTPUT chip */}
              <div ref={outputRef} style={{ position: 'relative', flexShrink: 0 }}>
                <ChipBtn
                  glyph={OUTPUT_GLYPH[output]}
                  label={language === 'zh' ? OUTPUT_LABELS[output][0] : OUTPUT_LABELS[output][1]}
                  hasArrow
                  active={outputOpen}
                  configured={output !== 'report'}
                  onClick={() => setOutputOpen((v) => !v)}
                  testId="start-output-chip"
                />
                {outputOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 6px)',
                      left: 0,
                      minWidth: 160,
                      background: 'var(--t-panel)',
                      border: '1px solid var(--t-border)',
                      borderRadius: 8,
                      padding: 4,
                      boxShadow: '0 8px 24px -8px rgba(0,0,0,.35)',
                      zIndex: 20,
                    }}
                  >
                    {OUTPUT_OPTIONS.map(([k]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setOutput(k);
                          setOutputOpen(false);
                        }}
                        data-testid={`start-output-${k}`}
                        style={{
                          display: 'flex',
                          width: '100%',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 10px',
                          background: output === k ? 'var(--t-accent-tint)' : 'transparent',
                          color: output === k ? 'var(--t-accent)' : 'var(--t-fg-2)',
                          border: 'none',
                          borderRadius: 4,
                          fontSize: 12,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
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
                          {OUTPUT_GLYPH[k]}
                        </span>
                        <span>{language === 'zh' ? OUTPUT_LABELS[k][0] : OUTPUT_LABELS[k][1]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* KNOWLEDGE chip */}
              <div ref={knowledgeRef} style={{ position: 'relative', flexShrink: 0 }}>
                <ChipBtn
                  glyph={<BookOpen size={14} strokeWidth={2} />}
                  label={knowledge.length > 0 ? String(knowledge.length) : undefined}
                  hasArrow
                  active={knowledgeOpen}
                  configured={knowledge.length > 0}
                  onClick={() => setKnowledgeOpen((v) => !v)}
                  testId="start-knowledge-chip"
                  title={T('知识来源', 'Knowledge sources')}
                />
                {knowledgeOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 6px)',
                      left: 0,
                      minWidth: 180,
                      background: 'var(--t-panel)',
                      border: '1px solid var(--t-border)',
                      borderRadius: 8,
                      padding: 4,
                      boxShadow: '0 8px 24px -8px rgba(0,0,0,.35)',
                      zIndex: 20,
                    }}
                  >
                    {KNOWLEDGE_OPTIONS.map(([k]) => {
                      const on = knowledge.includes(k);
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => toggleKnowledge(k)}
                          data-testid={`start-knowledge-${k}`}
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
                          <span>
                            {language === 'zh' ? KNOWLEDGE_LABELS[k][0] : KNOWLEDGE_LABELS[k][1]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* AUDIENCE chip · click → expand inline mini input */}
              <div ref={audienceRef} style={{ position: 'relative', flexShrink: 0 }}>
                <ChipBtn
                  glyph={<Target size={14} strokeWidth={2} />}
                  label={audience.trim() || undefined}
                  active={audienceOpen}
                  configured={!!audience.trim()}
                  onClick={() => setAudienceOpen((v) => !v)}
                  testId="start-audience-chip"
                  title={T('受众', 'Audience')}
                />
                {audienceOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 6px)',
                      left: 0,
                      width: 280,
                      background: 'var(--t-panel)',
                      border: '1px solid var(--t-border)',
                      borderRadius: 8,
                      padding: 8,
                      boxShadow: '0 8px 24px -8px rgba(0,0,0,.35)',
                      zIndex: 20,
                    }}
                  >
                    <div
                      className="hf-meta"
                      style={{ fontSize: 10, marginBottom: 6 }}
                    >
                      {T('谁来读这份产物', 'Who is this for')}
                    </div>
                    <input
                      autoFocus
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setAudienceOpen(false);
                      }}
                      placeholder={T(
                        '例：内部工程团队，约 20 人',
                        'e.g. internal eng team, ~20 readers',
                      )}
                      data-testid="start-audience"
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: 5,
                        border: '1px solid var(--t-border)',
                        background: 'var(--t-bg)',
                        color: 'var(--t-fg)',
                        fontFamily: 'inherit',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    />
                  </div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 6 }} />
              <span className="hf-kbd">⌘ ⏎</span>
              <button
                type="button"
                onClick={handleSubmit}
                className="hf-btn hf-btn-pri"
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '7px 14px',
                  height: 28,
                  boxShadow:
                    '0 8px 20px -6px color-mix(in oklab, var(--t-accent) 55%, transparent)',
                }}
                data-testid="start-submit"
              >
                ✦ go
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

          {/* Three primitives — preserved feature */}
          <div>
            <div className="hf-label" style={{ marginBottom: 10 }}>
              直接开工 · 三种起点
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
                title="创建 Agent"
                description="从目标、角色和工具出发，搭一个专注的 AI 助手"
                onClick={() => navigate('/builder?mode=single')}
              />
              <PrimitiveCard
                testId="primitive-card-team"
                glyph="⊞"
                title="创建 Agent Team"
                description="把多个 AI 角色组成一个协作团队，分工完成复杂任务"
                onClick={() => navigate('/builder?mode=team')}
              />
              <PrimitiveCard
                testId="primitive-card-templates"
                glyph="◆"
                title="从模板开始"
                description="用现有 Agent / Team 模板快速起步，再按需调整"
                onClick={() => navigate('/templates')}
              />
            </div>
          </div>

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
                不确定选哪个？让我帮你决定 →
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
