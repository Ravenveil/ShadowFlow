import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import QuadrantChart from '../core/components/landing/QuadrantChart';

const GITHUB_URL = import.meta.env.VITE_GITHUB_URL || 'https://github.com/nicekate/ShadowFlow';

const CAPABILITIES = [
  {
    title: 'Runtime Contract',
    desc: 'Agent 之间通过结构化合同协作，每一步可审计、可驳回、可恢复',
  },
  {
    title: 'Policy Matrix',
    desc: '运行时动态制度引擎，审批门控 + 权限矩阵，团队级治理而非单点控制',
  },
  {
    title: '0G 链上传承',
    desc: '工作流、轨迹、模板全部 CID 上链，团队资产可验证、可分享、可追溯',
  },
] as const;

export default function LandingPage() {
  return (
    <>
      <Helmet>
        <title>ShadowFlow — 让每个人都能设计自己的 AI 协作团队</title>
        <meta
          name="description"
          content="链上可验证的 AI 多 Agent 协作平台，团队即资产"
        />
        <meta property="og:title" content="让每个人都能设计自己的 AI 协作团队，团队本身是链上资产" />
        <meta property="og:description" content="链上可验证的 AI 多 Agent 协作平台，团队即资产" />
        <meta property="og:image" content="/og-image.png" />
        <meta property="og:url" content="https://demo.shadowflow.xyz/" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="ShadowFlow — AI 协作团队即链上资产" />
        <meta name="twitter:description" content="链上可验证的 AI 多 Agent 协作平台" />
        <meta name="twitter:image" content="/og-image.png" />
      </Helmet>

      <main className="min-h-screen bg-[var(--bg)]">
        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="flex flex-col items-center px-6 pt-20 pb-12 md:pt-28 md:pb-16">
          <h1
            className="max-w-3xl text-center text-3xl font-bold leading-tight tracking-tight text-[var(--fg-0)] md:text-5xl md:leading-[1.15]"
          >
            让每个人都能设计自己的 AI 协作团队
            <br />
            <span className="text-[var(--accent)]">团队本身是链上资产</span>
          </h1>

          <p className="mt-5 max-w-xl text-center text-base text-[var(--fg-3)] md:text-lg">
            可视化编排多 Agent 工作流，运行时动态治理，全链路 0G 链上存证
          </p>

          {/* CTA buttons */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/templates"
              className="inline-flex items-center rounded-pill bg-[var(--accent)] px-7 py-3 text-sm font-semibold text-[var(--accent-ink)] transition-shadow hover:shadow-glow-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Try Live Demo（无需登录）
            </Link>
            <Link
              to="/import"
              className="inline-flex items-center rounded-pill border border-[var(--accent)] px-7 py-3 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Import by CID
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-pill border border-[var(--border)] px-7 py-3 text-sm font-semibold text-[var(--fg-2)] transition-colors hover:border-[var(--fg-4)] hover:text-[var(--fg-1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              View GitHub
            </a>
          </div>
        </section>

        {/* ── Quadrant Chart ───────────────────────────────── */}
        <section className="mx-auto max-w-2xl px-6 py-8 md:py-12">
          <QuadrantChart className="w-full" />
        </section>

        {/* ── Capabilities ─────────────────────────────────── */}
        <section className="mx-auto grid max-w-4xl grid-cols-1 gap-5 px-6 pb-20 md:grid-cols-3 md:pb-28">
          {CAPABILITIES.map((c) => (
            <div
              key={c.title}
              className="rounded-card border border-[var(--border)] bg-[var(--bg-elev-2)] p-6"
            >
              <h3 className="text-sm font-semibold tracking-wide text-[var(--fg-1)]">
                {c.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--fg-4)]">
                {c.desc}
              </p>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
