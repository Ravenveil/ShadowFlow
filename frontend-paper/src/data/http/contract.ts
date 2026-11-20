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
