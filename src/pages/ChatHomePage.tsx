import { useSearchParams } from 'react-router-dom';
import ChatPage from './ChatPage';
import { PersonalChatView } from './chat-home/PersonalChatView';
import { WorkspaceSelector } from '../components/workspace/WorkspaceStrip';

/**
 * ChatHomePage — /chat 入口。
 * 个人/团队 切换已上移到全局侧栏顶部（clawsgo 式），本页通过 URL ?view= 联动：
 *   /chat              → 团队（原有群聊 ChatPage，零改）
 *   /chat?view=personal → 个人（PersonalChatView 单聊）
 * 顶部条改放「工作区选择器」（从侧栏顶部迁来）。
 */
export default function ChatHomePage() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view') === 'personal' ? 'personal' : 'team';
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <div style={{ flexShrink: 0, padding: '8px 14px', borderBottom: '1px solid var(--t-border)', background: 'var(--t-panel)', display: 'flex', alignItems: 'center' }}>
        <div style={{ width: 260, maxWidth: '60%' }}>
          <WorkspaceSelector />
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {view === 'personal' ? <PersonalChatView /> : <ChatPage />}
      </div>
    </div>
  );
}
