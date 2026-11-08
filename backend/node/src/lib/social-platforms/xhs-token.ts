/**
 * social-platforms/xhs-token.ts — 小红书 OAuth2 token 生命周期（2026-11-08）。
 *
 * 链路（含发布前自动续期）：
 *   1. 浏览器授权（**仅此一步需要弹浏览器登录**）：buildXhsAuthUrl() 生成授权页
 *      URL → 用户登录小红书并同意授权 → 回调 redirect_uri 带回 code；
 *   2. code 换 token：exchangeXhsCode(code) → access_token（约 2h 有效）+
 *      refresh_token，回写 .env；
 *   3. 过期续期：refreshXhsToken() → 用 refresh_token 换新 access_token（平台
 *      可能同时轮换 refresh_token），新值回写 .env + 运行中 process.env——
 *      real 适配器每次发布现读 process.env，免重启即生效；
 *   4. 发布前自动续期：ensureFreshXhsToken()（real-xiaohongshu.ts 发布入口调用）——
 *      临期（默认 30min，SP_XHS_REFRESH_MARGIN_MS 可调）/已过期/缺 access_token
 *      时静默 refresh（并发去重，同一时刻只发一次）；续期失败按旧 token 可用性
 *      降级：尚在有效期 → 暂用旧值发布；已死 → TOKEN_REFRESH_FAILED 结构化回执。
 *
 * 凭证（.env）：
 *   SP_XHS_CLIENT_ID / SP_XHS_CLIENT_SECRET  应用凭证（开放平台「我的应用」）
 *   SP_XHS_REDIRECT_URI / SP_XHS_SCOPE       可选，授权回调与 scope（须与授权
 *                                            时一致，否则换 token 被拒）
 *   SP_XHS_ACCESS_TOKEN / SP_XHS_REFRESH_TOKEN     换得的令牌（续期自动更新）
 *   SP_XHS_ACCESS_TOKEN_EXPIRES_AT           过期时间戳（epoch ms，续期自动更新，
 *                                            供 status 展示与 ensureFreshXhsToken
 *                                            自动续期判断）
 *
 * 端点：默认 https://open.xiaohongshu.com 的标准 OAuth2 authorize/token 端点；
 *   各来源文档对路径表述不一，若平台侧路径不同用 SP_XHS_OAUTH_BASE /
 *   SP_XHS_AUTHORIZE_URL / SP_XHS_TOKEN_URL 覆盖，只改环境变量不动代码。
 *   响应兼容两种形态：标准 OAuth2（access_token/expires_in，snake_case）与开放
 *   平台信封（{code,message,data} / {error_code,success,data}，camelCase
 *   accessToken/refreshToken/accessTokenExpiresAt）。
 *
 * 注意：本文件有 .env 回写 IO（saveXhsTokens），不是纯函数模块；
 * PlatformAdapter 纯函数约定见同目录 index.ts。
 */

import fs from 'node:fs';
import path from 'node:path';
import { postForm, asRecord, asString } from './http';

// ── 端点与配置 ────────────────────────────────────────────────────────────────

const OAUTH_BASE = () =>
  (process.env.SP_XHS_OAUTH_BASE ?? 'https://open.xiaohongshu.com').replace(/\/+$/, '');

const AUTHORIZE_URL = () =>
  (process.env.SP_XHS_AUTHORIZE_URL ?? `${OAUTH_BASE()}/oauth/authorize`).trim();

const TOKEN_URL = () =>
  (process.env.SP_XHS_TOKEN_URL ?? `${OAUTH_BASE()}/oauth/token`).trim();

interface XhsEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
}

function readXhsEnv(): XhsEnv {
  const expiresRaw = (process.env.SP_XHS_ACCESS_TOKEN_EXPIRES_AT ?? '').trim();
  const expiresAt = /^\d+$/.test(expiresRaw) ? Number(expiresRaw) : null;
  return {
    clientId: (process.env.SP_XHS_CLIENT_ID ?? '').trim(),
    clientSecret: (process.env.SP_XHS_CLIENT_SECRET ?? '').trim(),
    redirectUri: (process.env.SP_XHS_REDIRECT_URI ?? '').trim(),
    scope: (process.env.SP_XHS_SCOPE ?? '').trim(),
    accessToken: (process.env.SP_XHS_ACCESS_TOKEN ?? '').trim(),
    refreshToken: (process.env.SP_XHS_REFRESH_TOKEN ?? '').trim(),
    expiresAt,
  };
}

