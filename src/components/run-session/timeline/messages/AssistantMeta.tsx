/**
 * AssistantMeta — single-line header above an assistant turn body. Format:
 *   [Brand · Ver]  ●  identity  ●  summary
 * Visual ref: v8 .tl-meta + .model-pill (line 1341-1350).
 */
import { memo } from 'react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'assistant_meta' }>;
}

export const AssistantMeta = memo(function AssistantMeta({ msg }: Props) {
  return (
    <div className={styles.meta}>
      <span className={styles.modelPill}>
        <span className={styles.modelBrand}>{msg.model_brand}</span>
        <span className={styles.modelSep}>·</span>
        <span className={styles.modelVer}>{msg.model_ver}</span>
      </span>
      <span className={styles.metaDot} aria-hidden />
      <span className={styles.metaWho}>{msg.identity}</span>
      <span className={styles.metaDot} aria-hidden />
      <span>{msg.summary}</span>
    </div>
  );
});
