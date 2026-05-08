/**
 * ChatDrawer — 右侧 320px 抽屉（Thread / 任务 / 文档 / Brief）
 */

import { useState } from 'react';
import { FBAv, FBIcons } from '../FBAtoms';
import { CI } from './icons';

export type DrawerTab = 'Thread' | '任务' | '文档' | 'Brief';

interface ChatDrawerProps {
  onClose: () => void;
  initialTab?: DrawerTab;
}

export function ChatDrawer({ onClose, initialTab = 'Thread' }: ChatDrawerProps) {
  const [drawerTab, setDrawerTab] = useState<DrawerTab>(initialTab);
  type ThreadReply = { ag?: { g: string; c: string; n: string; r: string }; user?: { n: string; c: string }; t: string; body: string; tool?: string };
  const replies: ThreadReply[] = [
    { ag: { g: '写', c: '#EF4444', n: '小写', r: 'WRITER' }, t: '09:17', body: '§6.3 我去查 Tab.2 原始数据，1 分钟内出 diff' },
    { user: { n: '张明', c: '#10B981' }, t: '09:18', body: '同意，并把 §4.2 的 RetroCorr 一起加上' },
    { ag: { g: '写', c: '#EF4444', n: '小写', r: 'WRITER' }, t: '09:19', body: '好的。已 fork draft.v2 → v3', tool: 'edit_paper' },
  ];

  return (
    <div data-testid="chat-drawer" style={{ width: 320, borderLeft: '1px solid var(--border)', background: 'var(--bg-elev-1)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 8px', flexShrink: 0 }}>
        {(['Thread', '任务', '文档', 'Brief'] as const).map((l) => (
          <span key={l} onClick={() => setDrawerTab(l)} data-testid={`drawer-tab-${l}`} style={{
            padding: '10px 11px', fontSize: 11.5, fontWeight: drawerTab === l ? 700 : 600,
            color: drawerTab === l ? 'var(--fg-1)' : 'var(--fg-4)',
            borderBottom: drawerTab === l ? '2px solid var(--accent)' : '2px solid transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {l}
            {l === '任务' && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', padding: '0 5px', background: 'var(--bg-elev-2)', borderRadius: 8, border: '1px solid var(--border)' }}>5</span>}
            {l === '文档' && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', padding: '0 5px', background: 'var(--bg-elev-2)', borderRadius: 8, border: '1px solid var(--border)' }}>3</span>}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <span onClick={onClose} data-testid="drawer-close" style={{ padding: '10px 8px', color: 'var(--fg-4)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <span style={{ width: 14, height: 14, display: 'flex' }}>{FBIcons.x}</span>
        </span>
      </div>

      {drawerTab === 'Thread' && (
        <>
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <FBAv glyph="批" color="#F59E0B" size={26} square />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700 }}>阿批</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)' }}>CRITIC · 09:16</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2, lineHeight: 1.45 }}>发现潜在问题 3 处：§4.2 / §5.1 / §6.3 …</div>
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-4)', marginTop: 8, letterSpacing: '0.04em' }}>7 条回复 · 4 人参与</div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {replies.map((r, i) => {
              if (r.user) return (
                <div key={i} style={{ display: 'flex', gap: 8 }}>
                  <FBAv glyph={r.user.n[0]} color={r.user.c} size={22} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{r.user.n}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-5)' }}>{r.t}</span>
                    </div>
                    <div style={{ marginTop: 3, padding: '5px 8px', borderRadius: '8px 3px 8px 8px', display: 'inline-block', background: 'color-mix(in oklab, var(--status-ok) 12%, var(--bg-elev-1))', border: '1px solid color-mix(in oklab, var(--status-ok) 25%, transparent)', fontSize: 11, color: 'var(--fg-1)' }}>{r.body}</div>
                  </div>
                </div>
              );
              if (!r.ag) return null;
              return (
                <div key={i} style={{ display: 'flex', gap: 8 }}>
                  <FBAv glyph={r.ag.g} color={r.ag.c} size={22} square />
                  <div style={{ flex: 1, minWidth: 0, borderLeft: `2px solid ${r.ag.c}`, paddingLeft: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{r.ag.n}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: r.ag.c, fontWeight: 700, padding: '0 4px', borderRadius: 3, background: `color-mix(in oklab, ${r.ag.c} 15%, transparent)` }}>AGENT</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-5)' }}>{r.t}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 3, lineHeight: 1.45 }}>{r.body}</div>
                    {r.tool && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-elev-2)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-3)' }}>
                        <span style={{ width: 9, height: 9, display: 'flex' }}>{CI.clip}</span>{r.tool} · ✓
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-5)' }}>—— 阿批 正在输入 ⋯ ——</span>
            </div>
          </div>
        </>
      )}

      {drawerTab !== 'Thread' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-5)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {drawerTab} · 暂无内容
        </div>
      )}

      <div style={{ padding: '8px 12px 10px', borderTop: '1px solid var(--border)', background: 'var(--bg-elev-2)', flexShrink: 0 }}>
        <div style={{ background: 'var(--skin-panel)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 9px', fontSize: 11, color: 'var(--fg-5)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'text' }}>
          <span>回到 thread…</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-5)' }}>⏎ 发送</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <input type="checkbox" defaultChecked style={{ accentColor: 'var(--accent)', width: 11, height: 11 }} />
          <span style={{ fontSize: 10.5, color: 'var(--fg-4)' }}>同时发到主频道</span>
          <span style={{ flex: 1 }} />
          <span className="fb-dot fb-dot-ok" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)' }}>0G synced · 0x3f7a…bc91</span>
        </div>
      </div>
    </div>
  );
}
