/**
 * client.ts — 唯一知道后端地址与路径的地方。
 *
 * 后端换前缀、改路由、加鉴权头，全在这张表与 `request` 里改；
 * 映射层与组件都不出现 `/api/...` 字面量（`npm run check` 会拦住）。
 *
 * 三种失败要区分开：
 *   404 —— 资源不存在（团队没建、策略没存过），调用方多数该走兜底，用 `mayGet`
 *   其他 4xx/5xx —— 真错误，抛 ApiError 让界面显示
 *   网络错/中止 —— 原样抛，AbortError 由调用方识别成「用户点了停止」
 */

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

/** 后端路由表（改后端只改这里）。 */
export const ROUTES = {
  /** 全部会话（群 + 单聊），列表里自带最近消息。 */
  groups: '/api/groups?kind=all',
  group: (id: string) => `/api/groups/${encodeURIComponent(id)}`,
  groupMessage: (id: string) => `/api/groups/${encodeURIComponent(id)}/messages`,
  groupStop: (id: string) => `/api/groups/${encodeURIComponent(id)}/stop`,
  /** 群事件流（agent.message / system.notice）。 */
  groupEvents: (id: string) => `/api/groups/${encodeURIComponent(id)}/events`,
  /** agent 间交接记录（右栏「执行」步骤的来源）。 */
  groupHops: (id: string) => `/api/groups/${encodeURIComponent(id)}/hops?all=1`,

  agents: '/api/agents',
  team: (id: string) => `/api/teams/${encodeURIComponent(id)}`,
  teamWorkflow: (id: string) => `/api/teams/${encodeURIComponent(id)}/workflow`,
  teamPolicy: (id: string) => `/api/teams/${encodeURIComponent(id)}/policy`,

  /** 设置分区（后端按域拆开，没有整份 PUT）。 */
  byok: '/api/settings/byok',
  /** 取明文 Key（语音转写要带上游凭证时才用）。 */
  byokReveal: (id: string) => `/api/settings/byok/${encodeURIComponent(id)}/reveal`,
  byokSave: (id: string) => `/api/settings/byok/${encodeURIComponent(id)}`,
  preferences: '/api/settings/preferences',
  cli: '/api/cli/detect',
  cliRefresh: '/api/cli/detect/refresh',
  sshConfig: '/api/remote-exec/config',
  sshTest: '/api/remote-exec/test',

  packs: '/api/memory-bank/packs',
  asr: '/api/asr/transcribe',
} as const;

export class ApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(path: string, status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

/** 后端错误体有两种：`{error:{code,message}}` 与 FastAPI 的 `{detail}`。 */
function readErrorMessage(body: unknown, path: string, status: number): string {
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    const err = o.error;
    if (err && typeof err === 'object') {
      const msg = (err as Record<string, unknown>).message;
      if (typeof msg === 'string' && msg) return msg;
    }
    if (typeof o.detail === 'string' && o.detail) return o.detail;
    if (typeof o.message === 'string' && o.message) return o.message;
  }
  return `${path} → ${status}`;
}

async function parseBody(res: Response): Promise<unknown> {
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body && typeof init.body === 'string'
        ? { 'content-type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new ApiError(path, res.status, readErrorMessage(await parseBody(res), path, res.status));
  }
  if (res.status === 204) return undefined as T;
  return (await parseBody(res)) as T;
}

/**
 * 读一个「可能没有」的资源：404 / 400 一律返回 null。
 * 团队没建、策略没存过、知识库空 —— 这些是正常状态，不该让整页报错。
 */
export async function mayGet<T>(path: string): Promise<T | null> {
  try {
    return await request<T>(path);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null;
    throw err;
  }
}

/** 取 `{ data: X }` 信封里的 X；没有信封就原样返回。 */
export function pickData<T>(json: unknown): T | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if ('data' in o) return (o.data ?? null) as T | null;
  return o as T;
}

/**
 * 发原始字节（语音转写走这条：后端要的是 audio/* body，不是 multipart）。
 * 失败照样抛 ApiError，调用方决定要不要降级。
 */
export async function postBinary<T>(
  path: string,
  blob: Blob,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': blob.type || 'application/octet-stream',
      ...headers,
    },
    body: blob,
  });
  if (!res.ok) {
    throw new ApiError(path, res.status, readErrorMessage(await parseBody(res), path, res.status));
  }
  return (await parseBody(res)) as T;
}
