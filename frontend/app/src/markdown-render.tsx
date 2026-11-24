/**
 * markdown-render.tsx — Markdown AST → React 元素渲染层。
 *
 * 纯 React 元素输出（不落 dangerouslySetInnerHTML）→ 天然免 XSS；
 * 链接 href 过 safeHref 白名单（http/https/mailto），外链新窗口打开。
 * 样式走 product-app.css 的 .sf-md 系列。
 */

import { Fragment, type ReactNode } from "react";
import { parseMarkdown, safeHref, type MdAlign, type MdBlock, type MdInline } from "./markdown";

function renderInlines(inls: MdInline[], key: string): ReactNode[] {
  return inls.map((inl, i) => {
    const k = `${key}-${i}`;
    switch (inl.t) {
      case "text":
        return <Fragment key={k}>{inl.v}</Fragment>;
      case "strong":
        return <strong key={k}>{renderInlines(inl.c, k)}</strong>;
      case "em":
        return <em key={k}>{renderInlines(inl.c, k)}</em>;
      case "del":
        return <del key={k}>{renderInlines(inl.c, k)}</del>;
      case "code":
        return <code key={k}>{inl.v}</code>;
      case "link": {
        const href = safeHref(inl.href);
        if (!href) return <Fragment key={k}>{renderInlines(inl.c, k)}</Fragment>;
        return (
          <a key={k} href={href} target="_blank" rel="noreferrer">
            {renderInlines(inl.c, k)}
          </a>
        );
      }
      case "br":
        return <br key={k} />;
    }
  });
}

function alignStyle(a: MdAlign): { textAlign?: "left" | "center" | "right" } {
  return a ? { textAlign: a } : {};
}

function renderBlock(block: MdBlock, key: string): ReactNode {
  switch (block.t) {
    case "p":
      return <p key={key}>{renderInlines(block.c, key)}</p>;
    case "h": {
      const level = Math.min(6, Math.max(1, block.level));
      return (
        <div key={key} className={`sf-md-h sf-md-h${level}`}>
          {renderInlines(block.c, key)}
        </div>
      );
    }
    case "code":
      return (
        <pre key={key} className="sf-md-pre">
          <code>{block.v}</code>
        </pre>
      );
    case "quote":
      return <blockquote key={key}>{block.c.map((b, i) => renderBlock(b, `${key}-q${i}`))}</blockquote>;
    case "list": {
      const items = block.items.map((it, i) => (
        <li key={`${key}-li${i}`}>
          {it.map((b, j) => renderBlock(b, `${key}-li${i}-${j}`))}
        </li>
      ));
      return block.ordered ? (
        <ol key={key} start={block.start}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
    case "table":
      return (
        <table key={key} className="sf-md-table">
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
      );
    case "hr":
      return <hr key={key} />;
  }
}

/** 消息 Markdown 渲染组件（空文本返回 null）。 */
export function Markdown({ text, className }: { text?: string; className?: string }): ReactNode {
  if (!text) return null;
  return (
    <div className={className ? `sf-md ${className}` : "sf-md"}>
      {parseMarkdown(text).map((b, i) => renderBlock(b, `b${i}`))}
    </div>
  );
}
