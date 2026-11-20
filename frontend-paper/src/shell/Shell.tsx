/**
 * Shell — 四栏工作台外壳：Rail / 会话列表 / 聊天 / 执行详情。
 *
 * 只负责**视图状态**（哪条会话、面板开关、设置开关），所有业务数据来自
 * `data/useWorkspace()`；数据源是 mock 还是 http 由 `data/source.ts` 决定，
 * 这里不认识任何一个具体数据文件。文案仍在 `content/app.ts`。
 */
import { useCallback, useMemo, useState } from 'react';
import { Rail } from './Rail';
import { SessionList } from './SessionList';
import { ChatArea } from './ChatArea';
import { AgentPanel } from './AgentPanel';
import { Settings } from './Settings';
import { CHAT, DEMO } from '../content/app';
import { DEFAULT_DM_ID, DEFAULT_SESSION_ID } from '../data/source';
import { useWorkspace } from '../data/useWorkspace';

export function Shell({ onExit }: { onExit: () => void }) {
  const { data, status, error, send, savePolicy, reload } = useWorkspace();
  const [activeId, setActiveId] = useState(DEFAULT_SESSION_ID);
  const [panelOpen, setPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const session = useMemo(
    () => data?.sessions.find((s) => s.id === activeId) ?? data?.sessions[0],
    [data, activeId],
  );
  const messages = useMemo(() => data?.threads[activeId] ?? [], [data, activeId]);

  const openDm = useCallback(() => setActiveId(DEFAULT_DM_ID), []);

  if (!data || !session) {
    return (
      <div className="shell shell--boot" data-panel="closed">
        <span className="shell-boot">
          {status === 'error' ? CHAT.loadError(error ?? '') : CHAT.loading}
        </span>
        {status === 'error' ? (
          <button className="shell-boot-retry" onClick={reload}>
            {CHAT.retry}
          </button>
        ) : null}
        <button className="shell-back" onClick={onExit} title={CHAT.backHome}>
          {CHAT.home}
        </button>
      </div>
    );
  }

  return (
    <div className="shell" data-panel={panelOpen ? 'open' : 'closed'}>
      <Rail onOpenSettings={() => setSettingsOpen(true)} />
      <SessionList
        sessions={data.sessions}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={openDm}
        onCollapse={openDm}
        currentAgent={DEMO.leadAuthor}
      />
      <ChatArea
        session={session}
        messages={messages}
        onSend={(text) => void send(activeId, text)}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((v) => !v)}
      />
      {panelOpen ? (
        <AgentPanel
          panel={data.panel}
          roster={data.roster}
          policy={data.policy}
          dag={data.dag}
          onSavePolicy={savePolicy}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <button className="shell-back" onClick={onExit} title={CHAT.backHome}>
        {CHAT.home}
      </button>
    </div>
  );
}
