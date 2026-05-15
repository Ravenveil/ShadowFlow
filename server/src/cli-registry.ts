/**
 * cli-registry.ts — Static registry of known AI CLIs (Story 15.19 v2)
 *
 * The registry is the single source of truth for:
 *   - which binaries we probe on PATH (`cli-detector.ts`)
 *   - how to invoke each CLI from the spawn bridge (`skill-runners/cli.ts`)
 *   - which line-stream parser to use to normalize stdout into ShadowFlow's
 *     `<sf:*>` text-protocol (`parsers/cli-streams/index.ts`)
 *
 * Adding a new CLI = one entry here + (optionally) one parser in
 * `parsers/cli-streams/`. No other file needs to change.
 */

export type StreamFormat =
  | 'claude-stream-json'
  | 'codex-stream-json'
  | 'gh-copilot'
  | 'plain-line'
  | 'cursor-acp';

export interface CliDescriptor {
  /** Stable id used in `executor: cli:<id>` skill frontmatter. */
  id: string;
  /** Binary name on PATH. Probed via `which` (POSIX) / `where` (Windows). */
  binary: string;
  /** Argument that prints version + exits — used during detection. */
  version_arg: string;
  /** Optional env var that must be set before the CLI is usable. */
  needs_env?: string;
  /** Human-readable installation hint shown in the UI when missing. */
  install_cmd: string;
  /** Selects the stdout parser. */
  stream_format: StreamFormat;
  /** Extra args to spawn the CLI with (prompt is sent via stdin). */
  extra_args?: string[];
  /** Alternative binary names tried if primary `binary` not found on PATH. */
  fallback_bins?: string[];
  /** Maps "--flag-string" → "camelCaseKey"; detector scans --help output for each. */
  capability_flags?: Record<string, string>;
  /** Static model IDs shown in UI when dynamic fetch unavailable. */
  fallback_models?: string[];
  /** Short human-readable auth note shown in the UI. */
  auth_hint?: string;
}

/**
 * 20 known AI CLIs (AC-2). Order matters for `cli:auto` — first detected wins.
 */
