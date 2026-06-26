/**
 * studioTokens — Studio 组件共享的小工具（颜色分段、ext→语言等），2026-06-24。
 * 纯函数，无副作用，供 polish / right-files owner 复用。
 */

/**
 * 选中 executor/model（localStorage sf.defaultExecutor / sf.model）→ 上下文窗口大小（tokens）。
 * 与 hermes ContextGauge 同思路：用「模型族」推窗口，没命中给一个保守默认。
 * 纯启发式（无后端 registry 时的最佳近似），polish owner 与 right-files owner 可复用。
 */
export function modelContextWindow(executor: string | null, model: string | null): number {
  const s = `${executor ?? ''} ${model ?? ''}`.toLowerCase();
  // 顺序敏感：更具体的族优先。
  if (/gemini|1m|1000000|1048576/.test(s)) return 1_000_000;
  if (/claude|sonnet|opus|haiku/.test(s)) return 200_000;
  if (/gpt-4o|gpt-4\.1|o1|o3|gpt-5|128k|128000/.test(s)) return 128_000;
  if (/deepseek|qwen|glm|kimi|moonshot/.test(s)) return 128_000;
  if (/gpt-3\.5|16k|16000/.test(s)) return 16_000;
  return 128_000; // 保守默认：大多数现代模型 ≥128k。
}

/** 读 localStorage 当前选中的 executor/model 推上下文窗口（StudioChat token gauge 用）。 */
export function currentModelWindow(): number {
  try {
    const exec = localStorage.getItem('sf.defaultExecutor');
    const model = localStorage.getItem('sf.model');
    return modelContextWindow(exec, model);
  } catch {
    return 128_000;
  }
}

/**
 * 粗略 token 估算（无后端 usage 时的近似）：英文/代码 ~4 字符/token，
 * CJK ~1.6 字符/token。混排时取加权和，作为 contextTokens 的本地近似。
 * 一旦 chat-unify owner 接入真实 usage.contextTokens，调用方改用真实值即可。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // CJK 统一表意 + 假名 + 谚文常见区段。
    if (
      (code >= 0x3040 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff)
    ) {
      cjk += 1;
    }
  }
  const ascii = text.length - cjk;
  return Math.ceil(ascii / 4 + cjk / 1.6);
}

/** 文件扩展名 → highlight.js 语言名（右栏 FileViewer 后续接语法高亮用）。 */
export function extToLang(ext: string): string {
  const e = ext.replace(/^\./, '').toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'xml',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'bash',
    sql: 'sql',
  };
  return map[e] ?? 'plaintext';
}
