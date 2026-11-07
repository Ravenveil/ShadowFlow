/**
 * useCommandK — global keyboard hook that fires `onOpen` whenever the user
 * presses (Cmd|Ctrl)+K anywhere on the page.
 *
 * Used by AgentPanel (and any future surface that wants a quick-picker) to
 * pop the AgentPickerModal. Mounted once at the panel root; the hook owns
 * its own `keydown` listener on `window` and cleans up on unmount.
 *
 * Behaviour:
 *   - matches both ⌘+K (macOS) and Ctrl+K (Windows/Linux) — checks
 *     event.metaKey || event.ctrlKey
 *   - matches the literal "k" key (case-insensitive) — uses `event.key`
 *     rather than `event.code` so Dvorak / non-QWERTY layouts still work
 *   - calls `preventDefault()` to suppress the browser's "Quick find" /
 *     "Search bookmarks" defaults that would otherwise steal focus
 *   - when `enabled === false`, the effect mounts no listener so the hook
 *     is safe to call from components that conditionally want shortcuts
 *
 * The hook intentionally does NOT close any modal — that's the consumer's
 * job. It is a fire-and-forget "open" trigger.
 */
import { useEffect } from 'react';

export interface UseCommandKOptions {
  /** Called once per (Cmd|Ctrl)+K press. */
  onOpen: () => void;
  /** When false, no listener is registered. Defaults to true. */
  enabled?: boolean;
}

export function useCommandK({ onOpen, enabled = true }: UseCommandKOptions): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent): void => {
      // Match both macOS ⌘+K and Windows/Linux Ctrl+K. We do NOT require
      // shift / alt to be unset — most browsers will already have eaten
      // Cmd+Shift+K (DevTools console) before we see it, and being lax
      // here means modifier-chord users still get the picker.
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (!isCmdOrCtrl) return;
      if (e.key !== 'k' && e.key !== 'K') return;
      e.preventDefault();
      onOpen();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [onOpen, enabled]);
}

export default useCommandK;