// ── 结果类型 ──────────────────────────────────────────────────────────────────

export interface XhsTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
}

export type XhsTokenResult =
  | ({ ok: true; env_path: string } & XhsTokens)
  | { ok: false; code: string; error: string };

export type XhsAuthUrlResult =
  | { ok: true; url: string }
  | { ok: false; code: string; error: string };

// ── ① 浏览器授权 URL（一次性登录）────────────────────────────────────────────

/**
 * 生成 OAuth2 授权页 URL——用户在浏览器打开、登录小红书、同意授权后，
 * 回调 redirect_uri 会带 ?code=xxx。这是整条链路唯一需要浏览器登录的一步。
 */
export function buildXhsAuthUrl(state?: string): XhsAuthUrlResult {
  const env = readXhsEnv();
  if (!env.clientId) {
    return { ok: false, code: 'CREDENTIALS_MISSING', error: '缺少环境变量 SP_XHS_CLIENT_ID（小红书开放平台应用凭证）' };
  }
  const url = new URL(AUTHORIZE_URL());
  url.searchParams.set('client_id', env.clientId);
  url.searchParams.set('response_type', 'code');
  if (env.redirectUri) url.searchParams.set('redirect_uri', env.redirectUri);
  if (env.scope) url.searchParams.set('scope', env.scope);
  if (state) url.searchParams.set('state', state);
  return { ok: true, url: url.toString() };
}

// ── ②③ 换 token / 续期 ───────────────────────────────────────────────────────

/** code 换 access_token + refresh_token（授权码模式，无需浏览器）。 */
export async function exchangeXhsCode(code: string): Promise<XhsTokenResult> {
  const c = (code ?? '').trim();
  if (!c) return { ok: false, code: 'INVALID_CODE', error: 'code 不能为空（授权回调 URL 的 ?code= 参数）' };
  const env = readXhsEnv();
  const missing = missingCredentials(env);
  if (missing) return missing;
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: env.clientId,
    client_secret: env.clientSecret,
    code: c,
  };
  if (env.redirectUri) body.redirect_uri = env.redirectUri;
  if (env.scope) body.scope = env.scope;
  return tokenRequest(body);
}

/**
 * refresh_token 换新 access_token（约 2h 过期后调用；纯服务端 HTTP，无浏览器）。
 * 平台可能同时轮换 refresh_token——响应里带了就一起更新，没带就保留旧值。
 */
export async function refreshXhsToken(): Promise<XhsTokenResult> {
  const env = readXhsEnv();
  if (!env.refreshToken) {
    return {
      ok: false,
      code: 'CREDENTIALS_MISSING',
      error:
        '缺少环境变量 SP_XHS_REFRESH_TOKEN——首次须走浏览器授权拿 code 后换得（GET /api/social-publish/xhs/auth-url → 回调 code → POST /xhs/exchange）',
    };
  }
  const missing = missingCredentials(env);
  if (missing) return missing;
  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    client_id: env.clientId,
    client_secret: env.clientSecret,
    refresh_token: env.refreshToken,
  };
  if (env.scope) body.scope = env.scope;
  return tokenRequest(body);
}

function missingCredentials(env: XhsEnv): XhsTokenResult | null {
  if (env.clientId && env.clientSecret) return null;
  return {
    ok: false,
    code: 'CREDENTIALS_MISSING',
    error: '缺少环境变量 SP_XHS_CLIENT_ID / SP_XHS_CLIENT_SECRET（小红书开放平台应用凭证）',
  };
}

async function tokenRequest(body: Record<string, string>): Promise<XhsTokenResult> {
  let res;
  try {
    res = await postForm(TOKEN_URL(), body);
  } catch (e) {
    return { ok: false, code: 'NETWORK_ERROR', error: (e as Error).message };
  }
  const parsed = parseTokenResponse(res.data);
  if (!parsed.accessToken) {
    return { ok: false, code: 'PLATFORM_REJECTED', error: parsed.error || `token 端点返回无法解析（HTTP ${res.status}）` };
  }
  const tokens: XhsTokens = {
    accessToken: parsed.accessToken,
    // refresh_token 轮换：响应带新的才覆盖，否则保留旧值
    refreshToken: parsed.refreshToken || body.refresh_token || '',
    expiresAt: parsed.expiresAt,
  };
  const env_path = saveXhsTokens(tokens);
  return { ok: true, env_path, ...tokens };
}

