/* P1 — Team Detail: Members + Policy Matrix (3 states) + Workflow DAG */

const TEAM_MEMBERS = [
  {glyph:'读', name:'读读',  role:'Reader',         level:'L1', tools:['fetch','pdf.parse'],          color:'#A855F7', state:'idle'},
  {glyph:'阿', name:'阿批',  role:'Critic',         level:'L2', tools:['llm.reason','search'],        color:'#F59E0B', state:'run'},
  {glyph:'查', name:'查查',  role:'Cite-checker',   level:'L1', tools:['http.get','doi.lookup'],      color:'#22D3EE', state:'idle'},
  {glyph:'写', name:'写写',  role:'Writer',         level:'L3', tools:['fs.write','email.send','slack.post'], color:'#EF4444', state:'wait'},
  {glyph:'审', name:'审审',  role:'Reviewer',       level:'L2', tools:['llm.reason','git.comment'],   color:'#10B981', state:'idle'},
];

const TOOLS = ['fetch','pdf.parse','llm.reason','search','http.get','doi.lookup','fs.write','email.send','slack.post','git.comment'];

// state: A=Auto, C=Confirm, D=Deny
const POLICY = {
  '读读':  {fetch:'A','pdf.parse':'A','llm.reason':'A',search:'A','http.get':'C','doi.lookup':'A','fs.write':'D','email.send':'D','slack.post':'D','git.comment':'D'},
  '阿批':  {fetch:'A','pdf.parse':'A','llm.reason':'A',search:'A','http.get':'C','doi.lookup':'A','fs.write':'C','email.send':'D','slack.post':'D','git.comment':'D'},
  '查查':  {fetch:'A','pdf.parse':'A','llm.reason':'C',search:'A','http.get':'A','doi.lookup':'A','fs.write':'D','email.send':'D','slack.post':'D','git.comment':'D'},
  '写写':  {fetch:'A','pdf.parse':'D','llm.reason':'A',search:'C','http.get':'D','doi.lookup':'D','fs.write':'A','email.send':'C','slack.post':'C','git.comment':'C'},
  '审审':  {fetch:'A','pdf.parse':'A','llm.reason':'A',search:'C','http.get':'C','doi.lookup':'A','fs.write':'C','email.send':'D','slack.post':'C','git.comment':'A'},
};

const PolicyCell = ({v}) => {
  const map = {
    A: {bg:'color-mix(in oklab, var(--status-ok) 16%, transparent)',     fg:'var(--status-ok)',     ch:'A'},
    C: {bg:'color-mix(in oklab, var(--status-warn) 18%, transparent)',   fg:'var(--status-warn)',   ch:'C'},
    D: {bg:'color-mix(in oklab, var(--status-reject) 16%, transparent)', fg:'var(--status-reject)', ch:'D'},
  };
  const c = map[v];
  return (
    <div style={{
      width:'100%', height:32, display:'flex', alignItems:'center', justifyContent:'center',
      background:c.bg, color:c.fg,
      fontFamily:'var(--font-mono)', fontWeight:800, fontSize:11,
      borderRadius:4, cursor:'pointer',
    }}>{c.ch}</div>
  );
};

