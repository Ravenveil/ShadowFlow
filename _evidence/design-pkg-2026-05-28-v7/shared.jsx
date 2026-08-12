/* Shared atoms used across boards. Keep all named to avoid global collisions. */

const SfLogo = ({size=28}) => (
  <div style={{display:'flex', alignItems:'center', gap:10}}>
    <div style={{width:size, height:size, borderRadius:8, background:'var(--accent)', color:'var(--accent-ink)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:size*0.55, letterSpacing:'-0.03em'}}>S</div>
    <div style={{fontSize:15, fontWeight:700, letterSpacing:'-0.02em'}}>ShadowFlow</div>
  </div>
);

// 4 workspaces — each has a name, color tag, agent/team counts
const WORKSPACES = [
  {id:'paper-lab',  name:'论文实验室',   color:'#A855F7', agents:7, teams:3, current:true,  initial:'论'},
  {id:'code-rev',   name:'代码 Review 团队', color:'#22D3EE', agents:4, teams:2, current:false, initial:'代'},
  {id:'ops',        name:'OPS 值班',     color:'#F59E0B', agents:3, teams:1, current:false, initial:'OP'},
  {id:'persona',    name:'NPC Persona',  color:'#EF4444', agents:9, teams:2, current:false, initial:'NP'},
];

// Agent avatar — single CJK glyph or 2-char on tinted bg
const Avatar = ({glyph, color='var(--accent)', size=32, ring=false, status}) => (
  <div style={{position:'relative', flexShrink:0}}>
    <div style={{
      width:size, height:size, borderRadius:size*0.28,
      background: `color-mix(in oklab, ${color} 18%, var(--bg-elev-2))`,
      border: `1px solid color-mix(in oklab, ${color} 45%, transparent)`,
      color, display:'flex', alignItems:'center', justifyContent:'center',
      fontWeight:800, fontSize:size*0.42, letterSpacing:'-0.02em',
      boxShadow: ring ? `0 0 0 2px ${color}33, 0 0 12px -2px ${color}55` : 'none',
    }}>{glyph}</div>
    {status && <span style={{
      position:'absolute', right:-1, bottom:-1, width:Math.max(8, size*0.28), height:Math.max(8, size*0.28),
      borderRadius:'50%', background:`var(--status-${status})`, border:'2px solid var(--skin-panel)',
      animation: status==='run' ? 'sf-pulse 1.4s ease-in-out infinite' : 'none',
    }}/>}
  </div>
);

const Pill = ({children, color, dim, mono=true, style={}}) => (
  <span style={{
    display:'inline-flex', alignItems:'center', gap:4,
    padding:'2px 8px', borderRadius:6,
    background: dim ? `color-mix(in oklab, ${color} 12%, transparent)` : `color-mix(in oklab, ${color} 18%, transparent)`,
    color, border:`1px solid color-mix(in oklab, ${color} 35%, transparent)`,
    fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
    fontSize:10, fontWeight:600, letterSpacing:'0.04em',
    ...style,
  }}>{children}</span>
);

const Dot = ({color='var(--fg-5)', pulse=false, size=6}) => (
  <span style={{
    width:size, height:size, borderRadius:'50%', background:color, display:'inline-block',
    flexShrink:0, animation: pulse ? 'sf-pulse 1.4s ease-in-out infinite' : 'none',
  }}/>
);

const SectionLabel = ({children, right}) => (
  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px 8px'}}>
    <span style={{fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--fg-4)'}}>{children}</span>
    {right && <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)'}}>{right}</span>}
  </div>
);

const KeyVal = ({label, value, valueColor}) => (
  <div style={{display:'grid', gridTemplateColumns:'88px 1fr', gap:'6px 12px', alignItems:'baseline'}}>
    <span style={{fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--fg-4)'}}>{label}</span>
    <span style={{fontFamily:'var(--font-mono)', fontSize:11, color: valueColor || 'var(--fg-1)'}}>{value}</span>
  </div>
);

Object.assign(window, {
  SfLogo, WORKSPACES, Avatar, Pill, Dot, SectionLabel, KeyVal,
});
