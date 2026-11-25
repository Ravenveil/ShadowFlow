/**
 * cli.test.ts — Real spawn pipeline test (Story 15.19 v2)
 *
 * Run from server/:  npx tsx src/skill-runners/cli.test.ts
 *
 * "先别模拟了，能真实跑就行" — this test really spawns a child process and
 * exercises the entire spawn → stdin → stdout → exit → SIGTERM/SIGKILL chain.
 *
 * We use `node --version` (guaranteed to be present since we run under tsx).
 * For the abort path we use `node -e "setInterval(()=>{},1000)"` which sits
 * idle until killed.
 */

import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { dispatchSkillRunner } from './index';
import type { RunnerInput } from './types';
import { runCliSpawn } from './cli';
import { KNOWN_CLIS, type CliDescriptor } from '../../../../detectors/cli-registry';
import { parsePlainLine } from '../../cli-parsers/cli-streams/plain-line';
import type { SseEvent } from '../../cli-parsers/parser.ts';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

let passCount = 0;
let failCount = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passCount++;
    console.log(`  PASS  ${label}`);
  } else {
    failCount++;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log('        detail:', detail);
  }
}

const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-cli-test-'));
const noopArtifact = () => {};

async function main(): Promise<void> {
  // ─── 1. RAW SPAWN — verify primitives ──────────────────────────────────────
  console.log('\n── raw spawn primitives (`node --version`) ──');
  await new Promise<void>((resolve) => {
    const child = spawn('node', ['--version'], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout?.on('data', (b) => (out += b.toString()));
    child.on('close', (code) => {
      check('node --version exits 0', code === 0, code);
      check('node --version prints v<N>', /^v\d+/.test(out.trim()), out);
      resolve();
    });
    child.on('error', () => {
      check('node --version spawned without error', false);
      resolve();
    });
  });

  // ─── 2. STDIN PIPE — verify prompt-via-stdin works ─────────────────────────
  console.log('\n── stdin pipe roundtrip ──');
  await new Promise<void>((resolve) => {
    const child = spawn('node', ['-e', 'let d=""; process.stdin.on("data", c=>d+=c); process.stdin.on("end", ()=>{ process.stdout.write("ECHO:"+d); });'], {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout?.on('data', (b) => (out += b.toString()));
    child.stdin?.end('hello-from-test\n');
    child.on('close', () => {
      check('stdin pipe delivers prompt', out.includes('ECHO:hello-from-test'), out);
      resolve();
    });
  });

  // ─── 3. PARSER through real stdout — feed a node script that emits sf tags ──
  console.log('\n── plain-line parser with real child stdout ──');
  const sfText = '<sf:classify output_type="answer" mode="single" confidence="0.9" complexity="1"/>OK<sf:complete redirect="/editor"/>';
  const child = spawn(
    'node',
    ['-e', `process.stdout.write(${JSON.stringify(sfText)});`],
    { shell: false, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  if (!child.stdout) {
    check('child has stdout', false);
  } else {
    const events: SseEvent[] = [];
    for await (const evt of parsePlainLine(child.stdout, 'sess-real-1', noopArtifact)) {
      events.push(evt);
    }
    check('parser yields classify from real spawn', events.some((e) => e.event === 'classify'));
    check('parser yields complete from real spawn', events.some((e) => e.event === 'complete'));
  }

  // ─── 4. ABORT → SIGTERM → SIGKILL chain (with reduced grace for test speed) ──
  console.log('\n── abort signal → kill chain ──');
  await new Promise<void>((resolve) => {
    // Idle child: blocks forever
    const child = spawn(
      'node',
      ['-e', 'setInterval(()=>{},1000); process.stdout.write("ALIVE\\n");'],
      { shell: false, stdio: ['pipe', 'pipe', 'pipe'] },
    );

    let exited = false;
    let exitSignal: NodeJS.Signals | null = null;
    let exitCode: number | null = null;
    child.on('close', (code, sig) => {
      exited = true;
      exitCode = code;
      exitSignal = sig;
    });

    setTimeout(() => {
      child.kill('SIGTERM');
      // After 500ms (test-only grace), force kill if still alive
      setTimeout(() => {
        if (!exited) child.kill('SIGKILL');
      }, 500);
    }, 200);

    setTimeout(() => {
      check('idle child terminated by signal', exited, { exitCode, exitSignal });
      resolve();
    }, 1500);
  });

  // ─── 5. dispatchSkillRunner — anthropic-direct path with no key emits NO_API_KEY ──
  console.log('\n── dispatcher: anthropic-direct without key ──');
  const savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  {
    const input: RunnerInput = {
      system_prompt: 'sys',
      prompt: 'goal',
      session_id: 'sess-disp-1',
      cwd: tmpCwd,
    };
    const events: SseEvent[] = [];
    for await (const evt of dispatchSkillRunner('anthropic-direct', input)) {
      events.push(evt);
      if (events.length > 5) break;
    }
    check(
      'anthropic-direct without key yields NO_API_KEY error',
      events.some((e) => e.event === 'error' && (e.data as { code?: string }).code === 'NO_API_KEY'),
    );
  }
  if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;

  // ─── 6. dispatchSkillRunner — cli:nonexistent yields CLI_NOT_REGISTERED ──
  console.log('\n── dispatcher: cli:nonexistent → CLI_NOT_REGISTERED ──');
  {
    const input: RunnerInput = {
      system_prompt: 'sys',
      prompt: 'goal',
      session_id: 'sess-disp-2',
      cwd: tmpCwd,
    };
    const events: SseEvent[] = [];
    for await (const evt of dispatchSkillRunner('cli:totally-not-a-real-cli', input)) {
      events.push(evt);
      if (events.length > 5) break;
    }
    check(
      'cli:totally-not-a-real-cli emits CLI_NOT_REGISTERED',
      events.some((e) => e.event === 'error' && (e.data as { code?: string }).code === 'CLI_NOT_REGISTERED'),
    );
  }

  // ─── 7. dispatchSkillRunner — unknown executor scheme ──
  console.log('\n── dispatcher: weird-scheme: → EXECUTOR_UNKNOWN ──');
  {
    const input: RunnerInput = {
      system_prompt: 'sys',
      prompt: 'goal',
      session_id: 'sess-disp-3',
      cwd: tmpCwd,
    };
    const events: SseEvent[] = [];
    for await (const evt of dispatchSkillRunner('weird-scheme:foo', input)) {
      events.push(evt);
      if (events.length > 5) break;
    }
    check(
      'unknown scheme emits EXECUTOR_UNKNOWN',
      events.some((e) => e.event === 'error' && (e.data as { code?: string }).code === 'EXECUTOR_UNKNOWN'),
    );
  }

  // ─── 8. dispatchSkillRunner — acp: → runAcpExecutor（Story 15.23 已实现） ──
  console.log('\n── dispatcher: acp: → ACP_UNREACHABLE（目标未注册） ──');
  {
    const input: RunnerInput = {
      system_prompt: 'sys',
      prompt: 'goal',
      session_id: 'sess-disp-4',
      cwd: tmpCwd,
    };
    const events: SseEvent[] = [];
    for await (const evt of dispatchSkillRunner('acp:cursor', input)) {
      events.push(evt);
      if (events.length > 5) break;
    }
    // acp: 早已不是占位符（Story 15.23 起接 runAcpExecutor）：目标不在
    // 注册表（registry 只有 hermes/shadowsoul）→ 结构化 ACP_UNREACHABLE。
    const err = events.find((e) => e.event === 'error')?.data as { code?: string } | undefined;
    check('acp: 未注册目标 → ACP_UNREACHABLE', err?.code === 'ACP_UNREACHABLE');
    check(
      'acp: 不再返回 EXECUTOR_NOT_IMPLEMENTED',
      !events.some(
        (e) => e.event === 'error' && (e.data as { code?: string }).code === 'EXECUTOR_NOT_IMPLEMENTED',
      ),
    );
  }

  // ─── 9. runCliSpawn unknown id → CLI_UNKNOWN ──
  console.log('\n── runCliSpawn unknown id ──');
  {
    const events: SseEvent[] = [];
    for await (const evt of runCliSpawn(
      { system_prompt: 's', prompt: 'p', session_id: 'sess-spawn-1', cwd: tmpCwd },
      'no-such-cli',
    )) {
      events.push(evt);
      if (events.length > 5) break;
    }
    check(
      'runCliSpawn yields CLI_UNKNOWN for unregistered id',
      events.some((e) => e.event === 'error' && (e.data as { code?: string }).code === 'CLI_UNKNOWN'),
    );
  }

  // ─── 10-12. 管线型 CLI 描述符开关（bare_prompt / env_defaults / argv stdin EOF）──
  // 真机 spawn `node -e <script>`：注册一条临时描述符（KNOWN_CLIS 追加，收尾
  // 删除），断言只看子进程实际收到的 argv / env / stdin 行为。
  console.log('\n── cli descriptor switches (bare_prompt / env_defaults / argv stdin) ──');
  const TEST_CLI_IDS: string[] = [];
  function registerTestCli(desc: Omit<CliDescriptor, 'version_arg' | 'install_cmd' | 'stream_format'> & Partial<CliDescriptor>): CliDescriptor {
    const full: CliDescriptor = {
      version_arg: '--version',
      install_cmd: 'test-only',
      stream_format: 'plain-line',
      ...desc,
    };
    KNOWN_CLIS.push(full);
    TEST_CLI_IDS.push(full.id);
    return full;
  }

  /** 驱动 runCliSpawn 直到子进程收尾；超时则 abort（避免用例挂死）。 */
  async function drainCli(
    cliId: string,
    overrides: Partial<RunnerInput>,
    timeoutMs = 8000,
  ): Promise<SseEvent[]> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const events: SseEvent[] = [];
    try {
      for await (const evt of runCliSpawn(
        {
          system_prompt: 'PERSONA-SHOULD-BE-IGNORED',
          prompt: 'TOPIC-ABC',
          session_id: 'sess-cli-switch',
          cwd: tmpCwd,
          signal: ac.signal,
          ...overrides,
        },
        cliId,
      )) {
        events.push(evt);
      }
    } finally {
      clearTimeout(timer);
    }
    return events;
  }

  const textOf = (events: SseEvent[]): string =>
    events
      .filter((e) => e.event === 'text')
      .map((e) => (e.data as { text?: string }).text ?? '')
      .join('');

  // 10. bare_prompt：prompt 原样进 argv，system_prompt 不参与。
  // 注：测试二进制是 node，`-topic` 这类单横线参数会被 node 当未知选项拒收，
  // 故这里用不带横线的 argv flag（registration 侧的拼法由 prompt_mode 决定，
  // 与本用例要验的 bare_prompt 无关）。
  registerTestCli({
    id: 'sf-test-bare',
    binary: 'node',
    extra_args: ['-e', 'process.stdout.write("ARGV:" + process.argv.slice(1).join("|"));'],
    prompt_mode: 'argv-TOPIC',
    bare_prompt: true,
  });
  {
    const out = textOf(await drainCli('sf-test-bare', {}));
    check('bare_prompt: argv 收到原始 prompt', out.includes('ARGV:TOPIC|TOPIC-ABC'), out);
    check('bare_prompt: 不出现 User goal 前缀', !out.includes('User goal:'), out);
    check('bare_prompt: 不注入 system_prompt', !out.includes('PERSONA-SHOULD-BE-IGNORED'), out);
  }

  // 11. env_defaults 生效，且 input.env 可覆盖。
  registerTestCli({
    id: 'sf-test-env',
    binary: 'node',
    extra_args: ['-e', 'process.stdout.write("ENV:" + (process.env.SF_TEST_ENV || "unset"));'],
    env_defaults: { SF_TEST_ENV: 'from-default' },
  });
  {
    const def = textOf(await drainCli('sf-test-env', {}));
    check('env_defaults: 默认值传入子进程', def.includes('ENV:from-default'), def);
    const over = textOf(await drainCli('sf-test-env', { env: { SF_TEST_ENV: 'overridden' } }));
    check('env_defaults: input.env 覆盖默认值', over.includes('ENV:overridden'), over);
  }

  // 12. argv 模式也必须 end stdin：子进程等到 stdin EOF 才输出/退出。
  registerTestCli({
    id: 'sf-test-stdin-eof',
    binary: 'node',
    extra_args: [
      '-e',
      'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>process.stdout.write("STDIN_EOF:" + (d.length ? "HAS_DATA" : "EMPTY")));',
    ],
    prompt_mode: 'argv-TOPIC',
    bare_prompt: true,
  });
  {
    const events = await drainCli('sf-test-stdin-eof', {});
    const out = textOf(events);
    check('argv 模式 stdin 被 end（子进程收到 EOF 并退出）', out.includes('STDIN_EOF:EMPTY'), out);
    check(
      'argv 模式未被当成超时 kill（子进程正常退出）',
      !events.some((e) => e.event === 'error'),
      events.filter((e) => e.event === 'error'),
    );
  }

  for (const id of TEST_CLI_IDS) {
    const idx = KNOWN_CLIS.findIndex((c) => c.id === id);
    if (idx >= 0) KNOWN_CLIS.splice(idx, 1);
  }

  // Clean up tmp
  try {
    fs.rmSync(tmpCwd, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  console.log(`\n────────────────────────────────────────────`);
  console.log(`Total: ${passCount + failCount} | PASS: ${passCount} | FAIL: ${failCount}`);
  if (failCount > 0) process.exit(1);
}

// Suppress unused warning for Readable
void Readable;

main().catch((err) => {
  console.error('test crashed:', err);
  process.exit(1);
});
