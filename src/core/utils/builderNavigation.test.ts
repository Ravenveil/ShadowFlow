import { describe, expect, it } from 'vitest';
import { encodeGoal, buildChatBuilderUrl, buildAgentDMBuilderUrl } from './builderNavigation';

describe('encodeGoal', () => {
  it('URI-encodes a regular string', () => {
    expect(encodeGoal('研究论文')).toBe(encodeURIComponent('研究论文'));
  });

  it('returns empty string for null', () => {
    expect(encodeGoal(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(encodeGoal(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(encodeGoal('')).toBe('');
  });

  it('truncates to 120 characters before encoding', () => {
    const long = 'A'.repeat(200);
    const result = encodeGoal(long);
    expect(result).toBe(encodeURIComponent('A'.repeat(120)));
  });

  it('trims whitespace before truncating', () => {
    const padded = '  hello  ';
    expect(encodeGoal(padded)).toBe(encodeURIComponent('hello'));
  });

  it('encodes special URL characters', () => {
    const raw = 'goal with spaces & special=chars';
    expect(encodeGoal(raw)).toBe(encodeURIComponent(raw));
  });
});

describe('buildChatBuilderUrl', () => {
  it('builds correct URL with goal', () => {
    const url = buildChatBuilderUrl({ chatId: 'g-123', goalText: 'Research Team' });
    expect(url).toContain('from=chat');
    expect(url).toContain('context_type=group');
    expect(url).toContain(`context_id=${encodeURIComponent('g-123')}`);
    expect(url).toContain(`goal=${encodeURIComponent('Research Team')}`);
  });

  it('omits goal param when goalText is empty', () => {
    const url = buildChatBuilderUrl({ chatId: 'g-123', goalText: '' });
    expect(url).not.toContain('goal=');
    expect(url).toContain('from=chat');
  });

  it('omits goal param when goalText is null', () => {
    const url = buildChatBuilderUrl({ chatId: 'g-123', goalText: null });
    expect(url).not.toContain('goal=');
  });

  it('encodes chatId in context_id param', () => {
    const url = buildChatBuilderUrl({ chatId: 'grp/with space', goalText: '' });
    expect(url).toContain(`context_id=${encodeURIComponent('grp/with space')}`);
  });

  it('truncates long goalText to 120 chars', () => {
    const longGoal = 'X'.repeat(200);
    const url = buildChatBuilderUrl({ chatId: 'g-1', goalText: longGoal });
    const goalParam = new URLSearchParams(url.split('?')[1]).get('goal');
    expect(goalParam).toBe('X'.repeat(120));
  });
});

describe('buildAgentDMBuilderUrl', () => {
  it('builds correct URL with agent name as goal', () => {
    const url = buildAgentDMBuilderUrl({ agentId: 'a-456', agentName: 'ResearchBot' });
    expect(url).toContain('from=dm');
    expect(url).toContain('context_type=dm');
    expect(url).toContain(`context_id=${encodeURIComponent('a-456')}`);
    expect(url).toContain(`goal=${encodeURIComponent('ResearchBot')}`);
  });

  it('omits goal param when agentName is empty', () => {
    const url = buildAgentDMBuilderUrl({ agentId: 'a-456', agentName: '' });
    expect(url).not.toContain('goal=');
    expect(url).toContain('from=dm');
  });

  it('omits goal param when agentName is null', () => {
    const url = buildAgentDMBuilderUrl({ agentId: 'a-456', agentName: null });
    expect(url).not.toContain('goal=');
  });
});
