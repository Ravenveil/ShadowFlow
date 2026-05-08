/**
 * KnowledgeDock — Story 8.4 (AC1–AC7)
 *
 * Scene Mode 中的知识绑定面板。
 *   - scope='shared'  → 团队共享绑定（从 SharedResourceInspector 调用）
 *   - scope='agent'   → 角色私有绑定（从 RoleProfilePanel 调用，传 targetRef=role_id）
 *
 * 行为轻量（behavior-light）：前端状态完整，ingest/retrieval 由 Epic 9 补齐。
 * citation_required 字段稳定保存，供 Story 8.5 Smoke Run 读取。
 */
import { useState, useId, useRef, useEffect } from 'react';
import { Sparkles, BookOpen } from '../../../common/icons/iconRegistry';
import { useBuilderStore } from '../../stores/builderStore';
import type { KnowledgeBinding } from '../../../common/types/agent-builder';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DockScope = 'shared' | 'agent';
type SourceTab = 'file' | 'url' | 'pack' | 'skip';
type AddStatus = 'idle' | 'loading' | 'success' | 'error';

export interface KnowledgeDockProps {
  scope: DockScope;
  /** role_id for agent-level bindings; undefined for shared */
  targetRef?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBindingId(): string {
  return `kb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const SOURCE_ICONS: Record<string, string> = {
  file: '📄',
  url: '🔗',
  pack: '📦',
  cid: '⛓',
  inline: '📝',
  unspecified: '⚪',
};

const FRESHNESS_LABELS: Record<string, string> = {
  always: '实时',
  daily: '每日',
  weekly: '每周',
  static: '静态',
};

// ---------------------------------------------------------------------------
// ToggleSwitch
// ---------------------------------------------------------------------------

interface ToggleSwitchProps {
  on: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
  label?: string;
}

function ToggleSwitch({ on, onChange, testId, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      data-testid={testId}
      className={[
        'relative h-[16px] w-[28px] shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sf-accent',
        on ? 'bg-sf-accent' : 'bg-sf-elev3',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[2px] h-[12px] w-[12px] rounded-full bg-white shadow-sm transition-transform',
          on ? 'translate-x-[14px]' : 'translate-x-[2px]',
        ].join(' ')}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// BindingRow
// ---------------------------------------------------------------------------

interface BindingRowProps {
  binding: KnowledgeBinding;
  onDelete: () => void;
  onToggleCitation: (v: boolean) => void;
}

function BindingRow({ binding, onDelete, onToggleCitation }: BindingRowProps) {
  return (
    <div
      className="rounded-[8px] border border-sf-border/60 bg-sf-elev1 p-3"
      data-testid={`binding-row-${binding.binding_id}`}
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-[14px]" aria-hidden>
          {SOURCE_ICONS[binding.source_type] ?? '📄'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-sf-fg1">
            {binding.source_ref || binding.binding_id}
          </p>
          <p className="font-mono text-[9px] text-sf-fg5">
            {binding.source_type} · {FRESHNESS_LABELS[binding.freshness_hint] ?? binding.freshness_hint}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 text-[11px] text-sf-fg5 hover:text-sf-reject"
          aria-label="删除绑定"
          data-testid={`binding-delete-${binding.binding_id}`}
        >
          ×
        </button>
      </div>

      {/* Citation required toggle */}
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[11px] text-sf-fg3">必须引用来源</span>
        <ToggleSwitch
          on={binding.citation_required}
          onChange={onToggleCitation}
          testId={`citation-toggle-${binding.binding_id}`}
          label="必须引用来源"
        />
      </div>

      {/* Smoke Run notice — T5: pre-embed citation signal for Story 8.5 */}
      {binding.citation_required && (
        <p
          className="mt-1.5 font-mono text-[9px] text-sf-fg5"
          data-testid={`citation-notice-${binding.binding_id}`}
        >
          <span className="inline-flex items-center gap-1"><Sparkles size={10} strokeWidth={2} /> 发布前 Smoke Run 将检查引用合规</span>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddSourceForm
// ---------------------------------------------------------------------------

interface AddSourceFormProps {
  scope: DockScope;
  targetRef?: string;
  onClose: () => void;
}

function AddSourceForm({ scope, targetRef, onClose }: AddSourceFormProps) {
  const addKnowledgeBinding = useBuilderStore((s) => s.addKnowledgeBinding);

  const [tab, setTab] = useState<SourceTab>('file');
  const [fileRef, setFileRef] = useState('');
  const [urlRef, setUrlRef] = useState('');
  const [packRef, setPackRef] = useState('');
  const [status, setStatus] = useState<AddStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const inputId = useId();

  const tabs: { key: SourceTab; label: string }[] = [
    { key: 'file', label: '文档' },
    { key: 'url', label: '链接' },
    { key: 'pack', label: '知识包' },
    { key: 'skip', label: '暂不绑定' },
  ];

  function validate(): string | null {
    if (tab === 'skip') return null;
    const ref = tab === 'file' ? fileRef : tab === 'url' ? urlRef : packRef;
    if (!ref.trim()) return '请输入来源信息';
    if (tab === 'url' && !/^https?:\/\/.+/.test(ref.trim())) {
      return 'URL 需以 http:// 或 https:// 开头';
    }
    return null;
  }

  function handleConfirm() {
    if (tab === 'skip') {
      onClose();
      return;
    }

    const err = validate();
    if (err) {
      setError(err);
      return;
    }

    setError(null);
    setStatus('loading');

    const ref =
      tab === 'file' ? fileRef : tab === 'url' ? urlRef : packRef;

    // Behavior-light: write to blueprint state immediately (Epic 9 handles real ingest)
    const binding: KnowledgeBinding = {
      binding_id: makeBindingId(),
      source_type: tab === 'pack' ? 'pack' : tab,
      source_ref: ref.trim(),
      retrieval_mode: 'auto',
      citation_required: false,
      freshness_hint: 'static',
      scope,
      target_ref: scope === 'agent' ? (targetRef ?? null) : null,
      metadata: {},
    };

    // Simulate async latency (behavior-light placeholder)
    // Epic 9 will replace this with real ingest API call; error path wired for future use.
    setTimeout(() => {
      if (!mountedRef.current) return;
      try {
        addKnowledgeBinding(binding);
        setStatus('success');
        setTimeout(() => {
          if (mountedRef.current) onClose();
        }, 600);
      } catch (e) {
        if (mountedRef.current) {
          setStatus('error');
          setError(e instanceof Error ? e.message : '添加失败，请重试');
        }
      }
    }, 300);
  }

  return (
    <div data-testid="add-source-panel">
      {/* Tab switcher */}
      <div className="mb-3 flex gap-1" role="tablist" data-testid="source-tabs">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              setTab(key);
              setError(null);
            }}
            data-testid={`tab-${key}`}
            className={[
              'rounded-[6px] px-2 py-1 text-[10px] font-semibold transition-colors',
              tab === key
                ? 'bg-sf-accent text-sf-accent-ink'
                : 'bg-sf-elev2 text-sf-fg4 hover:text-sf-fg1',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* File tab */}
      {tab === 'file' && (
        <div data-testid="tab-content-file">
          <input
            id={`${inputId}-file`}
            type="file"
            accept=".pdf,.md,.txt,.docx,.csv"
            className="hidden"
            data-testid="file-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setFileRef(f.name); setError(null); }
            }}
          />
          <label
            htmlFor={`${inputId}-file`}
            className="block cursor-pointer rounded-[8px] border-2 border-dashed border-sf-border px-4 py-5 text-center hover:border-sf-accent"
          >
            <p className="text-[22px] text-sf-fg5" aria-hidden>＋</p>
            <p className="text-[12px] text-sf-fg3">{fileRef || '拖拽或点击上传'}</p>
            <p className="mt-1 text-[10px] text-sf-fg5">PDF · Markdown · TXT · DOCX · CSV</p>
          </label>
        </div>
      )}

      {/* URL tab */}
      {tab === 'url' && (
        <div data-testid="tab-content-url">
          <input
            type="url"
            value={urlRef}
            onChange={(e) => { setUrlRef(e.target.value); setError(null); }}
            placeholder="https://example.com/doc"
            data-testid="url-input"
            className="w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none"
          />
        </div>
      )}

      {/* Knowledge Pack tab */}
      {tab === 'pack' && (
        <div data-testid="tab-content-pack">
          <input
            type="text"
            value={packRef}
            onChange={(e) => { setPackRef(e.target.value); setError(null); }}
            placeholder="Knowledge Pack 名称或 ID"
            data-testid="pack-input"
            className="w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none"
          />
          <p className="mt-1 font-mono text-[9px] text-sf-fg5">
            Epic 9 中支持完整 KnowledgePack CRUD；此处先绑定引用
          </p>
        </div>
      )}

      {/* Skip tab */}
      {tab === 'skip' && (
        <div
          className="rounded-[8px] bg-sf-elev1 px-4 py-4 text-center"
          data-testid="tab-content-skip"
        >
          <p className="text-[13px] text-sf-fg2">暂不绑定知识</p>
          <p className="mt-1 text-[11px] text-sf-fg4">后续 Smoke Run 将跳过来源检查</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mt-2 text-[11px] text-sf-reject" role="alert" data-testid="add-source-error">
          {error}
        </p>
      )}

      {/* Action buttons */}
      <div className="mt-3 flex gap-2">
        {status === 'loading' && (
          <span className="flex items-center gap-1.5 text-[11px] text-sf-fg4" data-testid="add-loading">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-sf-accent/30 border-t-sf-accent" />
            处理中…
          </span>
        )}
        {status === 'success' && (
          <span className="text-[11px] text-sf-ok" data-testid="add-source-success">
            ✓ 已添加
          </span>
        )}
        {status === 'idle' && (
          <>
            <button
              type="button"
              onClick={handleConfirm}
              data-testid="btn-confirm-add"
              className="rounded-[7px] bg-sf-accent px-3 py-1.5 text-[11px] font-semibold text-sf-accent-ink hover:opacity-90 disabled:opacity-50"
            >
              {tab === 'skip' ? '确认跳过' : '确认'}
            </button>
            <button
              type="button"
              onClick={onClose}
              data-testid="btn-cancel-add"
              className="rounded-[7px] bg-sf-elev2 px-3 py-1.5 text-[11px] text-sf-fg3 hover:text-sf-fg1"
            >
              取消
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeDock — main export
// ---------------------------------------------------------------------------

export function KnowledgeDock({ scope, targetRef }: KnowledgeDockProps) {
  const removeKnowledgeBinding = useBuilderStore((s) => s.removeKnowledgeBinding);
  const updateKnowledgeBinding = useBuilderStore((s) => s.updateKnowledgeBinding);

  const bindings = useBuilderStore((s) => {
    if (!s.blueprint) return [];
    return s.blueprint.knowledge_bindings.filter((b) => {
      if (scope === 'shared') return b.scope === 'shared';
      return b.scope === 'agent' && b.target_ref === (targetRef ?? null);
    });
  });

  const [showAdd, setShowAdd] = useState(false);

  const scopeLabel = scope === 'shared' ? '共享 · 全团队' : '本角色 · 私有';

  return (
    <div
      className="flex flex-col overflow-auto border-l border-sf-border bg-sf-panel"
      data-testid="knowledge-dock"
    >
      {/* Header */}
      <div className="border-b border-sf-border/50 px-4 py-3">
        <p className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-sf-accent-bright">
          ● knowledge dock
        </p>
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[15px] font-bold">
            <BookOpen size={15} strokeWidth={2} /> 知识来源
          </p>
          <span className="rounded-[4px] bg-sf-elev2 px-1.5 py-px font-mono text-[8px] text-sf-fg4">
            {scopeLabel}
          </span>
        </div>
      </div>

      {/* Binding list */}
      <div className="flex flex-col gap-1.5 px-4 py-3" data-testid="knowledge-binding-list">
        {bindings.length === 0 ? (
          <div
            className="rounded-[8px] border border-dashed border-sf-border py-6 text-center"
            data-testid="knowledge-empty-state"
          >
            <p className="text-[12px] text-sf-fg4">还没有绑定任何资料</p>
            <p className="mt-1 text-[11px] text-sf-fg5">
              可先上传文档、粘贴链接，或稍后再做
            </p>
          </div>
        ) : (
          bindings.map((b) => (
            <BindingRow
              key={b.binding_id}
              binding={b}
              onDelete={() => removeKnowledgeBinding(b.binding_id)}
              onToggleCitation={(v) => updateKnowledgeBinding(b.binding_id, { citation_required: v })}
            />
          ))
        )}
      </div>

      {/* Add source */}
      <div className="border-t border-sf-border/50 px-4 py-3">
        {!showAdd ? (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="w-full rounded-[8px] border border-dashed border-sf-border py-2 text-[11px] text-sf-fg4 transition-colors hover:border-sf-accent hover:text-sf-accent-bright"
            data-testid="btn-add-source"
          >
            ＋ 添加来源
          </button>
        ) : (
          <AddSourceForm
            scope={scope}
            targetRef={targetRef}
            onClose={() => setShowAdd(false)}
          />
        )}
      </div>

      {/* AC5: Smoke Run hint */}
      <div className="px-4 pb-3">
        <p className="font-mono text-[9px] text-sf-fg5" data-testid="smoke-run-hint">
          <span className="inline-flex items-center gap-1"><Sparkles size={10} strokeWidth={2} /> 发布前 Smoke Run 将根据 citation_required 检查引用合规性</span>
        </p>
      </div>
    </div>
  );
}
