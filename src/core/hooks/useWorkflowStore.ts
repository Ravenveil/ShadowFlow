/**
 * Re-export workflowStore with a stable public API name (AR16 — Zustand 分域 store).
 * Components should import from this hook rather than from the store directly.
 *
 * D5: `defaults` surface deferred to Story 3-6 template loader.
 * nodes/edges are held by the underlying useWorkflow store.
 */
export { useWorkflow as useWorkflowStore } from './useWorkflow';

import { useWorkflow } from './useWorkflow';

export function useSelectedNode() {
  const { nodes, selectedNodeIds } = useWorkflow();
  // P24: Guard against undefined or empty selectedNodeIds
  if (!selectedNodeIds?.length) return null;
  return nodes.find((n) => selectedNodeIds[0] === n.id) ?? null;
}
