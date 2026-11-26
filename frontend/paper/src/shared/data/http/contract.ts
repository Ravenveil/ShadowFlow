/**
 * contract.ts — **后端**返回的原始形状（DTO）。
 *
 * 这里只描述线上契约，不带任何业务含义；把它们变成前端类型是
 * `mappers.ts` 的事。后端改字段时：先改这里，再看映射层哪一行报错 ——
 * 组件永远感知不到（它们只认 data/types.ts）。
 *
 * 字段名保持后端原样（snake_case），不做 camelCase 转换，
 * 这样 grep 后端代码能直接对上，排查时省一次翻译。
 */

/* ── 群聊 / 会话 ───────────────────────────────────────────────────── */

export type SenderKind = 'user' | 'agent' | 'system';

export interface GroupMessageDto {
  message_id: string;
  sender_name: string;
  sender_kind: SenderKind;
  content: string;
  /** ISO-8601 */
  timestamp: string;
  reply_to?: string | null;
  reactions?: Record<string, unknown>;
  pinned?: boolean;
  /** 仅 agent 消息有（Node 侧 SSE 帧会带）。 */
  agent_id?: string;
}

export interface GroupDto {
  group_id: string;
  name: string;
  kind: 'group' | 'dm';
  agent_ids: string[];
  team_id: string | null;
  policy_matrix?: Record<string, Record<string, string>>;
  workspace_id?: string | null;
  workspace_dir?: string | null;
  announcement?: string | null;
  archived?: boolean;
  created_at: string;
  updated_at: string | null;
  /** 列表端点自带最近消息；单聊可能没有。 */
  messages?: GroupMessageDto[];
}

/* ── 智能体 ───────────────────────────────────────────────────────── */

export interface AgentDto {
  agent_id: string;
  name: string;
  /** 角色设定全文（第一个非空行当角色摘要用）。 */
  soul: string;
  status: 'idle' | 'running' | 'paused' | 'error';
  workspace_id?: string;
  blueprint?: Record<string, unknown>;
}

/* ── 团队 / 工作流 / 策略 ─────────────────────────────────────────── */

/** 画布节点是「存储形」，前端画布怎么写就怎么存 —— 映射层做防御式读取。 */
export interface WorkflowDto {
  nodes: unknown[];
  edges: unknown[];
}

export interface TeamDto {
  team_id: string;
  name: string;
  agent_ids?: string[];
  policy_matrix?: Record<string, Record<string, string>>;
  workflow?: WorkflowDto;
}

/* ── 设置 ─────────────────────────────────────────────────────────── */

export interface ByokProviderDto {
  /** 已打码（`••••uyWH`）；未配置是空串。 */
  apiKey: string;
  baseUrl: string;
  models: string[];
  enabled: boolean;
  syncedModels?: string[];
  manualModels?: string[];
  /** openai / anthropic / …，决定图标与分组文案。 */
  type?: string;
}

export interface ByokDto {
  providers: Record<string, ByokProviderDto>;
}

export interface CliItemDto {
  id: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  install_cmd?: string;
  auth_hint?: string;
  /** true = 安装命令可自动执行；false = copy-only。 */
  installable?: boolean;
  /** true = 有结构化卸载规格，可自动卸载。 */
  uninstallable?: boolean;
  /** 手动卸载引导（不可自动卸载时展示）。 */
  uninstall_cmd?: string;
  /** ClawHub 门面标记。 */
  is_claw?: boolean;
  description?: string;
  category?: string;
  /** 官网 / 文档链接。 */
  homepage?: string;
}

export interface CliDetectDto {
  scanned_at: string;
  items: CliItemDto[];
}

export interface SshConfigDto {
  host: string;
  port: number;
  user: string;
  /** 后端只回打码路径。 */
  keyPathMasked: string;
  remoteDir: string;
}

export interface SshConfigEnvelopeDto {
  configured: boolean;
  config: SshConfigDto | null;
}

/** POST /api/remote-exec/test 的结果（data 里）。 */
export interface SshTestDto {
  ok: boolean;
  code?: string;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/* ── 知识包（多模态记忆库） ───────────────────────────────────────── */

export interface KnowledgePackDto {
  pack_id?: string;
  id?: string;
  name: string;
  description?: string;
  desc?: string;
  doc_count?: number;
  docs?: number | unknown[];
}

/* ── 文件系统（产物 tab） ─────────────────────────────────────────── */

/**
 * `GET /api/fs/list?path=<abs>&include=files` 的条目。
 * `size` / `mtime` / `ext` 只在文件项上有（后端只对文件填）。
 */
export interface FsEntryDto {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  mtime?: number;
  ext?: string;
}

export interface FsListDto {
  path: string;
  /** 上一级绝对路径；到盘符根时为 'ROOT' 哨兵或 null。 */
  parent: string | null;
  isRoot?: boolean;
  entries: FsEntryDto[];
  /** 单目录文件数超过后端上限（500）时置真。 */
  truncated?: boolean;
}

/** `GET /api/fs/read?path=&root=` 的 data。 */
export interface FsReadDto {
  content: string;
  size: number;
  truncated: boolean;
}

/* ── SSE 帧 ───────────────────────────────────────────────────────── */

/** `event: agent.message | system.notice | agent.typing` 的 data。 */
export interface GroupEventDto {
  type?: string;
  content?: string;
  sender_name?: string;
  sender_kind?: SenderKind;
  message_id?: string;
  timestamp?: string;
  agent_id?: string;
}

/* ── 单聊解析 / 项目树 ───────────────────────────────────────────── */

/** `POST /api/chat/dm/:agent_id/resolve` 的返回（裸，无 data 信封）。 */
export interface DmResolveDto {
  group_id: string;
  agent_id: string;
  created: boolean;
}

/** `GET /api/projects?withSessions=1` 的项目项。 */
export interface ProjectDto {
  project_id: string;
  id?: string;
  name?: string;
  workspace_path?: string;
  sessions?: Array<{ session_id?: string; status?: string; title?: string }>;
}
