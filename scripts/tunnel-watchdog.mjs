#!/usr/bin/env node
/**
 * tunnel-watchdog.mjs — 公网链接守护（2026-11-08 公网稳定性批）。
 *
 * 监测对象：产品链接隧道（cloudflared 快速隧道）+ 本地三服务端口。
 *   · 隧道探测连续 2 次失败才动作（防瞬时网络抖动误杀）；存活时**绝不重启**
 *     ——快速隧道每次重启都会换随机域名，保住现有进程 = 保住已交付链接。
 *   · 隧道挂了但本地服务活着 → 自动拉起 cloudflared；新域名从启动输出抓取，
 *     写 .workbuddy/tunnel-url.txt 并醒目提示（link.md 需同步更新）。
 *   · 三服务端口全挂 → 自动重启 dev.mjs 整树（SF_WATCHDOG_RESTART_DEV=0 关闭）。
 *   · 状态落盘 .workbuddy/tunnel-watchdog.status.json，随时可查。
 *
 * 用法：
 *   node scripts/tunnel-watchdog.mjs            # 前台运行（Ctrl+C 退出）
 *   SF_TUNNEL_URL=https://xxx.trycloudflare.com node scripts/tunnel-watchdog.mjs
 *
 * 环境变量：
 *   SF_TUNNEL_URL          当前产品链接（默认内置 2026-11-08 交付地址）
 *   SF_TUNNEL_TARGET       隧道目标（默认 http://localhost:8443）
 *   SF_CLOUDFLARED         cloudflared 二进制（默认 .workbuddy/bin/cloudflared.exe）
 *   SF_WATCHDOG_INTERVAL_MS 探测间隔（默认 30000）
 *   SF_WATCHDOG_RESTART_DEV 三服务全挂时是否重启 dev.mjs（默认 1；设 0 关闭）
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IS_WIN = process.platform === "win32";

const TUNNEL_URL = (
  process.env.SF_TUNNEL_URL ??
  "https://kingston-schema-russia-appreciate.trycloudflare.com"
).replace(/\/$/, "");
const TUNNEL_TARGET = process.env.SF_TUNNEL_TARGET ?? "http://localhost:8443";
const CLOUDFLARED =
  process.env.SF_CLOUDFLARED ?? path.join(ROOT, ".workbuddy", "bin", "cloudflared.exe");
const INTERVAL = Math.max(5000, Number(process.env.SF_WATCHDOG_INTERVAL_MS ?? 30_000));
const RESTART_DEV = process.env.SF_WATCHDOG_RESTART_DEV !== "0";

const STATUS_FILE = path.join(ROOT, ".workbuddy", "tunnel-watchdog.status.json");
const URL_FILE = path.join(ROOT, ".workbuddy", "tunnel-url.txt");

const SERVICE_PORTS = [
  [8443, "web(vite)"],
  [8002, "gateway(node)"],
  [8000, "python"],
];

const state = {
  started: new Date().toISOString(),
  checks: 0,
  consecutiveTunnelFailures: 0,
  tunnelRestarts: 0,
  devRestarts: 0,
  currentUrl: TUNNEL_URL,
  last: {},
};

function log(...args) {
  console.log(`[watchdog ${new Date().toISOString()}]`, ...args);
}

function saveStatus() {
  try {
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ ...state, savedAt: new Date().toISOString() }, null, 2));
  } catch (e) {
    log("状态落盘失败（非致命）:", e?.message ?? e);
  }
}

/** HTTP 探测：任意响应（含 4xx/5xx）都算隧道「通」，只有超时/网络错才算挂。 */
async function probeTunnel(url, timeoutMs = 15_000) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    return true;
  } catch {
    return false;
  }
}

/** TCP 端口探测。 */
function portAlive(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}

function parseTunnelUrl(text) {
  const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && m[0] !== state.currentUrl) {
    state.currentUrl = m[0];
    try {
      fs.mkdirSync(path.dirname(URL_FILE), { recursive: true });
      fs.writeFileSync(URL_FILE, `${m[0]}\n`);
    } catch { /* 非致命 */ }
    log("████ 隧道 URL 变更 ████ 新地址:", m[0]);
    log("████ link.md / README 需要同步更新（旧链接已失效）████");
    saveStatus();
  }
}

let cloudflaredChild = null;
function startCloudflared() {
  if (!fs.existsSync(CLOUDFLARED)) {
    log("找不到 cloudflared:", CLOUDFLARED, "— 无法自动拉起隧道");
    return;
  }
  log("拉起 cloudflared →", TUNNEL_TARGET);
  const child = spawn(CLOUDFLARED, ["tunnel", "--url", TUNNEL_TARGET, "--no-autoupdate"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  cloudflaredChild = child;
  const onData = (d) => {
    const text = d.toString();
    parseTunnelUrl(text);
    process.stdout.write(`[cloudflared] ${text}`);
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("exit", (code) => {
    log("cloudflared 退出 code=", code, "（下次探测失败会再拉起）");
    if (cloudflaredChild === child) cloudflaredChild = null;
    saveStatus();
  });
  state.tunnelRestarts += 1;
  saveStatus();
}

let devChild = null;
function startDevTree() {
  log("三服务端口全挂 — 重启 dev.mjs 整树");
  const child = spawn(process.execPath, ["dev.mjs", "--no-open"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  devChild = child;
  child.stdout.on("data", (d) => process.stdout.write(`[dev] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[dev] ${d}`));
  child.on("exit", (code) => {
    log("dev.mjs 退出 code=", code);
    if (devChild === child) devChild = null;
    saveStatus();
  });
  state.devRestarts += 1;
  saveStatus();
}

async function tick() {
  state.checks += 1;
  const ports = {};
  for (const [port, label] of SERVICE_PORTS) {
    ports[label] = await portAlive(port);
  }
  const anyServiceUp = Object.values(ports).some(Boolean);
  const allServicesDown = Object.values(ports).every((v) => !v);

  const tunnelUp = await probeTunnel(state.currentUrl);
  state.consecutiveTunnelFailures = tunnelUp ? 0 : state.consecutiveTunnelFailures + 1;
  state.last = { at: new Date().toISOString(), tunnel: tunnelUp, ports };
  saveStatus();

  if (tunnelUp) {
    return; // 隧道健康：绝不重启（保住随机域名 = 保住已交付链接）
  }

  if (state.consecutiveTunnelFailures < 2) {
    log(`隧道探测失败（${state.consecutiveTunnelFailures}/2，等复测再动作）`);
    return;
  }

  if (allServicesDown && RESTART_DEV) {
    startDevTree();
    // 等服务起几个探测周期再拉隧道（target 未就绪时 cloudflared 会起但回 502）
    log("先等本地服务就绪，下个周期再处理隧道");
    return;
  }

  if (!anyServiceUp) {
    log("隧道挂 + 本地服务也挂（且未启用自动重启）— 请手动运行: npm run dev");
    return;
  }

  // 本地服务活着但隧道挂 → 旧 cloudflared 大概率已死，拉新的
  log("隧道连续探测失败且本地服务存活 → 重启 cloudflared");
  startCloudflared();
}

log(
  `启动：监控 ${state.currentUrl} → ${TUNNEL_TARGET} | 间隔 ${INTERVAL}ms | ` +
  `自动重启 dev=${RESTART_DEV ? "开" : "关"} | 状态 ${STATUS_FILE}`,
);

tick();
setInterval(tick, INTERVAL);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log("收到", sig, "退出（不杀 cloudflared/dev — 它们继续服务）");
    process.exit(0);
  });
}
