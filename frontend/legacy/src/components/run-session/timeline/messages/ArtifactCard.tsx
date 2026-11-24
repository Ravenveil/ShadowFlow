/**
 * ArtifactCard — Polynoia-parity artifact reference card.
 *
 * Points at a persisted run artifact (yaml / html / markdown). Filename +
 * type badge + open link; clicking opens the artifact URL (served under
 * /projects/<session>/ with a sandboxed CSP) in a new tab.
 */
import { memo } from 'react';
import { FileCode2, FileText, Globe, Package } from 'lucide-react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'artifact_card' }>;
}

function typeIcon(type: string) {
  if (type === 'html') return <Globe size={14} aria-hidden />;
  if (type === 'markdown' || type === 'md') return <FileText size={14} aria-hidden />;
  if (type === 'yaml' || type === 'yml') return <FileCode2 size={14} aria-hidden />;
  return <Package size={14} aria-hidden />;
}

export const ArtifactCard = memo(function ArtifactCard({ msg }: Props) {
  return (
    <div className={styles.artifactCard}>
      <span className={styles.artifactIcon}>{typeIcon(msg.artifact_type)}</span>
      <div className={styles.artifactBody}>
        <span className={styles.artifactName}>{msg.filename}</span>
        {msg.note ? <span className={styles.artifactNote}>{msg.note}</span> : null}
      </div>
      <span className={styles.artifactType} data-type={msg.artifact_type}>
        {msg.artifact_type}
      </span>
      {msg.url ? (
        <a
          className={styles.artifactOpen}
          href={msg.url}
          target="_blank"
          rel="noreferrer"
        >
          查看 ↗
        </a>
      ) : null}
    </div>
  );
});
