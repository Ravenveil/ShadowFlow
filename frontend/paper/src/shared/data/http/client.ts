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
  /**
   * 会话时间线：一整轮的过程（思考 / 工具 / 正文 / 收尾）已由后端归并成
   * 一条有序列表，并附带该会话下的 run 列表（决定要订阅哪几条过程流）。
   * 注：agent 间交接（hop）数据由此接口一并返回，无需单独的 /hops 端点。
   */
  groupTimeline: (id: string) => `/api/groups/${encodeURIComponent(id)}/timeline`,
  /** 单条 run 的过程流（SSE：message / message-patch）。 */
  runStream: (id: string) => `/api/run-sessions/${encodeURIComponent(id)}/stream`,
  /** 当前挂起的人工审批门（nodeId 列表；空数组 = 无挂起）。 */
  groupApprovals: (id: string) => `/api/groups/${encodeURIComponent(id)}/approvals`,
  /** 对某个审批门作决定（approve / reject，可附意见）。 */
  groupApprovalDecision: (id: string, nodeId: string) =>
    `/api/groups/${encodeURIComponent(id)}/approvals/${encodeURIComponent(nodeId)}`,
  /** 找或建某个 agent 的单聊（返回 group_id）。 */
  dmResolve: (agentId: string) => `/api/chat/dm/${encodeURIComponent(agentId)}/resolve`,
  /** 项目列表（附会话树）。 */
  projects: '/api/projects?withSessions=1',
  /** 新建项目。 */
  projectCreate: '/api/projects',
  /** 改 / 删项目。 */
  projectUpdate: (id: string) => `/api/projects/${encodeURIComponent(id)}`,
  projectDelete: (id: string) => `/api/projects/${encodeURIComponent(id)}`,
  /** 建群（分组里新建对话第一步）。 */
  groupCreate: '/api/groups',
  /** 把某个群绑定到项目（分组里新建对话第二步）。 */
  projectBindGroup: (gid: string) =>
    `/api/projects/by-group/${encodeURIComponent(gid)}`,
  /** 团队模板目录（发起群聊里的「一键使用」）；fork 落 agent + team。 */
  catalogApps: '/api/catalog/apps',
  catalogFork: (appId: string) => `/api/catalog/apps/${encodeURIComponent(appId)}/fork`,

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
  /** ClawHub 安装/卸载会话（见 http/clawhub.ts）。 */
  clawhubInstall: (cliId: string) => `/api/clawhub/install/${encodeURIComponent(cliId)}`,
  clawhubUninstall: (cliId: string) => `/api/clawhub/uninstall/${encodeURIComponent(cliId)}`,
  clawhubInstallStream: (installId: string) =>
    `/api/clawhub/install/${encodeURIComponent(installId)}/stream`,
  clawhubInstallCancel: (installId: string) =>
    `/api/clawhub/install/${encodeURIComponent(installId)}/cancel`,
  sshConfig: '/api/remote-exec/config',
  sshTest: '/api/remote-exec/test',

  packs: '/api/memory-bank/packs',
  asr: '/api/asr/transcribe',

  /** 账号与会话（见 http/auth.ts；对应 routes/system/auth.ts）。 */
  authRegister: '/api/auth/register',
  authLogin: '/api/auth/login',
  authLogout: '/api/auth/logout',
  authMe: '/api/auth/me',
  authGuest: '/api/auth/guest',
  authSubscribe: '/api/auth/subscribe',

  /** 会话工作目录（产物 tab）：列一层 / 读文本 / 取二进制。 */
  fsList: (dir: string) => `/api/fs/list?include=files&path=${encodeURIComponent(dir)}`,
  fsRead: (file: string, root: string) =>
    `/api/fs/read?path=${encodeURIComponent(file)}&root=${encodeURIComponent(root)}`,
  fsRaw: (file: string, root: string) =>
    `/api/fs/raw?path=${encodeURIComponent(file)}&root=${encodeURIComponent(root)}`,

  /** ARC（AutoResearchClaw）管线观测：run 列表 / 详情 / 文本产物 / 二进制直链。root 收窄扫描到某个工作目录。 */
  arcRuns: (root?: string) =>
    root ? `/api/arc/runs?root=${encodeURIComponent(root)}` : '/api/arc/runs',
  arcRun: (runId: string, root?: string) =>
    `/api/arc/runs/${encodeURIComponent(runId)}${root ? `?root=${encodeURIComponent(root)}` : ''}`,
  arcArtifact: (runId: string, path: string, root?: string) =>
    `/api/arc/runs/${encodeURIComponent(runId)}/artifact?path=${encodeURIComponent(path)}${root ? `&root=${encodeURIComponent(root)}` : ''}`,
  arcRaw: (runId: string, path: string, root?: string) =>
    `/api/arc/runs/${encodeURIComponent(runId)}/raw?path=${encodeURIComponent(path)}${root ? `&root=${encodeURIComponent(root)}` : ''}`,
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
