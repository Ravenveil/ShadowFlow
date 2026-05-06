import { describe, it, expect, beforeEach } from 'vitest';
import { useYamlEditorStore } from '../../core/hooks/useYamlEditorStore';

describe('useYamlEditorStore', () => {
  beforeEach(() => {
    useYamlEditorStore.setState({
      yamlText: '',
      lastYamlError: null,
      _sourceTag: 'store',
    });
  });

  it('initializes with empty text and no error', () => {
    const { yamlText, lastYamlError } = useYamlEditorStore.getState();
    expect(yamlText).toBe('');
    expect(lastYamlError).toBeNull();
  });

  it('setYamlText stores text and source tag', () => {
    useYamlEditorStore.getState().setYamlText('nodes: []', 'user');
    const s = useYamlEditorStore.getState();
    expect(s.yamlText).toBe('nodes: []');
    expect(s.getSourceTag()).toBe('user');
  });

  it('setYamlText with store source sets tag to store', () => {
    useYamlEditorStore.getState().setYamlText('nodes: []', 'store');
    expect(useYamlEditorStore.getState().getSourceTag()).toBe('store');
  });

  it('setYamlError stores error message', () => {
    useYamlEditorStore.getState().setYamlError('unexpected token at line 3');
    expect(useYamlEditorStore.getState().lastYamlError).toBe('unexpected token at line 3');
  });

  it('setYamlError(null) clears error', () => {
    useYamlEditorStore.getState().setYamlError('some error');
    useYamlEditorStore.getState().setYamlError(null);
    expect(useYamlEditorStore.getState().lastYamlError).toBeNull();
  });

  // P3-4 fix: tests for resetSourceTag (P1-β guard — the most critical invariant)
  it('resetSourceTag resets _sourceTag to store after user edit', () => {
    // Simulate user typing
    useYamlEditorStore.getState().setYamlText('nodes: []', 'user');
    expect(useYamlEditorStore.getState().getSourceTag()).toBe('user');
    // After Direction A debounce completes, sourceTag must reset so Direction B can resume
    useYamlEditorStore.getState().resetSourceTag();
    expect(useYamlEditorStore.getState().getSourceTag()).toBe('store');
  });

  it('Direction A anti-loop: Direction B should NOT fire when sourceTag is user', () => {
    // Simulate user typing → sourceTag = 'user'
    useYamlEditorStore.getState().setYamlText('nodes: []', 'user');
    // Direction B guard: getSourceTag() === 'user' → should skip serialization
    const shouldSkip = useYamlEditorStore.getState().getSourceTag() === 'user';
    expect(shouldSkip).toBe(true);
  });

  it('Direction B anti-loop: Direction A should NOT fire when sourceTag is store', () => {
    // Simulate Direction B writing (canvas → YAML)
    useYamlEditorStore.getState().setYamlText('nodes:\n  - id: n1\n', 'store');
    // Direction A guard: getSourceTag() !== 'user' → should skip debounce parse
    const shouldSkip = useYamlEditorStore.getState().getSourceTag() !== 'user';
    expect(shouldSkip).toBe(true);
  });
});
