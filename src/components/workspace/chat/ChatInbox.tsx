/**
 * ChatInbox — 268px 中间会话列表（包含 OrgSwitcher + 搜索 + 过滤 + 群组 + DM）
 */

import { useState } from 'react';
import { Pin } from '../../../common/icons/iconRegistry';
import { FBAv, FBIcons } from '../FBAtoms';
import { CI } from './icons';
import { OrgSwitcher } from './OrgSwitcher';
import type { ConvId } from './types';

interface InboxRowProps {
  id: ConvId;
  hash?: boolean;
  lock?: boolean;
  n: string;
  desc: string;
  u: number;
  active?: boolean;
  run?: boolean;
  warn?: boolean;
  t: string;
  members?: number;
  mention?: boolean;
  onClick: () => void;
}
function InboxRow({ id, hash, lock, n, desc, u, active, run, warn, t, members, mention, onClick }: InboxRowProps) {
  return (
    <div className={`fb-row ${active ? 'active' : ''}`} onClick={onClick} data-testid={`inbox-${id}`} style={{
      borderLeft: active ? '2px solid var(--t-accent)' : '2px solid transparent',
      padding: '8px 10px', position: 'relative', borderRadius: 6,
    }}>
      <span style={{
        width: 32, height: 32, borderRadius: 7, background: 'var(--t-panel-3)', border: '1px solid var(--t-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: active ? 'var(--t-accent-bright)' : 'var(--t-fg-3)',
        position: 'relative',
      }}>
        <span style={{ width: 14, height: 14, display: 'flex' }}>{lock ? CI.lock : (hash ? FBIcons.hash : CI.task)}</span>
        {run && <span style={{ position: 'absolute', right: -2, bottom: -2, width: 9, height: 9, borderRadius: '50%', background: 'var(--status-run)', border: '2px solid var(--t-panel)', animation: 'fb-pulse 1.4s infinite' }} />}
        {warn && !run && <span style={{ position: 'absolute', right: -2, bottom: -2, width: 9, height: 9, borderRadius: '50%', background: 'var(--status-warn)', border: '2px solid var(--t-panel)' }} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 12.5, fontWeight: active || u > 0 ? 700 : 600, color: 'var(--t-fg)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span>
          {members !== undefined && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-5)' }}>{members}</span>}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: u > 0 ? 'var(--t-accent-bright)' : 'var(--t-fg-5)' }}>{t}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
          {mention && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800, color: 'var(--status-reject)', padding: '0 4px', borderRadius: 3, background: 'var(--status-reject-tint)', border: '1px solid color-mix(in oklab, var(--status-reject) 30%, transparent)' }}>@</span>}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</span>
        </div>
      </div>
      {u > 0 && <span style={{ minWidth: 16, height: 16, padding: '0 5px', borderRadius: 8, background: 'var(--status-reject)', color: 'white', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', right: 8, top: 8 }}>{u}</span>}
    </div>
  );
}

interface DmRowProps {
  id: ConvId;
  g: string;
  n: string;
  agent?: boolean;
  last: string;
  color: string;
  t: string;
  mention?: boolean;
  warn?: boolean;
  run?: boolean;
  active?: boolean;
  onClick: () => void;
}
function DmRow({ id, g, n, agent, last, color, t, mention, warn, run, active, onClick }: DmRowProps) {
  return (
    <div className={`fb-row ${active ? 'active' : ''}`} onClick={onClick} data-testid={`inbox-${id}`} style={{ padding: '7px 10px', borderRadius: 6 }}>
      <span style={{ position: 'relative' }}>
        <FBAv glyph={g} color={color} size={28} square={agent} />
        {agent && <span style={{
          position: 'absolute', right: -3, bottom: -3, width: 13, height: 13, borderRadius: 4,
          background: 'var(--t-panel)', border: '1px solid var(--t-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color,
        }}><span style={{ width: 9, height: 9, display: 'flex' }}>{CI.bot}</span></span>}
        {run && <span style={{ position: 'absolute', right: -2, top: -2, width: 8, height: 8, borderRadius: '50%', background: 'var(--status-run)', border: '1.5px solid var(--t-panel)', animation: 'fb-pulse 1.4s infinite' }} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-fg)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span>
          {mention && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800, color: 'var(--status-reject)' }}>@</span>}
          {warn && <span className="fb-dot fb-dot-warn" />}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)' }}>{t}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{last}</div>
      </div>
    </div>
  );
}

