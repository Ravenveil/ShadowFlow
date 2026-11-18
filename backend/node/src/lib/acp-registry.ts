/**
 * acp-registry.ts — ACP Agent Registry + Session Manager 的 Node 内存单例
 * （移植自 Python backend/python/shadowflow/runtime/acp/registry.py + server.py
 * manager 的最小语义面）。
 *
 * Python 侧该 registry 是进程内单例（无磁盘持久化；REDIS_URL 分支未移植）：
 * 条目只在外部 agent 经 WebSocket 握手后出现。single 模式下没有 Python 进程、
 * 也没有 WS transport，因此本单例初始为空——/api/agents/registry* 与
 * /api/acp/* 两个路由共享同一个实例（与 Python server.py 里 get_registry()
 * 单例被两个模块共读的语义一致）。
 *
 * 移植范围（端点所需的最小面）：
 *   - register / unregister(markOffline) / markOnline / get / listAll / listOnline
 *   - refreshAgent（re-handshake 触发 → 置 offline）
 *   - increment/decrementTask（active_tasks / available_slots / busy 状态）
 *   - session manager：connected_count / findByAgent / dispatch（经注入的
 *     transport 回调；无 transport 的会话 dispatch 失败 → 上层 404）
 *
 * 未移植（端点不可达，注释留档）：心跳后台监视器（P6）、Redis TTL（D1）、
 * capability 路由 route_task + routing log（/api/agents/routing-log 归其他批次）。
 */

import { randomUUID } from 'crypto';

// ─── Manifest / Entry 数据模型（对齐 Pydantic 模型字段与默认值） ─────────────

export interface ToolCapability {
  name: string;
  description: string;
  input_schema?: Record<string, unknown> | null;
}

export interface MemoryCapability {
  type: 'stateless' | 'stateful';
  scope: 'request' | 'session' | 'persistent';
  persistence: boolean;
}

export interface AgentCapabilityManifest {
  agent_id: string;
  display_name: string;
  version: string;
  tools: ToolCapability[];
  max_concurrency: number;
  streaming: boolean;
  memory: MemoryCapability;
  protocols: string[];
  workspace_context: boolean;
}

export type RegistryStatus = 'online' | 'offline' | 'busy';

export interface AgentRegistryEntry {
  manifest: AgentCapabilityManifest;
  status: RegistryStatus;
  connected_at: string; // ISO
  last_heartbeat: string; // ISO
  active_tasks: number;
  team_memberships: string[];
  is_native: boolean;
  missed_heartbeats: number;
}

export function availableSlots(entry: AgentRegistryEntry): number {
  return Math.max(0, entry.manifest.max_concurrency - entry.active_tasks);
}

/** 测试/调用方便捷构造：缺省字段对齐 AgentCapabilityManifest Pydantic 默认值。 */
export function makeManifest(
  partial: Partial<AgentCapabilityManifest> & Pick<AgentCapabilityManifest, 'agent_id' | 'display_name'>,
): AgentCapabilityManifest {
  return {
    agent_id: partial.agent_id,
    display_name: partial.display_name,
    version: partial.version ?? 'unknown',
    tools: partial.tools ?? [],
    max_concurrency: partial.max_concurrency ?? 1,
    streaming: partial.streaming ?? false,
    memory: partial.memory ?? { type: 'stateless', scope: 'request', persistence: false },
    protocols: partial.protocols ?? ['acp-v1'],
    workspace_context: partial.workspace_context ?? false,
  };
}

const nowIso = () => new Date().toISOString();

// ─── AgentRegistry（进程内单例，与 Python get_registry() 对齐） ──────────────

export class AgentRegistry {
  private entries = new Map<string, AgentRegistryEntry>();

