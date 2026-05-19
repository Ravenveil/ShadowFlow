/**
 * useFollowMode — derives the active right-pane tab from the live run
 * session step stream while letting the user pin a tab manually.
 *
 * Two modes:
 *   - 'auto'   → activeTab is computed from the latest running/pending
 *                step via STEP_TO_TAB. New running steps that map to a
 *                different tab switch activeTab automatically.
 *   - 'locked' → user picked a tab manually. Step progression no longer
 *                changes activeTab. A returnToFollow() call (or a click
 *                on the FollowChip's "返回跟随" CTA) flips back to 'auto'
 *                and immediately re-applies the step→tab mapping.
 *
 * The mapping table below is the source of truth — keep it in sync with
 * the assembler step labels emitted by the LLM. Steps that do not appear
 * here do NOT change activeTab (the hook simply preserves the current
 * value), so adding new steps in the assembler does not require code
 * changes here unless we want that step to influence tab routing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TabId } from '../../components/run-session/RightPaneTabs';
import type { RunSessionStep } from './useRunSession';

/**
 * Step name → tab routing. Steps whose name is not a key here will not
 * cause the activeTab to change while in 'auto' mode (i.e. they are
 * tab-neutral). Step matching is exact-string (the assembler emits
 * stable zh-CN labels).
 */
// Keys MUST match the exact `name` strings emitted by skills.ts AGENT_TEAM_
// BLUEPRINT_PROMPT (see `<sf:step name="…"/>` instructions). Mismatch =
// followedTab returns null and the chip silently stops routing — observed
// 2026-05-18 when this table had stale "挑选 Team 蓝图" / "配置 Agent 角色"
// labels that the LLM never actually emits.
const STEP_TO_TAB: Record<string, TabId> = {
  '分析目标需求': 'overview',
  '规划 Agent 结构': 'team',
  '生成 YAML Blueprint': 'preview',
  '创建 Agent 节点': 'agent',
  '配置 Team Workflow': 'team',
};

export type FollowMode = 'auto' | 'locked';

export interface UseFollowModeOptions {
  /**
   * Live step stream from useRunSession. Order matters: the LAST step
   * with status 'running' (or, if no running step exists, the LAST step
   * overall) is treated as the current step for tab routing.
   */
  steps: RunSessionStep[];
  /** Initial tab when the hook mounts before any step arrives. */
  initialTab?: TabId;
  /** Initial follow mode when the hook mounts. Defaults to 'auto'. */
  initialMode?: FollowMode;
  /**
   * Optional substep stream (from useRunSession.activeSubsteps). When the
   * current step has substeps, the chip tooltip surfaces the latest one
   * (e.g. "配置 Agent · reader · tools 4/8" per design-spec).
   */
  activeSubsteps?: Array<{ parent_step: string; name: string; elapsed_ms?: number }>;
  /**
   * Optional node list (from useRunSession.nodes). When the current step
   * is an agent-config step, the tooltip surfaces the currently-building
   * agent's title for extra context.
   */
  nodes?: Array<{ title: string; status?: string }>;
}

export interface UseFollowModeReturn {
  activeTab: TabId;
  /**
   * Programmatically pick a tab. Called both by the user (clicking a tab
   * button → mode flips to 'locked') and by the auto-follow effect (mode
   * stays 'auto'). The caller decides via the second argument.
   */
  setActiveTab: (tab: TabId, opts?: { lock?: boolean }) => void;
  /** Current mode — 'auto' or 'locked'. */
  followMode: FollowMode;
  /**
   * Toggle the chip. From 'auto' → flips to 'locked' (parks on activeTab).
   * From 'locked' → flips back to 'auto' (re-applies step→tab mapping).
   */
  toggleFollow: () => void;
  /**
   * The tab the live step is currently mapped to, regardless of mode.
   * RightPaneTabs uses this to render the pulsing dot on the followed
   * tab button. Returns null when no step maps to any tab yet.
   */
  followedTab: TabId | null;
  /**
   * Human-readable label of the current step, surfaced in the chip
   * tooltip (e.g. "配置 Agent 角色 · running"). Returns undefined when no
   * step is in flight.
   */
  currentStepLabel: string | undefined;
}

/**
 * Pick the "current" step from a step list. Preference order:
 *   1. last step with status === 'running'
 *   2. last step overall (so we land on the most recent 'done' / 'pending')
 */
