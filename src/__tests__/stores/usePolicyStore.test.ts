import { describe, it, expect, beforeEach } from 'vitest';
import { usePolicyStore } from '../../core/hooks/usePolicyStore';

describe('usePolicyStore', () => {
  beforeEach(() => usePolicyStore.getState().reset());

  it('starts with empty rules', () => {
    expect(usePolicyStore.getState().rules).toHaveLength(0);
  });

  it('addRule appends a rule', () => {
    usePolicyStore.getState().addRule({ sender: 'advisor', receiver: 'writer', action: 'reject' });
    expect(usePolicyStore.getState().rules).toHaveLength(1);
    expect(usePolicyStore.getState().rules[0].action).toBe('reject');
  });

  it('addRule supports approve and retry', () => {
    usePolicyStore.getState().addRule({ sender: 'editor', receiver: 'writer', action: 'approve' });
    usePolicyStore.getState().addRule({ sender: 'editor', receiver: 'critic', action: 'retry' });
    expect(usePolicyStore.getState().rules).toHaveLength(2);
  });

  it('removeRule removes only the matching pair', () => {
    usePolicyStore.getState().addRule({ sender: 'a', receiver: 'b', action: 'reject' });
    usePolicyStore.getState().addRule({ sender: 'c', receiver: 'd', action: 'approve' });
    usePolicyStore.getState().removeRule('a', 'b');
    const rules = usePolicyStore.getState().rules;
    expect(rules).toHaveLength(1);
    expect(rules[0].sender).toBe('c');
  });

  it('reset clears all rules', () => {
    usePolicyStore.getState().addRule({ sender: 'x', receiver: 'y', action: 'retry' });
    usePolicyStore.getState().reset();
    expect(usePolicyStore.getState().rules).toHaveLength(0);
  });
});
