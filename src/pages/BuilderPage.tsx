/**
 * BuilderPage — Story 8.2 + Story 8.3
 *
 * 三态统一壳：
 *   goal  → GoalModeForm + GoalModeResult（8.2 实现）
 *   scene → Scene Tree + Canvas + Inspector（8.3 实现）
 *   graph → 跳转 /editor（复用 EditorPage 资产）
 *
 * 统一状态源：mode / blueprint / selection 由 builderStore 持有。
 * Goal Mode 的表单/生成流程仍保持为组件本地状态（仅 Goal Mode 关注）。
 *
 * Story 7.8 compat: ?from=dm&context_type=dm&context_id=&goal= 全部保留
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

import { useBuilderStore } from '../core/stores/builderStore';
import type { BuilderView } from '../core/stores/builderStore';

import { BuilderModeSwitcher } from '../core/components/builder/BuilderModeSwitcher';
import { GoalModeForm } from '../core/components/builder/GoalModeForm';
import { GoalModeResult } from '../core/components/builder/GoalModeResult';
import { SceneTree } from '../core/components/builder/SceneTree';
import { SceneCanvasShell } from '../core/components/builder/SceneCanvasShell';
import { RoleInspector } from '../core/components/builder/inspector/RoleInspector';
import { TeamInspector } from '../core/components/builder/inspector/TeamInspector';
import { EmptyInspector } from '../core/components/builder/inspector/EmptyInspector';
import { SharedResourceInspector } from '../core/components/builder/inspector/SharedResourceInspector';
import { generateBlueprint, publishBlueprint, BuilderApiError } from '../api/builder';
import type { AgentBlueprint, BuilderPublishResponse, RoleProfile } from '../common/types/agent-builder';
import { SmokeRunPanel } from '../core/components/builder/SmokeRunPanel';
import { KitSmokeRunPanel } from '../core/components/builder/KitSmokeRunPanel';
import { PublishSuccessPanel } from '../core/components/builder/PublishSuccessPanel';
import { CatalogImportSidebar } from '../core/components/builder/CatalogImportSidebar';
import { PromoteToTeamWizard } from '../core/components/builder/PromoteToTeamWizard';

// Re-export for backward compat (BuilderModeSwitcher & tests may import from here)
export type { BuilderView };

export interface BuilderFormState {
  goal: string;
  audience: string;
  knowledge_sources: string[];
  mode: 'single' | 'team' | undefined;
  desired_output: 'answer' | 'report' | 'review' | 'workflow_draft' | undefined;
}

type GenerateStatus = 'idle' | 'loading' | 'success' | 'error-validation' | 'error-server';

interface GenerateResult {
  blueprint: AgentBlueprint;
  meta: {
    confidence: number;
    missing_inputs: string[];
    suggested_next_step: string;
    source?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseInitialGoal(searchParams: URLSearchParams): string {
  const raw = searchParams.get('goal') ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Find a RoleProfile by id anywhere in the blueprint (top-level + sub_agents) */
function findRole(bp: AgentBlueprint, id: string): RoleProfile | undefined {
  for (const r of bp.role_profiles) {
    if (r.role_id === id) return r;
    const sub = r.sub_agents.find((s) => s.role_id === id);
    if (sub) return sub;
  }
  return undefined;
}

function isBossRole(bp: AgentBlueprint, roleId: string): boolean {
  const role = bp.role_profiles.find((r) => r.role_id === roleId);
  return !!role && (role.can_spawn_tasks || role.sub_agents.length > 0);
}

// ---------------------------------------------------------------------------
// Scene Mode shell (4-region layout)
// ---------------------------------------------------------------------------

