/**
 * AgentGraph × 0G KV Bridge
 *
 * Thin HTTP server that wraps @0glabs/0g-ts-sdk KV Store so Python can
 * call it without a native SDK.
 *
 * Endpoints:
 *   PUT  /kv/:key         body: { "value": "<string>" }
 *   GET  /kv/:key         → { "ok": true, "value": "<string>" }
 *   GET  /kv/list/:prefix → { "ok": true, "keys": ["..."] }
 *   GET  /health          → { "ok": true }
 *
 * Required env:
 *   ZEROG_PRIVATE_KEY   — wallet private key with 0G testnet tokens
 *
 * Optional env:
 *   PORT                — listen port (default 3001)
 *   ZEROG_RPC_URL       — 0G RPC endpoint (default testnet)
 *   ZEROG_KV_ADDRESS    — 0G KV contract address (default testnet)
 *
 * Run:
 *   npx ts-node bridge/index.ts
 *   # or after build:
 *   node bridge/dist/index.js
 */

import http from "http";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// 0G SDK integration (lazy-imported so bridge boots even without SDK)
// ---------------------------------------------------------------------------

// 0G KV context (lazy-initialized)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let zerogCtx: any = null;

const ZEROG_TESTNET_RPC     = "https://evmrpc-testnet.0g.ai";
const ZEROG_TESTNET_FLOW    = "0xbD2C3F0E65eDF5582141C35969d66e34629cC768";
const ZEROG_TESTNET_KV_RPC  = "https://0g-storage-kv-testnet-rpc.0g.ai";

async function getZerogCtx(): Promise<any> {
  if (zerogCtx) return zerogCtx;

  const privateKey = process.env.ZEROG_PRIVATE_KEY;
  if (!privateKey) throw new Error("ZEROG_PRIVATE_KEY env var is required");

  // Use require() to avoid esm/cjs dual-package type conflicts
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sdk    = require("@0glabs/0g-ts-sdk");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ethers = require("ethers");

  const rpcUrl   = process.env.ZEROG_RPC_URL      || ZEROG_TESTNET_RPC;
  const kvRpc    = process.env.ZEROG_KV_RPC       || ZEROG_TESTNET_KV_RPC;
  const flowAddr = process.env.ZEROG_FLOW_ADDR    || ZEROG_TESTNET_FLOW;
  const nodeUrls = (process.env.ZEROG_STORAGE_NODES || "https://storage-testnet.0g.ai").split(",");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer   = new ethers.Wallet(privateKey, provider);
  const flow     = sdk.getFlowContract(flowAddr, signer);
  const kvReader = new sdk.KvClient(kvRpc);

  zerogCtx = { sdk, ethers, kvReader, signer, flow, storageNodes: nodeUrls, rpcUrl, provider };
  console.log(`[bridge] 0G ctx ready  rpc=${rpcUrl}  flow=${flowAddr}`);
  return zerogCtx;
}

// ---------------------------------------------------------------------------
// In-memory fallback store (used when 0G SDK not installed / testnet down)
// ---------------------------------------------------------------------------

const memStore = new Map<string, string>();

function useMemFallback(): boolean {
  return process.env.ZEROG_FALLBACK === "1" || !process.env.ZEROG_PRIVATE_KEY;
}

// ---------------------------------------------------------------------------
// KV operations (0G or in-memory fallback)
// ---------------------------------------------------------------------------

async function kvPut(key: string, value: string): Promise<void> {
  if (useMemFallback()) {
    memStore.set(key, value);
    return;
  }
  const ctx = await getZerogCtx();

  // Build storage node clients
  const clients = ctx.storageNodes.map((url: string) => new ctx.sdk.StorageNode(url));

  // Batcher(version, clients, flowContract, ethersProvider)
  const batcher = new ctx.sdk.Batcher(0, clients, ctx.flow, ctx.provider);

  // streamId = sha256(key), kvField = Buffer.from("v")
  const streamId = deriveStreamId(key);
  const encoded  = Buffer.from(value, "utf8");
  batcher.streamDataBuilder.set(streamId, Buffer.from("v"), encoded);

  const result = await batcher.exec();
  const txHash = Array.isArray(result) ? result[0] : result;
  console.log(`[bridge] 0G put  key=${key}  tx=${txHash}`);
}

