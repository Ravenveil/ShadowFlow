/**
 * PromoteToTeamWizard — Story 13.6 (AC4)
 *
 * 3 步向导：确认锚点 → 推荐协作角色 → 完成预览。
 * 在 BuilderPage 检测到 ?promote=1 参数且 blueprint 含 anchor RoleProfile 时自动挂载。
 *
 * Story 13.6 review:
 *   - D1-a: Step 2 三个 fallback —「跳过」「手动添加空角色」「从 Kit 选模板组合」
 *   - D2-b: 推荐匹配改用对端 collaboration_contract.accepts_from（语义键），
 *           不再 substring 匹配展示名 — 见 matchByContract
 *   - P4: 引入去重 — 排除 anchor 与 blueprint 已 imported_from 的 Catalog Agent
 *   - P9: Step 1 显示 kit_type / accepts_from / collaboration_style
 *   - P11: mounted ref 阻断 unmount 后 setState；错误分支按 status 分文案；
 *          Step 3 走 useBuilderStore 实时订阅；delivers_to undefined 显式空状态
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { listCatalogApps } from '../../../api/catalog';
import { importAgentToBlueprint, BuilderApiError } from '../../../api/builder';
import type { CatalogAppSummary } from '../../../common/types/catalog';
import type {
  AgentBlueprint,
  RoleProfile,
} from '../../../common/types/agent-builder';
import { useBuilderStore } from '../../stores/builderStore';

export interface PromoteToTeamWizardProps {
  blueprint: AgentBlueprint;
  onClose: () => void;
}

type Step = 1 | 2 | 3;

/**
 * AC4 Step 2 推荐匹配 — Story 13.6 review D2-b。
 *
 * 用对端 collaboration_contract.accepts_from（语义键）反向匹配 anchor.delivers_to，
 * 替代了原先用 app.name substring 的简单包含逻辑（"Quarterly Report" 误冒充
 * report_writer 协作伙伴）。
 *
 * `excludeIds` 是去重集合（包含 anchor 自己 + blueprint 已 imported_from 的 Agent）。
 */
export function matchByContract(
  catalog: CatalogAppSummary[],
  anchorDeliversTo: string[],
  excludeIds: ReadonlySet<string>,
): CatalogAppSummary[] {
  const needles = anchorDeliversTo
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  if (needles.length === 0) return [];
  return catalog
    .filter((app) => !excludeIds.has(app.app_id))
    .filter((app) => {
      const accepts = app.collaboration_contract?.accepts_from ?? [];
      const acceptsLc = accepts.map((s) => s.toLowerCase());
      // primary: anchor.delivers_to ⊆ peer.accepts_from
      if (needles.some((n) => acceptsLc.includes(n))) return true;
      // fallback for legacy Catalog records lacking collaboration_contract:
      // strict kit_type match on a needle.
      const kit = (app.kit_type ?? '').toLowerCase();
      return kit !== '' && needles.includes(kit);
    });
}

/**
 * @deprecated kept as an alias for any external import; new logic should use matchByContract.
 */
export function matchByDeliversTo(
  catalog: CatalogAppSummary[],
  deliversTo: string[],
  excludeId: string,
): CatalogAppSummary[] {
  return matchByContract(catalog, deliversTo, new Set(excludeId ? [excludeId] : []));
}

