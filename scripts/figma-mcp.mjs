#!/usr/bin/env node
/**
 * figma-mcp.mjs — 直接对 Figma 官方远程 MCP 服务器说 JSON-RPC。
 *
 * 为什么需要它：`generate_figma_design`（Code to Canvas）只挂在远程服务器上，
 * 认证是 OAuth（scope=mcp:connect），`figd_` REST token 进不去。Claude Code 已经
 * 完成过一次 OAuth，凭据落在 ~/.claude/.credentials.json 的
 * mcpOAuth["plugin:figma:figma|*"] 下。本脚本复用该 token 直接调 MCP，
 * 不依赖 Claude Code 的模型（用户的 ANTHROPIC_BASE_URL 指向的中转 token 已失效，
 * `claude -p` 会 401）。
 *
 * 用法：
 *   node scripts/figma-mcp.mjs tools
 *   node scripts/figma-mcp.mjs call <toolName> '<jsonArgs>'
 *   node scripts/figma-mcp.mjs capture <url> [fileName]
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ENDPOINT = 'https://mcp.figma.com/mcp';

function loadToken() {
  const p = join(homedir(), '.claude', '.credentials.json');
  const d = JSON.parse(readFileSync(p, 'utf8'));
  const store = d.mcpOAuth ?? {};
  const key = Object.keys(store).find(
    (k) => k.includes('figma') && store[k]?.serverUrl?.includes('mcp.figma.com'),
  );
  if (!key) {
    throw new Error(
      `未找到 Figma MCP 凭据。先跑一次 claude → /mcp → figma → Authenticate。\n已知条目: ${Object.keys(store).join(', ')}`,
    );
  }
  const entry = store[key];
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    throw new Error(`Figma MCP token 已过期（${new Date(entry.expiresAt).toISOString()}），请重新 /mcp 授权`);
  }
  return { token: entry.accessToken, scope: entry.scope };
}

let sessionId = null;
let rpcId = 0;

/** 解析 SSE 或 JSON 响应，返回 JSON-RPC 消息数组。 */
function parseBody(text, contentType) {
  if (contentType?.includes('text/event-stream') || text.startsWith('event:')) {
    const out = [];
    for (const block of text.split(/\r?\n\r?\n/)) {
      const dataLines = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim());
      if (!dataLines.length) continue;
      const raw = dataLines.join('\n');
      try {
        out.push(JSON.parse(raw));
      } catch {
        /* 忽略非 JSON 的 SSE 片段 */
      }
    }
    return out;
  }
  try {
    return [JSON.parse(text)];
  } catch {
    return [];
  }
}

async function rpc(method, params, { notify = false } = {}) {
  const { token } = loadToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const body = { jsonrpc: '2.0', method, ...(params ? { params } : {}) };
  if (!notify) body.id = ++rpcId;

  const res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) });
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (notify) return null;
  const msgs = parseBody(text, res.headers.get('content-type'));
  const hit = msgs.find((m) => m.id === body.id) ?? msgs[0];
  if (hit?.error) throw new Error(`${method} → RPC error ${JSON.stringify(hit.error).slice(0, 400)}`);
  return hit?.result ?? null;
}

async function connect() {
  const init = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'shadowflow-figma-mcp', version: '1.0.0' },
  });
  await rpc('notifications/initialized', undefined, { notify: true });
  return init;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'tools') {
    const init = await connect();
    const list = await rpc('tools/list');
    console.log('server:', init?.serverInfo?.name, init?.serverInfo?.version);
    for (const t of list?.tools ?? []) {
      const props = Object.keys(t.inputSchema?.properties ?? {}).join(', ');
      console.log(`- ${t.name}  (${props})`);
      if (['generate_figma_design', 'create_new_file', 'send_code_to_figma', 'create_session', 'use_figma'].includes(t.name)) {
        console.log(`    required: ${JSON.stringify(t.inputSchema?.required ?? [])}`);
        console.log(`    desc: ${(t.description ?? '').replace(/\s+/g, ' ').slice(0, 600)}`);
      }
    }
    return;
  }

  if (cmd === 'call') {
    const [name, argsJson] = rest;
    await connect();
    const result = await rpc('tools/call', { name, arguments: argsJson ? JSON.parse(argsJson) : {} });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'capture') {
    const url = rest[0] ?? 'http://localhost:3007';
    const fileName = rest[1] ?? 'ShadowFlow · 论文平台';
    await connect();

    console.log(`[1/2] create_new_file → ${fileName}`);
    const created = await rpc('tools/call', {
      name: 'create_new_file',
      arguments: { name: fileName, planKey: 'team::team' },
    });
    const payload = created?.content?.find((c) => c.type === 'text')?.text ?? JSON.stringify(created);
    console.log('   raw:', payload.slice(0, 1200));
    const fileKey = payload.match(/(?:file_?[Kk]ey["'\s:]+)([A-Za-z0-9]{10,})/)?.[1]
      ?? payload.match(/figma\.com\/design\/([A-Za-z0-9]+)/)?.[1];
    if (!fileKey) throw new Error('没从 create_new_file 回包里解析出 fileKey，见上面 raw');

    console.log(`[2/2] generate_figma_design → ${url} (fileKey=${fileKey})`);
    const cap = await rpc('tools/call', {
      name: 'generate_figma_design',
      arguments: { fileKey, url, viewport: { width: 1440, height: 900 } },
    });
    console.log(JSON.stringify(cap, null, 2).slice(0, 3000));
    console.log(`\nFigma 文件：https://www.figma.com/design/${fileKey}`);
    return;
  }

  console.error(`未知命令: ${cmd}（可用: tools | call | capture）`);
  process.exit(2);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
