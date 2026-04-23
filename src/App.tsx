import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import EditorPage from './EditorPage';
import TemplatesPage from './TemplatesPage';
import { ImportTemplateDialog } from './core/components/Template/ImportTemplateDialog';

// ============ i18n ============
const T = {
  EN: {
    nav: ['Product', 'Templates', 'Import', 'Docs', 'About', 'GitHub ↗'],
    signIn: 'Sign in',
    openEditor: '▶ Open Editor',
    mainnet: 'MAINNET · block 2 848 310',
    pinned: '2 384 teams pinned',
    eyebrow: '◆ ShadowFlow v0.4.2 · a Ravenveil build',
    h1a: 'Agents that',
    h1strike: 'work alone',
    h1b: "can't",
    h1grad: 'form a team.',
    h1c: 'We fix that.',
    lead: 'A multi-agent IDE with a runtime {policy} that decides who can approve, block, or retry whom. Drop agents on a canvas, wire the disagreements, and {cid} anyone can fork.',
    leadPolicy: 'Policy Matrix',
    leadCid: 'publish the whole team to 0G as a CID',
    ctaPrimary: '▶ Quick Demo · 60s',
    ctaSecondary: '⎘ Import a team by CID',
    stats: [
      { k: 'Teams pinned', v: '2 384', d: '↗ +312 this week', up: true },
      { k: 'Runs verified', v: '18.6k', d: '0g attest · ✓' },
      { k: 'Avg SSE', v: '87ms', mono: true, d: 'claude-sonnet-4' },
      { k: 'Seed templates', v: '6', d: '+248 community' },
    ],
    vsEyebrow: 'vs. the alternatives',
    vsH2a: "How we're",
    vsH2b: 'different.',
    vsSubtitle: "n8n routes data. ChatGPT routes tokens. ShadowFlow routes decisions — with runtime-enforced policy.",
    featEyebrow: 'core primitives',
    featH2a: 'Built for',
    featH2b: 'real disagreement.',
    featItems: [
      {
        icon: '⊞',
        title: 'Policy Matrix',
        desc: 'Declare who can approve, reject, or retry whom — before the run starts. Not config; runtime enforcement.',
      },
      {
        icon: '◆',
        title: 'Checkpoint · Time-travel',
        desc: 'Every handoff saves a checkpoint to 0G. Branch, rewind, or audit any decision in the run history.',
      },
      {
        icon: '⑂',
        title: '0G · On-chain ownership',
        desc: 'Pin the entire team (agents + policy + history) to 0G Storage as a CID. Anyone can fork and verify provenance.',
      },
    ],
    proofItems: [
      { k: 'TEAMS PINNED',    v: '2 384',  grad: true, d: '↗ +312 this week' },
      { k: 'RUNS VERIFIED',   v: '18.6k',  d: '0g attest · ✓' },
      { k: 'AVG SSE LATENCY', v: '87ms',   mono: true, d: 'claude-sonnet-4 · temp 0.2' },
      { k: 'SEED TEMPLATES',  v: '6',      d: '+248 community forks' },
    ],
    tplEyebrow: 'seed templates',
    tplH2: 'Start from a proven team.',
    tplViewAll: 'View all 254 →',
    tplFooterUse: '▶ Use template',
    tplFooterPreview: '↗ Preview',
    importH2a: 'Fork any team.',
    importH2b: 'Verify its history.',
    importDesc: 'Paste a 0G CID to fetch a community team, verify its on-chain lineage, and import it into your workspace in seconds.',
    importPlaceholder: 'cid://0x3f7a…bc91',
    importBtn: 'Fetch & Verify',
    importSteps: [
      'Resolve CID on 0G Storage',
      'Verify Merkle root on-chain',
      'Import team + policy + checkpoints',
    ],
    ctaBandH2a: 'Build the team that',
    ctaBandH2b: 'disagrees correctly.',
    ctaBandSub: 'Open-source · MIT · ships 2026-05-16 · 0G Hackathon build',
    ctaBandPrimary: '▶ Open Editor',
    ctaBandSecondary: 'GitHub · Ravenveil/ShadowFlow ↗',
    footerCopy: 'ShadowFlow · Ravenveil · MIT · 0G Hackathon 2026',
    footerLinks: ['GitHub', 'Docs', 'Templates', 'About', '0G Network ↗'],
    rivals: [
      { name: 'CHATGPT', them: '1 agent chatting to you', us: 'A team with rejection rules', note: 'no Policy Matrix · no retry gate', stat: 'team enforcement' },
      { name: 'CREWAI',  them: 'role-play scripts that pretend to collaborate', us: 'Runtime enforcement + checkpoint', note: 'no checkpoint · no rollback', stat: 'state persistence' },
      { name: 'N8N',     them: 'n8n routes data', us: 'ShadowFlow routes decisions with policy', note: 'no approval gate · no agent ownership', stat: 'decision routing' },
      { name: 'AUTOGEN', them: 'chat loop between agents', us: 'Policy Matrix with lane-level authority', note: 'no lane authority · no 0G writeback', stat: 'authority model' },
      { name: 'LANGCHAIN',them: 'chain of LLM calls', us: 'DAG with gates, barriers, and retries', note: 'no DAG · no gate types', stat: 'flow control' },
      { name: 'DIFY',    them: 'visual chatbot builder', us: 'Full team IDE, ships to blockchain', note: 'no on-chain ownership', stat: '0G provenance' },
    ],
    templates: [
      { alias: 'solo_company',   title: 'Solo Company',   cjk: '单人公司', desc: '9 agents · CEO to Intern. Full OODA loop, rejection matrix.' },
      { alias: 'academic_paper', title: 'Academic Paper', cjk: '学术论文', desc: 'Planner → Researcher → Writer → Critic → Publisher.' },
      { alias: 'newsroom',       title: 'Newsroom',       cjk: '新闻编辑室', desc: 'Real-time research, fact-check gate, editorial approval.' },
      { alias: 'ming_cabinet',   title: 'Ming Cabinet',   cjk: '内阁', desc: '明朝六部结构 — 礼 · 户 · 吏 · 兵 · 刑 · 工.' },
    ],
  },
  CN: {
    nav: ['产品', '模板', '导入', '文档', '关于', 'GitHub ↗'],
    signIn: '登录',
    openEditor: '▶ 打开编辑器',
    mainnet: '主网 · 区块 2 848 310',
    pinned: '2 384 个团队已上链',
    eyebrow: '◆ ShadowFlow v0.4.2 · Ravenveil 出品',
    h1a: '智能体',
    h1strike: '各自为战',
    h1b: '，没有',
    h1grad: '真正的团队。',
    h1c: '我们来做。',
    lead: '多智能体工作流 IDE，内置运行时{policy}——在运行前声明谁可以批准、拦截或重试谁。把智能体拖到画布上，连好分歧规则，再把整个团队{cid}。',
    leadPolicy: 'Policy Matrix',
    leadCid: '作为 CID 发布到 0G 链上，任何人都可以 fork',
    ctaPrimary: '▶ 60 秒快速演示',
    ctaSecondary: '⎘ 通过 CID 导入团队',
    stats: [
      { k: '已上链团队', v: '2 384', d: '↗ 本周 +312', up: true },
      { k: '已验证运行次数', v: '18.6k', d: '0g 链上认证 · ✓' },
      { k: '平均 SSE 延迟', v: '87ms', mono: true, d: 'claude-sonnet-4' },
      { k: '种子模板', v: '6', d: '+248 社区模板' },
    ],
    vsEyebrow: '与同类产品的差别',
    vsH2a: '为什么选',
    vsH2b: 'ShadowFlow。',
    vsSubtitle: 'n8n 路由数据，ChatGPT 路由 token，ShadowFlow 路由决策——有运行时 Policy 强制执行。',
    featEyebrow: '核心原语',
    featH2a: '为真实的',
    featH2b: '分歧而生。',
    featItems: [
      {
        icon: '⊞',
        title: 'Policy Matrix',
        desc: '在运行前声明谁可以批准、拒绝或重试谁。不是配置文件，是运行时强制执行。',
      },
      {
        icon: '◆',
        title: 'Checkpoint · 时间旅行',
        desc: '每次任务交接都会向 0G 保存一个 checkpoint。可以分支、回滚，或审计运行历史中的任意决策。',
      },
      {
        icon: '⑂',
        title: '0G · 链上所有权',
        desc: '将整个团队（智能体 + 策略 + 历史）作为 CID 固定到 0G Storage。任何人都可以 fork 并验证溯源。',
      },
    ],
    proofItems: [
      { k: '已上链团队',   v: '2 384',  grad: true, d: '↗ 本周 +312' },
      { k: '已验证运行',   v: '18.6k',  d: '0g 认证 · ✓' },
      { k: '平均 SSE 延迟', v: '87ms',  mono: true, d: 'claude-sonnet-4 · temp 0.2' },
      { k: '种子模板',     v: '6',      d: '+248 社区 fork' },
    ],
    tplEyebrow: '种子模板',
    tplH2: '从验证过的团队开始。',
    tplViewAll: '查看全部 254 个 →',
    tplFooterUse: '▶ 使用模板',
    tplFooterPreview: '↗ 预览',
    importH2a: 'Fork 任意团队。',
    importH2b: '验证其历史。',
    importDesc: '粘贴一个 0G CID 来获取社区团队，验证其链上溯源，并在几秒内导入到你的工作区。',
    importPlaceholder: 'cid://0x3f7a…bc91',
    importBtn: '获取并验证',
    importSteps: [
      '在 0G Storage 解析 CID',
      '链上验证 Merkle root',
      '导入团队 + 策略 + checkpoints',
    ],
    ctaBandH2a: '组建一支能够',
    ctaBandH2b: '有效说不的团队。',
    ctaBandSub: '开源 · MIT · 2026-05-16 发布 · 0G Hackathon 参赛作品',
    ctaBandPrimary: '▶ 打开编辑器',
    ctaBandSecondary: 'GitHub · Ravenveil/ShadowFlow ↗',
    footerCopy: 'ShadowFlow · Ravenveil · MIT · 0G Hackathon 2026',
    footerLinks: ['GitHub', '文档', '模板', '关于', '0G 网络 ↗'],
    rivals: [
      { name: 'CHATGPT',  them: '单个智能体与你对话', us: '有拒绝规则的团队', note: '无 Policy Matrix · 无重试门', stat: '团队执法' },
      { name: 'CREWAI',   them: '假装协作的角色扮演脚本', us: '运行时强制执行 + checkpoint', note: '无 checkpoint · 无回滚', stat: '状态持久化' },
      { name: 'N8N',      them: 'n8n 路由数据', us: 'ShadowFlow 用策略路由决策', note: '无审批门 · 无智能体权属', stat: '决策路由' },
      { name: 'AUTOGEN',  them: '智能体间的聊天循环', us: '带泳道级权限的 Policy Matrix', note: '无泳道权限 · 无 0G 写回', stat: '权限模型' },
      { name: 'LANGCHAIN', them: 'LLM 调用链', us: '带门、屏障和重试的 DAG', note: '无 DAG · 无门类型', stat: '流程控制' },
      { name: 'DIFY',     them: '可视化聊天机器人构建器', us: '完整团队 IDE，发布到区块链', note: '无链上所有权', stat: '0G 溯源' },
    ],
    templates: [
      { alias: 'solo_company',   title: '单人公司',   cjk: 'Solo Company',   desc: '9 个智能体 · CEO 到实习生。完整 OODA 循环，拒绝矩阵。' },
      { alias: 'academic_paper', title: '学术论文',   cjk: 'Academic Paper', desc: '规划者 → 研究员 → 写手 → 评审 → 发布者。' },
      { alias: 'newsroom',       title: '新闻编辑室', cjk: 'Newsroom',       desc: '实时调研、事实核查门、编辑审批。' },
      { alias: 'ming_cabinet',   title: '内阁',       cjk: 'Ming Cabinet',   desc: '明朝六部结构 — 礼 · 户 · 吏 · 兵 · 刑 · 工。' },
    ],
  },
} as const;

