/**
 * FB-HiFi · Chat tab — 飞书骨架 + 钉钉 Org + 微信轻气泡 + Slack threads/reactions
 *
 * 顶层状态：activeConv / convMsgs / drawerOpen / provider
 * 子组件文件位于 chat/ 子目录
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatRail, type RailTab } from './chat/ChatRail';
import { ChatInbox } from './chat/ChatInbox';
import { ChatMain } from './chat/ChatMain';
import { ChatDrawer, type DrawerTab } from './chat/ChatDrawer';
import { RailTaskPanel } from './chat/RailTaskPanel';
import { RailCalendarPanel } from './chat/RailCalendarPanel';
import { RailDocPanel } from './chat/RailDocPanel';
import { RailBotPanel } from './chat/RailBotPanel';
import { INITIAL_CONV_MSGS } from './chat/mockData';
import type { ConvId, MsgItem } from './chat/types';
import { chatCompletion } from '../../api/chat';

export const LLM_PROVIDERS = ['zhipu', 'openai', 'claude', 'deepseek', 'ollama'] as const;
export type LLMProvider = (typeof LLM_PROVIDERS)[number];

const PROVIDER_COLORS: Record<LLMProvider, string> = {
  zhipu:    '#6366F1',
  openai:   '#10B981',
  claude:   '#F59E0B',
  deepseek: '#22D3EE',
  ollama:   '#A855F7',
};

export function TabChat() {
  const [railTab, setRailTab] = useState<RailTab>('msg');
  const [activeConv, setActiveConv] = useState<ConvId>('main');
  const [convMsgs, setConvMsgs] = useState<Record<ConvId, MsgItem[]>>(INITIAL_CONV_MSGS);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('Thread');

  const handleDrawerOpen = useCallback((tab: string) => {
    const valid: DrawerTab[] = ['Thread', '任务', '文档', 'Brief'];
    if (valid.includes(tab as DrawerTab)) {
      setDrawerTab(tab as DrawerTab);
    }
    setDrawerOpen(true);
  }, []);
  const [provider, setProvider] = useState<LLMProvider>('zhipu');

  // Keep refs in sync so handleSend always reads latest state without stale closure
  const convMsgsRef = useRef(convMsgs);
  const activeConvRef = useRef(activeConv);
  const providerRef = useRef(provider);
  useEffect(() => { convMsgsRef.current = convMsgs; }, [convMsgs]);
  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);
  useEffect(() => { providerRef.current = provider; }, [provider]);

  // AbortController so rapid messages cancel the previous in-flight request
  const abortRef = useRef<AbortController | null>(null);

  const handleSend = useCallback(async (text: string) => {
    // Cancel any previous in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const abort = new AbortController();
    abortRef.current = abort;

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const userMsgId = Date.now();
    const typingMsgId = userMsgId + 1;

    // 追加用户消息 + typing indicator
    setConvMsgs(prev => {
      const cur = prev[activeConv];
      const filtered = cur.filter(m => m.type !== 'typing');
      const newMsg: MsgItem = { type: 'user', id: userMsgId, name: '张明', time: timeStr, bodyText: text };
      const typingMsg: MsgItem = { type: 'typing', id: typingMsgId };
      return { ...prev, [activeConv]: [...filtered, newMsg, typingMsg] };
    });

    // 调用真实 LLM — 携带完整对话历史（最近 20 条 user/agent 消息）
    try {
      const history = (convMsgsRef.current[activeConvRef.current] ?? [])
        .filter((m): m is Extract<MsgItem, { type: 'user' | 'agent' }> =>
          m.type === 'user' || m.type === 'agent'
        )
        .slice(-20);
      const llmMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
        ...history.map(m => ({
          role: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.bodyText,
        })),
        { role: 'user' as const, content: text },
      ];
      const result = await chatCompletion(
        { messages: llmMessages },
        { provider: providerRef.current, signal: abort.signal },
      );
      const replyTime = (() => {
        const d = new Date();
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      })();
      setConvMsgs(prev => {
        const cur = prev[activeConv];
        const filtered = cur.filter(m => m.id !== typingMsgId);
        const replyMsg: MsgItem = {
          type: 'agent',
          id: Date.now(),
          agent: {
            glyph: result.provider.slice(0, 2).toUpperCase(),
            name: result.provider,
            role: result.model,
            model: result.model,
            color: PROVIDER_COLORS[result.provider as LLMProvider] ?? '#6366F1',
          },
          time: replyTime,
          bodyText: result.content,
        };
        return { ...prev, [activeConv]: [...filtered, replyMsg] };
      });
    } catch (err: unknown) {
      // Ignore aborted requests — user sent a newer message
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const errText = err instanceof Error ? err.message : String(err);
      const isNoKey = errText.includes('401') || errText.includes('NO_API_KEY');
      setConvMsgs(prev => {
        const cur = prev[activeConv];
        const filtered = cur.filter(m => m.id !== typingMsgId);
        const errMsg: MsgItem = {
          type: 'system',
          id: Date.now(),
          text: isNoKey
            ? `未设置 ${providerRef.current.toUpperCase()} API Key — 请点击右上角的 API Keys 按钮配置`
            : `LLM 请求失败：${errText}`,
        };
        return { ...prev, [activeConv]: [...filtered, errMsg] };
      });
    }
  }, [activeConv]);

  const handleAddReaction = useCallback((msgId: number, emo: string) => {
    setConvMsgs(prev => {
      const cur = prev[activeConv];
      const next = cur.map(m => {
        if (m.type !== 'agent' || m.id !== msgId) return m;
        const reactions = m.reactions ?? [];
        const idx = reactions.findIndex(([e]) => e === emo);
        const newReactions: [string, number][] = idx >= 0
          ? reactions.map((r, i) => i === idx ? [r[0], r[1] + 1] : r)
          : [...reactions, [emo, 1]];
        return { ...m, reactions: newReactions };
      });
      return { ...prev, [activeConv]: next };
    });
  }, [activeConv]);

  return (
    <>
      <ChatRail active={railTab} onActiveChange={setRailTab} />
      {railTab === 'msg' && (
        <>
          <ChatInbox activeConv={activeConv} setActiveConv={setActiveConv} />
          <ChatMain
            conv={activeConv}
            messages={convMsgs[activeConv]}
            onSend={handleSend}
            onAddReaction={handleAddReaction}
            onThreadOpen={() => handleDrawerOpen('Thread')}
            onDrawerOpen={handleDrawerOpen}
            provider={provider}
            onProviderChange={setProvider}
          />
          {drawerOpen && <ChatDrawer onClose={() => setDrawerOpen(false)} initialTab={drawerTab} />}
        </>
      )}
      {railTab === 'task' && <RailTaskPanel />}
      {railTab === 'cal' && <RailCalendarPanel />}
      {railTab === 'doc' && <RailDocPanel />}
      {railTab === 'bot' && <RailBotPanel />}
    </>
  );
}
