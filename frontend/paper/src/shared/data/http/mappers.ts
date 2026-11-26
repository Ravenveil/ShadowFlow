/**
 * mappers.ts — 后端 DTO → 前端类型。**纯函数，不碰网络也不碰 DOM。**
 *
 * 这层的价值：后端字段怎么变，坏在这一层，组件永远只认 `data/types.ts`。
 * 每一处「后端没给」都显式兜底（空数组 / 空串 / 缺省值），
 * 不让 `undefined` 漏进界面 —— 空白比错误更难排查。
 */
import { ROSTER_MISSING } from '@/shared/content/app';
import { CLI_LABEL, PROVIDER_LABEL } from '@/shared/content/settings';
import { isTone, TONE_NAMES, type ToneName } from '@/shared/theme/tones';
import { SETTINGS_SEED } from '@/shared/data/defaults';
import type {
  AppSettings,
  ArtifactEntry,
  ArtifactListing,
  CliProbe,
  ComposerData,
  DagDataset,
  DagEdgeDef,
  DagNodeDef,
  Message,
  PanelSummary,
  PolicyMatrix,
  PolicyState,
  ProviderSetting,
  RosterMember,
  Session,
  SshHost,
  TimelineAttachment,
  TimelineDiffLine,
  TimelineMessage,
  TimelinePlanTask,
  TimelineSnapshot,
  TimelineStep,
} from '@/shared/data/types';
import type {
  AgentDto,
  ByokDto,
  ByokProviderDto,
  CliDetectDto,
  FsListDto,
  GroupDto,
  GroupMessageDto,
  KnowledgePackDto,
  SshConfigDto,
  WorkflowDto,
} from '@/shared/data/http/contract';

/* ── 小工具 ───────────────────────────────────────────────────────── */