type Lang = 'EN' | 'CN';

// ============ BYOK banner ============
const API_BASE =
  (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env
    ?.VITE_API_BASE ?? 'http://localhost:8000';

const LOCALSTORAGE_KEYS = [
  'SHADOWFLOW_ANTHROPIC_API_KEY',
  'SHADOWFLOW_OPENAI_API_KEY',
  'SHADOWFLOW_GEMINI_API_KEY',
];

function MissingKeyBanner(): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const hasLocalKey = LOCALSTORAGE_KEYS.some((k) => {
      try { return Boolean(window.localStorage.getItem(k)); } catch { return false; }
    });
    if (hasLocalKey) return;
    fetch(`${API_BASE}/`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        const m: string[] = Array.isArray(body?.missing_keys) ? body.missing_keys : [];
        if (m.length > 0) { setMissing(m); setVisible(true); }
      })
      .catch(() => { if (!cancelled) { setMissing(['(API unreachable)']); setVisible(true); } });
    return () => { cancelled = true; };
  }, []);

  if (!visible) return null;
  return (
    <div style={{ background: 'var(--status-warn-tint)', borderBottom: '1px solid rgba(245,158,11,.35)', color: 'var(--status-warn)', padding: '8px 20px', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', gap: 12 }}>
      <span>⚠ API KEY MISSING · set <code>SHADOWFLOW_ANTHROPIC_API_KEY</code> in localStorage to enable BYOK · missing: {missing.join(', ')}</span>
      <button onClick={() => setVisible(false)} style={{ color: 'var(--fg-4)', fontSize: 14, lineHeight: 1 }} aria-label="Close">✕</button>
    </div>
  );
}

// ============ Ticker ============
function Ticker({ t }: { t: typeof T.EN | typeof T.CN }) {
  const items = [
    { text: '◆ 0G HACKATHON 2026', accent: true }, { text: '·', dim: true },
    { text: 'MIT LICENSE' }, { text: '·', dim: true },
    { text: 'SHIPS 2026-05-16' }, { text: '·', dim: true },
    { text: 'POLICY MATRIX', accent: true }, { text: '·', dim: true },
    { text: 'CHECKPOINT · EVERY HANDOFF' }, { text: '·', dim: true },
    { text: t.pinned.toUpperCase(), accent: true }, { text: '·', dim: true },
    { text: '18.6K RUNS VERIFIED' }, { text: '·', dim: true },
  ];
  const row = (
    <span style={{ display: 'inline-flex', gap: 48, paddingLeft: 48 }}>
      {items.map((item, i) => (
        <span key={i} style={{ color: item.accent ? 'var(--accent-bright)' : item.dim ? 'var(--fg-5)' : undefined }}>{item.text}</span>
      ))}
    </span>
  );
  return (
    <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', position: 'relative', zIndex: 2, marginBottom: 24, height: 28, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'inline-flex', gap: 48, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)', letterSpacing: '.18em', textTransform: 'uppercase', fontWeight: 600, animation: 'sf-marquee 50s linear infinite', whiteSpace: 'nowrap' }}>
        {row}{row}
      </div>
    </div>
  );
}

