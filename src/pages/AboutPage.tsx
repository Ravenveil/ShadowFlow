// ⚠️ UI PROTECTION: 只能加，不能删。所有 section 必须保留。
import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import VsCompareAccordion from '../core/components/about/VsCompareAccordion';
import OnChainEvidence from '../core/components/about/OnChainEvidence';
import RoadmapTimeline from '../core/components/about/RoadmapTimeline';
import AcademicCitations from '../core/components/about/AcademicCitations';
import QuadrantChart from '../core/components/landing/QuadrantChart';
import { useI18n } from '../common/i18n';

type AnchorId = 'differentiation' | 'onchain' | 'roadmap';

const NAV_ITEMS: { id: AnchorId; label: string }[] = [
  { id: 'differentiation', label: '差异化对比' },
  { id: 'onchain', label: '链上证据' },
  { id: 'roadmap', label: '路线图' },
];

function SectionEyebrow({ text }: { text: string }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sf-accent mb-3">
      {text}
    </p>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white/95 mb-2">
      {children}
    </h2>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// WalletStatsPanel — additive section beneath OnChainEvidence on /about.
// Visual blueprint: handoff `hf-pages.jsx` HfSettings (Wallet card · KPI grid ·
// activity table). Token-only, i18n inline. No new deps / store / API.
// ────────────────────────────────────────────────────────────────────────────

function WalletStatsPanel() {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);

  const stats: Array<[string, string, string]> = [
    [T('TEAMS PUBLISHED', 'TEAMS PUBLISHED'), '3', T('含 1 个 fork', '1 fork incl.')],
    [T('CIDS HELD', 'CIDS HELD'), '12', T('引用别人 team', 'team refs')],
    [T('GAS BUDGET', 'GAS BUDGET'), '0.42 OG', T('本月剩余', 'remaining mo.')],
    [T('CITATIONS', 'CITATIONS'), '7', T('被人 fork', 'forked by others')],
  ];

  const rows: Array<[string, string, string, string, 'ok' | 'warn']> = [
    ['09:14', 'team.publish', T('论文深读小队', 'PaperLab Squad'), 'cid://Qm…3bx2a', 'ok'],
    [T('昨日', 'yesterday'), 'team.fork', T('from Newsroom', 'from Newsroom'), 'cid://Qm…f0d12', 'ok'],
    [T('昨日', 'yesterday'), 'team.update', T('Rebuttal 起草', 'Rebuttal Drafting'), 'cid://Qm…99cda', 'warn'],
  ];

  return (
    <div style={{ marginTop: 28 }}>
      <p
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: '0.18em',
          color: 'var(--t-accent)',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        ✦ 0G · WALLET
      </p>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--t-fg, var(--t-fg))',
          marginBottom: 14,
        }}
      >
        {T('链上钱包 · on-chain team CID', 'On-chain wallet · team CID')}
      </h3>

      {/* Wallet card */}
      <div
        style={{
          padding: 14,
          borderRadius: 10,
          background: 'var(--t-panel, var(--t-panel))',
          border: '1px solid var(--t-border, var(--t-border))',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'var(--t-accent-tint, var(--t-accent-tint))',
            color: 'var(--t-accent, var(--t-accent))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          ✦
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--t-fg, var(--t-fg))' }}>
              {T('0G Galileo Testnet', '0G Galileo Testnet')}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                padding: '2px 7px',
                borderRadius: 5,
                background: 'color-mix(in oklab, var(--t-ok, #10B981) 16%, transparent)',
                border: '1px solid color-mix(in oklab, var(--t-ok, #10B981) 35%, transparent)',
                color: 'var(--t-ok, #10B981)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              ● connected
            </span>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--t-fg-3, var(--t-fg-3))',
              marginTop: 4,
            }}
          >
            0x3f7a · 4d12 · ab98 · bc91
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        {stats.map(([k, v, s]) => (
          <div
            key={k}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: 'var(--t-panel, var(--t-panel))',
              border: '1px solid var(--t-border, var(--t-border))',
            }}
          >
            <div
              className="font-mono"
              style={{
                fontSize: 9,
                letterSpacing: '0.08em',
                color: 'var(--t-fg-4, var(--t-fg-4))',
                marginBottom: 6,
                textTransform: 'uppercase',
              }}
            >
              {k}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: 'var(--t-fg, var(--t-fg))',
              }}
            >
              {v}
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--t-fg-4, var(--t-fg-4))',
                marginTop: 3,
              }}
            >
              {s}
            </div>
          </div>
        ))}
      </div>

      {/* Activity table */}
      <p
        className="font-mono"
        style={{
          fontSize: 9,
          letterSpacing: '0.12em',
          color: 'var(--t-fg-4, var(--t-fg-4))',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {T('最近上链 · ACTIVITY', 'recent on-chain · ACTIVITY')}
      </p>
      <div
        style={{
          padding: '4px 0',
          borderRadius: 10,
          background: 'var(--t-panel, var(--t-panel))',
          border: '1px solid var(--t-border, var(--t-border))',
        }}
      >
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '70px 130px 1fr 180px 80px',
              padding: '10px 16px',
              alignItems: 'center',
              gap: 14,
              borderTop: i > 0 ? '1px dashed var(--t-border, var(--t-border))' : 'none',
            }}
          >
            <span style={{ fontSize: 10.5, color: 'var(--t-fg-4, var(--t-fg-4))' }}>{r[0]}</span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--t-accent, var(--t-accent))',
              }}
            >
              {r[1]}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--t-fg, var(--t-fg))' }}>{r[2]}</span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--t-fg-4, var(--t-fg-4))',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {r[3]}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                padding: '2px 7px',
                borderRadius: 5,
                textAlign: 'center',
                background: `color-mix(in oklab, var(--t-${r[4]}) 16%, transparent)`,
                border: `1px solid color-mix(in oklab, var(--t-${r[4]}) 35%, transparent)`,
                color: `var(--t-${r[4]})`,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              ● {r[4]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AboutPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<AnchorId>('differentiation');
  const sectionRefs = useRef<Record<AnchorId, HTMLElement | null>>({
    differentiation: null,
    onchain: null,
    roadmap: null,
  });

  // Observe which section is in view for nav highlight
  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    NAV_ITEMS.forEach(({ id }) => {
      const el = sectionRefs.current[id];
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(id);
        },
        { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const scrollTo = (id: AnchorId) => {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <>
      <Helmet>
        <title>About ShadowFlow — 差异化对比 · 链上证据 · 路线图</title>
        <meta
          name="description"
          content="ShadowFlow 与 9 大同类工具的差异化对比、0G 链上轨迹证据、三阶段产品路线图与学术背书。"
        />
      </Helmet>

      <div
        className="min-h-screen"
        style={{ background: 'var(--t-bg)', color: 'var(--t-fg)', scrollBehavior: 'smooth' }}
      >
        {/* ──────────────────────────────── TOP NAV ──────────────────────────────── */}
        <header
          className="sticky top-0 z-40 border-b"
          style={{ borderColor: 'var(--t-border)', background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)' }}
        >
          <div className="mx-auto max-w-4xl px-6 flex items-center justify-between h-12 gap-4">
            <button
              onClick={() => navigate('/')}
              className="font-mono text-[11px] text-sf-fg4 hover:text-white/90 transition-colors shrink-0"
              aria-label="返回首页"
            >
              ← ShadowFlow
            </button>

            <nav aria-label="页面内导航" className="flex items-center gap-1">
              {NAV_ITEMS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className="px-3 py-1 rounded text-xs font-medium transition-colors duration-150"
                  style={{
                    background: activeSection === id ? 'var(--t-accent-tint)' : 'transparent',
                    color: activeSection === id ? 'var(--t-accent-bright)' : 'var(--t-fg-4)',
                    border: activeSection === id ? '1px solid var(--t-accent-dim)' : '1px solid transparent',
                  }}
                  aria-current={activeSection === id ? 'location' : undefined}
                >
                  {label}
                </button>
              ))}
            </nav>

            {/* 2026-05-20 — /editor 已下架；CTA 改为跳 /start（Skill Pack 起手）。 */}
            <button
              onClick={() => navigate('/start')}
              className="shrink-0 px-3 py-1 rounded-pill text-xs font-medium transition-colors duration-150"
              style={{ background: 'var(--t-accent)', color: 'var(--t-accent-ink)' }}
            >
              ▶ 开始
            </button>
          </div>
        </header>

        {/* ──────────────────────────────── PAGE HERO ──────────────────────────────── */}
        <div className="mx-auto max-w-4xl px-6 pt-14 pb-10 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sf-accent mb-4">
            ◆ ShadowFlow · 技术背书
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white/95 mb-3">
            不是又一个 LLM Wrapper。
          </h1>
          <p className="text-sm text-sf-fg3 max-w-xl mx-auto leading-relaxed">
            Runtime Contract + 0G 全栈原生 + INFT 路线图三栈闭环——这是我们与同类产品的根本差异。
          </p>
        </div>

        {/* ──────────────────────────────── SECTION 1: DIFFERENTIATION ──────────────────────────────── */}
        <section
          id="differentiation"
          ref={(el) => { sectionRefs.current.differentiation = el; }}
          className="mx-auto max-w-4xl px-6 py-12 scroll-mt-16"
          aria-labelledby="diff-heading"
        >
          <SectionEyebrow text="vs. the alternatives" />
          <SectionHeading>
            <span id="diff-heading">9 条差异化对比</span>
          </SectionHeading>
          <p className="text-sm text-sf-fg3 mb-8 leading-relaxed max-w-2xl">
            ShadowFlow 不与这些工具竞争，而是在它们的上方新增了一层：多 Agent 协作制度设计 + 链上传承。
          </p>

          <VsCompareAccordion />

          {/* QuadrantChart — 蓝海象限定位 */}
          <div className="mt-10">
            <p className="font-mono text-[10px] uppercase tracking-widest text-sf-fg4 mb-4 text-center">
              蓝海象限定位图
            </p>
            <div className="rounded-sf border overflow-hidden" style={{ borderColor: 'var(--t-border)', background: 'var(--t-panel)' }}>
              <QuadrantChart
                className="w-full"
                style={{ maxHeight: 360 }}
              />
            </div>
            <p className="text-xs text-sf-fg4 text-center mt-2">
              横轴：单 Agent → 多 Agent 协作 · 纵轴：有状态本地 → 链上可传承
            </p>
          </div>
        </section>

        {/* ──────────────────────────────── DIVIDER ──────────────────────────────── */}
        <div className="mx-auto max-w-4xl px-6">
          <div className="border-t" style={{ borderColor: 'var(--t-border)' }} />
        </div>

        {/* ──────────────────────────────── SECTION 2: ON-CHAIN EVIDENCE ──────────────────────────────── */}
        <section
          id="onchain"
          ref={(el) => { sectionRefs.current.onchain = el; }}
          className="mx-auto max-w-4xl px-6 py-12 scroll-mt-16"
          aria-labelledby="onchain-heading"
        >
          <SectionEyebrow text="0G on-chain evidence" />
          <SectionHeading>
            <span id="onchain-heading">链上轨迹证据</span>
          </SectionHeading>
          <p className="text-sm text-sf-fg3 mb-8 leading-relaxed max-w-2xl">
            真实运行轨迹已永久存储于 0G Storage 网络。点击 CID 可在 0G Explorer 独立验证数据完整性——不是 mock，是真实可查的链上数据。
          </p>

          <OnChainEvidence />

          {/* WalletStatsPanel — handoff `hf-pages.jsx` HfSettings lines 358-400.
              4 KPI cards + recent on-chain activity table. Pure UI, additive. */}
          <WalletStatsPanel />
        </section>

        {/* ──────────────────────────────── DIVIDER ──────────────────────────────── */}
        <div className="mx-auto max-w-4xl px-6">
          <div className="border-t" style={{ borderColor: 'var(--t-border)' }} />
        </div>

        {/* ──────────────────────────────── SECTION 3: ROADMAP ──────────────────────────────── */}
        <section
          id="roadmap"
          ref={(el) => { sectionRefs.current.roadmap = el; }}
          className="mx-auto max-w-4xl px-6 py-12 scroll-mt-16"
          aria-labelledby="roadmap-heading"
        >
          <SectionEyebrow text="product roadmap" />
          <SectionHeading>
            <span id="roadmap-heading">三阶段路线图</span>
          </SectionHeading>
          <p className="text-sm text-sf-fg3 mb-8 leading-relaxed max-w-2xl">
            Phase 1 已交付（当前版本）。Phase 2 目标桌面化 + 实时化。Phase 3 实现 INFT 链上知识资产市场。
          </p>

          <RoadmapTimeline />

          {/* Academic Citations */}
          <div className="mt-12">
            <p className="font-mono text-[10px] uppercase tracking-widest text-sf-fg4 mb-4">
              学术背书 · 5 条论文
            </p>
            <p className="text-sm text-sf-fg3 mb-6 leading-relaxed max-w-2xl">
              ShadowFlow 的核心命题处于 5 条研究线的交集。我们不是从零发明——我们在已有学术基础上抬升了抽象层级。
            </p>
            <AcademicCitations />
          </div>
        </section>

        {/* ──────────────────────────────── FOOTER CTA ──────────────────────────────── */}
        <div
          className="border-t"
          style={{ borderColor: 'var(--t-border)', background: 'var(--t-panel)' }}
        >
          <div className="mx-auto max-w-4xl px-6 py-12 text-center">
            <p className="font-mono text-[10px] uppercase tracking-widest text-sf-fg4 mb-4">
              看完了？来亲手试试。
            </p>
            <h2 className="text-2xl font-bold text-white/90 mb-6">
              60 秒内跑一个真实 Agent 团队。
            </h2>
            {/* 2026-05-20 — /editor /templates 均已下架；两个 CTA 都跳 /start。 */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => navigate('/start')}
                className="px-6 py-2.5 rounded-pill text-sm font-semibold transition-colors duration-150"
                style={{ background: 'var(--t-accent)', color: 'var(--t-accent-ink)' }}
              >
                ▶ 开始
              </button>
              <button
                onClick={() => navigate('/start')}
                className="px-6 py-2.5 rounded-pill text-sm font-medium border transition-colors duration-150"
                style={{ borderColor: 'var(--t-border)', color: 'var(--t-fg-2)' }}
              >
                浏览 Skill Pack
              </button>
            </div>
          </div>
        </div>

        {/* ──────────────────────────────── PAGE FOOTER ──────────────────────────────── */}
        <footer
          className="border-t px-6 py-4 text-center"
          style={{ borderColor: 'var(--t-border)' }}
        >
          <p className="font-mono text-[10px] text-sf-fg5">
            ShadowFlow · Ravenveil · MIT · 0G Hackathon 2026
          </p>
        </footer>
      </div>
    </>
  );
}
