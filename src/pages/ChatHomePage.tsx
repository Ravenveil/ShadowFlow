import { useSearchParams } from 'react-router-dom';
import ChatPage from './ChatPage';
import { PersonalChatView } from './chat-home/PersonalChatView';

/**
 * ChatHomePage — /chat 入口。
 * 个人/团队 切换在 ChatRail 侧边栏顶部（M3b 三栏融合），本页通过 URL ?view= 联动：
 *   /chat              → 团队（原有群聊 ChatPage，零改）
 *   /chat?view=personal → 个人（PersonalChatView 单聊）
 * 工作区选择器也住进侧边栏（ChatRailHeader 团队态，切换下方/搜索上方）——
 * 不再占一条全宽顶条。
 */
export default function ChatHomePage() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view') === 'personal' ? 'personal' : 'team';
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      {view === 'personal' ? <PersonalChatView /> : <ChatPage />}
    </div>
  );
}
