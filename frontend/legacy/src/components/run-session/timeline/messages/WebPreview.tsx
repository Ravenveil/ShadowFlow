/**
 * WebPreview — Polynoia-parity live web preview card.
 *
 * Browser-chrome frame (traffic dots + address bar) wrapping a sandboxed
 * iframe. `url` loads same-origin artifact routes (/projects/...); `src`
 * renders inline HTML without same-origin privileges. Scripts allowed,
 * same-origin + top-navigation denied.
 */
import { memo } from 'react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'web_preview' }>;
}

export const WebPreview = memo(function WebPreview({ msg }: Props) {
  const href = msg.url;
  return (
    <div className={styles.webPreview}>
      <div className={styles.webChrome}>
        <span className={styles.webDots} aria-hidden>
          <i /> <i /> <i />
        </span>
        <span className={styles.webUrl}>{href ?? msg.title}</span>
        {href ? (
          <a
            className={styles.webOpen}
            href={href}
            target="_blank"
            rel="noreferrer"
            title="新标签页打开"
          >
            打开 ↗
          </a>
        ) : null}
      </div>
      <iframe
        className={styles.webFrame}
        src={href}
        srcDoc={href ? undefined : msg.src}
        title={msg.title}
        sandbox="allow-scripts allow-forms allow-popups"
        loading="lazy"
      />
    </div>
  );
});
