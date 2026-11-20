/**
 * Shell — 四栏工作台外壳：Rail / 会话列表 / 聊天 / 执行详情。
 *
 * 只负责「哪一栏、哪条会话、面板开关」这层状态；数据来自 `data/mock.ts`，
 * 文案在 `content/app.ts`。接真接口时替换数据来源即可，布局不用动。
 */
import { useCallback, useMemo, useState } from 'react';
import { Rail } from './Rail';
import { SessionList } from './SessionList';
import { ChatArea } from './ChatArea';
import { AgentPanel } from './AgentPanel';
import { Settings } from './Settings';
import { CHAT, DEMO } from '../content/app';
import { MESSAGES, SESSIONS } from '../data/mock';
import type { Message } from '../data/types';

/** 默认打开哪条会话（真接口接入后由路由/后端决定）。 */
const DEFAULT_SESSION = 'grp-paper';
const DEFAULT_SESSION_DM = 'lead';

function nowTime(): { t: number; label: string } {
  const t = new Date();
  const label = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  return { t: t.getTime(), label };
}

/** 演示态：主控对着用户消息回一句（接上后端就换成流式响应）。 */
function leadReply(text: string): Message {
  const { t, label } = nowTime();
  return {
    id: `m-${t}`,
    role: 'agent',
    author: DEMO.leadAuthor,
    time: label,
    kind: 'text',
    text: DEMO.leadReply(text),
  };
}

export function Shell({ onExit }: { onExit: () => void }) {
  const [activeId, setActiveId] = useState(DEFAULT_SESSION);
  const [panelOpen, setPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threads, setThreads] = useState<Record<string, Message[]>>(() => ({
    [DEFAULT_SESSION]: MESSAGES,
    [DEFAULT_SESSION_DM]: MESSAGES.slice(0, 2),
  }));

  const session = useMemo(() => SESSIONS.find((s) => s.id === activeId) ?? SESSIONS[0], [activeId]);
  const messages = threads[activeId] ?? [];

  const send = useCallback(
    (text: string) => {
      const { t, label } = nowTime();
      const mine: Message = { id: `u-${t}`, role: 'user', time: label, kind: 'text', text };
      setThreads((prev) => ({
        ...prev,
        [activeId]: [...(prev[activeId] ?? []), mine, leadReply(text)],
      }));
    },
    [activeId],
  );

  const openDm = useCallback(() => setActiveId(DEFAULT_SESSION_DM), []);

  return (
    <div className="shell" data-panel={panelOpen ? 'open' : 'closed'}>
      <Rail onOpenSettings={() => setSettingsOpen(true)} />
      <SessionList
        sessions={SESSIONS}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={openDm}
        onCollapse={openDm}
        currentAgent={DEMO.leadAuthor}
      />
      <ChatArea
        session={session}
        messages={messages}
        onSend={send}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((v) => !v)}
      />
      {panelOpen ? <AgentPanel onClose={() => setPanelOpen(false)} /> : null}
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <button className="shell-back" onClick={onExit} title={CHAT.backHome}>
        {CHAT.home}
      </button>
    </div>
  );
}
