/**
 * routes/acp.ts — ACP / MCP detector REST endpoints (Story 15.23) + ACP Server
 * REST + A2A bridge（单后端迁移第三批）。
 *
 * 段 1（既有，Story 15.23）：
 *   GET  /api/acp/detect           → cached snapshot (re-scans iff cache empty)
 *   POST /api/acp/detect/refresh   → forces a fresh PATH + TCP-ping scan
 *
 * 段 2（新增，移植 Python acp_server.py 的 REST 三端点；WS /acp 端点不属于
 * REST 迁移面，single 模式无 WS transport——registry/session manager 走
 * lib/acp-registry.ts 内存单例，与 routes/agents/registry.ts 共享）：
 *   GET  /api/acp/status    → {server, connected_agents, online_agents, online_agent_ids}（裸）
 *   GET  /api/acp/sessions  → {data:[...], meta:{total}}（在线 agent 会话视图）
 *   POST /api/acp/task      → 404 SESSION_NOT_FOUND / {data:{task_id, session_id, status}}
 *
 * 段 3（新增，移植 Python a2a_bridge.py；feature flag A2A_BRIDGE_ENABLED）：
 *   GET  /.well-known/agent.json — AgentCard（disabled → 404 {"error": ...}）
 *   POST /a2a/                   — JSON-RPC 2.0（a2a_sendMessage/a2a_getTask/
 *                                  a2a_cancelTask + legacy tasks/* 别名）
 *   a2a 需要以独立 router 挂载在 app 根（不在 /api 前缀下）——导出 a2aRouter。
 *   内存任务仓与 Python 同为 ephemeral（无持久化）。
 */

import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { detectAcpAgents, getCachedAcpSnapshot } from '../../detectors/acp-detector';
import {
  acpSessions,
  getAcpRegistry,
  sendTaskToSession,
} from './infra-acp-registry';

const router = Router();

// ─── 段 1：detector（既有，保持原样） ────────────────────────────────────────

router.get('/detect', async (_req: Request, res: Response) => {
  try {
    const cached = getCachedAcpSnapshot();
    const snap = cached ?? (await detectAcpAgents(true));
    res.json(snap);
  } catch (err) {
    res.status(500).json({ error: 'detect failed', message: (err as Error).message });
  }
});

router.post('/detect/refresh', async (_req: Request, res: Response) => {
  try {
    const snap = await detectAcpAgents(true);
    res.json(snap);
  } catch (err) {
    res.status(500).json({ error: 'refresh failed', message: (err as Error).message });
  }
});

// ─── 段 2：ACP Server REST（acp_server.py 移植） ─────────────────────────────

// GET /api/acp/status — 裸对象（Python acp_status 无 envelope）
router.get('/status', (_req: Request, res: Response) => {
  const registry = getAcpRegistry();
  const online = registry.listOnline();
  res.json({
    server: 'running',
    connected_agents: acpSessions.connectedCount,
    online_agents: online.length,
    online_agent_ids: online.map((e) => e.manifest.agent_id),
  });
});

// GET /api/acp/sessions — {data, meta:{total}}；条目 = 在线 agent 的会话视图
router.get('/sessions', (_req: Request, res: Response) => {
  const registry = getAcpRegistry();
  const entries = registry.listOnline();
  const data = entries.map((e) => ({
    agent_id: e.manifest.agent_id,
    display_name: e.manifest.display_name,
    status: e.status,
    active_tasks: e.active_tasks,
    connected_at: e.connected_at,
    last_heartbeat: e.last_heartbeat,
  }));
  res.json({ data, meta: { total: data.length } });
});

