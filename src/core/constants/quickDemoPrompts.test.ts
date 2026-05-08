import { describe, it, expect } from 'vitest';
import { QUICK_DEMO_PROMPTS } from './quickDemoPrompts';
import { PRESETS } from '../../templates/presets';

describe('quickDemoPrompts', () => {
  const TEMPLATE_ALIASES = Object.keys(PRESETS);

  it('has a prompt entry for every preset template', () => {
    for (const alias of TEMPLATE_ALIASES) {
      expect(QUICK_DEMO_PROMPTS[alias]).toBeDefined();
      expect(QUICK_DEMO_PROMPTS[alias].painPoint.en).toBeTruthy();
      expect(QUICK_DEMO_PROMPTS[alias].painPoint.zh).toBeTruthy();
    }
  });

  it('non-blank templates have a non-empty prompt', () => {
    for (const alias of TEMPLATE_ALIASES.filter((a) => a !== 'blank')) {
      expect(QUICK_DEMO_PROMPTS[alias].prompt.length).toBeGreaterThan(0);
    }
  });

  it('blank template has empty prompt', () => {
    expect(QUICK_DEMO_PROMPTS.blank.prompt).toBe('');
  });

  it('pain points are under 50 characters (concise)', () => {
    for (const alias of TEMPLATE_ALIASES) {
      const { zh, en } = QUICK_DEMO_PROMPTS[alias].painPoint;
      expect(zh.length).toBeLessThanOrEqual(50);
      expect(en.length).toBeLessThanOrEqual(80);
    }
  });

  it('solo_company prompt matches AC2 specification', () => {
    expect(QUICK_DEMO_PROMPTS.solo_company.prompt).toContain('bug');
    expect(QUICK_DEMO_PROMPTS.solo_company.prompt).toContain('GDPR');
  });

  it('ming_cabinet prompt references 内阁票拟', () => {
    expect(QUICK_DEMO_PROMPTS.ming_cabinet.prompt).toContain('内阁票拟');
  });
});
