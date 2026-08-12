/* P0a — Chat 3-column with Approval Gate moment.
   Left: workspace + team list. Mid: conversation timeline.
   Right: Approval Gate panel (the killer moment). */

const ChatLeft = ({tweaks}) => {
  const ws = WORKSPACES[0];
  const teams = [
    {id:'paper-deep', name:'论文深读小队', count:5, active:true,  unread:2, status:'run'},
    {id:'rebuttal',   name:'Rebuttal 起草',  count:3, active:false, unread:0, status:'idle'},
    {id:'lit-survey', name:'文献综述',       count:4, active:false, unread:5, status:'wait'},
  ];
  const dms = [
    {glyph:'读', color:'#A855F7', name:'读读',      status:'wait',  unread:1},
    {glyph:'批', color:'#F59E0B', name:'阿批',      status:'idle',  unread:0},
    {glyph:'查', color:'#22D3EE', name:'查查',      status:'idle',  unread:0},
  ];

  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', borderRight:'1px solid var(--border)', background:'var(--bg-elev-1)'}}>
      {/* Workspace bar */}
      <div style={{display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderBottom:'1px solid var(--border)'}}>
        <div style={{width:28, height:28, borderRadius:8, background:ws.color, color:'#0A0A0A', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:12}}>{ws.initial}</div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:12, fontWeight:700}}>{ws.name}</div>
          <div style={{fontFamily:'var(--font-mono)', fontSize:9, color:'var(--fg-4)', letterSpacing:'0.04em'}}>WORKSPACE · 7 agents · 3 teams</div>
        </div>
        <span style={{fontFamily:'var(--font-mono)', fontSize:9, color:'var(--fg-4)'}}>⌘K</span>
      </div>

      {/* Search */}
      <div style={{padding:'10px 14px 6px'}}>
        <div style={{display:'flex', alignItems:'center', gap:8, padding:'7px 10px', background:'var(--bg-elev-2)', border:'1px solid var(--border)', borderRadius:8}}>
          <span style={{color:'var(--fg-4)', fontSize:11}}>⌕</span>
          <span style={{fontSize:11, color:'var(--fg-4)'}}>搜索 agent / team / 消息</span>
        </div>
      </div>

      {/* Teams */}
      <SectionLabel right="3">团队</SectionLabel>
      <div style={{display:'flex', flexDirection:'column'}}>
        {teams.map(t => (
          <div key={t.id} style={{
            display:'flex', alignItems:'center', gap:10, padding:'8px 14px',
            background: t.active ? 'color-mix(in oklab, var(--accent) 12%, transparent)' : 'transparent',
            borderLeft: t.active ? '2px solid var(--accent)' : '2px solid transparent',
            cursor:'pointer',
          }}>
            <div style={{
              width:30, height:30, borderRadius:8,
              background:'var(--bg-elev-3)', border:'1px solid var(--border)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700, color:'var(--fg-3)',
            }}>×{t.count}</div>
            <div style={{flex:1, minWidth:0, display:'flex', alignItems:'center', gap:6}}>
              {t.status==='run' && tweaks.showLive && <Dot color="var(--status-run)" pulse/>}
              {t.status==='wait' && <Dot color="var(--status-warn)"/>}
              <span style={{fontSize:13, fontWeight: t.active?700:600, color: t.active?'var(--fg-1)':'var(--fg-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{t.name}</span>
            </div>
            {t.unread>0 && <span style={{minWidth:16, height:16, padding:'0 5px', borderRadius:8, background:'var(--accent)', color:'var(--accent-ink)', fontSize:9, fontWeight:800, display:'inline-flex', alignItems:'center', justifyContent:'center'}}>{t.unread}</span>}
          </div>
        ))}
      </div>

      {/* DMs */}
      <SectionLabel right="3">直接对话</SectionLabel>
      <div style={{display:'flex', flexDirection:'column'}}>
        {dms.map((d,i) => (
          <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 14px', cursor:'pointer'}}>
            <Avatar glyph={d.glyph} color={d.color} size={30} status={d.status==='wait'?'warn':null}/>
            <span style={{flex:1, minWidth:0, fontSize:13, fontWeight:600, color:'var(--fg-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{d.name}</span>
            {d.unread>0 && <span style={{minWidth:16, height:16, padding:'0 5px', borderRadius:8, background:'var(--accent)', color:'var(--accent-ink)', fontSize:9, fontWeight:800, display:'inline-flex', alignItems:'center', justifyContent:'center'}}>{d.unread}</span>}
          </div>
        ))}
      </div>

      <div style={{flex:1}}/>
      <div style={{padding:'10px 14px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10}}>
        <Avatar glyph="我" color="#10B981" size={28}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:11, fontWeight:600}}>张明 · Owner</div>
          <div style={{fontFamily:'var(--font-mono)', fontSize:9, color:'var(--fg-4)'}}>monthly · $42.18 / $200</div>
        </div>
        <span style={{fontSize:11, color:'var(--fg-4)'}}>⚙</span>
      </div>
    </div>
  );
};

/* Conversation timeline */
const Bubble = ({from, role, color, time, children, sys, gated}) => (
  <div style={{display:'flex', gap:10, marginBottom:18}}>
    {sys ? (
      <div style={{flex:1, display:'flex', justifyContent:'center'}}>
        <div style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)', letterSpacing:'0.04em', padding:'4px 10px', background:'var(--bg-elev-1)', borderRadius:6, border:'1px dashed var(--border)'}}>
          {children}
        </div>
      </div>
    ) : (
      <>
        <Avatar glyph={from[0]} color={color} size={32}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:4}}>
            <span style={{fontSize:12, fontWeight:700}}>{from}</span>
            <span style={{fontFamily:'var(--font-mono)', fontSize:9, color:'var(--fg-4)', letterSpacing:'0.04em'}}>{role}</span>
            <span style={{fontFamily:'var(--font-mono)', fontSize:9, color:'var(--fg-5)', marginLeft:'auto'}}>{time}</span>
          </div>
          <div style={{
            background: gated ? 'color-mix(in oklab, var(--status-warn) 10%, var(--bg-elev-1))' : 'var(--bg-elev-1)',
            border: gated ? '1px solid color-mix(in oklab, var(--status-warn) 50%, transparent)' : '1px solid var(--border)',
            borderRadius:10, padding:'10px 12px', fontSize:12.5, lineHeight:1.55,
          }}>{children}</div>
        </div>
      </>
    )}
  </div>
);

