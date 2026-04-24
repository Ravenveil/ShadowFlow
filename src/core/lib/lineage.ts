// Frontend mirror of shadowflow/runtime/lineage.py (Story 5.5).
// Keep both implementations in lockstep — backend is the canonical reference.

const FINGERPRINT_RE = /^[a-fA-F0-9]{8}$/;
const ALIAS_RE = /^[a-zA-Z0-9_-]{1,32}$/;
export const LINEAGE_ENTRY_RE = /^[a-zA-Z0-9_-]{1,32}@[a-fA-F0-9]{8}$/;

export interface TrajectoryWithMeta {
  metadata?: {
    author_lineage?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class LineageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LineageError';
  }
}

export function walletFingerprint(address: string): string {
  if (!address || typeof address !== 'string') {
    throw new LineageError('Wallet address must be a non-empty string');
  }
  const cleaned = address.replace(/^0x/i, '');
  const head = cleaned.slice(0, 8);
  if (head.length !== 8 || !FINGERPRINT_RE.test(head)) {
    throw new LineageError(
      `Invalid wallet address: cannot extract 8-char hex fingerprint`,
    );
  }
  return head.toLowerCase();
}

export function validateAlias(alias: string): string {
  const trimmed = (alias ?? '').trim();
  if (!trimmed) {
    throw new LineageError('Author alias must not be empty');
  }
  if (!ALIAS_RE.test(trimmed)) {
    throw new LineageError(
      `Alias must match [a-zA-Z0-9_-]{1,32} (no @, no spaces, no PII)`,
    );
  }
  return trimmed;
}

export function makeEntry(alias: string, address: string): string {
  const safeAlias = validateAlias(alias);
  const fp = walletFingerprint(address);
  return `${safeAlias}@${fp}`;
}

export type AppendedTrajectory<T extends TrajectoryWithMeta> = T & {
  metadata: { author_lineage: string[] } & NonNullable<T['metadata']>;
};

export function appendAuthor<T extends TrajectoryWithMeta>(
  trajectory: T,
  alias: string,
  address: string,
): AppendedTrajectory<T> {
  const entry = makeEntry(alias, address);
  const meta = trajectory.metadata ?? {};
  const existing = Array.isArray(meta.author_lineage)
    ? meta.author_lineage.filter((e): e is string => typeof e === 'string' && LINEAGE_ENTRY_RE.test(e))
    : [];
  return {
    ...trajectory,
    metadata: { ...meta, author_lineage: [...existing, entry] },
  } as AppendedTrajectory<T>;
}

export function getLineage(trajectory: unknown): string[] {
  if (!trajectory || typeof trajectory !== 'object') return [];
  const meta = (trajectory as TrajectoryWithMeta).metadata;
  if (!meta || typeof meta !== 'object') return [];
  const lineage = meta.author_lineage;
  if (!Array.isArray(lineage)) return [];
  return lineage.filter(
    (e): e is string => typeof e === 'string' && LINEAGE_ENTRY_RE.test(e),
  );
}
