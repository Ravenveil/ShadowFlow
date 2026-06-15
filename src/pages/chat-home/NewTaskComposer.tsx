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
import { ArrowUpRight, MessagesSquare } from 'lucide-react';
import { getApiBase, authHeaders } from '../../api/_base';
import { createRunSession } from '../../api/runSessions';
import { createGroup } from '../../api/groupApi';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useInboxStore } from '../../core/store/useInboxStore';
import { useRunSession } from '../../core/hooks/useRunSession';
import { Timeline } from '../../components/run-session/timeline/Timeline';
import { ArtifactPreview } from '../../components/ArtifactPreview';
import {
  UnifiedComposer,
  type UnifiedComposerSubmitPayload,
} from '../../components/composer/UnifiedComposer';
import { StartLanding } from './StartLanding';

function filenameOf(url: string): string | undefined {
  try {
    const u = new URL(url, window.location.origin);
    return u.pathname.split('/').filter(Boolean).pop() ?? undefined;
  } catch {
    return url.split('/').filter(Boolean).pop() ?? undefined;
  }
}

/**
 * 活跃 run 的融合视图（run-session 进聊天，对标扣子/clawsgo）：
 *   左 = 对话 + 思考/执行过程（Timeline）
 *   右 = 工件预览（ArtifactPreview，run 产出工件后自动滑出；无工件时左栏全宽）
 * useRunSession 需要非空 sessionId，故单独子组件。
 */
function ActiveRunThread({ sessionId }: { sessionId: string }) {
  const session = useRunSession(sessionId);
  const hasPreview = !!session.artifactUrl;

  const statusPill = (
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
  );

  const left = (
    <div style={{ flex: hasPreview ? '0 0 50%' : 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '10px 16px 0', borderRight: hasPreview ? '1px solid var(--t-border)' : undefined }}>
      {statusPill}
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

  if (!hasPreview) return <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>{left}</div>;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', animation: 'sf-peek-fade var(--dur-2) var(--ease-out)' }}>
      {left}
      {/* 右栏 = 工件预览（run-session 右半部分进聊天） */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--t-bg)' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px', borderBottom: '1px solid var(--t-border)', background: 'var(--t-panel)' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--t-fg-2)' }}>预览</span>
          <span style={{ fontSize: 10.5, color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {filenameOf(session.artifactUrl!)}
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ArtifactPreview
            url={session.artifactUrl!}
            type={session.artifactType}
            content={session.blueprintYaml ?? ''}
            sessionId={sessionId}
            filename={filenameOf(session.artifactUrl!)}
            isComplete={session.isComplete}
          />
        </div>
      </div>
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
        /* start 形态（港 v2-start-hifi 富设计）：点阵背景 + 渐变 hero + 模板画廊 +
           真实最近 run；composer 由下方常驻。 */
        <StartLanding onPickTemplate={(token) => setPrefill(token)} />
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
