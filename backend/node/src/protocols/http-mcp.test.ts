/**
 * http-mcp.test.ts — MCP over HTTP 客户端单测（本地 node:http 服务，不访问外网）
 *
 * 覆盖：
 *   1. Streamable HTTP：JSON 响应 + Mcp-Session-Id 保存/复用
 *   2. Streamable HTTP：text/event-stream 响应（帧跨 chunk 拼接）
 *   3. 旧版 SSE：POST 405 时回退 → endpoint 握手 → message 帧按 id 匹配
 *   4. 401 → MCP_HTTP_AUTH（不触发 SSE 回退）
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect } from 'vitest';
import { HttpMcpClient } from './http-mcp';

const INIT_RESULT = {
  protocolVersion: '2024-11-05',
  capabilities: {},
  serverInfo: { name: 'mock', version: '1.0.0' },
};
const TOOLS = [{ name: 'echo', description: 'Echo back' }];
const CALL_RESULT = { content: [{ type: 'text', text: 'echo-ok' }] };

interface TestServer {
  url: string;
  close: () => Promise<void>;
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim().length === 0) return null;
  return JSON.parse(text) as Record<string, unknown>;
}

async function startServer(handler: http.RequestListener): Promise<TestServer> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

function resultFor(method: string): unknown {
  if (method === 'initialize') return INIT_RESULT;
  if (method === 'tools/list') return { tools: TOOLS };
  if (method === 'tools/call') return CALL_RESULT;
  return {};
}

describe('HttpMcpClient（Streamable HTTP）', () => {
  it('JSON 响应：initialize → tools/list → tools/call，复用 Mcp-Session-Id', async () => {
    const seen: Array<{ method: string; session?: string; accept: string; contentType?: string }> = [];
    const server = await startServer(async (req, res) => {
      const body = await readJson(req);
      if (!body) {
        res.writeHead(202);
        res.end();
        return;
      }
      const method = String(body.method);
      seen.push({
        method,
        session: req.headers['mcp-session-id'] as string | undefined,
        accept: String(req.headers.accept ?? ''),
        contentType: req.headers['content-type'] as string | undefined,
      });
      if (method === 'notifications/initialized') {
        res.writeHead(202);
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        ...(method === 'initialize' ? { 'Mcp-Session-Id': 'sess-1' } : {}),
      });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: resultFor(method) }));
    });

    try {
      const client = await HttpMcpClient.connect({ url: `${server.url}/mcp` });
      expect(client.transportMode).toBe('streamable');
      expect(await client.listTools()).toEqual(TOOLS);
      const call = (await client.callTool('echo', { goal: 'x' })) as { content: Array<{ text: string }> };
      expect(call.content[0].text).toBe('echo-ok');
      await client.close();

      const listCall = seen.find((s) => s.method === 'tools/list');
      expect(listCall?.session).toBe('sess-1');
      expect(listCall?.accept).toContain('application/json');
      expect(listCall?.accept).toContain('text/event-stream');
      expect(listCall?.contentType).toContain('application/json');
      expect(seen.some((s) => s.method === 'notifications/initialized')).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('SSE 响应：按 id 从 message 帧取值（帧跨 chunk）', async () => {
    const server = await startServer(async (req, res) => {
      const body = await readJson(req);
      if (!body || body.method === 'notifications/initialized') {
        res.writeHead(202);
        res.end();
        return;
      }
      const result = resultFor(String(body.method));
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      // 先发一个无关 notification 帧，再分两段写真正的响应帧
      res.write('event: message\ndata: {"jsonrpc":"2.0","method":"notifications/message"}\n\n');
      const frame = `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result })}\n\n`;
      res.write(frame.slice(0, 10));
      res.write(frame.slice(10));
      res.end();
    });

    try {
      const client = await HttpMcpClient.connect({ url: `${server.url}/mcp` });
      expect(await client.listTools()).toEqual(TOOLS);
      const call = (await client.callTool('echo', { goal: 'y' })) as { content: Array<{ text: string }> };
      expect(call.content[0].text).toBe('echo-ok');
      await client.close();
    } finally {
      await server.close();
    }
  });
});

describe('HttpMcpClient（旧版 SSE 回退）', () => {
  it('Streamable POST 405 → GET SSE endpoint 握手 → POST /messages → message 帧响应', async () => {
    const streams = new Set<http.ServerResponse>();
    const posts: string[] = [];
    const server = await startServer(async (req, res) => {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        streams.add(res);
        req.on('close', () => streams.delete(res));
        res.write('event: endpoint\ndata: /messages?sessionId=abc\n\n');
        return;
      }
      posts.push(String(req.url));
      if (req.url?.startsWith('/messages')) {
        const body = await readJson(req);
        res.writeHead(202);
        res.end();
        if (!body || typeof body.id !== 'number') return;
        const frame = `event: message\ndata: ${JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: resultFor(String(body.method)),
        })}\n\n`;
        for (const stream of streams) stream.write(frame);
        return;
      }
      // /mcp（Streamable 入口）：明确不支持 POST
      res.writeHead(405);
      res.end('streamable unsupported');
    });

    try {
      const client = await HttpMcpClient.connect({ url: `${server.url}/mcp` });
      expect(client.transportMode).toBe('sse');
      expect(await client.listTools()).toEqual(TOOLS);
      const call = (await client.callTool('echo', { goal: 'z' })) as { content: Array<{ text: string }> };
      expect(call.content[0].text).toBe('echo-ok');
      await client.close();

      expect(posts[0]).toBe('/mcp'); // 先试 Streamable
      expect(posts.some((p) => p.startsWith('/messages'))).toBe(true);
    } finally {
      await server.close();
    }
  });
});

describe('HttpMcpClient（鉴权失败）', () => {
  it('401 → MCP_HTTP_AUTH，且不回退旧版 SSE', async () => {
    let getCount = 0;
    const server = await startServer((req, res) => {
      if (req.method === 'GET') getCount += 1;
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"error":"unauthorized"}');
    });

    try {
      await expect(HttpMcpClient.connect({ url: `${server.url}/mcp` })).rejects.toMatchObject({
        code: 'MCP_HTTP_AUTH',
      });
      expect(getCount).toBe(0);
    } finally {
      await server.close();
    }
  });
});
