import { useSearchParams } from 'react-router-dom';
import ChatPage from './ChatPage';
import { PersonalChatView } from './chat-home/PersonalChatView';
import { WorkbenchView } from './chat-home/WorkbenchView';
/* UI5.0(2026-08-14)— 聊天主页设计层(append-only,层叠在 index.css 之后) */
import './chat-home/ui50-chat-home.css';

/**
 * ChatHomePage — /chat 入口。
 * 个人/团队/工作台 切换在 ChatRail 侧边栏顶部（M3b 三栏融合），本页通过 URL ?view= 联动：
 *   /chat               → 团队（原有群聊 ChatPage，零改）
 *   /chat?view=personal → 个人（PersonalChatView 单聊）
 *   /chat?view=workbench → 三栏工作台（hermes/clawsgo：左挑 Agent/Team · 中对话 · 右项目文件）
 * 工作区选择器也住进侧边栏（ChatRailHeader 团队态，切换下方/搜索上方）——
 * 不再占一条全宽顶条。
 *
 * 2026-06-24 — IN-PLACE 三栏改造：workbench 是既有 chat 体验的「进化态」，与
 * team/personal 并列新增（只加不减，UI 保护规则）。不是新路由——仍是 /chat 这一页，
 * 由 ?view=workbench 分发到三栏工作台 WorkbenchView。
 */
export default function ChatHomePage() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      {view === 'workbench' ? (
        <WorkbenchView />
      ) : view === 'personal' ? (
        <PersonalChatView />
      ) : (
        <ChatPage />
      )}
    </div>
  );
}