/** 容错读取：后端字段名在历史上有好几种写法，这里一次收敛。 */
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function pick<T>(...vals: (T | undefined | null)[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return undefined;
}

/** 相对时间（会话列表用：「12 分钟前」）。 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  if (diff < 0) return '刚刚';
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  const d = new Date(t);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ISO → HH:mm（气泡右上角时间）。 */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 头像行头用的短名：优先中文前两字，其次英文首字母缩写。 */
export function shortName(role: string): string {
  const cjk = role.match(/[\u4e00-\u9fa5]+/g);
  if (cjk?.length) return cjk.join('').slice(0, 2);
  const latin = role.match(/[A-Za-z]+/g);
  if (latin?.length) {
    const initials = latin.map((w) => w[0]).join('').toUpperCase();
    return initials.length > 3 ? initials.slice(0, 3) : initials;
  }
  return role.slice(0, 2);
}

/** soul 的第一个非空行（agent 的角色摘要）。 */
function firstLine(soul: string | undefined): string {
  const line = (soul ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('【'));
  return line ?? '';
}

/* ── 会话与消息 ───────────────────────────────────────────────────── */

export type AgentName = (agentId: string) => string;

export function toSession(group: GroupDto, nameOf: AgentName): Session {
  const isDm = group.kind === 'dm';
  const first = group.agent_ids?.[0] ?? '';
  const dmName = nameOf(first);
  // 单聊的 name 往往就是 agent id（`arch`），有真名就用真名。
  const rawTitle = str(group.name).trim();
  const title = isDm && (!rawTitle || rawTitle === first) ? dmName || rawTitle : rawTitle;
  const updated = pick(group.updated_at, group.created_at) ?? '';
  const age = Date.parse(updated);
  const fresh = Number.isFinite(age) && Date.now() - age < 3_600_000;

  return {
    id: group.group_id,
    title: title || group.group_id.slice(0, 8),
    kind: isDm ? 'dm' : 'group',
    members: (group.agent_ids ?? []).map(nameOf),
    updatedAt: relativeTime(updated),
    status: fresh ? 'active' : 'idle',
  };
}

export function toMessage(dto: GroupMessageDto, nameOf: AgentName): Message {
  const role = dto.sender_kind === 'agent' ? 'agent' : dto.sender_kind === 'system' ? 'system' : 'user';
  const author =
    role === 'agent' ? nameOf(dto.agent_id ?? '') || str(dto.sender_name) : undefined;

  return {
    id: dto.message_id,
    role,
    author: author || undefined,
    time: clockTime(dto.timestamp),
    kind: 'text',
    text: str(dto.content),
    // 后端按裸 message_id 存 reply_to；原文透传，发送端剥 chat_ 前缀后回填。
    replyTo: str(dto.reply_to) || undefined,
  };
}

/** 一条会话的完整消息（后端列表端点自带，切会话不用二次请求）。 */
export function toThread(group: GroupDto, nameOf: AgentName): Message[] {
  return (group.messages ?? []).map((m) => toMessage(m, nameOf));
}

/** SSE 帧 → 消息；认不出的帧返回 null（typing 之类不该进消息流）。 */
export function frameToMessage(
  type: string,
  data: unknown,
  nameOf: AgentName,
): Message | null {
  if (type !== 'agent.message' && type !== 'system.notice') return null;
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const id = str(d.message_id);
  const content = str(d.content);
  if (!id || !content) return null;
  return toMessage(
    {
      message_id: id,
      sender_name: str(d.sender_name) || (type === 'system.notice' ? 'system' : 'agent'),
      sender_kind: type === 'system.notice' ? 'system' : 'agent',
      content,
      timestamp: str(d.timestamp) || new Date().toISOString(),
      agent_id: str(d.agent_id) || undefined,
      reply_to: str(d.reply_to) || undefined,
    },
    nameOf,
  );
}

/* ── 编队（roster） ───────────────────────────────────────────────── */

/**
 * 名册只需要「id / 名字 / 灵魂 / 状态」四件事：群接口给的是完整 AgentDto，
 * 团队页拿到的是 /api/agents 的精简形，两种都能进来。
 */
type AgentLike = Pick<AgentDto, 'agent_id' | 'name'> & { soul?: string; status?: string };

function buildRoster(agents: AgentLike[], ids: string[]): RosterMember[] {
  const byId = new Map(agents.map((a) => [a.agent_id, a]));
  return ids.map((id) => {
    const a = byId.get(id);
    // 群引用的成员可能已被删除：这时候别把 agent id 的十六进制当名字显示
    const missing = !a;
    const name = a?.name?.trim() || ROSTER_MISSING.name(id.slice(-4));
    // 「Analyst · 结果分析」→ 角色取后半段；没有分隔符就用 soul 首行。
    const [, tail] = name.split('·').map((s) => s.trim());
    const role = missing ? ROSTER_MISSING.role : tail || firstLine(a?.soul) || name;
    return {
      id,
      name,
      role: role.slice(0, 16),
      short: missing ? id.slice(-4) : shortName(role),
      state: a?.status === 'running' ? 'busy' : 'idle',
    };
  });
}

export function toRoster(agents: AgentLike[], group?: GroupDto | null): RosterMember[] {
  const ids = group?.agent_ids?.length ? group.agent_ids : agents.map((a) => a.agent_id);
  return buildRoster(agents, ids);
}

/** 团队页按团队自己的成员 id 取名册（与任何群无关）。 */
export function rosterOfIds(agents: AgentLike[], ids: string[]): RosterMember[] {
  return buildRoster(agents, ids);
}

/* ── 策略矩阵 / 工作流 DAG ────────────────────────────────────────── */

const POLICY_STATES: readonly PolicyState[] = ['permit', 'warn', 'deny'];

export function toPolicy(matrix?: Record<string, Record<string, string>> | null): PolicyMatrix {
  const out: PolicyMatrix = {};
  for (const [from, row] of Object.entries(matrix ?? {})) {
    if (!row || typeof row !== 'object') continue;
    const clean: Record<string, PolicyState> = {};
    for (const [to, raw] of Object.entries(row)) {
      if (POLICY_STATES.includes(raw as PolicyState)) clean[to] = raw as PolicyState;
    }
    if (Object.keys(clean).length) out[from] = clean;
  }
  return out;
}

/*
 * 存图坐标是「画布自由布局」（ReactFlow 里能拖到 1600 宽），右栏只有 300 出头。
 * 原样塞进去会被 viewBox 整体缩小 —— 节点变成小色块、字糊成两三个像素。
 * 所以这里做一次**列压缩**：把 x 相近的节点归成一列，列内按 y 排序等距排，
 * 列宽按画布平均分；拓扑（谁接谁、并行分支）完全不变，只是把间距收紧。
 */
/**
 * 布局参数。同一套压缩算法服务两种容器：
 *   右栏 300 出头 → 窄画布、小节点；工作台子页接近 1000 → 宽画布、大节点。
 * 设计坐标 ≈ 容器像素，组件里的百分比定位才不会把节点缩放成色块。
 */
export interface DagDesign {
  /** 设计画布宽（应接近容器实际渲染宽度）。 */
  w: number;
  pad: number;
  gapX: number;
  nodeH: number;
  gapY: number;
  /** 最多几列；超出按最后列堆叠。 */
  maxCols: number;
  /** 一个坐标都没有时的兜底画布高度。 */
  minH: number;
}

/** 右栏用的紧凑布局（容器 ~308px）。 */
export const PANEL_DAG: DagDesign = { w: 308, pad: 12, gapX: 10, nodeH: 40, gapY: 18, maxCols: 3, minH: 348 };

/** 工作台子页用的宽布局（容器 ~960px，行距更大以便辨认）。 */
export const PAGE_DAG: DagDesign = { w: 960, pad: 20, gapX: 40, nodeH: 52, gapY: 38, maxCols: 3, minH: 220 };

/** 整页图里节点宽上限：一行只有一个节点时，别拉成整行横条。 */
const MAX_NODE_W = 300;

/** 两个 x 差多少以内算同一列。 */
const COL_TOLERANCE = 48;

interface Parsed {
  node: DagNodeDef;
  x?: number;
  y?: number;
}

/** 列压缩：返回每个节点在设计坐标里的位置 + 画布高度。 */
function compactLayout(
  parsed: Parsed[],
  design: DagDesign,
): { boxes: Map<string, { x: number; y: number; w: number; h: number }>; h: number } {
  const { w: DESIGN_W, pad: PAD, gapX: GAP_X, nodeH: NODE_H, gapY: GAP_Y } = design;
  const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  const positioned = parsed.filter((p) => p.x !== undefined && p.y !== undefined);
  if (!positioned.length) return { boxes, h: design.minH };

  const xs = [...new Set(positioned.map((p) => p.x as number))].sort((a, b) => a - b);
  const colStarts: number[] = [];
  for (const x of xs) {
    const last = colStarts[colStarts.length - 1];
    if (last === undefined || x - last > COL_TOLERANCE) colStarts.push(x);
  }
  const colOf = (x: number): number => {
    let idx = 0;
    colStarts.forEach((start, i) => {
      if (x >= start) idx = i;
    });
    return idx;
  };

  const cols = Math.min(colStarts.length, design.maxCols);
  const colW = Math.floor((DESIGN_W - PAD * 2 - GAP_X * (cols - 1)) / cols);
  const rowsInCol: number[] = new Array(cols).fill(0);
  let maxRows = 0;

  // 按原 y 排序，保证同列内上下关系不变
  for (const p of [...positioned].sort((a, b) => (a.y as number) - (b.y as number))) {
    const col = Math.min(colOf(p.x as number), cols - 1);
    const row = rowsInCol[col]++;
    maxRows = Math.max(maxRows, rowsInCol[col]);
    boxes.set(p.node.id, {
      x: PAD + col * (colW + GAP_X),
      y: PAD + row * (NODE_H + GAP_Y),
      w: colW,
      h: NODE_H,
    });
  }

  return { boxes, h: PAD * 2 + maxRows * (NODE_H + GAP_Y) - GAP_Y };
}

/**
 * 画布节点是存储形（ReactFlow 风格），这里只取画得出来的部分。
 * `design` 决定压到多宽的画布上：右栏用 PANEL_DAG，子页用 PAGE_DAG。
 */
export function toDag(
  workflow: WorkflowDto | null | undefined,
  roster: RosterMember[],
  design: DagDesign = PANEL_DAG,
): DagDataset {
  const roleOf = new Map(roster.map((m) => [m.id, m]));
  const parsed: Parsed[] = [];

  for (const raw of workflow?.nodes ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const n = raw as Record<string, unknown>;
    const id = str(n.id);
    if (!id) continue;
    const data = (n.data && typeof n.data === 'object' ? n.data : {}) as Record<string, unknown>;
    const owner = str(pick(data.agentId, n.agentId, data.agent_id, n.agent_id));
    const rawLabel = str(pick(data.label, n.label, data.name, n.name));
    // 「Researcher · 文献侦察」在窄节点里只剩「R · …」；有中文角色名就只用角色名
    const tail = rawLabel.includes('·') ? rawLabel.split('·').pop()?.trim() : '';
    const label = tail || rawLabel || roleOf.get(owner)?.role || id;
    // 第二行优先用画布上写的职责短语（模板会带），否则回落成员角色；
    // 与标题重复就不写，免得节点里同一句话出现两遍。
    const sub = str(data.role) || roleOf.get(owner)?.role || '';
    const pos = (n.position && typeof n.position === 'object' ? n.position : null) as
      | Record<string, unknown>
      | null;

    parsed.push({
      node: {
        id,
        label,
        owner: owner || 'lead',
        role: sub === label ? '' : sub,
        // 静态存图没有运行态；真正在跑的状态由 SSE 帧更新（后续接）。
        status: 'wait',
      },
      x: typeof pos?.x === 'number' ? pos.x : undefined,
      y: typeof pos?.y === 'number' ? pos.y : undefined,
    });
  }

  const { boxes, h } = compactLayout(parsed, design);
  const nodes = parsed.map((p) => ({
    ...p.node,
    layout: boxes.get(p.node.id),
  }));

  const edges: DagEdgeDef[] = [];
  for (const raw of workflow?.edges ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    const from = str(pick(e.source, e.from));
    const to = str(pick(e.target, e.to));
    if (!from || !to) continue;
    const data = (e.data && typeof e.data === 'object' ? e.data : {}) as Record<string, unknown>;
    const modeRaw = str(pick(data.mode, e.mode));
    const mode: DagEdgeDef['mode'] =
      modeRaw === 'approve' || modeRaw === 'conditional' ? modeRaw : 'direct';
    const label = str(pick(data.label, e.label)) || undefined;
    edges.push({ from, to, mode, label });
  }

  return {
    canvas: { w: design.w, h: Math.max(design.minH, Math.ceil(h)) },
    nodes,
    edges,
  };
}

/**
 * 没有坐标信息的图（内置模板、手写 yaml）按**拓扑分层**排：
 * 层的序号 = 从根走到它最长的步数，于是「串行主线」上下成列、
 * 「并行分支」并排在同一行 —— 连线只会往下走，不会横穿节点。
 */
export function flowLayout(dag: DagDataset, design: DagDesign = PAGE_DAG): DagDataset {
  if (dag.nodes.some((n) => n.layout) || dag.nodes.length === 0) return dag;

  const rank = new Map<string, number>(dag.nodes.map((n) => [n.id, 0]));
  const next = new Map<string, string[]>(dag.nodes.map((n) => [n.id, []]));
  const indeg = new Map<string, number>(dag.nodes.map((n) => [n.id, 0]));
  for (const e of dag.edges) {
    if (!next.has(e.from) || !next.has(e.to)) continue;
    next.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }

  // 从入度为 0 的节点一层层往下推；每层只算一次，环不会死循环。
  let frontier = dag.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const reached = new Set(frontier);
  while (frontier.length) {
    const following: string[] = [];
    for (const id of frontier) {
      for (const to of next.get(id) ?? []) {
        rank.set(to, Math.max(rank.get(to) ?? 0, (rank.get(id) ?? 0) + 1));
        if (!reached.has(to)) {
          reached.add(to);
          following.push(to);
        }
      }
    }
    frontier = following;
  }
  // 只出现在环里、从根走不到的节点：统一落到末尾一行，不丢节点
  const sink = Math.max(0, ...rank.values()) + 1;
  for (const n of dag.nodes) if (!reached.has(n.id)) rank.set(n.id, sink);

  const rows = new Map<number, string[]>();
  for (const n of dag.nodes) {
    const r = rank.get(n.id) ?? 0;
    rows.set(r, [...(rows.get(r) ?? []), n.id]);
  }
  const order = [...rows.keys()].sort((a, b) => a - b);
  const cols = Math.max(...order.map((r) => rows.get(r)!.length));

  const { w: W, pad: PAD, gapX: GAP_X, nodeH: NODE_H, gapY: GAP_Y } = design;
  // 节点宽度设上限：一行一个节点时不该拉成整行宽的横条
  const slot = Math.min(MAX_NODE_W, Math.floor((W - PAD * 2 - GAP_X * (cols - 1)) / cols));

  const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  order.forEach((r, row) => {
    const ids = rows.get(r)!;
    const total = ids.length * slot + (ids.length - 1) * GAP_X;
    const left = Math.round((W - total) / 2);
    ids.forEach((id, i) => {
      boxes.set(id, {
        x: left + i * (slot + GAP_X),
        y: PAD + row * (NODE_H + GAP_Y),
        w: slot,
        h: NODE_H,
      });
    });
  });

  const h = PAD * 2 + order.length * NODE_H + (order.length - 1) * GAP_Y;
  return {
    ...dag,
    nodes: dag.nodes.map((n) => ({ ...n, layout: boxes.get(n.id) })),
    canvas: { w: W, h: Math.max(design.minH, h) },
  };
}

/* ── 右栏「执行」摘要 ─────────────────────────────────────────────── */

/**
 * 执行摘要只能给后端真有的东西：
 *   - 标题 = 最近一条用户指令
 *   - 步骤 = 最近几条 agent 交付（谁在什么时候交了东西）
 *   - 用量 / 时长 = 后端暂未按会话暴露 → 0，界面据此显示「—」
 * 不猜、不编，空白就是空白。
 */
export function toPanel(
  group: GroupDto | null,
  roster: RosterMember[],
  thread: Message[],
  pendingApproval?: { nodeId: string },
): PanelSummary {
  const userLines = thread.filter((m) => m.role === 'user');
  const lastUser = userLines[userLines.length - 1]?.text ?? '';
  const agentLines = thread.filter((m) => m.role === 'agent').slice(-5);

  return {
    runTitle: (lastUser || group?.name || '—').slice(0, 28),
    elapsed: '',
    contextPct: 0,
    tokensUsed: 0,
    tokensCap: 0,
    steps: agentLines.map((m) => ({
      label: (m.text ?? '').replace(/\s+/g, ' ').slice(0, 24) || '已交付',
      done: true,
      agent: m.author ?? '',
    })),
    artifacts: [],
    subAgents: roster.slice(0, 6).map((m) => ({
      name: m.name,
      state: m.state === 'busy' ? 'busy' : 'ready',
    })),
    // 挂起审批门：nodeId 到手才给（有它界面才出「批准 / 拒绝」按钮）
    approval: pendingApproval
      ? {
          gate: '1 道审批门',
          note: '工作流被审批边挡住，等人工放行',
          nodeId: pendingApproval.nodeId,
        }
      : undefined,
  };
}

/* ── DAG 运行态投影（链路可解释） ────────────────────────────────── */

/** 交付摘录截到这么长：够辨认干了什么，又不把页脚撑成一段文章。 */
const DETAIL_EXCERPT = 64;

/**
 * 把会话流里的真实动静投影到存图节点上 —— 存图是静态的（全是 wait），
 * 链路可解释靠这一步：节点亮不亮、最近交付了什么，都有据可查：
 *   - 该成员在会话流里交过话     → done + 交付摘录
 *   - 该成员当前 busy（roster）   → running
 *   - 其余                        → wait
 * 不猜阶段编号、不编进度 —— 空白就是空白。
 */
export function applyRunState(
  dag: DagDataset,
  roster: RosterMember[],
  thread: Message[],
): DagDataset {
  const agentLines = thread.filter((m) => m.role === 'agent');
  const lastLineOf = new Map<string, Message>();
  for (const m of agentLines) {
    const key = m.author ?? '';
    if (key) lastLineOf.set(key, m);
  }
  const nameOf = new Map(roster.map((r) => [r.id, r.name]));

  return {
    ...dag,
    nodes: dag.nodes.map((n) => {
      const ownerName = nameOf.get(n.owner) ?? n.owner;
      const last = lastLineOf.get(ownerName);
      if (last) {
        return {
          ...n,
          status: 'done' as const,
          detail:
            (last.text ?? '').replace(/\s+/g, ' ').slice(0, DETAIL_EXCERPT) || undefined,
        };
      }
      const busy = roster.find((r) => r.id === n.owner)?.state === 'busy';
      return { ...n, status: busy ? ('running' as const) : ('wait' as const) };
    }),
  };
}

/* ── 产物（会话工作目录） ─────────────────────────────────────────── */

/**
 * 目录列举 → 界面类型。
 *
 * 后端只给文件项带 size / mtime / ext，这里统一补 0 / ''，让组件不必判
 * undefined；目录排前面（否则一层没几个文件的目录会被文件压到看不见）。
 */
export function toArtifactListing(
  dto: FsListDto | null,
  root: string,
  fallbackDir: string,
): ArtifactListing {
  const entries: ArtifactEntry[] = (dto?.entries ?? [])
    .map((e) => ({
      name: str(e.name),
      path: str(e.path),
      isDir: !!e.isDir,
      size: typeof e.size === 'number' ? e.size : 0,
      mtime: typeof e.mtime === 'number' ? e.mtime : 0,
      ext: str(e.ext).toLowerCase(),
    }))
    .filter((e) => e.name && e.path);

  entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));

  return {
    root,
    dir: str(dto?.path) || fallbackDir,
    // 哨兵 'ROOT'（盘符列表）在产物语境里没有意义：当作「没有上一级」
    parent: dto?.parent && dto.parent !== 'ROOT' ? dto.parent : null,
    entries,
  };
}

