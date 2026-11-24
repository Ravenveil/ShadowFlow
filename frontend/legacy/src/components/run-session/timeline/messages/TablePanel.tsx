/**
 * TablePanel — Polynoia-parity inline data table.
 *
 * Generic columns/rows grid (verifier metrics, changed-file stats,
 * comparisons). Numeric right-alignment is inferred per column.
 */
import { memo } from 'react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'table_panel' }>;
}

function colIsNumeric(msg: Props['msg'], col: number): boolean {
  return msg.rows.length > 0 && msg.rows.every((r) => typeof r[col] === 'number');
}

export const TablePanel = memo(function TablePanel({ msg }: Props) {
  if (msg.columns.length === 0) return null;
  return (
    <div className={styles.tablePanel}>
      {msg.caption ? <div className={styles.tableCaption}>{msg.caption}</div> : null}
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {msg.columns.map((c, i) => (
                <th key={i} scope="col" className={colIsNumeric(msg, i) ? styles.tableNum : undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {msg.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={c === 0 ? styles.tableFirstCol : colIsNumeric(msg, c) ? styles.tableNum : undefined}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
