/**
 * AgentPanel — replaces AgentPanelStub for the "Agent" tab in
 * RightPaneTabs. Container/composer for:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  AgentRoster   (horizontal strip + "+N" picker trigger)   │ ← agent-2
 *   ├──────────────────────────────────────────────────────────┤
 *   │  AgentDetail   (5-slot timeline + persona + tools + I/O)  │ ← this file
 *   │  …or AgentEmptyState if session.nodes is empty            │
 *   └──────────────────────────────────────────────────────────┘
 *   AgentPickerModal — backdrop + ⌘K picker (mounted at root)    ← agent-2
 *
 * Owns:
 *   - `selectedId` (string)  — id of the currently selected agent node
 *   - `pickerOpen` (boolean) — controls the ⌘K modal
 *
 * Container DOES NOT mock data. The agent list comes from
 * `session.nodes` (RunSessionNode[]) sourced from the live SSE stream.
 * Per-slot fallback rules (model regex from chips, etc.) are implemented
 * inside AgentDetail, not here.
 *
 * Why `session` is a prop (not `useRunSession()` called in-component):
 * `useRunSession` requires a `sessionId` argument and there's already an
 * instance hoisted to RunSessionRightPane. Passing the return value
 * avoids spinning up a second EventSource and matches how the parent
 * wires the other panels.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { UseRunSessionReturn } from '../../core/hooks/useRunSession';
// 2026-05-20 — AgentRoster + AgentDetail 仍在 ./AgentRoster.tsx /
// ./AgentDetail.tsx 保留，但在主渲染路径上已被 AgentArchiveCard 接管。
// 留作 git history 跟踪，不再 import 避免 tsc TS6133。
import { AgentPickerModal } from './AgentPickerModal';
import AgentArchiveCard from './AgentArchiveCard';
import AgentEmptyState from './AgentEmptyState';
import { useCommandK } from '../../core/hooks/useCommandK';

export interface AgentPanelProps {
  session: UseRunSessionReturn;
  /** 2026-06-02 — id of the agent currently being built (from useFollowMode).
   *  While `followActive`, the panel auto-selects this so the view follows
   *  "正在改的那张卡". Null when nothing is building. */
  followNodeId?: string | null;
  /** True when follow mode is 'auto' (not user-locked). Gates auto-select. */
  followActive?: boolean;
  /** Called when the user picks an agent manually — lets the parent flip
   *  follow mode to 'locked' so auto-follow stops fighting the user. */
  onManualSelect?: () => void;
}

const AgentPanel: React.FC<AgentPanelProps> = ({
  session,
  followNodeId = null,
  followActive = false,
  onManualSelect,
}) => {
  const agents = session.nodes;
  const [selectedId, setSelectedId] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);

  // When the first node arrives (or the previously-selected node is
  // gone), default the selection to the first agent. Don't clobber a
  // user-made selection that's still valid.
  useEffect(() => {
    if (agents.length === 0) {
      if (selectedId !== '') setSelectedId('');
      return;
    }
    const stillExists = agents.some((a) => a.id === selectedId);
    if (!stillExists) {
      setSelectedId(agents[0].id);
    }
  }, [agents, selectedId]);

  // 2026-06-02 (Trae 式跟随) — while follow is 'auto', snap the selection to
  // whichever agent is currently building. Only fires when the target node
  // actually exists and differs from the current selection, so a user who
  // locked follow (followActive=false) keeps their manual choice.
  useEffect(() => {
    if (!followActive) return;
    if (!followNodeId || followNodeId === selectedId) return;
    if (!agents.some((a) => a.id === followNodeId)) return;
    setSelectedId(followNodeId);
  }, [followActive, followNodeId, selectedId, agents]);

  // Manual selection (roster chip / picker) → update local selection AND
  // tell the parent to lock follow so auto-select stops overriding.
  const handleManualSelect = (id: string) => {
    setSelectedId(id);
    onManualSelect?.();
  };

  // ⌘K / Ctrl-K opens the picker. agent-2's useCommandK is a fire-only
  // hook ("open" trigger); the consumer (us) decides what to do — we
  // just flip pickerOpen on. Closing is handled by the modal's own
  // backdrop / esc / select handlers.
  useCommandK({
    onOpen: () => setPickerOpen(true),
    enabled: agents.length > 0,
  });

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedId),
    [agents, selectedId],
  );

  return (
    <div
      data-component="agent-panel"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {/* 2026-05-18 (agent-4) — local <style> with ap-spin / ap-caret removed.
          sf-spin, sf-pulse, sf-cur are now permanent globals in src/index.css. */}
      {agents.length === 0 ? (
        <AgentEmptyState />
      ) : (
        <>
          {/* 2026-05-20 — AgentRoster 不再单独渲染一行。v3 设计稿把 mini-roster
              内嵌到 ar-meta（identity 行）右侧，AgentArchiveCard 现在直接消费
              agents/selectedId/onSelectAgent/onOpenPicker，渲染同一行的 .aac-sw。
              旧 AgentRoster 组件文件保留（UI 保护规则：只删入口不删文件）。 */}
          {selectedAgent ? (
            // 2026-05-20 — pending agents 也走 AgentArchiveCard，由 data-state="waiting"
            // 渲染同一布局；不再 fork 到旧 AgentDetail。原 AgentDetail 仅作为 dead-code
            // 备份保留，可在 git history 找回。
            <AgentArchiveCard
              agent={selectedAgent}
              agents={agents}
              selectedId={selectedId}
              onSelectAgent={handleManualSelect}
              onOpenPicker={() => setPickerOpen(true)}
            />
          ) : (
            <AgentEmptyState />
          )}
        </>
      )}

      <AgentPickerModal
        open={pickerOpen}
        agents={agents}
        selectedId={selectedId}
        onSelect={(id) => {
          handleManualSelect(id);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
};

export default AgentPanel;
