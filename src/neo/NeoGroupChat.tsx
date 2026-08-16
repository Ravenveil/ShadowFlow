/**
 * NeoGroupChat — 群聊现场页（Neo 形态，2026-08-15 Polynoia 对标；
 * 2026-08-16 W1-C 视觉/信息呈现层重做，数据链路不动）。
 *
 * 单聊（NeoChat）里编排者拆解派发后，agents 的干活现场就在这里：
 *   - 数据：useGroupTimeline（B2 统一读路径 GET /api/groups/:id/timeline
 *     + 群 SSE + 活跃 run 的 /stream 订阅）——聊天消息与 run 过程卡已在
 *     服务端归并为统一 TimelineMessage 流
 *   - 渲染：NeoTimeline（./NeoTimeline，阶段 2.5 Neo 原生渲染层，只读）——
 *     本页在其外面包两层纯前端结构，不改 NeoTimeline 源文件：
 *       1) 按 turn_id 分组成「消息块」（用户发言 + 该轮 agent 回复/过程卡）
 *       2) 按消息 ts（本地日）把 turn 分日，日界处插入灰字居中分隔行
 *     每个 turn 块 hover 时在右上角浮出相对时间（刚刚/N 分钟前/HH:mm）。
 *   - 成员露出：顶栏右侧头像条，从 timeline 消息的 sender_name/agent_id
 *     与 plan_card 任务 assignee 去重推导（纯前端，无 mock；推导不出不渲染）
 *   - 发言：NeoComposer → postGroupMessage（sender_kind=user）→ 网关
 *     runFanout 触发新一轮 INTENT_PARSE → 分层派发（在群里说话即派活）
 *
 * 入口：NeoRail 群列表行 / NeoChat 顶栏「群聊现场」跳转（session ↔ group
 * 经 B1 互链反查）。样式全部在 neo-group.css（--t-* token，day/night 安全）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, UsersRound } from 'lucide-react';
import { useGroupTimeline } from '../core/hooks/useGroupTimeline';
import { getGroup, postGroupMessage } from '../api/groupApi';
import { NeoTimeline } from './NeoTimeline';
import type { TimelineMessage } from '../components/run-session/timeline/types';
import { useI18n } from '../common/i18n';
import { NeoComposer, type UnifiedComposerSubmitPayload } from './NeoComposer';
import './neo-chat.css'; // composer 容器/发送钮基样式（.neo-chat-composer / .neo-composer）
import './neo-group.css';

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

/** 头像条最多叠 5 个，其余收进 +N。 */
const MEMBER_STACK_MAX = 5;

/* ── 组件 ─────────────────────────────────────────────────────────────────── */

export function NeoGroupChat() {
  const { groupId } = useParams<{ groupId: string }>();
  const { t } = useI18n();

  const timeline = useGroupTimeline(groupId ?? null);

  // 群名（getGroup 失败 → 退化用 groupId，不阻塞页面）
  const [groupName, setGroupName] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState<number>(0);
  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    getGroup(groupId)
      .then((g) => {
        if (!alive || !g) return;
        setGroupName(g.name);
        setMemberCount(g.agent_ids?.length ?? 0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [groupId]);

  // 活跃 run → composer 显示 Stop 视觉 + 顶栏 live 徽章
  const busy = timeline.runs.some((r) => r.status === 'running');

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

  // 块 hover 相对时间：当天 = 刚刚/N 分钟前/N 小时前；跨天 = HH:mm（日期由分隔行承担）
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

  // 消息流 → 日分段（每段内按 turn 分块渲染多个只读 NeoTimeline）
  const daySegments = useMemo(() => segmentByDay(groupByTurn(timeline.messages)), [timeline.messages]);

  // 成员头像条（纯前端推导；推导不出 → 不渲染）
  const members = useMemo(() => deriveMembers(timeline.messages), [timeline.messages]);
  const stackedMembers = members.slice(0, MEMBER_STACK_MAX);
  const overflowCount = members.length - stackedMembers.length;

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
    <div className="neo-gc">
      <header className="neo-gc-topbar">
        <Link
          to="/"
          className="neo-gc-back"
          aria-label={t('neo.group.back', { defaultValue: '返回' })}
        >
          <ArrowLeft size={14} strokeWidth={1.9} aria-hidden />
        </Link>
        <span className="neo-gc-title">
          <UsersRound size={13} strokeWidth={1.9} aria-hidden className="neo-gc-title-icon" />
          <strong>{groupName ?? groupId.slice(0, 8)}</strong>
          {memberCount > 0 && (
            <span className="neo-gc-title-count">
              {'· '}
              {t('neo.group.members', { defaultValue: '{{count}} 个 Agent', count: memberCount })}
            </span>
          )}
        </span>
        {members.length > 0 && (
          <span
            className="neo-gc-members"
            title={members.map((m) => m.name).join('、')}
            data-testid="neo-gc-members"
          >
            <span className="neo-gc-member-stack">
              {stackedMembers.map((m) => (
                <span
                  key={m.key}
                  className="neo-gc-member"
                  style={{ background: gcAvatarColor(m.key) }}
                  aria-hidden
                >
                  {gcAvatarInitial(m.name)}
                </span>
              ))}
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
        {busy && (
          <span className="neo-gc-live" data-testid="neo-group-live">
            <span className="neo-gc-live-dot" aria-hidden />
            {t('neo.group.live', { defaultValue: '执行中' })}
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
                {t('neo.group.emptyTitle', { defaultValue: '群里还没有动静' })}
              </span>
              <span className="neo-gc-state-hint">
                {t('neo.group.emptyHint', { defaultValue: '在下面说句话，Agents 就开始干活' })}
              </span>
            </div>
          ) : (
            daySegments.map((seg) => (
              <div className="neo-gc-day" key={seg.key}>
                <div className="neo-gc-day-divider" role="separator">
                  <span className="neo-gc-day-label">{dayLabel(seg.ts)}</span>
                </div>
                {seg.turns.map((turn) => (
                  <section className="neo-gc-turn" key={turn.turnId}>
                    <NeoTimeline messages={turn.messages} />
                    {turn.ts > 0 && (
                      <span className="neo-gc-turn-time" aria-hidden>
                        {relTime(turn.ts)}
                      </span>
                    )}
                  </section>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="neo-chat-composer neo-gc-composer">
        <NeoComposer
          variant="chat"
          onSubmit={handleSubmit}
          streaming={busy}
          placeholder={t('neo.group.placeholder', {
            defaultValue: '在群里说话，Agents 开始干活 · 拆解/派发/合并全程可见',
          })}
        />
      </div>
    </div>
  );
}

export default NeoGroupChat;
