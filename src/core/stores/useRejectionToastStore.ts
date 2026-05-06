/**
 * useRejectionToastStore — 3-slot rejection toast queue (Story 4.3 AC1).
 *
 * Max 3 visible toasts; extras queue and emit when a slot clears.
 *
 * P7 (review Chunk B): auto-dismiss timer is started in the store on push/promote,
 * not only in the SingleToast component. This ensures queued toasts that are
 * promoted after the component mounts still get their full 5 s window, and that
 * timers are tracked even if the component never renders (e.g. during testing).
 *
 * P8 (review Chunk B): dismiss() + promote() are merged into a single set() call
 * to avoid an intermediate state visible in React concurrent mode.
 */

import { create } from 'zustand';

export interface RejectionToastItem {
  id: string;
  sender: string;
  receiver: string;
  reason: string;
  ts: number;
}

interface RejectionToastState {
  /** Currently visible toasts (max 3). */
  visible: RejectionToastItem[];
  /** Queued — waiting for a slot. */
  queue: RejectionToastItem[];

  push: (item: Omit<RejectionToastItem, 'id' | 'ts'>) => void;
  dismiss: (id: string) => void;
  _promote: () => void;
}

const MAX_VISIBLE = 3;
const DISMISS_MS = 5000;

/** Module-level timer registry shared with SingleToast's component-side timer. */
const _timers = new Map<string, ReturnType<typeof setTimeout>>();

function _scheduleDismiss(id: string, dismissFn: (id: string) => void): void {
  // Cancel any existing timer for this id before starting a new one
  const prev = _timers.get(id);
  if (prev !== undefined) { clearTimeout(prev); }
  _timers.set(id, setTimeout(() => {
    _timers.delete(id);
    dismissFn(id);
  }, DISMISS_MS));
}

function _cancelDismiss(id: string): void {
  const t = _timers.get(id);
  if (t !== undefined) { clearTimeout(t); _timers.delete(id); }
}

export const useRejectionToastStore = create<RejectionToastState>((set, get) => ({
  visible: [],
  queue: [],

  push(item) {
    const toast: RejectionToastItem = {
      ...item,
      id: `rej-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
    };
    let isImmediate = false;
    set((s) => {
      if (s.visible.length < MAX_VISIBLE) {
        isImmediate = true;
        return { visible: [...s.visible, toast] };
      }
      return { queue: [...s.queue, toast] };
    });
    // P7: start store-side auto-dismiss timer for immediately-visible toasts
    if (isImmediate) {
      _scheduleDismiss(toast.id, (id) => get().dismiss(id));
    }
  },

  // P8: single set() call — dismiss + optional promote are atomic
  dismiss(id) {
    _cancelDismiss(id);
    let promotedId: string | null = null;
    set((s) => {
      const visible = s.visible.filter((t) => t.id !== id);
      if (s.queue.length > 0 && visible.length < MAX_VISIBLE) {
        const [next, ...rest] = s.queue;
        promotedId = next.id;
        return { visible: [...visible, next], queue: rest };
      }
      return { visible };
    });
    // P7: start store-side auto-dismiss for the promoted toast (outside set())
    if (promotedId) {
      const pid = promotedId; // capture before async
      _scheduleDismiss(pid, (id) => get().dismiss(id));
    }
  },

  _promote() {
    // Kept for backward compat — dismiss() now handles promotion inline.
    // Direct calls (e.g. from tests) still work correctly.
    let promotedId: string | null = null;
    set((s) => {
      if (s.queue.length === 0 || s.visible.length >= MAX_VISIBLE) return s;
      const [next, ...rest] = s.queue;
      promotedId = next.id;
      return { visible: [...s.visible, next], queue: rest };
    });
    if (promotedId) {
      const pid = promotedId;
      _scheduleDismiss(pid, (id) => get().dismiss(id));
    }
  },
}));