async function kvGet(key: string): Promise<string | null> {
  if (useMemFallback()) {
    return memStore.get(key) ?? null;
  }
  const ctx = await getZerogCtx();
  const streamId = deriveStreamId(key);
  try {
    // getValue(streamId, key, startIndex, length, version?)
    const bytes: Uint8Array | null = await ctx.kvReader.getValue(
      streamId, Buffer.from("v"), 0, 0
    );
    return bytes && bytes.length > 0 ? Buffer.from(bytes).toString("utf8") : null;
  } catch {
    return null;
  }
}

async function kvList(prefix: string): Promise<string[]> {
  if (useMemFallback()) {
    return Array.from(memStore.keys()).filter((k) => k.startsWith(prefix));
  }
  // 0G KV doesn't have native prefix-list — we enumerate using a stored index
  // key: "agentgraph/_index/{prefix_hash}" value: JSON array of keys
  const indexKey = `_index:${prefix}`;
  const raw = await kvGet(indexKey);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function kvPutWithIndex(key: string, value: string): Promise<void> {
  await kvPut(key, value);

  if (!useMemFallback()) {
    // Maintain index for list queries
    const prefix = key.substring(0, key.lastIndexOf("/") + 1);
    const indexKey = `_index:${prefix}`;
    const existing = await kvList(prefix);
    if (!existing.includes(key)) {
      await kvPut(indexKey, JSON.stringify([...existing, key]));
    }
  }
}

// Derive a deterministic 32-byte stream ID from key string
function deriveStreamId(key: string): string {
  return "0x" + createHash("sha256").update(key).digest("hex");
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function send(
  res: http.ServerResponse,
  status: number,
  body: object
): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(json);
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  try {
    // Health check
    if (method === "GET" && url === "/health") {
      const mode = useMemFallback() ? "memory-fallback" : "0g-kv";
      send(res, 200, { ok: true, mode });
      return;
    }

    // GET /kv/list/:prefix — must match before GET /kv/:key
    const listMatch = url.match(/^\/kv\/list\/(.+)$/);
    if (method === "GET" && listMatch) {
      const prefix = decodeURIComponent(listMatch[1]);
      const keys = await kvList(prefix);
      send(res, 200, { ok: true, keys });
      return;
    }

    // PUT /kv/:key
    const kvMatch = url.match(/^\/kv\/(.+)$/);
    if (method === "PUT" && kvMatch) {
      const key = decodeURIComponent(kvMatch[1]);
      const bodyText = await readBody(req);
      const { value } = JSON.parse(bodyText);
      if (typeof value !== "string") {
        send(res, 400, { ok: false, error: "body.value must be a string" });
        return;
      }
      await kvPutWithIndex(key, value);
      send(res, 200, { ok: true, key });
      return;
    }

    // GET /kv/:key
    if (method === "GET" && kvMatch) {
      const key = decodeURIComponent(kvMatch[1]);
      const value = await kvGet(key);
      if (value === null) {
        send(res, 404, { ok: false, error: "not found" });
        return;
      }
      send(res, 200, { ok: true, value });
      return;
    }

    send(res, 404, { ok: false, error: "not found" });
  } catch (err: any) {
    console.error("[bridge]", err.message);
    send(res, 500, { ok: false, error: err.message });
  }
});

const PORT = parseInt(process.env.PORT ?? "3001", 10);
server.listen(PORT, () => {
  const mode = useMemFallback()
    ? "memory-fallback (set ZEROG_PRIVATE_KEY + unset ZEROG_FALLBACK for real 0G)"
    : "0G KV Store";
  console.log(`[bridge] Listening on :${PORT}  mode=${mode}`);
});
