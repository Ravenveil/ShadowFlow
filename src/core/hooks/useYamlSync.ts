import { useEffect, useRef, useCallback } from 'react';
import { useWorkflow } from '../stores/workflowStore';
import { usePolicyStore } from './usePolicyStore';
import { useYamlEditorStore } from './useYamlEditorStore';
import { parseWorkflowYaml, serializeWorkflow } from '../lib/yamlSerializer';
// P1-β: resetSourceTag imported via store action, called after Direction A completes

const DEBOUNCE_MS = 300;

/**
 * Bidirectional YAML ↔ store sync (AR42 anti-loop pattern).
 *
 * Direction A (user types in Monaco):
 *   yamlText change (source='user') → 300ms debounce → parse → setWorkflow
 *   On error: setYamlError, store unchanged.
 *
 * Direction B (canvas nodes/edges change):
 *   nodes/edges change (source≠'user') → serializeWorkflow → setYamlText(…, 'store')
 */
export function useYamlSync() {
  const { nodes, edges, setWorkflow } = useWorkflow();
  const { addRule } = usePolicyStore();
  const { yamlText, lastYamlError, setYamlText, setYamlError, getSourceTag, resetSourceTag } = useYamlEditorStore();

  // P3-1 fix: removed dead nodesRef/edgesRef (set but never read in debounce closure)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Direction A: YAML text → store (debounced, only when source='user')
  useEffect(() => {
    if (getSourceTag() !== 'user') return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const result = parseWorkflowYaml(yamlText);
      if (result.ok) {
        setYamlError(null);
        // P1-β fix: reset sourceTag BEFORE setWorkflow so Direction B can serialize
        // the updated canvas state on subsequent canvas interactions.
        resetSourceTag();
        // P2-2 fix: skip history entry — YAML edits should not flood the undo stack
        setWorkflow(result.nodes, result.edges, { skipHistory: true });
        if (result.policyRules?.rules) {
          result.policyRules.rules.forEach((r) =>
            addRule({ sender: r.sender, receiver: r.receiver, action: r.action as 'approve' | 'reject' | 'retry' }),
          );
        }
      } else {
        setYamlError(result.error);
        // store intentionally NOT updated — AC3: error doesn't blast canvas
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yamlText]);

  // Direction B: store nodes/edges → YAML text (only when source≠'user')
  useEffect(() => {
    if (getSourceTag() === 'user') return; // came from YAML, skip re-serialization
    const serialized = serializeWorkflow(nodes, edges);
    setYamlText(serialized, 'store');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  /** Imperatively trigger parse (e.g. on Monaco blur for error markers). */
  const validateNow = useCallback((): string | null => {
    const result = parseWorkflowYaml(yamlText);
    if (!result.ok) {
      setYamlError(result.error);
      return result.error;
    }
    setYamlError(null);
    return null;
  }, [yamlText, setYamlError]);

  return { lastYamlError, validateNow };
}
