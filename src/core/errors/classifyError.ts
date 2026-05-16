/**
 * classifyError.ts — Frontend fallback classifier.
 *
 * The daemon (`server/src/lib/classify-error.ts`) already maps every SSE
 * `error` event into a 6-bucket UI code. This file exists for the cases the
 * daemon can't reach:
 *   - watchdog timeout (3 min — frontend-side error)
 *   - SSE network error (max retries exhausted — EventSource onerror)
 *   - any future synthetic error originated in the React layer
 *
 * Server-classified events should pass `code` straight through — only
 * synthetic / unclassified ones flow through `classifyClientError()`.
 */
import type { ErrorCode } from '../hooks/useRunSession';

const RX_AUTH = /\b(?:401|403)\b|api[_\s-]?key|authentication|unauthori[sz]ed/i;
const RX_RATE_LIMIT = /\b429\b|rate ?limit|too many requests|overloaded/i;
const RX_CONTEXT = /context[_ -]?length|tokens? exceeds?|prompt is too long/i;
const RX_NETWORK = /ECONNREFUSED|ETIMEDOUT|getaddrinfo|fetch failed|SSE|EventSource|连接失败|超时|网络/i;
const RX_SERVER_5XX = /\b5\d{2}\b|internal server error|service unavailable/i;

const VALID_CODES: ReadonlySet<ErrorCode> = new Set([
  'auth',
  'rate_limit',
  'context_too_long',
  'network',
  'server',
  'unknown',
]);

export function isErrorCode(code: unknown): code is ErrorCode {
  return typeof code === 'string' && VALID_CODES.has(code as ErrorCode);
}

export function classifyClientError(message: string): ErrorCode {
  if (!message) return 'unknown';
  if (RX_AUTH.test(message)) return 'auth';
  if (RX_RATE_LIMIT.test(message)) return 'rate_limit';
  if (RX_CONTEXT.test(message)) return 'context_too_long';
  if (RX_NETWORK.test(message)) return 'network';
  if (RX_SERVER_5XX.test(message)) return 'server';
  return 'unknown';
}
