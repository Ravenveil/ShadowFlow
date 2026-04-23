import { describe, it, expect, beforeEach, vi } from 'vitest';
import { containsSecret, redact } from '../leakGuard';

describe('containsSecret', () => {
  it('detects 0x-prefixed 64-char hex private key', () => {
    const pk = '0x' + 'ab'.repeat(32);
    expect(containsSecret(pk)).toBe(true);
  });

  it('detects sk- prefixed API key', () => {
    expect(containsSecret('sk-ant-api03-abcdefghijklmnopqrstuvwx')).toBe(true);
  });

  it('does not flag short hex strings', () => {
    expect(containsSecret('0xdeadbeef')).toBe(false);
  });

  it('does not flag non-secret strings', () => {
    expect(containsSecret('hello world')).toBe(false);
  });

  it('does not flag non-strings', () => {
    expect(containsSecret(42)).toBe(false);
    expect(containsSecret(null)).toBe(false);
  });

  it('returns consistent results on consecutive calls (no lastIndex bug)', () => {
    const pk = '0x' + 'ab'.repeat(32);
    expect(containsSecret(pk)).toBe(true);
    expect(containsSecret(pk)).toBe(true);
    expect(containsSecret(pk)).toBe(true);
  });
});

describe('redact', () => {
  it('replaces private key with [REDACTED]', () => {
    const pk = '0x' + 'ab'.repeat(32);
    const result = redact(`key is ${pk} here`);
    expect(result).toContain('0x[REDACTED]');
    expect(result).not.toContain(pk);
  });

  it('replaces sk- prefix keys', () => {
    const result = redact('key=sk-ant-api03-abcdefghijklmnopqrstuvwx');
    expect(result).toContain('sk-[REDACTED]');
  });
});

describe('installFetchInterceptor', () => {
  let originalFetch: typeof window.fetch;

  beforeEach(async () => {
    originalFetch = vi.fn().mockResolvedValue(new Response('ok'));
    window.fetch = originalFetch;
    // Reset module to clear idempotency flag
    vi.resetModules();
    const mod = await import('../leakGuard');
    mod.installFetchInterceptor();
  });

  it('blocks fetch with private key in body', async () => {
    const pk = '0x' + 'ab'.repeat(32);
    await expect(
      window.fetch('/api/test', { method: 'POST', body: JSON.stringify({ key: pk }) })
    ).rejects.toThrow('body contains a potential private key');
  });

  it('blocks fetch with secret in headers', async () => {
    await expect(
      window.fetch('/api/test', {
        headers: { 'X-Key': 'sk-ant-api03-abcdefghijklmnopqrstuvwx' },
      })
    ).rejects.toThrow('header contains a potential private key');
  });

  it('blocks fetch with secret in URL', async () => {
    const pk = '0x' + 'ab'.repeat(32);
    await expect(
      window.fetch(`/api/test?key=${pk}`)
    ).rejects.toThrow('URL contains a potential private key');
  });

  it('allows normal requests', async () => {
    await window.fetch('/api/test', { method: 'GET' });
    expect(originalFetch).toHaveBeenCalled();
  });
});

describe('installConsoleGuard', () => {
  it('redacts secrets from console.log output', async () => {
    const originalLog = console.log;
    const logged: unknown[][] = [];
    console.log = (...args: unknown[]) => { logged.push(args); };

    vi.resetModules();
    const mod = await import('../leakGuard');
    mod.installConsoleGuard();

    const pk = '0x' + 'ab'.repeat(32);
    console.log(`Debug: key=${pk}`);

    expect(logged.length).toBeGreaterThan(0);
    const output = logged[logged.length - 1][0] as string;
    expect(output).toContain('0x[REDACTED]');
    expect(output).not.toContain(pk);

    console.log = originalLog;
  });
});
