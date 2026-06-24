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
 *
 * F1 (2026-06-11) — the full composer (textarea + chip row + CommandMenu +
 * SkillUrlChip + SkillPickerModal + attachments + ModelPicker + DirPicker +
 * knowledge popover + mode + ⌘⏎) moved wholesale into the reusable
 * `src/components/composer/UnifiedComposer.tsx`. StartPage is its first
 * consumer (variant="hero"); the POST /api/run-sessions submit flow stays
 * here in handleComposerSubmit (throws → composer shows the error bar).
 */
import React, { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  User,
  Users,
  LayoutTemplate,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { getApiBase } from '../api/_base';
import { useSecretsStore } from '../core/hooks/useSecretsStore';
import { listCatalogApps } from '../api/catalog';
import { listRuns, deleteRun } from '../api/runs';
import type { RunRecord } from '../api/runs';
import type { CatalogAppSummary } from '../common/types/catalog';
import { GoalClarityWizard } from '../core/components/builder/GoalClarityWizard';
import { HfTopBar } from '../components/hifi';
import { useI18n } from '../common/i18n';
import {
  UnifiedComposer,
  type UnifiedComposerSubmitPayload,
} from '../components/composer/UnifiedComposer';
import { CreateAgentModal } from '../components/CreateAgentModal';
import { TaskTemplateWall } from '../components/TaskTemplateWall';

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
// ChipBtn — moved to src/components/composer/UnifiedComposer.tsx (F1,
// 2026-06-11) together with the whole composer block it serviced.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Primitive cards (preserved from previous design — folded under the chips)
// ---------------------------------------------------------------------------

interface PrimitiveCardProps {
  testId: string;
  glyph: ReactNode;
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

export default function StartPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const { secrets } = useSecretsStore();
  const [showWizard, setShowWizard] = useState(false);
  // submitting / submitError now only serve the SkillPack install flow —
  // the composer's own submit lifecycle lives inside UnifiedComposer (F1).
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Create-Agent ceremony + task-template wall (clawsgo first impression).
  // composerSeed feeds UnifiedComposer's `initialText`; bumping seedKey forces
  // the controlled overwrite even when a user clicks the same template twice.
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [composerSeed, setComposerSeed] = useState<string | undefined>(undefined);
  const [seedKey, setSeedKey] = useState(0);
  // 模板占位符高亮区间（如 【主题】）→ 传给 UnifiedComposer.selectRange，
  // 用户点击模板后 textarea 自动选中第一个占位符，可立即覆写。
  const [composerSelect, setComposerSelect] = useState<{ start: number; end: number } | undefined>(
    undefined,
  );

  function fillComposer(text: string, selectRange?: { start: number; end: number }) {
    setComposerSeed(text);
    setComposerSelect(selectRange);
    setSeedKey((k) => k + 1);
    // Scroll the composer into view so the filled prompt is visible.
    requestAnimationFrame(() => {
      document
        .querySelector('[data-testid="unified-composer"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // Branded onboarding — no dedicated create API yet, so we seed the composer
  // with a first-run goal AND auto-submit it through the existing run-session
  // pipeline (handleComposerSubmit) so the ceremony actually kicks off a session
  // instead of just prefilling text. The seed still lands in the composer first
  // (visible + recoverable if the POST fails — the composer shows its own error
  // bar, but the auto-submit below surfaces it through StartPage's submitError).
  async function handleCreateAgent(name: string) {
    const goal = `请帮我创建一个名为「${name}」的数字伙伴：先了解我的工作场景与偏好，再准备好它的能力与工作流，然后开始为我工作。`;
    setShowCreateAgent(false);
    fillComposer(goal);
    // Drive the real pipeline. Throwing here propagates back to the modal's
    // onCreate await → its inline error bar; but since we already closed the
    // modal, we also surface via the page-level submitError as a fallback.
    try {
      await handleComposerSubmit({ text: goal, mode: 'auto', knowledge: [], attachments: [] });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      // Re-open so the user sees the ceremony failed and can retry naming.
      setShowCreateAgent(true);
      throw err;
    }
  }

  // Auto-open wizard via ?wizard=1 (Story 13.4)
  useEffect(() => {
    if (searchParams.get('wizard') === '1') {
      setShowWizard(true);
    }
  }, [searchParams]);

  // F1 (2026-06-11) — UnifiedComposer onSubmit. The composer resolves the
  // skill (explicit CommandMenu pick OR `@<skill-id>` token via the canonical
  // parseSkillToken, S11/PR-E) and hands us payload.skillName; we keep the
  // POST /api/run-sessions flow here. Throwing makes the composer render the
  // error bar — error copy preserved verbatim from the pre-F1 handleSubmit.
  async function handleComposerSubmit(p: UnifiedComposerSubmitPayload) {
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

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secrets.anthropic) headers['X-Anthropic-Key'] = secrets.anthropic;
    let resp: Response;
    try {
      resp = await fetch(`${getApiBase()}/api/run-sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          goal: p.text,
          mode: p.mode && p.mode !== 'auto' ? p.mode : undefined,
          executor,
          model,
          provider,
          // Story 16.x — when the user accepted the URL chip, forward the
          // ingested skill id so the server uses it instead of the default
          // 'agent-team-blueprint' template.
          skill_name: p.skillName,
        }),
      });
    } catch (err) {
      throw new Error(
        `无法连接后端 server。请确认 server 已启动（默认 :8002）并刷新页面。${err instanceof Error ? ` 错误：${err.message}` : ''}`,
      );
    }
    if (resp.ok) {
      const data = (await resp.json()) as { session_id: string };
      navigate(`/run-session/${data.session_id}?goal=${encodeURIComponent(p.text)}`);
      return;
    }
    const body = await resp.text().catch(() => '');
    throw new Error(
      `创建 run-session 失败（HTTP ${resp.status}）。请检查后端 server 是否在运行（默认 :8002），或在「设置 → BYOK」配置 API Key。${body ? ` 详情：${body.slice(0, 200)}` : ''}`,
    );
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

          {/* Composer — F1 (2026-06-11): the full composer block (textarea +
              chip row + CommandMenu + attachments + ModelPicker + DirPicker +
              knowledge + mode + toast + SkillPickerModal) moved wholesale into
              UnifiedComposer. variant="hero" keeps the exact /start visuals;
              POST submit stays here in handleComposerSubmit. */}
          <UnifiedComposer
            key={seedKey}
            variant="hero"
            onSubmit={handleComposerSubmit}
            initialText={composerSeed}
            selectRange={composerSelect}
          />

          {/* Create-Agent ceremony trigger — opens the branded onboarding modal
              (clawsgo「你的常驻数字伙伴」). Additive: sits just under the composer,
              does not replace any existing CTA. */}
          <div style={{ textAlign: 'center', marginTop: -12 }}>
            <button
              type="button"
              data-testid="create-agent-trigger"
              onClick={() => setShowCreateAgent(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 16px',
                borderRadius: 999,
                cursor: 'pointer',
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: 'inherit',
                color: 'var(--t-accent)',
                background: 'var(--t-accent-tint)',
                border: '1px solid color-mix(in oklab, var(--t-accent) 32%, transparent)',
                transition: 'background 140ms ease, transform 140ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.background =
                  'color-mix(in oklab, var(--t-accent) 18%, var(--t-accent-tint))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.background = 'var(--t-accent-tint)';
              }}
            >
              <Sparkles size={14} strokeWidth={2} aria-hidden />
              创建你的数字伙伴
            </button>
          </div>

          {/* Task-template wall — clawsgo's one-click template grid. Clicking a
              card fills the composer above (additive hero section). */}
          <TaskTemplateWall
            onPick={(prompt, _tpl, placeholder) =>
              fillComposer(prompt, placeholder ?? undefined)
            }
          />


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
                glyph={<User size={20} strokeWidth={2} />}
                title={t('start.createAgent')}
                description={t('start.createAgentDesc')}
                onClick={() => navigate('/agents')}
              />
              <PrimitiveCard
                testId="primitive-card-team"
                glyph={<Users size={20} strokeWidth={2} />}
                title={t('start.createTeam')}
                description={t('start.createTeamDesc')}
                onClick={() => navigate('/teams')}
              />
              <PrimitiveCard
                testId="primitive-card-templates"
                glyph={<LayoutTemplate size={20} strokeWidth={2} />}
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
      {/* SkillPickerModal — moved into UnifiedComposer (F1, 2026-06-11). */}

      {/* Create-Agent ceremony — branded onboarding modal. Presentational +
          callback; handleCreateAgent seeds the composer (no create API yet). */}
      <CreateAgentModal
        open={showCreateAgent}
        onClose={() => setShowCreateAgent(false)}
        onCreate={handleCreateAgent}
      />
    </div>
  );
}
