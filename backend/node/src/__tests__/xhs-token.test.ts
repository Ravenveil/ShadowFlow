/**
 * xhs-token.test.ts — 小红书 OAuth2 token 生命周期测试（2026-11-08）。
 *
 * 全程 mock fetch（不打外网）+ 临时 .env（SF_ENV_PATH 指向 tmp），覆盖：
 *   - buildXhsAuthUrl：授权 URL 参数（client_id/response_type/redirect_uri/scope/state）
 *   - exchangeXhsCode：code 换 token → 回写 .env + process.env；两种响应形态
 *     （标准 OAuth2 snake_case / 开放平台信封 camelCase）
 *   - refreshXhsToken：续期；平台轮换 refresh_token 时一起更新、不轮换时保留旧值；
 *     缺凭证 / 平台拒绝 / 网络失败 → 结构化错误（不 throw、不 5xx）
 *   - ensureFreshXhsToken：发布前自动续期（新鲜跳过 / 临期·过期·缺 token 静默续期 /
 *     未知过期时间不盲刷 / 失败按旧 token 可用性降级 / 并发去重 / 阈值可调）
 *   - saveXhsTokens：同键覆盖、缺键追加、其余行（注释/其他键）不动
 *   - xhsTokenStatus：token 打码不回显明文
 *   - 路由端到端：/xhs/auth-url /xhs/exchange /xhs/refresh /xhs/token-status
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildXhsAuthUrl,
  exchangeXhsCode,
  refreshXhsToken,
  ensureFreshXhsToken,
  saveXhsTokens,
  xhsTokenStatus,
} from '../lib/social-platforms/xhs-token';

// ── fetch mock 基建 ───────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; init?: RequestInit }> = [];
let responder: (url: string) => Response;

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function jsonOf(i: number): Record<string, unknown> {
  return Object.fromEntries((calls[i].init?.body as URLSearchParams).entries());
}

beforeEach(() => {
  calls = [];
  responder = () => jsonRes({});
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return responder(url);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── env / .env 隔离 ──────────────────────────────────────────────────────────

const ENV_KEYS = [
  'SP_XHS_CLIENT_ID',
  'SP_XHS_CLIENT_SECRET',
  'SP_XHS_REDIRECT_URI',
  'SP_XHS_SCOPE',
  'SP_XHS_ACCESS_TOKEN',
  'SP_XHS_REFRESH_TOKEN',
  'SP_XHS_ACCESS_TOKEN_EXPIRES_AT',
  'SP_XHS_REFRESH_MARGIN_MS',
  'SP_XHS_OAUTH_BASE',
  'SP_XHS_AUTHORIZE_URL',
  'SP_XHS_TOKEN_URL',
  'SF_ENV_PATH',
];
const saved: Record<string, string | undefined> = {};
let tmp: string;
let envPath: string;

beforeAll(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-xhs-token-'));
  envPath = path.join(tmp, '.env');
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(tmp, { recursive: true, force: true });
});

function clearEnv(): void {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.SF_ENV_PATH = envPath;
}

function setupClient(): void {
  process.env.SP_XHS_CLIENT_ID = 'app-id-1';
  process.env.SP_XHS_CLIENT_SECRET = 'secret-1';
  process.env.SP_XHS_REDIRECT_URI = 'https://cb.example.com/done';
  process.env.SP_XHS_SCOPE = 'note.publish';
}

function envText(): string {
  return existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
}

// ── ① 授权 URL ───────────────────────────────────────────────────────────────

describe('buildXhsAuthUrl', () => {
  it('组装 client_id/response_type/redirect_uri/scope/state', () => {
    clearEnv();
    setupClient();
    const r = buildXhsAuthUrl('st-1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const u = new URL(r.url);
    expect(u.origin + u.pathname).toBe('https://open.xiaohongshu.com/oauth/authorize');
    expect(u.searchParams.get('client_id')).toBe('app-id-1');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('redirect_uri')).toBe('https://cb.example.com/done');
    expect(u.searchParams.get('scope')).toBe('note.publish');
    expect(u.searchParams.get('state')).toBe('st-1');
  });

  it('缺 SP_XHS_CLIENT_ID → CREDENTIALS_MISSING', () => {
    clearEnv();
    const r = buildXhsAuthUrl();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('CREDENTIALS_MISSING');
  });

  it('端点可用 SP_XHS_AUTHORIZE_URL 覆盖', () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_AUTHORIZE_URL = 'https://custom.example.com/oauth2/authorize';
    const r = buildXhsAuthUrl();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.url.startsWith('https://custom.example.com/oauth2/authorize?')).toBe(true);
  });
});

// ── ② code 换 token ──────────────────────────────────────────────────────────

describe('exchangeXhsCode', () => {
  it('标准 OAuth2 形态（snake_case）→ 写 .env + process.env', async () => {
    clearEnv();
    setupClient();
    responder = () =>
      jsonRes({ access_token: 'tok-A', refresh_token: 'ref-A', expires_in: 7200 });

    const r = await exchangeXhsCode('code-123');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.accessToken).toBe('tok-A');
    expect(r.refreshToken).toBe('ref-A');
    expect(r.expiresAt).toBeGreaterThan(Date.now());
    expect(r.env_path).toBe(envPath);

    // 请求形态：grant_type/code/client 凭证齐全
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://open.xiaohongshu.com/oauth/token');
    expect(jsonOf(0)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'code-123',
      client_id: 'app-id-1',
      client_secret: 'secret-1',
      redirect_uri: 'https://cb.example.com/done',
      scope: 'note.publish',
    });

    // .env 回写 + process.env 同步（网关免重启生效）
    expect(envText()).toContain('SP_XHS_ACCESS_TOKEN=tok-A');
    expect(envText()).toContain('SP_XHS_REFRESH_TOKEN=ref-A');
    expect(envText()).toContain('SP_XHS_ACCESS_TOKEN_EXPIRES_AT=');
    expect(process.env.SP_XHS_ACCESS_TOKEN).toBe('tok-A');
    expect(process.env.SP_XHS_REFRESH_TOKEN).toBe('ref-A');
  });

  it('开放平台信封形态（camelCase）→ 同样解析', async () => {
    clearEnv();
    setupClient();
    responder = () =>
      jsonRes({
        code: 0,
        message: 'success',
        data: {
          accessToken: 'tok-B',
          refreshToken: 'ref-B',
          accessTokenExpiresAt: Date.now() + 3600_000,
        },
      });

    const r = await exchangeXhsCode('code-456');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.accessToken).toBe('tok-B');
    expect(r.refreshToken).toBe('ref-B');
  });

  it('空 code → INVALID_CODE；平台错误 → PLATFORM_REJECTED', async () => {
    clearEnv();
    setupClient();
    const bad = await exchangeXhsCode('   ');
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.code).toBe('INVALID_CODE');

    responder = () => jsonRes({ error: 'invalid_grant', error_description: 'code 已过期' });
    const rejected = await exchangeXhsCode('code-1');
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.code).toBe('PLATFORM_REJECTED');
    expect(rejected.error).toContain('code 已过期');
  });
});

// ── ③ refresh 续期 ───────────────────────────────────────────────────────────

describe('refreshXhsToken', () => {
  it('续期成功；平台轮换 refresh_token → 一起更新', async () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_REFRESH_TOKEN = 'ref-old';
    responder = () => jsonRes({ access_token: 'tok-new', refresh_token: 'ref-new', expires_in: 7200 });

    const r = await refreshXhsToken();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.accessToken).toBe('tok-new');
    expect(jsonOf(0)).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'ref-old' });
    expect(envText()).toContain('SP_XHS_ACCESS_TOKEN=tok-new');
    expect(envText()).toContain('SP_XHS_REFRESH_TOKEN=ref-new');
    expect(process.env.SP_XHS_REFRESH_TOKEN).toBe('ref-new');
  });

  it('响应不带 refresh_token → 保留旧值', async () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_REFRESH_TOKEN = 'ref-keep';
    responder = () => jsonRes({ access_token: 'tok-x', expires_in: 7200 });

    const r = await refreshXhsToken();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refreshToken).toBe('ref-keep');
    expect(envText()).toContain('SP_XHS_REFRESH_TOKEN=ref-keep');
  });

  it('缺 SP_XHS_REFRESH_TOKEN → CREDENTIALS_MISSING 且不出网', async () => {
    clearEnv();
    setupClient();
    const r = await refreshXhsToken();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('CREDENTIALS_MISSING');
    expect(calls).toHaveLength(0);
  });

  it('网络失败 → NETWORK_ERROR（不 throw）', async () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_REFRESH_TOKEN = 'ref-1';
    responder = () => {
      throw new TypeError('fetch failed');
    };
    // responder 直接 throw 会被 fetch mock 包装层往外抛 → 让 fetch reject
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;

    const r = await refreshXhsToken();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('NETWORK_ERROR');
  });
});

// ── ④ 发布前自动续期 ─────────────────────────────────────────────────────────

describe('ensureFreshXhsToken', () => {
  it('token 新鲜（距过期 > 30min 阈值）→ 直接用，不出网', async () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_ACCESS_TOKEN = 'tok-fresh';
    process.env.SP_XHS_REFRESH_TOKEN = 'ref-1';
    process.env.SP_XHS_ACCESS_TOKEN_EXPIRES_AT = String(Date.now() + 60 * 60_000); // 1h

    const r = await ensureFreshXhsToken();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refreshed).toBe(false);
    expect(r.accessToken).toBe('tok-fresh');
    expect(calls).toHaveLength(0);
  });

  it('临期（< 30min）→ 静默续期，返回新 token 并回写', async () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_ACCESS_TOKEN = 'tok-old';
    process.env.SP_XHS_REFRESH_TOKEN = 'ref-1';
    process.env.SP_XHS_ACCESS_TOKEN_EXPIRES_AT = String(Date.now() + 10 * 60_000); // 10min < 30min
    responder = () => jsonRes({ access_token: 'tok-renewed', refresh_token: 'ref-2', expires_in: 7200 });

    const r = await ensureFreshXhsToken();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refreshed).toBe(true);
    expect(r.accessToken).toBe('tok-renewed');
    expect(calls).toHaveLength(1);
    expect(jsonOf(0)).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'ref-1' });
    expect(process.env.SP_XHS_ACCESS_TOKEN).toBe('tok-renewed');
  });

  it('已过期 → 同样静默续期', async () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_ACCESS_TOKEN = 'tok-expired';
    process.env.SP_XHS_REFRESH_TOKEN = 'ref-1';
    process.env.SP_XHS_ACCESS_TOKEN_EXPIRES_AT = String(Date.now() - 1000);
    responder = () => jsonRes({ access_token: 'tok-back', expires_in: 7200 });

    const r = await ensureFreshXhsToken();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refreshed).toBe(true);
    expect(r.accessToken).toBe('tok-back');
  });

  it('过期时间未知（手工填入）→ 不盲刷，直接用旧值', async () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_ACCESS_TOKEN = 'tok-unknown';
    process.env.SP_XHS_REFRESH_TOKEN = 'ref-1';

    const r = await ensureFreshXhsToken();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refreshed).toBe(false);
    expect(r.accessToken).toBe('tok-unknown');
    expect(calls).toHaveLength(0);
  });

  it('缺 access_token 但有 refresh_token → 续期补齐', async () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_REFRESH_TOKEN = 'ref-1';
    responder = () => jsonRes({ access_token: 'tok-filled', expires_in: 7200 });

    const r = await ensureFreshXhsToken();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refreshed).toBe(true);
    expect(r.accessToken).toBe('tok-filled');
    expect(calls).toHaveLength(1);
  });

  it('token 与 refresh_token 都缺 → 不出网，空 token 交上层报 CREDENTIALS_MISSING', async () => {
    clearEnv();
    setupClient();

    const r = await ensureFreshXhsToken();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.accessToken).toBe('');
    expect(calls).toHaveLength(0);
  });

  it('续期失败但旧 token 尚在有效期 → 降级用旧值（note 说明，不出网发布照旧）', async () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_ACCESS_TOKEN = 'tok-usable';
    process.env.SP_XHS_REFRESH_TOKEN = 'ref-1';
    process.env.SP_XHS_ACCESS_TOKEN_EXPIRES_AT = String(Date.now() + 5 * 60_000); // 临期但仍有效
    responder = () => jsonRes({ error: 'invalid_grant', error_description: 'refresh_token 已失效' });

    const r = await ensureFreshXhsToken();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refreshed).toBe(false);
    expect(r.accessToken).toBe('tok-usable');
    expect(r.note).toContain('暂用旧值');
    expect(process.env.SP_XHS_ACCESS_TOKEN).toBe('tok-usable'); // 旧值未被覆盖
  });

  it('续期失败且 token 已死 → TOKEN_REFRESH_FAILED 带底层原因', async () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_ACCESS_TOKEN = 'tok-dead';
    process.env.SP_XHS_REFRESH_TOKEN = 'ref-1';
    process.env.SP_XHS_ACCESS_TOKEN_EXPIRES_AT = String(Date.now() - 1000);
    responder = () => jsonRes({ error: 'invalid_grant', error_description: 'refresh_token 已失效' });

    const r = await ensureFreshXhsToken();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('TOKEN_REFRESH_FAILED');
    expect(r.error).toContain('refresh_token 已失效');
    expect(r.error).toContain('auth-url');
  });

  it('并发调用去重：同一时刻只发一次 refresh', async () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_ACCESS_TOKEN = 'tok-old';
    process.env.SP_XHS_REFRESH_TOKEN = 'ref-1';
    process.env.SP_XHS_ACCESS_TOKEN_EXPIRES_AT = String(Date.now() + 1000); // 临期
    responder = () => jsonRes({ access_token: 'tok-once', expires_in: 7200 });

    const [a, b] = await Promise.all([ensureFreshXhsToken(), ensureFreshXhsToken()]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.accessToken).toBe('tok-once');
    expect(b.accessToken).toBe('tok-once');
    expect(calls).toHaveLength(1);
  });

  it('SP_XHS_REFRESH_MARGIN_MS 可调阈值', async () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_REFRESH_MARGIN_MS = String(2 * 60 * 60_000); // 2h 阈值
    process.env.SP_XHS_ACCESS_TOKEN = 'tok-mid';
    process.env.SP_XHS_REFRESH_TOKEN = 'ref-1';
    process.env.SP_XHS_ACCESS_TOKEN_EXPIRES_AT = String(Date.now() + 60 * 60_000); // 1h < 2h → 临期
    responder = () => jsonRes({ access_token: 'tok-m2', expires_in: 7200 });

    const r = await ensureFreshXhsToken();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refreshed).toBe(true);
  });
});

// ── .env 回写细节 ─────────────────────────────────────────────────────────────

describe('saveXhsTokens', () => {
  it('同键覆盖、缺键追加、其余行不动', () => {
    clearEnv();
    writeFileSync(
      envPath,
      '# 注释保留\nMIMO_API_KEY=abc\nSP_XHS_ACCESS_TOKEN=old-tok\nOTHER=1\n',
      'utf8',
    );
    saveXhsTokens({ accessToken: 'new-tok', refreshToken: 'new-ref' });
    const text = envText();
    expect(text).toContain('# 注释保留');
    expect(text).toContain('MIMO_API_KEY=abc');
    expect(text).toContain('OTHER=1');
    expect(text).toContain('SP_XHS_ACCESS_TOKEN=new-tok');
    expect(text).toContain('SP_XHS_REFRESH_TOKEN=new-ref');
    expect(text).not.toContain('old-tok');
    // 覆盖是原位替换，不产生重复键
    expect(text.match(/^SP_XHS_ACCESS_TOKEN=/gm)).toHaveLength(1);
    expect(text.match(/^SP_XHS_REFRESH_TOKEN=/gm)).toHaveLength(1);
  });
});

// ── 状态自省 ─────────────────────────────────────────────────────────────────

describe('xhsTokenStatus', () => {
  it('token 打码不回显明文', () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_ACCESS_TOKEN = 'sk-1234567890abcdef';
    process.env.SP_XHS_REFRESH_TOKEN = 'rf-1234567890abcdef';
    process.env.SP_XHS_ACCESS_TOKEN_EXPIRES_AT = String(Date.now() + 60_000);
    const s = xhsTokenStatus();
    expect(s.has_client).toBe(true);
    expect(s.access_token).toBe('sk-1****cdef');
    expect(s.refresh_token).toBe('rf-1****cdef');
    expect(s.access_token).not.toContain('1234567890');
    expect(s.expires_in_seconds).toBeGreaterThan(0);
    expect(s.expired).toBe(false);
    expect(s.env_path).toBe(envPath);
  });
});

// ── 路由端到端 ───────────────────────────────────────────────────────────────

describe('/api/social-publish/xhs/* 路由', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let router: typeof import('../routes/social/social-publish').default;

  function app() {
    const a = express();
    a.use(express.json());
    a.use('/api/social-publish', router);
    return a;
  }

  beforeAll(async () => {
    // 路由模块连带 storage/sqlite（懒开库）；xhs 用例不碰 DB，但需与库测试隔离 cwd
    router = (await import('../routes/social/social-publish')).default;
  });

  it('GET /xhs/auth-url 返回授权 URL', async () => {
    clearEnv();
    setupClient();
    const res = await request(app()).get('/api/social-publish/xhs/auth-url?state=s1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.url).toContain('client_id=app-id-1');
  });

  it('POST /xhs/exchange 换 token 并回写 .env', async () => {
    clearEnv();
    setupClient();
    responder = () => jsonRes({ access_token: 'tok-rt', refresh_token: 'ref-rt', expires_in: 7200 });
    const res = await request(app())
      .post('/api/social-publish/xhs/exchange')
      .send({ code: 'code-rt' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(envText()).toContain('SP_XHS_ACCESS_TOKEN=tok-rt');
  });

  it('POST /xhs/refresh 续期；GET /xhs/token-status 打码', async () => {
    clearEnv();
    setupClient();
    process.env.SP_XHS_REFRESH_TOKEN = 'ref-route';
    responder = () => jsonRes({ access_token: 'tok-rt234567890abcd', expires_in: 7200 });
    const refreshed = await request(app()).post('/api/social-publish/xhs/refresh');
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.ok).toBe(true);

    const status = await request(app()).get('/api/social-publish/xhs/token-status');
    expect(status.status).toBe(200);
    // 打码：前 4 + **** + 后 4，且不回显明文中段
    expect(status.body.access_token).toMatch(/^tok-.*\*{4}.{4}$/);
    expect(status.body.access_token).not.toContain('rt2345');
    expect(status.body.refresh_token).toContain('****');
    expect(status.body.refresh_token).not.toContain('ref-route');
  });

  it('缺凭证时各端点结构化报错，不 5xx', async () => {
    clearEnv();
    const auth = await request(app()).get('/api/social-publish/xhs/auth-url');
    expect(auth.status).toBe(200);
    expect(auth.body).toMatchObject({ ok: false, code: 'CREDENTIALS_MISSING' });

    const refresh = await request(app()).post('/api/social-publish/xhs/refresh');
    expect(refresh.status).toBe(200);
    expect(refresh.body).toMatchObject({ ok: false, code: 'CREDENTIALS_MISSING' });

    const exchange = await request(app()).post('/api/social-publish/xhs/exchange').send({});
    expect(exchange.status).toBe(200);
    expect(exchange.body).toMatchObject({ ok: false, code: 'INVALID_CODE' });
  });
});