const ChatMid = ({tweaks}) => (
  <div style={{display:'flex', flexDirection:'column', height:'100%', background:'var(--bg)'}}>
    {/* Header */}
    <div style={{padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12}}>
      <div style={{width:34, height:34, borderRadius:8, background:'var(--bg-elev-2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-mono)', fontSize:11, fontWeight:700, color:'var(--fg-2)'}}>×5</div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span style={{fontSize:14, fontWeight:700}}>论文深读小队</span>
          {tweaks.showLive && <Pill color="var(--status-run)"><Dot color="var(--status-run)" pulse size={5}/>RUNNING</Pill>}
          <Pill color="var(--fg-4)" dim>POLICY · L2-Strict</Pill>
        </div>
        <div style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)', marginTop:2, letterSpacing:'0.03em'}}>
          paper-lab / 论文深读小队 · 5 agents · run #042 · started 09:14
        </div>
      </div>
      <button style={{padding:'6px 10px', background:'transparent', border:'1px solid var(--border)', borderRadius:6, color:'var(--fg-3)', fontSize:11, fontFamily:'var(--font-mono)'}}>工作流 →</button>
      <button style={{padding:'6px 10px', background:'transparent', border:'1px solid var(--border)', borderRadius:6, color:'var(--fg-3)', fontSize:11, fontFamily:'var(--font-mono)'}}>策略</button>
    </div>

    {/* Messages */}
    <div style={{flex:1, overflow:'hidden', padding:'18px 22px'}}>
      <Bubble sys>09:14 · 张明 启动 run #042 · 输入：arXiv:2410.11215</Bubble>

      <Bubble from="读读" role="READER · L1" color="#A855F7" time="09:14">
        已抓取 PDF · 38 页 / 12 节 / 47 引用。建议优先阅读 <span style={{color:'var(--accent-bright)', fontFamily:'var(--font-mono)', fontSize:11.5}}>§4 方法</span> 与 <span style={{color:'var(--accent-bright)', fontFamily:'var(--font-mono)', fontSize:11.5}}>§6 实验</span>。
      </Bubble>

      <Bubble from="阿批" role="CRITIC · L2" color="#F59E0B" time="09:16">
        发现潜在问题 3 处：
        <div style={{marginTop:8, display:'flex', flexDirection:'column', gap:6}}>
          {[
            ['§4.2', '基线选择避开了 ICLR-24 的更强基线 RetroCorr'],
            ['§5.1', '消融未覆盖 BatchSize × Dropout 联合效应'],
            ['§6.3', '与 Tab.2 数据不一致（73.4 vs 71.8）'],
          ].map(([sec,txt],i) => (
            <div key={i} style={{display:'flex', gap:10, padding:'7px 10px', background:'var(--bg-elev-2)', borderRadius:6, border:'1px solid var(--border)'}}>
              <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--status-warn)', fontWeight:700, minWidth:36}}>{sec}</span>
              <span style={{fontSize:11.5, color:'var(--fg-2)'}}>{txt}</span>
            </div>
          ))}
        </div>
      </Bubble>

      <Bubble from="查查" role="CITE-CHECKER · L1" color="#22D3EE" time="09:18">
        引用核对：47 / 47 ✓ · DOI 全部可达 · 自引比例 18%（正常）
      </Bubble>

      <Bubble sys>09:21 · 写写（Writer · L3）请求执行：发送 review 邮件至 ICLR PC</Bubble>

      <Bubble from="写写" role="WRITER · L3" color="#EF4444" time="09:21" gated>
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
          <span style={{fontSize:14}}>✋</span>
          <span style={{fontWeight:700, color:'var(--status-warn)'}}>已暂停 · 等待审批</span>
        </div>
        我准备调用 <span style={{fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--fg-1)', background:'var(--bg-elev-3)', padding:'1px 6px', borderRadius:4}}>email.send</span> 工具，将 review 草稿发往 <span style={{fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--fg-1)'}}>iclr-pc@iclr.cc</span>。
        <div style={{marginTop:8, fontSize:11, color:'var(--fg-4)'}}>该工具被策略 <span style={{color:'var(--status-warn)'}}>L3-Strict</span> 标为「需人工审批」。</div>
      </Bubble>
    </div>

    {/* Composer */}
    <div style={{padding:'12px 18px', borderTop:'1px solid var(--border)', background:'var(--bg-elev-1)'}}>
      <div style={{background:'var(--bg-elev-2)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px'}}>
        <div style={{fontSize:12, color:'var(--fg-5)', minHeight:38}}>@阿批 把第 3 处不一致写成详细的 issue...</div>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:6, paddingTop:8, borderTop:'1px solid var(--border)'}}>
          <div style={{display:'flex', gap:6}}>
            <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)', padding:'2px 6px', border:'1px solid var(--border)', borderRadius:4}}>@</span>
            <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)', padding:'2px 6px', border:'1px solid var(--border)', borderRadius:4}}>/</span>
            <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)', padding:'2px 6px', border:'1px solid var(--border)', borderRadius:4}}>📎</span>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <span style={{fontFamily:'var(--font-mono)', fontSize:9, color:'var(--fg-5)'}}>⏎ 发送 · ⇧⏎ 换行</span>
            <button style={{padding:'5px 12px', background:'var(--accent)', color:'var(--accent-ink)', border:'none', borderRadius:6, fontSize:11, fontWeight:700}}>发送</button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* Approval Gate panel */