/* ── 会话时间线 ───────────────────────────────────────────────────── */

/**
 * 时间线的每一项**字段很多但意义直白**（思考有 body、工具卡有 args_summary），
 * 逐字段改名只多一层永远会漏的翻译，所以这里不做 camelCase，只做三件事：
 *   1. 丢掉残帧（没有 id / kind 的对象不能当 key 用）
 *   2. 保证 id / kind / turn_id / ts 一定存在（顺序、key、分组都靠它们）
 *   3. 把「后端可能给 null / 给字符串数字」的数值字段收敛成 number
 * 其余字段原样透传：渲染器认识就用，不认识就不画。
 */
function numOf(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function arrOf<T>(v: unknown, map: (item: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const item of v) {
    const mapped = map(item);
    if (mapped) out.push(mapped);
  }
  return out;
}

function toStep(raw: unknown): TimelineStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const name = str(s.name);
  if (!name) return null;
  const statusRaw = str(s.status);
  const status: TimelineStep['status'] =
    statusRaw === 'done' || statusRaw === 'running' ? statusRaw : 'pending';
  return {
    name,
    status,
    elapsed_ms: numOf(s.elapsed_ms),
    substeps: arrOf(s.substeps, toStep),
  };
}

function toDiffLine(raw: unknown): TimelineDiffLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  const mark = str(l.mark);
  return {
    no: numOf(l.no) ?? 0,
    mark: mark === '+' || mark === '-' ? mark : ' ',
    code: str(l.code),
  };
}

