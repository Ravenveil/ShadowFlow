/**
 * ImagePanel — Polynoia-parity inline image.
 * Rounded media card with optional caption; click opens full-size in a tab.
 */
import { memo } from 'react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'image_panel' }>;
}

export const ImagePanel = memo(function ImagePanel({ msg }: Props) {
  return (
    <figure className={styles.imagePanel}>
      <a href={msg.src} target="_blank" rel="noreferrer">
        <img
          className={styles.imageImg}
          src={msg.src}
          alt={msg.alt ?? msg.title ?? ''}
          loading="lazy"
        />
      </a>
      {msg.title ? <figcaption className={styles.imageCaption}>{msg.title}</figcaption> : null}
    </figure>
  );
});
