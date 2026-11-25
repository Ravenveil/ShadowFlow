/**
 * generic.ts — 工作台子页面的通用 HTTP 客户端。
 *
 * 用 client.ts 的 request/mayGet（统一 JSON 解析 + ApiError），只补各页面
 * 端点与 DTO。页面组件只认这里导出的函数，不直接写 fetch、不认 mock。
 */
import { API_BASE, ROUTES, mayGet, request } from '@/shared/data/http/client';
import type { ByokDto } from '@/shared/data/http/contract';

/* ── 通用信封：后端有的直接返回数组，有的包一层 {data} ─────────────── */
async function unwrap<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await request<T | { data: T }>(path, init);
  if (res && typeof res === 'object' && 'data' in (res as object)) {
    return (res as { data: T }).data;
  }
  return res as T;
}

/* ── 新闻 / 订阅源 ─────────────────────────────────────────────────── */
export interface NewsFeed {
  feed_id: string;
  name: string;
  url: string;
  enabled: boolean;
  added_at: number;
}
export interface NewsVerdict {
  score: number;
  title_zh?: string;
  summary_zh?: string;
  reason?: string;
  category?: string;
}
export interface NewsItem {
  item_id: string;
  feed_id: string;
  source: string;
  title: string;
  link: string;
  summary: string;
  published_at: number;
  fetched_at: number;
  verdict?: NewsVerdict;
}
export interface NewsList {
  items: NewsItem[];
  feeds: NewsFeed[];
}
export interface NewsRefreshReport {
  added: number;
  total: number;
  enriched?: number;
  failed: { feed: string; reason: string }[];
}
export const getNews = (limit = 120) => unwrap<NewsList>(`/api/news/items?limit=${limit}`);
export const refreshNews = () => request<NewsRefreshReport>('/api/news/refresh', { method: 'POST' });
export const addNewsFeed = (url: string, name?: string) =>
  request<{ feed: NewsFeed }>('/api/news/feeds', {
    method: 'POST',
    body: JSON.stringify({ url, name }),
  });
export const removeNewsFeed = (id: string) =>
  request<null>(`/api/news/feeds/${encodeURIComponent(id)}`, { method: 'DELETE' });

/* ── 团队模板目录（发起群聊的「一键使用」）────────────────────────── */
export interface CatalogTeamApp {
  app_id: string;
  name: string;
  goal?: string;
  mode?: string;
}
export interface CatalogForkResult {
  blueprint_id?: string;
  agents?: { agent_id: string; name?: string }[];
  team?: { team_id: string; name?: string; agent_ids?: string[] };
}
export const listCatalogTeamApps = async (): Promise<CatalogTeamApp[]> => {
  const res = await mayGet<{ apps?: CatalogTeamApp[]; data?: { apps?: CatalogTeamApp[] } }>(
    ROUTES.catalogApps,
  );
  const apps = res?.apps ?? res?.data?.apps ?? [];
  return apps.filter((a) => (a.mode ?? 'team') === 'team');
};
export const forkCatalogApp = (appId: string, workspaceId?: string) =>
  request<CatalogForkResult>(ROUTES.catalogFork(appId), {
    method: 'POST',
    body: JSON.stringify(workspaceId ? { workspace_id: workspaceId } : {}),
  });

/* ── 团队 / 知识包 ─────────────────────────────────────────────────── */
export interface TeamRecord {
  team_id?: string;
  id?: string;
  name: string;
  description?: string;
  agent_ids?: string[];
  workflow?: unknown;
  policy_matrix?: unknown;
}
export interface AgentBrief {
  agent_id: string;
  name: string;
  /** 灵魂 / 人设提示词。列表接口会带上（yaml 模板只给首行）。 */
  soul?: string;
  status?: string;
  source?: string;
  claw_id?: string;
  avatar_color?: string;
  avatar_style?: string;
  avatar_seed?: string;
  avatar_image?: string;
  [k: string]: unknown;
}
export const getTeams = async (): Promise<TeamRecord[]> => {
  const res = await mayGet<TeamRecord[] | { data?: TeamRecord[] }>('/api/teams');
  return Array.isArray(res) ? res : res?.data ?? [];
};
export const getAgents = async (): Promise<AgentBrief[]> => {
  const res = await mayGet<AgentBrief[] | { data?: AgentBrief[] }>('/api/agents');
  return Array.isArray(res) ? res : res?.data ?? [];
};