const PolicyMatrix = () => (
  <div style={{padding:'14px 16px', background:'var(--bg-elev-1)', border:'1px solid var(--border)', borderRadius:12}}>
    <div style={{display:'flex', alignItems:'baseline', gap:10, marginBottom:12}}>
      <span style={{fontSize:13, fontWeight:700}}>Policy Matrix</span>
      <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)', letterSpacing:'0.04em'}}>5 agents × 10 tools</span>
      <div style={{flex:1}}/>
      <div style={{display:'flex', gap:8, fontFamily:'var(--font-mono)', fontSize:10}}>
        <span><span style={{color:'var(--status-ok)'}}>A</span> 自动</span>
        <span><span style={{color:'var(--status-warn)'}}>C</span> 需确认</span>
        <span><span style={{color:'var(--status-reject)'}}>D</span> 禁止</span>
      </div>
    </div>
    <div style={{display:'grid', gridTemplateColumns:'90px repeat(10, 1fr)', gap:4}}>
      <div/>
      {TOOLS.map(t => (
        <div key={t} style={{
          fontFamily:'var(--font-mono)', fontSize:9, color:'var(--fg-4)',
          letterSpacing:'0.02em', textAlign:'center',
          writingMode:'vertical-rl', transform:'rotate(180deg)',
          height:64, display:'flex', alignItems:'flex-end', justifyContent:'center',
        }}>{t}</div>
      ))}
      {TEAM_MEMBERS.map(m => (
        <React.Fragment key={m.name}>
          <div style={{display:'flex', alignItems:'center', gap:6, padding:'4px 0'}}>
            <Avatar glyph={m.glyph} color={m.color} size={22}/>
            <span style={{fontSize:11, fontWeight:600}}>{m.name}</span>
          </div>
          {TOOLS.map(t => <PolicyCell key={t} v={POLICY[m.name][t]}/>)}
        </React.Fragment>
      ))}
    </div>
    <div style={{marginTop:14, padding:'10px 12px', background:'var(--bg-elev-2)', border:'1px solid var(--border)', borderRadius:8, display:'flex', alignItems:'center', gap:10}}>
      <span style={{fontSize:13}}>ⓘ</span>
      <span style={{fontSize:11.5, color:'var(--fg-3)'}}>当前应用预设：<span style={{color:'var(--accent-bright)', fontFamily:'var(--font-mono)'}}>L2-Strict</span> · 写写持有的 3 个外发工具中 2 个被升为「需确认」</span>
      <div style={{flex:1}}/>
      <button style={{padding:'5px 10px', background:'transparent', color:'var(--fg-3)', border:'1px solid var(--border)', borderRadius:6, fontSize:11}}>切换预设</button>
    </div>
  </div>
);

/* DAG */
const DagNode = ({x, y, glyph, name, role, color, status, tweaks}) => (
  <g transform={`translate(${x},${y})`}>
    <rect width="148" height="64" rx="14"
      fill="var(--bg-node)"
      stroke={status==='run'?color:'var(--border)'}
      strokeWidth={status==='run'?1.5:1}
      style={{filter: status==='run' && tweaks.showLive ? `drop-shadow(0 0 8px ${color}aa)` : 'none'}}
    />
    {status==='run' && tweaks.showLive && (
      <rect width="148" height="64" rx="14" fill="none" stroke={color} strokeWidth="1" opacity="0.4">
        <animate attributeName="stroke-width" values="1;3;1" dur="1.5s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.4;0.1;0.4" dur="1.5s" repeatCount="indefinite"/>
      </rect>
    )}
    <rect x="10" y="14" width="32" height="32" rx="8"
      fill={`color-mix(in oklab, ${color} 18%, var(--bg-elev-2))`}
      stroke={`color-mix(in oklab, ${color} 45%, transparent)`}/>
    <text x="26" y="34" textAnchor="middle" fill={color} fontFamily="var(--font-sans)" fontSize="14" fontWeight="800">{glyph}</text>
    <text x="50" y="28" fill="var(--fg-1)" fontSize="12" fontWeight="700">{name}</text>
    <text x="50" y="44" fill="var(--fg-4)" fontSize="9.5" fontFamily="var(--font-mono)" letterSpacing="0.04em">{role}</text>
    {status==='run' && (
      <circle cx="138" cy="14" r="4" fill={color}>
        <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite"/>
      </circle>
    )}
    {status==='ok' && <circle cx="138" cy="14" r="4" fill="var(--status-ok)"/>}
    {status==='wait' && <circle cx="138" cy="14" r="4" fill="var(--status-warn)"/>}
  </g>
);

const Edge = ({x1,y1,x2,y2,active}) => {
  const midX = (x1+x2)/2;
  return (
    <g>
      <path d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
        fill="none" stroke={active?'var(--accent)':'var(--border-strong)'} strokeWidth={active?1.5:1}
        strokeDasharray={active?'0':'4 3'}/>
      {active && (
        <circle r="3" fill="var(--accent-bright)">
          <animateMotion dur="2s" repeatCount="indefinite"
            path={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}/>
        </circle>
      )}
    </g>
  );
};