const ChatRight = ({tweaks}) => {
  const highlight = tweaks.highlightApproval;
  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', borderLeft:'1px solid var(--border)', background:'var(--bg-elev-1)'}}>
      <div style={{padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8}}>
        <span style={{fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--fg-3)'}}>审批队列</span>
        <Pill color="var(--status-warn)" style={{marginLeft:'auto'}}>1 PENDING</Pill>
      </div>

      {/* Approval Gate card — the moment */}
      <div style={{
        margin:14, padding:14, borderRadius:12,
        background: highlight ? 'color-mix(in oklab, var(--status-warn) 8%, var(--bg-elev-2))' : 'var(--bg-elev-2)',
        border: highlight ? '1px solid color-mix(in oklab, var(--status-warn) 60%, transparent)' : '1px solid var(--border)',
        boxShadow: highlight ? '0 0 0 4px color-mix(in oklab, var(--status-warn) 12%, transparent), 0 8px 24px -8px rgba(245,158,11,.3)' : 'none',
        position:'relative',
      }}>
        {highlight && (
          <div style={{position:'absolute', top:-9, left:14, padding:'2px 8px', background:'var(--status-warn)', color:'#0A0A0A', borderRadius:4, fontFamily:'var(--font-mono)', fontSize:9, fontWeight:800, letterSpacing:'0.08em'}}>APPROVAL GATE</div>
        )}
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
          <Avatar glyph="写" color="#EF4444" size={36}/>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, fontWeight:700}}>写写 想发邮件</div>
            <div style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)'}}>WRITER · L3 · 09:21:34</div>
          </div>
        </div>

        <KeyVal label="工具" value="email.send" valueColor="var(--accent-bright)"/>
        <div style={{height:6}}/>
        <KeyVal label="收件人" value="iclr-pc@iclr.cc"/>
        <div style={{height:6}}/>
        <KeyVal label="主题" value="[Review] arXiv:2410.11215"/>
        <div style={{height:6}}/>
        <KeyVal label="正文" value="…经阿批/查查复核后，建…"/>
        <div style={{height:6}}/>
        <KeyVal label="风险" value="外发 · 不可撤销" valueColor="var(--status-reject)"/>

        <div style={{marginTop:12, padding:'8px 10px', background:'var(--bg)', borderRadius:6, border:'1px dashed var(--border)'}}>
          <div style={{fontFamily:'var(--font-mono)', fontSize:9, color:'var(--fg-4)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:4}}>触发策略</div>
          <div style={{fontSize:11, color:'var(--fg-2)'}}>L3 + 外发邮件 + 第三方收件人 → <span style={{color:'var(--status-warn)'}}>需 Owner 审批</span></div>
        </div>

        <div style={{display:'flex', gap:8, marginTop:12}}>
          <button style={{flex:1, padding:'9px 12px', background:'var(--accent)', color:'var(--accent-ink)', border:'none', borderRadius:8, fontSize:12, fontWeight:700}}>批准</button>
          <button style={{flex:1, padding:'9px 12px', background:'transparent', color:'var(--status-reject)', border:'1px solid color-mix(in oklab, var(--status-reject) 40%, transparent)', borderRadius:8, fontSize:12, fontWeight:600}}>驳回</button>
        </div>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8, fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--fg-4)'}}>
          <span>Y · N · ⌘↵ 批准</span>
          <span>本次 / 总是 / 仅此团队</span>
        </div>
      </div>

      {/* History */}
      <SectionLabel right="今日 12">最近审批</SectionLabel>
      <div style={{padding:'0 14px 14px', display:'flex', flexDirection:'column', gap:6}}>
        {[
          {who:'读读', what:'fetch arxiv.org/2410.11215', t:'09:14', state:'auto', tone:'var(--status-ok)'},
          {who:'阿批', what:'read · 47 sources', t:'09:16', state:'auto', tone:'var(--status-ok)'},
          {who:'查查', what:'http.get · 47 DOIs', t:'09:18', state:'ok', tone:'var(--status-ok)'},
          {who:'写写', what:'fs.write review-draft.md', t:'09:20', state:'ok', tone:'var(--status-ok)'},
          {who:'写写', what:'email.send (尝试)', t:'09:11', state:'拒', tone:'var(--status-reject)'},
        ].map((h,i) => (
          <div key={i} style={{display:'flex', alignItems:'center', gap:8, padding:'7px 10px', background:'var(--bg-elev-2)', border:'1px solid var(--border)', borderRadius:6}}>
            <Dot color={h.tone}/>
            <span style={{fontSize:11, fontWeight:600, minWidth:28}}>{h.who}</span>
            <span style={{fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--fg-3)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{h.what}</span>
            <span style={{fontFamily:'var(--font-mono)', fontSize:9, color:'var(--fg-5)'}}>{h.t}</span>
            <span style={{fontFamily:'var(--font-mono)', fontSize:9, color:h.tone, fontWeight:700, minWidth:22, textAlign:'right'}}>{h.state}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const BoardChat = ({tweaks}) => (
  <div style={{display:'grid', gridTemplateColumns:'280px 1fr 360px', height:'100%', overflow:'hidden', borderRadius:'inherit', background:'var(--bg)'}}>
    <ChatLeft tweaks={tweaks}/>
    <ChatMid tweaks={tweaks}/>
    <ChatRight tweaks={tweaks}/>
    <style>{`
      @keyframes sf-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: .35; }
      }
    `}</style>
  </div>
);

window.BoardChat = BoardChat;