/** 单条 Agent 详情（灵魂编辑打开时拉完整 soul，{data} 信封）。 */
export const getAgentDetail = (id: string) =>
  unwrap<AgentBrief>(`/api/agents/${encodeURIComponent(id)}`);

/** 灵魂页一次 PATCH 全量提交：名称 / 灵魂 / 头像 / Claw 绑定。 */
export interface AgentSoulPatch {
  name: string;
  soul: string;
  claw_id?: string;
  avatar_style?: string;
  avatar_seed?: string;
  avatar_image?: string;
}
/**
 * 后端语义：JSON 真源浅合并可写；yaml 模板（source=yaml-template）的
 * name/soul 只读，会返回 422 YAML_TEMPLATE_READONLY —— 调用方据此提示。
 */
export const saveAgentSoul = (id: string, patch: AgentSoulPatch) =>
  request<AgentBrief>(`/api/agents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

/** 暂停 / 恢复（真实端点，返回完整 record）。 */
export const pauseAgent = (id: string) =>
  unwrap<AgentBrief>(`/api/agents/${encodeURIComponent(id)}/pause`, { method: 'POST' });
export const resumeAgent = (id: string) =>
  unwrap<AgentBrief>(`/api/agents/${encodeURIComponent(id)}/resume`, { method: 'POST' });
/** 删除员工（204 无 body）。 */
export const deleteAgent = (id: string) =>
  request<null>(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** 新建 Agent（后端 QuickCreate 契约：name + soul 必填；soul 即人设，缺省同名）。 */
export interface CreateAgentReq {
  name: string;
  soul: string;
  claw_id?: string;
  avatar_style?: string;
  avatar_seed?: string;
}
export const createAgent = (req: CreateAgentReq) =>
  unwrap<AgentBrief>('/api/agents', { method: 'POST', body: JSON.stringify(req) });

/**
 * 一句话 → 完整人设（走 Node 网关 /api/llm/chat/completions，GLM）。
 * key 解析与转写同策略：设置页 byok 里优先智谱，reveal 明文后走
 * x-llm-key/x-llm-provider header（后端 resolveApiKey header 优先，env 兜底）。
 */
export interface PersonaOptions {
  model?: string;
  signal?: AbortSignal;
}
interface LlmKeyTarget {
  provider: string;
  key: string;
}
let llmKeyCache: LlmKeyTarget | null = null;

/** LLM 生成类调用的上游凭证：优先智谱，缺省第一个启用 provider，reveal 拿明文。 */
export async function resolveLlmKey(): Promise<LlmKeyTarget | null> {
  if (llmKeyCache) return llmKeyCache;
  const byok = await mayGet<ByokDto>('/api/settings/byok');
  const providers = Object.entries(byok?.providers ?? {}).filter(([, p]) => p.enabled && p.apiKey);
  const target = providers.find(([id]) => id === 'zhipu') ?? providers[0];
  if (!target) return null;
  try {
    const res = await request<{ apiKey?: string }>(
      `/api/settings/byok/${encodeURIComponent(target[0])}/reveal`,
    );
    if (res?.apiKey) llmKeyCache = { provider: target[0], key: res.apiKey };
    return llmKeyCache;
  } catch {
    return null;
  }
}

export const generateAgentPersona = async (description: string, opts: PersonaOptions = {}) => {
  const target = await resolveLlmKey();
  const res = await request<{ choices?: Array<{ message?: { content?: string } }>; content?: string }>(
    '/api/llm/chat/completions',
    {
      method: 'POST',
      ...(target ? { headers: { 'x-llm-key': target.key, 'x-llm-provider': target.provider } } : {}),
      signal: opts.signal,
      body: JSON.stringify({
        model: opts.model ?? 'glm-4-flash',
        stream: false,
        max_tokens: 1024,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: [
              '你是资深 AI Agent 设计师。用户会给你一句话描述，你要为这个角色生成一份可直接使用的 Agent 人设（persona）。',
              '要求：',
              '1. 全程使用中文；',
              '2. 严格按以下三段输出，每段以「## 」开头：## 角色定位 / ## 核心能力 / ## 工作边界；',
              '3. 角色定位：一段话说明这个 Agent 是谁、服务什么场景；',
              '4. 核心能力：3-5 条要点（每条一行，以「- 」开头），写清能做什么；',
              '5. 工作边界：2-3 条要点，写清不做什么、何时该拒绝或转交；',
              '6. 只输出人设正文，不要任何寒暄、解释或代码块包裹。',
            ].join('\n'),
          },
          { role: 'user', content: description },
        ],
      }),
    },
  );
  return res?.choices?.[0]?.message?.content ?? res?.content ?? '';
};

/* ── 消息交互（搬 legacy NeoMsgFeedback / NeoGroupMsgActions）────────────── */

/** 消息 👍/👎 反馈：每用户一票，重复同一 rating = 撤销，换向 = 切换。 */
export interface MessageFeedback {
  message_id: string;
  up: number;
  down: number;
  my_rating: 1 | -1 | null;
}

const parseFeedback = (json: unknown, messageId: string): MessageFeedback => {
  const data = (json as { data?: Partial<MessageFeedback> })?.data ?? (json as Partial<MessageFeedback>) ?? {};
  const my = (data as MessageFeedback).my_rating;
  return {
    message_id: typeof data.message_id === 'string' ? data.message_id : messageId,
    up: typeof data.up === 'number' ? data.up : 0,
    down: typeof data.down === 'number' ? data.down : 0,
    my_rating: my === 1 || my === -1 ? my : null,
  };
};

export const getMessageFeedback = async (messageId: string, userId = 'anonymous') => {
  const res = await request<unknown>(
    `/api/messages/${encodeURIComponent(messageId)}/feedback?user_id=${encodeURIComponent(userId)}`,
  );
  return parseFeedback(res, messageId);
};

export const postMessageFeedback = async (messageId: string, rating: 1 | -1, userId = 'anonymous') => {
  const res = await request<unknown>(`/api/messages/${encodeURIComponent(messageId)}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ rating, user_id: userId }),
  });
  return parseFeedback(res, messageId);
};

