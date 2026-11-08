/**
 * chat-api.ts — 聊天/时间线/运行 的前端 API 层与类型契约。
 *
 * 类型对齐后端 node/src/lib/contracts.ts（S6.10-A TimelineMessage 模型）：
 *   - TimelineMessage：时间线消息判别联合（kind 分派渲染）
 *   - MessagePatch：长驻消息的流式增量补丁（applyPatch 见 message-patches.ts）
 *
 * 传输层：
 *   - apiFetch：统一加 Authorization: Bearer <token>（src/auth.ts 的
 *     getAuthSnapshot），401 抛 ApiError 并通知全局处理器（打开 AuthModal）
 *   - openSse：fetch 版 SSE 读取器（EventSource 不能带鉴权头），支持
 *     Last-Event-ID 断线补帧（?last_event_id= 查询参数 + 头），卸载即 abort
 */

import { getAuthSnapshot } from "./auth";

// ── 基础类型（contracts.ts 子集）──────────────────────────────────────────────

export type MessageKind =
  | "user_turn"
  | "thinking"
  | "assistant_meta"
  | "rationale"
  | "tool_call"
  | "tool_echo"
  | "assistant_text"
  | "raw"
  | "step_panel"
  | "diff_panel"
  | "msg_foot"
  | "status_line"
  | "plan_card"
  | "commit_record"
  | "file_diff"
  | "table_panel"
  | "image_panel"
  | "web_preview"
  | "artifact_card"
  | "verdict_card"
  | "intent"
  | "hop_card";

export interface TimelineMessageBase {
  /** 稳定 id：React key + patch 目标。 */
  id: string;
  kind: MessageKind | string;
  turn_id: string;
  /** epoch ms。 */
  ts: number;
}

export interface StepRow {
  name: string;
  status: "done" | "running" | "pending" | string;
  elapsed_ms?: number;
  substeps?: StepRow[];
}

export interface DiffLine {
  no: number;
  mark: "+" | "-" | " " | string;
  code: string;
}

export interface PlanTaskRow {
  id: string;
  title: string;
  assignee?: string;
  agent_id?: string;
  status: "pending" | "running" | "done" | "failed" | "blocked" | string;
  batch?: number;
  elapsed_ms?: number;
  note?: string;
}

export interface CommitFileEntry {
  path: string;
  status: string;
}

export interface IntentAssignment {
  agent_id: string;
  name: string;
  title: string;
}

export interface UserAttachment {
  name: string;
  path: string;
  url: string;
  is_image: boolean;
  size?: number;
}

/** 运行流式推送的完整消息（kind 判别联合；未知 kind 走兜底渲染）。 */
export type TimelineMessage = TimelineMessageBase & {
  // user_turn
  text?: string;
  attachments?: UserAttachment[];
  // thinking / assistant_text / tool_echo / raw
  label?: string;
  tokens?: number;
  preview?: string;
  body?: string;
  status?: string;
  duration_ms?: number;
  // assistant_meta
  model_brand?: string;
  model_ver?: string;
  identity?: string;
  summary?: string;
  // rationale
  bullets?: string[];
  // tool_call
  name?: string;
  args_summary?: string;
  link?: { label: string; href: string };
  result_summary?: string;
  // assistant_text / raw
  streaming?: boolean;
  sender_name?: string;
  source?: string;
  // step_panel
  total_steps?: number;
  steps?: StepRow[];
  // diff_panel / file_diff
  filename?: string;
  path?: string;
  language?: string;
  added?: number;
  removed?: number;
  lines?: DiffLine[];
  // msg_foot
  elapsed_ms?: number;
  tools?: number;
  cost_cny?: number;
  // status_line
  verb?: string;
  elapsed_s?: number;
  tools_running?: number;
  terminal?: boolean;
  // plan_card
  title?: string;
  goal?: string;
  tasks?: PlanTaskRow[];
  // commit_record
  repo?: string;
  sha?: string;
  short_sha?: string;
  message?: string;
  author?: string;
  date?: string;
  files_changed?: number;
  insertions?: number;
  deletions?: number;
  files?: CommitFileEntry[];
  url?: string;
  // table_panel
  caption?: string;
  columns?: string[];
  rows?: (string | number)[][];
  // image_panel / artifact_card
  src?: string;
  alt?: string;
  artifact_type?: string;
  note?: string;
  // verdict_card
  passed?: boolean;
  score?: number;
  max_score?: number;
  metrics?: { label: string; value: string | number; detail?: string }[];
  notes?: string[];
  // intent
  intent?: string;
  target_kind?: string;
  target_name?: string;
  reason?: string;
  assignments?: IntentAssignment[];
  // hop_card
  from_agent?: string;
  to_agent?: string;
  from_name?: string;
  to_name?: string;
  output_chars?: number;
  detail?: string;
  // 归属（群聊 fan-out 下的过程卡属于哪个 agent）
  agent_id?: string;
  agent_name?: string;
  /** 任务/运行归属（2026-11-08 任务面板）：run replay 消息带 session_id，前端按任务切片。 */
  session_id?: string;
};