export function PromoteToTeamWizard({ blueprint, onClose }: PromoteToTeamWizardProps) {
  const setBlueprint = useBuilderStore((s) => s.setBlueprint);
  // P11: Step 3 reactive read so a mid-flight import (or external mutation)
  // is reflected in the summary instead of showing a frozen snapshot.
  const liveBlueprint = useBuilderStore((s) => s.blueprint) ?? blueprint;
  const [step, setStep] = useState<Step>(1);

  // P11: mounted-ref to drop late async results after the wizard unmounts.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Locate anchor role on the prop blueprint (the wizard is mounted only when
  // the parent already verified an anchor exists — using the prop avoids being
  // misled by an unrelated store snapshot).
  const anchor = useMemo<RoleProfile | undefined>(
    () => blueprint.role_profiles.find((r) => r.metadata?.anchor === true),
    [blueprint],
  );

  const contract = anchor?.collaboration_contract;
  const deliversTo = contract?.delivers_to ?? [];
  const acceptsFrom = contract?.accepts_from ?? [];
  const collaborationStyle = contract?.collaboration_style;
  const anchorAgentId =
    (anchor?.metadata?.imported_from as string | undefined) ?? '';

  // P4 — exclude anchor + every role already imported into this blueprint.
  const excludeIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    if (anchorAgentId) ids.add(anchorAgentId);
    for (const r of liveBlueprint.role_profiles) {
      const src = r.metadata?.imported_from;
      if (typeof src === 'string' && src) ids.add(src);
    }
    return ids;
  }, [liveBlueprint, anchorAgentId]);

  // Step 2 — load catalog and compute recommendations
  const [catalog, setCatalog] = useState<CatalogAppSummary[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (step !== 2 || catalogStatus !== 'idle') return;
    let cancelled = false;
    setCatalogStatus('loading');
    setCatalogError(null);
    listCatalogApps({ page_size: 20 })
      .then((resp) => {
        if (cancelled || !isMountedRef.current) return;
        setCatalog(resp.data.apps);
        setCatalogStatus('success');
      })
      .catch((err) => {
        if (cancelled || !isMountedRef.current) return;
        setCatalogError(err instanceof Error ? err.message : '加载失败');
        setCatalogStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [step, catalogStatus]);

  const recommendations = useMemo(
    () => matchByContract(catalog, deliversTo, excludeIds),
    [catalog, deliversTo, excludeIds],
  );

  function handleClose() {
    onClose();
  }

  async function handleImportRecommendation(app: CatalogAppSummary) {
    if (importingId) return;
    setImportingId(app.app_id);
    setImportErrors((prev) => ({ ...prev, [app.app_id]: '' }));
    try {
      const role = await importAgentToBlueprint(blueprint.blueprint_id, app.app_id);
      if (!isMountedRef.current) return;
      const current = useBuilderStore.getState().blueprint ?? blueprint;
      setBlueprint({
        ...current,
        role_profiles: [...current.role_profiles, role],
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      // P11: split error branches by status — better UX than swallow-all.
      let msg = '引入失败，请稍后重试';
      if (err instanceof BuilderApiError) {
        if (err.status === 404) msg = '该 Agent 已从 Catalog 移除';
        else if (err.status === 422) msg = 'Agent 快照与当前 Builder 合同不兼容';
        else if (err.status >= 500) msg = '服务暂时不可用，请稍后重试';
      }
      setImportErrors((prev) => ({ ...prev, [app.app_id]: msg }));
    } finally {
      if (isMountedRef.current) setImportingId(null);
    }
  }

  // D1-a — Step 2 fallback: 「手动添加空角色」append a blank RoleProfile.
  function handleAddBlankRole() {
    const current = useBuilderStore.getState().blueprint ?? blueprint;
    const blank: RoleProfile = {
      role_id: `role-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: '新角色',
      description: '',
      persona: '',
      responsibilities: [],
      constraints: [],
      tools: [],
      executor_kind: 'api',
      executor_provider: 'anthropic',
      executor_model: 'claude-sonnet-4-6',
      capabilities: [],
      handoff_rules: [],
      persona_traits: {},
      state_fields: [],
      can_spawn_tasks: false,
      sub_agents: [],
      metadata: {},
    };
    setBlueprint({
      ...current,
      role_profiles: [...current.role_profiles, blank],
    });
  }

  // D1-a — Step 2 fallback: 「从 Kit 选模板组合」 — there is no in-Builder Kit picker
  // yet; navigate to the existing /templates page (which lists Kit-derived starters).
  function handlePickFromKit() {
    onClose();
    // Avoid taking a hard dependency on Router context here so the wizard can
    // be used in non-Router test harnesses; the parent route is /builder so
    // a plain href change is safe.
    if (typeof window !== 'undefined') window.location.assign('/templates');
  }

  if (!anchor) {
    // P11: If anchor disappeared mid-flow (e.g. external delete), exit cleanly
    // rather than render in a broken state. Caller will close the wizard via
    // the parent's Promote-Wizard close handler.
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="promote-to-team-wizard"
    >
      <div className="w-[560px] max-w-[92vw] rounded-[14px] border border-sf-border bg-sf-panel p-6 shadow-2xl">
        {/* Stepper header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sf-accent-bright">
              Promote to Team · Step {step}/3
            </p>
            <h2 className="mt-1 text-[18px] font-bold tracking-tight">
              {step === 1 && '确认核心角色'}
              {step === 2 && '推荐协作角色'}
              {step === 3 && '完成 — Team 概览'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-[6px] px-2 py-1 text-[14px] text-sf-fg3 hover:bg-sf-elev2 hover:text-sf-fg1"
            aria-label="关闭"
            data-testid="wizard-close"
          >
            ✕
          </button>
        </div>

        {/* Step 1 — Anchor confirm */}
        {step === 1 && (
          <div className="space-y-3 text-[13px]" data-testid="wizard-step-1">
            <div className="rounded-[10px] border border-sf-accent/30 bg-sf-accent-tint px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-sf-accent-bright">
                  💬 主负责人
                </span>
                {/* P9: kit_type chip */}
                {anchor.metadata?.role_type !== undefined && (
                  <span
                    className="font-mono text-[10px] text-sf-fg4"
                    data-testid="anchor-kit-type"
                  >
                    {String(anchor.metadata.role_type)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[15px] font-bold text-sf-fg0">{anchor.name}</p>
              <p className="mt-1 text-[12px] text-sf-fg3">
                {anchor.description || '—'}
              </p>
              {/* P9: collaboration_contract summary */}
              {contract ? (
                <div className="mt-2 space-y-0.5 font-mono text-[11px] text-sf-fg4" data-testid="anchor-contract">
                  {deliversTo.length > 0 && (
                    <p>delivers_to: {deliversTo.join(', ')}</p>
                  )}
                  {acceptsFrom.length > 0 && (
                    <p>accepts_from: {acceptsFrom.join(', ')}</p>
                  )}
                  {collaborationStyle && (
                    <p>style: {collaborationStyle}</p>
                  )}
                </div>
              ) : (
                <p className="mt-2 font-mono text-[11px] text-sf-fg5">
                  该角色未声明 collaboration_contract — 推荐协作角色将不可用，可在下一步手动添加。
                </p>
              )}
            </div>
            <p className="text-[12px] text-sf-fg4">
              将以这个 Agent 为团队核心展开协作角色推荐。
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-[8px] bg-sf-accent px-4 py-1.5 font-mono text-[12px] font-bold text-white"
                data-testid="wizard-next-1"
              >
                下一步 →
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Recommendations */}
        {step === 2 && (
          <div className="space-y-3 text-[13px]" data-testid="wizard-step-2">
            {!contract && (
              <p
                className="rounded-[8px] border border-sf-border bg-sf-elev2/50 px-3 py-2 text-[12px] text-sf-fg4"
                data-testid="wizard-no-contract"
              >
                主负责人未声明 collaboration_contract，无法自动推荐。可使用「手动添加空角色」或「从 Kit 选模板组合」。
              </p>
            )}
            {contract && deliversTo.length === 0 && (
              <p className="rounded-[8px] border border-sf-border bg-sf-elev2/50 px-3 py-2 text-[12px] text-sf-fg4">
                主负责人 collaboration_contract.delivers_to 为空，没有自动推荐。
              </p>
            )}

            {catalogStatus === 'loading' && (
              <p className="text-[12px] text-sf-fg4">加载 Catalog…</p>
            )}
            {catalogStatus === 'error' && (
              <p className="text-[12px] text-sf-reject">{catalogError ?? '加载失败'}</p>
            )}

            {catalogStatus === 'success' && recommendations.length === 0 && deliversTo.length > 0 && (
              <p className="rounded-[8px] border border-sf-border bg-sf-elev2/50 px-3 py-2 text-[12px] text-sf-fg4">
                没有匹配 collaboration_contract.accepts_from 的 Catalog Agent。
              </p>
            )}

            {catalogStatus === 'success' && recommendations.length > 0 && (
              <ul className="space-y-2 max-h-[280px] overflow-y-auto">
                {recommendations.map((app) => (
                  <li
                    key={app.app_id}
                    className="flex items-center justify-between rounded-[8px] border border-sf-border bg-sf-elev2/40 px-3 py-2"
                    data-testid={`wizard-rec-${app.app_id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">{app.name}</p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-sf-fg5">
                        {app.kit_type}
                      </p>
                      {importErrors[app.app_id] && (
                        <p className="mt-1 text-[11px] text-sf-reject" role="alert">
                          {importErrors[app.app_id]}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleImportRecommendation(app)}
                      disabled={!!importingId}
                      className="ml-3 shrink-0 rounded-[6px] bg-sf-accent px-3 py-1 font-mono text-[11px] font-bold text-white disabled:opacity-50"
                      data-testid={`wizard-import-${app.app_id}`}
                    >
                      {importingId === app.app_id ? '…' : '引入'}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* D1-a fallbacks */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAddBlankRole}
                className="rounded-[6px] border border-sf-border bg-sf-elev2/40 px-3 py-1.5 font-mono text-[11px] text-sf-fg2 hover:text-sf-fg1"
                data-testid="wizard-add-blank-role"
              >
                + 手动添加空角色
              </button>
              <button
                type="button"
                onClick={handlePickFromKit}
                className="rounded-[6px] border border-sf-border bg-sf-elev2/40 px-3 py-1.5 font-mono text-[11px] text-sf-fg2 hover:text-sf-fg1"
                data-testid="wizard-pick-from-kit"
              >
                从 Kit 选模板组合 →
              </button>
            </div>

            <div className="mt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-[12px] text-sf-fg3 hover:text-sf-fg1"
              >
                ← 上一步
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="rounded-[6px] border border-sf-border px-3 py-1.5 font-mono text-[11px] text-sf-fg3 hover:text-sf-fg1"
                  data-testid="wizard-skip-2"
                >
                  跳过推荐
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="rounded-[8px] bg-sf-accent px-4 py-1.5 font-mono text-[12px] font-bold text-white"
                  data-testid="wizard-next-2"
                >
                  下一步 →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Summary */}
        {step === 3 && (
          <div className="space-y-3 text-[13px]" data-testid="wizard-step-3">
            <p className="text-[12px] text-sf-fg4">
              新团队已生成。可在 Builder 中继续编辑角色、工作流与权责。
            </p>
            <div className="rounded-[10px] border border-sf-border bg-sf-elev2/40 px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-sf-fg4">
                Team · {liveBlueprint.role_profiles.length} role(s)
              </p>
              <ul className="mt-2 space-y-1">
                {liveBlueprint.role_profiles.map((r) => (
                  <li key={r.role_id} className="flex items-center gap-2 text-[12px]">
                    {r.metadata?.anchor === true && (
                      <span className="text-[12px]">💬</span>
                    )}
                    <span className="text-sf-fg1">{r.name}</span>
                    {r.metadata?.anchor === true && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-sf-fg5">
                        主负责人
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-[8px] bg-sf-accent px-4 py-1.5 font-mono text-[12px] font-bold text-white"
                data-testid="wizard-finish"
              >
                进入 Builder 编辑 →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