// ── ④ 发布前自动续期 ─────────────────────────────────────────────────────────

/** 临期阈值：默认 30 分钟，SP_XHS_REFRESH_MARGIN_MS（毫秒）可调。 */
const REFRESH_MARGIN_DEFAULT_MS = 30 * 60 * 1000;

function refreshMarginMs(): number {
  const raw = (process.env.SP_XHS_REFRESH_MARGIN_MS ?? '').trim();
  if (!raw) return REFRESH_MARGIN_DEFAULT_MS; // Number('') === 0，空串必须走默认值
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : REFRESH_MARGIN_DEFAULT_MS;
}

/** 并发去重：同一时刻只发一次 refresh，共用同一 Promise。 */
let inflightRefresh: Promise<XhsTokenResult> | null = null;

function dedupRefresh(): Promise<XhsTokenResult> {
  if (!inflightRefresh) {
    inflightRefresh = refreshXhsToken().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

export interface XhsEnsureOk {
  ok: true;
  /** 本次是否真的换了新 token。 */
  refreshed: boolean;
  /** 当前可用 access_token；空串 = 完全没有（交上层按 CREDENTIALS_MISSING 报）。 */
  accessToken: string;
  /** 跳过/降级说明（如续期失败但旧 token 尚可用）。 */
  note?: string;
}

export type XhsEnsureResult = XhsEnsureOk | { ok: false; code: string; error: string };

/**
 * 发布前确保拿到可用 access_token（real-xiaohongshu.ts 发布入口调用；不抛异常）：
 *   - token 新鲜（距过期 > 阈值）→ 直接用，不出网；
 *   - 过期时间未知（手工填入、无到期元数据）→ 不盲刷，直接用；
 *   - 临期 / 已过期 / 缺 access_token（有 refresh_token）→ 静默 refresh，并发去重；
 *   - token 与 refresh_token 都缺 → 空 token 交上层报 CREDENTIALS_MISSING；
 *   - 续期失败：旧 token 尚在有效期 → 降级暂用旧值（note 说明）；
 *     已过期或本就没有 → { ok:false, code:'TOKEN_REFRESH_FAILED' }。
 */
export async function ensureFreshXhsToken(): Promise<XhsEnsureResult> {
  const env = readXhsEnv();
  const now = Date.now();

  if (!env.accessToken && !env.refreshToken) {
    return { ok: true, refreshed: false, accessToken: '' };
  }
  if (env.accessToken && env.expiresAt === null) {
    return { ok: true, refreshed: false, accessToken: env.accessToken };
  }
  if (env.accessToken && env.expiresAt !== null && env.expiresAt - now > refreshMarginMs()) {
    return { ok: true, refreshed: false, accessToken: env.accessToken };
  }

  // 临期 / 已过期 / 缺 token → 静默续期
  let r: XhsTokenResult;
  try {
    r = await dedupRefresh();
  } catch (e) {
    r = { ok: false, code: 'NETWORK_ERROR', error: (e as Error).message };
  }
  if (r.ok) return { ok: true, refreshed: true, accessToken: r.accessToken };

  const stillUsable = Boolean(env.accessToken) && (env.expiresAt === null || env.expiresAt > now);
  if (stillUsable) {
    return {
      ok: true,
      refreshed: false,
      accessToken: env.accessToken,
      note: `自动续期失败（${r.code}: ${r.error}），旧 token 尚在有效期内，暂用旧值发布`,
    };
  }
  return {
    ok: false,
    code: 'TOKEN_REFRESH_FAILED',
    error:
      `自动续期失败（${r.code}: ${r.error}）；token 已过期或缺失，无法发布——` +
      '请重新浏览器授权（GET /api/social-publish/xhs/auth-url → POST /xhs/exchange）',
  };
}

// ── 响应解析（兼容两种形态）───────────────────────────────────────────────────

interface ParsedToken {
  accessToken?: string;
  refreshToken?: string;
  expiresAt: number | null;
  error?: string;
}

function parseTokenResponse(raw: unknown): ParsedToken {
  const d = asRecord(raw);
  if (!d) return { expiresAt: null, error: '响应不是 JSON 对象' };

  // 信封形态：{code,message,data} / {error_code,success,data} → 取 data 内层
  const hasEnvelope = d.code !== undefined || d.error_code !== undefined || d.success !== undefined;
  const inner = (hasEnvelope && asRecord(d.data)) || d;

  const accessToken = asString(inner.access_token) || asString(inner.accessToken);
  if (!accessToken) {
    const msg =
      asString(d.message) || asString(d.error_description) || asString(d.error) || asString(inner.message);
    const errCode = d.code ?? d.error_code;
    return { expiresAt: null, error: msg || (errCode !== undefined ? `平台错误码 ${String(errCode)}` : '响应缺少 access_token') };
  }

  const refreshToken = asString(inner.refresh_token) || asString(inner.refreshToken);

  // 过期时间：expires_in（相对秒）或 *ExpiresAt/expires_at（绝对 ms，防御性判幅）
  let expiresAt: number | null = null;
  const relSec = num(inner.expires_in ?? inner.expiresIn);
  const absRaw = num(inner.accessTokenExpiresAt ?? inner.expires_at ?? inner.expiresAt);
  if (absRaw !== null) {
    expiresAt = absRaw > 1e12 ? absRaw : Date.now() + absRaw * 1000;
  } else if (relSec !== null) {
    expiresAt = Date.now() + relSec * 1000;
  }
  return { accessToken, refreshToken, expiresAt };
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

// ── .env 回写 ─────────────────────────────────────────────────────────────────

/**
 * 定位要回写的 .env：
 *   1. SF_ENV_PATH 显式覆盖（测试 / 运维指定）；
 *   2. 已存在且含 SP_XHS_ 键的候选文件（与 env.ts 加载优先级一致：backend/.env
 *      先于仓库根 .env）；
 *   3. 第一个已存在的候选；都没有则写仓库根 .env（README 口径）。
 */
export function resolveEnvPath(): string {
  const override = (process.env.SF_ENV_PATH ?? '').trim();
  if (override) return override;
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', '..', '.env'), // backend/.env
    path.resolve(__dirname, '..', '..', '..', '..', '..', '.env'), // 仓库根 .env
  ];
  const existing = candidates.filter((p) => fs.existsSync(p));
  const withXhs = existing.find((p) => fs.readFileSync(p, 'utf8').includes('SP_XHS_'));
  return withXhs ?? existing[0] ?? candidates[candidates.length - 1];
}

/**
 * 把新 token 写回 .env（同键覆盖、缺键追加，保留其余行）并同步 process.env——
 * 运行中的网关免重启即用新值（real-xiaohongshu.ts 每次发布现读 process.env）。
 * 返回写入的 .env 路径。
 */
export function saveXhsTokens(tokens: Partial<XhsTokens>): string {
  const updates: Record<string, string> = {};
  if (tokens.accessToken) updates.SP_XHS_ACCESS_TOKEN = tokens.accessToken;
  if (tokens.refreshToken) updates.SP_XHS_REFRESH_TOKEN = tokens.refreshToken;
  if (tokens.expiresAt) updates.SP_XHS_ACCESS_TOKEN_EXPIRES_AT = String(tokens.expiresAt);

  const envPath = resolveEnvPath();
  const text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = text === '' ? [] : text.split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();

  for (const [key, value] of Object.entries(updates)) {
    const v = value.replace(/[\r\n]/g, ''); // .env 单行语义，防注入换行
    process.env[key] = v; // 同步运行中进程，免重启
    const line = `${key}=${v}`;
    const idx = lines.findIndex((l) => l === line || l.startsWith(`${key}=`) || l.startsWith(`export ${key}=`));
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
  }

  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, lines.length ? `${lines.join('\n')}\n` : '', 'utf8');
  return envPath;
}

// ── 状态自省（token 打码，不回显明文）─────────────────────────────────────────

function mask(token: string): string | null {
  if (!token) return null;
  if (token.length <= 8) return '****';
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

export function xhsTokenStatus(): {
  has_client: boolean;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  expires_in_seconds: number | null;
  expired: boolean | null;
  env_path: string;
} {
  const env = readXhsEnv();
  return {
    has_client: Boolean(env.clientId && env.clientSecret),
    access_token: mask(env.accessToken),
    refresh_token: mask(env.refreshToken),
    expires_at: env.expiresAt,
    expires_in_seconds: env.expiresAt ? Math.max(0, Math.round((env.expiresAt - Date.now()) / 1000)) : null,
    expired: env.expiresAt ? env.expiresAt <= Date.now() : null,
    env_path: resolveEnvPath(),
  };
}
