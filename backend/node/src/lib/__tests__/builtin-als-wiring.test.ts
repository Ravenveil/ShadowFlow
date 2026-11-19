/**
 * builtin-als-wiring.test.ts — 群聊/DAG 节点 agent 文件工具的根依赖回归。
 *
 * 2026-11-08 — 这条链路此前有两个断点，缺一条 agent 就写不出文件：
 *
 *   1. `registerBuiltinExecutors()` 全仓无调用点 → tool-runner 的模块级注册表
 *      里没有 write_file / read_file / grep…，模型即便调用也只会拿到
 *      "unknown tool"。
 *   2. `ConversationRuntime.runTurn()` 的 `toolRunner.dispatch()` 没有包
 *      `runWithBuiltinContext()` → 执行器读不到 AsyncLocalStorage 里的
 *      workspace，一律返回
 *      "builtin '<name>' invoked outside runWithBuiltinContext scope"。
 *
 * 本文件锁住第 2 点的修复（`RunTurnArgs.workspace` / `allowedTools` 的新增
 * 字段与注入点），并用真执行器写真实临时目录 —— 断言「磁盘上真有那个文件」，
 * 而不是只看 chunk 形状。
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ConversationRuntime, type ApiClient, type AssistantEvent } from '../conversation-runtime';
import { PermissionPolicyV2 } from '../permission-policy-v2';
import { ToolRegistry, type ToolSpec } from '../tool-spec';
import { ToolRunner, registerToolExecutor } from '../tool-runner';
import { builtinTools, registerBuiltinExecutors } from '../tools/builtin';
import type { TurnChunk } from '../../workflow/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 按脚本逐轮回放的 fake ApiClient（每调用一次 stream() 消费一段脚本）。 */
class ScriptedApiClient implements ApiClient {
  private turn = 0;
  constructor(private readonly scripts: AssistantEvent[][]) {}

  async *stream(args: {
    system_prompt: string;
    messages: unknown[];
    tools: ToolSpec[];
    signal: AbortSignal;
  }): AsyncIterable<AssistantEvent> {
    const script = this.scripts[this.turn++];
    if (!script) throw new Error(`ScriptedApiClient: no script for turn ${this.turn - 1}`);
    void args;
    for (const ev of script) {
      if (args.signal.aborted) return;
      yield ev;
    }
  }
}

