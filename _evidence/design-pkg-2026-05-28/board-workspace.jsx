/* P0b — Workspace switcher: collapsed rail + expanded popover + create-new state */

const RailItem = ({ws, active}) => (
  <div style={{
    width:44, height:44, borderRadius:10,
    background: active ? ws.color : `color-mix(in oklab, ${ws.color} 18%, var(--bg-elev-2))`,
    color: active ? '#0A0A0A' : ws.color,
    border: active ? `2px solid ${ws.color}` : '1px solid var(--border)',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontWeight:900, fontSize:13, letterSpacing:'-0.02em',
    boxShadow: active ? `0 0 0 4px color-mix(in oklab, ${ws.color} 18%, transparent)` : 'none',
    position:'relative', cursor:'pointer',
  }}>
    {ws.initial}
    {active && <span style={{position:'absolute', left:-10, top:'50%', transform:'translateY(-50%)', width:3, height:20, borderRadius:2, background:ws.color}}/>}
  </div>
);

const Rail = () => (
  <div style={{
    width:64, height:'100%', background:'var(--bg-elev-1)',
    borderRight:'1px solid var(--border)',
    display:'flex', flexDirection:'column', alignItems:'center', gap:10, padding:'14px 0',
  }}>
    <SfLogo size={28}/>
    <div style={{height:1, width:32, background:'var(--border)', margin:'8px 0'}}/>
    {WORKSPACES.map(ws => <RailItem key={ws.id} ws={ws} active={ws.current}/>)}
    <div style={{
      width:44, height:44, borderRadius:10, marginTop:6,
      border:'1.5px dashed var(--border-strong)', color:'var(--fg-4)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:18, fontWeight:300, cursor:'pointer',
    }}>+</div>
    <div style={{flex:1}}/>
    <div style={{
      width:44, height:44, borderRadius:'50%', background:'#10B981', color:'#062b1f',
      display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14,
    }}>张</div>
  </div>
);

