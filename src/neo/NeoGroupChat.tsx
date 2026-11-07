/**
 * NeoGroupChat — 群聊现场页（Neo 形态，2026-08-15 Polynoia 对标；
 * 2026-08-16 W1-C 视觉/信息呈现层重做，数据链路不动；
 * 2026-08-22 W2 钉钉式气泡流 + DM 文案分岔）。
 *
 * 单聊（NeoChat）里编排者拆解派发后，agents 的干活现场就在这里：
 *   - 数据：useGroupTimeline（B2 统一读路径 GET /api/groups/:id/timeline
 *     + 群 SSE + 活跃 run 的 /stream 订阅）——聊天消息与 run 过程卡已在
 *     服务端归并为统一 TimelineMessage 流
 *   - 渲染：NeoTimeline（./NeoTimeline，阶段 2.5 Neo 原生渲染层，只读）——
 *     本页在其外面包纯前端结构，不改 NeoTimeline 源文件：
 *       1) 按 turn_id 分组成「消息块」（用户发言 + 该轮 agent 回复/过程卡）
 *       2) 按消息 ts（本地日）把 turn 分日，日界处插入灰字居中分隔行
 *       3) turn 内再按 segmentTurn 切段：聊天消息走钉钉气泡壳（头像 + 名字
 *          + 角色 badge + 相对时间；用户消息右对齐；system 通知居中弱化条），
 *          连续过程卡（thinking/tool/plan…）合并成一段仍由 NeoTimeline 整段渲染
 *   - 钉钉式成员/DAG/审批门不落在中栏——融合进 NeoHost「成员」tab
 *     （团队群会话时 NeoHost 标题变「团队的主机」，见 GroupMembersPanel）
 *   - 发言：NeoComposer → postGroupMessage（sender_kind=user）→ 网关
 *     runFanout 触发新一轮 INTENT_PARSE → 分层派发（在群里说话即派活）
 *   - 派发/交付收口（2026-08-23）：网关 intent 帧 → 用户发言下方的
 *     「派发卡」（NeoDispatchCard：意图→派给谁+理由）；run 完成态消息流
 *     尾部出「交付卡」（NeoDeliveryCard：本轮产物清单 + 一句话总结 +
 *     「查看产物」跳转；无产物不渲染，不编造）。
 *
 * DM 分岔（W2）：getGroup 读 GroupRecord.kind（NeoApp.tsx 已有判 kind 先例），
 * 空态标题 / composer placeholder / 顶栏成员计数走 neo.dm.* 文案。
 *
 * 入口：NeoRail 群列表行 / NeoChat 顶栏「群聊现场」跳转（session ↔ group
 * 经 B1 互链反查）。样式全部在 neo-group.css（--t-* token，day/night 安全）。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Plus, UserPlus, UsersRound } from 'lucide-react';
import { useGroupTimeline } from '../core/hooks/useGroupTimeline';
import {
  addGroupMembers,
  fetchGroupHops,
  getGroup,
  postGroupMessage,
  removeGroupMember,
  stopGroupChat,
  type GroupHop,
  type GroupRecord,
} from '../api/groupApi';
import { listAgents, type AgentRecord } from '../api/agents';
import { NeoTimeline } from './NeoTimeline';
import { isAgentActivity, thinkingLabelPrefix } from './agent-activity';
import { NeoGroupMsgActions } from './NeoGroupMsgActions';
import { NeoDispatchCard, type IntentMessage } from './NeoDispatchCard';
import { NeoDeliveryCard, collectDeliverables, summarizeText } from './NeoDeliveryCard';
import type { TimelineMessage } from '../components/run-session/timeline/types';
import { useI18n } from '../common/i18n';
import { NeoComposer, type UnifiedComposerSubmitPayload } from './NeoComposer';
// ClawHub（2026-06，T08）：agent 气泡头像接入 DiceBear（配了头像的 Agent 生效）
import { AgentAvatar } from '../components/agent/AgentAvatar';
import { AgentAvatarSwitcher } from '../components/agent/AgentAvatarSwitcher';
import { GroupStackAvatar } from '../components/agent/GroupStackAvatar';
import { NeoQuickSchedule } from './NeoQuickSchedule';
import type { ScheduleRecord } from '../api/schedules';
import type { NeoNav } from './types';
import './neo-chat.css'; // composer 容器/发送钮基样式（.neo-chat-composer / .neo-composer）
import './neo-group.css';
import '../pages/clawhub/clawhub.css';

/* ── 纯逻辑：turn 分组 + 分日 ─────────────────────────────────────────────── */

interface TurnGroup {
  turnId: string;
  /** 块锚定时间 = 块内首条消息的 ts（epoch ms）。 */
  ts: number;
  messages: TimelineMessage[];
}

/** 按 turn_id 保序分组（消息流本身 ts 升序；同 turn 的过程卡不拆散）。 */
function groupByTurn(messages: readonly TimelineMessage[]): TurnGroup[] {
  const order: string[] = [];
  const byTurn = new Map<string, TimelineMessage[]>();
  for (const m of messages) {
    let bucket = byTurn.get(m.turn_id);
    if (!bucket) {
      bucket = [];
      byTurn.set(m.turn_id, bucket);
      order.push(m.turn_id);
    }
    bucket.push(m);
  }
  return order.map((turnId) => {
    const bucket = byTurn.get(turnId)!;
    return { turnId, ts: bucket[0]?.ts ?? 0, messages: bucket };
  });
}

interface DaySegment {
  /** 本地日 key（YYYY-M-D），同一天的消息块归一段。 */
  key: string;
  ts: number;
  turns: TurnGroup[];
}

function localDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function segmentByDay(turns: readonly TurnGroup[]): DaySegment[] {
  const out: DaySegment[] = [];
  for (const turn of turns) {
    const key = localDayKey(turn.ts);
    const last = out[out.length - 1];
    if (last && last.key === key) last.turns.push(turn);
    else out.push({ key, ts: turn.ts, turns: [turn] });
  }
  return out;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/* ── 纯逻辑：turn 内钉钉分段（聊天气泡 vs 过程卡） ─────────────────────────── */

export type StreamSeg =
  | { type: 'process'; key: string; messages: TimelineMessage[] }
  | { type: 'dispatch'; key: string; msg: IntentMessage }
  | { type: 'user' | 'agent' | 'system'; key: string; msg: TimelineMessage };

/** 后台过程折叠行只收 process/dispatch 两段（收窄后 dispatch 段的 msg 即 IntentMessage）。 */
export type BackstageSeg = Extract<StreamSeg, { type: 'process' | 'dispatch' }>;

/**
 * 把一个 turn 的消息切成渲染段：
 *   - user_turn                       → 用户气泡（右对齐）
 *   - assistant_text/raw + sender_name → agent 气泡（头像 + 名字 + 角色 badge）
 *     （sender_name='system' 是 chat-gateway 的 system.notice 适配 → 居中弱化条）
 *   - intent（网关 INTENT_PARSE 派发决策帧）→ 派发卡（NeoDispatchCard）
 *   - 其余（thinking/tool_call/plan_card…run 过程卡）→ 连续合并为一段，
 *     整段交给 NeoTimeline 渲染，仍嵌在本 turn 下
 */
export function segmentTurn(messages: readonly TimelineMessage[]): StreamSeg[] {
  const segs: StreamSeg[] = [];
  let proc: TimelineMessage[] = [];
  const flush = () => {
    if (proc.length > 0) {
      segs.push({ type: 'process', key: `proc:${proc[0].id}`, messages: proc });
      proc = [];
    }
  };
  for (const m of messages) {
    if (m.kind === 'intent') {
      flush();
      segs.push({ type: 'dispatch', key: m.id, msg: m });
      continue;
    }
    let cls: 'user' | 'agent' | 'system' | null = null;
    if (m.kind === 'user_turn') cls = 'user';
    else if (m.kind === 'assistant_text' || m.kind === 'raw') {
      const sender = (m.sender_name ?? '').trim();
      if (sender) cls = sender.toLowerCase() === 'system' ? 'system' : 'agent';
    }
    if (cls) {
      flush();
      segs.push({ type: cls, key: m.id, msg: m });
    } else {
      proc.push(m);
    }
  }
  flush();
  return segs;
}

/** 系统弱化条 / 气泡兜底取文本（仅 user/assistant_text/raw 会走到）。 */
function segText(m: TimelineMessage): string {
  if (m.kind === 'user_turn') return m.text;
  if (m.kind === 'assistant_text' || m.kind === 'raw') return m.body;
  return '';
}

/**
 * 2026-11-07 用户反馈「说完后不要显示深度思考」——聊天面的 thinking 过程卡
 * 只在流式中显示（「正在思考」的实时反馈，也是生成进度的唯一可视面）；agent
 * 说完（thinking_finalize / sweep 收口 → status 落 done）即整卡撤下，不再挂在
 * 回复气泡下面（此前实测：气泡下方残留「深度思考 Ns」块，展开是 <sf:thinking>
 * 原始标签 + 与气泡重复的正文）。过程细节不丢：Agent 检查器（NeoAgentInspector）
 * 等过程视图仍全程可见。
 */
export function dropSettledThinking(messages: readonly TimelineMessage[]): TimelineMessage[] {
  return messages.filter((m) => !(m.kind === 'thinking' && m.status !== 'streaming'));
}

/* ── 纯逻辑：成员推导（sender_name/agent_id + plan_card assignee 去重） ────── */

interface GroupMember {
  key: string;
  name: string;
}

function deriveMembers(messages: readonly TimelineMessage[]): GroupMember[] {
  const seen = new Map<string, string>();
  const add = (id: string | undefined, name: string | undefined) => {
    const n = (name ?? '').trim();
    // 系统通知行（chat-gateway 的 system.notice 适配会带 sender_name='system'）
    // 不是群成员，不进头像条。
    if (!n || n.toLowerCase() === 'system') return;
    const key = id ?? `name:${n}`;
    if (!seen.has(key)) seen.set(key, n);
  };
  for (const m of messages) {
    if (m.kind === 'assistant_text' || m.kind === 'raw') add(m.agent_id, m.sender_name);
    if (m.kind === 'plan_card') {
      for (const task of m.tasks) add(task.agent_id, task.assignee);
    }
  }
  return [...seen.entries()].map(([key, name]) => ({ key, name }));
}

/* ── 纯逻辑：头像（与 NeoRail neoAvatarColor 同算法同色环，换壳不换色） ────── */

const GC_AVATAR_COLORS = ['#F59E0B', '#A855F7', '#EF4444', '#0891B2', '#22D3EE', '#10B981', '#71717A'];

function gcAvatarColor(seed: string): string {
  let h = 0;
  const key = seed || '?';
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return GC_AVATAR_COLORS[Math.abs(h) % GC_AVATAR_COLORS.length];
}

function gcAvatarInitial(name: string): string {
  const first = Array.from((name ?? '').trim())[0] ?? '?';
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
}

/** hop 终态 → 中文标签（交接面板徽章；与 server hopStatusLabel 同源语义）。 */
function hopStatusLabel(s: GroupHop['status']): string {
  switch (s) {
    case 'done': return '完成';
    case 'failed': return '失败';
    case 'timeout': return '超时';
    case 'empty': return '空回复';
    case 'denied': return '被拦截';
    case 'aborted': return '中止';
    case 'running': return '进行中';
    case 'pending': return '待开始';
  }
}

/** 头像条最多叠 5 个，其余收进 +N。 */
const MEMBER_STACK_MAX = 5;

/* ── 2026-11-05 OpenBot 对齐批：ProgressRow + busy roster ──────────────────── */

/** mm:ss 秒表（ProgressRow / roster tooltip 共用）。 */
export function fmtElapsed(since: number, now: number): string {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 该 agent 本轮已给出回复（气泡级产出：assistant_text/raw 带 agent_id）。 */
export function agentHasReply(
  messages: readonly TimelineMessage[],
  agentId: string,
): boolean {
  return messages.some(
    (m) =>
      (m.kind === 'assistant_text' || m.kind === 'raw') && m.agent_id === agentId,
  );
}

/* ── 后台过程折叠（2026-11-07 用户反馈：「这些后台流程不在前端显示」）────────
   OpenBot 范式：transcript 只讲对话，执行过程收进记录/等待行，不刷屏。群聊
   时间线里 thinking/tool_call/plan_card/hop_card/raw/msg_foot/派发卡等过程面
   全部收进每回合一个折叠行（默认收起），聊天流只剩用户发言 + agent 回复；
   过程细节点开折叠行或进 Agent 检查器看。有流式中的帧时折叠行显示「进行中」。 */

/** 过程帧是否还在跑（thinking 流式 / 工具运行中 / msg_foot 未收口）。 */
function segIsActive(m: TimelineMessage): boolean {
  return (
    (m.kind === 'thinking' && m.status === 'streaming') ||
    (m.kind === 'tool_call' && m.status === 'running') ||
    (m.kind === 'msg_foot' && m.status === 'running')
  );
}

function NeoTurnBackstage({
  segs,
  renderMsgActions,
}: {
  /** 本回合的过程段（process）与派发卡段（dispatch），保持原有先后顺序。 */
  segs: BackstageSeg[];
  renderMsgActions?: (msg: TimelineMessage) => ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const count = segs.reduce((n, s) => n + (s.type === 'process' ? s.messages.length : 1), 0);
  const active = segs.some((s) => s.type === 'process' && s.messages.some(segIsActive));
  return (
    <div className="neo-gc-backstage" data-testid="neo-gc-backstage" data-open={open || undefined}>
      <button
        type="button"
        className="neo-gc-backstage-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="neo-gc-backstage-toggle"
      >
        <ChevronRight
          size={12}
          className="neo-gc-backstage-chev"
          data-open={open || undefined}
          aria-hidden
        />
        <span className="neo-gc-backstage-label">
          {t('neo.group.backstage', { defaultValue: '后台过程' })}
        </span>
        <span className="neo-gc-backstage-count">
          {active
            ? t('neo.group.backstageActive', { defaultValue: '进行中' })
            : t('neo.group.backstageCount', { defaultValue: '{{count}} 项', count })}
        </span>
      </button>
      {open && (
        <div className="neo-gc-backstage-body">
          {segs.map((s) =>
            s.type === 'process' ? (
              <div className="neo-gc-proc" key={s.key}>
                <NeoTimeline messages={s.messages} renderMsgActions={renderMsgActions} />
              </div>
            ) : (
              <NeoDispatchCard key={s.key} msg={s.msg} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 该 agent 干过活 — 发言/思考/工具调用/任务行/交接边任一即算。
 * 归属判定委托 agent-activity.isAgentActivity（与检查器活动流同源语义，
 * thinking 卡、tool_call/tool_echo、plan_card 任务行都认；老数据 thinking
 * 回落 label 前缀匹配），避免双实现漂移。
 */
export function agentHasActivity(
  messages: readonly TimelineMessage[],
  agentId: string,
  displayName: string,
): boolean {
  const labelPrefix = thinkingLabelPrefix(displayName);
  return messages.some((m) => isAgentActivity(m, agentId, labelPrefix));
}

/* ── 组件 ─────────────────────────────────────────────────────────────────── */

/**
 * 双形态（2026-08-19）：
 *   - 路由页：/group/:groupId 独立整页（AppRoutes 懒加载，无 props）
 *   - 内嵌：NeoApp 中栏 `<NeoGroupChat groupId embedded />` —— 点击侧栏
 *     「会话/群聊现场」不再跳路由页，留在 Neo 壳内（ZCode 式停留同页）。
 * 内嵌态隐藏返回钮、高度 100% 填充中栏（.neo-gc--inline）。
 */
export function NeoGroupChat({
  groupId: groupIdProp,
  embedded = false,
  onNavigate,
  onInspectAgent,
}: {
  groupId?: string;
  embedded?: boolean;
  /** NeoApp 内部导航（内嵌态由 NeoApp 透传）——转发给 NeoComposer 的
   *  /inspect 等内建 slash 命令；独立路由页缺省。 */
  onNavigate?: (nav: NeoNav) => void;
  /** 2026-11-05 Task#11 — 点 agent 头像（气泡/顶栏成员栈）→ 右栏检查器。
   *  内嵌态由 NeoApp 下发；独立路由页缺省（无右栏壳）。 */
  onInspectAgent?: (agent: { agentId: string; name: string; groupId: string }) => void;
} = {}) {
  const params = useParams<{ groupId: string }>();
  const groupId = groupIdProp ?? params.groupId;
  const { t } = useI18n();

  const timeline = useGroupTimeline(groupId ?? null);

  // 群记录（getGroup 失败 → 退化用 groupId，不阻塞页面）。kind='dm' → 单聊
  // 文案分岔（NeoApp.tsx 已有判 kind 先例）。
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupKind, setGroupKind] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState<number>(0);
  /** 当前会话成员 id（Grok 式「添加成员」的真源：读 → 合并 → PATCH 全量回写）。 */
  const [groupAgentIds, setGroupAgentIds] = useState<string[]>([]);
  /** 单聊对面那位 agent 的 id（kind='dm' 且 agent_ids 恰一人 → Grok 单聊形态）。 */
  const [dmAgentId, setDmAgentId] = useState<string | null>(null);
  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    getGroup(groupId)
      .then((g) => {
        if (!alive || !g) return;
        setGroupName(g.name);
        setGroupKind((g.kind as string | undefined) ?? null);
        setMemberCount(g.agent_ids?.length ?? 0);
        const ids = g.agent_ids ?? [];
        setGroupAgentIds(ids);
        const isDmRec = (g.kind as string | undefined) === 'dm';
        setDmAgentId(isDmRec && ids.length === 1 ? ids[0] : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [groupId]);
  const isDm = groupKind === 'dm';

  // 气泡角色 badge / 头像色数据源（TeamPanel 同款 listAgents；失败 → 空表，
  // badge 退化为不出，头像色回退名字 hash，不阻塞聊天主链路）
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    listAgents()
      .then((list) => {
        if (alive) setAgents(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [groupId]);
  const agentById = useMemo(() => new Map(agents.map((a) => [a.agent_id, a])), [agents]);
  /** 单聊对面的 Agent 记录（头像 + 名称真源；记录没拉到 → 顶栏退回群名）。 */
  const dmAgent = dmAgentId ? agentById.get(dmAgentId) ?? null : null;
  /** 群头像成员组合（os-unified 2026-11-04 用户反馈批）：agent_ids join 记录。 */
  const groupAvatarMembers = useMemo(
    () => groupAgentIds.map((id) => agentById.get(id)).filter((a): a is AgentRecord => !!a),
    [groupAgentIds, agentById],
  );

  // 群聊 @ 提及成员（2026-11-05，OpenBot 定向派活）：composer @ 菜单列出群成员，
  // 选中插入 `@<id>` token，后端 parseMentions 命中后只派活给被点名者。
  const mentionItems = useMemo(
    () =>
      groupAgentIds.map((id) => {
        const a = agentById.get(id);
        const role = typeof a?.blueprint?.role === 'string' ? a.blueprint.role.trim() : '';
        return { id, name: a?.name || id, ...(role ? { role } : {}) };
      }),
    [groupAgentIds, agentById],
  );

  // 活跃 run → composer 显示 Stop 视觉 + 顶栏 live 徽章
  const busy = timeline.runs.some((r) => r.status === 'running');

  // ── 2026-11-05 OpenBot 对齐：ProgressRow + busy roster ──────────────────────
  // ProgressRow：pendingTurn 非 null（run 尚未被 /timeline 刷新发现）→ 流尾
  // 「正在处理… mm:ss」占位行；run 接管订阅/Stop/30s 超时后由 hook 清空。
  // 1s tick 只在占位存在时开（静止时零重渲染）。
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!timeline.pendingTurn && !busy) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [timeline.pendingTurn?.turnId, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  // busy roster：多成员会话在执行中时，顶栏显示每个成员的干活状态点。
  // 三态（2026-11-07 补全；零新端点，全部从已有 timeline 数据推导）：
  //   - done    = 已有该 agent 的回复（assistant_text/raw 带 agent_id）
  //   - working = 干过活但还没回复（thinking/工具卡/任务行/交接边流出 —— 真在干活）
  //   - idle    = 一点动静都没有（还没被派活/串行等待）—「待命」
  const busyRoster = useMemo(() => {
    if (!busy || isDm || groupAgentIds.length <= 1) return [];
    return groupAgentIds.map((id) => {
      const rec = agentById.get(id);
      const name = rec?.name ?? id;
      const replied = agentHasReply(timeline.messages, id);
      const active = agentHasActivity(timeline.messages, id, name);
      return {
        agentId: id,
        name,
        rec,
        state: (replied ? 'done' : active ? 'working' : 'idle') as
          | 'done'
          | 'working'
          | 'idle',
      };
    });
  }, [busy, isDm, groupAgentIds, agentById, timeline.messages]);

  // ── /schedule 快捷定时任务（2026-11-05 GrokBot 对齐）─────────────────────
  // composer 敲 /schedule → 轻量表单；DM 挂对面 agent，群聊挂会话本身。
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleToast, setScheduleToast] = useState<string | null>(null);
  const handleScheduleCreated = useCallback((s: ScheduleRecord) => {
    setScheduleToast(
      t('neo.qs.created', {
        defaultValue: '✓ 定时任务已创建：{{desc}}',
        desc: (s.task_description ?? '').slice(0, 60),
      }),
    );
    // 8s 后自动消失（不进消息流 — 定时任务是侧挂资产，非聊天消息）。
    setTimeout(() => setScheduleToast(null), 8000);
  }, [t]);

  // 2026-11-04「停止生成」（用户反馈：点暂停对话停不下来）— 服务端取消当前
  // fan-out 轮（POST /:id/stop：abort AbortController + 终结 gateway run），
  // 本地同步把 running runs 立即翻终态（解订阅 + busy 解除，Stop 同帧回发送）。
  // 服务端失败也不阻塞 UI 退出 busy（本地态是 UI 真源）。
  const handleStop = useCallback(() => {
    if (!groupId) return;
    timeline.markAllRunsStopped();
    void stopGroupChat(groupId).catch(() => undefined);
  }, [groupId, timeline]);

  // ── Grok 式「添加成员」（2026-11-04 用户反馈批）───────────────────────────
  // 顶栏成员栈尾的「+」→ 浮层里勾选 Agent 加入当前会话。**没有独立的
  //「新建群聊」入口**：单聊加进第二个人，会话自动升级为群聊
  // （addGroupMembers：成员数 > 1 → kind='group'）——会话形态由在场人数决定，
  // 这也是 Grok 的做法。已在会话里的成员点了即移出（剩 1 人回落单聊）。
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [memberErr, setMemberErr] = useState<string | null>(null);

  // 点浮层外部关闭（与 TeamPanel roster picker 同款：document mousedown +
  // Esc）；浮层内部点击不关；点「+」钮交给按钮自身 onClick 开合。
  const memberPickerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!memberPickerOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (memberPickerRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.('.neo-gc-member-add')) return;
      setMemberPickerOpen(false);
    };
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMemberPickerOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  }, [memberPickerOpen]);

  // ── 交接记录面板（2026-11-05 迭代六，OpenBot hop 模型可视化）──────────────
  // 顶栏「交接」钮 → 下拉面板展示最近 3 回合的 agent 间交接（谁→谁、终态、
  // 产出规模、失败原因）。数据源 GET /hops?all=1；回合结束自动刷新一次
  // （busy true→false 沿），打开时也刷新。失败静默（面板显示空态）。
  const [hopsOpen, setHopsOpen] = useState(false);
  const [hops, setHops] = useState<GroupHop[]>([]);
  const prevBusyRef = useRef(busy);
  const refreshHops = useCallback(() => {
    if (!groupId) return;
    void fetchGroupHops(groupId, 3)
      .then(setHops)
      .catch(() => undefined);
  }, [groupId]);
  useEffect(() => {
    if (hopsOpen) refreshHops();
  }, [hopsOpen, refreshHops]);
  useEffect(() => {
    // busy true→false（一轮 fan-out 结束）→ 若面板开着就刷新。
    if (prevBusyRef.current && !busy && hopsOpen) refreshHops();
    prevBusyRef.current = busy;
  }, [busy, hopsOpen, refreshHops]);

  /** 把 PATCH 回来的群记录同步进本地各派生态（成员/形态/单聊对象）。 */
  const syncGroupRecord = useCallback((g: GroupRecord | null) => {
    if (!g) return;
    const ids = g.agent_ids ?? [];
    setGroupAgentIds(ids);
    setGroupKind((g.kind as string | undefined) ?? null);
    setMemberCount(ids.length);
    // 升级成群后不再是「单聊对面那位」；仍是 1 人才保留 DM 头像形态
    setDmAgentId(
      (g.kind as string | undefined) === 'dm' && ids.length === 1 ? ids[0] : null,
    );
  }, []);

  const toggleMember = useCallback(
    async (agentId: string) => {
      if (!groupId) return;
      const inGroup = groupAgentIds.includes(agentId);
      setMemberBusy(agentId);
      setMemberErr(null);
      try {
        const g = inGroup
          ? await removeGroupMember(groupId, agentId)
          : await addGroupMembers(groupId, [agentId]);
        syncGroupRecord(g);
      } catch {
        setMemberErr(
          t('neo.group.memberEditFailed', { defaultValue: '成员更新失败，请重试' }),
        );
      } finally {
        setMemberBusy(null);
      }
    },
    [groupId, groupAgentIds, syncGroupRecord, t],
  );

  // ── 交付卡（2026-08-23 交付收口）────────────────────────────────────────
  // run 跑完（最新一条 gateway run 进入 succeeded 且当前无 running）→ 消息流
  // 尾部出一张交付汇总卡：该轮真实产物（artifact_card / commit_record.files /
  // file_diff，与 artifact-lineage 同一 worktree 证据链）+ 本轮最后一条 agent
  // 回复首行作一句话总结 + 产物自带 url 时的「查看产物」跳转。
  // 无产物 / 仍在跑 / 无完成 run → null（不渲染空卡，不编造）。
  const delivery = useMemo(() => {
    if (busy) return null;
    const doneRun = [...timeline.runs].reverse().find((r) => r.status === 'succeeded');
    if (!doneRun) return null;
    const turnId = `gwturn_${doneRun.session_id}`;
    const turnMsgs = timeline.messages.filter((m) => m.turn_id === turnId);
    const items = collectDeliverables(turnMsgs);
    if (items.length === 0) return null;
    const turnStart = turnMsgs.reduce((min, m) => (m.ts < min ? m.ts : min), Infinity);
    const lastReply = [...timeline.messages]
      .reverse()
      .find((m) => m.kind === 'assistant_text' && m.ts >= turnStart);
    const summary =
      lastReply && lastReply.kind === 'assistant_text' ? summarizeText(lastReply.body) : '';
    return { items, summary: summary || undefined };
  }, [busy, timeline.runs, timeline.messages]);

  // ── L1（2026-08-22）— 群消息 reactions/pinned 元数据 + 消息行动作 ──────────
  // 水合：GET /api/groups/{id} 全量记录里的 messages[].reactions/pinned →
  // message_id 索引 map；聊天消息数变化时重取（新到的 agent 回复也要带上
  // 既有反应）。动作回写以服务端 POST 响应为准（群消息 id 规则：
  // TimelineMessage.id = `chat_<message_id>`，与 server 适配器一致）。
  const [msgMeta, setMsgMeta] = useState<
    Record<string, { reactions: Record<string, string[]>; pinned: boolean }>
  >({});
  const chatMsgCount = useMemo(
    () => timeline.messages.filter((m) => m.id.startsWith('chat_')).length,
    [timeline.messages],
  );
  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    getGroup(groupId)
      .then((g) => {
        if (!alive || !g) return;
        const msgs = (g.messages ?? []) as Array<Record<string, unknown>>;
        const meta: Record<string, { reactions: Record<string, string[]>; pinned: boolean }> = {};
        for (const m of msgs) {
          const mid = m.message_id;
          if (typeof mid === 'string' && mid) {
            meta[mid] = {
              reactions: (m.reactions ?? {}) as Record<string, string[]>,
              pinned: Boolean(m.pinned),
            };
          }
        }
        setMsgMeta(meta);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [groupId, chatMsgCount]);

  const handleReactionsChange = useCallback((mid: string, reactions: Record<string, string[]>) => {
    setMsgMeta((prev) => ({ ...prev, [mid]: { reactions, pinned: prev[mid]?.pinned ?? false } }));
  }, []);
  const handlePinnedChange = useCallback((mid: string, pinned: boolean) => {
    setMsgMeta((prev) => ({ ...prev, [mid]: { reactions: prev[mid]?.reactions ?? {}, pinned } }));
  }, []);

  const renderMsgActions = useCallback(
    (msg: TimelineMessage) => {
      if (!groupId || !msg.id.startsWith('chat_')) return null;
      const mid = msg.id.slice('chat_'.length);
      const meta = msgMeta[mid];
      // 乐观/SSE 占位 id（chat_sse_*）不在群记录里 — 等元数据刷新出真 id 再渲染。
      if (!meta) return null;
      return (
        <NeoGroupMsgActions
          groupId={groupId}
          messageId={mid}
          reactions={meta.reactions}
          pinned={meta.pinned}
          onReactionsChange={handleReactionsChange}
          onPinnedChange={handlePinnedChange}
        />
      );
    },
    [groupId, msgMeta, handleReactionsChange, handlePinnedChange],
  );

  // 日分隔标签：今天 / 昨天 / YYYY-MM-DD
  const dayLabel = useCallback(
    (ts: number): string => {
      const dayDiff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
      if (dayDiff <= 0) return t('neo.group.today', { defaultValue: '今天' });
      if (dayDiff === 1) return t('neo.group.yesterday', { defaultValue: '昨天' });
      const d = new Date(ts);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    },
    [t],
  );

  // 块/气泡相对时间：当天 = 刚刚/N 分钟前/N 小时前；跨天 = HH:mm（日期由分隔行承担）
  const relTime = useCallback(
    (ts: number): string => {
      if (!ts) return '';
      const diff = Date.now() - ts;
      if (diff < 60_000) return t('neo.group.timeNow', { defaultValue: '刚刚' });
      const m = Math.floor(diff / 60_000);
      if (m < 60) {
        return t('neo.group.timeMinutesAgo', { defaultValue: '{{count}} 分钟前', count: m });
      }
      const sameDay = startOfDay(Date.now()) === startOfDay(ts);
      const h = Math.floor(m / 60);
      if (sameDay && h < 24) {
        return t('neo.group.timeHoursAgo', { defaultValue: '{{count}} 小时前', count: h });
      }
      const d = new Date(ts);
      return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    },
    [t],
  );

  // 消息流 → 日分段（每段内按 turn 分块 → turn 内按钉钉段渲染）
  const daySegments = useMemo(
    () => segmentByDay(groupByTurn(dropSettledThinking(timeline.messages))),
    [timeline.messages],
  );

  // 成员头像条（纯前端推导；推导不出 → 不渲染）
  const members = useMemo(() => deriveMembers(timeline.messages), [timeline.messages]);
  const stackedMembers = members.slice(0, MEMBER_STACK_MAX);
  const overflowCount = members.length - stackedMembers.length;

  // 气泡角色 badge：blueprint.role 真源优先；有 agent 记录但没配角色 → 通用
  // 「Agent」标签；连 agent 记录都查不到 → 不出 badge（不伪造头衔）。
  const roleBadge = useCallback(
    (msg: TimelineMessage): string | null => {
      const aid = msg.kind === 'assistant_text' || msg.kind === 'raw' ? msg.agent_id : undefined;
      const a = aid ? agentById.get(aid) : undefined;
      if (!a) return null;
      const role = a.blueprint?.role;
      if (typeof role === 'string' && role.trim()) return role.trim();
      return t('neo.group.roleAgent', { defaultValue: 'Agent' });
    },
    [agentById, t],
  );

  // 发言 = 在群里说话 → 网关触发新一轮派发（INTENT_PARSE → 分层并行）。
  // executor/model 与其他 composer 调用方同源：UnifiedComposer 的内部
  // picker 写 localStorage（sf.defaultExecutor / sf.model），此处原样读取。
  const handleSubmit = useCallback(
    async (p: UnifiedComposerSubmitPayload) => {
      if (!groupId) return;
      const text = p.text.trim();
      if (!text) return;
      let executor: string | undefined;
      let model: string | undefined;
      try {
        executor = localStorage.getItem('sf.defaultExecutor') || undefined;
        model = localStorage.getItem('sf.model') || undefined;
      } catch {
        /* localStorage 不可用 → 网关默认 executor */
      }
      timeline.appendLocalUser(text);
      try {
        await postGroupMessage(groupId, text, {
          senderName: 'user',
          senderKind: 'user',
          executor,
          model,
          // 对话框知识库（2026-11-06）— 记忆库 pack id 随消息下发，fan-out
          // 按本轮消息检索命中注入 Agent 提示词。
          knowledgePackIds: p.knowledgePackIds,
        });
      } catch (err) {
        throw new Error(
          t('neo.group.sendFailed', {
            defaultValue: `发送失败：${err instanceof Error ? err.message : String(err)}`,
          }),
        );
      }
    },
    [groupId, timeline, t],
  );

  if (!groupId) return null;

  return (
    <div className={`neo-gc${embedded ? ' neo-gc--inline' : ''}`}>
      <header className="neo-gc-topbar">
        {!embedded && (
          <Link
            to="/"
            className="neo-gc-back"
            aria-label={t('neo.group.back', { defaultValue: '返回' })}
          >
            <ArrowLeft size={14} strokeWidth={1.9} aria-hidden />
          </Link>
        )}
        <span className="neo-gc-title">
          {/* Grok 单聊形态（2026-11-04 用户反馈）：单聊头像是对方 Agent 的真实
              头像（与侧栏/气泡同源 AgentAvatar），不再用群聊图标，也不出成员计数；
              群聊头像 = 成员头像组合（2026-11-04 第二批：agent_ids join 记录 →
              2×2 拼贴 / 单成员直出真实头像，Grok/微信范式）。 */}
          {isDm && dmAgent && (
            /* Grok 式头像切换（2026-11-04）：点顶栏头像直接弹候选网格，
               点一个立即保存，不用再进「灵魂」tab 找表单 + 点保存。 */
            <AgentAvatarSwitcher
              agent={dmAgent}
              size={20}
              className="neo-gc-title-avatar"
              onChanged={(next) =>
                setAgents((list) =>
                  list.map((a) => (a.agent_id === next.agent_id ? next : a)),
                )
              }
            />
          )}
          {!isDm && (
            <span className="neo-gc-title-avatar neo-gc-title-avatar--group" aria-hidden>
              <GroupStackAvatar members={groupAvatarMembers} size={20} />
            </span>
          )}
          <strong>{isDm && dmAgent ? dmAgent.name : (groupName ?? groupId.slice(0, 8))}</strong>
          {!isDm && memberCount > 0 && (
            <span className="neo-gc-title-count">
              {'· '}
              {t('neo.group.members', { defaultValue: '{{count}} 个 Agent', count: memberCount })}
            </span>
          )}
        </span>
        {!isDm && members.length > 0 && (
          <span
            className="neo-gc-members"
            title={members.map((m) => m.name).join('、')}
            data-testid="neo-gc-members"
          >
            <span className="neo-gc-member-stack">
              {stackedMembers.map((m) => {
                // 头像统一（2026-11-04 用户反馈）：有 agent 记录 → AgentAvatar
                // （DiceBear/avatar_image，与侧栏/气泡同源）；推导不出记录的
                // （历史消息残留 id）→ 保留字符色块兜底。
                const rec = m.key.startsWith('name:')
                  ? undefined
                  : agentById.get(m.key);
                // 2026-11-05 Task#11 — 有记录的成员头像可点 → 右栏检查器。
                return rec ? (
                  <button
                    key={m.key}
                    type="button"
                    className="neo-gc-member neo-gc-member--img neo-gc-member--click"
                    onClick={() =>
                      onInspectAgent?.({ agentId: rec.agent_id, name: rec.name, groupId: groupId ?? '' })
                    }
                    title={t('neo.inspect.open', { defaultValue: '查看 {{name}} 的后台活动', name: rec.name })}
                    data-testid="neo-gc-member-inspect"
                  >
                    <AgentAvatar
                      name={rec.name}
                      style={rec.avatar_style}
                      seed={rec.avatar_seed ?? rec.name}
                      image={rec.avatar_image ?? null}
                      size={22}
                    />
                  </button>
                ) : (
                  <span
                    key={m.key}
                    className="neo-gc-member"
                    style={{ background: gcAvatarColor(m.key) }}
                    aria-hidden
                  >
                    {gcAvatarInitial(m.name)}
                  </span>
                );
              })}
              {overflowCount > 0 && (
                <span className="neo-gc-member neo-gc-member-more" aria-hidden>
                  +{overflowCount}
                </span>
              )}
            </span>
            <span className="neo-gc-member-count">
              {t('neo.group.memberCount', { defaultValue: '{{count}} 位在场', count: members.length })}
            </span>
          </span>
        )}

        {/* ── Grok 式「添加成员」（2026-11-04 用户反馈批）───────────────────
            单聊/群聊都常驻这个「+」：点开勾选 Agent 加进当前会话，加进第二
            个人会话就升级为群聊（kind: dm → group）。产品上因此不再有独立
            的「新建群聊」入口 —— 建群就是加人，与 Grok 一致。 */}
        <button
          type="button"
          className={`neo-gc-member-add${memberPickerOpen ? ' on' : ''}`}
          onClick={() => setMemberPickerOpen((o) => !o)}
          title={t('neo.group.addMember', { defaultValue: '添加成员' })}
          aria-label={t('neo.group.addMember', { defaultValue: '添加成员' })}
          aria-expanded={memberPickerOpen}
          data-testid="neo-gc-add-member"
        >
          <UserPlus size={14} strokeWidth={1.9} aria-hidden />
        </button>

        {memberPickerOpen && (
          <div
            className="neo-gc-member-picker"
            data-testid="neo-gc-member-picker"
            ref={memberPickerRef}
          >
            <div className="neo-gc-member-picker-head">
              {t('neo.group.addMemberTitle', { defaultValue: '选择要加入的成员' })}
            </div>
            <div className="neo-gc-member-picker-list">
              {agents.length === 0 ? (
                <div className="neo-gc-member-picker-empty">
                  {t('neo.group.noAgents', { defaultValue: '还没有可加入的 Agent' })}
                </div>
              ) : (
                agents.map((a) => {
                  const inGroup = groupAgentIds.includes(a.agent_id);
                  const busy = memberBusy === a.agent_id;
                  return (
                    <button
                      key={a.agent_id}
                      type="button"
                      className={`neo-gc-member-picker-row${inGroup ? ' in' : ''}`}
                      disabled={memberBusy !== null}
                      onClick={() => void toggleMember(a.agent_id)}
                      data-testid="neo-gc-member-picker-row"
                    >
                      <AgentAvatar
                        name={a.name}
                        style={a.avatar_style}
                        seed={a.avatar_seed ?? a.name}
                        image={a.avatar_image ?? null}
                        size={26}
                      />
                      <span className="neo-gc-member-picker-name">{a.name}</span>
                      {typeof a.blueprint?.role === 'string' && a.blueprint.role.trim() && (
                        <span className="neo-gc-member-picker-role">{a.blueprint.role.trim()}</span>
                      )}
                      <span className="neo-gc-member-picker-mark" aria-hidden>
                        {busy ? '…' : inGroup ? <Check size={13} strokeWidth={2.2} /> : <Plus size={13} strokeWidth={2} />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {memberErr && <div className="neo-gc-member-picker-error">{memberErr}</div>}
          </div>
        )}

        {/* ── 交接记录面板（2026-11-05 迭代六，OpenBot hop 模型可视化）───────
            评审表功能②「任务交接记录」的可演示落点：点顶栏「交接」钮看最近
            3 回合谁把什么交给了谁、哪里断了（终态徽章 + 失败原因）。 */}
        {!isDm && (
          <button
            type="button"
            className={`neo-gc-hops-btn${hopsOpen ? ' on' : ''}`}
            onClick={() => setHopsOpen((o) => !o)}
            title={t('neo.group.hops', { defaultValue: '交接记录' })}
            aria-label={t('neo.group.hops', { defaultValue: '交接记录' })}
            aria-expanded={hopsOpen}
            data-testid="neo-gc-hops-btn"
          >
            <ArrowRight size={14} strokeWidth={1.9} aria-hidden />
            {t('neo.group.hops', { defaultValue: '交接' })}
          </button>
        )}
        {hopsOpen && !isDm && (
          <div className="neo-gc-hops-panel" data-testid="neo-gc-hops-panel">
            <div className="neo-gc-hops-head">
              {t('neo.group.hopsTitle', { defaultValue: '最近交接（3 回合）' })}
            </div>
            <div className="neo-gc-hops-list">
              {hops.length === 0 ? (
                <div className="neo-gc-hops-empty">
                  {t('neo.group.hopsEmpty', { defaultValue: '暂无交接记录 — 跑一轮团队协作后这里会出现每次 A→B 交接' })}
                </div>
              ) : (
                [...hops]
                  .sort((a, b) => b.turn_seq - a.turn_seq || a.created_at - b.created_at)
                  .slice(0, 30)
                  .map((h) => (
                    <div key={h.id} className="neo-gc-hop" data-status={h.status}>
                      <span className="neo-gc-hop-turn">#{h.turn_seq}</span>
                      <span className="neo-gc-hop-edge">
                        {agentById.get(h.from_agent)?.name ?? h.from_agent}
                        <span className="neo-gc-hop-arrow" aria-hidden>→</span>
                        {agentById.get(h.to_agent)?.name ?? h.to_agent}
                      </span>
                      <span className="neo-gc-hop-status">{hopStatusLabel(h.status)}</span>
                      {h.output_chars > 0 && (
                        <span className="neo-gc-hop-chars">{h.output_chars} 字</span>
                      )}
                      {h.detail && <span className="neo-gc-hop-detail" title={h.detail}>{h.detail}</span>}
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
        {busy && (
          <span className="neo-gc-live" data-testid="neo-group-live">
            {/* OpenBot busy roster（2026-11-05；2026-11-07 三态补全）— 多成员
                执行中时逐人状态点：done 绿 / 干活中转圈（有过程卡流出）/
                待命灰点（没动静）；单人/单聊不展开（顶栏太挤）。 */}
            {busyRoster.length > 0 && (
              <span className="neo-gc-roster" data-testid="neo-gc-roster">
                {busyRoster.map((m) => (
                  <span
                    key={m.agentId}
                    className="neo-gc-roster-item"
                    data-state={m.state}
                    title={`${m.name} · ${
                      m.state === 'done' ? '已完成' : m.state === 'working' ? '处理中' : '待命'
                    }`}
                  >
                    {m.rec ? (
                      <AgentAvatar
                        name={m.name}
                        style={m.rec.avatar_style}
                        seed={m.rec.avatar_seed ?? m.name}
                        image={m.rec.avatar_image ?? null}
                        size={16}
                      />
                    ) : (
                      <span
                        className="neo-gc-roster-fallback"
                        style={{ background: gcAvatarColor(m.agentId) }}
                        aria-hidden
                      >
                        {gcAvatarInitial(m.name)}
                      </span>
                    )}
                    <span className="neo-gc-roster-dot" aria-hidden />
                  </span>
                ))}
              </span>
            )}
            <span className="neo-gc-live-dot" aria-hidden />
            {t('neo.group.live', { defaultValue: '执行中' })}
            {timeline.pendingTurn && (
              <span className="neo-gc-live-elapsed" aria-hidden>
                {fmtElapsed(timeline.pendingTurn.since, nowTick)}
              </span>
            )}
          </span>
        )}
      </header>

      <div className="neo-gc-scroll">
        <div className="neo-gc-stream">
              {timeline.loading ? (
                <div className="neo-gc-state">
                  <span className="neo-gc-state-spinner" aria-hidden />
                  {t('common.loading', { defaultValue: '加载中…' })}
                </div>
              ) : timeline.error ? (
                <div className="neo-gc-state neo-gc-state-error" role="alert">
                  <span>{timeline.error}</span>
                  <span className="neo-gc-state-hint">
                    {t('neo.group.hint', {
                      defaultValue: '请确认后端 server 在运行（:8002），且群存在',
                    })}
                  </span>
                </div>
              ) : daySegments.length === 0 ? (
                <div className="neo-gc-state neo-gc-state-empty">
                  <span className="neo-gc-state-icon" aria-hidden>
                    <UsersRound size={18} strokeWidth={1.6} />
                  </span>
                  <span className="neo-gc-state-title">
                    {isDm
                      ? t('neo.dm.emptyTitle', { defaultValue: '还没有对话' })
                      : t('neo.group.emptyTitle', { defaultValue: '群里还没有动静' })}
                  </span>
                  {!isDm && (
                    <span className="neo-gc-state-hint">
                      {t('neo.group.emptyHint', { defaultValue: '在下面说句话，Agents 就开始干活' })}
                    </span>
                  )}
                </div>
              ) : (
                <>
                {daySegments.map((seg) => (
                  <div className="neo-gc-day" key={seg.key}>
                    <div className="neo-gc-day-divider" role="separator">
                      <span className="neo-gc-day-label">{dayLabel(seg.ts)}</span>
                    </div>
                    {seg.turns.map((turn) => {
                      // 2026-11-07 简洁展示（用户反馈：「简单点，直接看到回复，
                      // 后台流程不在前端显示」）：过程段/派发卡从聊天流摘出，收进
                      // 回合尾部的「后台过程」折叠行（默认收起）；聊天流只讲对话。
                      const segs = segmentTurn(turn.messages);
                      const chatSegs = segs.filter(
                        (s): s is Extract<StreamSeg, { type: 'user' | 'agent' | 'system' }> =>
                          s.type === 'user' || s.type === 'agent' || s.type === 'system',
                      );
                      const backSegs = segs.filter(
                        (s): s is BackstageSeg =>
                          s.type === 'process' || s.type === 'dispatch',
                      );
                      return (
                      <section className="neo-gc-turn" key={turn.turnId}>
                        {chatSegs.map((s) => {
                          if (s.type === 'system') {
                            // 系统/事件消息：居中弱化条
                            return (
                              <div className="neo-gc-sys" key={s.key}>
                                {segText(s.msg)}
                              </div>
                            );
                          }
                          if (s.type === 'user') {
                            // 用户消息：右对齐气泡（neo-tl-user 自带右浮，这里补时间行）
                            // OpenBot ProgressRow（2026-11-05）— 该 turn 是占位目标且
                            // run 尚未接管时，气泡下方直接出「正在处理… mm:ss」进度行。
                            const pendingOnThis =
                              timeline.pendingTurn?.turnId === s.msg.turn_id;
                            return (
                              <div className="neo-gc-user-row" key={s.key}>
                                <NeoTimeline messages={[s.msg]} renderMsgActions={renderMsgActions} />
                                {s.msg.ts > 0 && (
                                  <span className="neo-gc-user-time" aria-hidden>
                                    {relTime(s.msg.ts)}
                                  </span>
                                )}
                                {pendingOnThis && (
                                  <div
                                    className="neo-gc-progress-row"
                                    data-testid="neo-gc-progress-row"
                                  >
                                    <span className="neo-gc-progress-dots" aria-hidden>
                                      <i /><i /><i />
                                    </span>
                                    <span className="neo-gc-progress-label">
                                      {isDm && dmAgent
                                        ? t('neo.group.progressDm', {
                                            defaultValue: '{{name}} 正在处理…',
                                            name: dmAgent.name,
                                          })
                                        : t('neo.group.progress', {
                                            defaultValue: 'Agents 正在处理…',
                                          })}
                                    </span>
                                    <span className="neo-gc-progress-elapsed" aria-hidden>
                                      {fmtElapsed(timeline.pendingTurn!.since, nowTick)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          }
                          // agent 消息：钉钉气泡壳（头像 + 名字 + 角色 badge + 相对时间）
                          const sender =
                            s.msg.kind === 'assistant_text' || s.msg.kind === 'raw'
                              ? (s.msg.sender_name ?? '').trim()
                              : '';
                          const aid =
                            s.msg.kind === 'assistant_text' || s.msg.kind === 'raw'
                              ? s.msg.agent_id
                              : undefined;
                          const agentRec = aid ? agentById.get(aid) : undefined;
                          const role = roleBadge(s.msg);
                          return (
                            <div className="neo-gc-msg" key={s.key} data-testid="neo-gc-msg">
                              {/* ClawHub（2026-10-30）：群聊消息头像统一 DiceBear
                                  （未配置按名字 hash 稳定生成）；字符色块保留为
                                  SVG 异常兜底（fallback）。 */}
                              {agentRec ? (
                                <button
                                  type="button"
                                  className="neo-gc-msg-avatar-btn"
                                  onClick={() =>
                                    onInspectAgent?.({ agentId: agentRec.agent_id, name: agentRec.name, groupId: groupId ?? '' })
                                  }
                                  title={t('neo.inspect.open', { defaultValue: '查看 {{name}} 的后台活动', name: agentRec.name })}
                                  data-testid="neo-gc-msg-avatar-inspect"
                                >
                                  <AgentAvatar
                                    name={sender}
                                    style={agentRec.avatar_style}
                                    seed={agentRec.avatar_seed ?? sender}
                                    size={28}
                                    className="neo-gc-msg-avatar"
                                    fallback={
                                      <span
                                        className="neo-gc-msg-avatar"
                                        style={{
                                          background: agentRec?.avatar_color ?? gcAvatarColor(aid ?? sender),
                                        }}
                                        aria-hidden
                                      >
                                        {gcAvatarInitial(sender)}
                                      </span>
                                    }
                                  />
                                </button>
                              ) : (
                                <span
                                  className="neo-gc-msg-avatar"
                                  style={{
                                    background: gcAvatarColor(aid ?? sender),
                                  }}
                                  aria-hidden
                                >
                                  {gcAvatarInitial(sender)}
                                </span>
                              )}
                              <div className="neo-gc-msg-main">
                                <div className="neo-gc-msg-head">
                                  <span className="neo-gc-msg-name">{sender}</span>
                                  {role && <span className="neo-gc-msg-role">{role}</span>}
                                  {s.msg.ts > 0 && (
                                    <span className="neo-gc-msg-time">{relTime(s.msg.ts)}</span>
                                  )}
                                </div>
                                <div className="neo-gc-msg-bubble">
                                  <NeoTimeline messages={[s.msg]} renderMsgActions={renderMsgActions} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {/* 后台过程折叠：派发卡 + 过程卡整段收起（默认不显示） */}
                        {backSegs.length > 0 && (
                          <NeoTurnBackstage segs={backSegs} renderMsgActions={renderMsgActions} />
                        )}
                        {turn.ts > 0 && (
                          <span className="neo-gc-turn-time" aria-hidden>
                            {relTime(turn.ts)}
                          </span>
                        )}
                      </section>
                      );
                    })}
                  </div>
                ))}
                {/* 交付卡：run 完成态在消息流尾部汇总本轮产物（无产物不渲染） */}
                {delivery && <NeoDeliveryCard items={delivery.items} summary={delivery.summary} />}
                </>
              )}
            </div>
          </div>

      <div className="neo-chat-composer neo-gc-composer">
        {scheduleToast && (
          <div className="neo-gc-schedule-toast" data-testid="neo-gc-schedule-toast" role="status">
            {scheduleToast}
          </div>
        )}
        <NeoComposer
          variant="chat"
          onSubmit={handleSubmit}
          streaming={busy}
          onStop={handleStop}
          onNavigate={onNavigate}
          mentionItems={mentionItems}
          onScheduleCommand={() => setScheduleOpen(true)}
          placeholder={
            isDm
              ? t('neo.dm.placeholder', { defaultValue: '发消息，TA 就开始干活 · /schedule 定时任务' })
              : t('neo.group.placeholder', {
                  defaultValue: '在群里说话，Agents 开始干活 · @成员 定向派活 · /schedule 定时任务',
                })
          }
        />
      </div>

      {scheduleOpen && groupId && (
        <NeoQuickSchedule
          groupId={groupId}
          agentId={isDm ? dmAgentId : null}
          onClose={() => setScheduleOpen(false)}
          onCreated={handleScheduleCreated}
        />
      )}
    </div>
  );
}

export default NeoGroupChat;
