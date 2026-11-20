import { useCallback, useMemo, useState } from 'react';
import { Rail } from './Rail';
import { SessionList } from './SessionList';
import { ChatArea } from './ChatArea';
import { AgentPanel } from './AgentPanel';
import { Settings } from './Settings';
import { MESSAGES, SESSIONS } from '../data/mock';
import type { Message } from '../data/types';

/** 一句主控应答模板 —— 真实接入前，让对话有来有回。 */
function leadReply(text: string): Message {
  const t = new Date();
  const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  return {
    id: `m-${t.getTime()}`,
    role: 'agent',
    author: '主控',
    time,
    kind: 'text',
    text: `收到，我按这条推进：${text.slice(0, 40)}${text.length > 40 ? '…' : ''}\n\n先拆成可执行的步骤，再分给对应的角色。中途要你拍板的地方，我会单独挂出来，不打断你别的活。`,
  };
}

export function Shell({ onExit }: { onExit: () => void }) {
  const [activeId, setActiveId] = useState('grp-paper');
  const [panelOpen, setPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threads, setThreads] = useState<Record<string, Message[]>>(() => ({
    'grp-paper': MESSAGES,
    lead: MESSAGES.slice(0, 2),
  }));

  const session = useMemo(
    () => SESSIONS.find((s) => s.id === activeId) ?? SESSIONS[0],
    [activeId],
  );
  const messages = threads[activeId] ?? [];

  const send = useCallback(
    (text: string) => {
      const t = new Date();
      const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      const mine: Message = {
        id: `u-${t.getTime()}`,
        role: 'user',
        time,
        kind: 'text',
        text,
      };
      setThreads((prev) => ({
        ...prev,
        [activeId]: [...(prev[activeId] ?? []), mine, leadReply(text)],
      }));
    },
    [activeId],
  );

  return (
    <div className="shell" data-panel={panelOpen ? 'open' : 'closed'}>
      <Rail onOpenSettings={() => setSettingsOpen(true)} />
      <SessionList
        sessions={SESSIONS}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={() => setActiveId('lead')}
        onCollapse={() => setActiveId('lead')}
        currentAgent="主控"
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
      <button className="shell-back" onClick={onExit} title="回到首页">
        首页
      </button>
    </div>
  );
}
