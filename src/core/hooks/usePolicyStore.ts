import { create } from 'zustand';

/** Policy Matrix 运行时状态（Epic 1 / 3.5 / 4.5 / 4.6）。 */
export interface PolicyRule {
  sender: string;
  receiver: string;
  action: 'approve' | 'reject' | 'retry';
}

/** Story 4.5 / 4.6: sender×receiver 三态单元格 (permit/deny/warn). */
export type CellState = 'permit' | 'deny' | 'warn';

export type PolicyMatrix = Record<string, Record<string, CellState>>;

interface PolicyState {
  rules: PolicyRule[];
  /** Highlighted cell from Story 4.3 rejection toast click. null = no highlight. */
  highlightedCell: { sender: string; receiver: string } | null;
  /** Story 4.5: sender×receiver matrix. */
  matrix: PolicyMatrix;
  /** Snapshot of matrix at last save; used for dirty detection. */
  savedMatrix: PolicyMatrix;
  /** Story 4.5: list of agents that index matrix rows/cols. */
  agents: string[];

  addRule: (rule: PolicyRule) => void;
  removeRule: (sender: string, receiver: string) => void;
  reset: () => void;
  /** Highlight sender×receiver cell for 3 s, then clear. */
  highlightCell: (sender: string, receiver: string) => void;
  clearHighlight: () => void;

  // Story 4.5 matrix actions
  setAgents: (agents: string[]) => void;
  setCell: (sender: string, receiver: string, state: CellState) => void;
  cycleCell: (sender: string, receiver: string) => void;
  setMatrix: (matrix: PolicyMatrix, agents?: string[]) => void;
  markClean: () => void;
  isDirty: () => boolean;
}

function cloneMatrix(m: PolicyMatrix): PolicyMatrix {
  const out: PolicyMatrix = {};
  for (const s of Object.keys(m)) {
    out[s] = { ...m[s] };
  }
  return out;
}

function nextCellState(cur: CellState | undefined): CellState {
  const order: CellState[] = ['permit', 'deny', 'warn'];
  if (!cur) return 'deny';
  const idx = order.indexOf(cur);
  return order[(idx + 1) % order.length];
}

function matricesEqual(a: PolicyMatrix, b: PolicyMatrix): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const s of keysA) {
    const rowA = a[s];
    const rowB = b[s];
    if (!rowB) return false;
    const rkA = Object.keys(rowA);
    const rkB = Object.keys(rowB);
    if (rkA.length !== rkB.length) return false;
    for (const r of rkA) {
      if (rowA[r] !== rowB[r]) return false;
    }
  }
  return true;
}

// P11: Module-level timer ref — shared across renders to cancel stale highlight timers
let _highlightTimer: ReturnType<typeof setTimeout> | null = null;

export const usePolicyStore = create<PolicyState>((set, get) => ({
  rules: [],
  highlightedCell: null,
  matrix: {},
  savedMatrix: {},
  agents: [],

  // P12: Replace existing rule for same (sender, receiver) — no duplicate pairs
  addRule: (rule) =>
    set((s) => {
      const filtered = s.rules.filter(
        (r) => !(r.sender === rule.sender && r.receiver === rule.receiver),
      );
      return { rules: [...filtered, rule] };
    }),

  removeRule: (sender, receiver) =>
    set((s) => ({ rules: s.rules.filter((r) => !(r.sender === sender && r.receiver === receiver)) })),

  reset: () => {
    // P11: Cancel any pending highlight timer on reset
    if (_highlightTimer) { clearTimeout(_highlightTimer); _highlightTimer = null; }
    set({ rules: [], highlightedCell: null, matrix: {}, savedMatrix: {}, agents: [] });
  },

  // P11: Cancel previous timer before setting a new highlight (prevents race + unmount leak)
  highlightCell: (sender, receiver) => {
    if (_highlightTimer) clearTimeout(_highlightTimer);
    set({ highlightedCell: { sender, receiver } });
    _highlightTimer = setTimeout(() => {
      set({ highlightedCell: null });
      _highlightTimer = null;
    }, 3000);
  },

  clearHighlight: () => {
    if (_highlightTimer) { clearTimeout(_highlightTimer); _highlightTimer = null; }
    set({ highlightedCell: null });
  },

  // P9 (review Chunk B): setAgents also updates savedMatrix so newly-added agents
  // don't immediately show as dirty (only cells the user explicitly changed are dirty).
  setAgents: (agents) =>
    set((s) => {
      const uniq = [...new Set(agents.filter(Boolean))];
      const matrix = cloneMatrix(s.matrix);
      const savedMatrix = cloneMatrix(s.savedMatrix);
      for (const sender of uniq) {
        if (!matrix[sender]) matrix[sender] = {};
        if (!savedMatrix[sender]) savedMatrix[sender] = {};
        for (const receiver of uniq) {
          if (!(receiver in matrix[sender])) matrix[sender][receiver] = 'permit';
          if (!(receiver in savedMatrix[sender])) savedMatrix[sender][receiver] = 'permit';
        }
      }
      return { agents: uniq, matrix, savedMatrix };
    }),

  // P14: Only update if sender and receiver are in the known agents list
  setCell: (sender, receiver, state) =>
    set((s) => {
      if (!s.agents.includes(sender) || !s.agents.includes(receiver)) return s;
      const matrix = cloneMatrix(s.matrix);
      if (!matrix[sender]) matrix[sender] = {};
      matrix[sender][receiver] = state;
      return { matrix };
    }),

  // P14: Same guard for cycleCell
  cycleCell: (sender, receiver) =>
    set((s) => {
      if (!s.agents.includes(sender) || !s.agents.includes(receiver)) return s;
      const matrix = cloneMatrix(s.matrix);
      if (!matrix[sender]) matrix[sender] = {};
      matrix[sender][receiver] = nextCellState(matrix[sender][receiver]);
      return { matrix };
    }),

  setMatrix: (matrix, agents) =>
    set(() => ({
      matrix: cloneMatrix(matrix),
      savedMatrix: cloneMatrix(matrix),
      ...(agents ? { agents } : {}),
    })),

  markClean: () =>
    set((s) => ({ savedMatrix: cloneMatrix(s.matrix) })),

  isDirty: () => !matricesEqual(get().matrix, get().savedMatrix),
}));
