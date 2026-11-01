/**
 * NeoMarkdown — Neo 壳自有的轻量 Markdown 渲染器（阶段 2.5 视觉返工）。
 *
 * 解析子集与旧 PreviewMarkdown 相同（覆盖 ~90% LLM 产物）：
 *   - ATX 标题 `#`..`######`（带 id，供大纲跳转）
 *   - Fenced code block ```lang
 *   - 无序/有序列表、段落
 *   - 行内 **bold** *italic* `code` [text](url)
 *   - Blockquote `> ...`（单行）、pipe 表格
 *
 * 与旧组件的差异：不再内联样式，全部输出语义化 class（neo-md-*），
 * 样式集中在 neo-host.css，颜色一律 var(--t-*) token（day/night 双主题安全）。
 * 链接色 var(--t-link)（neo-host.css 顶部定义，day/paper 青 #0F766E 对齐 done.html）。
 *
 * 安全：不使用 dangerouslySetInnerHTML，所有节点均为文本子节点，
 * 不可信 MD 无法注入 HTML。
 */
import React from 'react';

export interface NeoMarkdownProps {
  source: string;
}

// ---------------------------------------------------------------------------
// 大纲提取（与渲染器共用同一趟标题计数，id 一一对应）
// ---------------------------------------------------------------------------

export interface NeoOutlineItem {
  /** ATX 级别 1-6。 */
  depth: number;
  text: string;
  /** 渲染出的标题元素 id（neo-md-h-N）。 */
  id: string;
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

/** 从 markdown 源提取大纲（h1-h3，跳过 fenced code 内的伪标题）。 */
export function extractOutline(src: string): NeoOutlineItem[] {
  const items: NeoOutlineItem[] = [];
  let inFence = false;
  let hCount = 0;
  for (const raw of src.split('\n')) {
    if (/^```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const h = HEADING_RE.exec(raw);
    if (!h) continue;
    const depth = h[1].length;
    hCount += 1;
    if (depth > 3) continue; // 大纲只到 h3（done.html 只有两级，h3 兜底）
    items.push({ depth, text: h[2].trim(), id: `neo-md-h-${hCount}` });
  }
  return items;
}

// ---------------------------------------------------------------------------
// 行内 tokenizer：单趟扫描，输出 React 节点
// ---------------------------------------------------------------------------

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // 统一 regex，按优先级覆盖全部行内模式。
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith('`')) {
      out.push(
        <code key={k} className="neo-md-code">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith('**')) {
      out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('*')) {
      out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    } else if (m[4]) {
      // [text](url)
      out.push(
        <a key={k} className="neo-md-link" href={m[6]} target="_blank" rel="noopener noreferrer">
          {m[5]}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ---------------------------------------------------------------------------
// 块级渲染
// ---------------------------------------------------------------------------

function renderMarkdown(src: string): React.ReactNode[] {
  const lines = src.split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  let hCount = 0; // 与 extractOutline 同步的标题计数（含 h4-h6）

  while (i < lines.length) {
    const raw = lines[i];

    // Fenced code block
    const fence = /^```(\w*)\s*$/.exec(raw);
    if (fence) {
      const lang = fence[1];
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // skip closing fence
      out.push(
        <pre key={`code-${key++}`} className="neo-md-pre" data-lang={lang || undefined}>
          <code>{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Heading（id 供大纲 scrollIntoView）
    const h = HEADING_RE.exec(raw);
    if (h) {
      const level = h[1].length;
      hCount += 1;
      const Tag = (`h${level}` as unknown) as keyof JSX.IntrinsicElements;
      out.push(
        <Tag
          key={`h-${key++}`}
          id={`neo-md-h-${hCount}`}
          className={`neo-md-h neo-md-h${level}`}
        >
          {renderInline(h[2], `h-${key}`)}
        </Tag>,
      );
      i += 1;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(raw)) {
      out.push(
        <blockquote key={`bq-${key++}`} className="neo-md-bq">
          {renderInline(raw.replace(/^>\s?/, ''), `bq-${key}`)}
        </blockquote>,
      );
      i += 1;
      continue;
    }

    // Pipe 表格：header + `---` 分隔 + 数据行（hairline 行线）
    if (
      raw.trim().startsWith('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1]) &&
      lines[i + 1].includes('-')
    ) {
      const splitRow = (l: string) =>
        l
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());
      const header = splitRow(raw);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      out.push(
        <table key={`tbl-${key++}`} className="neo-md-table">
          <thead>
            <tr>
              {header.map((c, j) => (
                <th key={j}>{renderInline(c, `tbl-${key}-h${j}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci}>{renderInline(c, `tbl-${key}-${ri}-${ci}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    // 无序列表
    if (/^\s*[-*]\s+/.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      out.push(
        <ul key={`ul-${key++}`} className="neo-md-ul">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, `ul-${key}-${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      out.push(
        <ol key={`ol-${key++}`} className="neo-md-ol">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, `ol-${key}-${j}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // 空行 → flush；否则段落（合并连续行）
    if (raw.trim() === '') {
      i += 1;
      continue;
    }
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !HEADING_RE.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      // 表格起始行（header + delimiter 两行模式）也要截断段落
      !(
        lines[i].trim().startsWith('|') &&
        i + 1 < lines.length &&
        /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])
      )
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    out.push(
      <p key={`p-${key++}`} className="neo-md-p">
        {renderInline(paraLines.join(' '), `p-${key}`)}
      </p>,
    );
  }

  return out;
}

export const NeoMarkdown: React.FC<NeoMarkdownProps> = ({ source }) => {
  return <div className="neo-md">{renderMarkdown(source)}</div>;
};

export default NeoMarkdown;
