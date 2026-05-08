/**
 * ChatMain — 中央 Chat 主列（Header + PinnedBrief + Messages + Composer）
 *
 * P0 修复：messages 现在是 prop（来自 TabChat 顶层 Record<ConvId, MsgItem[]>）。
 * 切换会话立即换列表，不再共享。
 */

import { useState, useRef, useEffect } from 'react';
import { FBAv, FBIcons } from '../FBAtoms';
import { CI } from './icons';
import { LLM_PROVIDERS, type LLMProvider } from '../TabChat';
import {
  DayDivider, SystemNote, SystemCard, AgentMsg, UserMsg,
  ApprovalGate, TypingIndicator,
} from './messages';
import { Composer } from './Composer';
import { CONV_TITLES } from './mockData';
import type { ConvId, MsgItem } from './types';

interface ChatHeaderProps {
  conv: ConvId;
  onSearchToggle?: () => void;
  onDrawerOpen?: (tab: string) => void;
}

function ChatHeader({ conv, onSearchToggle, onDrawerOpen }: ChatHeaderProps) {
  return (
    <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--t-border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--skin-panel)', flexShrink: 0 }}>
      <span style={{
        width: 36, height: 36, borderRadius: 8, background: 'var(--bg-elev-3)', border: '1px solid var(--t-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-bright)',
      }}>
        <span style={{ width: 18, height: 18, display: 'flex' }}>{FBIcons.hash}</span>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span data-testid="chat-title" style={{ fontSize: 14, fontWeight: 700 }}>{CONV_TITLES[conv]}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-5)' }}>· 5 人</span>
          <span className="fb-dot fb-dot-ok" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)' }}>4 在线</span>
          {conv === 'main' && <span className="fb-pill-live">RUNNING · #042</span>}
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
            padding: '1px 6px', borderRadius: 4, border: '1px solid var(--t-border)',
            background: 'var(--bg-elev-2)', color: 'var(--fg-4)',
          }}>POLICY · L2-strict</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'flex' }}>
            {[['读', 'var(--t-accent)'], ['批', 'var(--t-warn)'], ['查', 'var(--t-gated, var(--t-accent))'], ['写', 'var(--t-err)'], ['审', 'var(--t-ok)']].map(([g, c], i) => (
              <span key={i} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 5 - i }}>
                <FBAv glyph={g} color={c} size={18} square />
              </span>
            ))}
          </span>
          <span>started 09:14 · run 12m</span>
        </div>
      </div>
      <button className="fb-btn fb-btn-ghost fb-btn-sm" style={{ display: 'flex', gap: 5, alignItems: 'center' }} onClick={() => onDrawerOpen?.('Brief')}>
        <span style={{ width: 13, height: 13, display: 'flex' }}>{FBIcons.dag}</span> DAG
      </button>
      <button className="fb-btn fb-btn-icon" title="搜索" onClick={onSearchToggle}><span style={{ width: 14, height: 14, display: 'flex' }}>{FBIcons.search}</span></button>
      <button className="fb-btn fb-btn-icon" title="任务" onClick={() => onDrawerOpen?.('任务')}><span style={{ width: 14, height: 14, display: 'flex' }}>{CI.task}</span></button>
      <button className="fb-btn fb-btn-icon" title="成员" onClick={() => onDrawerOpen?.('Thread')}><span style={{ width: 14, height: 14, display: 'flex' }}>{FBIcons.users}</span></button>
      <button className="fb-btn fb-btn-icon" title="更多" onClick={() => onDrawerOpen?.('文档')}><span style={{ width: 14, height: 14, display: 'flex' }}>{FBIcons.more}</span></button>
    </div>
  );
}

function PinnedBrief() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      padding: '9px 18px', borderBottom: '1px solid var(--t-border)',
      background: 'color-mix(in oklab, var(--t-accent) 5%, var(--bg-elev-1))',
      display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0,
    }}>
      <span style={{ color: 'var(--t-accent)', display: 'flex', marginTop: 1, width: 14, height: 14 }}>{CI.pin}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, color: 'var(--accent-bright)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>BRIEF · run #042</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-4)' }}>由 张明 置顶 · 09:14</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 3, lineHeight: 1.45 }}>
          <b>目标</b> 深读 arXiv:2410.11215，找出方法/实验中的不一致，重写有问题段落 ·
          <b style={{ marginLeft: 6 }}>SLA</b> 30min ·
          <b style={{ marginLeft: 6 }}>预算</b> 5k tokens ·
          <b style={{ marginLeft: 6 }}>Gate</b> CRITIC → REVIEW
        </div>
        {expanded && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--fg-3)', lineHeight: 1.55 }}>
            <div><b>参与 Agents：</b> 读读 (Reader) · 阿批 (Critic) · 查查 (Checker) · 小写 (Writer) · 审审 (Reviewer)</div>
            <div style={{ marginTop: 4 }}><b>当前阶段：</b> 小写正在执行 r2/3 重写 → 等待 审审 最终过审</div>
          </div>
        )}
      </div>
      <span onClick={() => setExpanded(e => !e)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-4)', cursor: 'pointer', flexShrink: 0 }}>
        {expanded ? '收起 ▴' : '展开 ▾'}
      </span>
    </div>
  );
}

