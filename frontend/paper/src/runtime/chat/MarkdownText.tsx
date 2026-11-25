/**
 * MarkdownText.tsx — 消息正文渲染（Markdown AST → React 元素）。
 *
 * 2026-11-25 从 app 的 markdown-render.tsx 迁入，两处改动：
 *   1. 类名从 `sf-md` 改成本项目的 `md` 前缀（样式在 `styles/chat.css`）；
 *   2. 不再落 dangerousInnerHTML —— 全程 React 元素，链接只放行
 *      http/https/mailto（`safeHref`），外链带 rel="noreferrer"。
 *
 * 为什么不用别的库：Agent 输出只需要这个子集，自带解析器零依赖、可单测，
 * 也不会把用户输入当 HTML 执行。
 */
import { Fragment, type ReactNode } from 'react';
import { parseMarkdown, safeHref, type MdAlign, type MdBlock, type MdInline } from '@/shared/data/markdown';

function renderInlines(inls: MdInline[], key: string): ReactNode[] {
  return inls.map((inl, i) => {
    const k = `${key}-${i}`;
    switch (inl.t) {
      case 'text':
        return <Fragment key={k}>{inl.v}</Fragment>;
      case 'strong':
        return <strong key={k}>{renderInlines(inl.c, k)}</strong>;
      case 'em':
        return <em key={k}>{renderInlines(inl.c, k)}</em>;
      case 'del':
        return <del key={k}>{renderInlines(inl.c, k)}</del>;
      case 'code':
        return <code key={k}>{inl.v}</code>;
      case 'link': {
        const href = safeHref(inl.href);
        if (!href) return <Fragment key={k}>{renderInlines(inl.c, k)}</Fragment>;
        return (
          <a key={k} href={href} target="_blank" rel="noreferrer">
            {renderInlines(inl.c, k)}
          </a>
        );
      }
      case 'br':
        return <br key={k} />;
    }
  });
}

function alignStyle(a: MdAlign): { textAlign?: 'left' | 'center' | 'right' } {
  return a ? { textAlign: a } : {};
}

function renderBlock(block: MdBlock, key: string): ReactNode {
  switch (block.t) {
    case 'p':
      return <p key={key}>{renderInlines(block.c, key)}</p>;
    case 'h': {
      const level = Math.min(6, Math.max(1, block.level));
      return (
        <div key={key} className={`md-h md-h${level}`}>
          {renderInlines(block.c, key)}
        </div>
      );
    }
    case 'code':
      return (
        <pre key={key} className="md-pre">
          <code>{block.v}</code>
        </pre>
      );
    case 'quote':
      return <blockquote key={key}>{block.c.map((b, i) => renderBlock(b, `${key}-q${i}`))}</blockquote>;
    case 'list': {
      const items = block.items.map((it, i) => (
        <li key={`${key}-li${i}`}>{it.map((b, j) => renderBlock(b, `${key}-li${i}-${j}`))}</li>
      ));
      return block.ordered ? (
        <ol key={key} start={block.start}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
    case 'table':
      return (
        <div key={key} className="md-tablewrap">
          <table className="md-table">
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th key={i} style={alignStyle(block.align[i])}>
                    {renderInlines(cell, `${key}-h${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={alignStyle(block.align[ci])}>
                      {renderInlines(cell, `${key}-r${ri}c${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr key={key} />;
  }
}

/** 消息正文（空文本返回 null）。 */
export function MarkdownText({ text, className }: { text?: string; className?: string }) {
  if (!text) return null;
  return (
    <div className={className ? `md ${className}` : 'md'}>
      {parseMarkdown(text).map((b, i) => renderBlock(b, `b${i}`))}
    </div>
  );
}

export default MarkdownText;