function pickCurrentStep(steps: RunSessionStep[]): RunSessionStep | undefined {
  if (steps.length === 0) return undefined;
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].status === 'running') return steps[i];
  }
  return steps[steps.length - 1];
}

export function useFollowMode({
  steps,
  initialTab = 'overview',
  initialMode = 'auto',
  activeSubsteps,
  nodes,
}: UseFollowModeOptions): UseFollowModeReturn {
  const [activeTab, setActiveTabState] = useState<TabId>(initialTab);
  const [followMode, setFollowMode] = useState<FollowMode>(initialMode);

  // Track the previous mode so we can re-apply the step→tab mapping when
  // the user transitions from 'locked' back to 'auto' even if the step
  // stream hasn't ticked since.
  const previousModeRef = useRef<FollowMode>(initialMode);

  const currentStep = useMemo(() => pickCurrentStep(steps), [steps]);

  const followedTab: TabId | null = useMemo(() => {
    if (!currentStep) return null;
    return STEP_TO_TAB[currentStep.name] ?? null;
  }, [currentStep]);

  const currentStepLabel = useMemo(() => {
    if (!currentStep) return undefined;
    // Design-spec tooltip format: "配置 Agent · reader · tools 4/8".
    // Layer 1: step name. Layer 2: building agent title (when relevant).
    // Layer 3: latest substep name (e.g. "tools 4/8").
    const parts: string[] = [currentStep.name];
    if (nodes && currentStep.name === '创建 Agent 节点') {
      const building = nodes.find(n => n.status === 'building');
      if (building?.title) parts.push(building.title);
    }
    if (activeSubsteps && activeSubsteps.length > 0) {
      const latest = activeSubsteps.filter(s => s.parent_step === currentStep.name).pop();
      if (latest) parts.push(latest.name);
    }
    parts.push(currentStep.status);
    return parts.join(' · ');
  }, [currentStep, activeSubsteps, nodes]);

  // First-followed effect — when followedTab transitions from null to a
  // real tab for the first time, snap activeTab to it (regardless of mode).
  // This implements the design-spec rule: "默认落在被跟随的 tab（通常是
  // Agent）". Without this, the user starts on `initialTab='overview'` and
  // only sees Agent/Team via auto-follow after the matching step arrives —
  // which on a fast session might be the only chance to see Overview.
  const firstFollowedSeenRef = useRef(false);
  useEffect(() => {
    if (firstFollowedSeenRef.current) return;
    if (followedTab) {
      firstFollowedSeenRef.current = true;
      // Only auto-snap if user hasn't locked manually yet.
      if (followMode === 'auto') setActiveTabState(followedTab);
    }
  }, [followedTab, followMode]);

  // Auto-follow effect — only runs when mode === 'auto'. When followedTab
  // changes to a non-null value we mirror it into activeTab. We do NOT
  // reset activeTab when followedTab is null (e.g. transient step with
  // no mapping) — we just preserve the last known tab.
  useEffect(() => {
    if (followMode !== 'auto') return;
    if (followedTab && followedTab !== activeTab) {
      setActiveTabState(followedTab);
    }
  }, [followMode, followedTab, activeTab]);

  // Also re-apply on mode transition 'locked' → 'auto', in case the step
  // stream has been silent since the user locked the tab.
  useEffect(() => {
    const prev = previousModeRef.current;
    previousModeRef.current = followMode;
    if (prev === 'locked' && followMode === 'auto' && followedTab && followedTab !== activeTab) {
      setActiveTabState(followedTab);
    }
  }, [followMode, followedTab, activeTab]);

  const setActiveTab = useCallback(
    (tab: TabId, opts?: { lock?: boolean }) => {
      setActiveTabState(tab);
      // Default behavior for "user picked a tab manually": lock follow.
      // Internal callers that want to set the tab without locking pass
      // { lock: false }.
      const shouldLock = opts?.lock !== false;
      if (shouldLock) {
        setFollowMode('locked');
      }
    },
    [],
  );

  const toggleFollow = useCallback(() => {
    setFollowMode((m) => (m === 'auto' ? 'locked' : 'auto'));
  }, []);

  return {
    activeTab,
    setActiveTab,
    followMode,
    toggleFollow,
    followedTab,
    currentStepLabel,
  };
}

export default useFollowMode;
