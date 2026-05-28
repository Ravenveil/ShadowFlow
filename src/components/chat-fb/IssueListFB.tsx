/**
 * IssueListFB · agent 消息体内嵌的结构化"问题列表"（FB-HiFi 风）
 * 对照 _evidence/design-pkg-2026-05-28/chat-fb.html
 *   - CSS : 行 367-373（.issue-list / .issue / .issue .sec / .issue .desc）
 *   - HTML: 行 1200-1204（critic agent 列出 3 处 §章节不一致）
 *
 * 用法：critic / reviewer agent 找出的离散问题用结构化 payload 渲染
 *      （比拼成纯文本更便于交互：点击定位、严重度过滤、后续 issue tracker）。
 *
 * Props：
 *   issues: Array<{
 *     id: string;
 *     severity: 'high' | 'med' | 'low';
 *     title: string;                  // 显示主标题（设计稿 §4.2 / §5.1 这一列）
 *     excerpt?: string;               // 2 行内 clip 的描述
 *     location?: { file?: string; line?: number };
 *   }>
 *   onIssueClick?(id): void           // 点击单条 issue 触发（hover 高亮 + click 跳转）
 *
 * TODO(Stream H): location.file 接到文档抽屉 / 编辑器跳转；severity 阈值过滤接 Policy Matrix。
 */

import styles from './chatFB.module.css';

export type IssueSeverity = 'high' | 'med' | 'low';

export interface IssueItem {
  id: string;
  severity: IssueSeverity;
  title: string;
  excerpt?: string;
  location?: {
    file?: string;
    line?: number;
  };
}

export interface IssueListFBProps {
  issues: IssueItem[];
  onIssueClick?: (id: string) => void;
}

const SEV_LABEL: Record<IssueSeverity, string> = {
  high: 'HIGH',
  med: 'MED',
  low: 'LOW',
};

export function IssueListFB({ issues, onIssueClick }: IssueListFBProps) {
  if (!issues || issues.length === 0) return null;

  return (
    <div className={styles.issueList} role="list">
      {issues.map(it => {
        const clickable = typeof onIssueClick === 'function';
        const handleClick = clickable ? () => onIssueClick!(it.id) : undefined;
        return (
          <div
            key={it.id}
            role="listitem"
            className={`${styles.issue} ${clickable ? styles.issueClickable : ''}`}
            onClick={handleClick}
            onKeyDown={
              clickable
                ? e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleClick?.();
                    }
                  }
                : undefined
            }
            tabIndex={clickable ? 0 : undefined}
          >
            <span
              className={`${styles.issueSec} ${styles[`issueSev_${it.severity}`]}`}
              title={`严重度 ${SEV_LABEL[it.severity]}`}
            >
              {SEV_LABEL[it.severity]}
            </span>
            <div className={styles.issueBody}>
              <div className={styles.issueTitle}>{it.title}</div>
              {it.excerpt && <div className={styles.issueExcerpt}>{it.excerpt}</div>}
              {it.location && (it.location.file || it.location.line) && (
                <span className={styles.issueLoc}>
                  {it.location.file ?? ''}
                  {it.location.line ? `:${it.location.line}` : ''}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default IssueListFB;
