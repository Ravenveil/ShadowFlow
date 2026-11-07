#!/usr/bin/env node
/**
 * ShadowFlow 统一启动器 —— 对标 `dsh web` 的单命令体验。
 *
 *   npm run dev
 *
 * 做四件事:
 *   1. 拉起 Python FastAPI(:8000)+ Node 网关(:8002)+ Vite 前端(:3007)
 *   2. 就绪探测:三个服务全部 HTTP 可达后才开浏览器(避免落地白屏/报错)
 *   3. 自动打开浏览器 http://localhost:3007
 *   4. Ctrl+C 或任一进程退出 → 整棵进程树一起停,不留孤儿
 *
 * 端口被占用时启动前直接报错退出;Python 解释器自动探测
 * (SF_PYTHON 环境变量 > 根目录 .venv > 系统 python)。
 *
 * 可选参数:--no-open 不开浏览器;--no-python 只起网关+前端。
 */
import { spawn, execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_WIN = process.platform === 'win32';

const WEB_PORT = 3007;
const GW_PORT = 8002;
const PY_PORT = 8000;

const args = new Set(process.argv.slice(2));
const OPEN_BROWSER = !args.has('--no-open');
const WITH_PYTHON = !args.has('--no-python');

const C = {
  py: '\x1b[34m', // blue
  gw: '\x1b[32m', // green
  web: '\x1b[35m', // magenta
  green: '\x1b[32m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Python 解释器探测 ─────────────────────────────────────────────────────────
function resolvePython() {
  if (process.env.SF_PYTHON) return process.env.SF_PYTHON;
  const venvPy = IS_WIN
    ? path.join(ROOT, '.venv', 'Scripts', 'python.exe')
    : path.join(ROOT, '.venv', 'bin', 'python');
  if (fs.existsSync(venvPy)) return venvPy;
  return 'python';
}

// ── 端口/HTTP 就绪探测 ────────────────────────────────────────────────────────
/**
 * 回环地址有两个协议族，两个都可能有人监听：
 *   - Vite 默认 host 是 `localhost`，Node 解析成 ::1 时只绑 [::1]（这是常态）；
 *   - Express/tsx 绑 0.0.0.0。
 * 只探 127.0.0.1 会把 ::1 上的服务当成"没起来"，白等 120s 后误杀整棵树。
 */
const LOOPBACK_HOSTS = ['127.0.0.1', '::1'];

function loopbackUrl(host, port, pathname) {
  return `http://${host.includes(':') ? `[${host}]` : host}:${port}${pathname}`;
}

function portInUseOne(port, host) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

async function portInUse(port) {
  for (const host of LOOPBACK_HOSTS) if (await portInUseOne(port, host)) return true;
  return false;
}

function probe(url) {
  // 任何 HTTP 响应(含 404)都算"服务已监听"
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2000 }, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function waitReady(port, pathname, label, timeoutMs = 120_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    for (const host of LOOPBACK_HOSTS) {
      if (await probe(loopbackUrl(host, port, pathname))) return;
    }
    await sleep(400);
  }
  throw new Error(`${label} 在 ${timeoutMs / 1000}s 内未就绪:${pathname}（端口 ${port}）`);
}

// ── 子进程日志:按行分帧 + 彩色前缀 ──────────────────────────────────────────
function lineSplitter(onLine) {
  let buf = '';
  return (chunk) => {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (line.trim()) onLine(line);
    }
  };
}

function wireLogs(child, tag, color) {
  const push = (line) => process.stdout.write(`${color}[${tag}]${C.reset} ${line}\n`);
  const pushErr = (line) => process.stdout.write(`${color}[${tag}]${C.reset} ${C.yellow}${line}${C.reset}\n`);
  child.stdout?.on('data', lineSplitter(push));
  child.stderr?.on('data', lineSplitter(pushErr));
}

// ── 进程树管理 ────────────────────────────────────────────────────────────────
const children = [];
let shuttingDown = false;