function toPlanTask(raw: unknown): TimelinePlanTask | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const id = str(t.id);
  const title = str(t.title);
  if (!id) return null;
  const statusRaw = str(t.status);
  const status: TimelinePlanTask['status'] =
    statusRaw === 'running' || statusRaw === 'done' || statusRaw === 'failed' || statusRaw === 'blocked'
      ? statusRaw
      : 'pending';
  return {
    id,
    title: title || id,
    assignee: str(t.assignee) || undefined,
    agent_id: str(t.agent_id) || undefined,
    status,
    batch: numOf(t.batch),
    elapsed_ms: numOf(t.elapsed_ms),
    note: str(t.note) || undefined,
  };
}

function toAttachment(raw: unknown): TimelineAttachment | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const path = str(a.path) || str(a.url) || str(a.name);
  if (!path) return null;
  return {
    name: str(a.name) || path.slice(path.lastIndexOf('/') + 1),
    path,
    url: str(a.url),
    is_image: a.is_image === true,
    size: numOf(a.size),
  };
}

/** 一格时间线；残帧（没有 id 或 kind）返回 null。 */
export function toTimelineMessage(raw: unknown): TimelineMessage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  const id = str(m.id);
  const kind = str(m.kind);
  if (!id || !kind) return null;

  const msg: TimelineMessage = {
    ...(raw as unknown as TimelineMessage),
    id,
    kind,
    // ts 缺失时给 0：排序时落最前，而不是让整个列表塌成 NaN
    turn_id: str(m.turn_id) || id,
    ts: numOf(m.ts) ?? 0,
  };

  // 结构化负载逐项清洗（后端给 null / 缺字段时渲染器拿不到数组会崩）
  if (m.steps !== undefined) msg.steps = arrOf(m.steps, toStep);
  if (m.lines !== undefined) msg.lines = arrOf(m.lines, toDiffLine);
  if (m.tasks !== undefined) msg.tasks = arrOf(m.tasks, toPlanTask);
  if (m.attachments !== undefined) msg.attachments = arrOf(m.attachments, toAttachment);
  if (m.columns !== undefined) {
    msg.columns = Array.isArray(m.columns)
      ? m.columns.map((c) => (typeof c === 'number' ? String(c) : str(c)))
      : [];
  }
  if (m.rows !== undefined) {
    msg.rows = Array.isArray(m.rows)
      ? m.rows.map((r) =>
          Array.isArray(r) ? r.map((cell) => (typeof cell === 'number' ? cell : str(cell))) : [],
        )
      : [];
  }
  return msg;
}

