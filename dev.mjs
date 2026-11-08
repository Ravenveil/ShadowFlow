#!/usr/bin/env node
/**
 * ShadowFlow 合并仓库统一启动器。
 *
 *   npm run dev                 起 Python(:8000) + Node 网关(:8002) + 新前端(:8443)
 *   npm run dev -- --no-open    不自动开浏览器
 *   npm run dev -- --no-python  只起网关 + 前端
 *
 * 直连 node/python 入口启动子进程（不经 npm 壳），Ctrl+C 整树退出。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const IS_WIN = process.platform === "win32";
const args = new Set(process.argv.slice(2));
const OPEN_BROWSER = !args.has("--no-open");
const WITH_PYTHON = !args.has("--no-python");

const WEB_PORT = 8443;
const GW_PORT = 8002;
const PY_PORT = 8000;

function resolvePython() {
  if (process.env.SF_PYTHON) return process.env.SF_PYTHON;
  const venvPy = IS_WIN
    ? path.join(ROOT, ".venv", "Scripts", "python.exe")
    : path.join(ROOT, ".venv", "bin", "python");
  return fs.existsSync(venvPy) ? venvPy : "python";
}

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}

async function waitPort(name, port, timeoutMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await portInUse(port)) {
      console.log(`[dev] ${name} 就绪 (:${port})`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`[dev] ${name} 启动超时 (:${port})`);
  return false;
}

const children = [];
function launch(name, file, argv, opts = {}) {
  const child = spawn(file, argv, {
    cwd: opts.cwd ?? ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...opts.env },
    detached: !IS_WIN,
    shell: false,
  });
  const tag = `[${name}]`;
  child.stdout.on("data", (d) => process.stdout.write(`${tag} ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`${tag} ${d}`));
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[dev] ${name} 退出 (code=${code})，整树收摊`);
      shutdown(1);
    }
  });
  children.push(child);
  return child;
}

function shutdown(exitCode = 0) {
  for (const c of children) {
    try {
      if (IS_WIN) spawn("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
      else {
        try {
          process.kill(-c.pid, "SIGTERM");
        } catch {
          c.kill("SIGTERM");
        }
      }
    } catch {
      /* 进程可能已退出 */
    }
  }
  const finish = () => process.exit(exitCode);
  if (IS_WIN) setTimeout(finish, 800);
  else finish();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// ── 主流程 ──────────────────────────────────────────────────────────────────
const checks = [
  ...(WITH_PYTHON ? [[PY_PORT, "Python FastAPI"]] : []),
  [GW_PORT, "Node 网关"],
  [WEB_PORT, "新前端 Vite"],
];
for (const [port, label] of checks) {
  if (await portInUse(port)) {
    console.error(`[dev] 端口 ${port} (${label}) 已被占用，请先释放`);
    process.exit(1);
  }
}

if (WITH_PYTHON) {
  const pyBin = resolvePython();
  launch("py", pyBin, [
    "-m", "uvicorn", "shadowflow.server:app",
    "--app-dir", path.join(ROOT, "backend", "python"),
    "--host", "127.0.0.1", "--port", String(PY_PORT),
    // 2026-11-08 · 热重载：Python 改动（如消息附件持久化）此前不重启不生效，
    // 线上长期跑旧代码静默丢数据。与网关 tsx watch 对齐，改完即生效。
    "--reload",
  ]);
  console.log(`[dev] py  ${pyBin} -m uvicorn shadowflow.server:app (:${PY_PORT}, reload)`);
}
launch("gw", process.execPath, [
  path.join("node_modules", "tsx", "dist", "cli.mjs"),
  "watch", "src/index.ts",
], { cwd: path.join(ROOT, "backend", "node") });
console.log(`[dev] gw  tsx watch backend/node/src/index.ts (:${GW_PORT})`);

launch("web", process.execPath, [
  path.join("node_modules", "vite", "bin", "vite.js"),
], { cwd: path.join(ROOT, "frontend"), env: { SF_DEV_OPEN: "0" } });
console.log(`[dev] web vite (:${WEB_PORT})\n`);

const ready = await Promise.all([
  ...(WITH_PYTHON ? [waitPort("Python FastAPI", PY_PORT)] : []),
  waitPort("Node 网关", GW_PORT),
  waitPort("新前端 Vite", WEB_PORT),
]);
if (ready.some((ok) => !ok)) {
  shutdown(1);
} else {
  const url = `http://localhost:${WEB_PORT}/`;
  console.log(`\n[dev] 全部就绪 → ${url}（CEO 工作台：${url}#/app）\n`);
  if (OPEN_BROWSER) {
    try {
      if (IS_WIN) spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true });
      else if (process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true });
      else spawn("xdg-open", [url], { stdio: "ignore", detached: true });
    } catch {
      /* 打不开浏览器不算失败 */
    }
  }
}