export const KNOWN_CLIS: CliDescriptor[] = [
  {
    id: 'claude',
    binary: 'claude',
    version_arg: '--version',
    // 2026-05-11 — local `claude login` is the primary auth path for the CLI;
    // ANTHROPIC_API_KEY env is a fallback. The CLI manages its own credential
    // store, so the daemon does NOT need a sk-ant- key in ShadowFlow settings
    // when the user picks executor=cli:claude.
    needs_env: undefined,
    install_cmd: 'npm i -g @anthropic-ai/claude-cli',
    stream_format: 'claude-stream-json',
    // 2026-05-11 bug fix — align with OpenDesign's verified spawn args
    // (nexu-io/open-design apps/daemon/src/agents.ts):
    //   • `--verbose` REQUIRED so stream-json mode emits per-token deltas;
    //     without it the parser sees nothing until EOF and SSE looks hung.
    //   • `--permission-mode bypassPermissions` REQUIRED so claude doesn't
    //     pause for "Y/N" tool prompts; without it the child hangs on stdin
    //     and the front-end reconnects forever.
    //   • `-p` (short form of --print) keeps the child non-interactive.
    extra_args: [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--permission-mode', 'bypassPermissions',
    ],
    fallback_bins: ['openclaude'],
    capability_flags: {
      '--permission-mode': 'permissionMode',
      '--output-format': 'outputFormat',
      '--verbose': 'verbose',
      '--model': 'model',
    },
    fallback_models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
    auth_hint: 'Run `claude login`',
  },
  {
    id: 'codex',
    binary: 'codex',
    version_arg: '--version',
    needs_env: 'OPENAI_API_KEY',
    install_cmd: 'npm i -g @openai/codex',
    stream_format: 'codex-stream-json',
    extra_args: ['--stream'],
    fallback_bins: [],
    capability_flags: {
      '--stream': 'stream',
      '--model': 'model',
      '--no-project-doc': 'noProjectDoc',
    },
    fallback_models: ['o4-mini', 'o3', 'gpt-4o'],
    auth_hint: 'Set OPENAI_API_KEY env var',
  },
  {
    id: 'gh-copilot',
    binary: 'gh',
    version_arg: '--version',
    install_cmd: 'gh extension install github/gh-copilot',
    stream_format: 'gh-copilot',
    // gh extensions read prompt from argv; we still pipe via stdin and pass `-`.
    extra_args: ['copilot', 'suggest', '-t', 'shell', '-'],
    fallback_bins: ['gh'],
    capability_flags: {
      '--model': 'model',
    },
    fallback_models: ['gpt-4o', 'claude-sonnet-4-6'],
    auth_hint: 'Run `gh auth login`',
  },
  {
    id: 'gemini',
    binary: 'gemini',
    version_arg: '--version',
    needs_env: 'GEMINI_API_KEY',
    install_cmd: 'npm i -g @google/gemini-cli',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {
      '--model': 'model',
      '--sandbox': 'sandbox',
    },
    fallback_models: ['gemini-2.5-pro', 'gemini-2.0-flash'],
    auth_hint: 'Set GEMINI_API_KEY env var',
  },
  {
    id: 'openclaw',
    binary: 'openclaw',
    version_arg: '--version',
    install_cmd: 'npm i -g openclaw',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {
      '--model': 'model',
      '--stream': 'stream',
    },
    fallback_models: ['openclaw-default'],
    auth_hint: 'See openclaw docs',
  },
  {
    id: 'cursor-agent',
    binary: 'cursor-agent',
    version_arg: '--version',
    install_cmd: '参见 cursor.com/cli',
    stream_format: 'cursor-acp', // Phase C — falls through to plain-line in dispatcher; full ACP parser is Story 15.23.
    fallback_bins: [],
    capability_flags: {},
    fallback_models: ['cursor-small', 'gpt-4o'],
    auth_hint: 'Sign in via Cursor app',
  },
  {
    id: 'qwen-coder',
    binary: 'qwen-coder',
    version_arg: '--version',
    needs_env: 'DASHSCOPE_API_KEY',
    install_cmd: 'npm i -g qwen-coder-cli',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {
      '--model': 'model',
    },
    fallback_models: ['qwen-coder-32b'],
    auth_hint: 'Set DASHSCOPE_API_KEY env var',
  },
  {
    id: 'cline',
    binary: 'cline',
    version_arg: '--version',
    install_cmd: 'npm i -g cline',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {},
    fallback_models: [],
    auth_hint: 'Configure via VS Code extension',
  },
  {
    id: 'aider',
    binary: 'aider',
    version_arg: '--version',
    needs_env: 'OPENAI_API_KEY',
    install_cmd: 'pip install aider-chat',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {
      '--model': 'model',
      '--stream': 'stream',
    },
    fallback_models: ['gpt-4o', 'claude-sonnet-4-6'],
    auth_hint: 'Set OPENAI_API_KEY or ANTHROPIC_API_KEY',
  },
  {
    id: 'cursor',
    binary: 'cursor',
    version_arg: '--version',
    install_cmd: '从 cursor.com 下载',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {},
    fallback_models: [],
    auth_hint: 'Sign in via Cursor app',
  },
  {
    id: 'windsurf-cli',
    binary: 'windsurf',
    version_arg: '--version',
    install_cmd: '从 windsurf 官网下载',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {},
    fallback_models: [],
    auth_hint: 'Sign in via Windsurf app',
  },
  {
    id: 'devin',
    binary: 'devin',
    version_arg: '--version',
    install_cmd: 'npm i -g @cognition/devin',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {},
    fallback_models: [],
    auth_hint: 'Set DEVIN_API_KEY env var',
  },
  {
    id: 'hermes',
    binary: 'hermes',
    version_arg: '--version',
    install_cmd: '参见 hermes 官方文档',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {
      '--model': 'model',
    },
    fallback_models: [],
    auth_hint: 'See hermes docs',
  },
  {
    id: 'kimi',
    binary: 'kimi',
    version_arg: '--version',
    needs_env: 'MOONSHOT_API_KEY',
    install_cmd: 'npm i -g kimi-cli',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {
      '--model': 'model',
    },
    fallback_models: ['kimi-latest'],
    auth_hint: 'Set MOONSHOT_API_KEY env var',
  },
  {
    id: 'qoder',
    binary: 'qoder',
    version_arg: '--version',
    install_cmd: 'npm i -g qoder',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {},
    fallback_models: [],
    auth_hint: 'See qoder docs',
  },
  {
    id: 'pi',
    binary: 'pi',
    version_arg: '--version',
    install_cmd: 'npm i -g pi-cli',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {},
    fallback_models: [],
    auth_hint: 'See pi docs',
  },
  {
    id: 'kiro',
    binary: 'kiro',
    version_arg: '--version',
    install_cmd: 'npm i -g @aws/kiro',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {
      '--model': 'model',
    },
    fallback_models: [],
    auth_hint: 'Sign in via kiro CLI',
  },
  {
    id: 'kilo',
    binary: 'kilo',
    version_arg: '--version',
    install_cmd: 'npm i -g kilo',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {},
    fallback_models: [],
    auth_hint: 'See kilo docs',
  },
  {
    id: 'vibe',
    binary: 'vibe',
    version_arg: '--version',
    needs_env: 'MISTRAL_API_KEY',
    install_cmd: 'npm i -g @mistralai/vibe-cli',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {
      '--model': 'model',
    },
    fallback_models: [],
    auth_hint: 'Set MISTRAL_API_KEY env var',
  },
  {
    id: 'deepseek-tui',
    binary: 'deepseek',
    version_arg: '--version',
    needs_env: 'DEEPSEEK_API_KEY',
    install_cmd: 'pip install deepseek-tui',
    stream_format: 'plain-line',
    fallback_bins: [],
    capability_flags: {
      '--model': 'model',
    },
    fallback_models: [],
    auth_hint: 'Set DEEPSEEK_API_KEY env var',
  },
];

/** Lookup helper — `undefined` for unknown ids. */
export function findCli(id: string): CliDescriptor | undefined {
  return KNOWN_CLIS.find((c) => c.id === id);
}