// POST /api/acp/task — {session_id, instruction, context?, timeout_seconds?}
router.post('/task', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sessionId = typeof body.session_id === 'string' ? body.session_id : '';
  const instruction = typeof body.instruction === 'string' ? body.instruction : '';
  // Pydantic：session_id/instruction 必填字符串；缺/空/类型错 → 422 detail
  if (!sessionId || !instruction) {
    res.status(422).json({
      detail: [
        ...(sessionId ? [] : [{ loc: ['body', 'session_id'], msg: 'field required', type: 'value_error.missing' }]),
        ...(instruction ? [] : [{ loc: ['body', 'instruction'], msg: 'field required', type: 'value_error.missing' }]),
      ],
    });
    return;
  }
  const context =
    body.context !== undefined && body.context !== null && typeof body.context === 'object' && !Array.isArray(body.context)
      ? (body.context as Record<string, unknown>)
      : null;
  const rawTimeout = body.timeout_seconds;
  const timeoutSeconds =
    typeof rawTimeout === 'number' && Number.isFinite(rawTimeout) && rawTimeout > 0 ? Math.trunc(rawTimeout) : 300;

  const taskId = `task-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const ok = sendTaskToSession(sessionId, { task_id: taskId, instruction, context, timeout_seconds: timeoutSeconds });
  if (!ok) {
    res.status(404).json({
      error: { code: 'SESSION_NOT_FOUND', message: `Session '${sessionId}' not active` },
    });
    return;
  }
  res.json({ data: { task_id: taskId, session_id: sessionId, status: 'dispatched' } });
});

// ═════════════════════════════════════════════════════════════════════════════
// 段 3：A2A bridge（a2a_bridge.py 移植）— 独立 router 挂 app 根
// ═════════════════════════════════════════════════════════════════════════════

export const a2aRouter = Router();

const a2aEnabled = (): boolean => ['1', 'true', 'yes'].includes((process.env.A2A_BRIDGE_ENABLED ?? '').trim().toLowerCase());
const a2aRequireAuth = (): boolean => ['1', 'true', 'yes'].includes((process.env.A2A_REQUIRE_AUTH ?? '').trim().toLowerCase());

// ─── 内存任务仓（Python _tasks 同为 ephemeral） ──────────────────────────────

interface A2APart {
  type: string;
  text?: string | null;
  data?: unknown;
}

interface A2AMessage {
  messageId: string;
  role: string;
  parts: A2APart[];
  contextId?: string | null;
  taskId?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface A2ATask {
  id: string;
  contextId?: string | null;
  status: { state: string; message?: A2AMessage | null; timestamp: string };
  artifacts: Array<Record<string, unknown>>;
  history: A2AMessage[];
  metadata?: Record<string, unknown> | null;
}

const a2aTasks = new Map<string, A2ATask>();

const nowIso = () => new Date().toISOString();

/** 宽松校验入站 message（对齐 A2AMessage.model_validate 的必要面）。 */
function parseA2AMessage(raw: unknown): A2AMessage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.parts)) return null;
  const parts: A2APart[] = [];
  for (const p of o.parts) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const po = p as Record<string, unknown>;
    parts.push({
      type: typeof po.type === 'string' ? po.type : 'text',
      ...(typeof po.text === 'string' ? { text: po.text } : {}),
      ...(po.data !== undefined ? { data: po.data } : {}),
    });
  }
  return {
    messageId: typeof o.messageId === 'string' && o.messageId ? o.messageId : randomUUID().replace(/-/g, ''),
    role: typeof o.role === 'string' ? o.role : 'user',
    parts,
    ...(typeof o.contextId === 'string' ? { contextId: o.contextId } : {}),
    ...(typeof o.taskId === 'string' ? { taskId: o.taskId } : {}),
    ...(o.metadata && typeof o.metadata === 'object' && !Array.isArray(o.metadata)
      ? { metadata: o.metadata as Record<string, unknown> }
      : {}),
  };
}

function newTask(message: A2AMessage, contextId?: string | null): A2ATask {
  const taskId = `a2a-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const task: A2ATask = {
    id: taskId,
    ...(contextId || message.contextId ? { contextId: contextId || message.contextId! } : {}),
    status: { state: 'submitted', message, timestamp: nowIso() },
    artifacts: [],
    history: [message],
    ...(message.metadata ? { metadata: message.metadata } : {}),
  };
  a2aTasks.set(taskId, task);
  return task;
}

// ─── JSON-RPC helpers ────────────────────────────────────────────────────────

const rpcOk = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });

function rpcErr(id: unknown, code: number, message: string, data?: unknown) {
  const err: Record<string, unknown> = { code, message };
  if (data !== undefined && data !== null) err.data = data;
  return { jsonrpc: '2.0', id, error: err };
}

// ─── AgentCard（读 env，不硬编码 URL） ───────────────────────────────────────

