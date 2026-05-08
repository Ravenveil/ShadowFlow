/**
 * Chat tab 消息组件（包括 system / agent / user / gate / typing）
 */

import React, { memo, useState } from 'react';
import { FBAv, FBIcons } from '../FBAtoms';
import { CI } from './icons';
import type { AgentMeta } from './types';
import { MemoryRecallRow } from '../../chat/MemoryRecallRow';

export const DayDivider = memo(function DayDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--t-border)' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)', padding: '2px 10px', borderRadius: 10, background: 'var(--t-panel)', border: '1px solid var(--t-border)', fontWeight: 600 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--t-border)' }} />
    </div>
  );
});

export const SystemNote = memo(function SystemNote({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', padding: '4px 10px', background: 'var(--t-panel)', borderRadius: 6, border: '1px dashed var(--t-border)' }}>{text}</span>
    </div>
  );
});

export const SystemCard = memo(function SystemCard({ tone, tag, body }: { tone: string; tag: string; body: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{
        display: 'flex', gap: 10, padding: '11px 13px', borderRadius: 9, maxWidth: 540,
        background: tone === 'reject' ? 'color-mix(in oklab, var(--status-reject) 10%, var(--t-panel))' : 'var(--t-panel)',
        border: `1px solid color-mix(in oklab, var(--status-${tone}) 35%, transparent)`,
      }}>
        <span className={`fb-dot fb-dot-${tone}`} style={{ marginTop: 6 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: `var(--status-${tone})`, marginBottom: 3 }}>{tag}</div>
          <div style={{ fontSize: 11.5, color: 'var(--t-fg-2)', lineHeight: 1.5 }}>{body}</div>
        </div>
      </div>
    </div>
  );
});

interface AgentMsgProps {
  msgId: number;
  agent: AgentMeta;
  time: string;
  body: React.ReactNode;
  edited?: boolean;
  tool?: { name: string; meta: string };
  reactions?: [string, number][];
  thread?: { count: number; last: string };
  readBy?: string;
  memoriesRecalled?: number;
  onAddReaction?: (msgId: number, emo: string) => void;
  onThreadOpen?: () => void;
}

/**
 * AgentMsg — 修复点：reactions 是 controlled prop，由顶层 state 通过 msgId 持有，
 * 不再用 useState 初始化（避免会话切换时旧 reaction 残留）。
 */
