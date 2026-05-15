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
  /** Probed capability flags — only present when installed and flags defined. */
  capabilities?: Record<string, boolean>;
  /** Static fallback model list from registry. */
  fallback_models?: string[];
  /** Short auth note from registry. */
  auth_hint?: string;
}

export interface DetectSnapshot {
  scanned_at: string;
  items: DetectedCli[];
}

let cache: DetectSnapshot | null = null;

const VERSION_TIMEOUT_MS = 3000;
const CAPABILITY_TIMEOUT_MS = 5000;

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
 * Discriminated union distinguishing "binary not invocable at all" from
 * "invocable but produced no parseable version string".
 *
 * Ghost-shim fix: exit codes 126 (permission denied by shell) and 127
 * (command not found by shell) are treated as non-invocable even when
 * `which` returned a path — the shim file exists but cannot execute.
 */
type VersionProbeOutcome =
  | { invocable: false }
  | { invocable: true; version: string | null };

/**
 * Probe `<bin> <versionArg>` with a VERSION_TIMEOUT_MS timeout.
 *
 * Returns:
 *   { invocable: false }              — binary exists on PATH but is a dead shim
 *   { invocable: true, version: str } — ran successfully, version string found
 *   { invocable: true, version: null} — ran but produced no parseable version
 */
function probeVersion(bin: string, versionArg: string): Promise<VersionProbeOutcome> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, [versionArg], { shell: false });
    } catch (spawnErr) {
      // spawn() itself threw — treat as non-invocable.
      resolve({ invocable: false });
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
      // Timeout: the binary is reachable (it started) but unresponsive.
      resolve({ invocable: true, version: null });
    }, VERSION_TIMEOUT_MS);

    const finish = (outcome: VersionProbeOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };

    child.stdout?.on('data', (b) => {
      out += b.toString();
    });
    child.stderr?.on('data', (b) => {
      err += b.toString();
    });

    child.on('close', (code) => {
      // Ghost-shim detection: exit 126 = not executable, 127 = not found.
      if (code === 126 || code === 127) {
        finish({ invocable: false });
        return;
      }

      // Many CLIs print version to stdout; some (older `gh`) print to stderr.
      const combined = (out || err).trim().split(/\r?\n/)[0]?.trim() ?? '';
      // Cap to 200 chars to avoid huge banner output polluting JSON.
      if (code === 0 && combined.length > 0) {
        finish({ invocable: true, version: combined.slice(0, 200) });
      } else if (combined.length > 0) {
        // Non-zero exit but we still got output (e.g. some CLIs return 1 on
        // --version). Surface what we have rather than hide it.
        finish({ invocable: true, version: combined.slice(0, 200) });
      } else {
        finish({ invocable: true, version: null });
      }
    });

    child.on('error', (spawnErr: NodeJS.ErrnoException) => {
      // ENOENT / EACCES / ENOTDIR → the binary is not actually executable.
      if (
        spawnErr.code === 'ENOENT' ||
        spawnErr.code === 'EACCES' ||
        spawnErr.code === 'ENOTDIR'
      ) {
        finish({ invocable: false });
      } else {
        // Other OS errors (e.g. EMFILE) — binary probably works, we just
        // couldn't spawn right now.
        finish({ invocable: true, version: null });
      }
    });
  });
}

/**
 * Spawn `bin --help` and scan its combined stdout+stderr for the presence of
 * each flag key. Returns a map of camelCase capability keys → boolean.
 *
 * Only called for installed CLIs with non-empty `capability_flags`.
 */
async function probeCapabilities(
  bin: string,
  flags: Record<string, string>,
  timeoutMs = CAPABILITY_TIMEOUT_MS,
): Promise<Record<string, boolean>> {
  const entries = Object.entries(flags);
  if (entries.length === 0) return {};

  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, ['--help'], { shell: false });
    } catch {
      resolve({});
      return;
    }

    let out = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      resolve(buildResult(out));
    }, timeoutMs);

    const finish = (combined: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(buildResult(combined));
    };

    const buildResult = (combined: string): Record<string, boolean> => {
      const result: Record<string, boolean> = {};
      for (const [flag, key] of entries) {
        result[key] = combined.includes(flag);
      }
      return result;
    };

    child.stdout?.on('data', (b) => { out += b.toString(); });
    child.stderr?.on('data', (b) => { out += b.toString(); });
    child.on('close', () => finish(out));
    child.on('error', () => finish(out));
  });
}

async function detectOne(d: CliDescriptor): Promise<DetectedCli> {
  const resolvedPath = await which(d.binary);
  let installed = !!resolvedPath;
  let path: string | null = resolvedPath;
  let version: string | null = null;

  if (resolvedPath) {
    const outcome = await probeVersion(d.binary, d.version_arg);
    if (!outcome.invocable) {
      // Ghost shim: which() found a file but it cannot actually execute.
      installed = false;
      path = null;
    } else {
      version = outcome.version;
    }
  }

  // Probe capability flags only for genuinely installed CLIs.
  let capabilities: Record<string, boolean> | undefined;
  if (installed && d.capability_flags && Object.keys(d.capability_flags).length > 0) {
    capabilities = await probeCapabilities(d.binary, d.capability_flags);
  }

  return {
    id: d.id,
    installed,
    path,
    version,
    needs_env: d.needs_env,
    env_set: d.needs_env ? !!process.env[d.needs_env] : true,
    install_cmd: d.install_cmd,
    stream_format: d.stream_format,
    ...(capabilities !== undefined ? { capabilities } : {}),
    ...(d.fallback_models !== undefined ? { fallback_models: d.fallback_models } : {}),
    ...(d.auth_hint !== undefined ? { auth_hint: d.auth_hint } : {}),
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
