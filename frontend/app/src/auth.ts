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
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  // 仅带 body 时补 JSON 头（guest 等无 body 端点不发 Content-Type）
  if (init?.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
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
    // 附带 HTTP 状态码，供调用方区分「token 真失效(401/403)」与「瞬时故障(网络错误/5xx)」
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
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

/**
 * 游客一键体验：POST /api/auth/guest（无 body）。
 * 语义（方案 B · token 持久化复用）：token 存 localStorage，24h TTL 内刷新页面
 * 经 /me 校验后续上同一个游客身份与数据；过期/401 后再签是全新 guest_<hex>
 * 身份（游客间数据互不可见），旧数据留在旧 user_id 下。
 */
export async function authGuest(): Promise<AuthUser> {
  const data = await authFetch<TokenResponse>("/api/auth/guest", { method: "POST" });
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

/** 启动时用已有 token 恢复会话；失效则清除并自动签发游客会话。
 *
 * 语义：工作台的数据面接口（/api/projects、/api/conversations 等）需 Bearer 鉴权，
 * 未登录会返回 401。为避免前端把 401 误判为「数据加载失败」而回落占位数据，
 * 这里在没有有效会话时自动签发一条游客会话，让工作台始终直连后端真实数据。
 * 后端不可达时 authGuest 会抛错，静默保持离线兜底（此时各视图显示「数据加载失败」）。
 */
export async function refreshAuth(): Promise<void> {
  const token = readToken();
  if (token) {
    // /me 校验对瞬时故障（网络错误/5xx）重试；只有 401/403 才判定 token 失效。
    // 否则后端一次重启/抖动就会把 24h 内的合法会话清掉，造成「身份漂移」。
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const user = await authFetch<AuthUser>("/api/auth/me");
        setState({ user, token, ready: true });
        return;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 401 || status === 403) break; // 真失效 → 走下方重签
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
          continue; // 瞬时故障 → 退避重试
        }
        // 重试用尽仍不可达：保留 token（下次刷新页面再续上同一身份），
        // 不重签游客（重签 = 全新 guest_<hex>，旧数据从此看不见）。
        setState({ user: null, token, ready: true });
        return;
      }
    }
    // 旧 token 失效（401/403）→ 清除，下面重新签发游客会话
    writeToken(null);
    setState({ user: null, token: null });
  }
  // 无有效会话 → 自动签发游客会话（等价于「游客体验」按钮），直连后端真实数据。
  try {
    await authGuest();
  } catch {
    // 后端不可达：保持离线兜底（ready 置位，让 UI 继续渲染占位数据）
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