export function ChatInbox({ activeConv, setActiveConv }: { activeConv: ConvId; setActiveConv: (id: ConvId) => void }) {
  const [filter, setFilter] = useState(0);
  return (
    <div style={{ width: 268, borderRight: '1px solid var(--t-border)', background: 'var(--t-panel)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <OrgSwitcher />

      <div style={{ padding: '4px 12px 8px' }}>
        <div className="fb-input" style={{ height: 30 }}>
          <span className="x-icon"><span style={{ width: 13, height: 13, display: 'flex' }}>{FBIcons.search}</span></span>
          <span style={{ color: 'var(--t-fg-4)', fontSize: 11.5 }}>搜索 / 跳转</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)' }}>⌘F</span>
        </div>
      </div>

      <div style={{ padding: '0 12px 8px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {(['全部', '未读·12', '@我·3', 'Agent'] as const).map((l, i) => (
          <span key={i} onClick={() => setFilter(i)} data-testid={`filter-${i}`} style={{
            padding: '3px 9px', borderRadius: 11, fontSize: 10.5, fontWeight: 600,
            background: i === filter ? 'var(--t-accent-tint)' : 'var(--t-panel-2)',
            color: i === filter ? 'var(--t-accent-bright)' : 'var(--t-fg-3)',
            border: `1px solid ${i === filter ? 'color-mix(in oklab, var(--t-accent) 35%, transparent)' : 'var(--t-border)'}`,
            cursor: 'pointer', transition: 'background 120ms',
          }}>{l}</span>
        ))}
      </div>

      <div className="fb-label-row" style={{ padding: '4px 14px 4px' }}>
        <span className="fb-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5 }}>
          <Pin size={11} strokeWidth={2} /> 置顶
        </span>
      </div>
      <div style={{ padding: '0 6px', display: 'flex', flexDirection: 'column' }}>
        <InboxRow id="main" hash n="论文深读小队" desc="阿批 · 发现 3 处不一致" u={2} active={activeConv === 'main'} run t="now" members={5} mention onClick={() => setActiveConv('main')} />
      </div>

      <div className="fb-label-row" style={{ padding: '10px 14px 4px' }}>
        <span className="fb-label" style={{ fontSize: 9.5 }}>群组 · 频道</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)' }}>3</span>
      </div>
      <div style={{ padding: '0 6px', display: 'flex', flexDirection: 'column' }}>
        <InboxRow id="engineering" hash n="engineering" desc="Devon · PR #312 已合并 ✓" u={0} active={activeConv === 'engineering'} t="09:42" members={8} onClick={() => setActiveConv('engineering')} />
        <InboxRow id="secret" lock n="文献综述-机密" desc="wait · approval gate" u={5} active={activeConv === 'secret'} warn t="昨日" members={4} onClick={() => setActiveConv('secret')} />
      </div>

      <div className="fb-label-row" style={{ padding: '10px 14px 4px' }}>
        <span className="fb-label" style={{ fontSize: 9.5 }}>直接对话 · DM</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)' }}>4</span>
      </div>
      <div style={{ padding: '0 6px', display: 'flex', flexDirection: 'column' }}>
        <DmRow id="dudu"    g="读" n="读读" agent last="已抽 12 篇"    color="var(--t-accent)" t="09:14" active={activeConv === 'dudu'}    onClick={() => setActiveConv('dudu')} />
        <DmRow id="api"     g="批" n="阿批" agent last="3 处自相矛盾"  color="#F59E0B" t="09:16" active={activeConv === 'api'}     onClick={() => setActiveConv('api')} mention />
        <DmRow id="chaxha"  g="查" n="查查" agent last="47/47 ✓"       color="#22D3EE" t="09:18" active={activeConv === 'chaxha'}  onClick={() => setActiveConv('chaxha')} />
        <DmRow id="xiaoxie" g="写" n="小写" agent last="r2/3 · 重写中" color="#EF4444" t="09:21" active={activeConv === 'xiaoxie'} onClick={() => setActiveConv('xiaoxie')} warn run />
      </div>

      <div style={{ flex: 1 }} />
    </div>
  );
}