const WorkflowDag = ({tweaks}) => (
  <div style={{padding:'14px 16px', background:'var(--bg-elev-1)', border:'1px solid var(--border)', borderRadius:12}}>
    <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
      <span style={{fontSize:13, fontWeight:700}}>工作流 DAG</span>
      <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)'}}>run #042 · 09:14 — 进行中</span>
      <div style={{flex:1}}/>
      <button style={{padding:'5px 10px', background:'transparent', color:'var(--fg-3)', border:'1px solid var(--border)', borderRadius:6, fontSize:11, fontFamily:'var(--font-mono)'}}>编辑</button>
      <button style={{padding:'5px 10px', background:'transparent', color:'var(--fg-3)', border:'1px solid var(--border)', borderRadius:6, fontSize:11, fontFamily:'var(--font-mono)'}}>YAML</button>
    </div>
    <div style={{background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:14, position:'relative'}}>
      {/* Grid bg */}
      <svg width="100%" height="320" viewBox="0 0 720 320">
        <defs>
          <pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.6" fill="var(--border)"/>
          </pattern>
        </defs>
        <rect width="720" height="320" fill="url(#dot-grid)"/>

        {/* Edges */}
        <Edge x1={158} y1={62}  x2={216} y2={62}  active/>
        <Edge x1={158} y1={62}  x2={216} y2={158} active/>
        <Edge x1={364} y1={62}  x2={422} y2={110}/>
        <Edge x1={364} y1={158} x2={422} y2={110}/>
        <Edge x1={570} y1={110} x2={628} y2={110}/>
        <text x="190" y="56" fill="var(--fg-4)" fontFamily="var(--font-mono)" fontSize="9">parsed</text>
        <text x="190" y="180" fill="var(--fg-4)" fontFamily="var(--font-mono)" fontSize="9">parsed</text>
        <text x="395" y="86"  fill="var(--fg-4)" fontFamily="var(--font-mono)" fontSize="9">issues</text>
        <text x="395" y="138" fill="var(--fg-4)" fontFamily="var(--font-mono)" fontSize="9">cite-ok</text>
        <text x="600" y="104" fill="var(--status-warn)" fontFamily="var(--font-mono)" fontSize="9" fontWeight="700">⏸ gated</text>

        {/* Nodes */}
        <DagNode x={10}  y={30}  glyph="读" name="读读"  role="READER · L1"      color="#A855F7" status="ok"   tweaks={tweaks}/>
        <DagNode x={216} y={30}  glyph="阿" name="阿批"  role="CRITIC · L2"      color="#F59E0B" status="run"  tweaks={tweaks}/>
        <DagNode x={216} y={126} glyph="查" name="查查"  role="CITE-CHK · L1"    color="#22D3EE" status="ok"   tweaks={tweaks}/>
        <DagNode x={422} y={78}  glyph="写" name="写写"  role="WRITER · L3"      color="#EF4444" status="wait" tweaks={tweaks}/>
        <DagNode x={628} y={78}  glyph="审" name="审审"  role="REVIEWER · L2"    color="#10B981" status="idle" tweaks={tweaks}/>
      </svg>

      {/* Legend */}
      <div style={{display:'flex', gap:14, marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)'}}>
        <span style={{display:'flex', alignItems:'center', gap:6}}><Dot color="var(--status-ok)" size={6}/>已完成 · 2</span>
        <span style={{display:'flex', alignItems:'center', gap:6}}><Dot color="var(--status-run)" pulse size={6}/>进行中 · 1</span>
        <span style={{display:'flex', alignItems:'center', gap:6}}><Dot color="var(--status-warn)" size={6}/>等待审批 · 1</span>
        <span style={{display:'flex', alignItems:'center', gap:6}}><Dot color="var(--fg-5)" size={6}/>待启动 · 1</span>
        <div style={{flex:1}}/>
        <span>耗时 7m12s · 已扣 $0.42</span>
      </div>
    </div>
  </div>
);

