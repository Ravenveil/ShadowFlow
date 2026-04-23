import { useState } from 'react';

type TabKey = 'all' | 'dm' | 'team' | 'unread';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'dm', label: '单聊' },
  { key: 'team', label: '群聊' },
  { key: 'unread', label: '未读' },
];

export function MessageList() {
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  return (
    <aside
      data-testid="message-list"
      className="flex w-[360px] flex-none flex-col overflow-y-auto border-r border-white/5 bg-shadowflow-surface"
    >
      <div className="sticky top-0 z-10 border-b border-white/5 bg-shadowflow-surface/95 px-5 pb-4 pt-5 backdrop-blur">
        <div className="flex h-14 items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white">Inbox</h1>
          <button
            type="button"
            onClick={() => console.log('TODO: Story 7.3')}
            className="rounded-sf bg-shadowflow-accent px-3 py-1.5 text-sm font-medium text-white"
          >
            + 新群聊
          </button>
        </div>

        <label className="mt-1 block">
          <span className="sr-only">搜索群聊 / agent / 消息</span>
          <input
            type="text"
            placeholder="搜索群聊 / agent / 消息…"
            className="h-10 w-full rounded-sf border border-white/10 bg-white/5 px-3 text-sm text-white/90 outline-none placeholder:text-white/35"
          />
        </label>

        <div role="tablist" aria-label="Inbox filters" className="mt-4 flex items-end gap-4">
          {TABS.map((tab) => {
            const active = tab.key === activeTab;
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
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-5">
        <section>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/45">TEAM RUNS</p>
          <div className="mt-3 rounded-sf border border-dashed border-white/10 px-4 py-5 text-sm text-white/35">
            暂无会话
          </div>
        </section>

        <section className="mt-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/45">AGENT DMs</p>
          <div className="mt-3 rounded-sf border border-dashed border-white/10 px-4 py-5 text-sm text-white/35">
            暂无会话
          </div>
        </section>
      </div>
    </aside>
  );
}
