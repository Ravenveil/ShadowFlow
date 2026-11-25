/**
 * Landing — 落地页（版式结构对齐 shadow-merge 营销页，文案为论文协作语境）。
 *
 * 只做版面：取内容、摆位置、挂交互。
 * 内容：`src/content/landing.ts`
 * 颜色：全走 CSS 变量 / data-tone，组件里没有色值
 * 版式：`src/styles/landing.css`
 */
import { FormEvent, useEffect, useState } from 'react';
import { AgentAvatar, AVATAR_SIZE } from '@/shared/ui/avatar';
import {
  authGuest,
  authLogin,
  authRegister,
  authSubscribe,
  useAuthState,
} from '@/shared/data/auth';
import {
  AUTH_MODAL,
  CASE_SECTION,
  CONTACT_MODAL,
  FAQ_SECTION,
  FINAL_SECTION,
  FLOW_SECTION,
  FOOT,
  HERO,
  KNOW_SECTION,
  LANDING_BRAND,
  LANDING_CTA,
  LANDING_NAV,
  PAIN_SECTION,
  PRICING_SECTION,
  SLOGAN,
  TEAM_SECTION,
} from '@/shared/content/landing';
import {
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconDatabase,
  IconFileCheck,
  IconLayers,
  IconMenu,
  IconMessage,
  IconNetwork,
  IconPointer,
  IconShield,
  IconSparkle,
  IconTarget,
  IconBrainCircuit,
} from '@/shared/ui/icons';
import { DemoShowcase } from '@/landing/DemoShowcase';
import { ProductVisual } from '@/landing/ProductVisual';
import { SectionHead } from '@/landing/SectionHead';

type ModalKind = 'contact' | 'plan' | null;

/** 标题行数组 → JSX（行间换行）。 */
function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <span key={line}>
          {i > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </>
  );
}

/** content 里的 icon key → 图标组件（痛点 / 流程 / 知识资产共用）。 */
const ICON_MAP: Record<string, (p: { size?: number }) => JSX.Element> = {
  network: IconNetwork,
  layers: IconLayers,
  shield: IconShield,
  database: IconDatabase,
  message: IconMessage,
  brain: IconBrainCircuit,
  fileCheck: IconFileCheck,
  target: IconTarget,
};

