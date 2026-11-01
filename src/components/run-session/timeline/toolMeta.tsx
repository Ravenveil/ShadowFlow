/**
 * toolMeta — 工具名 → 友好标签 + 类别图标（gap #3：对齐 Hermes toolMeta.tsx）。
 *
 * 运行时工具卡（ToolCallChip）拿到的是原始工具名（read_file / Bash /
 * mcp__server__fetch …）。这里把它映射成：
 *   - 人类可读标签：humanizeToolName('execute_code') → 'Execute Code'
 *   - 类别图标 key：iconKeyForTool('read_file') → 'file' → lucide 图标
 * 移植自 fathah/hermes-desktop src/renderer/src/components/toolMeta.tsx
 * （精确名映射 + 关键词回退），图标改用 lucide-react 单色线性（禁 emoji）。
 */
import {
  Globe, Terminal, FileText, Code2, Eye, Image as ImageIcon, Film, Volume2,
  Sparkles, Brain, Search, HelpCircle, Users, Clock, Layers, ListTodo,
  MonitorSmartphone, Wrench, type LucideIcon,
} from 'lucide-react';

// 类别 key → lucide 图标（与 Hermes 的 toolset key 对齐）。
const ICON_BY_KEY: Record<string, LucideIcon> = {
  web: Globe,
  x_search: Search,
  browser: MonitorSmartphone,
  terminal: Terminal,
  file: FileText,
  code_execution: Code2,
  computer_use: MonitorSmartphone,
  vision: Eye,
  image_gen: ImageIcon,
  video_gen: Film,
  tts: Volume2,
  skills: Sparkles,
  memory: Brain,
  session_search: Search,
  clarify: HelpCircle,
  delegation: Users,
  cronjob: Clock,
  moa: Layers,
  todo: ListTodo,
};

// 精确工具名 → 类别 key（移植 Hermes TOOL_NAME_TO_KEY）。
const TOOL_NAME_TO_KEY: Record<string, string> = {
  execute_code: 'code_execution', run_code: 'code_execution', python: 'code_execution',
  terminal: 'terminal', bash: 'terminal', shell: 'terminal', run_command: 'terminal',
  clarify: 'clarify',
  web_search: 'web', web_fetch: 'web', fetch: 'web',
  browse: 'browser',
  read_file: 'file', write_file: 'file', edit_file: 'file', list_files: 'file', delete_file: 'file',
  read: 'file', write: 'file', edit: 'file', glob: 'file', grep: 'web',
  generate_image: 'image_gen', generate_video: 'video_gen', speak: 'tts',
  remember: 'memory', recall: 'memory', search_sessions: 'session_search',
  delegate: 'delegation', spawn_agent: 'delegation', task: 'delegation',
  schedule: 'cronjob',
};

// 子串关键词回退（无精确匹配时，按长度/特异度排序）。移植 Hermes KEYWORD_TO_KEY。
const KEYWORD_TO_KEY: ReadonlyArray<readonly [string, string]> = [
  ['terminal', 'terminal'], ['command', 'terminal'], ['shell', 'terminal'], ['bash', 'terminal'],
  ['clarif', 'clarify'], ['browser', 'browser'], ['session', 'session_search'],
  ['image', 'image_gen'], ['video', 'video_gen'], ['vision', 'vision'],
  ['memory', 'memory'], ['remember', 'memory'], ['delegat', 'delegation'], ['agent', 'delegation'],
  ['cron', 'cronjob'], ['schedul', 'cronjob'], ['todo', 'todo'], ['skill', 'skills'],
  ['speak', 'tts'], ['tts', 'tts'], ['code', 'code_execution'], ['exec', 'code_execution'],
  ['python', 'code_execution'], ['file', 'file'], ['read', 'file'], ['write', 'file'],
  ['edit', 'file'], ['fetch', 'web'], ['search', 'web'], ['web', 'web'],
];

/** 工具名 → 类别 key（''=未知）。剥 MCP 'server__tool' 前缀。 */
export function iconKeyForTool(toolName: string): string {
  const base = (toolName.includes('__') ? toolName.split('__').pop()! : toolName).trim().toLowerCase();
  if (TOOL_NAME_TO_KEY[base]) return TOOL_NAME_TO_KEY[base];
  for (const [kw, key] of KEYWORD_TO_KEY) if (base.includes(kw)) return key;
  return '';
}

/** 'execute_code' → 'Execute Code'；剥 MCP 'server__' 前缀、拆 snake/camel。 */
export function humanizeToolName(toolName: string): string {
  const base = toolName.includes('__') ? toolName.split('__').pop()! : toolName;
  const words = base
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return toolName;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** 工具名对应的 lucide 图标组件（未知→ Wrench 兜底）。 */
export function toolIconFor(toolName: string): LucideIcon {
  return ICON_BY_KEY[iconKeyForTool(toolName)] ?? Wrench;
}