/** Toggle 一个 emoji 反应，返回该消息更新后的完整 reactions map（emoji→user[]）。 */
export const reactToMessage = async (groupId: string, messageId: string, emoji: string, userId = 'anonymous') => {
  const res = await request<{ data?: { reactions?: Record<string, string[]> } } | Record<string, string[]>>(
    `/api/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/reactions`,
    { method: 'POST', body: JSON.stringify({ emoji, user_id: userId }) },
  );
  const withData = res as { data?: { reactions?: Record<string, string[]> } };
  return withData?.data?.reactions ?? (res as Record<string, string[]>) ?? {};
};

/** Pin / unpin 一条群消息（pinned 省略 = toggle），返回新状态。 */
export const pinMessage = async (groupId: string, messageId: string, pinned?: boolean) => {
  const res = await request<{ data?: { pinned?: boolean } } | { pinned?: boolean }>(
    `/api/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/pin`,
    { method: 'POST', body: JSON.stringify(pinned === undefined ? {} : { pinned }) },
  );
  const withData = res as { data?: { pinned?: boolean } };
  return Boolean(withData?.data?.pinned ?? (res as { pinned?: boolean })?.pinned);
};

/** 探测到的 CLI（用于 Claw 驱动后端下拉；只认已安装的 claw）。 */
export interface DetectedCli {
  id: string;
  installed: boolean;
  is_claw?: boolean;
  version?: string;
  [k: string]: unknown;
}
export const getClaws = async (): Promise<DetectedCli[]> => {
  const snap = await mayGet<{ items?: DetectedCli[] } | DetectedCli[]>('/api/cli/detect');
  const items = Array.isArray(snap) ? snap : (snap?.items ?? []);
  return items.filter((i) => i.installed && i.is_claw);
};

