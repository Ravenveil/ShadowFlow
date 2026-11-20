import { useEffect, useState } from 'react';
import { AgentAvatar } from '../avatar';
import {
  IconArrowRight,
  IconCheck,
  IconPlay,
  IconSparkle,
} from '../shell/icons';

const NAV = [
  { label: '如何工作', href: '#how' },
  { label: 'AI 团队', href: '#team' },
  { label: '产品价值', href: '#value' },
  { label: '知识沉淀', href: '#knowledge' },
];

/** 痛点：一个人做研究的四种消耗。 */
const PAINS = [
  {
    n: '01',
    title: '一个人承担多个岗位',
    body: '文献调研、方法设计、写作、投稿，都压在同一个研究者身上。切换成本比工作量本身更贵。',
  },
  {
    n: '02',
    title: '工具很多，链路依然断裂',
    body: '文献库、AI 对话、LaTeX 工程和组会纪要散落各处，每次续写都在重建上下文。',
  },
  {
    n: '03',
    title: '审稿意见无法变成资产',
    body: '上一轮的意见、被拒的原因、有效的论证结构，散落在邮件和历史版本里，下次又从零开始。',
  },
  {
    n: '04',
    title: '进度只能靠人盯',
    body: '谁在写第几节、引用核到哪一条、方法复核有没有过，全靠你在群里追问。',
  },
];

/** 交付链路的三个阶段。 */
const PHASES = [
  {
    key: 'PLAN',
    n: '02',
    title: '主控拆解',
    body: '识别课题范围，生成章节计划、任务清单和质量标准，并自动分配给合适的角色。',
    out: '章节计划与任务 DAG',
  },
  {
    key: 'CREATE',
    n: '03',
    title: '角色协同执行',
    body: '各角色基于同一份课题上下文接力推进，写作、核引、复核互不串台。',
    out: '分节初稿与核查记录',
  },
  {
    key: 'DELIVER',
    n: '04',
    title: '审核并完成交付',
    body: '统一文风、对齐口径、生成投稿材料，所有改动都能回溯到具体证据。',
    out: '可投稿的完整稿件',
  },
];

/** 团队角色卡（A1–A4）。 */
const CREW = [
  {
    code: 'A1',
    en: 'CHIEF OF STAFF',
    cn: '主控',
    desc: '接需求 · 拆任务 · 调度团队',
    color: '#ff5e3a',
    face: '主控',
  },
  {
    code: 'A2',
    en: 'RESEARCHER',
    cn: '文献研究员',
    desc: '文献扫描 · 竞品基线 · 洞察提炼',
    color: '#12a594',
    face: 'PI',
  },
  {
    code: 'A3',
    en: 'STRATEGIST',
    cn: '方法设计',
    desc: '实验设计 · 消融规划 · 统计口径',
    color: '#7c5cff',
    face: '方法复核',
  },
  {
    code: 'A4',
    en: 'CREATIVE',
    cn: '章节主笔',
    desc: '章节撰写 · 图表脚本 · 投稿材料',
    color: '#e0356b',
    face: '章节主笔',
  },
];

/** 知识资产卡。 */
const ASSETS = [
  { name: '审稿意见', size: '18 条', pos: 'tl' },
  { name: '项目成果', size: '6 篇', pos: 'tr' },
  { name: 'SOP 模板', size: '4 套', pos: 'bl' },
  { name: '写作偏好', size: '持续学习', pos: 'br' },
];

