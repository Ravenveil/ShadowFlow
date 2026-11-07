/**
 * social-platforms/http.ts — real 适配器共享 HTTP 助手（2026-11-07）。
 *
 * 统一走全局 fetch（Node 18+）。约定：
 *   - 网络层失败（fetch reject / 超时）抛 NetworkError，由适配器映射 NETWORK_ERROR 回执；
 *   - HTTP 非 2xx 不抛——各平台错误几乎都在响应体里（errcode / error_code / code），
 *     由适配器按平台语义解析成 PLATFORM_REJECTED，避免丢平台错误信息。
 */

export interface ApiResponse {
  status: number;
  data: unknown;
}

export class NetworkError extends Error {}

export function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

export function asString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

async function parseBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function doFetch(url: string, init?: RequestInit): Promise<ApiResponse> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new NetworkError((e as Error).message || 'network error');
  }
  return { status: res.status, data: await parseBody(res) };
}

export async function getJson(url: string, headers?: Record<string, string>): Promise<ApiResponse> {
  return doFetch(url, { method: 'GET', headers });
}

export async function postJson(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<ApiResponse> {
  return doFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify(body),
  });
}

export async function postForm(
  url: string,
  fields: Record<string, string>,
  headers?: Record<string, string>,
): Promise<ApiResponse> {
  return doFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(headers ?? {}) },
    body: new URLSearchParams(fields),
  });
}

export interface MultipartFile {
  field: string;
  filename: string;
  bytes: Uint8Array;
  contentType: string;
}

export async function postMultipart(
  url: string,
  fields: Record<string, string>,
  files: MultipartFile[],
  headers?: Record<string, string>,
): Promise<ApiResponse> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const f of files) {
    form.append(f.field, new Blob([f.bytes], { type: f.contentType }), f.filename);
  }
  return doFetch(url, { method: 'POST', headers, body: form });
}

/** 快手直传接口要求 body 即纯二进制（不带 boundary/content-type 之外的封装）。 */
export async function postBinary(
  url: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<ApiResponse> {
  type FetchBody = NonNullable<RequestInit['body']>;
  return doFetch(url, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: bytes as unknown as FetchBody,
  });
}

/** 从 URL 拉素材字节（封面/图片/视频都走这里）。 */
export async function downloadBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new NetworkError((e as Error).message || 'network error');
  }
  if (!res.ok) {
    throw new NetworkError(`素材下载失败 HTTP ${res.status}: ${url}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim() || 'application/octet-stream';
  let filename = 'asset';
  try {
    const path = new URL(url).pathname;
    const last = path.split('/').pop();
    if (last) filename = last;
  } catch {
    /* URL 不合法时用默认名 */
  }
  return { bytes: buf, contentType, filename };
}