export const AgentMsg = memo(function AgentMsg({
  msgId, agent, time, body, edited, tool, reactions, thread, readBy, memoriesRecalled, onAddReaction, onThreadOpen,
}: AgentMsgProps) {
  return (
    <div style={{ display: 'flex', gap: 10, position: 'relative' }} className="fb-msg">
      <span style={{ position: 'relative' }}>
        <FBAv glyph={agent.glyph} color={agent.color} size={32} square />
        <span style={{
          position: 'absolute', right: -3, bottom: -3, width: 14, height: 14, borderRadius: 4,
          background: 'var(--t-panel)', border: '1px solid var(--t-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: agent.color,
        }}><span style={{ width: 9, height: 9, display: 'flex' }}>{CI.bot}</span></span>
      </span>
      <div style={{ flex: 1, minWidth: 0, maxWidth: 680, borderLeft: `2px solid ${agent.color}`, paddingLeft: 11 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t-fg)' }}>{agent.name}</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
            color: agent.color, padding: '1px 5px', borderRadius: 3,
            background: `color-mix(in oklab, ${agent.color} 14%, transparent)`,
            border: `1px solid color-mix(in oklab, ${agent.color} 30%, transparent)`,
          }}>AGENT</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)' }}>{agent.role}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-4)', padding: '1px 5px', borderRadius: 3, background: 'var(--t-panel-2)', border: '1px solid var(--t-border)' }}>{agent.model}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)' }}>{time}</span>
          {edited && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-5)' }}>· 已编辑</span>}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--t-fg-2)' }}>{body}</div>
        {memoriesRecalled != null && memoriesRecalled > 0 && (
          <MemoryRecallRow memories={memoriesRecalled} />
        )}

        {tool && (
          <div style={{ marginTop: 7, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 9px', borderRadius: 6, background: 'var(--t-panel-2)', border: '1px solid var(--t-border)' }}>
            <span style={{ width: 11, height: 11, display: 'flex', color: 'var(--t-fg-4)' }}>{CI.clip}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-2)', fontWeight: 600 }}>{tool.name}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>{tool.meta}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--status-ok)' }}>✓ 142ms</span>
          </div>
        )}

        {reactions && reactions.length > 0 && (
          <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
            {reactions.map(([emo, n], i) => (
              <span key={emo} onClick={() => onAddReaction?.(msgId, emo)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 7px', borderRadius: 11,
                background: i === 0 ? 'var(--t-accent-tint)' : 'var(--t-panel-2)',
                border: `1px solid ${i === 0 ? 'color-mix(in oklab, var(--t-accent) 35%, transparent)' : 'var(--t-border)'}`,
                fontSize: 11, color: i === 0 ? 'var(--t-accent-bright)' : 'var(--t-fg-3)',
                fontWeight: 600, cursor: 'pointer',
              }}>{emo} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5 }}>{n}</span></span>
            ))}
            <span onClick={() => onAddReaction?.(msgId, '👍')} style={{
              width: 22, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 11, background: 'var(--t-panel-2)', border: '1px dashed var(--border-strong)',
              color: 'var(--t-fg-4)', cursor: 'pointer',
            }}><span style={{ width: 11, height: 11, display: 'flex' }}>{CI.smile}</span></span>
          </div>
        )}

        {thread && (
          <div onClick={onThreadOpen} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 7,
            padding: '4px 9px', borderRadius: 6,
            background: 'var(--t-accent-tint)',
            border: '1px solid color-mix(in oklab, var(--t-accent) 30%, transparent)',
            color: 'var(--t-accent-bright)', cursor: 'pointer',
          }}>
            <span style={{ width: 11, height: 11, display: 'flex' }}>{CI.thread}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 }}>{thread.count} 条回复</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>最后 {thread.last}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>›</span>
          </div>
        )}

        {readBy && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-5)', marginTop: 5 }}>{readBy}</div>}
      </div>

      {/* hover toolbar — CSS .fb-msg:hover .fb-toolbar 控制显隐 */}
      <div className="fb-toolbar" style={{
        position: 'absolute', top: -12, right: 8, zIndex: 5,
        display: 'flex', gap: 0,
        background: 'var(--skin-panel)', border: '1px solid var(--t-border)',
        borderRadius: 8, padding: 2, boxShadow: 'var(--shadow-pop)',
      }}>
        {[
          [CI.smile, '反应'], [CI.reply, '回复'], [CI.thread, '开 thread'],
          [CI.quote, '引用'], [CI.trans, '翻译'], [CI.pin, 'Pin'],
          [CI.fwd, '转发'], [FBIcons.more, '更多'],
        ].map(([ic, t], i) => (
          <span key={i} title={t as string} style={{
            width: 24, height: 24, borderRadius: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--t-fg-3)', cursor: 'pointer',
          }}><span style={{ width: 13, height: 13, display: 'flex' }}>{ic}</span></span>
        ))}
      </div>
    </div>
  );
});

interface UserMsgProps {
  name: string;
  time: string;
  body: React.ReactNode;
  reply?: { name: string; text: string };
}
export const UserMsg = memo(function UserMsg({ name, time, body, reply }: UserMsgProps) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)' }}>{time}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t-fg)' }}>{name}</span>
        </div>
        {reply && (
          <div style={{
            fontSize: 11, padding: '4px 9px', borderRadius: 5, marginBottom: 4,
            background: 'var(--t-panel-2)', borderLeft: '2px solid var(--t-fg-5)',
            color: 'var(--t-fg-4)', maxWidth: '100%',
          }}>
            <span style={{ fontWeight: 700, color: 'var(--t-fg-3)' }}>{reply.name}</span>
            <span style={{ marginLeft: 6 }}>{reply.text}</span>
          </div>
        )}
        <div style={{
          padding: '8px 12px', borderRadius: '12px 4px 12px 12px',
          background: 'color-mix(in oklab, var(--status-ok) 14%, var(--t-panel))',
          border: '1px solid color-mix(in oklab, var(--status-ok) 30%, transparent)',
          fontSize: 12.5, lineHeight: 1.5, color: 'var(--t-fg)',
        }}>{body}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-5)', marginTop: 3 }}>已送达 · 5/5 已读</div>
      </div>
      <FBAv glyph="张" color="#10B981" size={32} />
    </div>
  );
});