function ProductVisual() {
  return (
    <div className="lp-visual">
      <div className="lp-visual-bar">
        <span className="lp-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="lp-visual-title">项目执行中心</span>
        <span className="lp-visual-url">shadowflow.ai</span>
      </div>

      <div className="lp-visual-body">
        <aside className="lp-visual-rail">
          <span className="lp-vr-dot is-on" />
          <span className="lp-vr-dot" />
          <span className="lp-vr-dot" />
          <span className="lp-vr-dot" />
        </aside>

        <div className="lp-visual-main">
          <div className="lp-visual-kicker">ACTIVE PROJECT</div>
          <div className="lp-visual-h">LLM Agent 角色分工综述</div>
          <div className="lp-visual-sub">
            <span className="lp-live" />
            执行中 · 68%
          </div>

          <div className="lp-stats">
            {[
              { k: '12', v: '任务总数' },
              { k: '08', v: '已完成' },
              { k: '03', v: '执行中' },
            ].map((s) => (
              <div key={s.v} className="lp-stat">
                <b>{s.k}</b>
                <span>{s.v}</span>
              </div>
            ))}
          </div>

          <div className="lp-flow">
            <div className="lp-flow-head">
              <span>工作流</span>
              <span className="lp-flow-live">实时更新</span>
            </div>
            <ul>
              {[
                { n: 1, t: '文献调研', s: '已完成', c: '#12a594' },
                { n: 2, t: '方法设计', s: '进行中', c: '#ff5e3a' },
                { n: 3, t: '章节撰写', s: '执行中', c: '#7c5cff' },
              ].map((r) => (
                <li key={r.n}>
                  <i style={{ background: r.c }}>{r.n}</i>
                  <span>{r.t}</span>
                  <em>{r.s}</em>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="lp-float lp-float--a">
        <span className="lp-float-ico" />
        <div>
          <b>草案 v2.1</b>
          <span>刚更新 · 引用已核 38/52</span>
        </div>
      </div>
      <div className="lp-float lp-float--b">
        <AgentAvatar label="章节主笔" size={20} status={false} />
        <div>
          <b>章节主笔</b>
          <span>已完成 4 个 section</span>
        </div>
      </div>
    </div>
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
            <span className="lp-logo-text">ShadowFlow</span>
          </a>

          <nav className="lp-nav-links">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
            <button onClick={onEnter}>进入产品</button>
          </nav>

          <div className="lp-nav-actions">
            <button className="lp-cta-sm" onClick={onEnter}>
              预约演示
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
              为一人工信 / 科研团队打造
            </span>
            <h1 className="lp-h1">
              一个人，
              <br />
              也能带出一支
              <br />
              <em>论文团队。</em>
            </h1>
            <p className="lp-lede">
              从选题到投稿，让 AI 角色按你的方法协同推进。你负责判断与把关，ShadowFlow
              负责把每一环都闭合。
            </p>

            <div className="lp-hero-cta">
              <button className="lp-cta" onClick={onEnter}>
                预约产品演示
                <IconArrowRight size={16} />
              </button>
              <a className="lp-cta-ghost" href="#how">
                <IconPlay size={17} />
                看看如何工作
              </a>
            </div>

            <ul className="lp-ticks">
              {['无需信用卡', '15 分钟完成配置', '关键节点人工可控'].map((t) => (
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
          <div className="lp-two">
            <div>
              <div className="lp-kicker">ONE PERSON, TOO MANY ROLES</div>
              <h2 className="lp-h2">
                你缺的不是另一个工具，
                <br />
                而是一支真正协作的团队。
              </h2>
            </div>
            <p className="lp-side">
              当你同时是调研、方法、写作和投稿负责人，真正消耗精力的不是某一项工作，而是不断切换角色与拼接上下文。
            </p>
          </div>

          <div className="lp-pains">
            {PAINS.map((p) => (
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
          <div className="lp-two">
            <div>
              <div className="lp-kicker">FROM BRIEF TO DELIVERY</div>
              <h2 className="lp-h2 lp-h2--light">
                一条完整的论文
                <br />
                交付链路。
              </h2>
            </div>
            <p className="lp-side lp-side--light">
              ShadowFlow 不是让几个聊天机器人各说各话，而是让每个角色基于同一份课题知识，接力完成同一个研究目标。
            </p>
          </div>

          <div className="lp-phases">
            <ol className="lp-phase-list">
              {PHASES.map((p) => (
                <li key={p.key} className="lp-phase" data-active={p.key === 'PLAN' ? 'true' : undefined}>
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
              <div className="lp-kicker">PLAN</div>
              <h3>主控拆解</h3>
              <p>识别课题范围，生成章节计划、任务清单和质量标准，并自动分配给合适的角色。</p>
              <div className="lp-out">
                <span className="lp-out-k">本次产出</span>
                <b>
                  <IconCheck size={13} />
                  章节计划与任务 DAG
                </b>
              </div>
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
          <div className="lp-two">
            <div>
              <div className="lp-kicker">A TEAM WITH BOUNDARIES</div>
              <h2 className="lp-h2">
                一支职责、专长、
                <br />
                都有边界的 AI 团队。
              </h2>
            </div>
            <p className="lp-side">
              每位角色都有明确的职责、输入、工具和交付标准。主控负责规划和调度，你始终保留最终决策权。
            </p>
          </div>

          <div className="lp-crew">
            {CREW.map((c) => (
              <article key={c.code} className="lp-crew-card">
                <span className="lp-crew-code">{c.code}</span>
                <span className="lp-crew-ico" style={{ background: c.color }}>
                  <AgentAvatar label={c.face} size={34} status={false} />
                </span>
                <div className="lp-crew-en">{c.en}</div>
                <h3>{c.cn}</h3>
                <p>{c.desc}</p>
                <div className="lp-crew-foot">
                  <i />
                  READY TO WORK
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
              <div className="lp-kicker">EVERY PROJECT MAKES YOU STRONGER</div>
              <h2 className="lp-h2">
                交付的不只是成果，
                <br />
                更是课题组的
                <br />
                长期资产。
              </h2>
              <p className="lp-side lp-side--tight">
                每次项目的审稿意见、有效论证、写作偏好和交付标准都会回到课题组的记忆系统。下一次，不再从零开始。
              </p>
            </div>

            <div className="lp-know-vis">
              <div className="lp-know-core">
                <span className="lp-know-ico" />
                <b>课题组知识库</b>
                <span>持续学习中</span>
              </div>
              {ASSETS.map((a) => (
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
            让一个人，
            <br />
            也能带出一支专业的论文团队。
          </h2>
          <p>从今天开始，把角色分出去，把判断留给自己。</p>
          <div className="lp-hero-cta lp-hero-cta--center">
            <button className="lp-cta" onClick={onEnter}>
              进入产品
              <IconArrowRight size={16} />
            </button>
            <a className="lp-cta-ghost" href="#how">
              看看如何工作
            </a>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-inner">
          <span className="lp-logo-text">ShadowFlow</span>
          <span className="lp-foot-copy">© 2026 ShadowFlow · 论文协作平台</span>
          <div className="lp-foot-links">
            <a href="#value">产品价值</a>
            <a href="#team">AI 团队</a>
            <button onClick={onEnter}>进入产品</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