// ============ Orb ============
function Orb({ state, style, glyph, badge, badgeColor }: { state: 'ok' | 'run' | 'rej'; style: React.CSSProperties; glyph: string; badge: string; badgeColor: string }) {
  const stateStyles: Record<string, React.CSSProperties> = {
    ok:  { borderColor: 'var(--status-ok)', boxShadow: '0 0 0 3px rgba(16,185,129,.08)' },
    run: { borderColor: 'var(--accent)', boxShadow: '0 0 0 4px rgba(168,85,247,.12), 0 0 28px -2px rgba(168,85,247,.6)', animation: 'sf-breathe 2.4s ease-in-out infinite' },
    rej: { borderColor: 'var(--status-reject)', boxShadow: '0 0 0 4px rgba(239,68,68,.1)' },
  };
  return (
    <div style={{ position: 'absolute', width: 54, height: 54, borderRadius: '50%', background: 'var(--bg-elev-3)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontSize: 20, fontWeight: 900, color: 'var(--fg-1)', letterSpacing: '-.03em', zIndex: 3, ...stateStyles[state], ...style }}>
      {glyph}
      <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)', width: 18, height: 18, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 9, border: '2px solid var(--skin-panel)', background: badgeColor, color: '#fff' }}>{badge}</div>
      {state === 'rej' && <div style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: 'var(--status-reject)', color: '#2A0A0F', fontWeight: 900, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--skin-panel)' }}>✗</div>}
    </div>
  );
}

function OrbLabel({ label, style, color, accent, children }: { label: string; style: React.CSSProperties; color?: string; accent?: boolean; children?: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 700, color: color ?? (accent ? 'var(--accent-bright)' : 'var(--fg-2)'), letterSpacing: '-.01em', zIndex: 3, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, ...style }}>
      {label}{children}
    </div>
  );
}

