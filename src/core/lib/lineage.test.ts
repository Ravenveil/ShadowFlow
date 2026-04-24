import { describe, it, expect } from 'vitest';
import {
  appendAuthor,
  getLineage,
  LineageError,
  makeEntry,
  validateAlias,
  walletFingerprint,
  LINEAGE_ENTRY_RE,
} from './lineage';

describe('walletFingerprint', () => {
  it('extracts first 8 hex chars from 0x-prefixed address', () => {
    expect(walletFingerprint('0x1234567890abcdef1234567890abcdef12345678')).toBe('12345678');
  });

  it('handles unprefixed addresses', () => {
    expect(walletFingerprint('abcdef0123456789')).toBe('abcdef01');
  });

  it('lowercases the result', () => {
    expect(walletFingerprint('0xABCDEF01...')).toBe('abcdef01');
  });

  it('throws on too-short input', () => {
    expect(() => walletFingerprint('0x1234')).toThrow(LineageError);
  });

  it('throws on non-hex input', () => {
    expect(() => walletFingerprint('0xGGGGGGGGabcd')).toThrow(LineageError);
  });

  it('throws on empty input', () => {
    expect(() => walletFingerprint('')).toThrow(LineageError);
  });
});

describe('validateAlias', () => {
  it('accepts safe alphanumeric aliases', () => {
    expect(validateAlias('alex_2026')).toBe('alex_2026');
  });

  it('strips leading/trailing whitespace', () => {
    expect(validateAlias('  jin-bot  ')).toBe('jin-bot');
  });

  it('rejects empty alias', () => {
    expect(() => validateAlias('')).toThrow(LineageError);
    expect(() => validateAlias('   ')).toThrow(LineageError);
  });

  it('rejects alias containing @', () => {
    // PII smuggling guard: an email-as-alias must not pass.
    expect(() => validateAlias('john@gmail.com')).toThrow(LineageError);
  });

  it('rejects alias with whitespace', () => {
    expect(() => validateAlias('alex smith')).toThrow(LineageError);
  });

  it('rejects alias longer than 32 chars', () => {
    expect(() => validateAlias('a'.repeat(33))).toThrow(LineageError);
  });

  it('rejects phone-like aliases', () => {
    expect(() => validateAlias('+86 138 0000 0000')).toThrow(LineageError);
  });
});

describe('makeEntry', () => {
  it('produces alias@fingerprint format', () => {
    expect(makeEntry('alex', '0x1234567890abcdef1234567890abcdef12345678'))
      .toBe('alex@12345678');
  });

  it('rejects invalid alias', () => {
    expect(() => makeEntry('bad@alias', '0x1234567890abcdef')).toThrow(LineageError);
  });

  it('rejects invalid address', () => {
    expect(() => makeEntry('alex', '0xGG')).toThrow(LineageError);
  });
});

describe('appendAuthor', () => {
  it('appends to lineage without mutating input', () => {
    const traj = { metadata: { author_lineage: ['alice@11111111'] } };
    const frozen = JSON.stringify(traj);
    const result = appendAuthor(traj, 'bob', '0x2222222233333333');
    expect(JSON.stringify(traj)).toBe(frozen);
    expect(result.metadata?.author_lineage).toEqual(['alice@11111111', 'bob@22222222']);
  });

  it('initialises lineage when missing', () => {
    const result = appendAuthor({} as Record<string, unknown>, 'alex', '0x1234567890abcdef');
    expect(result.metadata?.author_lineage).toEqual(['alex@12345678']);
  });

  it('preserves other metadata fields', () => {
    const traj = { metadata: { title: 'demo' } as Record<string, unknown> };
    const result = appendAuthor(traj, 'alex', '0x1234567890abcdef');
    expect(result.metadata?.title).toBe('demo');
    expect(result.metadata?.author_lineage).toEqual(['alex@12345678']);
  });

  it('drops malformed pre-existing entries when appending', () => {
    // Defensive: if upstream data was tampered with, the append step cleans up.
    const traj = { metadata: { author_lineage: ['alice@11111111', 'evil', 'evil@notHex!'] } };
    const result = appendAuthor(traj, 'bob', '0x2222222233333333');
    expect(result.metadata?.author_lineage).toEqual(['alice@11111111', 'bob@22222222']);
  });
});

describe('getLineage', () => {
  it('reads valid lineage entries', () => {
    const traj = { metadata: { author_lineage: ['alex@12345678'] } };
    expect(getLineage(traj)).toEqual(['alex@12345678']);
  });

  it('returns empty when metadata missing', () => {
    expect(getLineage({})).toEqual([]);
  });

  it('returns empty when lineage is not an array', () => {
    expect(getLineage({ metadata: { author_lineage: 'corrupt' } })).toEqual([]);
  });

  it('filters out malformed entries', () => {
    const traj = { metadata: { author_lineage: ['ok@12345678', 'bad', { evil: true }, 'bad@nothex'] } };
    expect(getLineage(traj)).toEqual(['ok@12345678']);
  });

  it('returns a copy (caller mutation does not leak)', () => {
    const traj = { metadata: { author_lineage: ['alex@12345678'] } };
    const result = getLineage(traj);
    result.push('extra@99999999');
    expect(traj.metadata.author_lineage).toEqual(['alex@12345678']);
  });
});

describe('LINEAGE_ENTRY_RE', () => {
  it('matches well-formed entries', () => {
    expect(LINEAGE_ENTRY_RE.test('alex@12345678')).toBe(true);
    expect(LINEAGE_ENTRY_RE.test('jin-bot@abcdef01')).toBe(true);
  });

  it('rejects malformed entries', () => {
    expect(LINEAGE_ENTRY_RE.test('alex')).toBe(false);
    expect(LINEAGE_ENTRY_RE.test('alex@toolong123')).toBe(false);
    expect(LINEAGE_ENTRY_RE.test('alex@gggggggg')).toBe(false);
    expect(LINEAGE_ENTRY_RE.test('email@addr@12345678')).toBe(false);
  });
});