export interface KnowledgePack {
  pack_id?: string;
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  status?: string;
  created_at?: string;
  stats?: { sources?: number; chunks?: number; bytes?: number };
}
export const getPacks = async (): Promise<KnowledgePack[]> => {
  const res = await mayGet<{ packs?: KnowledgePack[]; data?: { packs?: KnowledgePack[] } }>(
    '/api/memory-bank/packs',
  );
  return res?.packs ?? res?.data?.packs ?? [];
};

/** 一个知识包里的来源（原文件 + 切块统计），只在详情页按需取。 */
export interface PackSource {
  source_id?: string;
  filename?: string;
  source_name?: string;
  extension?: string;
  size_bytes?: number;
  ingest_status?: string;
  chunk_count?: number;
  imported_at?: string;
  is_latest?: boolean;
}
export const getPackSources = async (packId: string): Promise<PackSource[]> => {
  const res = await mayGet<{ sources?: PackSource[]; data?: { sources?: PackSource[] } }>(
    `/api/memory-bank/packs/${encodeURIComponent(packId)}/sources`,
  );
  return res?.sources ?? res?.data?.sources ?? [];
};
export const createPack = (payload: { name: string; description?: string }) =>
  request<KnowledgePack>('/api/memory-bank/packs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
export const deletePack = (packId: string) =>
  request<{ deleted?: boolean }>(`/api/memory-bank/packs/${encodeURIComponent(packId)}`, { method: 'DELETE' });
export const deletePackSource = (packId: string, sourceId: string) =>
  request<{ deleted?: boolean }>(
    `/api/memory-bank/packs/${encodeURIComponent(packId)}/sources/${encodeURIComponent(sourceId)}`,
    { method: 'DELETE' },
  );

/** 上传文件进知识包（multipart 字段名必须叫 upload，后端 formidable 只认它）。 */
export const uploadPackFile = (packId: string, file: File) => {
  const body = new FormData();
  body.append('upload', file);
  return request<KnowledgePack>(`/api/memory-bank/packs/${encodeURIComponent(packId)}/files`, {
    method: 'POST',
    body,
  });
};

/** 导入本地文件夹进知识包（后端按 checksum 幂等去重；9 号路由）。 */
export const ingestPackFolder = async (packId: string, path: string) => {
  const res = await request<{ data?: { ingested: number; deduplicated: number; skipped: number; failed: number } } & { ingested?: number }>(
    `/api/memory-bank/packs/${encodeURIComponent(packId)}/folders`,
    { method: 'POST', body: JSON.stringify({ path, recursive: true }) },
  );
  return (
    res.data ?? { ingested: res.ingested ?? 0, deduplicated: 0, skipped: 0, failed: 0 }
  );
};

/** 包内混合检索（BM25+结构；未注入 Embedder 时退化为关键词）。 */
export interface PackHit {
  source?: string;
  citation?: string;
  kind?: string;
  score?: number;
  text?: string;
  retrieval_channels?: string[];
}
export const queryPack = async (packId: string, query: string, topK = 5) => {
  const res = await request<{ data?: { hits?: PackHit[] }; hits?: PackHit[]; meta?: { rag_backend?: string } } & { meta_rag?: string }>(
    `/api/memory-bank/packs/${encodeURIComponent(packId)}/query`,
    { method: 'POST', body: JSON.stringify({ query, top_k: topK }) },
  );
  return { hits: res.data?.hits ?? res.hits ?? [], ragBackend: res.meta?.rag_backend ?? '' };
};

/** 让后端弹系统原生文件夹选择对话框（daemon 在用户本机，浏览器拿不到真实路径）。 */
export const pickNativeDir = async (): Promise<string | null> => {
  const res = await mayGet<{ path?: string; cancelled?: boolean }>(
    '/api/fs/pick-native',
  );
  const inner = (res as { data?: { path?: string; cancelled?: boolean } } | null)?.data;
  return inner?.path ?? res?.path ?? null;
};

/* ── 备忘录 ────────────────────────────────────────────────────────── */
export interface Memo {
  memo_id?: string;
  id?: string;
  title?: string;
  /** 后端字段是 note（不是 content）。 */
  note?: string;
  content?: string;
  noteText?: string;
  created_at?: string | number;
  updated_at?: string | number;
}
/** 后端只认 note；把界面的 content 归一。 */
const memoBody = (input: { title?: string; content?: string }) => ({
  title: input.title,
  note: input.content ?? '',
});
export const getMemos = () => unwrap<Memo[]>('/api/memos');
export const createMemo = (input: { title?: string; content?: string }) =>
  request<Memo>('/api/memos', { method: 'POST', body: JSON.stringify(memoBody(input)) });
export const updateMemo = (id: string, patch: { title?: string; content?: string }) =>
  request<Memo>(`/api/memos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch.content !== undefined ? { title: patch.title, note: patch.content } : { title: patch.title }),
  });
export const deleteMemo = (id: string) =>
  request<null>(`/api/memos/${encodeURIComponent(id)}`, { method: 'DELETE' });

/* ── 定时任务 ──────────────────────────────────────────────────────── */
export interface Schedule {
  schedule_id?: string;
  id?: string;
  name?: string;
  cron_expression?: string;
  start_at?: string;
  task_description?: string;
  agent_id?: string;
  enabled?: boolean;
  last_run_at?: string;
  [k: string]: unknown;
}
export const getSchedules = () => unwrap<Schedule[]>('/api/schedules');
export const deleteSchedule = (id: string) =>
  request<null>(`/api/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const toggleSchedule = (id: string, enabled: boolean) =>
  request<Schedule>(`/api/schedules/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
/** 新建定时任务（QuickSchedule 同款）：cron 周期与 start_at 一次性二选一，同时给 cron 优先。 */
export const createSchedule = (req: {
  group_id: string;
  cron_expression?: string;
  start_at?: string;
  agent_id?: string;
  task_description?: string;
  duration_min?: number;
}) => {
  const payload: Record<string, unknown> = { ...req, task_description: req.task_description ?? '' };
  // 界面字段名 → 后端契约：name→task_description 的转换在调用方做，这里只透传。
  return unwrap<Schedule>('/api/schedules', { method: 'POST', body: JSON.stringify(payload) });
};

/* ── 项目 ──────────────────────────────────────────────────────────── */
export interface ProjectBrief {
  project_id?: string;
  id?: string;
  name: string;
  sessions?: { session_id?: string; title?: string; status?: string }[];
}
export const getProjects = async (): Promise<ProjectBrief[]> => {
  const res = await mayGet<ProjectBrief[] | { data?: ProjectBrief[] }>('/api/projects');
  return Array.isArray(res) ? res : res?.data ?? [];
};

/* ── 主机面板状态 ──────────────────────────────────────────────────── */
/* 后端的 CLI 探测只有 /cli/detect 与 /cli/detect/refresh 两条：
   写 /cli 会一直 404，面板永远是「未知」——路径以 ROUTES 为唯一真源。 */
export const getCliStatus = () => mayGet<unknown>(ROUTES.cli);
export const refreshCli = () => request<unknown>(ROUTES.cliRefresh, { method: 'POST' });

/* ── 文件浏览（/api/fs/*，root 越权校验）───────────────────────────── */
export interface FsEntry {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'directory';
  size?: number;
}
export interface FsListing {
  entries: FsEntry[];
  root?: string;
  current?: string;
}
export const listDir = (dir: string) =>
  unwrap<FsListing>(`/api/fs/list?include=files&path=${encodeURIComponent(dir)}`);

/** 图片/PDF 直链（供 iframe/img 用，非 JSON）。 */
export const fileRawUrl = (filePath: string, root: string) =>
  `${API_BASE}/api/fs/raw?path=${encodeURIComponent(filePath)}&root=${encodeURIComponent(root)}`;

/** 二进制下载（xlsx/zip 等容器格式必须走 arrayBuffer，utf8 解码即损坏）。 */
export const fetchRawBinary = (url: string): Promise<ArrayBuffer> => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.arrayBuffer();
});

/** run 完成态的后续建议（Node 网关 LLM 实时生成；空数组 = 不渲染）。 */
export const fetchRunSuggestions = (runId: string) =>
  mayGet<unknown>(`/api/runs/${encodeURIComponent(runId)}/suggestions`);