/** timeline 回包 → 快照。`messages` 按 ts 升序（后端已排好，这里再兜一次）。 */
export function toTimelineSnapshot(raw: unknown): TimelineSnapshot {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const messages = arrOf(o.messages, toTimelineMessage).sort((a, b) => a.ts - b.ts);
  const runs = arrOf(o.runs, (item) => {
    if (!item || typeof item !== 'object') return null;
    const r = item as Record<string, unknown>;
    const sessionId = str(r.session_id);
    return sessionId ? { sessionId, status: str(r.status) || 'idle' } : null;
  });
  return { messages, runs, truncated: o.truncated === true };
}

/**
 * 群事件帧 → 时间线一格。
 *
 * id 必须与后端 `chatMessagesToTimeline` 同构（`chat_<message_id>`）：
 * 时间线回包里的聊天消息由它生成，推送帧若用别的 id，同一条回复会在
 * 「推送到的」与「轮询到的」之间渲染两遍。
 */
export function frameToTimeline(type: string, data: unknown): TimelineMessage | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const messageId = str(d.message_id);
  const content = str(d.content);
  if (!messageId || !content) return null;

  const parsed = Date.parse(str(d.timestamp));
  const ts = Number.isFinite(parsed) ? parsed : Date.now();
  const id = `chat_${messageId}`;
  const senderName = str(d.sender_name) || (type === 'system.notice' ? 'system' : 'agent');

  if (type === 'system.notice') {
    return { id, kind: 'raw', turn_id: id, ts, body: content, source: 'chat-gateway', sender_name: senderName };
  }
  if (type !== 'agent.message') return null;
  return {
    id,
    kind: 'assistant_text',
    turn_id: id,
    ts,
    body: content,
    sender_name: senderName,
    agent_id: str(d.agent_id) || undefined,
  };
}