const MemberRow = ({m, tweaks}) => {
  const stateMap = {
    run:  {label:'运行中',   color:'var(--status-run)',  pulse:true},
    idle: {label:'空闲',     color:'var(--fg-5)',        pulse:false},
    wait: {label:'等待审批', color:'var(--status-warn)', pulse:false},
  };
  const s = stateMap[m.state];
  return (
    <div style={{display:'grid', gridTemplateColumns:'40px 1fr 90px 1fr 90px', alignItems:'center', gap:12, padding:'12px 14px', borderBottom:'1px solid var(--border)'}}>
      <Avatar glyph={m.glyph} color={m.color} size={36} status={m.state==='run'&&tweaks.showLive?'run':null}/>
      <div>
        <div style={{fontSize:13, fontWeight:700}}>{m.name}</div>
        <div style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)', letterSpacing:'0.03em', marginTop:2}}>
          {m.role.toUpperCase()} · {m.level}
        </div>
      </div>
      <Pill color={m.color}>{m.level}</Pill>
      <div style={{display:'flex', flexWrap:'wrap', gap:4}}>
        {m.tools.slice(0,3).map(t => (
          <span key={t} style={{
            fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--fg-3)',
            padding:'2px 6px', background:'var(--bg-elev-2)', border:'1px solid var(--border)', borderRadius:4,
          }}>{t}</span>
        ))}
        {m.tools.length>3 && <span style={{fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--fg-4)', padding:'2px 6px'}}>+{m.tools.length-3}</span>}
      </div>
      <div style={{display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end'}}>
        <Dot color={s.color} pulse={s.pulse}/>
        <span style={{fontFamily:'var(--font-mono)', fontSize:10.5, color:s.color}}>{s.label}</span>
      </div>
    </div>
  );
};

const TeamHeader = () => (
  <div style={{padding:'18px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:14}}>
    <div style={{width:52, height:52, borderRadius:14, background:'var(--bg-elev-2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-mono)', fontSize:16, fontWeight:700, color:'var(--fg-2)'}}>×5</div>
    <div style={{flex:1}}>
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <span style={{fontSize:18, fontWeight:800, letterSpacing:'-0.02em'}}>论文深读小队</span>
        <Pill color="var(--accent-bright)">L2-STRICT</Pill>
        <Pill color="var(--status-run)"><Dot color="var(--status-run)" pulse size={5}/>RUN #042</Pill>
      </div>
      <div style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-4)', marginTop:4, letterSpacing:'0.02em'}}>
        paper-lab / 论文深读小队 · 5 agents · 47 runs · 命中率 91% · monthly $42.18
      </div>
    </div>
    <button style={{padding:'8px 14px', background:'transparent', border:'1px solid var(--border)', borderRadius:8, color:'var(--fg-3)', fontSize:12}}>重命名</button>
    <button style={{padding:'8px 14px', background:'var(--accent)', color:'var(--accent-ink)', border:'none', borderRadius:8, fontSize:12, fontWeight:700}}>启动新 run</button>
  </div>
);

const BoardTeam = ({tweaks}) => (
  <div style={{height:'100%', overflow:'auto', borderRadius:'inherit', background:'var(--bg)', display:'flex', flexDirection:'column'}}>
    <TeamHeader/>
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, padding:18, flex:1}}>
      {/* Members */}
      <div style={{background:'var(--bg-elev-1)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden'}}>
        <div style={{padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10}}>
          <span style={{fontSize:13, fontWeight:700}}>成员</span>
          <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)'}}>5 agents</span>
          <div style={{flex:1}}/>
          <button style={{padding:'5px 10px', background:'transparent', color:'var(--fg-3)', border:'1px dashed var(--border-strong)', borderRadius:6, fontSize:11}}>+ 招人</button>
        </div>
        {TEAM_MEMBERS.map(m => <MemberRow key={m.name} m={m} tweaks={tweaks}/>)}
      </div>

      {/* DAG */}
      <WorkflowDag tweaks={tweaks}/>
    </div>
    {/* Policy matrix full-width */}
    <div style={{padding:'0 18px 20px'}}>
      <PolicyMatrix/>
    </div>
  </div>
);

window.BoardTeam = BoardTeam;
