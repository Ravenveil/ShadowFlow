/**
 * auth.ts — 账号与会话状态（邮箱注册/登录 + 游客演示模式）。
 *
 * data/http 里的一员：唯一的 fetch 与 /api 路径都在这一层，走 client.ts 的
 * `request` 与 `ROUTES`（对应后端 backend/node routes/system/auth.ts）。
 * 未登录时工作台以「演示模式」正常可用，登录/注册是可选增强。
 */
import { useSyncExternalStore } from 'react';
import { ROUTES, request } from './client';

export interface AuthUser {
  /** 后端 users.user_id（资源归属用；旧后端可能不返回）。 */
  user_id?: string;
  address: string;
  email?: string;
  display_name: string | null;
  auth_type: 'email' | 'wallet' | 'guest';
  /** 角色：'admin' 时设置页显示管理员分区（旧后端不返回即普通用户）。 */
  role?: 'admin' | 'user' | string;
  /** 账号是否被停用（管理员操作结果）。 */
  disabled?: boolean;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  /** true once the initial GET /me check settled (or no token to check). */
  ready: boolean;
}

const TOKEN_KEY = 'sf_auth_token';

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable — session simply won't persist
  }
}

let state: AuthState = { user: null, token: readToken(), ready: false };
const listeners = new Set<() => void>();

function setState(patch: Partial<AuthState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthSnapshot(): AuthState {
  return state;
}

export function useAuthState(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
}

/** 带 Bearer 的请求：token 有就带上，其余交给 client.request。 */
async function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const token = state.token;
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  return request<T>(path, { ...init, headers });
}

interface TokenResponse {
  token: string;
  user: AuthUser;
}

function acceptSession(data: TokenResponse): AuthUser {
  writeToken(data.token);
  setState({ user: data.user, token: data.token, ready: true });
  return data.user;
}

/** 邮箱注册（成功即登录）。 */
export async function authRegister(
  email: string,
  password: string,
  name?: string,
): Promise<AuthUser> {
  const data = await authRequest<TokenResponse>(ROUTES.authRegister, {
    method: 'POST',
    body: JSON.stringify({ email, password, name: name || undefined }),
  });
  return acceptSession(data);
}

/** 邮箱登录。 */
export async function authLogin(email: string, password: string): Promise<AuthUser> {
  const data = await authRequest<TokenResponse>(ROUTES.authLogin, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return acceptSession(data);
}

/** 游客一键体验：POST /api/auth/guest（无 body）。 */
export async function authGuest(): Promise<AuthUser> {
  const data = await authRequest<TokenResponse>(ROUTES.authGuest, { method: 'POST' });
  return acceptSession(data);
}

/** 退出登录（服务端吊销会话，本地清 token）。 */
export async function authLogout(): Promise<void> {
  const token = state.token;
  writeToken(null);
  setState({ user: null, token: null, ready: true });
  if (!token) return;
  try {
    await authRequest(ROUTES.authLogout, { method: 'POST' });
  } catch {
    // 服务端不可达时本地会话也已清除
  }
}

/** 启动时用已有 token 恢复会话；无有效会话则自动签发游客会话。 */
export async function refreshAuth(): Promise<void> {
  const token = readToken();
  if (token) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const user = await authRequest<AuthUser>(ROUTES.authMe);
        setState({ user, token, ready: true });
        return;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 401 || status === 403) break;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
          continue;
        }
        setState({ user: null, token, ready: true });
        return;
      }
    }
    writeToken(null);
    setState({ user: null, token: null });
  }
  try {
    await authGuest();
  } catch {
    setState({ user: null, token: null, ready: true });
  }
}

/** 介绍页留资（订阅/申请内测/预约演示）。失败静默——营销站可能无后端。 */
export async function authSubscribe(payload: {
  email: string;
  name?: string;
  source?: string;
  note?: string;
}): Promise<boolean> {
  try {
    await authRequest<{ ok: boolean }>(ROUTES.authSubscribe, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return true;
  } catch {
    return false;
  }
}

// 启动即恢复会话
void refreshAuth();

export function displayNameOf(user: AuthUser): string {
  return (
    user.display_name ||
    (user.email ? user.email.split('@')[0] : '') ||
    (user.address && user.address !== 'guest' ? user.address.slice(0, 8) : '用户')
  );
}

export function initialsOf(user: AuthUser): string {
  const name = displayNameOf(user);
  return name.slice(0, 2).toUpperCase();
}