function buildAgentCard(): Record<string, unknown> {
  const baseUrl = process.env.SF_BASE_URL ?? 'http://localhost:8000';
  const card: Record<string, unknown> = {
    protocolVersion: '1.0',
    name: 'ShadowFlow',
    description:
      'Multi-agent workflow orchestration platform with ACP/A2A bridging. Accepts tasks, runs them through configurable agent teams, and returns results.',
    url: `${baseUrl}/a2a/`,
    provider: {
      organization: process.env.SF_ORG_NAME ?? 'ShadowFlow',
      url: process.env.SF_ORG_URL ?? 'https://github.com/Ravenveil/ShadowFlow',
    },
    version: process.env.SF_VERSION ?? '0.3.0',
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    skills: [
      {
        id: 'workflow-run',
        name: 'Run Workflow',
        description: 'Execute a multi-agent ShadowFlow workflow given a YAML definition.',
        tags: ['orchestration', 'workflow', 'multi-agent'],
        inputModes: ['text'],
        outputModes: ['text'],
      },
      {
        id: 'chat',
        name: 'Chat Session',
        description: 'Engage in a multi-turn conversation with a ShadowFlow-managed agent.',
        tags: ['chat', 'conversation'],
        inputModes: ['text'],
        outputModes: ['text'],
      },
      {
        id: 'acp-relay',
        name: 'ACP Relay',
        description: 'Relay tasks to ACP-connected external agents registered in ShadowFlow.',
        tags: ['acp', 'relay', 'bridge'],
        inputModes: ['text'],
        outputModes: ['text'],
      },
    ],
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
  };
  const apiKey = process.env.A2A_API_KEY ?? '';
  if (a2aRequireAuth() && apiKey) {
    card.securitySchemes = { apiKey: { type: 'apiKey' } };
    card.security = [{ apiKey: [] }];
  }
  return card;
}

// ─── ACP forward（Python _forward_to_acp 的 Node 面） ────────────────────────

function forwardToAcp(task: A2ATask): void {
  task.status.state = 'working';
  const firstMessage = task.history[0];
  let instruction = '';
  if (firstMessage) {
    for (const part of firstMessage.parts) {
      if (part.type === 'text' && part.text) {
        instruction = part.text;
        break;
      }
    }
  }
  if (!instruction) {
    task.status = {
      state: 'failed',
      message: {
        messageId: randomUUID().replace(/-/g, ''),
        role: 'agent',
        parts: [{ type: 'text', text: 'No text instruction found in message.' }],
      },
      timestamp: nowIso(),
    };
    return;
  }
  // 有在线 agent 且能找到会话 → 经 session transport 下发（保持 working，异步完成）；
  // 否则 echo 完成（demo/smoke 路径，对齐 Python _complete_task_echo 兜底）。
  try {
    const online = getAcpRegistry().listOnline();
    const candidate = online[0];
    if (candidate) {
      const session = acpSessions.findByAgent(candidate.manifest.agent_id);
      if (session) {
        const dispatched = sendTaskToSession(session.session_id, {
          task_id: task.id,
          instruction,
          context: { a2a_task_id: task.id, ...(task.contextId ? { a2a_context_id: task.contextId } : {}) },
        });
        if (dispatched) return; // task remains 'working'
      }
    }
    completeTaskEcho(task, instruction);
  } catch {
    completeTaskEcho(task, instruction);
  }
}

function completeTaskEcho(task: A2ATask, instruction: string): void {
  const reply: A2AMessage = {
    messageId: randomUUID().replace(/-/g, ''),
    role: 'agent',
    parts: [
      {
        type: 'text',
        text: `[ShadowFlow A2A bridge] Received: ${JSON.stringify(instruction)}. No ACP agent available — echo mode.`,
      },
    ],
    taskId: task.id,
    ...(task.contextId ? { contextId: task.contextId } : {}),
  };
  task.status = { state: 'completed', message: reply, timestamp: nowIso() };
  task.artifacts = [{ type: 'text', content: reply.parts[0]!.text }];
  task.history.push(reply);
}

// ─── JSON-RPC method handlers ────────────────────────────────────────────────

function handleSendMessage(requestId: unknown, params: Record<string, unknown>): Record<string, unknown> {
  const rawMsg = params.message;
  if (!rawMsg) return rpcErr(requestId, -32602, 'params.message is required');
  const message = parseA2AMessage(rawMsg);
  if (!message) return rpcErr(requestId, -32602, 'Invalid message format: message.parts must be a list');
  const contextId = typeof params.contextId === 'string' ? params.contextId : undefined;
  const task = newTask(message, contextId);
  forwardToAcp(task);
  return rpcOk(requestId, JSON.parse(JSON.stringify(task)));
}