/* ── 输入框资源 ───────────────────────────────────────────────────── */

const TONES: readonly ToneName[] = TONE_NAMES;

export function providerName(id: string): { name: string; vendor: string; tone: ToneName } {
  const hit = PROVIDER_LABEL[id];
  return {
    name: hit?.name ?? id,
    vendor: hit?.vendor ?? id,
    tone: isTone(hit?.tone) ? hit.tone : 'slate',
  };
}

export function toComposer(
  byok: ByokDto | null,
  cli: CliDetectDto | null,
  packs: KnowledgePackDto[],
  commands: ComposerData['commands'],
): ComposerData {
  const models: ComposerData['models'] = [];

  for (const item of cli?.items ?? []) {
    if (!item.installed) continue;
    models.push({
      id: `cli:${item.id}`,
      label: CLI_LABEL[item.id] ?? item.id,
      group: 'CLI',
      note: item.version ?? undefined,
    });
  }

  Object.entries(byok?.providers ?? {}).forEach(([id, p]) => {
    if (!p.enabled || !p.apiKey) return;
    const label = providerName(id);
    const model = p.models?.[0] ?? p.syncedModels?.[0] ?? '';
    models.push({ id: `byok:${id}`, label: label.name, group: 'API', note: model || label.vendor });
  });

  return {
    models,
    commands,
    knowledge: packs.map((p) => {
      const docs = p.docs;
      return {
        id: p.pack_id ?? p.id ?? p.name,
        name: p.name,
        desc: p.description ?? p.desc,
        docs: typeof p.doc_count === 'number' ? p.doc_count : Array.isArray(docs) ? docs.length : (docs ?? 0),
      };
    }),
  };
}

