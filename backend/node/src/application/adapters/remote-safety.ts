/**
 * remote-safety.ts — 本地/远端命令安全闸（2026-11-20 自 shell-exec.ts 抽出）。
 *
 * 抽出动机：远端执行（SSH）与本地 shell_exec 面对的是同一类破坏性原语（sudo /
 * rm -rf / curl|sh / 写 /etc …），但远端还要额外挡住「在共享集群上装包 / 往别的
 * 机器横向跳 / 把 token 打出来 / 把数据外带」。把这些规则放一处，两条执行路径
 * 共用一张表 —— 将来给任何一条加规则，另一条不会漏。
 *
 * 三层：
 *   1. `BLOCKED_PATTERNS`     — 本地/远端共用的基线表。**逐字搬自 shell-exec.ts**
 *                               （行为零变化，纯重构）。
 *   2. `REMOTE_ONLY_BLOCKED`  — 仅远端叠加：集群事故源（包管理、git push）、
 *                               越权横向（ssh/scp/rsync 跳机器）、外带
 *                               （curl -T / nc / socat）、凭据泄露（env/printenv）。
 *   3. `assertInsideRemoteDir`— 远端路径钉死：拒绝绝对路径 / `..` / `~`。
 *
 * 一个刻意的取舍：远端**放行**集群调度器（sbatch / srun / squeue / scancel），
 * 因为「在 GPU 集群上跑实验」本身就需要提交作业；只挡「干扰别人的作业」的用法
 * （scancel 不带 job id、squeue -u 看别人队列）。
 *
 * 风格沿用 shell-exec.ts：宁可否判（false positive），不留口子。
 */

export interface BlockedPattern {
  re: RegExp;
  reason: string;
}

/**
 * 本地/远端共用基线表。顺序有意义 —— 先命中者决定错误文案。
 * 与 shell-exec.ts 抽出前的 30 条严格一致。
 */