interface ChatMainProps {
  conv: ConvId;
  messages: MsgItem[];
  onSend: (text: string) => void;
  onAddReaction: (msgId: number, emo: string) => void;
  onThreadOpen: () => void;
  onDrawerOpen?: (tab: string) => void;
  provider?: LLMProvider;
  onProviderChange?: (p: LLMProvider) => void;
}

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  zhipu:    '智谱',
  openai:   'OpenAI',
  claude:   'Claude',
  deepseek: 'DeepSeek',
  ollama:   'Ollama',
};

export function ChatMain({ conv, messages, onSend, onAddReaction, onThreadOpen, onDrawerOpen, provider = 'zhipu', onProviderChange }: ChatMainProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conv, messages.length]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--t-bg)', minHeight: 0 }}>
      <ChatHeader conv={conv} onSearchToggle={() => setSearchOpen(o => !o)} onDrawerOpen={onDrawerOpen} />
      {searchOpen && (
        <div style={{
          padding: '8px 18px', borderBottom: '1px solid var(--t-border)', background: 'var(--bg-elev-1)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <span style={{ width: 14, height: 14, display: 'flex', color: 'var(--fg-4)' }}>{FBIcons.search}</span>
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索消息…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 12, color: 'var(--fg-1)', fontFamily: 'inherit',
            }}
          />
          <span onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
            style={{ fontSize: 10, color: 'var(--fg-4)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>ESC</span>
        </div>
      )}
      {conv === 'main' && <PinnedBrief />}
      <div ref={scrollRef} data-testid="chat-messages" style={{ flex: 1, overflow: 'auto', padding: '14px 22px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-5)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            暂无消息
          </div>
        )}
        {messages.map(m => {
          if (m.type === 'divider') return <DayDivider key={m.id} label={m.label} />;
          if (m.type === 'system') return <SystemNote key={m.id} text={m.text} />;
          if (m.type === 'policy') return (
            <SystemCard key={m.id} tone="reject" tag="POLICY MATRIX · REJECT" body={
              <>阿批 → 小写 · reason <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-reject)' }}>"missing baseline data"</span><br />rollback to <span style={{ fontFamily: 'var(--font-mono)' }}>draft.v2</span> · ckpt.saved · awaiting retry <span style={{ fontFamily: 'var(--font-mono)' }}>r2/3</span></>
            } />
          );
          if (m.type === 'gate') return <ApprovalGate key={m.id} />;
          if (m.type === 'typing') return <TypingIndicator key={m.id} />;
          if (m.type === 'agent') return (
            <AgentMsg key={m.id}
              msgId={m.id}
              agent={m.agent} time={m.time}
              body={<span style={{ whiteSpace: 'pre-wrap' }}>{m.bodyText}</span>}
              tool={m.tool} reactions={m.reactions} thread={m.thread} readBy={m.readBy}
              onAddReaction={onAddReaction}
              onThreadOpen={onThreadOpen}
            />
          );
          if (m.type === 'user') return (
            <UserMsg key={m.id} name={m.name} time={m.time}
              body={m.bodyText} reply={m.reply}
            />
          );
          return null;
        })}
      </div>
      {/* Provider selector strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 18px 4px', borderTop: '1px solid var(--t-border)', background: 'var(--bg-elev-1)', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-4)', letterSpacing: '0.05em', marginRight: 4 }}>LLM</span>
        {LLM_PROVIDERS.map(p => (
          <button
            key={p}
            data-testid={`provider-btn-${p}`}
            onClick={() => onProviderChange?.(p)}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 4,
              border: p === provider ? '1px solid var(--accent-bright)' : '1px solid var(--t-border)',
              background: p === provider ? 'var(--accent-bright)' : 'transparent',
              color: p === provider ? 'var(--t-accent-ink)' : 'var(--fg-3)',
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            {PROVIDER_LABELS[p]}
          </button>
        ))}
      </div>
      <Composer onSend={onSend} />
    </div>
  );
}
