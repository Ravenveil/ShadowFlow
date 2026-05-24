/**
 * SectionHeader — chevron-folded group label that wraps a set of child rows.
 *
 * Visual contract (from TRAE row-style + OpenDesign panel evidence in
 * docs/round2/round2-spec-2026-05-24.md section "OpenDesign UI 证据"):
 *
 *   ⌄ Builder                            ← chevron + agent name (bold)
 *     └ {child row 1}
 *     └ {child row 2}
 *
 *   ⌄ 思考过程
 *     └ {thought child row}
 *
 * The component is a generic container; it does NOT correspond to a
 * TimelineMessage kind. Other renderers (ThinkingMessage / StepPanel)
 * already handle their own collapse. SectionHeader exists for ad-hoc
 * wrap groups (e.g. "Builder" agent identity, "工作 · 白名单运行")
 * where we want to group N adjacent rows under a single foldable label.
 *
 * Per the Round 2 spec "13 row types" table this maps to `SectionHeader`.
 */
import { memo, useState, type ReactNode } from 'react';
import styles from '../timeline.module.css';

interface Props {
  label: string;
  /** Optional small trailing meta (e.g. "5 个步骤 · 5.4s"). */
  meta?: string;
  /** Initial open state — defaults true (TRAE shows sections expanded). */
  defaultOpen?: boolean;
  /**
   * Children rendered indented under the header when open. Optional —
   * when omitted the SectionHeader renders as a standalone divider row
   * (still toggles the chev), used by the MessageRegistry `section_header`
   * kind which is a single TimelineMessage without inline children.
   */
  children?: ReactNode;
}

export const SectionHeader = memo(function SectionHeader({
  label,
  meta,
  defaultOpen = true,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.sectionHead}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span
          className={
            open
              ? `${styles.sectionChev} ${styles.sectionChevOpen}`
              : styles.sectionChev
          }
        >
          ›
        </span>
        <span className={styles.sectionLabel}>{label}</span>
        {meta && <span className={styles.sectionMeta}>{meta}</span>}
      </button>
      {open && children && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
});