function HcMsg({ children, accent, reject, style }: { children: React.ReactNode; accent?: boolean; reject?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{ position: 'absolute', background: reject ? 'var(--status-reject-tint)' : accent ? 'linear-gradient(180deg, rgba(168,85,247,.08), var(--bg-elev-2))' : 'var(--bg-elev-2)', border: `1px solid ${reject ? 'rgba(239,68,68,.35)' : accent ? 'rgba(168,85,247,.4)' : 'var(--border)'}`, borderRadius: 10, padding: '6px 10px', fontSize: 10.5, color: 'var(--fg-2)', maxWidth: 180, lineHeight: 1.35, zIndex: 4, animation: 'sf-float 4s ease-in-out infinite', ...style }}>
      {children}
    </div>
  );
}

// ============ Hero Canvas (static — no lang dependency) ============
function HeroCanvas() {
  return (
    <div style={{ position: 'relative', aspectRatio: '1.02', background: `radial-gradient(ellipse at 50% 40%, rgba(168,85,247,.06), transparent 65%), var(--skin-panel)`, border: '1px solid var(--border)', borderRadius: 28, overflow: 'hidden', boxShadow: '0 40px 80px -20px rgba(0,0,0,.5), 0 0 0 1px var(--border), 0 0 120px -10px rgba(168,85,247,.2)' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, var(--bg-elev-4) 1px, transparent 1px)', backgroundSize: '22px 22px', opacity: .35 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 30% 20%, rgba(168,85,247,.2), transparent 50%)', pointerEvents: 'none' }} />

      {/* Window chrome */}
      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 5 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {['#EF4444', '#F59E0B', '#10B981'].map((c) => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', letterSpacing: '.1em' }}>run_2026_04_16_08_49 · academic_paper</span>
        </div>
        <div style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-4)' }}>
          <span>r2/3</span><span style={{ color: 'var(--fg-5)' }}>·</span><span>87ms SSE</span>
        </div>
      </div>

      {/* SVG edges */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 480 490" preserveAspectRatio="none">
        <defs>
          <marker id="H-ok"  viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><polygon points="0,0 10,5 0,10" fill="#10B981" /></marker>
          <marker id="H-run" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><polygon points="0,0 10,5 0,10" fill="#A855F7" /></marker>
          <marker id="H-rej" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><polygon points="0,0 10,5 0,10" fill="#EF4444" /></marker>
        </defs>
        <path d="M 100,140 C 140,150 160,160 190,170" stroke="#10B981" strokeWidth="1.5" fill="none" markerEnd="url(#H-ok)" />
        <path d="M 100,140 C 140,200 160,230 190,250" stroke="#10B981" strokeWidth="1.5" fill="none" markerEnd="url(#H-ok)" />
        <path id="hf1" d="M 240,170 C 270,200 280,240 300,270" stroke="#A855F7" strokeWidth="2" fill="none" strokeDasharray="5 4" style={{ animation: 'sf-dash-anim 1s linear infinite' }} markerEnd="url(#H-run)" />
        <path id="hf2" d="M 240,270 C 270,260 280,275 300,280" stroke="#A855F7" strokeWidth="2" fill="none" strokeDasharray="5 4" style={{ animation: 'sf-dash-anim 1s linear infinite' }} markerEnd="url(#H-run)" />
        <path d="M 340,290 C 380,280 400,260 410,220" stroke="#EF4444" strokeWidth="2" fill="none" markerEnd="url(#H-rej)" />
        <path d="M 400,180 C 420,130 360,120 330,260" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
        <circle r="2.5" fill="#D8B4FE"><animateMotion dur="1.6s" repeatCount="indefinite"><mpath href="#hf1" /></animateMotion></circle>
        <circle r="2.5" fill="#D8B4FE"><animateMotion dur="1.6s" begin=".5s" repeatCount="indefinite"><mpath href="#hf1" /></animateMotion></circle>
        <circle r="2.5" fill="#D8B4FE"><animateMotion dur="1.4s" repeatCount="indefinite"><mpath href="#hf2" /></animateMotion></circle>
      </svg>

      {/* Fan-out group */}
      <div style={{ position: 'absolute', top: 85, left: 160, width: 120, height: 220, border: '1.5px dashed rgba(168,85,247,.35)', borderRadius: 18, zIndex: 1, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: -10, left: 16, background: 'var(--skin-panel)', padding: '2px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--accent-bright)' }}>↯ fan-out</div>
      </div>

      <Orb state="ok"  style={{ top: 112, left: 48 }}  glyph="P" badge="C"  badgeColor="#D97706" />
      <OrbLabel label="Planner"       style={{ top: 174, left: 40,  width: 70 }} />
      <Orb state="ok"  style={{ top: 140, left: 190 }} glyph="L" badge="0G" badgeColor="#6366F1" />
      <OrbLabel label="LitReviewer"   style={{ top: 202, left: 180, width: 75 }} />
      <Orb state="ok"  style={{ top: 240, left: 190 }} glyph="D" badge="C"  badgeColor="#D97706" />
      <OrbLabel label="DataScout"     style={{ top: 302, left: 180, width: 75 }} />
      <Orb state="run" style={{ top: 250, left: 300 }} glyph="W" badge="C"  badgeColor="#D97706" />
      <OrbLabel label="SectionWriter" accent style={{ top: 312, left: 288, width: 80 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--fg-4)', fontWeight: 600 }}>● r2/3 · 87ms</span>
      </OrbLabel>
      <Orb state="rej" style={{ top: 160, left: 398 }} glyph="A" badge="C"  badgeColor="#D97706" />
      <OrbLabel label="Advisor" style={{ top: 222, left: 385, width: 75 }} color="var(--status-reject)" />

      <HcMsg accent style={{ top: 210, left: 252, animationDelay: '-.5s' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 3 }}>→ handoff · streaming</div>
        "Methods §3.2 draft — 12 sources tagged…"
      </HcMsg>
      <HcMsg reject style={{ top: 64, left: 290, animationDelay: '-1.5s' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--status-reject)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 3 }}>✗ advisor · reject</div>
        "Gap — no baseline comparison to Zhang (2021)."
      </HcMsg>

      {/* Matrix pulse */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, background: 'var(--bg-elev-2)', border: '1px solid rgba(168,85,247,.3)', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, zIndex: 6 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent-tint)', border: '1px solid rgba(168,85,247,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--accent-bright)', flexShrink: 0 }}>⊞</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--status-reject)', letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700 }}>POLICY MATRIX · BLOCKED</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-0)', lineHeight: 1.3 }}>Advisor.reject(SectionWriter)</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-4)', marginTop: 2 }}>rollback → cp_draft_v2 · retry 2/3</div>
        </div>
        <span className="sf-chip sf-chip-accent" style={{ flexShrink: 0 }}>⑂ fork</span>
      </div>
    </div>
  );
}

