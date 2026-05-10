/**
 * cli-detector.ts — Cross-platform PATH scan for known AI CLIs (Story 15.19 v2)
 *
 * On boot (and on `POST /api/cli/detect/refresh`), runs `which`/`where` for each
 * binary in `cli-registry.ts`, then a quick `<binary> --version` probe with a
 * 3 s timeout. Results are cached in-memory; the cache is a `{scanned_at,items}`
 * record returned by the API verbatim.
 *
 * Design choices:
 *  - shell:false everywhere — avoid PATH injection / shell-quoting tarpits.
 *  - direct child_process.spawn — no shell rc files, no stale aliases.
 *  - timeout-bound version probes — a hung CLI cannot block server boot.
 *  - cache is mutable but never shared across processes; refresh rebuilds it.
 */

import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { KNOWN_CLIS, type CliDescriptor } from './cli-registry';

export interface DetectedCli {
  id: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  /** Mirrored from registry for UI convenience. */
  needs_env?: string;
  /** True iff `needs_env` is unset (always reachable) OR env var is non-empty. */
  env_set: boolean;
  install_cmd: string;
  stream_format: string;
}

export interface DetectSnapshot {
  scanned_at: string;
  items: DetectedCli[];
}

let cache: DetectSnapshot | null = null;

const VERSION_TIMEOUT_MS = 3000;

/**
 * Locate `bin` on PATH.
 *  - POSIX: `which <bin>`
 *  - Windows: `where <bin>` (returns multiple lines, we take the first)
 *
 * Returns the absolute path string or null. Never throws.
 */
function which(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    const isWin = platform() === 'win32';
    const cmd = isWin ? 'where' : 'which';
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, [bin], { shell: false });
    } catch {
      resolve(null);
      return;
    }

    let out = '';
    child.stdout?.on('data', (b) => {
      out += b.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        const first = out.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0);
        resolve(first ?? null);
      } else {
        resolve(null);
      }
    });
    child.on('error', () => resolve(null));
  });
}

/**
 * Probe `<bin> <versionArg>` with a 3 s timeout. Returns trimmed first line,
 * or null if the probe fails / times out / exits non-zero.
 */
function probeVersion(bin: string, versionArg: string): Promise<string | null> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, [versionArg], { shell: false });
    } catch {
      resolve(null);
      return;
    }

    let out = '';
    let err = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore — child may already be dead
      }
      resolve(null);
    }, VERSION_TIMEOUT_MS);

    const finish = (val: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(val);
    };

    child.stdout?.on('data', (b) => {
      out += b.toString();
    });
    child.stderr?.on('data', (b) => {
      err += b.toString();
    });
    child.on('close', (code) => {
      // Many CLIs print version to stdout; some (older `gh`) print to stderr.
      const combined = (out || err).trim().split(/\r?\n/)[0]?.trim() ?? '';
      // Cap to 200 chars to avoid huge banner output polluting JSON.
      if (code === 0 && combined.length > 0) {
        finish(combined.slice(0, 200));
      } else if (combined.length > 0) {
        // Non-zero exit but we still got output (e.g. some CLIs return 1 on
        // --version). Surface what we have rather than hide it.
        finish(combined.slice(0, 200));
      } else {
        finish(null);
      }
    });
    child.on('error', () => finish(null));
  });
}

async function detectOne(d: CliDescriptor): Promise<DetectedCli> {
  const path = await which(d.binary);
  const version = path ? await probeVersion(d.binary, d.version_arg) : null;
  return {
    id: d.id,
    installed: !!path,
    path,
    version,
    needs_env: d.needs_env,
    env_set: d.needs_env ? !!process.env[d.needs_env] : true,
    install_cmd: d.install_cmd,
    stream_format: d.stream_format,
  };
}

/**
 * Scan all known CLIs in parallel.
 *
 * @param force  bypass cache and re-probe (used by `POST /detect/refresh`)
 */
export async function detectAll(force = false): Promise<DetectSnapshot> {
  if (!force && cache) return cache;
  const items = await Promise.all(KNOWN_CLIS.map(detectOne));
  cache = { scanned_at: new Date().toISOString(), items };
  return cache;
}

/** Synchronous cache peek (used by skill-runner dispatcher to avoid double-await). */
export function peekDetectCache(): DetectSnapshot | null {
  return cache;
}

/** Reset the cache (test-only helper). */
export function __resetDetectCacheForTest(): void {
  cache = null;
}