/** 流式增量补丁（详见 message-patches.ts 的 applyPatch）。 */
export type MessagePatch = TimelineMessageBase & {
  op:
    | "append_step"
    | "update_step"
    | "append_substep"
    | "update_substep"
    | "thinking_append_body"
    | "thinking_finalize"
    | "tool_finalize"
    | "text_append"
    | "text_finalize"
    | "diff_append_line"
    | "msg_foot_update"
    | "plan_update_task"
    | "hop_update"
    | string;
  [key: string]: unknown;
};

export interface RunRef {
  session_id: string;
  status: string;
}

/** GET /api/run-sessions?group_id= 的任务条目（任务名=goal，状态为真实 run 状态）。 */
export interface RunSessionItem {
  session_id: string;
  goal: string;
  conversation_id: string | null;
  group_id: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface TimelineResponse {
  group_id: string;
  messages: TimelineMessage[];
  runs: RunRef[];
  truncated?: boolean;
}

export interface MessageItem {
  message_id?: string;
  sender_name?: string;
  sender_kind?: string;
  content?: string;
  timestamp?: string;
  reply_to?: string | null;
  reactions?: unknown[];
  pinned?: boolean;
  agent_id?: string | null;
  /** 用户消息附件（2026-11-07 对话框拖拽传图）。 */
  attachments?: UserAttachment[];
}

export interface GroupRecord {
  group_id: string;
  name?: string;
  agent_ids?: string[];
  kind?: string;
  conversation_id?: string | null;
  created_at?: string;
  updated_at?: string;
  messages?: MessageItem[];
  team_id?: string | null;
}

export interface AgentRecord {
  agent_id: string;
  name?: string;
  soul?: string;
  role?: string;
  status?: string;
  [key: string]: unknown;
}

export interface SfDagEdge {
  source: string;
  target: string;
  mode?: string;
  data?: { mode?: string };
}

export interface SfDagAgent {
  id: string;
  title: string;
  sub?: string;
}

export interface SfTeamDag {
  team_id?: string;
  name?: string;
  members?: string[];
  edges: SfDagEdge[];
  resolved_agents: SfDagAgent[];
  policy?: Record<string, Record<string, string>> | null;
}

export interface PendingApprovalItem {
  approval_id?: string;
  id?: string;
  gate_id?: string;
  node_id?: string;
  submitter_name?: string;
  summary?: string;
  waiting_seconds?: number;
  kind?: string;
  target?: string;
  detail?: string;
  impact?: string;
  [key: string]: unknown;
}

// ── 传输层 ───────────────────────────────────────────────────────────────────

export const SF_API_BASE: string =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE) || "";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** 注册 401 全局处理器（ProductApp 打开 AuthModal）。返回注销函数。 */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): () => void {
  unauthorizedHandler = fn;
  return () => {
    if (unauthorizedHandler === fn) unauthorizedHandler = null;
  };
}

function extractErrorMessage(body: unknown, status: number): { code: string; message: string } {
  const b = body as
    | { error?: { code?: string; message?: string } | string; detail?: unknown }
    | null
    | undefined;
  if (b && typeof b === "object") {
    const err = b.error;
    if (typeof err === "string") return { code: `HTTP_${status}`, message: err };
    if (err && typeof err === "object") {
      return {
        code: err.code || `HTTP_${status}`,
        message: err.message || `HTTP ${status}`,
      };
    }
    const detail = (b as { detail?: unknown }).detail;
    const detailErr =
      detail && typeof detail === "object" ? (detail as { error?: { code?: string; message?: string } }).error : undefined;
    if (detailErr && typeof detailErr === "object") {
      return { code: detailErr.code || `HTTP_${status}`, message: detailErr.message || `HTTP ${status}` };
    }
  }
  return { code: `HTTP_${status}`, message: `HTTP ${status}` };
}

