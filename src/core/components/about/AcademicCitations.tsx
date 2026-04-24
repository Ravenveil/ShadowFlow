import { ACADEMIC_PAPERS, type AcademicPaper } from '../../constants/academicPapers';

function PaperCard({ paper }: { paper: AcademicPaper }) {
  return (
    <article
      className="rounded-sf border p-5 flex flex-col gap-3"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)' }}
      aria-label={paper.title}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-widest text-sf-accent block mb-1">
            {paper.id} · {paper.year}
          </span>
          <h3 className="text-sm font-semibold text-white/90 leading-snug">{paper.title}</h3>
          <p className="text-xs text-sf-fg4 mt-0.5">{paper.authors}</p>
        </div>
        <a
          href={paper.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 px-2.5 py-1 rounded text-xs font-mono border transition-colors duration-150 hover:border-sf-accent hover:text-sf-accent"
          style={{ borderColor: 'var(--border)', color: 'var(--fg-4)' }}
          aria-label={`阅读论文：${paper.title}`}
        >
          ↗ 原文
        </a>
      </div>

      <div
        className="rounded px-3 py-2 text-xs leading-relaxed"
        style={{ background: 'var(--bg-elev-2)', color: 'var(--fg-3)' }}
      >
        <span className="font-mono text-[10px] text-sf-accent block mb-1">
          {paper.venue}
        </span>
        {paper.shadowflowRelevance}
      </div>
    </article>
  );
}

export default function AcademicCitations() {
  return (
    <div className="space-y-3">
      {ACADEMIC_PAPERS.map((paper) => (
        <PaperCard key={paper.id} paper={paper} />
      ))}
    </div>
  );
}