function handleGetTask(requestId: unknown, params: Record<string, unknown>): Record<string, unknown> {
  const taskId = params.taskId ?? params.id;
  if (!taskId) return rpcErr(requestId, -32602, 'params.taskId is required');
  const task = a2aTasks.get(String(taskId));
  if (!task) return rpcErr(requestId, -32001, `Task not found: ${String(taskId)}`, { taskId: String(taskId) });
  return rpcOk(requestId, JSON.parse(JSON.stringify(task)));
}

function handleCancelTask(requestId: unknown, params: Record<string, unknown>): Record<string, unknown> {
  const taskId = params.taskId ?? params.id;
  if (!taskId) return rpcErr(requestId, -32602, 'params.taskId is required');
  const task = a2aTasks.get(String(taskId));
  if (!task) return rpcErr(requestId, -32001, `Task not found: ${String(taskId)}`, { taskId: String(taskId) });
  if (['completed', 'failed', 'canceled'].includes(task.status.state)) {
    return rpcErr(requestId, -32002, `Task is already in terminal state: ${task.status.state}`, {
      taskId: String(taskId),
      state: task.status.state,
    });
  }
  task.status = { state: 'canceled', message: null, timestamp: nowIso() };
  return rpcOk(requestId, JSON.parse(JSON.stringify(task)));
}

const METHOD_HANDLERS: Record<string, (id: unknown, params: Record<string, unknown>) => Record<string, unknown>> = {
  a2a_sendMessage: handleSendMessage,
  a2a_getTask: handleGetTask,
  a2a_cancelTask: handleCancelTask,
  // Legacy names (some clients use these)
  'tasks/send': handleSendMessage,
  'tasks/get': handleGetTask,
  'tasks/cancel': handleCancelTask,
};

// ─── Endpoints ───────────────────────────────────────────────────────────────

// GET /.well-known/agent.json — disabled → 404 {"error": "A2A bridge is disabled"}
a2aRouter.get('/.well-known/agent.json', (_req: Request, res: Response) => {
  if (!a2aEnabled()) {
    res.status(404).json({ error: 'A2A bridge is disabled' });
    return;
  }
  res.json(buildAgentCard());
});

function checkInboundAuth(req: Request): boolean {
  if (!a2aRequireAuth()) return true;
  const apiKey = process.env.A2A_API_KEY ?? '';
  if (!apiKey) return false; // REQUIRE_AUTH=true 但无 key → block
  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (auth.startsWith('Bearer ')) return auth.slice(7) === apiKey;
  const xKey = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : '';
  return xKey === apiKey;
}

// POST /a2a/ — JSON-RPC 2.0 dispatch
a2aRouter.post('/a2a/', (req: Request, res: Response) => {
  if (!a2aEnabled()) {
    res.status(404).json({ error: 'A2A bridge is disabled' });
    return;
  }
  if (!checkInboundAuth(req)) {
    res.status(401).set('WWW-Authenticate', 'Bearer').json(rpcErr(null, -32001, 'Unauthorized'));
    return;
  }
  const body: unknown = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json(rpcErr(null, -32600, 'Invalid Request: body must be a JSON object'));
    return;
  }
  const o = body as Record<string, unknown>;
  const requestId = o.id;
  const method = typeof o.method === 'string' ? o.method : '';
  const params = (o.params && typeof o.params === 'object' && !Array.isArray(o.params) ? o.params : {}) as Record<string, unknown>;

  if (o.jsonrpc !== '2.0') {
    res.status(400).json(rpcErr(requestId, -32600, "Invalid Request: jsonrpc must be '2.0'"));
    return;
  }
  if (!method) {
    res.status(400).json(rpcErr(requestId, -32600, 'Invalid Request: method is required'));
    return;
  }
  const handler = METHOD_HANDLERS[method];
  if (!handler) {
    res.status(404).json(rpcErr(requestId, -32601, `Method not found: ${method}`));
    return;
  }
  try {
    res.json(handler(requestId, params));
  } catch (err) {
    res.status(500).json(rpcErr(requestId, -32603, `Internal error: ${(err as Error).message}`));
  }
});

// ─── 测试辅助：清内存任务仓 ──────────────────────────────────────────────────

export function _resetA2aTasksForTests(): void {
  a2aTasks.clear();
}

export default router;
