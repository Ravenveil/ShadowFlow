/* P2 — Agent Catalog (presets) + Quick Hire modal (the Role-first moment).
   "招人 = 给名字 + 选灵魂 + 上岗" */

const PRESETS = [
  {glyph:'读', name:'Reader',         tag:'信息',   color:'#A855F7', desc:'抓 PDF / 网页 / arXiv，结构化为 outline + 摘要',  level:'L1', tools:['fetch','pdf.parse','llm.reason'], used:128},
  {glyph:'批', name:'Critic',         tag:'分析',   color:'#F59E0B', desc:'以挑刺视角找逻辑漏洞、矛盾、薄弱论证',           level:'L2', tools:['llm.reason','search'], used:84},
  {glyph:'查', name:'Cite-checker',   tag:'校验',   color:'#22D3EE', desc:'核对引用是否存在、DOI 可达、自引比例',           level:'L1', tools:['http.get','doi.lookup'], used:62},
  {glyph:'写', name:'Writer',         tag:'产出',   color:'#EF4444', desc:'按格式产出 review / rebuttal / 邮件草稿',          level:'L3', tools:['fs.write','email.send','slack.post'], used:51},
  {glyph:'审', name:'Reviewer',       tag:'校验',   color:'#10B981', desc:'按 ICLR/NeurIPS rubric 给出结构化评审',           level:'L2', tools:['llm.reason','git.comment'], used:43},
  {glyph:'码', name:'Code Reviewer',  tag:'代码',   color:'#6366F1', desc:'PR Diff → 风格 / Bug / 安全 / 测试覆盖率',         level:'L2', tools:['git.diff','git.comment','lint'], used:201},
  {glyph:'巡', name:'Watcher',        tag:'值班',   color:'#F59E0B', desc:'按 cron 巡检指标、日志，异常时唤起 Triager',      level:'L1', tools:['metrics.query','log.search'], used:37},
  {glyph:'分', name:'Triager',        tag:'值班',   color:'#EF4444', desc:'初筛告警，归类、降噪、找责任人',                 level:'L2', tools:['pagerduty','slack.post'], used:29},
  {glyph:'编', name:'Editor',         tag:'产出',   color:'#A855F7', desc:'语气 / 长度 / 结构 / 风格 4 维润色',               level:'L2', tools:['llm.reason','fs.write'], used:73},
  {glyph:'优', name:'SEO',            tag:'产出',   color:'#22D3EE', desc:'关键词 / 标题 / Meta · 平台规则适配',              level:'L1', tools:['search','llm.reason'], used:58},
  {glyph:'画', name:'Image Curator',  tag:'素材',   color:'#10B981', desc:'按文意挑配图、生成 alt-text',                     level:'L2', tools:['unsplash','llm.reason','fs.write'], used:46},
  {glyph:'+',  name:'Custom',         tag:'自定义', color:'var(--fg-5)', desc:'从空白开始，自己定义角色与工具集',          level:'?',  tools:[], used:0, custom:true},
];