export function ApprovalGate({ onApprove, onReject }: { onApprove?: () => void; onReject?: () => void }) {
  const [state, setState] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [diffOpen, setDiffOpen] = useState(false);

  if (state === 'approved') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div data-testid="gate-approved" style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--status-ok-tint)', border: '1px solid color-mix(in oklab, var(--status-ok) 35%, transparent)', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--status-ok)', fontWeight: 700 }}>
          ✓ 已批准 · 进入 Review 阶段
        </div>
      </div>
    );
  }
  if (state === 'rejected') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div data-testid="gate-rejected" style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--status-reject-tint)', border: '1px solid color-mix(in oklab, var(--status-reject) 35%, transparent)', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--status-reject)', fontWeight: 700 }}>
          ✗ 已驳回 · 小写重写 r3/3
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }} data-testid="gate-pending">
      <div style={{
        width: '100%', maxWidth: 620,
        padding: '13px 14px 12px', borderRadius: 10,
        background: 'color-mix(in oklab, var(--t-accent) 7%, var(--t-panel))',
        border: '1px solid color-mix(in oklab, var(--t-accent) 40%, transparent)',
        boxShadow: 'var(--glow-accent)', position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: -10, left: 14, padding: '2px 9px', background: 'var(--t-accent)', color: 'var(--accent-ink)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em' }}>⚑ APPROVAL GATE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <FBAv glyph="写" color="#EF4444" size={26} square />
          <span style={{ fontSize: 12, fontWeight: 700 }}>小写</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)' }}>WRITER · L3 · gate</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)', marginLeft: 'auto' }}>09:21 · 等待 1m04s</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--t-fg-2)', marginBottom: 8, lineHeight: 1.5 }}>
          重写 §6 完成。新增 <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--t-accent-bright)' }}>RetroCorr</span> 基线对比 + 联合消融表。请审审过目。
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 9 }}>
          {[['diff', '+142 / -38'], ['tokens', '2.1k / 5k'], ['retry', 'r2/3']].map(([k, v], i) => (
            <div key={i} style={{ padding: '5px 8px', background: 'var(--t-panel-2)', borderRadius: 5, border: '1px solid var(--t-border)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{k}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--t-fg)' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <button className="fb-btn fb-btn-primary fb-btn-sm" onClick={() => { setState('approved'); onApprove?.(); }} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span style={{ width: 12, height: 12, display: 'flex' }}>{FBIcons.check}</span> 批准 · 进 Review
          </button>
          <button className="fb-btn fb-btn-reject fb-btn-sm" onClick={() => { setState('rejected'); onReject?.(); }} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span style={{ width: 12, height: 12, display: 'flex' }}>{FBIcons.x}</span> 驳回 · 重写
          </button>
          <button className="fb-btn fb-btn-ghost fb-btn-sm" style={{ display: 'flex', gap: 5, alignItems: 'center' }} onClick={() => setDiffOpen(true)}>
            <span style={{ width: 12, height: 12, display: 'flex' }}>{CI.doc}</span> 看 diff
          </button>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)' }}>Y / N · ⌘↵ 批准</span>
        </div>
      </div>

      {diffOpen && (
        <div onClick={() => setDiffOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 720, maxHeight: '80vh', background: 'var(--skin-panel)', border: '1px solid var(--t-border)',
            borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-pop)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>diff · §6 重写 r2/3</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--status-ok)' }}>+142</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--status-reject)' }}>-38</span>
              <span style={{ flex: 1 }} />
              <span onClick={() => setDiffOpen(false)} style={{ cursor: 'pointer', color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>ESC</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 8, padding: 14, fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.6 }}>
              <div style={{ color: 'var(--status-reject)' }}>- 此处直接套用 baseline，未对比 RetroCorr</div>
              <div style={{ color: 'var(--status-ok)' }}>+ 引入 RetroCorr 基线对比（Tab.7）</div>
              <div style={{ color: 'var(--status-ok)' }}>+   - 50K 样本，3 seed 平均 ↗ +2.4%</div>
              <div style={{ color: 'var(--status-ok)' }}>+   - 联合消融：去掉 RetroCorr → 性能塌缩</div>
              <div style={{ color: 'var(--t-fg-4)' }}>  ……</div>
              <div style={{ color: 'var(--status-reject)' }}>- §6.3 数据来自 cached eval（未注明）</div>
              <div style={{ color: 'var(--status-ok)' }}>+ §6.3 数据 = 重新跑 + Tab.2 原始 diff（已交叉验证）</div>
              <div style={{ color: 'var(--t-fg-4)' }}>  ……</div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="fb-btn fb-btn-ghost" onClick={() => setDiffOpen(false)} style={{ fontSize: 11 }}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingLeft: 2 }}>
      <FBAv glyph="审" color="#10B981" size={24} square />
      <span style={{ fontSize: 11.5, color: 'var(--t-fg-4)' }}>审审 正在思考</span>
      <span style={{ display: 'flex', gap: 3 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 5, height: 5, borderRadius: '50%', background: 'var(--t-fg-4)',
            animation: `fb-pulse 1.2s ease-in-out ${i * 0.18}s infinite`,
          }} />
        ))}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)', marginLeft: 6 }}>~480 tokens · ~3.2s</span>
    </div>
  );
}
