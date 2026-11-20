/**
 * source.ts — 工作台**唯一的数据出入口**。
 *
 * 组件只认这里的 `WorkspaceData` / `WorkspaceSource` 契约，
 * 不直接 import 任何具体数据文件；换真后端时，改本文件底部的 `source`
 * 一行即可，Shell / ChatArea / AgentPanel / PolicyMatrix / DagFlow 全都不用动。
 *
 * 两个实现：
 *   mockSource —— 演示态，读 ./mock.ts，发消息时用 content/app.ts 的 DEMO 应答模板
 *   httpSource —— 真接口，走 fetch，路由集中在 ROUTES 里
 *
 * mock 也返回 Promise，是为了让组件的 loading / 竞态处理现在就写好，
 * 接后端时不用回头补一遍。
 */
import { DEMO } from '../content/app';
import {
  DAG_CANVAS,
  DAG_EDGES,
  DAG_NODES,
  MESSAGES,
  PANEL,
  POLICY_SEED,
  ROSTER,
  SESSIONS,
} from './mock';
import type {
  DagDataset,
  Message,
  PanelSummary,
  PolicyMatrix,
  RosterMember,
  Session,
} from './types';

/** 默认打开哪条会话（真接口接入后由路由或后端决定）。 */
export const DEFAULT_SESSION_ID = 'grp-paper';
export const DEFAULT_DM_ID = 'lead';

/** 一次加载所需的全部数据：左两栏 + 聊天 + 右栏，避免各组件各自取数的时序差。 */
export interface WorkspaceData {
  sessions: Session[];
  /** 会话 id → 消息列表。 */
  threads: Record<string, Message[]>;
  panel: PanelSummary;
  roster: RosterMember[];
  policy: PolicyMatrix;
  dag: DagDataset;
}

/** 数据源契约。所有方法异步，失败用 reject 表达，由 useWorkspace 统一兜。 */
export interface WorkspaceSource {
  readonly id: 'mock' | 'http';
  load(): Promise<WorkspaceData>;
  /** 发一条消息，resolve 出**要追加到会话尾部**的消息（自己的那条 + 对方应答）。 */
  send(sessionId: string, text: string): Promise<Message[]>;
  /** 落库策略矩阵；演示态不下发，只保留签名。 */
  savePolicy(policy: PolicyMatrix): Promise<void>;
}

/* ── mock 实现 ─────────────────────────────────────────────────────── */

/** 深拷贝，避免组件改到模块级常量（策略矩阵是会被点的）。 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function stamp(): { id: string; time: string } {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return { id: String(d.getTime()), time: `${hh}:${mm}` };
}

export const mockSource: WorkspaceSource = {
  id: 'mock',

  async load() {
    const messages = clone(MESSAGES);
    return {
      sessions: clone(SESSIONS),
      threads: {
        [DEFAULT_SESSION_ID]: messages,
        [DEFAULT_DM_ID]: messages.slice(0, 2),
      },
      panel: clone(PANEL),
      roster: ROSTER.map((m) => ({ ...m })),
      policy: Object.fromEntries(
        Object.entries(POLICY_SEED).map(([from, row]) => [from, { ...row }]),
      ),
      dag: {
        canvas: { ...DAG_CANVAS },
        nodes: DAG_NODES.map((n) => ({ ...n, layout: n.layout ? { ...n.layout } : undefined })),
        edges: DAG_EDGES.map((e) => ({ ...e })),
      },
    };
  },

  async send(_sessionId, text) {
    const { id, time } = stamp();
    return [
      { id: `u-${id}`, role: 'user', time, kind: 'text', text },
      {
        id: `m-${id}`,
        role: 'agent',
        author: DEMO.leadAuthor,
        time,
        kind: 'text',
        text: DEMO.leadReply(text),
      },
    ];
  },

  async savePolicy() {
    /* 演示态不落库。接后端后这段逻辑搬进 httpSource.savePolicy。 */
  },
};

/* ── http 实现 ─────────────────────────────────────────────────────── */

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

/** 后端路由集中在这里，换路径只改这张表。 */
const ROUTES = {
  workspace: '/api/workspace',
  messages: (sessionId: string) => `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
  policy: '/api/policy',
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const httpSource: WorkspaceSource = {
  id: 'http',
  load: () => request<WorkspaceData>(ROUTES.workspace),
  send: (sessionId, text) =>
    request<Message[]>(ROUTES.messages(sessionId), {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  savePolicy: async (policy) => {
    await request<void>(ROUTES.policy, { method: 'PUT', body: JSON.stringify(policy) });
  },
};

/* ── 唯一开关 ─────────────────────────────────────────────────────── */

/** 换后端：把这里改成 httpSource，或启动时设 VITE_WS_SOURCE=http。 */
export const source: WorkspaceSource =
  import.meta.env.VITE_WS_SOURCE === 'http' ? httpSource : mockSource;
