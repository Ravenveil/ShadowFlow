const PRIVATE_KEY_RE = /0x[0-9a-f]{64}/i;
const SK_PREFIX_RE = /sk-[A-Za-z0-9_-]{20,}/;

function containsSecret(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return PRIVATE_KEY_RE.test(value) || SK_PREFIX_RE.test(value);
}

function redact(value: string): string {
  return value
    .replace(/0x[0-9a-f]{64}/gi, '0x[REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, 'sk-[REDACTED]');
}

function scanObject(obj: unknown): boolean {
  if (typeof obj === 'string') return containsSecret(obj);
  if (obj === null || obj === undefined) return false;
  if (typeof obj !== 'object') return false;
  try {
    const json = JSON.stringify(obj);
    return containsSecret(json);
  } catch {
    return false;
  }
}

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return '';
}

function isSameOrigin(url: string): boolean {
  if (url.startsWith('/')) return true;
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}

let _fetchInstalled = false;
let _consoleInstalled = false;

export function installFetchInterceptor(): void {
  if (typeof window === 'undefined' || _fetchInstalled) return;
  _fetchInstalled = true;

  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = extractUrl(input);

    if (!isSameOrigin(url)) {
      if (containsSecret(url)) {
        throw new Error('[ShadowFlow] Request blocked: URL contains a potential private key or secret');
      }

      if (init?.body) {
        const bodyStr = typeof init.body === 'string'
          ? init.body
          : init.body instanceof URLSearchParams
            ? init.body.toString()
            : null;
        if (bodyStr && containsSecret(bodyStr)) {
          throw new Error('[ShadowFlow] Request blocked: body contains a potential private key or secret');
        }
      }

      if (init?.headers) {
        const entries =
          init.headers instanceof Headers
            ? Array.from(init.headers.entries())
            : Array.isArray(init.headers)
              ? init.headers
              : Object.entries(init.headers);

        for (const [, value] of entries) {
          if (containsSecret(value)) {
            throw new Error('[ShadowFlow] Request blocked: header contains a potential private key or secret');
          }
        }
      }
    }

    return originalFetch.call(window, input, init);
  };
}

export function installConsoleGuard(): void {
  if (typeof window === 'undefined' || _consoleInstalled) return;
  _consoleInstalled = true;

  const methods = ['log', 'warn', 'error', 'info', 'debug'] as const;

  for (const method of methods) {
    const original = console[method];
    console[method] = (...args: unknown[]) => {
      const sanitized = args.map((arg) => {
        if (typeof arg === 'string' && containsSecret(arg)) return redact(arg);
        if (scanObject(arg)) return '[ShadowFlow: redacted object containing secrets]';
        return arg;
      });
      original.apply(console, sanitized);
    };
  }
}

export function installLeakGuards(): void {
  installFetchInterceptor();
  installConsoleGuard();
}

export { containsSecret, redact };