// ============ Feature mini diagrams ============
function PolicyMini() {
  const rows: [string, string, string, string][] = [
    ['ADVISOR', 'ok', 'ok', 'no'],
    ['EDITOR',  'gate', 'ok', 'ok'],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '54px repeat(3, 1fr)', gap: 3, fontFamily: 'var(--font-mono)', fontSize: 9.5 }}>
      {['', 'WRITER', 'CRITIC', 'PUBLISH'].map((h) => (
        <div key={h} style={{ padding: '4px 0', textAlign: 'center', background: h ? 'var(--bg-elev-2)' : 'transparent', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--fg-2)', fontWeight: 700 }}>{h}</div>
      ))}
      {rows.map(([role, c1, c2, c3]) => (
        [
          <div key={`${role}-label`} style={{ padding: '4px 0', textAlign: 'center', background: 'var(--bg-elev-1)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--fg-3)', fontWeight: 700, fontSize: 9 }}>{role}</div>,
          ...[c1, c2, c3].map((c, i) => (
            <div key={`${role}-${i}`} style={{ padding: '4px 0', textAlign: 'center', borderRadius: 3, border: '1px solid', background: c === 'ok' ? 'var(--status-ok-tint)' : c === 'no' ? 'var(--status-reject-tint)' : 'var(--status-warn-tint)', color: c === 'ok' ? 'var(--status-ok)' : c === 'no' ? 'var(--status-reject)' : 'var(--status-warn)', borderColor: c === 'ok' ? 'rgba(16,185,129,.3)' : c === 'no' ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.3)' }}>{c === 'ok' ? '✓' : c === 'no' ? '✗' : '⊞'}</div>
          )),
        ]
      ))}
    </div>
  );
}

