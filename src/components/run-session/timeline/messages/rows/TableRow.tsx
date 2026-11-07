/**
 * TableRow — GFM pipe 表格行（2026-11-07）。
 *
 * extractRows 把「header + `---` 分隔行 + 数据行」切成 `table` 行型后，
 * 这里渲染成语义 <table>。此前整块表格漏成带竖线的纯文本（群聊截图实证）。
 * 经典面 TextRow 本就不做行内 markdown，cell 以纯文本 + 路径高亮口径渲染。
 */
import { memo } from 'react';
import styles from '../../timeline.module.css';

interface Props {
  header: string[];
  rows: string[][];
}

export const TableRow = memo(function TableRow({ header, rows }: Props) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {header.map((c, j) => (
              <th key={j}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
