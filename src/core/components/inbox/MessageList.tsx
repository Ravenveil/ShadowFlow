import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInboxStore } from '../../store/useInboxStore';
import type { GroupItem, AgentDMItem } from '../../../common/types/inbox';
import { MessageItem } from './MessageItem';
import { CreateGroupDialog } from './CreateGroupDialog';
import { InboxEmptyState } from './InboxEmptyState';
import { useDebounce } from '../../../common/hooks/useDebounce';
import { useI18n } from '../../../common/i18n';
import { useWorkspaceStore } from '../../../store/workspaceStore';

// 2026-06-11 — 取消「单聊/群聊」过滤：个人/团队 的区分已由 /chat 顶部
// 个人|团队 切换承载（个人=单聊、团队=单聊+群聊混合），收件箱不再重复一套
// 会话类型过滤。仅保留 全部 / 未读 两个读状态过滤。
type TabKey = 'all' | 'unread';

const PLACEHOLDER_TEMPLATE_ID = 'academic-paper';

export function MessageList() {
  const { t } = useI18n();
  const TABS: Array<{ key: TabKey; label: string }> = [
    { key: 'all', label: t('inbox.tabAll') },
    { key: 'unread', label: t('inbox.tabUnread') },
  ];
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { groups, agentDMs, loading, fetchInbox, selectedGroupId, selectGroup } = useInboxStore();
  const currentId = useWorkspaceStore((s) => s.currentId);
  const debouncedSearchText = useDebounce(searchText, 300);
  const effectiveSearchText = searchText.trim() ? debouncedSearchText : '';
  const normalizedKeyword = effectiveSearchText.trim().toLowerCase();

  useEffect(() => {
    fetchInbox(PLACEHOLDER_TEMPLATE_ID, currentId);
  }, [fetchInbox, currentId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isFocusShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isFocusShortcut) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchText('');
        searchInputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const tabCounts = useMemo(() => {
    const allItems = [...groups, ...agentDMs];
    return {
      all: groups.length + agentDMs.length,
      unread: allItems.filter((item) => item.unreadCount > 0).length,
    };
  }, [agentDMs, groups]);

  const matchesSearch = (target: string): boolean => {
    if (!normalizedKeyword) return true;
    return target.toLowerCase().includes(normalizedKeyword);
  };

  const matchesGroup = (group: GroupItem): boolean => {
    const matchesTab = activeTab === 'all' || (activeTab === 'unread' && group.unreadCount > 0);
    return matchesTab && (matchesSearch(group.name) || matchesSearch(group.lastMessage));
  };

  const matchesAgent = (agent: AgentDMItem): boolean => {
    const matchesTab = activeTab === 'all' || (activeTab === 'unread' && agent.unreadCount > 0);
    return matchesTab && (matchesSearch(agent.agentName) || matchesSearch(agent.lastMessage));
  };

  const filteredGroups = groups.filter(matchesGroup);
  const filteredDMs = agentDMs.filter(matchesAgent);
  const hasResults = filteredGroups.length > 0 || filteredDMs.length > 0;
  // 团队(群聊) + 单聊(DM) 两段都展示 = 混合视图，不再按会话类型互斥过滤。
  const showTeamSection = filteredGroups.length > 0;
  const showDMSection = filteredDMs.length > 0;

  return (
    <>
      <aside
        data-testid="message-list"
        className="flex w-full flex-1 flex-col overflow-y-auto bg-shadowflow-surface"
      >
        <div className="sticky top-0 z-10 border-b border-white/5 bg-shadowflow-surface/95 px-5 pb-4 pt-5 backdrop-blur">
          <div className="flex h-14 items-center justify-between">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white">{t('inbox.title')}</h2>
            <button
              type="button"
              data-testid="new-group-btn"
              onClick={() => setCreateGroupOpen(true)}
              className="rounded-sf bg-shadowflow-accent px-3 py-1.5 text-sm font-medium text-white"
            >
              {t('inbox.newGroup')}
            </button>
          </div>

          <label className="mt-1 block">
            <span className="sr-only">{t('inbox.searchLabel')}</span>
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t('inbox.searchPlaceholder')}
                className="h-10 w-full rounded-sf border border-white/10 bg-white/5 px-3 pr-10 text-sm text-white/90 outline-none placeholder:text-white/35"
              />
              {searchText && (
                <button
                  type="button"
                  aria-label={t('inbox.clearSearch')}
                  onClick={() => setSearchText('')}
                  className="absolute inset-y-0 right-3 text-sm text-white/45 transition hover:text-white/80"
                >
                  ×
                </button>
              )}
            </div>
          </label>

          <div role="tablist" aria-label="Inbox filters" className="mt-4 flex items-end gap-4">
            {TABS.map((tab) => {
              const active = tab.key === activeTab;
              const count = tabCounts[tab.key];
              const countClass =
                tab.key === 'unread' && count > 0 ? 'text-shadowflow-warn' : 'text-white/40';
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.key)}
                  className={`border-b-2 pb-2 text-sm transition ${
                    active
                      ? 'border-shadowflow-accent text-white'
                      : 'border-transparent text-white/45 hover:text-white/70'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1 text-[10px] ${countClass}`}>({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-5">
          {loading && <p className="text-center text-sm text-white/35">{t('inbox.loading')}</p>}

          {!loading && !hasResults && (
            <InboxEmptyState
              keyword={effectiveSearchText}
              onCreateGroup={() => setCreateGroupOpen(true)}
            />
          )}

          {showTeamSection && (
            <section>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/50">
                {t('inbox.teamRunsSection')}
              </p>
              <div className="mt-2 flex flex-col gap-1">
                {filteredGroups.map((g) => (
                  <MessageItem
                    key={g.id}
                    item={g}
                    selected={g.id === selectedGroupId}
                    onClick={() => { selectGroup(g.id); navigate(`/chat/${g.id}`); }}
                    highlightKeyword={effectiveSearchText}
                  />
                ))}
              </div>
            </section>
          )}

          {showDMSection && (
            <section className={showTeamSection ? 'mt-8' : ''}>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/50">
                {t('inbox.agentDMsSection')}
              </p>
              <div className="mt-2 flex flex-col gap-1">
                {filteredDMs.map((a) => (
                  <MessageItem
                    key={a.agentId}
                    item={a}
                    onClick={() => navigate(`/agent-dm/${a.agentId}`)}
                    highlightKeyword={effectiveSearchText}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>

      <CreateGroupDialog
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        templateId={PLACEHOLDER_TEMPLATE_ID}
      />
    </>
  );
}
