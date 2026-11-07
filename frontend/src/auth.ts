/**
 * auth.ts — 账号与会话状态（邮箱注册/登录 + 演示模式）。
 *
 * 后端契约：backend/node routes/system/auth.ts
 *   POST /api/auth/register { email, password, name? }
 *   POST /api/auth/login    { email, password }
 *   POST /api/auth/logout   (Bearer)
 *   POST /api/auth/profile  { display_name } (Bearer)
 *   GET  /api/auth/me       (Bearer)
 *   POST /api/auth/subscribe { email, name?, source?, note? }  ← 介绍页留资
 *
 * 会话保存在 localStorage（sf_auth_token）；未登录时工作台以「演示模式」
 * 正常可用，登录/注册是可选增强。
 */
import { useSyncExternalStore } from "react";

export interface AuthUser {
  /** 后端 users.user_id（管理员面板/资源归属用；旧后端可能不返回）。 */
  user_id?: string;
  address: string;
  email?: string;
  display_name: string | null;
  auth_type: "email" | "wallet" | "guest";
  /** 角色：'admin' 时 SettingsView 显示管理员分区（旧后端不返回即普通用户）。 */
  role?: "admin" | "user" | string;
  /** 账号是否被停用（管理员操作结果）。 */
  disabled?: boolean;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  /** true once the initial GET /me check settled (or no token to check). */
  ready: boolean;
}

const TOKEN_KEY = "sf_auth_token";

const SF_API_BASE: string =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE) || "";

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
  return () => listeners.delete(listener);
}

export function getAuthSnapshot(): AuthState {
  return state;
}

export function useAuthState(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
}

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const token = state.token;
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${SF_API_BASE}${path}`, { ...init, headers });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    // 后端错误形状：{error:{code,message}} 或 {error:string}
    const err = (body as { error?: unknown } | null)?.error;
    let message = `HTTP ${res.status}`;
    if (typeof err === "string") message = err;
    else if (err && typeof err === "object") {
      const e = err as { code?: string; message?: string };
      message = e.message || e.code || message;
      if (e.code === "USER_DISABLED") message = "账号已被停用，请联系管理员";
    }
    throw new Error(message);
  }
  return body as T;
}

interface TokenResponse {
  token: string;
  user: AuthUser;
}

/** 邮箱注册（成功即登录）。 */
export async function authRegister(email: string, password: string, name?: string): Promise<AuthUser> {
  const data = await authFetch<TokenResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: name || undefined }),
  });
  writeToken(data.token);
  setState({ user: data.user, token: data.token, ready: true });
  return data.user;
}

/** 邮箱登录。 */
export async function authLogin(email: string, password: string): Promise<AuthUser> {
  const data = await authFetch<TokenResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  writeToken(data.token);
  setState({ user: data.user, token: data.token, ready: true });
  return data.user;
}

/** 退出登录（服务端吊销会话，本地清 token）。 */
export async function authLogout(): Promise<void> {
  const token = state.token;
  writeToken(null);
  setState({ user: null, token: null, ready: true });
  if (!token) return;
  try {
    await fetch(`${SF_API_BASE}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // 服务端不可达时本地会话也已清除
  }
}

/** 启动时用已有 token 恢复会话；失效则清除。 */
export async function refreshAuth(): Promise<void> {
  const token = readToken();
  if (!token) {
    setState({ ready: true });
    return;
  }
  try {
    const user = await authFetch<AuthUser>("/api/auth/me");
    setState({ user, token, ready: true });
  } catch {
    writeToken(null);
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
    await authFetch<{ ok: boolean }>("/api/auth/subscribe", {
      method: "POST",
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
    (user.email ? user.email.split("@")[0] : "") ||
    (user.address && user.address !== "guest" ? user.address.slice(0, 8) : "用户")
  );
}

export function initialsOf(user: AuthUser): string {
  const name = displayNameOf(user);
  return name.slice(0, 2).toUpperCase();
}