// Windows 上 uvicorn --reload 的 worker / tsx 的 node 子进程会脱离 taskkill /T
// 的 PPID 快照(中间进程退出后链路断掉),所以退场分三段:
//   1. 对每个直接子进程 taskkill /T /F(大多数情况足够)
//   2. PowerShell 沿 PPID 递归清点所有后代,逐个补杀(抓断链孤儿)
//   3. netstat 按端口反查监听者兜底
function killDescendantsOnWin(rootPids) {
  const roots = rootPids.filter((p) => Number.isFinite(p)).join(',');
  if (!roots) return Promise.resolve();
  const script = [
    '$roots = @(' + roots + ')',
    '$procs = Get-CimInstance Win32_Process',
    '$byParent = @{}',
    'foreach ($p in $procs) { $byParent[[int]$p.ParentProcessId] += ,([int]$p.ProcessId) }',
    '$seen = @{}',
    '$stack = New-Object System.Collections.Stack',
    'foreach ($r in $roots) { $stack.Push($r) }',
    'while ($stack.Count -gt 0) {',
    '  $cur = $stack.Pop()',
    '  if ($seen.ContainsKey($cur)) { continue }',
    '  $seen[$cur] = $true',
    '  if ($byParent.ContainsKey($cur)) { foreach ($c in $byParent[$cur]) { $stack.Push($c) } }',
    '}',
    'foreach ($k in $seen.Keys) { if ($k -ne $PID) { & taskkill /PID $k /F 2>$null | Out-Null } }',
  ].join('\n');
  return new Promise((resolve) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
    ps.once('close', resolve);
    ps.once('error', resolve);
  });
}

function killPortOwnersOnWin(ports) {
  return new Promise((resolve) => {
    execFile('netstat', ['-ano'], (err, stdout) => {
      if (!err && stdout) {
        for (const line of stdout.split(/\r?\n/)) {
          const cols = line.trim().split(/\s+/);
          if (cols.length === 5 && cols[0] === 'TCP' && cols[3] === 'LISTENING') {
            const port = Number(cols[1].split(':').pop());
            if (ports.includes(port)) {
              spawn('taskkill', ['/pid', cols[4], '/T', '/F'], { stdio: 'ignore' });
            }
          }
        }
      }
      resolve();
    });
  });
}

function teardown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  const rootPids = children.map((c) => c.pid);
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (IS_WIN) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    }
  }
  const finish = () => process.exit(exitCode);
  if (IS_WIN) {
    const allPorts = [WEB_PORT, GW_PORT, PY_PORT];
    setTimeout(() => {
      killDescendantsOnWin(rootPids)
        .then(() => killPortOwnersOnWin(allPorts))
        .then(() => setTimeout(finish, 200));
    }, 250);
  } else {
    setTimeout(finish, 50);
  }
}

function launch(name, color, file, argv, opts = {}) {
  // POSIX 用独立进程组,组杀时能带走整棵树;Windows 直接 spawn exe/node 入口
  const child = spawn(file, argv, {
    cwd: opts.cwd ?? ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...opts.env },
    detached: !IS_WIN,
    shell: false,
  });
  children.push(child);
  wireLogs(child, name, color);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    process.stdout.write(`\n${C.red}✖ [${name}] 已退出 (code=${code} signal=${signal}) — 停止其余服务${C.reset}\n`);
    teardown(code ?? 1);
  });
  child.on('error', (err) => {
    process.stdout.write(`${C.red}✖ [${name}] 启动失败:${err.message}${C.reset}\n`);
    teardown(1);
  });
  return child;
}

// ── 浏览器 ────────────────────────────────────────────────────────────────────
function openBrowser(url) {
  try {
    if (IS_WIN) spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true });
    else if (process.platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true });
    else spawn('xdg-open', [url], { stdio: 'ignore', detached: true });
  } catch { /* 打不开浏览器不算失败,URL 已经打印出来了 */ }
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
/**
 * Python 侧是 legacy 服务(FastAPI)，Node 网关才是现在的产品面。
 * 但它的依赖不在 repo 里：新同学 clone 完直接 `npm run dev`，py 进程起不来
 * 就整棵树收摊，前端一行都干不了。所以启动前先探一次——依赖不全就明确告警
 * 后跳过 Python，网关照常起，只有 legacy 路由会 503。
 */
