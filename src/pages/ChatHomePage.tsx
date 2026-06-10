import { useState } from 'react';
import ChatPage from './ChatPage';
import { PersonalTeamToggle, type ChatHomeView } from './chat-home/PersonalTeamToggle';
import { PersonalChatView } from './chat-home/PersonalChatView';

/**
 * ChatHomePage — /chat 新入口（Step 1）。
 * 顶部「个人 / 团队」切换：团队=原有群聊 ChatPage（零改），个人=PersonalChatView。
 * 默认团队，保留旧 /chat 行为；切换用组件内 state（不引入新路由）。
 */
export default function ChatHomePage() {
  const [view, setView] = useState<ChatHomeView>('team');
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <div style={{ flexShrink: 0, padding: '8px 14px', borderBottom: '1px solid var(--t-border)', background: 'var(--t-panel)' }}>
        <PersonalTeamToggle view={view} onChange={setView} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {view === 'personal' ? <PersonalChatView /> : <ChatPage />}
      </div>
    </div>
  );
}
