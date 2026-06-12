/**
 * NewTaskComposer — 新任务 = 聊天（run-session 移植进中栏，不跳页）。
 *
 * 用户反馈定形：/chat?new=1 不是「今天要做什么?」的 start 复制品，而是
 * 一个真正的聊天界面——composer 常驻底部，发出第一条消息即创建 run，
 * run-session 左栏的 Timeline 就地流式渲染（thinking/步骤/产出全过程），
 * 全程留在聊天里；后续消息走 POST /:id/messages 多轮接力。
 *
 * 复用面（零改动）：useRunSession（SSE 订阅+reducer）、Timeline（渲染）、
 * createRunSession（含 provider/generation/BYOK header 注入）。
 * 右栏「工作区」tab 通过 window 'sf:run-created' 事件感知新 run 并刷新。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowUpRight, MessagesSquare } from 'lucide-react';
import { getApiBase, authHeaders } from '../../api/_base';
import { createRunSession } from '../../api/runSessions';
import { createGroup } from '../../api/groupApi';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useInboxStore } from '../../core/store/useInboxStore';
import { useRunSession } from '../../core/hooks/useRunSession';
import { Timeline } from '../../components/run-session/timeline/Timeline';
import {
  UnifiedComposer,
  type UnifiedComposerSubmitPayload,
} from '../../components/composer/UnifiedComposer';

// 与 StartPage SUGGESTIONS 同源的模板 chips（点击预填 goal）。
const SUGGESTIONS: Array<[string, string]> = [
  ['◇', '论文深读 — 找漏洞 + 写 review'],
  ['◈', '新闻编辑部 — 抓 → 编 → 审'],
  ['⬢', '创业速配 — BD/Dev/Marketing'],
  ['☷', '咨询小队 — 调研 + 报告'],
];

/** 活跃 run 的 Timeline 线程 — 单独子组件，useRunSession 需要非空 sessionId。 */
function ActiveRunThread({ sessionId }: { sessionId: string }) {
  const session = useRunSession(sessionId);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '10px 16px 0' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
            color: session.error ? 'var(--t-err)' : session.isComplete ? 'var(--t-ok, #16a34a)' : 'var(--t-accent)',
            background: session.error
              ? 'color-mix(in oklab, var(--t-err) 10%, transparent)'
              : session.isComplete
                ? 'color-mix(in oklab, var(--t-ok, #16a34a) 10%, transparent)'
                : 'var(--t-accent-tint)',
          }}
        >
          {!session.isComplete && !session.error && (
            <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', animation: 'sf-pulse 1.4s ease-in-out infinite' }} />
          )}
          {session.error ? '出错' : session.isComplete ? '已完成' : '运行中'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono, monospace)' }}>
          run #{sessionId.slice(0, 6)}
        </span>
        <span style={{ flex: 1 }} />
        <Link
          to={`/run-session/${sessionId}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--t-fg-4)', textDecoration: 'none' }}
        >
          完整视图 <ArrowUpRight size={11} aria-hidden />
        </Link>
      </div>
      <Timeline
        messages={session.messages}
        isComplete={session.isComplete}
        hasError={Boolean(session.error)}
      />
      {session.error && (
        <div style={{ flexShrink: 0, fontSize: 11.5, color: 'var(--t-err)', padding: '6px 0', textAlign: 'center' }}>
          {session.error.message}
          {session.error.hint ? <span style={{ color: 'var(--t-fg-4)' }}> · {session.error.hint}</span> : null}
        </div>
      )}
    </div>
  );
}

export function NewTaskComposer() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState('');
  // F3 — 新任务发首条消息即落成真会话（建群+B1 互链），左栏立刻有条目。
  const [taskGroup, setTaskGroup] = useState<{ id: string; name: string } | null>(null);
  const workspaceId = useWorkspaceStore((s) => s.currentId);

  // F1 — 提交逻辑注入 UnifiedComposer（完整能力：@技能/附件/模型/知识库都在聊天里）。
  // 抛错 → 组件内错误条显示。
  async function handleSubmit(p: UnifiedComposerSubmitPayload) {
    const text = p.text.trim();
    if (!text) return;
    try {
      if (!sessionId) {
        // F3 — 第一条消息：先落会话（建群，goal 前 20 字作名），再发起 run 并
        // 经 B1 互链挂到该群——run 过程从此归属这条会话（B2 群 timeline 可见）。
        // 建群失败不阻塞 run（降级回匿名会话），聊天体验优先。
        let groupId: string | undefined;
        try {
          const g = await createGroup({
            templateId: 'new-task',
            groupTemplateId: '',
            name: text.slice(0, 20),
            agentIds: [],
            memberEmails: [],
            policyMatrix: {},
            workspaceId: workspaceId ?? undefined,
          });
          groupId = g.groupId;
          setTaskGroup({ id: g.groupId, name: g.name });
          // 左栏立刻刷出新会话条目
          void useInboxStore.getState().fetchWorkspaceInbox(workspaceId ?? null);
        } catch {
          // Python 后端未启等 — 静默降级为匿名 run 会话
        }
        const resp = await createRunSession({
          goal: text,
          skill_name: p.skillName,
          mode: p.mode === 'auto' ? undefined : p.mode,
          group_id: groupId,
        });
        setSessionId(resp.session_id);
        window.dispatchEvent(new CustomEvent('sf:run-created'));
      } else {
        // 多轮接力 — daemon 对 follow-up 返回新 session_id，就地切换订阅
        const resp = await fetch(`${getApiBase()}/api/run-sessions/${sessionId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ content: text }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as { session_id?: string };
        if (data.session_id && data.session_id !== sessionId) {
          setSessionId(data.session_id);
          window.dispatchEvent(new CustomEvent('sf:run-created'));
        }
      }
    } catch (err) {
      throw new Error(
        `发送失败：${err instanceof Error ? err.message : String(err)}。请确认后端 server 在运行（:8002），或在「设置 → BYOK」配置 API Key。`,
      );
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      {sessionId ? (
        <>
          {taskGroup && (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px 0' }}>
              <MessagesSquare size={12} aria-hidden style={{ color: 'var(--t-fg-4)' }} />
              <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>会话已落地左栏：</span>
              <Link
                to={`/chat/${taskGroup.id}?timeline=1`}
                style={{ fontSize: 11, fontWeight: 600, color: 'var(--t-accent)', textDecoration: 'none' }}
              >
                {taskGroup.name} →
              </Link>
            </div>
          )}
          <ActiveRunThread sessionId={sessionId} />
        </>
      ) : (
        /* 空态 — 轻引导，不是整页 hero；聊天框在底部常驻 */
        <div className="pcv-empty" style={{ flex: 1 }}>
          <div className="pcv-empty-glyph"><Sparkles size={26} strokeWidth={1.75} /></div>
          {/* start 语义吸收——同款大标题,聊天即开始页 */}
          <div className="pcv-empty-title" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.01em' }}>今天要做什么？</div>
          <div className="pcv-empty-sub">下面直接发消息——组建团队、执行、产出，全过程就在这里流式展开</div>
          <div className="pcv-empty-hints">
            {SUGGESTIONS.map(([glyph, label]) => (
              <button
                key={label}
                type="button"
                className="pcv-hint"
                onClick={() => setPrefill(label)}
                style={{ cursor: 'pointer', border: 'none', font: 'inherit' }}
              >
                <span aria-hidden style={{ color: 'var(--t-accent)' }}>{glyph}</span> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 完整 composer 常驻底部（F1：@技能/命令/附件/模型/知识库 全在聊天里，
          不再需要"打开完整开始页"逃生链接；run 进行中也能继续发，多轮接力） */}
      <div style={{ flexShrink: 0, padding: '10px 16px 14px', borderTop: '1px solid var(--t-border)', background: 'var(--t-panel)' }}>
        <UnifiedComposer
          variant="chat"
          onSubmit={handleSubmit}
          initialText={prefill}
          placeholder={sessionId ? '补充指令，AI 会接着干 · 试试 @ 提及 Skill' : '描述一个目标，直接开干 · 试试 @ 提及 Skill 或 / 命令'}
        />
      </div>
    </div>
  );
}