function pythonUsable(pyBin) {
  try {
    execFileSync(pyBin, ['-c', 'import uvicorn, yaml, fastapi'], {
      stdio: 'ignore',
      timeout: 20_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const uiUrl = `http://localhost:${WEB_PORT}`;
  const pyBin = resolvePython();
  let withPython = WITH_PYTHON;
  if (withPython && !pythonUsable(pyBin)) {
    withPython = false;
    console.log(
      `${C.yellow}⚠ Python 侧依赖不全，已跳过 legacy FastAPI(:${PY_PORT})${C.reset}\n` +
        `${C.dim}  解释器: ${pyBin}\n` +
        `  受影响：legacy 路由会 503，其余功能正常。\n` +
        `  补齐依赖: ${pyBin} -m pip install -e "./backend/python[server]"\n` +
        `  显式跳过: npm run dev -- --no-python${C.reset}\n`,
    );
  }

  console.log(`
${C.bold}  ShadowFlow Dev${C.reset} ${C.dim}— one command,对标 dsh web${C.reset}
  ────────────────────────────────────────────
  ${C.cyan}UI${C.reset}      ${uiUrl}
  ${C.cyan}网关${C.reset}    http://localhost:${GW_PORT}/health
  ${withPython ? `${C.cyan}Python${C.reset}  http://localhost:${PY_PORT}/docs` : `${C.dim}Python  已跳过${C.reset}`}
  ${C.dim}Ctrl+C 停止全部服务${C.reset}
`);

  // 1) 端口预检:被占用直接报错,避免和已有实例打架
  const need = [
    { port: WEB_PORT, name: 'Vite 前端' },
    { port: GW_PORT, name: 'Node 网关' },
    ...(withPython ? [{ port: PY_PORT, name: 'Python FastAPI' }] : []),
  ];
  const busy = [];
  for (const n of need) if (await portInUse(n.port)) busy.push(n);
  if (busy.length) {
    console.error(`${C.red}✖ 端口被占用,请先停掉已有实例:${C.reset}`);
    for (const n of busy) console.error(`    ${C.yellow}:${n.port}  ${n.name}${C.reset}`);
    process.exit(1);
  }

  // 2) 依次拉起三个进程(直连入口,不经过 npm 壳,进程树干净好杀)
  if (withPython) {
    launch('py', C.py, pyBin, [
      '-m', 'uvicorn', 'shadowflow.server:app',
      '--host', '127.0.0.1', '--port', String(PY_PORT), '--reload',
      // 监视收窄到 shadowflow/：全树监视会被 .workbuddy/tmp 等杂散 .py 抖动
      // 反复触发 reload（Windows 上旧 worker 不退 → 新 worker 抢不到 8000
      // → uvicorn 退出 code=1 → dev.mjs 整树收摊，2026-11-07 连崩两次实证）。
      '--reload-dir', path.join(ROOT, 'backend', 'python', 'shadowflow'),
    ], { cwd: path.join(ROOT, 'backend', 'python') });
    console.log(`${C.dim}  [py] ${pyBin}${C.reset}`);
  }
  launch('gw', C.gw, process.execPath, [
    path.join('node_modules', 'tsx', 'dist', 'cli.mjs'),
    'watch', 'src/index.ts',
  ], { cwd: path.join(ROOT, 'backend', 'node') });
  console.log(`${C.dim}  [gw] tsx watch backend/node/src/index.ts${C.reset}`);
  launch('web', C.web, process.execPath, [
    path.join('node_modules', 'vite', 'bin', 'vite.js'),
  ], { cwd: path.join(ROOT, 'frontend'), env: { SF_DEV_OPEN: '0' } }); // vite 不自己开浏览器,由本启动器统一在就绪后开
  console.log(`${C.dim}  [web] vite${C.reset}\n`);

  // 3) 就绪探测(任一进程死掉会走 exit handler 直接收摊,这里只会等超时)
  const waiting = [
    waitReady(WEB_PORT, '/', 'Vite 前端').then(() => console.log(`${C.green}✓${C.reset} 前端就绪 :${WEB_PORT}`)),
    waitReady(GW_PORT, '/health', 'Node 网关').then(() => console.log(`${C.green}✓${C.reset} 网关就绪 :${GW_PORT}`)),
    ...(withPython
      ? [waitReady(PY_PORT, '/docs', 'Python FastAPI').then(() => console.log(`${C.green}✓${C.reset} Python 就绪 :${PY_PORT}`))]
      : []),
  ];
  try {
    await Promise.all(waiting);
  } catch (err) {
    console.error(`\n${C.red}✖ ${err.message}${C.reset}`);
    teardown(1);
    return;
  }

  // 4) 全部就绪,开浏览器
  if (OPEN_BROWSER) {
    openBrowser(uiUrl);
    console.log(`\n${C.green}✓${C.reset} 已打开浏览器 ${C.bold}${uiUrl}${C.reset}`);
  } else {
    console.log(`\n${C.green}✓${C.reset} 全部就绪:${C.bold}${uiUrl}${C.reset}`);
  }
}

process.on('SIGINT', () => { console.log('\n正在停止全部服务…'); teardown(0); });
process.on('SIGTERM', () => teardown(0));

main().catch((err) => {
  console.error(`${C.red}✖ ${err?.stack || err}${C.reset}`);
  teardown(1);
});