/* ── 设置 ─────────────────────────────────────────────────────────── */

function toProvider(id: string, p: ByokProviderDto, index: number): ProviderSetting {
  const label = providerName(id);
  const tone = isTone(PROVIDER_LABEL[id]?.tone)
    ? (PROVIDER_LABEL[id].tone as ToneName)
    : TONES[index % TONES.length];
  const models = [...new Set([...(p.models ?? []), ...(p.syncedModels ?? [])])];
  return {
    id,
    name: label.name,
    vendor: label.vendor,
    tone,
    key: p.apiKey ?? '',
    models,
    defaultModel: p.manualModels?.[0] ?? models[0] ?? '',
    on: !!p.enabled,
    state: p.enabled ? (p.apiKey ? 'ok' : 'idle') : 'idle',
  };
}

export function toCliProbes(cli: CliDetectDto | null): CliProbe[] {
  return (cli?.items ?? []).map((item) => ({
    id: item.id,
    name: CLI_LABEL[item.id] ?? item.id,
    bin: item.id,
    version: item.version ?? '',
    path: item.path ?? '',
    installed: !!item.installed,
  }));
}

/** 后端只存一台 SSH 主机（单配置）；界面按「主机列表」渲染，这里包成一条。 */
export function toSshHosts(cfg: SshConfigDto | null | undefined): SshHost[] {
  if (!cfg?.host) return [];
  return [
    {
      id: 'default',
      name: cfg.host,
      host: cfg.host,
      user: cfg.user,
      port: cfg.port,
      keyPath: cfg.keyPathMasked,
      remoteDir: cfg.remoteDir,
      state: 'untested',
    },
  ];
}

/**
 * 设置合并策略：**后端有的以后端为准，后端没有的保留缺省值**。
 * 哪天后端补齐了某一分区，只需在这个函数里加一行，界面自动跟着变。
 */
export function toSettings(input: {
  byok: ByokDto | null;
  cli: CliDetectDto | null;
  ssh: SshConfigDto | null;
  packs: KnowledgePackDto[];
}): AppSettings {
  const base = SETTINGS_SEED;
  const providers = Object.entries(input.byok?.providers ?? {}).map(([id, p], i) =>
    toProvider(id, p, i),
  );

  return {
    ...base,
    providers,
    clis: toCliProbes(input.cli),
    ssh: toSshHosts(input.ssh),
    memory: base.memory.map((z) =>
      z.id === 'profile' ? { ...z, used: input.packs.length } : z,
    ),
  };
}
