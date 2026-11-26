/**
 * mcp.ts — MCP 服务器配置的 HTTP 客户端（设置里的「MCP 集成」分区用）。
 *
 * 对齐后端 routes/mcp：
 *   GET    /api/mcp/servers            全部已存服务器
 *   POST   /api/mcp/servers            新建（重名 409 / 字段不合法 400）
 *   PATCH  /api/mcp/servers/:name      改（不存在 404）
 *   DELETE /api/mcp/servers/:name      删（204）
 *   POST   /api/mcp/servers/:name/test 测已存服务器，返回工具列表与耗时
 *   POST   /api/mcp/probe              保存前试连（stdio 带 command/args/env，http 带 url/headers）
 *
 * 组件只认这里导出的函数与类型，不写 fetch、不认路径。
 */
import { ROUTES, request } from '@/shared/data/http/client';

/** 传输方式：stdio 在本机拉起子进程；http 连接已经跑起来的 HTTP/SSE 端点。 */
export type McpTransport = 'stdio' | 'http';

/** 一个 MCP 工具（试连 / 测试返回的清单项）。 */
export interface McpTool {
  name: string;
  description?: string;
}

/**
 * 已保存的 MCP 服务器。env 是明文键值对，只存在后端本机配置里。
 * 旧数据没有 transport，读取方一律按 'stdio' 处理。
 */
export interface McpServer {
  name: string;
  transport?: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  description?: string;
  updated_at: string;
}

/** 新建 / 编辑提交体。编辑时按 URL 上的旧名定位，body 里的 name 与之相同。 */
export interface McpServerInput {
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  description?: string;
}

/** 保存前试连的请求体（还没有名字）：stdio 必带 command，http 必带 url。 */
export interface McpProbeInput {
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

/** 测试 / 试连的结果。ok=false 时 error 一定有值，界面按失败展示，不能当成成功。 */
export interface McpTestResult {
  ok: boolean;
  tools: McpTool[];
  duration_ms: number;
  error?: { code: string; message: string };
}

export async function listMcpServers(): Promise<McpServer[]> {
  const res = await request<{ servers?: McpServer[] }>(ROUTES.mcpServers);
  return res?.servers ?? [];
}

export async function createMcpServer(input: McpServerInput): Promise<McpServer> {
  const res = await request<{ server: McpServer }>(ROUTES.mcpServers, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.server;
}

export async function updateMcpServer(name: string, input: McpServerInput): Promise<McpServer> {
  const res = await request<{ server: McpServer }>(ROUTES.mcpServer(name), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return res.server;
}

export async function deleteMcpServer(name: string): Promise<void> {
  await request<null>(ROUTES.mcpServer(name), { method: 'DELETE' });
}

export async function testMcpServer(name: string): Promise<McpTestResult> {
  return request<McpTestResult>(ROUTES.mcpServerTest(name), { method: 'POST' });
}

export async function probeMcpServer(input: McpProbeInput): Promise<McpTestResult> {
  return request<McpTestResult>(ROUTES.mcpProbe, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