async function drain(gen: AsyncGenerator<TurnChunk>): Promise<TurnChunk[]> {
  const out: TurnChunk[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

/** 从 builtinTools 里按名字挑真实 spec（带完整 input_schema）。 */
function specOf(name: string): ToolSpec {
  const s = builtinTools.find((t) => t.name === name);
  if (!s) throw new Error(`builtin spec not found: ${name}`);
  return s;
}

function buildRuntime(opts: {
  scripts: AssistantEvent[][];
  toolNames: string[];
  allow: string[];
}): ConversationRuntime {
  const api = new ScriptedApiClient(opts.scripts);
  const registry = new ToolRegistry(opts.toolNames.map(specOf));
  const policy = PermissionPolicyV2.fromAllowedTools(opts.allow);
  return new ConversationRuntime({
    apiClient: api,
    toolRunner: new ToolRunner(registry, policy),
    maxIterations: 4,
  });
}

function toolResultText(chunks: TurnChunk[]): string {
  return chunks
    .filter((c): c is Extract<TurnChunk, { type: 'tool-result' }> => c.type === 'tool-result')
    .map((c) => c.result.output)
    .join('\n');
}

function toolResultIsError(chunks: TurnChunk[]): boolean[] {
  return chunks
    .filter((c): c is Extract<TurnChunk, { type: 'tool-result' }> => c.type === 'tool-result')
    .map((c) => c.result.is_error === true);
}

/** 一段「先调工具、再收尾」的两轮脚本。 */
function twoTurnScript(toolName: string, input: Record<string, unknown>): AssistantEvent[][] {
  return [
    [
      { kind: 'tool_use', id: 'toolu_1', name: toolName, input },
      { kind: 'message_stop', stop_reason: 'tool_use' },
    ],
    [
      { kind: 'text_delta', text: 'done' },
      { kind: 'message_stop', stop_reason: 'end_turn' },
    ],
  ];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('builtin 执行器 ALS workspace 注入', () => {
  beforeAll(() => {
    // 进程内一次（Map set 幂等）—— 等价于 groups-chat.ts 的模块级注册。
    registerBuiltinExecutors(registerToolExecutor);
  });

  it('runTurn(workspace) 下 write_file 真的把文件写到磁盘', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-als-write-'));
    try {
      const runtime = buildRuntime({
        scripts: twoTurnScript('write_file', { path: 'out/note.md', content: 'hello' }),
        toolNames: ['write_file'],
        allow: ['write_file'],
      });

      const chunks = await drain(
        runtime.runTurn({
          system_prompt: 'you can write files',
          user_message: 'write the note',
          history: [],
          signal: new AbortController().signal,
          // 新增字段：工具沙箱根 = 该节点的 worktree / 群 workspace。
          workspace: dir,
          allowedTools: new Set(['write_file']),
        }),
      );

      const target = path.join(dir, 'out', 'note.md');
      expect(fs.existsSync(target)).toBe(true);
      expect(fs.readFileSync(target, 'utf8')).toBe('hello');
      // 执行链路干净：无 error chunk、tool_result 未标记失败。
      expect(chunks.some((c) => c.type === 'error')).toBe(false);
      expect(toolResultIsError(chunks)).toEqual([false]);
      expect(toolResultText(chunks)).not.toContain('outside runWithBuiltinContext scope');
      expect(chunks[chunks.length - 1]?.type).toBe('done');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('不传 workspace/allowedTools 的旧调用仍可用（scope 回退 process.cwd()）', async () => {
    // list_dir 只读且对 cwd 内容不做断言 —— 无论 cwd 是什么（各测试 worker 可能
    // chdir）都以「成功列举」收尾，唯一会失败的情形就是 ALS scope 缺失。
    const runtime = buildRuntime({
      scripts: twoTurnScript('list_dir', { path: '.' }),
      toolNames: ['list_dir'],
      allow: ['list_dir'],
    });

    const chunks = await drain(
      runtime.runTurn({
        system_prompt: 'helper',
        user_message: 'list the root',
        history: [],
        signal: new AbortController().signal,
        // 故意不传 workspace / allowedTools —— 兼容 assembler.ts 等旧调用方。
      }),
    );

    expect(chunks.some((c) => c.type === 'error')).toBe(false);
    expect(toolResultIsError(chunks)).toEqual([false]);
    expect(toolResultText(chunks)).not.toContain('outside runWithBuiltinContext scope');
    expect(chunks[chunks.length - 1]?.type).toBe('done');
  });

  it('allowedTools 透传到执行器（scope 级二道闸生效）', async () => {
    // shell_exec 自己还有一道 allowed-tools 校验：scope 里没有它 → 直接拒绝，
    // 永不 spawn。用它来证明 allowedTools 真被注入（而不是只注入了 workspace）。
    const runtime = buildRuntime({
      scripts: twoTurnScript('shell_exec', { command: 'echo hi' }),
      toolNames: ['shell_exec'],
      allow: ['shell_exec'], // policy 放行，检验的是执行器自身那道闸
    });

    const chunks = await drain(
      runtime.runTurn({
        system_prompt: 'helper',
        user_message: 'run something',
        history: [],
        signal: new AbortController().signal,
        workspace: os.tmpdir(),
        allowedTools: new Set(['read_file', 'write_file']),
      }),
    );

    expect(toolResultIsError(chunks)).toEqual([true]);
    expect(toolResultText(chunks)).toContain('not present in');
  });
});
