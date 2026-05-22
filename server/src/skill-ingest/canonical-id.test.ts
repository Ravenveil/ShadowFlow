import { describe, it, expect } from 'vitest';
import { canonicalIdFromUrl } from './canonical-id';

describe('canonicalIdFromUrl', () => {
  it('extracts repo slug from a GitHub URL (case preserved)', () => {
    expect(canonicalIdFromUrl('https://github.com/bmadcode/BMAD-METHOD')).toBe('BMAD-METHOD');
  });

  it('tolerates a trailing slash', () => {
    expect(canonicalIdFromUrl('https://github.com/bmadcode/BMAD-METHOD/')).toBe('BMAD-METHOD');
  });

  it('strips the .git suffix', () => {
    expect(canonicalIdFromUrl('https://github.com/bmadcode/BMAD-METHOD.git')).toBe('BMAD-METHOD');
  });

  it('falls back to skill-<timestamp> for illegal characters', () => {
    // Spaces & "@" are not in [a-zA-Z0-9_.-]
    expect(canonicalIdFromUrl('https://example.com/weird name@v2')).toMatch(/^skill-\d+$/);
  });

  it('truncates to 64 chars for very long repo names', () => {
    const longName = 'a'.repeat(100);
    const url = `https://github.com/org/${longName}`;
    const id = canonicalIdFromUrl(url);
    expect(id.length).toBe(64);
  });
});