  register(manifest: AgentCapabilityManifest, opts: { isNative?: boolean; teamMemberships?: string[] } = {}): AgentRegistryEntry {
    const entry: AgentRegistryEntry = {
      manifest,
      status: 'online',
      connected_at: nowIso(),
      last_heartbeat: nowIso(),
      active_tasks: 0,
      team_memberships: opts.teamMemberships ?? [],
      is_native: opts.isNative ?? false,
      missed_heartbeats: 0,
    };
    this.entries.set(manifest.agent_id, entry);
    return entry;
  }

  /** unregister / mark_offline：置 offline（保留条目，Python 同语义）。 */
  markOffline(agentId: string): void {
    const entry = this.entries.get(agentId);
    if (entry) entry.status = 'offline';
  }

  markOnline(agentId: string): void {
    const entry = this.entries.get(agentId);
    if (!entry) return;
    entry.last_heartbeat = nowIso();
    entry.missed_heartbeats = 0;
    entry.status = entry.active_tasks > 0 ? 'busy' : 'online';
  }

  get(agentId: string): AgentRegistryEntry | null {
    return this.entries.get(agentId) ?? null;
  }

  listAll(): AgentRegistryEntry[] {
    return [...this.entries.values()];
  }

  /** status ∈ {online, busy}（Python list_online 同谓词）。 */
  listOnline(): AgentRegistryEntry[] {
    return this.listAll().filter((e) => e.status === 'online' || e.status === 'busy');
  }

  /** re-handshake 触发：找到置 offline 回 true；未找到回 false（上层 404）。 */
  refreshAgent(agentId: string): boolean {
    const entry = this.entries.get(agentId);
    if (!entry) return false;
    entry.status = 'offline';
    return true;
  }

  incrementTask(agentId: string): void {
    const entry = this.entries.get(agentId);
    if (!entry) return;
    entry.active_tasks += 1;
    entry.status = 'busy';
  }

  decrementTask(agentId: string): void {
    const entry = this.entries.get(agentId);
    if (!entry) return;
    entry.active_tasks = Math.max(0, entry.active_tasks - 1);
    if (entry.active_tasks === 0 && entry.status !== 'offline') entry.status = 'online';
  }
}

let _registry: AgentRegistry | null = null;

export function getAcpRegistry(): AgentRegistry {
  if (!_registry) _registry = new AgentRegistry();
  return _registry;
}

// ─── Session manager（Python server.py get_manager 的最小面） ────────────────

export interface AcpSendRequest {
  task_id: string;
  instruction: string;
  context?: Record<string, unknown> | null;
  timeout_seconds?: number;
}

export interface AcpSession {
  session_id: string;
  agent_id: string;
  connected_at: string;
  /**
   * 任务下发通道。Python 侧 send_task 经 WebSocket 推送并等回执；Node single
   * MVP 没有 WS transport——注册会话时可注入（测试用），未注入的会话下发
   * 一律失败（上层 404 SESSION_NOT_FOUND），与「会话不存在」同码。
   */
  transport?: (req: AcpSendRequest) => boolean;
}

const _sessions = new Map<string, AcpSession>();

export const acpSessions = {
  connect(session: AcpSession): void {
    _sessions.set(session.session_id, session);
  },
  disconnect(sessionId: string): void {
    _sessions.delete(sessionId);
  },
  get(sessionId: string): AcpSession | null {
    return _sessions.get(sessionId) ?? null;
  },
  get connectedCount(): number {
    return _sessions.size;
  },
  findByAgent(agentId: string): AcpSession | null {
    for (const s of _sessions.values()) {
      if (s.agent_id === agentId) return s;
    }
    return null;
  },
};

/** Python manager.send_task 对齐：会话缺失或无通道 → false。 */
export function sendTaskToSession(sessionId: string, req: AcpSendRequest): boolean {
  const session = acpSessions.get(sessionId);
  if (!session) return false;
  try {
    return session.transport ? session.transport(req) : false;
  } catch {
    return false;
  }
}

/** 测试隔离：清空 registry 与 sessions（进程内状态，无磁盘）。 */
export function _resetForTests(): void {
  _registry = null;
  _sessions.clear();
}
