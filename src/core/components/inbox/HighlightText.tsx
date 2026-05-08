import { Fragment, type ReactNode } from 'react';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface HighlightTextProps {
  text: string;
  keyword?: string;
  className?: string;
}

export function HighlightText({ text, keyword, className }: HighlightTextProps) {
  const normalizedKeyword = keyword?.trim() ?? '';
  if (!normalizedKeyword) {
    return <span className={className}>{text}</span>;
  }

  const pattern = new RegExp(`(${escapeRegExp(normalizedKeyword)})`, 'ig');
  const parts = text.split(pattern).filter(Boolean);

  return (
    <span className={className}>
      {parts.map((part, index): ReactNode => {
        const isMatch = part.toLowerCase() === normalizedKeyword.toLowerCase();
        return isMatch ? (
          <mark key={`${part}-${index}`} className="rounded bg-yellow-400/20 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <Fragment key={`${part}-${index}`}>{part}</Fragment>
        );
      })}
    </span>
  );
}