function CheckpointMini() {
  return (
    <div style={{ position: 'relative', height: 40 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, background: 'linear-gradient(90deg, var(--status-ok), var(--status-ok) 44%, var(--status-reject) 50%, var(--accent) 56%, var(--accent))' }} />
      {[
        { left: '10%', color: 'var(--status-ok)', label: 'cp_plan' },
        { left: '40%', color: 'var(--status-ok)', label: 'cp_draft' },
        { left: '50%', color: 'var(--status-reject)', label: 'REJECT' },
        { left: '60%', color: 'var(--accent)', label: 'retry_2', pulse: true },
      ].map(({ left, color, label, pulse }) => (
        <div key={label} style={{ position: 'absolute', left, top: '50%', transform: 'translate(-50%, -50%)' }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--bg)', border: `2px solid ${color}`, ...(pulse ? { boxShadow: `0 0 0 4px rgba(168,85,247,.18)`, animation: 'sf-pulse 1.4s ease-in-out infinite' } : {}) }} />
          <div style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

function ChainMini({ steps }: { steps: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {steps.map((text, n) => (
        <div key={n} style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-tint)', color: 'var(--accent-bright)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, border: '1px solid rgba(168,85,247,.3)', flexShrink: 0 }}>{n + 1}</div>
          {text}
        </div>
      ))}
    </div>
  );
}

// ============ Hover card helper ============
function HoverCard({ children, style, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{ transition: 'all var(--dur-2)', borderColor: hov ? 'rgba(168,85,247,.4)' : 'var(--border)', transform: hov ? 'translateY(-3px)' : '', ...style }}
    >
      {children}
    </div>
  );
}

// ============ Main App ============
export default function App(): JSX.Element {
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>('EN');
  const [view, setView] = useState<'landing' | 'templates' | 'editor'>('landing');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('blank');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const t = T[lang];
  const cidRef = useRef<HTMLInputElement>(null);

  const chainSteps = t.importSteps;
  const openEditor = () => setView('templates');
  const openImport = useCallback(() => navigate('/import'), [navigate]);
  const toggleLang = () => setLang(l => l === 'EN' ? 'CN' : 'EN');
  const pickTemplate = (alias: string) => { setSelectedTemplate(alias); setView('editor'); };

  if (view === 'templates') {
    return <TemplatesPage
      onBack={() => setView('landing')}
      onPick={pickTemplate}
      lang={lang}
      onToggleLang={toggleLang}
    />;
  }

  if (view === 'editor') {
    return <EditorPage
      onBack={() => setView('templates')}
      lang={lang}
      onToggleLang={toggleLang}
      templateAlias={selectedTemplate}
    />;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', overflowX: 'hidden' }}>
      <MissingKeyBanner />

      {/* ====== TOP NAV ====== */}
      <div style={{ height: 60, borderBottom: '1px solid var(--border)', background: 'rgba(10,10,10,.85)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', gap: 28, padding: '0 32px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div className="sf-logo">
          <div className="sf-logo-mark">S</div>
          <div className="sf-logo-word">ShadowFlow</div>
          <span className="sf-chip" style={{ marginLeft: 8, background: 'var(--accent-tint)', color: 'var(--accent-bright)', borderColor: 'rgba(168,85,247,.35)' }}>0G-native</span>
        </div>
        <nav style={{ display: 'flex', gap: 22 }}>
          {t.nav.map((item) => {
            const isImport = item === 'Import' || item === '导入';
            return (
              <a key={item} href="#" style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-3)', textDecoration: 'none' }}
                onClick={isImport ? (e) => { e.preventDefault(); openImport(); } : undefined}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--fg-1)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--fg-3)')}>
                {item}
              </a>
            );
          })}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-4)', padding: '0 12px', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', height: 28 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-ok)', boxShadow: '0 0 8px var(--status-ok)', animation: 'sf-pulse 1.8s ease-in-out infinite' }} />
            <span>{t.mainnet}</span>
            <span style={{ color: 'var(--fg-5)' }}>·</span>
            <span>{t.pinned}</span>
          </div>
          <button className="sf-btn sf-btn-ghost" onClick={() => setLang(l => l === 'EN' ? 'CN' : 'EN')}>
            {lang === 'EN' ? '中 / EN' : 'EN / 中'}
          </button>
          <button className="sf-btn sf-btn-ghost">{t.signIn}</button>
          <button
            onClick={() => setImportDialogOpen(true)}
            style={{ height: 34, padding: '0 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid rgba(167,139,250,.45)', background: 'rgba(167,139,250,.1)', color: '#A78BFA', cursor: 'pointer' }}
          >
            + 新建模板
          </button>
          <button className="sf-btn sf-btn-primary" onClick={openEditor}>{t.openEditor}</button>
        </div>
      </div>
      <ImportTemplateDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImported={() => setImportDialogOpen(false)}
      />

      {/* ====== HERO ====== */}
      <div style={{ position: 'relative', padding: '60px 40px 40px', maxWidth: 1440, margin: '0 auto', overflow: 'hidden', minHeight: 820 }}>
        <div style={{ position: 'absolute', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,.18), transparent 65%)', pointerEvents: 'none', filter: 'blur(30px)', zIndex: 0, top: -100, right: -200 }} />
        <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.14), transparent 65%)', pointerEvents: 'none', filter: 'blur(30px)', zIndex: 0, bottom: -200, left: -150 }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--bg-elev-4) 1px, transparent 1px), linear-gradient(90deg, var(--bg-elev-4) 1px, transparent 1px)', backgroundSize: '60px 60px', opacity: .35, maskImage: 'radial-gradient(ellipse at 50% 40%, black 10%, transparent 70%)', pointerEvents: 'none' }} />

        <Ticker t={t} />

        <div style={{ position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 52, alignItems: 'center', marginTop: 36 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--accent-bright)', padding: '7px 14px', borderRadius: 999, background: 'var(--accent-tint)', border: '1px solid rgba(168,85,247,.45)', marginBottom: 22 }}>
              {t.eyebrow}
            </div>

            <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(52px, 6vw, 96px)', fontWeight: 900, lineHeight: .93, letterSpacing: '-.048em', margin: '0 0 28px' }}>
              {t.h1a}{' '}
              <span style={{ color: 'var(--fg-5)', position: 'relative', display: 'inline-block' }}>
                {t.h1strike}
                <span style={{ position: 'absolute', left: -4, right: -4, top: '50%', height: 4, background: 'var(--status-reject)', borderRadius: 2, transform: 'rotate(-2deg)', display: 'block' }} />
              </span>
              <br />{t.h1b}{' '}
              <span style={{ background: 'linear-gradient(90deg, #C084FC, #A855F7 40%, #7C3AED)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', position: 'relative', display: 'inline-block' }}>
                {t.h1grad}
                <span style={{ position: 'absolute', left: 0, right: 0, bottom: -4, height: 3, background: 'linear-gradient(90deg, transparent, var(--accent) 40%, var(--accent-bright) 60%, transparent)', display: 'block' }} />
              </span>
              <br />{t.h1c}
            </h1>

            <p style={{ fontSize: 19, lineHeight: 1.55, color: 'var(--fg-3)', maxWidth: 560, margin: '0 0 32px' }}>
              {t.lead.split(/\{policy\}|\{cid\}/).reduce<React.ReactNode[]>((acc, part, i) => {
                if (i === 0) return [part];
                if (t.lead.indexOf('{policy}') < t.lead.indexOf('{cid}')) {
                  if (i === 1) return [...acc, <strong key="policy" style={{ color: 'var(--fg-0)', fontWeight: 700 }}>{t.leadPolicy}</strong>, part];
                  return [...acc, <span key="cid" style={{ background: 'var(--accent-tint)', color: 'var(--accent-bright)', padding: '0 6px', borderRadius: 4, fontWeight: 600 }}>{t.leadCid}</span>, part];
                } else {
                  if (i === 1) return [...acc, <span key="cid" style={{ background: 'var(--accent-tint)', color: 'var(--accent-bright)', padding: '0 6px', borderRadius: 4, fontWeight: 600 }}>{t.leadCid}</span>, part];
                  return [...acc, <strong key="policy" style={{ color: 'var(--fg-0)', fontWeight: 700 }}>{t.leadPolicy}</strong>, part];
                }
              }, [])}
            </p>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button onClick={openEditor} className="sf-btn sf-btn-primary" style={{ height: 50, padding: '0 26px', fontSize: 14, borderRadius: 10, position: 'relative', overflow: 'hidden' }}>
                <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.25), transparent)', animation: 'sf-drift-x 3s ease-in-out infinite' }} />
                {t.ctaPrimary}
              </button>
              <button onClick={openImport} className="sf-btn sf-btn-ghost" style={{ height: 50, padding: '0 26px', fontSize: 14, borderRadius: 10 }}>{t.ctaSecondary}</button>
            </div>

            <div style={{ marginTop: 42, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, borderTop: '1px dashed var(--border)', paddingTop: 24, maxWidth: 640 }}>
              {t.stats.map(({ k, v, d, up, mono }) => (
                <div key={k}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-5)' }}>{k}</div>
                  <div style={{ fontSize: mono ? 22 : 28, fontWeight: 800, color: 'var(--fg-0)', letterSpacing: '-.02em', marginTop: 4, lineHeight: 1, fontFamily: mono ? 'var(--font-mono)' : undefined }}>{v}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: up ? 'var(--status-ok)' : 'var(--fg-4)', marginTop: 4 }}>{d}</div>
                </div>
              ))}
            </div>
          </div>
          <HeroCanvas />
        </div>
      </div>

      {/* ====== VS RIVALS ====== */}
      <section style={{ maxWidth: 1440, margin: '0 auto', padding: '80px 40px', background: 'linear-gradient(180deg, transparent, rgba(168,85,247,.04), transparent)' }}>
        <div style={{ marginBottom: 18, display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--accent-bright)' }}>
          <span style={{ display: 'inline-block', width: 22, height: 1, background: 'var(--accent)' }} />{t.vsEyebrow}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 48, marginBottom: 48 }}>
          <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(36px, 4vw, 60px)', fontWeight: 900, letterSpacing: '-.035em', margin: 0, lineHeight: 1 }}>
            {t.vsH2a}{' '}<span style={{ background: 'linear-gradient(90deg, var(--accent), var(--accent-bright))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{t.vsH2b}</span>
          </h2>
          <p style={{ fontSize: 14, color: 'var(--fg-3)', maxWidth: 420, lineHeight: 1.55 }}>{t.vsSubtitle}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {t.rivals.map(({ name, them, us, note, stat }) => (
            <HoverCard key={name} style={{ padding: '28px 26px', background: 'var(--bg-elev-1)', border: '1px solid var(--border)', borderRadius: 18, position: 'relative', overflow: 'hidden', cursor: 'default' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--fg-5)' }} />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-4)' }}>{name}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--fg-2)', margin: '14px 0 10px', lineHeight: 1.35, textDecoration: 'line-through', textDecorationColor: 'var(--fg-5)' }}>{them}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-bright)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 16, height: 1, background: 'var(--accent)' }} />ShadowFlow
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--fg-0)', lineHeight: 1.35, letterSpacing: '-.015em' }}>{us}</div>
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px dashed var(--border)', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{note}</span><span style={{ color: 'var(--fg-2)', fontWeight: 700 }}>+{stat}</span>
              </div>
            </HoverCard>
          ))}
        </div>
      </section>

      {/* ====== FEATURES ====== */}
      <section style={{ maxWidth: 1440, margin: '0 auto', padding: '80px 40px' }}>
        <div style={{ marginBottom: 18, display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--accent-bright)' }}>
          <span style={{ display: 'inline-block', width: 22, height: 1, background: 'var(--accent)' }} />{t.featEyebrow}
        </div>
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(36px, 4vw, 60px)', fontWeight: 900, letterSpacing: '-.035em', margin: '0 0 48px', lineHeight: 1 }}>
          {t.featH2a}{' '}<span style={{ background: 'linear-gradient(90deg, var(--accent), var(--accent-bright))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{t.featH2b}</span>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {t.featItems.map(({ icon, title, desc }, idx) => (
            <HoverCard key={title} style={{ padding: '28px 26px 24px', background: 'var(--bg-elev-1)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-tint)', border: '1px solid rgba(168,85,247,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: 'var(--accent-bright)', marginBottom: 18 }}>{icon}</div>
              <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 10px' }}>{title}</h3>
              <p style={{ fontSize: 14, color: 'var(--fg-3)', lineHeight: 1.55, margin: '0 0 20px' }}>{desc}</p>
              <div style={{ height: 110, margin: '0 -26px -24px', padding: '16px 26px', borderTop: '1px dashed var(--border)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {idx === 0 && <PolicyMini />}
                {idx === 1 && <CheckpointMini />}
                {idx === 2 && <ChainMini steps={chainSteps} />}
              </div>
            </HoverCard>
          ))}
        </div>
      </section>

      {/* ====== PROOF WALL ====== */}
      <section style={{ maxWidth: 1440, margin: '0 auto', padding: '0 40px 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', background: 'var(--bg-elev-1)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden' }}>
          {t.proofItems.map(({ k, v, d, grad, mono }, i) => (
            <div key={k} style={{ padding: '28px 26px', borderRight: i < 3 ? '1px solid var(--border)' : undefined, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: 2, height: 24, background: 'var(--accent)', opacity: .5 }} />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-5)' }}>{k}</div>
              <div style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontSize: mono ? 22 : 44, fontWeight: 900, letterSpacing: '-.03em', margin: '6px 0 2px', lineHeight: 1, ...(grad ? { background: 'linear-gradient(90deg, var(--accent-bright), var(--accent))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: 'var(--fg-0)' }) }}>{v}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)', marginTop: 4 }}>{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ====== TEMPLATES ====== */}
      <section style={{ maxWidth: 1440, margin: '0 auto', padding: '0 40px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--accent-bright)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-block', width: 22, height: 1, background: 'var(--accent)' }} />{t.tplEyebrow}
            </div>
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 36, fontWeight: 900, letterSpacing: '-.02em', margin: 0 }}>{t.tplH2}</h2>
          </div>
          <button className="sf-btn sf-btn-ghost">{t.tplViewAll}</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {t.templates.map(({ alias, title, cjk, desc }) => (
            <HoverCard key={alias} onClick={() => pickTemplate(alias)} style={{ padding: '18px 20px', background: 'var(--bg-elev-1)', border: '1px solid var(--border)', borderRadius: 14, cursor: 'pointer' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.12em', color: 'var(--accent-bright)', fontWeight: 700 }}>{alias}</div>
              <h4 style={{ fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 800, letterSpacing: '-.015em', margin: '3px 0 8px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                {title}<span style={{ color: 'var(--fg-5)', fontSize: 13 }}>{cjk}</span>
              </h4>
              <p style={{ fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.5, margin: '0 0 14px' }}>{desc}</p>
              <div style={{ paddingTop: 10, borderTop: '1px dashed var(--border)', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)' }}>
                <span>{t.tplFooterUse}</span>
                <span style={{ color: 'var(--accent-bright)' }}>{t.tplFooterPreview}</span>
              </div>
            </HoverCard>
          ))}
        </div>
      </section>

      {/* ====== IMPORT CID ====== */}
      <section style={{ maxWidth: 1440, margin: '0 auto', padding: '0 40px 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 32, padding: 40, background: 'radial-gradient(ellipse at top left, rgba(168,85,247,.12), transparent 55%), radial-gradient(ellipse at bottom right, rgba(59,130,246,.08), transparent 55%), var(--bg-elev-1)', border: '1px solid var(--border)', borderRadius: 24, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'linear-gradient(180deg, var(--accent), transparent)' }} />
          <div>
            <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1.05 }}>
              {t.importH2a}<br />
              <span style={{ background: 'linear-gradient(90deg, var(--accent-bright), var(--accent))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{t.importH2b}</span>
            </div>
            <p style={{ fontSize: 14, color: 'var(--fg-3)', margin: '14px 0 24px', lineHeight: 1.6, maxWidth: 520 }}>{t.importDesc}</p>
            <div style={{ display: 'flex', gap: 8, maxWidth: 620 }}>
              <input ref={cidRef} className="sf-input" placeholder={t.importPlaceholder} style={{ height: 50, fontFamily: 'var(--font-mono)', fontSize: 12, paddingLeft: 14, background: 'var(--bg)' }} />
              <button className="sf-btn sf-btn-primary" style={{ height: 50, padding: '0 24px', flexShrink: 0 }}>{t.importBtn}</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
            {t.importSteps.map((step, n) => (
              <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', padding: '10px 12px', background: 'var(--skin-panel)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-tint)', color: 'var(--accent-bright)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, border: '1px solid rgba(168,85,247,.3)', flexShrink: 0 }}>{n + 1}</div>
                {step}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====== CTA BAND ====== */}
      <div style={{ position: 'relative', maxWidth: 1440, margin: '40px auto 0', padding: '60px 40px', textAlign: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,.18), transparent 65%)', pointerEvents: 'none', filter: 'blur(30px)' }} />
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(48px, 5vw, 76px)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1, margin: '0 0 14px', position: 'relative', zIndex: 2 }}>
          {t.ctaBandH2a}{' '}<span style={{ background: 'linear-gradient(90deg, var(--accent-bright), var(--accent))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{t.ctaBandH2b}</span>
        </h2>
        <p style={{ fontSize: 17, color: 'var(--fg-3)', margin: '0 auto 30px', maxWidth: 560, position: 'relative', zIndex: 2 }}>{t.ctaBandSub}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', position: 'relative', zIndex: 2 }}>
          <button onClick={openEditor} className="sf-btn sf-btn-primary" style={{ height: 52, padding: '0 30px', fontSize: 14, position: 'relative', overflow: 'hidden' }}>
            <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.25), transparent)', animation: 'sf-drift-x 3s ease-in-out infinite' }} />
            {t.ctaBandPrimary}
          </button>
          <button className="sf-btn sf-btn-ghost" style={{ height: 52, padding: '0 30px', fontSize: 14 }}>{t.ctaBandSecondary}</button>
        </div>
      </div>

      {/* ====== FOOTER ====== */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '32px 40px', maxWidth: 1440, margin: '40px auto 0', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="sf-logo-mark" style={{ width: 20, height: 20, borderRadius: 5, fontSize: 12 }}>S</div>
          <span>{t.footerCopy}</span>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {t.footerLinks.map((link) => (
            <a key={link} href="#" style={{ color: 'var(--fg-4)', textDecoration: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--fg-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--fg-4)')}>
              {link}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
