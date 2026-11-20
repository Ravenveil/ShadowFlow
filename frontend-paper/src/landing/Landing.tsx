/**
 * Landing — 落地页。只做版面：取内容、摆位置、挂交互。
 *
 * 内容：`src/content/landing.ts`
 * 颜色：全走 CSS 变量 / data-tone，组件里没有色值
 * 版式：`src/styles/landing.css`
 */
import { useEffect, useState } from 'react';
import { AgentAvatar, AVATAR_SIZE } from '../avatar';
import {
  FINAL_SECTION,
  FLOW_SECTION,
  FOOT_LINKS,
  HERO,
  KNOW_SECTION,
  LANDING_BRAND,
  LANDING_CTA,
  LANDING_NAV,
  PAIN_SECTION,
  TEAM_SECTION,
} from '../content/landing';
import { IconArrowRight, IconCheck, IconPlay, IconSparkle } from '../shell/icons';
import { ProductVisual } from './ProductVisual';
import { SectionHead } from './SectionHead';

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

export function Landing({ onEnter }: { onEnter: () => void }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="lp">
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
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
            <button onClick={onEnter}>{LANDING_CTA.enter}</button>
          </nav>

          <div className="lp-nav-actions">
            <button className="lp-cta-sm" onClick={onEnter}>
              {LANDING_CTA.demo}
              <IconArrowRight size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="lp-hero">
        <div className="lp-hero-inner">
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
              <button className="lp-cta" onClick={onEnter}>
                {LANDING_CTA.demo}
                <IconArrowRight size={16} />
              </button>
              <a className="lp-cta-ghost" href={LANDING_NAV[0].href}>
                <IconPlay size={17} />
                {LANDING_CTA.watch}
              </a>
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
            <ProductVisual />
          </div>
        </div>
      </section>

      {/* ---------- 痛点 ---------- */}
      <section className="lp-section" id="value">
        <div className="lp-wrap">
          <SectionHead kicker={PAIN_SECTION.kicker} title={PAIN_SECTION.title} side={PAIN_SECTION.side} />

          <div className="lp-pains">
            {PAIN_SECTION.cards.map((p) => (
              <article key={p.n} className="lp-pain">
                <span className="lp-pain-n">{p.n}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 深色：交付链路 ---------- */}
      <section className="lp-deep" id="how">
        <div className="lp-wrap">
          <SectionHead
            kicker={FLOW_SECTION.kicker}
            title={FLOW_SECTION.title}
            side={FLOW_SECTION.side}
            light
          />

          <div className="lp-phases">
            <ol className="lp-phase-list">
              {FLOW_SECTION.phases.map((p) => (
                <li key={p.key} className="lp-phase" data-active={p.key === FLOW_SECTION.activeKey ? 'true' : undefined}>
                  <span className="lp-phase-n">{p.n}</span>
                  <span className="lp-phase-code">{p.key}</span>
                  <strong>{p.title}</strong>
                  <IconArrowRight size={14} />
                </li>
              ))}
            </ol>

            <div className="lp-phase-card">
              <span className="lp-phase-ico">
                <IconSparkle size={22} />
              </span>
              {(() => {
                const active =
                  FLOW_SECTION.phases.find((p) => p.key === FLOW_SECTION.activeKey) ?? FLOW_SECTION.phases[0];
                return (
                  <>
                    <div className="lp-kicker">{active.key}</div>
                    <h3>{active.title}</h3>
                    <p>{active.body}</p>
                    <div className="lp-out">
                      <span className="lp-out-k">{FLOW_SECTION.outLabel}</span>
                      <b>
                        <IconCheck size={13} />
                        {active.out}
                      </b>
                    </div>
                  </>
                );
              })()}
              <div className="lp-bars">
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 团队 ---------- */}
      <section className="lp-section" id="team">
        <div className="lp-wrap">
          <SectionHead kicker={TEAM_SECTION.kicker} title={TEAM_SECTION.title} side={TEAM_SECTION.side} />

          <div className="lp-crew">
            {TEAM_SECTION.cards.map((c) => (
              <article key={c.code} className="lp-crew-card">
                <span className="lp-crew-code">{c.code}</span>
                <span className="lp-crew-ico" data-tone={c.tone}>
                  <AgentAvatar label={c.face} size={AVATAR_SIZE.xl} status={false} />
                </span>
                <div className="lp-crew-en">{c.en}</div>
                <h3>{c.cn}</h3>
                <p>{c.desc}</p>
                <div className="lp-crew-foot">
                  <i />
                  {TEAM_SECTION.ready}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 知识 ---------- */}
      <section className="lp-section lp-section--alt" id="knowledge">
        <div className="lp-wrap">
          <div className="lp-know">
            <div>
              <div className="lp-kicker">{KNOW_SECTION.kicker}</div>
              <h2 className="lp-h2">
                <Lines lines={KNOW_SECTION.title} />
              </h2>
              <p className="lp-side lp-side--tight">{KNOW_SECTION.side}</p>
            </div>

            <div className="lp-know-vis">
              <div className="lp-know-core">
                <span className="lp-know-ico" />
                <b>{KNOW_SECTION.core.title}</b>
                <span>{KNOW_SECTION.core.note}</span>
              </div>
              {KNOW_SECTION.assets.map((a) => (
                <div key={a.name} className={`lp-asset lp-asset--${a.pos}`}>
                  <b>{a.name}</b>
                  <span>{a.size}</span>
                </div>
              ))}
            </div>
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
            <button className="lp-cta" onClick={onEnter}>
              {LANDING_CTA.enter}
              <IconArrowRight size={16} />
            </button>
            <a className="lp-cta-ghost" href={LANDING_NAV[0].href}>
              {LANDING_CTA.watch}
            </a>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-inner">
          <span className="lp-logo-text">{LANDING_BRAND.name}</span>
          <span className="lp-foot-copy">{LANDING_BRAND.copyright}</span>
          <div className="lp-foot-links">
            {FOOT_LINKS.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
            <button onClick={onEnter}>{LANDING_CTA.enter}</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
