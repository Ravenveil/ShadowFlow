// ============================================================================
// toast — minimal in-house toast for surfacing API errors / success / info.
//
// Usage: `toast.error('xx 失败')`, `toast.success('已保存')`, `toast.info('...')`.
// Reads design tokens directly via `var(--t-*)` so it follows the active theme.
// No deps; safe to call from any module (lazily mounts a fixed container).
// ============================================================================

type ToastKind = 'error' | 'success' | 'info';

const CONTAINER_ID = 'sf-toast-root';
const DEFAULT_DURATION = 3500;

const KIND_STYLES: Record<ToastKind, { border: string; accent: string }> = {
  error:   { border: 'var(--t-err)',  accent: 'var(--t-err)' },
  success: { border: 'var(--t-ok)',   accent: 'var(--t-ok)' },
  info:    { border: 'var(--t-accent)', accent: 'var(--t-accent)' },
};

function ensureContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById(CONTAINER_ID);
  if (root) return root;
  root = document.createElement('div');
  root.id = CONTAINER_ID;
  root.style.cssText = [
    'position:fixed',
    'top:16px',
    'right:16px',
    'z-index:99999',
    'display:flex',
    'flex-direction:column',
    'gap:8px',
    'pointer-events:none',
    'max-width:380px',
  ].join(';');
  document.body.appendChild(root);
  return root;
}

function show(kind: ToastKind, message: string, duration = DEFAULT_DURATION) {
  const root = ensureContainer();
  if (!root) return;

  const { border, accent } = KIND_STYLES[kind];
  const el = document.createElement('div');
  el.style.cssText = [
    'pointer-events:auto',
    'background:var(--t-panel, #0F0F12)',
    'color:var(--t-fg, #FAFAFA)',
    `border:1px solid ${border}`,
    'border-radius:8px',
    'padding:10px 14px',
    'font-family:var(--font-sans)',
    'font-size:12.5px',
    'line-height:1.5',
    'box-shadow:0 8px 24px -8px rgba(0,0,0,0.35)',
    'transform:translateX(8px)',
    'opacity:0',
    'transition:transform 200ms ease, opacity 200ms ease',
    'display:flex',
    'align-items:flex-start',
    'gap:10px',
    'cursor:pointer',
  ].join(';');

  const dot = document.createElement('span');
  dot.style.cssText = `flex-shrink:0;width:8px;height:8px;border-radius:50%;background:${accent};margin-top:5px`;

  const body = document.createElement('span');
  body.textContent = message;
  body.style.cssText = 'flex:1;word-break:break-word';

  el.appendChild(dot);
  el.appendChild(body);
  root.appendChild(el);

  // animate-in
  requestAnimationFrame(() => {
    el.style.transform = 'translateX(0)';
    el.style.opacity = '1';
  });

  const dismiss = () => {
    el.style.transform = 'translateX(8px)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 220);
  };

  el.addEventListener('click', dismiss);
  setTimeout(dismiss, duration);
}

export const toast = {
  error:   (msg: string, duration?: number) => show('error', msg, duration),
  success: (msg: string, duration?: number) => show('success', msg, duration),
  info:    (msg: string, duration?: number) => show('info', msg, duration),
};

export default toast;
