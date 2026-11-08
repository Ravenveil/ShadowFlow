/**
 * http-compat.test.ts — 公网稳定性/兼容性共用件（2026-11-08）。
 *
 * 覆盖：keepAlive/headers 超时对齐值、CORS_ORIGINS 逗号解析/去重/回退。
 */

import { describe, expect, it } from 'vitest';

import {
  HEADERS_TIMEOUT_MS,
  KEEP_ALIVE_TIMEOUT_MS,
  applyHttpServerTuning,
  buildCorsOrigins,
} from '../lib/http-compat';

describe('applyHttpServerTuning', () => {
  it('keepAlive=65s / headers=70s（headers 严格大于 keepAlive）', () => {
    const server = { keepAliveTimeout: 5000, headersTimeout: 60000 };
    applyHttpServerTuning(server);
    expect(server.keepAliveTimeout).toBe(KEEP_ALIVE_TIMEOUT_MS);
    expect(server.headersTimeout).toBe(HEADERS_TIMEOUT_MS);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });
});

describe('buildCorsOrigins', () => {
  it('基础白名单 = FRONTEND_ORIGIN + 两个本地开发端口', () => {
    expect(buildCorsOrigins('http://localhost:3007', {})).toEqual([
      'http://localhost:3007',
      'http://localhost:3000',
      'http://localhost:5173',
    ]);
  });

  it('CORS_ORIGINS 逗号分隔补放行（去空白 + 去重）', () => {
    const origins = buildCorsOrigins('http://localhost:3007', {
      CORS_ORIGINS: 'https://a.example.com , https://b.example.com,https://a.example.com',
    });
    expect(origins).toContain('https://a.example.com');
    expect(origins).toContain('https://b.example.com');
    expect(origins.filter((o) => o === 'https://a.example.com')).toHaveLength(1);
  });

  it('空串/未设置不报错不加项', () => {
    expect(buildCorsOrigins('http://x', { CORS_ORIGINS: '' })).toHaveLength(3);
    expect(buildCorsOrigins('http://x', {})).toHaveLength(3);
  });
});