const PresetCard = ({p, focus}) => (
  <div style={{
    padding:'14px 14px',
    background: focus ? 'color-mix(in oklab, var(--accent) 8%, var(--bg-elev-1))' : 'var(--bg-elev-1)',
    border: focus ? '1px solid var(--accent)' : '1px solid var(--border)',
    borderRadius:12, position:'relative', cursor:'pointer',
    boxShadow: focus ? '0 0 0 4px color-mix(in oklab, var(--accent) 14%, transparent)' : 'none',
  }}>
    <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
      <Avatar glyph={p.glyph} color={p.color} size={36} ring={focus}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13, fontWeight:800}}>{p.name}</div>
        <div style={{fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--fg-4)', letterSpacing:'0.04em', marginTop:1}}>
          {p.tag.toUpperCase()} · {p.level}
        </div>
      </div>
      {!p.custom && <Pill color="var(--fg-4)" dim>×{p.used}</Pill>}
    </div>
    <div style={{fontSize:11.5, color:'var(--fg-3)', lineHeight:1.5, minHeight:48}}>
      {p.desc}
    </div>
    {!p.custom && (
      <div style={{display:'flex', flexWrap:'wrap', gap:4, marginTop:10}}>
        {p.tools.slice(0,3).map(t => (
          <span key={t} style={{
            fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--fg-3)',
            padding:'2px 6px', background:'var(--bg-elev-2)', border:'1px solid var(--border)', borderRadius:4,
          }}>{t}</span>
        ))}
        {p.tools.length>3 && <span style={{fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--fg-4)', padding:'2px 6px'}}>+{p.tools.length-3}</span>}
      </div>
    )}
  </div>
);

const CatalogGrid = () => {
  const tags = ['全部','信息','分析','校验','产出','代码','值班','素材','自定义'];
  return (
    <div style={{flex:1, padding:'18px 22px', overflow:'auto', borderRight:'1px solid var(--border)'}}>
      <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:6}}>
        <Pill color="var(--accent-bright)">P2</Pill>
        <span style={{fontSize:18, fontWeight:800, letterSpacing:'-0.02em'}}>Agent Catalog</span>
        <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-4)'}}>· 11 预设角色 · 招人即上岗</span>
      </div>
      <div style={{fontSize:12.5, color:'var(--fg-3)', maxWidth:680, marginBottom:18}}>
        预设角色都是「<span style={{color:'var(--fg-1)'}}>名字 + 工具集 + 默认策略</span>」的打包。点 <span style={{color:'var(--fg-1)'}}>+ 招人</span> 取一个，给它起名字，调整工具，再放进团队。
      </div>

      {/* Filter row */}
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:16}}>
        <div style={{display:'flex', alignItems:'center', gap:8, padding:'7px 10px', background:'var(--bg-elev-2)', border:'1px solid var(--border)', borderRadius:8, flex:1, maxWidth:340}}>
          <span style={{color:'var(--fg-4)', fontSize:11}}>⌕</span>
          <span style={{fontSize:11.5, color:'var(--fg-4)'}}>搜索 角色 / 工具 / 标签</span>
        </div>
        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
          {tags.map((t,i) => (
            <span key={t} style={{
              padding:'5px 10px', borderRadius:6,
              background: i===0 ? 'var(--accent)' : 'transparent',
              color: i===0 ? 'var(--accent-ink)' : 'var(--fg-3)',
              border: i===0 ? '1px solid var(--accent)' : '1px solid var(--border)',
              fontSize:11, fontWeight: i===0 ? 700 : 500, cursor:'pointer',
            }}>{t}</span>
          ))}
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12}}>
        {PRESETS.map((p,i) => <PresetCard key={p.name} p={p} focus={i===1}/>)}
      </div>
    </div>
  );
};