/** 统一鉴权 fetch：Bearer 头 + 401 通知 + 结构化错误。返回原始 JSON。 */
export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  // 仅字符串 body 补 JSON 头；FormData 交给浏览器带 boundary
  if (init?.body && typeof init.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const token = getAuthSnapshot().token;
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${SF_API_BASE}${path}`, { ...init, headers });
  const body: unknown = await res.json().catch(() => null);
  if (res.status === 401) {
    unauthorizedHandler?.();
    const { code, message } = extractErrorMessage(body, res.status);
    throw new ApiError(401, code, message);
  }
  if (!res.ok) {
    const { code, message } = extractErrorMessage(body, res.status);
    throw new ApiError(res.status, code, message);
  }
  return body as T;
}

// ── SSE（fetch 版，支持鉴权头 + Last-Event-ID 补帧）───────────────────────────

export interface SseMessage {
  event: string;
  data: string;
  id?: string;
}

export interface SseOptions {
  onMessage: (msg: SseMessage) => void;
  onOpen?: () => void;
  onError?: (err: unknown) => void;
  /** 断线补帧游标（Last-Event-ID）。 */
  lastEventId?: string;
}

function parseSseFrame(frame: string): SseMessage | null {
  let event = "message";
  let id: string | undefined;
  const dataLines: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue; // 注释/keepalive
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
    else if (field === "id") id = value;
  }
  if (dataLines.length === 0 && event === "message") return null;
  return { event, data: dataLines.join("\n"), id };
}

/**
 * 打开一条 SSE 连接（fetch 流式读取）。返回 close()（abort + 停止读取）。
 * 连接断开（网络错误/服务端关闭）只回调 onError 一次；重连由调用方负责。
 */
export function openSse(path: string, options: SseOptions): () => void {
  const controller = new AbortController();
  let closed = false;
  void (async () => {
    try {
      const headers: Record<string, string> = { Accept: "text/event-stream" };
      const token = getAuthSnapshot().token;
      if (token) headers.Authorization = `Bearer ${token}`;
      const params: string[] = [];
      // SSE 鉴权双路：Bearer 头 + access_token 查询参数（后端两种都认）
      if (token) params.push(`access_token=${encodeURIComponent(token)}`);
      if (options.lastEventId != null) {
        params.push(`last_event_id=${encodeURIComponent(options.lastEventId)}`);
        headers["Last-Event-ID"] = options.lastEventId;
      }
      const url = `${SF_API_BASE}${path}${params.length ? `${path.includes("?") ? "&" : "?"}${params.join("&")}` : ""}`;
      const res = await fetch(url, { headers, signal: controller.signal, cache: "no-store" });
      if (res.status === 401) {
        unauthorizedHandler?.();
        throw new ApiError(401, "UNAUTHORIZED", "SSE 401");
      }
      if (!res.ok || !res.body) {
        throw new ApiError(res.status, `SSE_HTTP_${res.status}`, `SSE ${res.status}`);
      }
      options.onOpen?.();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sepIdx: number;
        while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          const msg = parseSseFrame(frame);
          if (msg && !closed) options.onMessage(msg);
        }
      }
    } catch (err) {
      if (!closed && !controller.signal.aborted) options.onError?.(err);
    }
  })();
  return () => {
    closed = true;
    controller.abort();
  };
}

// ── 端点封装 ─────────────────────────────────────────────────────────────────

export async function listGroups(kind: "all" | "group" | "dm" = "all"): Promise<GroupRecord[]> {
  const json = await apiFetch<{ data?: GroupRecord[]; groups?: GroupRecord[] }>(
    `/api/groups?kind=${kind}`,
  );
  const list = json?.data ?? json?.groups ?? [];
  return Array.isArray(list) ? list : [];
}

export async function createGroup(payload: {
  name: string;
  agent_ids?: string[];
  kind?: string;
  conversation_id?: string | null;
}): Promise<GroupRecord> {
  return apiFetch<GroupRecord>("/api/groups", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getTimeline(groupId: string): Promise<TimelineResponse> {
  return apiFetch<TimelineResponse>(`/api/groups/${encodeURIComponent(groupId)}/timeline`);
}

export async function postMessage(
  groupId: string,
  content: string,
  attachments?: UserAttachment[],
  opts?: { executor?: string; model?: string },
): Promise<MessageItem> {
  return apiFetch<MessageItem>(`/api/groups/${encodeURIComponent(groupId)}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content,
      sender_kind: "user",
      // 附件仅在非空时携带（2026-11-07 对话框拖拽传图）
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
      // 执行器/模型选择（2026-11-08 任务面板）：后端 "UI model picker's choice always wins"
      ...(opts?.executor ? { executor: opts.executor } : {}),
      ...(opts?.model ? { model: opts.model } : {}),
    }),
  });
}