function SceneModeShell({ blueprint }: { blueprint: AgentBlueprint }) {
  const selection = useBuilderStore((s) => s.selection);
  const addSubAgent = useBuilderStore((s) => s.addSubAgent);
  const setBlueprint = useBuilderStore((s) => s.setBlueprint);

  // Story 13.3 — Catalog import sidebar state
  const [showCatalogImport, setShowCatalogImport] = useState(false);
  // Story 13.6 AC5 — anchor 替换模式
  const [replaceRoleId, setReplaceRoleId] = useState<string | null>(null);
  // Story 13.6 review P7 — surface "anchor disappeared" so silent-loss is detectable
  const [replaceErrorToast, setReplaceErrorToast] = useState<string | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const ce = e as CustomEvent<{ replaceRoleId?: string }>;
      setReplaceRoleId(ce.detail?.replaceRoleId ?? null);
      setShowCatalogImport(true);
    }
    window.addEventListener('sf:open-catalog-import', onOpen as EventListener);
    return () =>
      window.removeEventListener('sf:open-catalog-import', onOpen as EventListener);
  }, []);

  const handleAddWorker = useCallback((bossRoleId: string) => {
    const worker: RoleProfile = {
      role_id: `worker-${Date.now()}`,
      name: 'New Worker',
      description: '',
      persona: '',
      responsibilities: [],
      constraints: [],
      capabilities: [],
      tools: [],
      executor_kind: 'api',
      executor_provider: 'claude',
      executor_model: 'claude-3-5-sonnet',
      handoff_rules: [],
      can_spawn_tasks: false,
      sub_agents: [],
      persona_traits: {},
      state_fields: [],
      metadata: {},
    };
    addSubAgent(bossRoleId, worker);
  }, [addSubAgent]);

  // Resolve inspector content based on selection
  const inspector = useMemo(() => {
    if (!selection || selection === null) return <EmptyInspector />;
    if (selection === 'team') return <TeamInspector blueprint={blueprint} />;
    if (
      selection === 'shared-tools' ||
      selection === 'shared-knowledge' ||
      selection === 'shared-memory'
    ) {
      return (
        <SharedResourceInspector
          kind={selection as 'shared-tools' | 'shared-knowledge' | 'shared-memory'}
          blueprint={blueprint}
        />
      );
    }
    const role = findRole(blueprint, selection);
    if (!role) return <EmptyInspector />;
    const boss = isBossRole(blueprint, selection);
    return (
      <RoleInspector
        key={role.role_id}
        role={role}
        isBoss={boss}
        onAddWorker={boss ? () => handleAddWorker(role.role_id) : undefined}
      />
    );
  }, [selection, blueprint, handleAddWorker]);

  // Story 13.3 + 13.6: handle successful catalog import.
  // Default — append. When replaceRoleId is set (Story 13.6 AC5), splice in place
  // and preserve anchor metadata + clear stale workflow_binding (per Open Question 3).
  //
  // H1 fix: useCallback + selector-based blueprint read avoids stale-closure on
  // unmount during in-flight import (CatalogImportSidebar may invoke this after
  // blueprint state changed elsewhere).
  const handleCatalogImportSuccess = useCallback(
    (role: RoleProfile, replaceTargetRoleId?: string) => {
      // P5: prefer the explicit argument from CatalogImportSidebar so the
      // replace target is carried in-band with the import event, instead of
      // depending on the local replaceRoleId closure (which can desync).
      const targetId = replaceTargetRoleId ?? replaceRoleId ?? null;
      const current = useBuilderStore.getState().blueprint;
      if (!current) return;

      // P1+P7: when replacing, refuse silently appending if the target no
      // longer exists in the current blueprint (e.g. concurrent edit).
      if (targetId) {
        const targetExists = current.role_profiles.some((r) => r.role_id === targetId);
        if (!targetExists) {
          setReplaceErrorToast('主负责人角色已不存在，切换已取消。');
          setReplaceRoleId(null);
          return;
        }
      }

      let nextRoles: RoleProfile[];
      let newAnchorRoleId: string | null = null;
      if (targetId) {
        nextRoles = current.role_profiles.map((r) => {
          if (r.role_id !== targetId) return r;
          // P1: keep incoming role's role_id (so other refs to the new role
          // resolve), but anchor-flag it and preserve incoming imported_from
          // when present (do not clobber to '').
          const incomingMeta = role.metadata ?? {};
          const preservedMeta: Record<string, unknown> = {
            ...incomingMeta,
            anchor: true,
          };
          const incomingImportedFrom = incomingMeta.imported_from;
          const oldImportedFrom = r.metadata?.imported_from;
          if (typeof incomingImportedFrom === 'string' && incomingImportedFrom) {
            preservedMeta.imported_from = incomingImportedFrom;
          } else if (typeof oldImportedFrom === 'string' && oldImportedFrom) {
            preservedMeta.imported_from = oldImportedFrom;
          }
          newAnchorRoleId = role.role_id;
          return { ...role, metadata: preservedMeta };
        });
      } else {
        // 13-3 AC5 dedup: reject sequential re-import of the same catalog source.
        const dupSrc =
          typeof role.metadata?.imported_from === 'string' && role.metadata.imported_from
            ? role.metadata.imported_from
            : null;
        if (
          dupSrc &&
          current.role_profiles.some((r) => r.metadata?.imported_from === dupSrc)
        ) {
          setReplaceErrorToast(`「${role.name}」已在团队中，若需替换请先移除现有角色。`);
          return;
        }
        nextRoles = [...current.role_profiles, role];
      }

      const newMeta = { ...(current.metadata ?? {}) } as Record<string, unknown>;
      // P1: keep top-level anchor_role_id pointing at the new role, not the stale id.
      if (newAnchorRoleId) {
        newMeta.anchor_role_id = newAnchorRoleId;
      }
      // P8: only drop workflow_binding when it actually targets the replaced role.
      if (targetId) {
        const wb = newMeta.workflow_binding as { role_id?: string } | undefined;
        if (wb && typeof wb === 'object' && wb.role_id === targetId) {
          delete newMeta.workflow_binding;
        }
      }
      setBlueprint({ ...current, role_profiles: nextRoles, metadata: newMeta });
      setReplaceRoleId(null);
    },
    [replaceRoleId, setBlueprint],
  );

  return (
    <>
      <div
        className="flex h-full overflow-hidden rounded-[14px] border border-sf-border"
        data-testid="scene-mode-shell"
      >
        {/* Left: Scene Tree (260px) */}
        <div className="w-[260px] shrink-0 overflow-hidden">
          <SceneTree
            blueprint={blueprint}
            onOpenCatalogImport={() => setShowCatalogImport(true)}
          />
        </div>

        {/* Center: Canvas (flex-1) */}
        <SceneCanvasShell blueprint={blueprint} />

        {/* Right: Inspector (300px) */}
        <div className="w-[300px] shrink-0 overflow-hidden">
          {inspector}
        </div>
      </div>

      {/* Story 13.3: Catalog Import Drawer */}
      {showCatalogImport && (
        <CatalogImportSidebar
          blueprintId={blueprint.blueprint_id}
          onClose={() => {
            setShowCatalogImport(false);
            setReplaceRoleId(null);
          }}
          onImportSuccess={handleCatalogImportSuccess}
          replaceRoleId={replaceRoleId ?? undefined}
        />
      )}

      {/* Story 13.6 review P7: replace-target-missing toast */}
      {replaceErrorToast && (
        <div
          data-testid="replace-anchor-error-toast"
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-[10px] border border-sf-reject bg-sf-elev2 px-4 py-3 text-[13px] text-sf-fg0 shadow-xl"
          role="alert"
        >
          {replaceErrorToast}
          <button
            type="button"
            onClick={() => setReplaceErrorToast(null)}
            className="ml-3 text-sf-fg3 hover:text-sf-fg1"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// BuilderPage
// ---------------------------------------------------------------------------

export default function BuilderPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // --- unified store (mode + blueprint + selection) ---
  const storeMode = useBuilderStore((s) => s.mode);
  const storeBlueprint = useBuilderStore((s) => s.blueprint);
  const setStoreMode = useBuilderStore((s) => s.setMode);
  const setStoreBlueprint = useBuilderStore((s) => s.setBlueprint);

  // --- publish state (local, Story 8.6) ---
  const lastSmokeRunResult = useBuilderStore((s) => s.lastSmokeRunResult);
  type PublishStatus = 'idle' | 'publishing' | 'success' | 'error' | 'blocked';
  const [publishStatus, setPublishStatus] = useState<PublishStatus>('idle');
  const [publishResult, setPublishResult] = useState<BuilderPublishResponse['data'] | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  /** When true, shows the "warning" confirmation dialog before publishing. */
  const [showWarningConfirm, setShowWarningConfirm] = useState(false);

  // --- goal mode form state (local) ---
  const [form, setForm] = useState<BuilderFormState>({
    goal: parseInitialGoal(searchParams),
    audience: '',
    knowledge_sources: [],
    mode: undefined,
    desired_output: undefined,
  });

  // --- generate state (local) ---
  const [status, setStatus] = useState<GenerateStatus>('idle');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  // Story 7.8 compat URL params
  const fromParam = searchParams.get('from') ?? '';
  const contextType = searchParams.get('context_type') ?? '';
  const contextId = searchParams.get('context_id') ?? '';
  const sanitizedContextId = contextId.replace(/[^a-zA-Z0-9\-_]/g, '');
  const isFromDM = fromParam === 'dm' && contextType === 'dm' && !!sanitizedContextId;

  // Story 13-4 H1 — read inferred intents from Goal Clarity Wizard handoff
  const intentsParam = searchParams.get('intents') ?? '';
  const inferredIntents = intentsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const INTENT_LABELS_BUILDER: Record<string, string> = {
    research: '研究',
    writing: '写作',
    code: '代码',
    data: '数据',
    review: '审核',
    other: '其他',
  };

  function patchForm(patch: Partial<BuilderFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    if ('goal' in patch) setValidationError(null);
  }

  async function handleGenerate() {
    if (status === 'loading') return;
    if (!form.goal.trim()) {
      setValidationError('目标不够清晰 — 请描述你希望 Agent 完成什么。');
      setStatus('error-validation');
      return;
    }
    if (!form.mode) {
      setValidationError('请选择 Mode（单个助手 or 团队）。');
      setStatus('error-validation');
      return;
    }
    if (!form.desired_output) {
      setValidationError('请选择期望产出（Desired Output）。');
      setStatus('error-validation');
      return;
    }

    setValidationError(null);
    setServerError(null);
    setStatus('loading');

    try {
      const effectiveKnowledgeSources = form.knowledge_sources.filter(
        (k) => k !== 'none' && k !== 'knowledge_pack',
      );
      const resp = await generateBlueprint({
        goal: form.goal.trim(),
        audience: form.audience || undefined,
        mode: form.mode,
        desired_output: form.desired_output,
        knowledge_sources:
          effectiveKnowledgeSources.length > 0 ? effectiveKnowledgeSources : undefined,
        reference_agent_id: isFromDM && sanitizedContextId ? sanitizedContextId : undefined,
      });

      const blueprint = resp.data;
      if (fromParam === 'chat' && sanitizedContextId) {
        blueprint.metadata = { ...blueprint.metadata, created_from: `chat:${sanitizedContextId}` };
      }
      if (!isMountedRef.current) return;
      setResult({ blueprint, meta: resp.meta });
      setStatus('success');
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof BuilderApiError) {
        if (err.status === 422) {
          setValidationError('生成骨架失败 — 目标内容不符合校验规则，请修改后重试。');
          setStatus('error-validation');
        } else {
          setServerError('生成骨架失败，请稍后重试。');
          setStatus('error-server');
        }
      } else {
        setServerError('网络错误，请检查连接后重试。');
        setStatus('error-server');
      }
    }
  }

  function handleRegenerate() {
    void handleGenerate();
  }

  function handleAcceptScene() {
    if (result) {
      setStoreBlueprint(result.blueprint);
      setStoreMode('scene');
    }
  }

  function handleFromTemplate() {
    navigate('/templates');
  }

  function handleSwitchToGraph() {
    if (result?.blueprint) {
      setStoreBlueprint(result.blueprint);
    }
    navigate('/editor');
  }

  function handleViewChange(next: BuilderView) {
    setShowWarningConfirm(false);
    if (next === 'graph') {
      navigate('/editor');
      return;
    }
    setStoreMode(next);
  }

  function handleSmokeRunSwitchMode(mode: 'goal' | 'scene' | 'graph') {
    if (mode === 'graph') {
      navigate('/editor');
      return;
    }
    setStoreMode(mode);
  }

  function handleOpenKnowledgeDock() {
    useBuilderStore.setState((s) => {
      s.mode = 'scene';
      s.selection = 'shared-knowledge';
    });
  }

  function handleOpenToolRegistry() {
    useBuilderStore.setState((s) => {
      s.mode = 'scene';
      s.selection = 'shared-tools';
    });
  }

  // Story 8.6 AC1: Publish Gate — check lastSmokeRunResult before publishing
  async function executePublish() {
    if (!storeBlueprint) return;
    setPublishStatus('publishing');
    setPublishError(null);
    try {
      const resp = await publishBlueprint(storeBlueprint);
      setPublishResult(resp.data);
      setPublishStatus('success');
    } catch (err) {
      // Patch 16+18: HTTP 422 is now REGRESSION_BLOCKED; distinguish from other errors
      let msg: string;
      if (err instanceof BuilderApiError) {
        if (err.status === 422) {
          // REGRESSION_BLOCKED — backend now returns HTTP 422
          setPublishStatus('blocked');
          const detail = err.detail as { error?: { message?: string } } | undefined;
          setPublishError(detail?.error?.message ?? 'Regression Gate 阻止发布，请完成 Smoke Run 后再发布。');
          return;
        }
        msg = `发布失败（服务端错误 ${err.status}），请稍后重试`;
      } else {
        msg = '网络错误，请检查连接后重试';
      }
      setPublishStatus('error');
      setPublishError(msg);
    }
  }

  function handlePublishClick() {
    if (!storeBlueprint) return;
    if (!lastSmokeRunResult || lastSmokeRunResult.status === 'failed') {
      // Redirect to Validate tab with inline prompt
      setStoreMode('validate');
      setPublishStatus('blocked');
      setPublishError('请先完成 Smoke Run 验证，再执行发布。');
      return;
    }
    if (lastSmokeRunResult.status === 'warning') {
      setShowWarningConfirm(true);
      return;
    }
    // status === 'passed' → proceed directly
    void executePublish();
  }

  function handleWarningConfirm() {
    setShowWarningConfirm(false);
    void executePublish();
  }

  function handleBackToEdit() {
    setPublishStatus('idle');
    setPublishResult(null);
    setPublishError(null);
    setStoreMode('scene');
  }

  // Story 13.6 — auto-mount PromoteToTeamWizard when ?promote=1 and blueprint has anchor.
  // P2: track consumption keyed on blueprint_id so that:
  //   1) async blueprint loads (?promote=1&blueprint_id=X) don't lose the trigger when
  //      the effect first runs against a stale store.
  //   2) different blueprints can be promoted in turn within the same session.
  // Wizard onClose clears the ?promote=1 param so back/refresh doesn't re-open it.
  const promoteParam = searchParams.get('promote');
  const [promoteWizardOpen, setPromoteWizardOpen] = useState(false);
  const consumedPromoteForRef = useRef<string | null>(null);
  useEffect(() => {
    if (promoteParam !== '1') return;
    if (!storeBlueprint) return;
    if (consumedPromoteForRef.current === storeBlueprint.blueprint_id) return;
    const hasAnchor = storeBlueprint.role_profiles.some(
      (r) => r.metadata?.anchor === true,
    );
    if (hasAnchor) {
      setStoreMode('scene');
      setPromoteWizardOpen(true);
      consumedPromoteForRef.current = storeBlueprint.blueprint_id;
    }
  }, [promoteParam, storeBlueprint, setStoreMode]);

  // Story 13.2 H1 follow-up: Consume `workflow_ref` URL param after returning from
  // EditorPage (`/editor?return_to=builder` round-trip). When present, write into
  // blueprint.execution_mode via builderStore.updateExecutionMode and strip the
  // params so refresh / back doesn't re-apply.
  const workflowRefParam = searchParams.get('workflow_ref');
  const workflowRefNameParam = searchParams.get('workflow_ref_name');
  const consumedWorkflowRefRef = useRef<string | null>(null);
  useEffect(() => {
    if (!workflowRefParam) return;
    if (!storeBlueprint) return;
    if (consumedWorkflowRefRef.current === workflowRefParam) return;
    useBuilderStore.getState().updateExecutionMode({
      mode: 'workflow',
      workflow_ref: workflowRefParam,
      workflow_name: workflowRefNameParam ?? undefined,
    });
    consumedWorkflowRefRef.current = workflowRefParam;
    setStoreMode('scene');
    // Strip the params so refresh doesn't re-apply.
    // Functional updater avoids capturing stale `searchParams` closure.
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('workflow_ref');
      next.delete('workflow_ref_name');
      return next;
    }, { replace: true });
  }, [workflowRefParam, workflowRefNameParam, storeBlueprint, setSearchParams, setStoreMode]);

  function handlePromoteWizardClose() {
    setPromoteWizardOpen(false);
    if (searchParams.get('promote') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('promote');
      setSearchParams(next, { replace: true });
    }
  }

  const view = storeMode;

  return (
    <div className="min-h-screen bg-sf-bg text-sf-fg1" data-testid="builder-page">
      <div className="mx-auto max-w-[1400px] px-8 py-10">

        {isFromDM && (
          <div
            className="mb-6 rounded-[10px] border border-sf-accent/30 bg-sf-accent-tint px-4 py-3 text-[13px] text-sf-accent-bright"
            data-testid="builder-dm-banner"
          >
            正在基于「{form.goal || sanitizedContextId}」创建新 Agent，可参考原有配置
          </div>
        )}

        {/* Story 13-4 H1 — show intents inferred by Goal Clarity Wizard */}
        {inferredIntents.length > 0 && (
          <div
            className="mb-6 flex flex-wrap items-center gap-2 rounded-[10px] border border-sf-border bg-sf-panel px-4 py-3 text-[13px] text-sf-fg2"
            data-testid="builder-inferred-intents"
          >
            <span className="text-sf-fg3">根据目标推断的意图：</span>
            {inferredIntents.map((intent) => (
              <span
                key={intent}
                data-testid={`builder-inferred-intent-${intent}`}
                className="rounded-pill border border-sf-accent/40 bg-sf-accent/10 px-2.5 py-0.5 text-[12px] text-sf-accent-bright"
              >
                {INTENT_LABELS_BUILDER[intent] ?? intent}
              </span>
            ))}
          </div>
        )}

        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sf-accent-bright">
          Agent Builder
        </p>
        <h1 className="mt-1 mb-2 text-[32px] font-extrabold tracking-[-0.03em]">
          Start from intent, not a blank canvas.
        </h1>
        <p className="mb-6 max-w-[700px] text-[15px] leading-relaxed text-sf-fg3">
          Five inputs. One button. Defaults open to{' '}
          <span className="text-sf-accent-bright">Goal Mode</span> — no nodes,
          edges, or policy matrices until you're ready.
        </p>

        <div className="mb-6 flex items-center gap-4">
          <BuilderModeSwitcher current={view} onChange={handleViewChange} />

          {/* Publish button — visible when blueprint exists and not in success state (Story 8.6 T3) */}
          {storeBlueprint && publishStatus !== 'success' && (
            <button
              type="button"
              onClick={handlePublishClick}
              disabled={publishStatus === 'publishing'}
              className="ml-auto flex items-center gap-2 rounded-[8px] bg-sf-ok px-4 py-1.5 font-mono text-[12px] font-bold text-white transition-opacity disabled:opacity-50 hover:enabled:opacity-90"
              data-testid="publish-btn"
            >
              {publishStatus === 'publishing' ? (
                <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /> 发布中…</>
              ) : '↑ 发布 Agent'}
            </button>
          )}
        </div>

        {/* Warning confirm dialog (Story 8.6 AC1) */}
        {showWarningConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="warning-confirm-dialog">
            <div className="rounded-[14px] border border-sf-border bg-sf-panel p-6 shadow-xl max-w-sm w-full mx-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-sf-warn">存在警告</p>
              <p className="mt-2 text-[14px]">存在警告，是否继续发布？</p>
              <div className="mt-4 flex gap-3 justify-end">
                <button type="button" onClick={() => setShowWarningConfirm(false)} className="px-4 py-1.5 text-[13px] text-sf-fg3 hover:text-sf-fg1">取消</button>
                <button
                  type="button"
                  onClick={handleWarningConfirm}
                  disabled={publishStatus === 'publishing'}
                  className="rounded-[8px] bg-sf-warn px-4 py-1.5 font-mono text-[12px] font-bold text-white disabled:opacity-50"
                  data-testid="warning-confirm-ok"
                >确认发布</button>
              </div>
            </div>
          </div>
        )}

        {/* Publish blocked / error inline prompt */}
        {(publishStatus === 'blocked' || publishStatus === 'error') && publishError && (
          <div
            className="mb-4 rounded-[10px] border border-sf-reject/40 bg-sf-reject/8 px-4 py-3 text-[13px] text-sf-reject"
            role="alert"
            data-testid="publish-error-banner"
          >
            {publishError}
            {publishStatus === 'blocked' && (
              <button type="button" onClick={() => { setPublishStatus('idle'); setPublishError(null); setStoreMode('validate'); }} className="ml-3 underline hover:no-underline">
                → 前往 Smoke Run
              </button>
            )}
          </div>
        )}

        {/* ---- Publish Success Panel (Story 8.6 AC7) — persists until user clicks CTA/back ---- */}
        {publishStatus === 'success' && publishResult && (
          <div className="max-w-[640px]" data-testid="publish-success-wrapper">
            <PublishSuccessPanel
              templateId={publishResult.template_id}
              workflowId={publishResult.workflow_id}
              kitTags={publishResult.kit_tags}
              onBackToEdit={handleBackToEdit}
            />
          </div>
        )}

        {/* ---- Goal Mode ---- */}
        {publishStatus !== 'success' && view === 'goal' && (
          <div className="grid grid-cols-[1fr_380px] gap-6">
            <div>
              <GoalModeForm
                values={form}
                onChange={patchForm}
                onSubmit={handleGenerate}
                onFromTemplate={handleFromTemplate}
                onSkipToGraph={handleSwitchToGraph}
                isLoading={status === 'loading'}
                validationError={validationError}
              />

              {status === 'error-server' && serverError && (
                <div
                  className="mt-4 rounded-[10px] border border-sf-reject/40 bg-sf-reject-tint px-4 py-3 text-[13px] text-sf-reject"
                  data-testid="server-error-banner"
                  role="alert"
                >
                  <strong>生成骨架失败</strong> — {serverError}
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    className="ml-3 underline hover:no-underline"
                  >
                    ↻ 重试
                  </button>
                </div>
              )}
            </div>

            <div>
              {result ? (
                <div className="relative">
                  <GoalModeResult
                    blueprint={result.blueprint}
                    meta={result.meta}
                    onAcceptScene={handleAcceptScene}
                    onRegenerate={handleRegenerate}
                    onFromTemplate={handleFromTemplate}
                    onOpenGraph={handleSwitchToGraph}
                    isLoading={status === 'loading'}
                  />
                  {status === 'loading' && (
                    <div
                      className="absolute inset-0 flex items-center justify-center rounded-[14px] bg-sf-bg/70"
                      data-testid="result-regenerate-overlay"
                    >
                      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-sf-accent/30 border-t-sf-accent" data-testid="loading-spinner" />
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="sticky top-5 rounded-[14px] border border-sf-border/60 bg-sf-panel/60 p-6 text-center"
                  data-testid="result-idle-hint"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sf-fg5">
                    Blueprint result
                  </p>
                  <p className="mt-2 text-[13px] text-sf-fg4">
                    Fill in goal &amp; mode, then click{' '}
                    <span className="text-sf-fg2">Generate Blueprint</span>.
                  </p>
                  {status === 'loading' && (
                    <div className="mt-4 flex justify-center">
                      <span
                        className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-sf-accent/30 border-t-sf-accent"
                        data-testid="loading-spinner"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---- Scene Mode ---- */}
        {publishStatus !== 'success' && view === 'scene' && (
          <div
            style={{ height: 'calc(100vh - 260px)', minHeight: '520px' }}
          >
            {storeBlueprint ? (
              <SceneModeShell blueprint={storeBlueprint} />
            ) : (
              <div
                className="flex h-full flex-col items-center justify-center rounded-[14px] border border-sf-border text-center"
                data-testid="scene-no-blueprint"
              >
                <p className="text-[14px] text-sf-fg3">
                  No blueprint yet.{' '}
                  <button
                    type="button"
                    onClick={() => setStoreMode('goal')}
                    className="text-sf-accent-bright underline hover:no-underline"
                  >
                    Go back to Goal Mode
                  </button>{' '}
                  to generate one first.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Story 13.6 — Promote to Team wizard */}
        {promoteWizardOpen && storeBlueprint && (
          <PromoteToTeamWizard
            blueprint={storeBlueprint}
            onClose={handlePromoteWizardClose}
          />
        )}

        {/* ---- Validate Mode (Smoke Run) ---- */}
        {publishStatus !== 'success' && view === 'validate' && (
          <div
            className="max-w-[680px] rounded-[14px] border border-sf-border bg-sf-surface p-8"
            data-testid="validate-mode-shell"
          >
            <SmokeRunPanel
              onSwitchMode={handleSmokeRunSwitchMode}
              onOpenKnowledgeDock={handleOpenKnowledgeDock}
              onOpenToolRegistry={handleOpenToolRegistry}
            />

            {/* Story 10.6 AC5 — Kit-specific smoke / regression panel.
                Visible when the blueprint is bound to a Kit (metadata.kit_id),
                appended below the legacy SmokeRunPanel. */}
            {storeBlueprint && typeof storeBlueprint.metadata?.kit_id === 'string' && (
              <div className="mt-6 border-t border-sf-border pt-6" data-testid="kit-smoke-section">
                <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-sf-fg5">
                  Kit Smoke Run · {String(storeBlueprint.metadata.kit_id)}
                </p>
                <KitSmokeRunPanel
                  kitId={String(storeBlueprint.metadata.kit_id)}
                  blueprint={storeBlueprint}
                  onNavigate={(target) => {
                    if (target === 'knowledge_dock') {
                      handleOpenKnowledgeDock();
                    } else if (target === 'tool_registry') {
                      handleOpenToolRegistry();
                    } else if (target === 'policy_panel') {
                      setStoreMode('scene');
                    }
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
