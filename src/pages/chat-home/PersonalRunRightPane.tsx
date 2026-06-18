/**
 * PersonalRunRightPane — 个人态 run 进行时的右栏（2026-06-18）。
 *
 * 用户反馈：个人态 run 只有左半 Timeline，缺 run-session 的右半标签页
 * （Overview/Team/Agent/Preview），不是完整界面。本包装把 run-session 的
 * 右栏 RunSessionRightPane 原样搬进个人界面——左 ActiveRunThread + 右本组件
 * = 完整 run-session。run 活跃时 PersonalChatView 用它顶替 PersonalRightPane。
 *
 * 自带 useRunSession 订阅（与中栏 ActiveRunThread 各订一份同一 /stream，后端
 * 广播支持多 attach）；saveState='idle' 隐藏 run-session 页的「去聊天」悬浮
 * dock（个人态已在 /chat 内，无需）。
 */
import { useNavigate } from 'react-router-dom';
import { useRunSession } from '../../core/hooks/useRunSession';
import { RunSessionRightPane } from '../RunSessionPage';

export function PersonalRunRightPane({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const session = useRunSession(sessionId);
  return (
    <div style={{ width: 360, flexShrink: 0, borderLeft: '1px solid var(--t-border)', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <RunSessionRightPane
        session={session}
        sessionId={sessionId}
        onNavigate={navigate}
        chatGroupId={null}
        saveState="idle"
      />
    </div>
  );
}