/**
 * 任务列表：GET /api/run-sessions?group_id=（2026-11-08 任务面板）。
 * 返回该会话全部 run 任务（任务名=goal，状态为真实 run 状态）。
 */
export async function listRunSessionsByGroup(groupId: string): Promise<RunSessionItem[]> {
  const json = await apiFetch<{ sessions?: RunSessionItem[]; data?: RunSessionItem[] }>(
    `/api/run-sessions?group_id=${encodeURIComponent(groupId)}`,
  );
  const list = json?.sessions ?? json?.data ?? [];
  return Array.isArray(list) ? list : [];
}

// ── 聊天附件上传（2026-11-07 对话框拖拽传图）────────────────────────────────

/** 后端 /api/fs/chat-upload 的单文件上限（与后端守卫一致）。 */
export const CHAT_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

/** 附件直链补全：url 为相对路径（/projects/_uploads/…），拼 API base。 */
export function chatAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${SF_API_BASE}${url}`;
}

/**
 * 上传单个聊天附件：POST /api/fs/chat-upload（multipart 字段 file）。
 * 返回 UserAttachment（is_image 由文件类型推断，后端响应不含该字段）。
 */
export async function uploadChatAttachment(file: File): Promise<UserAttachment> {
  const form = new FormData();
  form.append("file", file);
  const json = await apiFetch<{ data?: { path?: string; name?: string; size?: number; url?: string } }>(
    "/api/fs/chat-upload",
    { method: "POST", body: form },
  );
  const d = json?.data;
  if (!d || typeof d.path !== "string" || typeof d.url !== "string") {
    throw new ApiError(500, "UPLOAD_BAD_RESPONSE", "上传响应缺少 path/url");
  }
  return {
    // 四字段（name/path/url/is_image）齐全：后端 coerceAttachments 缺 name/path/url 会丢弃该条，name 兜底非空
    name: (typeof d.name === "string" && d.name ? d.name : file.name) || "未命名文件",
    path: d.path,
    url: d.url,
    is_image: file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name),
    size: typeof d.size === "number" ? d.size : file.size,
  };
}

export async function stopGroup(groupId: string): Promise<{ group_id: string; stopped: boolean }> {
  return apiFetch(`/api/groups/${encodeURIComponent(groupId)}/stop`, { method: "POST" });
}

export async function listGroupMessages(groupId: string, limit = 200): Promise<MessageItem[]> {
  const json = await apiFetch<{ messages?: MessageItem[] }>(
    `/api/groups/${encodeURIComponent(groupId)}/messages?limit=${limit}`,
  );
  return Array.isArray(json?.messages) ? json.messages : [];
}

export async function resolveDm(agentId: string): Promise<{ group_id: string; agent_id: string; created: boolean }> {
  return apiFetch(`/api/chat/dm/${encodeURIComponent(agentId)}/resolve`, { method: "POST" });
}

export async function listAgents(): Promise<AgentRecord[]> {
  const json = await apiFetch<{ data?: AgentRecord[]; agents?: AgentRecord[] }>("/api/agents");
  const list = json?.data ?? json?.agents ?? [];
  if (!Array.isArray(list)) return [];
  // 只展示内置编制（Python 落库 agent）。yaml-template 是设计期模板——当前库里
  // 只有 BMAD 测试夹具（arch/dev/pm/qa），文件保留供后端测试用，但不进选择器。
  return list.filter((a) => a.source !== "yaml-template");
}

export async function listProjects(): Promise<
  Array<{ project_id: string; name: string; sessions?: unknown[]; updated_at?: string | number | null }>
> {
  // GET /api/projects 返回**裸数组**（Node projects.ts res.json(projects)）；
  // 此前只认 {data|projects} 信封 → 解包恒为 [] → 侧边栏项目树永远为空
  //（2026-11-08 修「后端有项目、前端不显示」）。两种形状都兼容。
  const json = await apiFetch<
    { data?: unknown[]; projects?: unknown[] } | unknown[]
  >("/api/projects?withSessions=1");
  const list = Array.isArray(json) ? json : (json?.data ?? json?.projects ?? []);
  return Array.isArray(list) ? (list as Array<{ project_id: string; name: string }>) : [];
}

export async function createProject(name: string): Promise<unknown> {
  return apiFetch("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
}

// ── 个人工作备忘/日程（2026-11-08）：「项目」页改造成个人备忘区 ──────────────

export type SfMemo = {
  memo_id: string;
  title: string;
  note: string;
  due_at: string | null;
  done: boolean;
  created_at: number;
  updated_at: number;
};

export async function listMemos(): Promise<SfMemo[]> {
  const json = await apiFetch<{ data?: SfMemo[] } | SfMemo[]>("/api/memos");
  const list = Array.isArray(json) ? json : (json?.data ?? []);
  return Array.isArray(list) ? list : [];
}

export async function createMemo(input: {
  title: string;
  note?: string;
  due_at?: string | null;
}): Promise<SfMemo> {
  const json = await apiFetch<{ data?: SfMemo } | SfMemo>("/api/memos", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return (Array.isArray(json) ? json[0] : (json?.data ?? json)) as SfMemo;
}

export async function updateMemo(
  memoId: string,
  patch: { title?: string; note?: string; due_at?: string | null; done?: boolean },
): Promise<SfMemo> {
  const json = await apiFetch<{ data?: SfMemo } | SfMemo>(
    `/api/memos/${encodeURIComponent(memoId)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return (Array.isArray(json) ? json[0] : (json?.data ?? json)) as SfMemo;
}