const SwitcherPopover = () => (
  <div style={{
    width:340, background:'var(--bg-elev-2)', border:'1px solid var(--border-strong)',
    borderRadius:14, boxShadow:'var(--shadow-hud)', overflow:'hidden',
  }}>
    <div style={{padding:'12px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10}}>
      <span style={{fontSize:13, fontWeight:700}}>切换 Workspace</span>
      <span style={{marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize:9, color:'var(--fg-4)'}}>⌘⇧K</span>
    </div>
    <div style={{padding:'8px 10px', borderBottom:'1px solid var(--border)'}}>
      <div style={{display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8}}>
        <span style={{color:'var(--fg-4)', fontSize:11}}>⌕</span>
        <span style={{fontSize:11.5, color:'var(--fg-2)'}}>论文</span>
        <span style={{flex:1}}/>
        <span style={{fontFamily:'var(--font-mono)', fontSize:9, color:'var(--fg-5)'}}>4 / 4</span>
      </div>
    </div>
    <div style={{padding:'6px 8px'}}>
      {WORKSPACES.map((ws,i) => (
        <div key={ws.id} style={{
          display:'flex', alignItems:'center', gap:12, padding:'9px 8px', borderRadius:8,
          background: ws.current ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : (i===1 ? 'var(--bg-elev-3)' : 'transparent'),
          cursor:'pointer',
        }}>
          <div style={{
            width:32, height:32, borderRadius:8,
            background: ws.color, color:'#0A0A0A',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontWeight:900, fontSize:12, letterSpacing:'-0.02em',
          }}>{ws.initial}</div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              <span style={{fontSize:12.5, fontWeight: ws.current?700:600}}>{ws.name}</span>
              {ws.current && <Pill color="var(--accent-bright)" style={{padding:'1px 6px', fontSize:9}}>CURRENT</Pill>}
            </div>
            <div style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)', marginTop:1, letterSpacing:'0.03em'}}>
              {ws.agents} agents · {ws.teams} teams · {i===0?'Owner':'Member'}
            </div>
          </div>
          <span style={{fontFamily:'var(--font-mono)', fontSize:9, color:'var(--fg-5)'}}>⌘{i+1}</span>
        </div>
      ))}
    </div>
    <div style={{padding:'8px 10px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8}}>
      <span style={{fontSize:18, color:'var(--fg-4)', fontWeight:300, width:20, textAlign:'center'}}>+</span>
      <span style={{fontSize:12, color:'var(--fg-2)'}}>新建 Workspace</span>
      <span style={{marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize:9, color:'var(--fg-5)'}}>⌘N</span>
    </div>
  </div>
);

const CreateModal = () => (
  <div style={{
    width:360, background:'var(--bg-elev-2)', border:'1px solid var(--border-strong)',
    borderRadius:14, boxShadow:'var(--shadow-hud)', overflow:'hidden',
  }}>
    <div style={{padding:'14px 16px', borderBottom:'1px solid var(--border)'}}>
      <div style={{fontSize:14, fontWeight:700}}>新建 Workspace</div>
      <div style={{fontSize:11, color:'var(--fg-4)', marginTop:2}}>独立的成员、agent、策略、计费</div>
    </div>
    <div style={{padding:'14px 16px', display:'flex', flexDirection:'column', gap:12}}>
      <div>
        <div style={{fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--fg-4)', marginBottom:6}}>名称</div>
        <div style={{padding:'8px 10px', background:'var(--bg)', border:'1px solid var(--accent)', borderRadius:8, fontSize:12.5, color:'var(--fg-1)'}}>
          营销内容工厂<span style={{borderLeft:'1.5px solid var(--accent)', marginLeft:1, animation:'sf-cursor 1s steps(2) infinite'}}/>
        </div>
      </div>
      <div>
        <div style={{fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--fg-4)', marginBottom:6}}>主题色</div>
        <div style={{display:'flex', gap:8}}>
          {['#A855F7','#22D3EE','#10B981','#F59E0B','#EF4444','#6366F1'].map((c,i)=>(
            <div key={i} style={{
              width:28, height:28, borderRadius:8, background:c,
              boxShadow: i===2 ? `0 0 0 2px var(--bg-elev-2), 0 0 0 4px ${c}` : 'none',
              cursor:'pointer',
            }}/>
          ))}
        </div>
      </div>
      <div>
        <div style={{fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--fg-4)', marginBottom:6}}>从模板</div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
          {[
            {name:'空白', sub:'从零开始'},
            {name:'内容工厂', sub:'+ Writer, Editor, SEO', selected:true},
            {name:'代码 Review', sub:'+ Reviewer ×3'},
            {name:'数据值班', sub:'+ Watcher, Triager'},
          ].map((t,i)=>(
            <div key={i} style={{
              padding:'9px 10px',
              background: t.selected ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'var(--bg)',
              border: t.selected ? '1px solid var(--accent)' : '1px solid var(--border)',
              borderRadius:8, cursor:'pointer',
            }}>
              <div style={{fontSize:11.5, fontWeight:700}}>{t.name}</div>
              <div style={{fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--fg-4)', marginTop:2}}>{t.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div style={{padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:8}}>
      <button style={{flex:'0 0 auto', padding:'8px 14px', background:'transparent', border:'1px solid var(--border)', borderRadius:8, color:'var(--fg-3)', fontSize:11.5}}>取消</button>
      <div style={{flex:1}}/>
      <button style={{padding:'8px 16px', background:'var(--accent)', color:'var(--accent-ink)', border:'none', borderRadius:8, fontSize:12, fontWeight:700}}>创建并进入</button>
    </div>
  </div>
);

const BoardWorkspace = ({tweaks}) => (
  <div style={{height:'100%', overflow:'hidden', borderRadius:'inherit', background:'var(--bg)', display:'grid', gridTemplateColumns:'160px 1fr', position:'relative'}}>
    {/* Mini rail demo */}
    <Rail/>

    {/* Right side: callouts */}
    <div style={{padding:'24px 28px', overflow:'auto'}}>
      <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:6}}>
        <Pill color="var(--accent-bright)">P0b</Pill>
        <div style={{fontSize:18, fontWeight:800, letterSpacing:'-0.02em'}}>Workspace 切换器</div>
      </div>
      <div style={{fontSize:12.5, color:'var(--fg-3)', maxWidth:520, lineHeight:1.55, marginBottom:22}}>
        Workspace = 独立的成员、agent、策略、计费容器。左边 64px 常驻 Rail 是入口，<span style={{color:'var(--fg-1)'}}>⌘⇧K</span> 召出搜索 popover，<span style={{color:'var(--fg-1)'}}>⌘N</span> 进入创建态。
      </div>

      {/* States row */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, marginTop:8}}>
        <div>
          <div style={{fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--fg-4)', marginBottom:10}}>状态 1 · Popover 切换</div>
          <SwitcherPopover/>
        </div>
        <div>
          <div style={{fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--fg-4)', marginBottom:10}}>状态 2 · 创建新 Workspace</div>
          <CreateModal/>
        </div>
      </div>

      {/* Spec table */}
      <div style={{marginTop:30, padding:'14px 16px', background:'var(--bg-elev-1)', border:'1px solid var(--border)', borderRadius:12}}>
        <div style={{fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--fg-4)', marginBottom:10}}>规格</div>
        <div style={{display:'grid', gridTemplateColumns:'120px 1fr', rowGap:8, fontSize:12}}>
          <span style={{color:'var(--fg-4)'}}>Rail 宽度</span><span style={{fontFamily:'var(--font-mono)', fontSize:11}}>64px · 常驻</span>
          <span style={{color:'var(--fg-4)'}}>Tile 尺寸</span><span style={{fontFamily:'var(--font-mono)', fontSize:11}}>44×44 · radius 10</span>
          <span style={{color:'var(--fg-4)'}}>选中态</span><span style={{fontFamily:'var(--font-mono)', fontSize:11}}>主题色填充 + 4px 同色光晕</span>
          <span style={{color:'var(--fg-4)'}}>快捷键</span><span style={{fontFamily:'var(--font-mono)', fontSize:11}}>⌘1–9 直跳 · ⌘⇧K 搜索 · ⌘N 新建</span>
          <span style={{color:'var(--fg-4)'}}>独立维度</span><span style={{fontFamily:'var(--font-mono)', fontSize:11}}>members · agents · policy · billing</span>
        </div>
      </div>
    </div>
    <style>{`@keyframes sf-cursor { 50% { opacity: 0; } }`}</style>
  </div>
);

window.BoardWorkspace = BoardWorkspace;
