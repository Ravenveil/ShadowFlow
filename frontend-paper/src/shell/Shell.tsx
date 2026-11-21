/**
 * Shell — 四栏工作台外壳：Rail / 会话列表 / 聊天 / 执行详情。
 *
 * 只负责**视图状态**（哪条会话、面板开关、设置开关），所有业务数据来自
 * `data/useWorkspace()`；数据源是 mock 还是 http 由 `data/source.ts` 决定，
 * 这里不认识任何一个具体数据文件。文案仍在 `content/app.ts`。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Rail } from './Rail';
import { SessionList } from './SessionList';
import { ChatArea } from './ChatArea';
import { AgentPanel } from './AgentPanel';
import { SettingsSheet, type SettingsSection } from '../settings/SettingsSheet';
import { CHAT, DEMO } from '../content/app';
import type { Outbound } from '../data/types';
import { DEFAULT_SESSION_ID } from '../data/source';
import { useWorkspace } from '../data/useWorkspace';
import { downloadJson } from '../ui/download';

export function Shell({ onExit }: { onExit: () => void }) {
  const {
    data,
    status,
    error,
    send,
    sending,
    stop,
    watch,
    focus,
    transcribe,
    savePolicy,
    patchSettings,
    savingSettings,
    rescanCli,
    testSsh,
    reset,
    reload,
  } = useWorkspace();
  /**
   * 演示态的默认会话；接真后端时这个 id 不存在，会自动回落到列表第一条
   * （消息按**解析出来的** session.id 取，所以回落也不会串号）。
   */
  const [activeId, setActiveId] = useState(DEFAULT_SESSION_ID);
  const [panelOpen, setPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance');
  /** 选中的模型 id；空表示还没选过，用数据里的第一个。 */
  const [modelId, setModelId] = useState<string | null>(null);

  const session = useMemo(
    () => data?.sessions.find((s) => s.id === activeId) ?? data?.sessions[0],
    [data, activeId],
  );
  /** 消息永远跟着**解析出来的**会话走（activeId 可能是空或已失效的旧 id）。 */
  const messages = useMemo(
    () => (session ? (data?.threads[session.id] ?? []) : []),
    [data, session],
  );

  const openDm = useCallback(() => {
    const dm = data?.sessions.find((s) => s.kind === 'dm');
    if (dm) setActiveId(dm.id);
  }, [data]);

  const select = useCallback((id: string) => setActiveId(id), []);

  // 切会话：右栏那块（编队 / 策略 / 工作流 / 执行）跟着换。
  // 数据里记着这四块属于哪条会话（`focused`），不一致才重取，首屏不重复拉。
  useEffect(() => {
    if (session && data && data.focused !== session.id) focus(session.id);
  }, [session?.id, data?.focused, focus]);

  // 订阅当前会话的后续消息（真后端走 SSE；演示态没有订阅，等于空操作）
  useEffect(() => {
    if (!session) return;
    return watch(session.id);
  }, [session?.id, watch]);

  const sendOut = useCallback(
    (out: Outbound) => (session ? send(session.id, out) : Promise.resolve()),
    [session, send],
  );

  /** 导出：把当前工作区（会话 / 策略 / 设置）落成一个 JSON 文件。 */
  const exportWorkspace = useCallback(() => {
    if (!data) return;
    downloadJson('shadowflow-workspace.json', {
      exportedAt: new Date().toISOString(),
      sessions: data.sessions,
      threads: data.threads,
      panel: data.panel,
      policy: data.policy,
      dag: data.dag,
      settings: data.settings,
    });
  }, [data]);

  if (!data || !session) {
    return (
      <div className="shell shell--boot" data-panel="closed">
        <span className="shell-boot">
          {status === 'error' ? CHAT.loadError(error ?? '') : CHAT.loading}
        </span>
        {status === 'error' ? (
          <>
            <span className="shell-boot-hint">{CHAT.loadErrorHint}</span>
            <button className="shell-boot-retry" onClick={reload}>
              {CHAT.retry}
            </button>
          </>
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
        activeId={session.id}
        onSelect={select}
        onNew={openDm}
        onCollapse={openDm}
        currentAgent={DEMO.leadAuthor}
      />
      <ChatArea
        session={session}
        messages={messages}
        roster={data.roster}
        composer={data.composer}
        model={modelId ?? data.composer.models[0]?.id ?? ''}
        onModelChange={setModelId}
        sending={sending}
        onSend={sendOut}
        onStop={() => stop(session.id)}
        transcribe={transcribe}
        onInspect={() => setPanelOpen(true)}
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
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        section={settingsSection}
        onSection={setSettingsSection}
        settings={data.settings}
        saving={savingSettings}
        onPatch={(patch) => void patchSettings(patch)}
        onRescanCli={rescanCli}
        onTestSsh={testSsh}
        onExport={exportWorkspace}
        onReset={reset}
      />
      <button className="shell-back" onClick={onExit} title={CHAT.backHome}>
        {CHAT.home}
      </button>
    </div>
  );
}