const QuickHireModal = () => (
  <div style={{
    width:480, background:'var(--bg-elev-2)', border:'1px solid var(--border-strong)',
    borderRadius:16, boxShadow:'var(--shadow-hud)', overflow:'hidden',
  }}>
    {/* Header */}
    <div style={{padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12}}>
      <Pill color="var(--accent-bright)" dim>STEP 2 / 3</Pill>
      <div style={{flex:1}}>
        <div style={{fontSize:14, fontWeight:800}}>招一位 Critic</div>
        <div style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)', marginTop:1}}>取自预设：CRITIC · L2 · 已被使用 84 次</div>
      </div>
      <span style={{fontSize:14, color:'var(--fg-4)', cursor:'pointer'}}>×</span>
    </div>

    {/* Steps strip */}
    <div style={{display:'flex', padding:'10px 18px', gap:10, borderBottom:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:10}}>
      {[
        {label:'选灵魂', state:'done'},
        {label:'起名字', state:'now'},
        {label:'上岗',   state:'next'},
      ].map((s,i,arr) => (
        <div key={i} style={{display:'flex', alignItems:'center', gap:10, flex:1}}>
          <div style={{
            width:22, height:22, borderRadius:'50%',
            background: s.state==='done'?'var(--status-ok)':s.state==='now'?'var(--accent)':'var(--bg-elev-3)',
            color: s.state==='next'?'var(--fg-4)':'#0A0A0A',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontWeight:800, fontSize:11,
          }}>{s.state==='done'?'✓':i+1}</div>
          <span style={{color: s.state==='now'?'var(--fg-1)':'var(--fg-4)', fontWeight: s.state==='now'?700:500, letterSpacing:'0.04em', textTransform:'uppercase'}}>{s.label}</span>
          {i<arr.length-1 && <div style={{flex:1, height:1, background:'var(--border)'}}/>}
        </div>
      ))}
    </div>

    {/* Body */}
    <div style={{padding:'18px', display:'flex', flexDirection:'column', gap:16}}>
      {/* Avatar + name */}
      <div style={{display:'flex', alignItems:'center', gap:14}}>
        <div style={{position:'relative'}}>
          <Avatar glyph="阿" color="#F59E0B" size={64} ring/>
          <div style={{position:'absolute', bottom:-4, right:-4, width:22, height:22, borderRadius:'50%', background:'var(--bg-elev-3)', border:'1px solid var(--border-strong)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10}}>↻</div>
        </div>
        <div style={{flex:1}}>
          <div style={{fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--fg-4)', marginBottom:6}}>名字（昵称）</div>
          <div style={{padding:'8px 12px', background:'var(--bg)', border:'1px solid var(--accent)', borderRadius:8, fontSize:14, fontWeight:700}}>
            阿批<span style={{borderLeft:'1.5px solid var(--accent)', marginLeft:1, animation:'sf-cursor 1s steps(2) infinite'}}/>
          </div>
          <div style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)', marginTop:4}}>
            团队里 @阿批 即可呼叫 · 头像首字 阿
          </div>
        </div>
      </div>

      {/* Personality */}
      <div>
        <div style={{fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--fg-4)', marginBottom:8}}>性格（决定语气）</div>
        <div style={{display:'flex', gap:8}}>
          {['犀利','克制','严谨','幽默'].map((p,i) => (
            <span key={p} style={{
              padding:'6px 12px',
              background: i===0 ? 'color-mix(in oklab, var(--accent) 16%, transparent)' : 'var(--bg)',
              border: i===0 ? '1px solid var(--accent)' : '1px solid var(--border)',
              color: i===0 ? 'var(--accent-bright)' : 'var(--fg-3)',
              borderRadius:8, fontSize:11.5, fontWeight: i===0?700:500, cursor:'pointer',
            }}>{p}</span>
          ))}
        </div>
      </div>

      {/* Tools */}
      <div>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
          <span style={{fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--fg-4)'}}>工具（继承自预设）</span>
          <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--accent-bright)', cursor:'pointer'}}>+ 加 · 改</span>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:6}}>
          {[
            {name:'llm.reason', state:'A', note:'核心：阅读 / 推理'},
            {name:'search',     state:'C', note:'按 L2 默认 → 需确认'},
            {name:'fs.write',   state:'D', note:'Critic 不写文件 · 已禁'},
          ].map(t => {
            const c = {A:'var(--status-ok)', C:'var(--status-warn)', D:'var(--status-reject)'}[t.state];
            return (
              <div key={t.name} style={{display:'flex', alignItems:'center', gap:10, padding:'7px 10px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:6}}>
                <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-1)', minWidth:90}}>{t.name}</span>
                <span style={{flex:1, fontSize:11, color:'var(--fg-4)'}}>{t.note}</span>
                <span style={{fontFamily:'var(--font-mono)', fontSize:10, fontWeight:800, color:c, padding:'2px 8px', background:`color-mix(in oklab, ${c} 16%, transparent)`, border:`1px solid color-mix(in oklab, ${c} 40%, transparent)`, borderRadius:4}}>{t.state}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Assign to team */}
      <div>
        <div style={{fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--fg-4)', marginBottom:8}}>放进哪个团队</div>
        <div style={{display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8}}>
          <div style={{width:28, height:28, borderRadius:6, background:'var(--bg-elev-3)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-3)'}}>×5</div>
          <div style={{flex:1}}>
            <div style={{fontSize:12, fontWeight:600}}>论文深读小队</div>
            <div style={{fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--fg-4)'}}>当前 4 人 · 加入后 5 人</div>
          </div>
          <span style={{fontSize:12, color:'var(--fg-4)'}}>▾</span>
        </div>
      </div>
    </div>

    {/* Footer */}
    <div style={{padding:'14px 18px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8}}>
      <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)'}}>预计：$0.012/条 · 平均 1.4s</span>
      <div style={{flex:1}}/>
      <button style={{padding:'8px 14px', background:'transparent', border:'1px solid var(--border)', borderRadius:8, color:'var(--fg-3)', fontSize:11.5}}>← 上一步</button>
      <button style={{padding:'8px 18px', background:'var(--accent)', color:'var(--accent-ink)', border:'none', borderRadius:8, fontSize:12, fontWeight:800}}>上岗 →</button>
    </div>
  </div>
);

const BoardCatalog = ({tweaks}) => (
  <div style={{height:'100%', overflow:'hidden', borderRadius:'inherit', background:'var(--bg)', display:'grid', gridTemplateColumns:'1fr 540px'}}>
    <CatalogGrid/>
    <div style={{padding:'18px 22px', background:'color-mix(in oklab, var(--accent) 4%, var(--bg))', overflow:'auto', position:'relative'}}>
      <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
        <Pill color="var(--status-warn)">QUICK HIRE</Pill>
        <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)'}}>从 Critic 卡片打开</span>
      </div>
      <div style={{fontSize:12.5, color:'var(--fg-3)', lineHeight:1.55, marginBottom:18, maxWidth:440}}>
        点击预设 → 起名字（继承默认）→ 选个性格 → 落到团队。<span style={{color:'var(--fg-1)'}}>三步上岗</span>，单个 agent 比 30 秒内可被招进团队。
      </div>
      <QuickHireModal/>
    </div>
    <style>{`@keyframes sf-cursor { 50% { opacity: 0; } }`}</style>
  </div>
);

window.BoardCatalog = BoardCatalog;