export function Landing({ onEnter }: { onEnter: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(() => {
    const i = FLOW_SECTION.steps.findIndex((s) => s.id === FLOW_SECTION.activeId);
    return i >= 0 ? i : 0;
  });
  const [modal, setModal] = useState<ModalKind>(null);
  const [selectedPlan, setSelectedPlan] = useState(PRICING_SECTION.plans[1]?.name ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [prefillEmail, setPrefillEmail] = useState('');
  const [newsDone, setNewsDone] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authDone, setAuthDone] = useState(false);
  const auth = useAuthState();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = modal || authOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [modal, authOpen]);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  }

  function openPlan(plan: string) {
    setSelectedPlan(plan);
    setSubmitted(false);
    setModal('plan');
  }

  function openContact() {
    setSubmitted(false);
    setModal('contact');
  }

  function openAuth(mode: 'login' | 'register', email = '') {
    setAuthMode(mode);
    setPrefillEmail(email);
    setAuthError(null);
    setAuthBusy(false);
    setAuthDone(false);
    setAuthOpen(true);
  }

  /** 入口合并：已登录直接进工作台；未登录先弹登录，成功后进工作台。 */
  function enterWorkbench() {
    if (auth.user) {
      onEnter();
    } else {
      openAuth('login');
    }
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const name = String(data.get('name') ?? '').trim();
    const stage = String(data.get('stage') ?? '').trim();
    const need = String(data.get('need') ?? '').trim();
    // 留资真入库（失败静默——营销站可能无后端），随后进入成功态
    void authSubscribe({
      email,
      name: name || undefined,
      source: modal === 'contact' ? 'landing-demo' : `landing-plan:${selectedPlan}`,
      note:
        [
          stage && `${CONTACT_MODAL.stageTagPrefix}${stage}`,
          need && `${CONTACT_MODAL.needTagPrefix}${need}`,
        ]
          .filter(Boolean)
          .join(' | ') || undefined,
    });
    if (email) setPrefillEmail(email);
    setSubmitted(true);
    form.reset();
  }

  function submitNews(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    if (!email) return;
    void authSubscribe({ email, source: 'landing-newsletter' });
    setPrefillEmail(email);
    setNewsDone(true);
    form.reset();
  }

  /** 登录 / 注册真实提交：成功进工作台，失败展示后端错误。 */
  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authBusy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    const name = String(data.get('name') ?? '').trim();
    setAuthError(null);
    setAuthBusy(true);
    try {
      if (authMode === 'register') await authRegister(email, password, name || undefined);
      else await authLogin(email, password);
      setAuthDone(true);
      window.setTimeout(() => {
        setAuthOpen(false);
        onEnter();
      }, 650);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : AUTH_MODAL.errorFallback);
    } finally {
      setAuthBusy(false);
    }
  }

  /** 游客一键体验：签发独立 guest 会话后进工作台。 */
  async function enterAsGuest() {
    if (authBusy) return;
    setAuthError(null);
    setAuthBusy(true);
    try {
      await authGuest();
      setAuthDone(true);
      window.setTimeout(() => {
        setAuthOpen(false);
        onEnter();
      }, 650);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : AUTH_MODAL.guestErrorFallback);
    } finally {
      setAuthBusy(false);
    }
  }

  const step = FLOW_SECTION.steps[activeStep];

  return (
    <div className="lp">
      {/* ---------- 导航 ---------- */}
      <header className="lp-nav" data-scrolled={scrolled ? 'true' : undefined}>
        <div className="lp-nav-inner">
          <a className="lp-logo" href="#/">
            <span className="lp-logo-mark">
              <i />
              <i />
              <i />
            </span>
            <span className="lp-logo-text">{LANDING_BRAND.name}</span>
          </a>

          <nav className="lp-nav-links">
            {LANDING_NAV.map((n) => (
              <button key={n.href} onClick={() => scrollTo(n.href.slice(1))}>
                {n.label}
              </button>
            ))}
          </nav>

          <div className="lp-nav-actions">
            <button className="lp-nav-contact" onClick={openContact}>
              {LANDING_CTA.contact}
            </button>
            <button className="lp-cta-sm" onClick={enterWorkbench}>
              {LANDING_CTA.enter}
              <IconArrowRight size={14} />
            </button>
          </div>

          <button className="lp-menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="menu">
            {menuOpen ? <IconClose size={18} /> : <IconMenu size={18} />}
          </button>
        </div>

        {menuOpen ? (
          <div className="lp-mobile-panel">
            {LANDING_NAV.map((n) => (
              <button key={n.href} onClick={() => scrollTo(n.href.slice(1))}>
                {n.label}
              </button>
            ))}
            <button className="lp-nav-contact" onClick={openContact}>
              {LANDING_CTA.contact}
            </button>
            <button className="lp-cta-sm" onClick={enterWorkbench}>
              {LANDING_CTA.enter}
            </button>
          </div>
        ) : null}
      </header>

      {/* ---------- Hero ---------- */}
      <section className="lp-hero" id="home">
        <div className="lp-orbit lp-orbit--one" />
        <div className="lp-orbit lp-orbit--two" />
        <div className="lp-wrap lp-hero-inner">
          <div className="lp-hero-copy">
            <span className="lp-pill">
              <i />
              {HERO.pill}
            </span>
            <h1 className="lp-h1">
              <Lines lines={HERO.title} />
              <br />
              <em>{HERO.titleAccent}</em>
            </h1>
            <p className="lp-lede">{HERO.lede}</p>

            <div className="lp-hero-cta">
              <button className="lp-cta" onClick={enterWorkbench}>
                {LANDING_CTA.enter}
                <IconArrowRight size={16} />
              </button>
              <button className="lp-cta-outline" onClick={openContact}>
                {LANDING_CTA.contact}
              </button>
              <button className="lp-cta-rect" onClick={() => scrollTo('workflow')}>
                {LANDING_CTA.watch}
                <IconArrowRight size={15} />
              </button>
            </div>

            <ul className="lp-ticks">
              {HERO.ticks.map((t) => (
                <li key={t}>
                  <IconCheck size={13} />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="lp-hero-visual">
            <ProductVisual onEnter={onEnter} />
          </div>
        </div>
      </section>

      {/* ---------- 痛点 ---------- */}
      <section className="lp-section" id="pain">
        <div className="lp-wrap">
          <SectionHead kicker={PAIN_SECTION.kicker} title={PAIN_SECTION.title} side={PAIN_SECTION.side} />
          <div className="lp-problems">
            {PAIN_SECTION.cards.map((p) => {
              const Icon = ICON_MAP[p.icon] ?? IconNetwork;
              return (
                <article key={p.n}>
                  <span className="lp-problem-n">{p.n}</span>
                  <Icon size={22} />
                  <div>
                    <h3>{p.title}</h3>
                    <p>{p.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- 交付链路（深色 · 四步交互） ---------- */}
      <section className="lp-deep lp-workflow" id="workflow">
        <div className="lp-wrap">
          <SectionHead kicker={FLOW_SECTION.kicker} title={FLOW_SECTION.title} side={FLOW_SECTION.side} light />

          <div className="lp-steps">
            <ol className="lp-step-list">
              {FLOW_SECTION.steps.map((s, index) => (
                <li key={s.id}>
                  <button
                    className={index === activeStep ? 'is-active' : ''}
                    onClick={() => setActiveStep(index)}
                  >
                    <span>{s.id}</span>
                    <div>
                      <small>{s.label}</small>
                      <strong>{s.title}</strong>
                    </div>
                    <IconArrowRight size={14} />
                  </button>
                </li>
              ))}
            </ol>

            <div className="lp-step-detail">
              <div className="lp-step-top">
                <span>
                  WORKFLOW / {step.id}
                </span>
                <span className="lp-step-live">
                  <i />
                  {FLOW_SECTION.live}
                </span>
              </div>
              <div className="lp-step-ico">
                {(() => {
                  const Icon = ICON_MAP[step.icon] ?? IconSparkle;
                  return <Icon size={34} />;
                })()}
              </div>
              <p className="lp-step-label">{step.label}</p>
              <h3>{step.title}</h3>
              <p className="lp-step-desc">{step.description}</p>
              <div className="lp-step-result">
                <IconCheck size={17} />
                <div>
                  <small>{FLOW_SECTION.outLabel}</small>
                  <strong>{step.result}</strong>
                </div>
              </div>
              <div className="lp-flow-line">
                {FLOW_SECTION.steps.map((s, index) => (
                  <i key={s.id} data-done={index <= activeStep ? 'true' : undefined} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Agent 团队 ---------- */}
      <section className="lp-section lp-agents" id="agents">
        <div className="lp-wrap">
          <SectionHead kicker={TEAM_SECTION.kicker} title={TEAM_SECTION.title} side={TEAM_SECTION.side} />
          <div className="lp-agent-grid">
            {TEAM_SECTION.cards.map((c) => (
              <article className="lp-agent-card" key={c.code} data-tone={c.tone}>
                <div className="lp-agent-code">{c.code}</div>
                <div className="lp-agent-avatar">
                  <AgentAvatar label={c.face} size={AVATAR_SIZE.xl} status={false} />
                </div>
                <p>{c.en}</p>
                <h3>{c.cn}</h3>
                <div className="lp-agent-task">{c.desc}</div>
                <div className="lp-agent-status">
                  <span />
                  {TEAM_SECTION.ready}
                </div>
              </article>
            ))}
          </div>
          <div className="lp-human">
            <div className="lp-human-badge">
              <IconPointer size={22} />
            </div>
            <div>
              <p>{TEAM_SECTION.human.kicker}</p>
              <h3>{TEAM_SECTION.human.title}</h3>
            </div>
            <p className="lp-human-note">{TEAM_SECTION.human.note}</p>
          </div>
        </div>
      </section>

      {/* ---------- 知识沉淀 ---------- */}
      <section className="lp-section lp-section--alt" id="outcomes">
        <div className="lp-wrap lp-know-grid">
          <div>
            <div className="lp-kicker">{KNOW_SECTION.kicker}</div>
            <h2 className="lp-h2">
              <Lines lines={KNOW_SECTION.title} />
            </h2>
            <p className="lp-side lp-side--tight">{KNOW_SECTION.side}</p>
            <div className="lp-metrics">
              {KNOW_SECTION.metrics.map((m) => (
                <div key={m.v}>
                  <strong>{m.k}</strong>
                  <span>{m.v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-know-vis">
            <svg viewBox="0 0 600 480" aria-hidden="true">
              <path d="M300 240 L130 110 M300 240 L480 100 M300 240 L115 375 M300 240 L485 375" />
            </svg>
            <div className="lp-know-core">
              <IconDatabase size={26} />
              <b>{KNOW_SECTION.core.title}</b>
              <span>{KNOW_SECTION.core.note}</span>
            </div>
            {KNOW_SECTION.assets.map((a) => {
              const Icon = ICON_MAP[a.icon] ?? IconLayers;
              return (
                <div key={a.name} className={`lp-know-node lp-know-node--${a.pos}`}>
                  <Icon size={17} />
                  <span>
                    <b>{a.name}</b>
                    <small>{a.size}</small>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- 口号带 ---------- */}
      <section className="lp-slogan">
        <div className="lp-wrap lp-slogan-inner">
          <p>{SLOGAN.kicker}</p>
          <blockquote>{SLOGAN.quote}</blockquote>
        </div>
      </section>

      {/* ---------- 案例 + Demo ---------- */}
      <section className="lp-section lp-cases" id="cases">
        <div className="lp-wrap">
          <SectionHead kicker={CASE_SECTION.kicker} title={CASE_SECTION.title} side={CASE_SECTION.side} />
          <div className="lp-figures">
            {CASE_SECTION.figures.map((f) => {
              const Icon = ICON_MAP[f.icon] ?? IconMessage;
              return (
                <figure key={f.caption}>
                  <div className="lp-figure-vis" data-tone={f.tone}>
                    <Icon size={38} />
                  </div>
                  <figcaption>{f.caption}</figcaption>
                </figure>
              );
            })}
          </div>
          <DemoShowcase />
        </div>
      </section>

      {/* ---------- 常见问题 ---------- */}
      <section className="lp-section lp-faq" id="faq">
        <div className="lp-wrap lp-faq-layout">
          <div>
            <h2 className="lp-h2">{FAQ_SECTION.title}</h2>
            <p>
              <button onClick={openContact}>{FAQ_SECTION.contactLabel}</button>
            </p>
          </div>
          <div className="lp-faq-list">
            {FAQ_SECTION.items.map((f, index) => (
              <article key={f.q} data-open={openFaq === index ? 'true' : undefined}>
                <button onClick={() => setOpenFaq(openFaq === index ? -1 : index)}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{f.q}</strong>
                  <IconChevronDown size={16} />
                </button>
                <div>
                  <p>{f.a}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 定价 ---------- */}
      <section className="lp-section lp-pricing" id="pricing">
        <div className="lp-wrap">
          <div className="lp-pricing-head">
            <h2 className="lp-h2">{PRICING_SECTION.title}</h2>
            <p>{PRICING_SECTION.note}</p>
          </div>
          <div className="lp-plans">
            {PRICING_SECTION.plans.map((plan) => (
              <article key={plan.name} data-featured={plan.featured ? 'true' : undefined}>
                <h3>{plan.name}</h3>
                <div className="lp-plan-price">{plan.price}</div>
                <ul>
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <button onClick={() => openPlan(plan.name)}>{plan.cta}</button>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 收尾 CTA ---------- */}
      <section className="lp-final">
        <div className="lp-wrap lp-final-inner">
          <h2 className="lp-h2">
            <Lines lines={FINAL_SECTION.title} />
          </h2>
          <p>{FINAL_SECTION.note}</p>
          <div className="lp-hero-cta lp-hero-cta--center">
            <button className="lp-cta" onClick={enterWorkbench}>
              {LANDING_CTA.enter}
              <IconArrowRight size={16} />
            </button>
            <button className="lp-cta-outline" onClick={openContact}>
              {LANDING_CTA.contact}
            </button>
          </div>
        </div>
      </section>

      {/* ---------- 页脚 ---------- */}
      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-main">
          <div className="lp-foot-brand">
            <div className="lp-logo">
              <span className="lp-logo-mark">
                <i />
                <i />
                <i />
              </span>
              <span className="lp-logo-text">{LANDING_BRAND.name}</span>
            </div>
            <p>{FOOT.desc}</p>
          </div>
          <div className="lp-foot-col">
            <strong>{FOOT.productTitle}</strong>
            {FOOT.productLinks.map((l) => (
              <button key={l.href} onClick={() => scrollTo(l.href.slice(1))}>
                {l.label}
              </button>
            ))}
          </div>
          <div className="lp-foot-col">
            <strong>{FOOT.resourceTitle}</strong>
            {FOOT.resourceLinks.map((l) => (
              <button key={l.href} onClick={() => scrollTo(l.href.slice(1))}>
                {l.label}
              </button>
            ))}
          </div>
          <div className="lp-foot-news">
            <strong>{FOOT.newsTitle}</strong>
            <p>{newsDone ? FOOT.newsDone : FOOT.newsHint}</p>
            {newsDone ? (
              <button className="lp-foot-news-done" onClick={() => openAuth('register', prefillEmail)}>
                {FOOT.newsCta}
              </button>
            ) : (
              <form onSubmit={submitNews}>
                <input
                  name="email"
                  type="email"
                  required
                  aria-label={FOOT.newsPlaceholder}
                  placeholder={FOOT.newsPlaceholder}
                />
                <button type="submit">{FOOT.newsSubmit}</button>
              </form>
            )}
          </div>
        </div>
        <div className="lp-wrap lp-foot-bottom">
          <span>{LANDING_BRAND.copyright}</span>
          <div>
            {FOOT.legal.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </footer>

      {/* ---------- 联系 / 申请弹窗 ---------- */}
      {modal ? (
        <div className="lp-modal-mask" role="dialog" aria-modal="true" onMouseDown={() => setModal(null)}>
          <div className="lp-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="lp-modal-close" onClick={() => setModal(null)} aria-label={CONTACT_MODAL.close}>
              <IconClose size={16} />
            </button>
            {submitted ? (
              <div className="lp-success">
                <span>
                  <IconCheck size={26} />
                </span>
                <p>{CONTACT_MODAL.successKicker}</p>
                <h2>{CONTACT_MODAL.successTitle}</h2>
                <p>{CONTACT_MODAL.successBody}</p>
                <button
                  className="lp-cta"
                  onClick={() => {
                    setModal(null);
                    enterWorkbench();
                  }}
                >
                  {CONTACT_MODAL.successCta}
                </button>
                <button className="lp-success-skip" onClick={() => setModal(null)}>
                  {CONTACT_MODAL.successSkip}
                </button>
              </div>
            ) : (
              <>
                <h2>{modal === 'plan' ? CONTACT_MODAL.planTitle(selectedPlan) : CONTACT_MODAL.demoTitle}</h2>
                <p>{CONTACT_MODAL.subtitle}</p>
                <form onSubmit={submitForm}>
                  <label>
                    {CONTACT_MODAL.nameLabel}
                    <input name="name" required placeholder={CONTACT_MODAL.namePlaceholder} />
                  </label>
                  <label>
                    {CONTACT_MODAL.emailLabel}
                    <input name="email" required type="email" placeholder={CONTACT_MODAL.emailPlaceholder} />
                  </label>
                  <label>
                    {CONTACT_MODAL.stageLabel}
                    <select name="stage" defaultValue="">
                      <option value="" disabled>
                        {CONTACT_MODAL.stagePlaceholder}
                      </option>
                      {CONTACT_MODAL.stages.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {CONTACT_MODAL.needLabel}
                    <textarea name="need" rows={3} placeholder={CONTACT_MODAL.needPlaceholder} />
                  </label>
                  <button className="lp-cta" type="submit">
                    {CONTACT_MODAL.submit}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* ---------- 登录 / 注册弹窗 ---------- */}
      {authOpen ? (
        <div className="lp-modal-mask" role="dialog" aria-modal="true" onMouseDown={() => setAuthOpen(false)}>
          <div className="lp-modal lp-modal--auth" onMouseDown={(e) => e.stopPropagation()}>
            <button className="lp-modal-close" onClick={() => setAuthOpen(false)} aria-label={AUTH_MODAL.close}>
              <IconClose size={16} />
            </button>
            {authDone ? (
              <div className="lp-success">
                <span><IconCheck size={26} /></span>
                <p>{authMode === 'register' ? AUTH_MODAL.doneKicker : AUTH_MODAL.loginKicker}</p>
                <h2>{authMode === 'register' ? AUTH_MODAL.doneTitle : AUTH_MODAL.doneLoginTitle}</h2>
                <p>{AUTH_MODAL.doneBody}</p>
                <button className="lp-cta" onClick={() => { setAuthOpen(false); onEnter(); }}>
                  {AUTH_MODAL.doneCta}
                </button>
              </div>
            ) : (
              <>
            <p className="lp-kicker">{authMode === 'register' ? AUTH_MODAL.registerKicker : AUTH_MODAL.loginKicker}</p>
            <h2>{authMode === 'register' ? AUTH_MODAL.registerTitle : AUTH_MODAL.loginTitle}</h2>
            <p>{authMode === 'register' ? AUTH_MODAL.registerBody : AUTH_MODAL.loginBody}</p>

            <div className="lp-auth-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={authMode === 'login'}
                data-on={authMode === 'login' ? 'true' : undefined}
                onClick={() => setAuthMode('login')}
              >
                {AUTH_MODAL.tabLogin}
              </button>
              <button
                role="tab"
                aria-selected={authMode === 'register'}
                data-on={authMode === 'register' ? 'true' : undefined}
                onClick={() => setAuthMode('register')}
              >
                {AUTH_MODAL.tabRegister}
              </button>
            </div>

            {authError ? <p className="lp-auth-error" role="alert">{authError}</p> : null}
            <form onSubmit={submitAuth}>
              {authMode === 'register' ? (
                <label>
                  {AUTH_MODAL.nameLabel}
                  <input name="name" placeholder={AUTH_MODAL.namePlaceholder} />
                </label>
              ) : null}
              <label>
                {AUTH_MODAL.emailLabel}
                <input name="email" required type="email" defaultValue={prefillEmail} placeholder={AUTH_MODAL.emailPlaceholder} autoComplete="email" />
              </label>
              <label>
                {AUTH_MODAL.passwordLabel}
                <input
                  name="password"
                  required
                  type="password"
                  minLength={8}
                  placeholder={authMode === 'register' ? AUTH_MODAL.passwordRegisterPlaceholder : AUTH_MODAL.passwordLoginPlaceholder}
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                />
              </label>
              <button className="lp-cta" type="submit" disabled={authBusy}>
                {authBusy ? AUTH_MODAL.busy : authMode === 'register' ? AUTH_MODAL.submitRegister : AUTH_MODAL.submitLogin}
                {!authBusy ? <IconArrowRight size={15} /> : null}
              </button>
            </form>

            <div className="lp-auth-foot">
              <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
                {authMode === 'login' ? AUTH_MODAL.switchToRegister : AUTH_MODAL.switchToLogin}
              </button>
              <button onClick={enterAsGuest} disabled={authBusy}>{AUTH_MODAL.guest}</button>
              <button onClick={() => setAuthOpen(false)}>{AUTH_MODAL.skip}</button>
            </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Landing;