export const BLOCKED_PATTERNS: BlockedPattern[] = [
  { re: /(^|[\s;&|`(])sudo(\s|$)/i, reason: 'sudo' },
  { re: /(^|[\s;&|`(])doas(\s|$)/i, reason: 'doas' },
  { re: /(^|[\s;&|`(])su\s+-/i, reason: 'su -' },
  { re: /rm\s+(-[A-Za-z]*[rRfF][A-Za-z]*\s|--recursive\s|--force\s)/i, reason: 'rm -r/-f' },
  { re: /rm\s+-rf?\s+\/(?!\s*$)/i, reason: 'rm -rf /' },
  { re: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:/, reason: 'fork bomb' },
  { re: /\bmkfs(\.\w+)?\b/i, reason: 'mkfs' },
  { re: /\bdd\s+(if|of)=/i, reason: 'dd' },
  { re: /\bshutdown\b/i, reason: 'shutdown' },
  { re: /\breboot\b/i, reason: 'reboot' },
  { re: /\bhalt\b/i, reason: 'halt' },
  { re: /\bpoweroff\b/i, reason: 'poweroff' },
  { re: /\binit\s+0\b/i, reason: 'init 0' },
  { re: /\binsmod\b|\brmmod\b|\bmodprobe\b/i, reason: 'kernel module op' },
  { re: /\bchmod\s+-R\s+777\b/i, reason: 'chmod -R 777' },
  { re: /\bchown\s+-R\b/i, reason: 'chown -R' },
  { re: /(curl|wget|fetch|iwr|Invoke-WebRequest)[^\n]*\|\s*(sh|bash|zsh|ksh|csh|tcsh|pwsh|powershell|python\b|perl|ruby|node|tee\s)/i, reason: 'pipe download to interpreter' },
  { re: /(curl|wget)[^\n]*--?o[A-Za-z]*\s+\/(etc|bin|sbin|usr|var|root|boot|lib|dev|proc|sys)\//i, reason: 'download into system path' },
  { re: /\s>\s*\/(etc|bin|sbin|usr|root|boot|lib|dev|proc|sys)\//i, reason: 'redirect into system path' },
  { re: /\beval\s+["'`]?\$\(/i, reason: 'eval $(...)' },
  { re: /\bbase64\s+(-d|--decode)\b[^\n]*\|\s*(sh|bash|zsh)/i, reason: 'base64 | sh' },
  { re: /\bnc\b\s+-[a-z]*l/i, reason: 'netcat listen' },
  { re: /\bncat\b\s+-[a-z]*l/i, reason: 'ncat listen' },
  // 2026-11-20 修正：原写法 /\b\/etc\/(passwd|…)/ 里 `\b` 前必须是单词字符，
  // 而路径前通常是空格/行首，导致 `cat /etc/shadow` 一直命不中（历史缺口）。
  { re: /(^|[\s;&|'"`(])\/etc\/(passwd|shadow|sudoers|hosts)\b/i, reason: '/etc sensitive file' },
  { re: /\b\/dev\/(sd[a-z]|nvme|hd[a-z]|mem|kmem)\b/i, reason: '/dev block/raw device' },
  { re: /\bcrontab\s+(-r|-e)\b/i, reason: 'crontab modify' },
  { re: /\bsystemctl\s+(disable|enable|stop|start|mask|unmask)\b/i, reason: 'systemctl service' },
  { re: /\bservice\s+\w+\s+(stop|start|restart)\b/i, reason: 'service control' },
  { re: /\biptables\b|\bnft\b|\bufw\b/i, reason: 'firewall op' },
  { re: /\bRegistry::|\bReg(istry)?\s+(add|delete)\b|\bregedit\b/i, reason: 'registry op' },
  { re: /\bformat\s+[A-Za-z]:/i, reason: 'format drive' },
  { re: /\bDel\s+\/[A-Za-z]\s+\/[A-Za-z]/i, reason: 'recursive delete' },
];

/**
 * 远端专属叠加表。远端机器很可能是**共享集群**，爆炸半径与本地不同：
 *   - 装包会污染全局环境，别人复现不了（头号事故源）→ 一律禁；
 *   - `git push` / `git remote set-url` 会用集群上的凭据改远端仓库；
 *   - `ssh` / `scp` / `rsync` 能从集群横向摸到内网其它机器（越权）；
 *   - `curl -T` / `nc` / `socat` 能把数据外带出去；
 *   - `env` / `printenv` 会把集群上常挂的 token（WANDB_API_KEY、HF_TOKEN）打出来。
 */
export const REMOTE_ONLY_BLOCKED: BlockedPattern[] = [
  // ── 包管理：共享集群上装包污染全局环境 ──────────────────────────────────
  { re: /(^|[\s;&|`(])pip3?\s+install\b/i, reason: 'pip install（远端禁止改环境）' },
  { re: /(^|[\s;&|`(])python3?\s+-m\s+pip\s+install\b/i, reason: 'python -m pip install（远端禁止改环境）' },
  { re: /(^|[\s;&|`(])conda\s+(install|update|create|remove|upgrade)\b/i, reason: 'conda install（远端禁止改环境）' },
  { re: /(^|[\s;&|`(])(apt|apt-get)\s+(install|upgrade|dist-upgrade|remove|purge)\b/i, reason: 'apt install（远端禁止改环境）' },
  { re: /(^|[\s;&|`(])(yum|dnf|zypper)\s+(install|upgrade|update|remove|erase)\b/i, reason: 'yum/dnf install（远端禁止改环境）' },
  { re: /(^|[\s;&|`(])brew\s+(install|upgrade|uninstall|tap)\b/i, reason: 'brew install（远端禁止改环境）' },

  // ── 仓库：用集群凭据改远端仓库 ─────────────────────────────────────────
  { re: /\bgit\s+push\b/i, reason: 'git push（远端禁止推）' },
  { re: /\bgit\s+remote\s+(add|set-url|remove|rename)\b/i, reason: 'git remote 改地址' },
  { re: /\bgh\s+auth\b/i, reason: 'gh auth（凭据操作）' },

  // ── 容器：绕开环境隔离 ──────────────────────────────────────────────────
  { re: /(^|[\s;&|`(])docker(-compose)?\s+(run|exec|up|down|rm|system)\b/i, reason: 'docker（远端禁止）' },

  // ── 横向移动：从集群摸到内网别的机器 = 越权 ────────────────────────────
  { re: /(^|[\s;&|`(])ssh\s+[^\s]/i, reason: 'ssh（禁止从远端再跳机器）' },
  { re: /(^|[\s;&|`(])(scp|sftp)\s+[^\s]/i, reason: 'scp/sftp（禁止从远端再跳机器）' },
  { re: /(^|[\s;&|`(])rsync\s/i, reason: 'rsync（禁止从远端再跳机器）' },

  // ── 外带数据 ────────────────────────────────────────────────────────────
  { re: /\bcurl\b[^\n]*(\s-T\s|\s--upload-file\s|\s-F\s)/i, reason: 'curl 上传' },
  { re: /(^|[\s;&|`(])(nc|ncat|socat|telnet)\s/i, reason: 'nc/socat 网络直连' },

  // ── 集群凭据文件 ────────────────────────────────────────────────────────
  // 说明：基线表里那条 `/etc/(passwd|shadow|sudoers|hosts)` 写成 `\b\/etc\/…`，
  // `\b` 前面必须是单词字符，所以 `cat /etc/shadow` 其实命不中（历史缺口）。
  // 抽出时按「行为零变化」没有动它，这里用正确写法给远端补上 —— 远端读的是
  // 共享集群的系统账户与别人的 ~/.ssh，风险比本地高。
  { re: /\/(etc|root)\/(passwd|shadow|sudoers|hosts)\b/i, reason: '/etc 敏感文件' },
  { re: /\/(root|home\/[^/\s]+)\/\.ssh\b/i, reason: '他人的 ~/.ssh' },

  // ── 凭据泄露 ────────────────────────────────────────────────────────────
  { re: /(^|[\s;&|`(])printenv\b/i, reason: 'printenv（会打印集群 token）' },
  { re: /(^|[\s;&|`(])env\s*($|\||>)/i, reason: '裸 env（会打印集群 token）' },

  // ── 他人作业 ────────────────────────────────────────────────────────────
  { re: /\bscancel\s*($|\|)/i, reason: 'scancel 缺 job id（会取消自己全部作业）' },
  { re: /\bscancel\s+(-u|--user)\s/i, reason: 'scancel -u（会动别人的作业）' },
  { re: /\bsqueue\s+(-u|--user)\s/i, reason: 'squeue -u（看别人队列）' },
  { re: /\bpkill\s+(-u|--user)\s/i, reason: 'pkill -u（会杀别人的进程）' },
  { re: /\bkill\s+(-[A-Za-z0-9]+\s+)*-1(\s|$)/i, reason: 'kill -1（会杀自己全部进程）' },
];

/** 共用基线表检查。返回命中原因（null = 放行）。 */
export function checkLocalCommand(cmd: string): string | null {
  for (const { re, reason } of BLOCKED_PATTERNS) {
    if (re.test(cmd)) return reason;
  }
  return null;
}

/** 远端检查 = 基线表 + 远端专属表。返回命中原因（null = 放行）。 */
export function checkRemoteCommand(cmd: string): string | null {
  const base = checkLocalCommand(cmd);
  if (base) return base;
  for (const { re, reason } of REMOTE_ONLY_BLOCKED) {
    if (re.test(cmd)) return reason;
  }
  return null;
}

/**
 * 远端相对路径校验：只允许 remoteDir 内的相对路径。
 *
 * 返回 null = 合法；否则返回人类可读的拒绝原因。
 * 空串按 remoteDir 根处理（合法）—— 调用方据此决定是否拼 `cd`。
 */
export function assertInsideRemoteDir(rel: unknown): string | null {
  if (rel === undefined || rel === null) return null;
  if (typeof rel !== 'string') return '路径必须是字符串';
  const p = rel.trim();
  if (p === '') return null;
  if (p.includes('\0')) return '路径含 NUL 字节';
  // 绝对路径：POSIX `/`、Windows 盘符 `X:`、UNC `\\`
  if (p.startsWith('/')) return `不允许绝对路径：${p}`;
  if (p.startsWith('\\')) return `不允许绝对路径：${p}`;
  if (/^[A-Za-z]:/.test(p)) return `不允许绝对路径：${p}`;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) return `不允许 ~ 路径：${p}`;
  // `..` 任一段 → 越出 remoteDir
  for (const comp of p.split(/[\\/]+/)) {
    if (comp === '..') return `路径逃出 remoteDir：${p}`;
  }
  return null;
}