export async function deleteMemo(memoId: string): Promise<void> {
  await apiFetch(`/api/memos/${encodeURIComponent(memoId)}`, { method: "DELETE" });
}

export async function listPendingApprovals(groupId: string): Promise<PendingApprovalItem[]> {
  const json = await apiFetch<{ items?: PendingApprovalItem[] } | PendingApprovalItem[]>(
    `/api/groups/${encodeURIComponent(groupId)}/approvals/pending`,
  );
  if (Array.isArray(json)) return json;
  return Array.isArray(json?.items) ? json.items : [];
}

export async function decideApproval(
  groupId: string,
  nodeId: string,
  decision: "approve" | "reject",
): Promise<unknown> {
  return apiFetch(`/api/groups/${encodeURIComponent(groupId)}/approvals/${encodeURIComponent(nodeId)}`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

/** 群最近运行的 DAG；接口未就绪（404）→ 抛 ApiError 由调用方降级。 */
export async function getGroupDag(groupId: string): Promise<SfTeamDag> {
  return apiFetch<SfTeamDag>(`/api/groups/${encodeURIComponent(groupId)}/dag`);
}

export async function getTeams(): Promise<Array<{ team_id?: string; id?: string; name?: string }>> {
  const json = await apiFetch<{ data?: unknown[] } | unknown[]>("/api/teams");
  const list = Array.isArray(json) ? json : json?.data ?? [];
  return Array.isArray(list) ? (list as Array<{ team_id?: string }>) : [];
}

export async function getTeamDag(teamId: string): Promise<SfTeamDag> {
  return apiFetch<SfTeamDag>(`/api/teams/${encodeURIComponent(teamId)}/dag`);
}

/** 步骤级重跑（202 = full_rerun 语义，执行需前端重新下发任务）。 */
export async function retryRunStep(
  sessionId: string,
  stepIndex: number,
): Promise<{ strategy?: string; from_step?: number }> {
  return apiFetch(
    `/api/run-sessions/${encodeURIComponent(sessionId)}/steps/${stepIndex}/retry`,
    { method: "POST" },
  );
}

// ── MessageItem ↔ TimelineMessage 适配（对齐后端 chatMessagesToTimeline）──────

export function chatItemToTimeline(item: MessageItem, fallbackIndex = 0): TimelineMessage {
  const id = `chat_${item.message_id ?? `idx_${fallbackIndex}`}`;
  const parsed = item.timestamp ? Date.parse(item.timestamp) : NaN;
  const ts = Number.isFinite(parsed) ? parsed : Date.now();
  const content = typeof item.content === "string" ? item.content : "";
  const kind = item.sender_kind ?? "user";
  if (kind === "user") {
    return {
      id,
      kind: "user_turn",
      turn_id: id,
      ts,
      text: content,
      // 附件 chips（2026-11-07 对话框拖拽传图）：历史刷新不丢
      ...(item.attachments && item.attachments.length > 0 ? { attachments: item.attachments } : {}),
    };
  }
  if (kind === "agent") {
    return {
      id,
      kind: "assistant_text",
      turn_id: id,
      ts,
      body: content,
      ...(item.sender_name ? { sender_name: item.sender_name } : {}),
      ...(item.agent_id ? { agent_id: item.agent_id } : {}),
    };
  }
  return {
    id,
    kind: "raw",
    turn_id: id,
    ts,
    body: content,
    source: "chat-gateway",
    ...(item.sender_name ? { sender_name: item.sender_name } : {}),
  };
}
