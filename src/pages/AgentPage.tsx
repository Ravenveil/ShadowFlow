/**
 * AgentPage — Hi-Fi v2 redesign (Story 12.1, T3 Pages-B)
 *
 * UI PROTECTION: 只能加，不能删。所有原有功能必须保留：
 *   - 列出 Agent (GET /api/agents)
 *   - 删除 Agent
 *   - 「+ Quick Hire」表单（取代旧的 CreateAgentModal）—— 保留快速创建路径
 *   - 「自建」高级模式仍可通过 BlueprintModal 导入 (?import=...) 触发
 *   - 空状态引导
 *   - 删除错误提示
 *   - Card click 已撤销（2026-05-19）：员工卡不再整体可点击；hover 时露出
 *     "Use in Skill Studio" 和 "删除" 两个动作按钮，保留按 agent 进 Skill Studio
 *     的入口，但移除"点卡片 → /agent-dm 单聊页"这条强跳路径。
 *
 * 视觉来源：/tmp/shadowflow-handoff/shadowflow/project/hf-pages.jsx HfAgents
 *   1fr 左 grid (人才库 + 3-col cards) + 320px 右 Quick Hire 面板
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, Search, Sparkles } from 'lucide-react';
import {
  listAgents,
  deleteAgent,
  quickCreateAgent,
  AgentApiError,
} from '../api/agents';
import type { AgentRecord } from '../api/agents';
import { BlueprintModal } from '../components/agents/BlueprintModal';
import { HfTopBar, HfAvatar, HfPill } from '../components/hifi';
import HfSelect from '../components/hifi/HfSelect';
import { AGENT_PALETTE, paletteFor, paletteFromColor, initialOf, getAgentColor, registerAgentColor } from '../components/chat-fb/agentAvatar';
import { useI18n } from '../common/i18n';
import { useWorkspaceStore } from '../store/workspaceStore';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';
type FilterKey = 'all' | 'hired' | 'available' | 'community';

// Map agent status → status badge color token (matches HfAtoms HfStatus)
function statusColor(s: AgentRecord['status']): string {
  if (s === 'running') return 'var(--t-run)';
  if (s === 'paused') return 'var(--t-warn)';
  if (s === 'error') return 'var(--t-err)';
  return 'var(--t-ok)';
}

// Glyph for an agent — try first non-ASCII char of name, else first letter.
// Returns null when no usable monogram can be derived (caller should render
// a Bot icon fallback instead of a sparkle/text glyph).
function agentGlyph(name: string): string | null {
  if (!name) return null;
  // Find first CJK / unicode char
  for (const ch of name) {
    if (/[一-鿿]/.test(ch)) return ch;
  }
  const initial = name.charAt(0).toUpperCase();
  return initial || null;
}

// Color for an agent — derive from name hash → palette
const PALETTE = [
  'var(--t-accent)',
  'var(--t-warn)',
  'var(--t-run)',
  'var(--t-ok)',
  'var(--t-err)',
];
function agentColor(agent: AgentRecord): string {
  const seed = (agent.agent_id || agent.name || 'x').charCodeAt(0) || 0;
  return PALETTE[seed % PALETTE.length];
}

// Role label (mono caps) — try blueprint.role_profiles[0].role else source
function agentRole(agent: AgentRecord): string {
  const rp = (agent.blueprint as Record<string, unknown> | undefined)?.role_profiles;
  if (Array.isArray(rp) && rp.length > 0) {
    const first = rp[0] as Record<string, unknown>;
    const role = (first.role as string) || (first.name as string);
    if (typeof role === 'string' && role.length > 0) return role.toUpperCase();
  }
  return agent.source === 'catalog' ? 'CATALOG' : 'AGENT';
}

// Permission level label — derive from blueprint.policy_level.
// Returns null when no real level is set (do NOT fabricate a value).
function agentLevel(agent: AgentRecord): number | null {
  const policy = (agent.blueprint as Record<string, unknown> | undefined)?.policy_level;
  if (typeof policy === 'number') return Math.max(1, Math.min(3, policy));
  return null;
}

// ---------------------------------------------------------------------------
// AgentPage — Hi-Fi v2
// ---------------------------------------------------------------------------

export function AgentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useI18n();
  const currentId = useWorkspaceStore((s) => s.currentId);

  // Data
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Quick Hire form state
  const nameRef = useRef<HTMLInputElement>(null);
  const [hireName, setHireName] = useState('');
  const [hireRole, setHireRole] = useState('Reader');
  const [hireSoul, setHireSoul] = useState('');
  const [hireModel, setHireModel] = useState('claude-sonnet-4');
  const [hireLevel, setHireLevel] = useState<'L1' | 'L2' | 'L3'>('L1');
  // 头像色：null = 自动（按名字 hash），字符串 = 手选任意 CSS 颜色
  const [hireColor, setHireColor] = useState<string | null>(null);
  const [hiring, setHiring] = useState(false);
  const [hireError, setHireError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Array<{ time: string; text: string }>>([]);

  // Filter chips
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Auto-open BlueprintModal if ?import= param is present (preserves D3 import flow)
  const [pendingImport, setPendingImport] = useState(() => searchParams.get('import'));
  useEffect(() => {
    const importParam = searchParams.get('import');
    if (importParam) setPendingImport(importParam);
  }, [searchParams]);

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    setLoadStatus('loading');
    setErrorMsg(null);
    try {
      const data = await listAgents(currentId ?? undefined);
      setAgents(data);
      setLoadStatus('success');
    } catch (err) {
      // TODO: i18n — error messages with dynamic interpolation, no matching key yet
      const msg = err instanceof AgentApiError
        ? `加载失败（${err.status}）`
        : '加载失败，请刷新重试';
      setErrorMsg(msg);
      setLoadStatus('error');
    }
  }, [currentId]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Filtered list
  const visibleAgents = useMemo(() => {
    let list = agents;
    if (filter === 'hired') list = list.filter((a) => a.status !== 'idle' || a.source === 'catalog');
    else if (filter === 'available') list = list.filter((a) => a.status === 'idle');
    else if (filter === 'community') list = list.filter((a) => a.source === 'catalog');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.soul.toLowerCase().includes(q) ||
          agentRole(a).toLowerCase().includes(q),
      );
    }
    return list;
  }, [agents, filter, search]);

  // Hire submit
  async function handleHire(e: React.FormEvent) {
    e.preventDefault();
    if (!hireName.trim() || !hireSoul.trim() || hiring) return;
    setHiring(true);
    setHireError(null);
    try {
      const created = await quickCreateAgent({
        name: hireName.trim(),
        soul: hireSoul.trim(),
        avatar_color: hireColor,
        // 带上当前 workspace，否则落到 "default"，切回本工作区刷新就「招了却不见」
        workspace_id: currentId ?? undefined,
      });
      // quickCreate 响应是「部分」record（无 soul/status/workspace_id）—— 补全成完整
      // AgentRecord 再乐观插入，否则 AgentTile 读 agent.soul.length 会崩。
      const agent: AgentRecord = {
        agent_id: created.agent_id,
        name: created.name ?? hireName.trim(),
        soul: created.soul ?? hireSoul.trim(),
        workspace_id: created.workspace_id ?? currentId ?? 'default',
        blueprint: created.blueprint ?? {},
        status: created.status ?? 'idle',
        source: created.source ?? 'quick_hire',
        created_at: created.created_at ?? new Date().toISOString(),
        avatar_color: created.avatar_color ?? hireColor ?? null,
      };
      // 乐观注册（按显示名），全 app paletteFor 即时生效；下次 listAgents 以后端为准
      if (hireColor != null) registerAgentColor(agent.name, hireColor);
      setAgents((prev) => [agent, ...prev]);
      setRecent((prev) => [
        { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), text: `${agent.name} hired` },
        ...prev,
      ].slice(0, 5));
      // Clear form
      setHireName('');
      setHireSoul('');
      setHireColor(null);
    } catch (err) {
      // TODO: i18n — error messages with dynamic interpolation, no matching key yet
      if (err instanceof AgentApiError) {
        setHireError(`创建失败（${err.status}）：${err.code}`);
      } else {
        setHireError('网络异常，请稍后重试');
      }
    } finally {
      setHiring(false);
    }
  }

  // Delete
  async function handleDelete(agentId: string) {
    setDeletingId(agentId);
    setDeleteError(null);
    try {
      await deleteAgent(agentId);
      setAgents((prev) => prev.filter((a) => a.agent_id !== agentId));
    } catch (err) {
      // TODO: i18n — error messages with dynamic interpolation, no matching key yet
      const msg = err instanceof AgentApiError ? `删除失败（${err.status}）` : '删除失败，请重试';
      setDeleteError(msg);
    } finally {
      setDeletingId(null);
    }
  }

  // Header "+ Quick Hire" → focus name input in panel
  function focusQuickHire() {
    nameRef.current?.focus();
    nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // BlueprintModal-imported agent join the list (preserves AC for D3)
  function handleImported(agent: AgentRecord) {
    setAgents((prev) => [agent, ...prev]);
    setSearchParams((p) => { p.delete('import'); return p; });
    setPendingImport(null);
    setRecent((prev) => [
      { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), text: `${agent.name} imported` },
      ...prev,
    ].slice(0, 5));
  }

  const counts = useMemo(() => {
    const hired = agents.filter((a) => a.status !== 'idle' || a.source === 'catalog').length;
    const community = agents.filter((a) => a.source === 'catalog').length;
    return { hired, community };
  }, [agents]);

  return (
    <>
      <HfTopBar
        right={
          <button
            type="button"
            onClick={focusQuickHire}
            className="hf-btn hf-btn-pri"
            style={{ fontSize: 11 }}
            data-testid="new-agent-btn"
          >
            + Quick Hire
          </button>
        }
      />

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          minHeight: 0,
        }}
      >
        {/* ── Left grid: 人才库 ───────────────────────────────────────────── */}
        <div style={{ padding: '18px 24px', overflow: 'auto' }}>
          {/* Header row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 14,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 800 }}>{t('agent.talent')}</span>
            <span className="hf-meta">
              {counts.hired} hired · {counts.community} community
            </span>
            <div style={{ flex: 1 }} />
            {([
              ['all', t('agent.filterAll')],
              ['hired', t('agent.filterHired')],
              ['available', t('agent.filterAvailable')],
              ['community', t('agent.filterCommunity')],
            ] as Array<[FilterKey, string]>).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={filter === k ? 'hf-chip hf-chip-acc' : 'hf-chip'}
                style={{ fontSize: 10, cursor: 'pointer' }}
                data-testid={`filter-${k}`}
              >
                {label}
              </button>
            ))}
            {searchOpen ? (
              <input
                type="text"
                value={search}
                placeholder={t('agent.searchPlaceholder')}
                onChange={(e) => setSearch(e.target.value)}
                onBlur={() => { if (!search) setSearchOpen(false); }}
                autoFocus
                style={{
                  fontSize: 10,
                  padding: '3px 8px',
                  borderRadius: 5,
                  background: 'var(--t-panel-2)',
                  color: 'var(--t-fg)',
                  border: '1px solid var(--t-border)',
                  outline: 'none',
                  width: 120,
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="hf-chip"
                style={{ fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                aria-label={t('agent.searchLabel')}
              >
                <Search size={12} strokeWidth={2} aria-hidden />
              </button>
            )}
          </div>

          {/* Errors */}
          {deleteError && (
            <div
              role="alert"
              style={{
                marginBottom: 12,
                padding: '8px 12px',
                fontSize: 12,
                color: 'var(--t-err)',
                background: 'color-mix(in oklab, var(--t-err) 10%, transparent)',
                border: '1px solid color-mix(in oklab, var(--t-err) 35%, transparent)',
                borderRadius: 8,
              }}
            >
              {deleteError}
              <button
                type="button"
                onClick={() => setDeleteError(null)}
                style={{
                  marginLeft: 10,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--t-err)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {t('agent.closeError')}
              </button>
            </div>
          )}

          {/* Loading */}
          {loadStatus === 'loading' && (
            <div className="hf-meta" style={{ padding: '40px 0', textAlign: 'center' }}>
              {t('agent.loading')}
            </div>
          )}

          {/* Load error */}
          {loadStatus === 'error' && (
            <div
              role="alert"
              style={{
                padding: '12px 14px',
                fontSize: 13,
                color: 'var(--t-err)',
                background: 'color-mix(in oklab, var(--t-err) 10%, transparent)',
                border: '1px solid color-mix(in oklab, var(--t-err) 35%, transparent)',
                borderRadius: 8,
              }}
            >
              {errorMsg}
              <button
                type="button"
                onClick={fetchAgents}
                style={{
                  marginLeft: 10,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--t-err)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {t('common.retry')}
              </button>
            </div>
          )}

          {/* Empty state */}
          {loadStatus === 'success' && agents.length === 0 && (
            <EmptyState onNewAgent={focusQuickHire} />
          )}

          {/* Filtered empty */}
          {loadStatus === 'success' && agents.length > 0 && visibleAgents.length === 0 && (
            <div
              className="hf-meta"
              style={{ padding: '40px 0', textAlign: 'center' }}
            >
              {t('agent.noMatch')}
            </div>
          )}

          {/* Card grid */}
          {loadStatus === 'success' && visibleAgents.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 10,
              }}
              data-testid="agent-grid"
            >
              {visibleAgents.map((agent) => (
                <AgentTile
                  key={agent.agent_id}
                  agent={agent}
                  isDeleting={deletingId === agent.agent_id}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Right panel: Quick Hire ─────────────────────────────────────── */}
        <aside
          style={{
            borderLeft: '1px solid var(--t-border)',
            padding: '16px 18px',
            overflow: 'auto',
            background: 'var(--t-panel)',
          }}
        >
          <form onSubmit={handleHire}>
            <div className="hf-label" style={{ color: 'var(--t-accent)', marginBottom: 8 }}>
              {t('agent.quickHireLabel')}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
              {t('agent.quickHireSubtitle')}
            </div>

            <FormRow label={t('agent.fieldName')}>
              <input
                ref={nameRef}
                type="text"
                value={hireName}
                onChange={(e) => setHireName(e.target.value)}
                placeholder={t('agent.namePlaceholder')}
                data-testid="hire-name"
                style={inputStyle()}
              />
            </FormRow>

            <FormRow label={t('agent.fieldRole')}>
              <input
                type="text"
                value={hireRole}
                onChange={(e) => setHireRole(e.target.value)}
                placeholder={t('agent.rolePlaceholder')}
                style={inputStyle()}
              />
            </FormRow>

            <FormRow label={t('agent.fieldSoul')} tall>
              <textarea
                value={hireSoul}
                onChange={(e) => setHireSoul(e.target.value)}
                placeholder={t('agent.soulPlaceholder')}
                data-testid="hire-soul"
                rows={3}
                style={{ ...inputStyle(), minHeight: 56, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </FormRow>

            <FormRow label={t('agent.fieldAvatar', { defaultValue: '头像' })}>
              <AvatarColorPicker
                name={hireName}
                color={hireColor}
                onPick={setHireColor}
                autoLabel={t('agent.avatarAuto', { defaultValue: '自动' })}
              />
            </FormRow>

            <FormRow label={t('agent.fieldModel')}>
              <HfSelect
                value={hireModel}
                onChange={setHireModel}
                ariaLabel={t('agent.fieldModel')}
                mono
                options={[
                  { value: 'claude-sonnet-4', label: 'claude-sonnet-4' },
                  { value: 'claude-opus-4', label: 'claude-opus-4' },
                  { value: 'claude-haiku-4', label: 'claude-haiku-4' },
                  { value: 'gpt-5', label: 'gpt-5' },
                  { value: 'zhipu-glm-4', label: 'zhipu-glm-4' },
                ]}
              />
            </FormRow>

            <FormRow label={t('agent.fieldLevel')}>
              <HfSelect
                value={hireLevel}
                onChange={(v) => setHireLevel(v as 'L1' | 'L2' | 'L3')}
                ariaLabel={t('agent.fieldLevel')}
                options={[
                  { value: 'L1', label: t('agent.levelL1') },
                  { value: 'L2', label: t('agent.levelL2') },
                  { value: 'L3', label: t('agent.levelL3') },
                ]}
              />
            </FormRow>

            {hireError && (
              <div
                role="alert"
                style={{
                  marginBottom: 10,
                  padding: '6px 10px',
                  fontSize: 11,
                  color: 'var(--t-err)',
                  background: 'color-mix(in oklab, var(--t-err) 10%, transparent)',
                  border: '1px solid color-mix(in oklab, var(--t-err) 35%, transparent)',
                  borderRadius: 6,
                }}
              >
                {hireError}
              </div>
            )}

            <button
              type="submit"
              disabled={!hireName.trim() || !hireSoul.trim() || hiring}
              className="hf-btn hf-btn-pri"
              style={{
                width: '100%',
                justifyContent: 'center',
                fontSize: 12,
                padding: '9px 0',
                opacity: !hireName.trim() || !hireSoul.trim() || hiring ? 0.5 : 1,
                cursor: !hireName.trim() || !hireSoul.trim() || hiring ? 'not-allowed' : 'pointer',
              }}
              data-testid="hire-submit"
            >
              {hiring ? t('agent.hiring') : t('agent.hireBtn')}
            </button>
          </form>

          {/* Recent hires */}
          <div className="hf-label" style={{ marginTop: 18, marginBottom: 8 }}>
            {t('agent.recentHires')}
          </div>
          {recent.length === 0 ? (
            <div className="hf-meta" style={{ fontSize: 10 }}>
              {t('agent.noRecentHires')}
            </div>
          ) : (
            recent.map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 0',
                  fontSize: 11,
                  color: 'var(--t-fg-3)',
                }}
              >
                <span className="hf-meta">{r.time}</span>
                <span>· {r.text}</span>
              </div>
            ))
          )}
        </aside>
      </div>

      {/* BlueprintModal — preserved for D3 import flow (?import=...) */}
      {pendingImport && (
        <BlueprintModal
          agent={{
            agent_id: '',
            name: '',
            soul: '',
            workspace_id: '',
            blueprint: {},
            status: 'idle',
            source: 'quick_hire',
            created_at: '',
          } as AgentRecord}
          initialImport={pendingImport}
          onClose={() => {
            setPendingImport(null);
            setSearchParams((p) => { p.delete('import'); return p; });
          }}
          onImported={handleImported}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function inputStyle(): CSSProperties {
  return {
    width: '100%',
    padding: '7px 10px',
    minHeight: 32,
    fontSize: 12.5,
    color: 'var(--t-fg-2)',
    background: 'var(--t-bg)',
    border: '1px solid var(--t-border)',
    borderRadius: 12,
    outline: 'none',
    boxSizing: 'border-box',
  };
}

function FormRow({
  label,
  tall,
  children,
}: {
  label: string;
  tall?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="hf-label" style={{ fontSize: 9, marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ minHeight: tall ? 56 : 32 }}>{children}</div>
    </div>
  );
}

// 头像换色：实时预览头像 + 7 个快捷预设 + 取色器（滑块）+ hex 文本输入 + 自动。
// 选中色是任意 CSS 颜色串（null = 自动，按名字 hash）。预览与全 app 头像同一套
// 浅墨兰迪合成逻辑（paletteFromColor）。
function AvatarColorPicker({
  name,
  color,
  onPick,
  autoLabel,
}: {
  name: string;
  color: string | null;
  onPick: (color: string | null) => void;
  autoLabel: string;
}) {
  const previewPal = color != null ? paletteFromColor(color) : paletteFor(name || 'agent');
  const glyph = initialOf(name) || '?';
  // hex 文本输入框纯由草稿驱动（避免「中途合法 3 位 hex 提交后卡住」）；
  // 预设/取色器改色时同步草稿。
  const [hexDraft, setHexDraft] = useState('');

  // 把 #abc / abcdef 等规整成合法 #rrggbb；非法返回 null。
  function normalizeHex(v: string): string | null {
    let s = v.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map(c => c + c).join('');
    return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s.toLowerCase()}` : null;
  }
  const pickPreset = (c: string) => { onPick(c); setHexDraft(c); };
  const colorWellValue = normalizeHex(color ?? '') ?? normalizeHex(hexDraft) ?? '#888888';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* 实时预览 */}
        <span
          style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 17,
            background: previewPal.bg,
            border: `1px solid ${previewPal.border}`,
            color: previewPal.fg,
          }}
          aria-hidden
        >
          {glyph}
        </span>
        {/* 快捷预设色板 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {AGENT_PALETTE.map((pal, i) => {
            const active = color === pal.accent;
            return (
              <button
                key={i}
                type="button"
                aria-label={`头像色 ${i + 1}`}
                aria-pressed={active}
                onClick={() => pickPreset(pal.accent)}
                style={{
                  width: 22, height: 22, borderRadius: 7, padding: 0, cursor: 'pointer',
                  background: pal.accent,
                  border: active ? '2px solid var(--t-fg)' : '2px solid transparent',
                  boxShadow: active ? '0 0 0 2px var(--t-panel)' : 'none',
                  outline: 'none',
                  transition: 'transform 120ms, border-color 120ms',
                  transform: active ? 'scale(1.08)' : 'none',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* 自定义：取色器（带滑块）+ hex 输入 + 自动 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* 原生取色器：点开是带色相滑块的系统取色面板，可选任意颜色 */}
        <label
          title="自定义颜色"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 8, cursor: 'pointer', flexShrink: 0,
            border: '1px solid var(--t-border)', background: 'var(--t-panel-2)', position: 'relative',
          }}
        >
          <Sparkles size={14} strokeWidth={2} style={{ color: 'var(--t-fg-3)' }} />
          <input
            type="color"
            value={colorWellValue}
            onChange={(e) => { onPick(e.target.value); setHexDraft(e.target.value); }}
            aria-label="自定义头像颜色"
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', padding: 0, border: 0 }}
          />
        </label>
        {/* hex 文本输入 */}
        <input
          type="text"
          value={hexDraft}
          placeholder="#7c5cff"
          spellCheck={false}
          onChange={(e) => {
            setHexDraft(e.target.value);
            const hx = normalizeHex(e.target.value);
            if (hx) onPick(hx);
          }}
          aria-label="头像颜色 hex"
          style={{
            flex: 1, minWidth: 0, height: 30, padding: '0 9px', borderRadius: 8,
            fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
            background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
            color: 'var(--t-fg)', outline: 'none', boxSizing: 'border-box',
          }}
        />
        {/* 自动（清除手选，回到按名字 hash） */}
        <button
          type="button"
          onClick={() => { onPick(null); setHexDraft(''); }}
          aria-pressed={color == null}
          style={{
            height: 30, padding: '0 11px', borderRadius: 8, cursor: 'pointer', flexShrink: 0,
            fontSize: 11, fontWeight: 600,
            background: color == null ? 'var(--t-accent-tint)' : 'transparent',
            border: `1px solid ${color == null ? 'var(--t-accent)' : 'var(--t-border)'}`,
            color: color == null ? 'var(--t-accent-bright)' : 'var(--t-fg-3)',
            transition: 'all 120ms',
          }}
        >
          {autoLabel}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onNewAgent }: { onNewAgent: () => void }) {
  const { t } = useI18n();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: '60px 0',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          border: '1px solid var(--t-border)',
          background: 'var(--t-panel-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--t-fg-3)',
        }}
      >
        <Bot size={28} strokeWidth={2} aria-hidden />
      </div>
      <div>
        <p style={{ fontSize: 13, color: 'var(--t-fg-2)' }}>{t('agent.noAgents')}</p>
        <p
          className="hf-meta"
          style={{ marginTop: 4, fontSize: 11, color: 'var(--t-fg-4)' }}
        >
          {t('agent.noAgentsHint')}
        </p>
      </div>
      <button
        type="button"
        onClick={onNewAgent}
        className="hf-btn hf-btn-pri"
        style={{ fontSize: 11 }}
        data-testid="empty-new-agent-btn"
      >
        {t('agent.newAgent')}
      </button>
    </div>
  );
}

interface AgentTileProps {
  agent: AgentRecord;
  isDeleting: boolean;
  onDelete: (id: string) => void;
}

function AgentTile({ agent, isDeleting, onDelete }: AgentTileProps) {
  const [hover, setHover] = useState(false);
  const { t } = useI18n();
  const navigate = useNavigate();
  const role = agentRole(agent);
  const glyph = agentGlyph(agent.name);
  // 头像色优先级：后端 avatar_color 字段 → 注册表（按名字）→ 原 name-hash 主题色
  const color = agent.avatar_color ?? getAgentColor(agent.name) ?? agentColor(agent);
  const level = agentLevel(agent);
  const hired = agent.status !== 'idle' || agent.source === 'catalog';
  const soulText = agent.soul ?? '';
  const soulPreview =
    soulText.length > 70 ? soulText.slice(0, 70) + '…' : soulText || '—';
  const model =
    ((agent.blueprint as Record<string, unknown> | undefined)?.model as string) ||
    'sonnet-4';

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    // TODO: i18n — agent.deleteConfirm has {name} interpolation not supported by t()
    if (window.confirm(`删除 ${agent.name}?`)) onDelete(agent.agent_id);
  }

  // Story 15.28 — Skill Studio entry. Pass agent_id (and optional skill preset
  // from blueprint) to /run-session via query so PreparationPanel can pick up
  // the agent context. Server-side prompt injection is out of scope for this
  // Story; we only forward the query parameters here.
  function handleUseInStudioClick(e: React.MouseEvent) {
    e.stopPropagation();
    const skillPreset = (agent.blueprint as Record<string, unknown> | undefined)
      ?.skill_preset as string | undefined;
    const qs = new URLSearchParams({ agent_id: agent.agent_id });
    if (skillPreset && typeof skillPreset === 'string' && skillPreset.length > 0) {
      qs.set('skill_name', skillPreset);
    }
    navigate(`/run-session?${qs.toString()}`);
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="hf-card"
      data-testid={`agent-card-${agent.agent_id}`}
      style={{
        position: 'relative',
        padding: 14,
        cursor: 'default',
        opacity: isDeleting ? 0.4 : 1,
        pointerEvents: isDeleting ? 'none' : 'auto',
        borderColor: hover ? 'color-mix(in oklab, var(--t-accent) 50%, var(--t-border))' : 'var(--t-border)',
        transition: 'border-color 160ms',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {glyph !== null ? (
          <HfAvatar
            glyph={glyph}
            color={color}
            size={36}
            status={agent.status === 'running' ? 'run' : undefined}
          />
        ) : (
          <div
            style={{
              position: 'relative',
              flexShrink: 0,
              width: 36,
              height: 36,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 36 * 0.28,
                background: `color-mix(in oklab, ${color} 18%, var(--t-panel-2))`,
                border: `1px solid color-mix(in oklab, ${color} 45%, transparent)`,
                color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bot size={18} strokeWidth={2} aria-hidden />
            </div>
            {agent.status === 'running' && (
              <span
                style={{
                  position: 'absolute',
                  right: -1,
                  bottom: -1,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'var(--t-run)',
                  border: '2px solid var(--t-panel)',
                  animation: 'hf-pulse 1.4s ease-in-out infinite',
                }}
              />
            )}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {agent.name || '—'}
          </div>
          <div className="hf-mono" style={{ fontSize: 9.5, color: 'var(--t-fg-4)', marginTop: 2 }}>
            {role}
          </div>
        </div>
        {hired && <HfPill>{t('agent.hired')}</HfPill>}
        {!hired && agent.source === 'catalog' && <HfPill color="var(--t-run)">{t('agent.community')}</HfPill>}
      </div>

      {/* Soul preview */}
      <div
        style={{
          fontSize: 11.5,
          color: 'var(--t-fg-3)',
          marginBottom: 10,
          minHeight: 30,
          lineHeight: 1.5,
        }}
      >
        {soulPreview}
      </div>

      {/* Chips + status */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="hf-chip" style={{ fontSize: 9.5 }}>
          {model}
        </span>
        <span className="hf-chip" style={{ fontSize: 9.5 }}>
          {level != null ? `L${level}` : '—'}
        </span>
        <span
          className="hf-chip"
          style={{ fontSize: 9.5, color: statusColor(agent.status) }}
        >
          ● {agent.status}
        </span>
        <div style={{ flex: 1 }} />
        {/* Story 15.28 — "Use in Skill Studio" hover action. Always visible
            on hover (not just for hired agents) so users can pre-select an
            agent before opening Skill Studio. */}
        {hover && !isDeleting && (
          <button
            type="button"
            onClick={handleUseInStudioClick}
            data-testid="agent-card-use-in-studio"
            aria-label={t('skillStudio.entry.useInStudio')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              padding: '2px 8px',
              border: '1px solid var(--t-border)',
              borderRadius: 4,
              background: 'transparent',
              color: 'var(--t-fg-3)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-accent)';
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                'color-mix(in oklab, var(--t-accent) 50%, var(--t-border))';
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--t-accent-tint)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-fg-3)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--t-border)';
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <Sparkles size={11} strokeWidth={2} aria-hidden />
            {t('skillStudio.entry.useInStudio')}
          </button>
        )}
        {hover && !isDeleting && (
          <button
            type="button"
            onClick={handleDeleteClick}
            aria-label={t('agent.deleteAgent')}
            style={{
              fontSize: 10,
              padding: '2px 6px',
              border: 'none',
              borderRadius: 4,
              background: 'transparent',
              color: 'var(--t-fg-4)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-err)';
              (e.currentTarget as HTMLButtonElement).style.background =
                'color-mix(in oklab, var(--t-err) 12%, transparent)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-fg-4)';
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            {t('agent.deleteBtn')}
          </button>
        )}
      </div>
    </div>
  );
}

export default AgentPage;
