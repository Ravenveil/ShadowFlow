/**
 * routes.ts — Express router（Python create_memory_router :2283-2436 的 11 端点 1:1）。
 *
 * 约定：
 *   - 相对路径（'/packs'、'/packs/:packId/query' …），由 index.ts 挂载到
 *     /api/memory-bank（挂载由 team-lead 做，本文件不改 index.ts）。
 *   - 成功响应 = envelope(data, meta)：{data, meta:{trace_id, ...}}（:2338-2339）；
 *     例外：/query 直接返回 {data:{hits}, meta:{...}}（:2416-2425）。
 *   - 错误：MemoryBankError → status + {detail, error, code, message} 超集体。
 *   - body limit：本 router 自挂 express.json({limit:'10mb'})——全局 1mb 会挡住
 *     8MB 文本入库（express.text/json 中间件先于路由匹配，router 级覆盖）。
 *   - multipart：formidable@3.5.4（已在 node_modules），64MB 上限 + metadata JSON 校验。
 */

import express, { type Request, type Response, type NextFunction, type Router } from 'express';
import fs from 'fs';
import formidable from 'formidable';
import * as service from './service';
import { MemoryBankError, isMemoryBankError, memoryBankErrorHandler } from './errors';
import { LIMITS, mimeForExtension, MEMORY_CONFIG } from './config';
import type { SourceDict } from './types';

function traceId(): string {
  return `trace-${Math.random().toString(16).slice(2).padStart(12, '0').slice(0, 12)}`;
}

function envelope(data: unknown, meta: Record<string, unknown> = {}): unknown {
  return { data, meta: { trace_id: traceId(), ...meta } };
}

/** 统一错误出口：MemoryBankError → 超集体；其余 → 500 INGEST_FAILED 形态。 */
function sendError(res: Response, err: unknown): void {
  if (isMemoryBankError(err)) {
    const body = err.toDict();
    res.status(err.status).json({ detail: body, error: body, code: err.code, message: err.message });
    return;
  }
  const message = (err as Error)?.message ?? String(err);
  res.status(500).json({
    detail: { code: 'INTERNAL_ERROR', message },
    error: { code: 'INTERNAL_ERROR', message },
    code: 'INTERNAL_ERROR',
    message,
  });
}

/** 同步 handler 包装：任何 throw 进 sendError，不让异常炸 express 默认栈。 */
function sync(fn: (req: Request, res: Response) => void): (req: Request, res: Response) => void {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (err) {
      sendError(res, err);
    }
  };
}

// ── 请求体校验（对齐 Pydantic :2296-2318） ──────────────────────────────────

function parsePackBody(body: unknown): { name: string; description: string; metadata: Record<string, unknown> } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name : '';
  if (name.length < 1 || name.length > LIMITS.pack_name_max) {
    throw new MemoryBankError('INVALID_PACK_NAME', `name must be 1-${LIMITS.pack_name_max} characters`);
  }
  const description = typeof b.description === 'string' ? b.description : '';
  const metadata =
    b.metadata !== null && typeof b.metadata === 'object' && !Array.isArray(b.metadata)
      ? (b.metadata as Record<string, unknown>)
      : {};
  return { name, description, metadata };
}

function parseTextBody(body: unknown): {
  text: string;
  source_name: string;
  metadata: Record<string, unknown>;
  deduplicate: boolean;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const text = typeof b.text === 'string' ? b.text : '';
  if (text.length < 1 || text.length > LIMITS.text_max) {
    throw new MemoryBankError('EMPTY_TEXT', 'text must be 1-8000000 characters');
  }
  const source_name = typeof b.source_name === 'string' && b.source_name ? b.source_name : 'inline.txt';
  const metadata =
    b.metadata !== null && typeof b.metadata === 'object' && !Array.isArray(b.metadata)
      ? (b.metadata as Record<string, unknown>)
      : {};
  const deduplicate = b.deduplicate === undefined ? true : Boolean(b.deduplicate);
  return { text, source_name, metadata, deduplicate };
}

function parseQueryBody(body: unknown): {
  query: string;
  top_k: number;
  filters: Record<string, unknown>;
  query_variants: string[];
  use_reranker: boolean;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const query = typeof b.query === 'string' ? b.query : '';
  if (query.length < 1 || query.length > LIMITS.query_max) {
    throw new MemoryBankError('EMPTY_QUERY', 'query must be 1-8000 characters');
  }
  let top_k: number = LIMITS.top_k_default;
  if (b.top_k !== undefined) {
    const n = Number(b.top_k);
    if (!Number.isInteger(n) || n < LIMITS.top_k_min || n > LIMITS.top_k_http_max) {
      throw new MemoryBankError('INVALID_TOP_K', `top_k must be integer ${LIMITS.top_k_min}-${LIMITS.top_k_http_max}`);
    }
    top_k = n;
  }
  const filters =
    b.filters !== null && typeof b.filters === 'object' && !Array.isArray(b.filters)
      ? (b.filters as Record<string, unknown>)
      : {};
  const query_variants = Array.isArray(b.query_variants)
    ? (b.query_variants as unknown[]).slice(0, LIMITS.query_variants_max).map((v) => String(v))
    : [];
  const use_reranker = b.use_reranker === undefined ? true : Boolean(b.use_reranker);
  return { query, top_k, filters, query_variants, use_reranker };
}

function parseFolderBody(body: unknown): {
  path: string;
  recursive: boolean;
  metadata: Record<string, unknown>;
  deduplicate: boolean;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const folderPath = typeof b.path === 'string' ? b.path : '';
  if (folderPath.length < 1 || folderPath.length > LIMITS.path_max) {
    throw new MemoryBankError('INVALID_FOLDER', `path must be 1-${LIMITS.path_max} characters`);
  }
  const recursive = b.recursive === undefined ? true : Boolean(b.recursive);
  const metadata =
    b.metadata !== null && typeof b.metadata === 'object' && !Array.isArray(b.metadata)
      ? (b.metadata as Record<string, unknown>)
      : {};
  const deduplicate = b.deduplicate === undefined ? true : Boolean(b.deduplicate);
  return { path: folderPath, recursive, metadata, deduplicate };
}

function parseMetadataForm(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === '') return {};
  if (typeof raw !== 'string') {
    throw new MemoryBankError('INVALID_METADATA', 'Invalid metadata JSON: not a string');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new MemoryBankError('INVALID_METADATA', `Invalid metadata JSON: ${(err as Error).message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new MemoryBankError('INVALID_METADATA', 'metadata must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

// ── formidable multipart（form fields → fields; files → files） ─────────────

interface FormidableResult {
  fields: Record<string, string | string[] | undefined>;
  file: { buffer: Buffer; filename: string; mime: string };
}

function parseMultipart(req: Request): Promise<FormidableResult> {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: MEMORY_CONFIG.max_file_bytes,
      maxFiles: 1,
      allowEmptyFiles: false,
      minFileSize: 1,
    });
    let settled = false;
    form.parse(req, (err: Error | null, fields: Record<string, string | string[] | undefined>, files: Record<string, Array<{ filepath: string; originalFilename: string | null; mimetype: string | null }> | undefined>) => {
      if (settled) return;
      settled = true;
      if (err) {
        const message = (err as Error).message ?? '';
        const isTooLarge = /maxFileSize|File is too large/i.test(message);
        reject(
          isTooLarge
            ? new MemoryBankError('FILE_TOO_LARGE', 'Uploaded file exceeds the configured limit', 413)
            : new MemoryBankError('INVALID_UPLOAD', message || 'Upload parsing failed'),
        );
        return;
      }
      const upload = files.upload?.[0];
      if (!upload) {
        reject(new MemoryBankError('INVALID_UPLOAD', "multipart field 'upload' is required"));
        return;
      }
      const flat: Record<string, string | string[] | undefined> = {};
      for (const [k, v] of Object.entries(fields)) {
        flat[k] = Array.isArray(v) ? v[0] : v;
      }
      const buffer = fs.readFileSync(upload.filepath);
      resolve({
        fields: flat,
        file: { buffer, filename: upload.originalFilename ?? 'upload.bin', mime: upload.mimetype ?? '' },
      });
    });
  });
}

// ── Router 组装 ──────────────────────────────────────────────────────────────

export function createMemoryBankRouter(): Router {
  const router = express.Router();
  // 覆盖全局 1mb：text 入库允许 8M 字符。express.json 在 router 层先命中即生效。
  router.use(express.json({ limit: '10mb' }));
  router.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 1. POST /packs → 201
  router.post(
    '/packs',
    sync((req, res) => {
      const body = parsePackBody(req.body);
      const manifest = service.createPack(body.name, body.description, body.metadata);
      res.status(201).json(envelope(manifest));
    }),
  );

  // 2. GET /packs
  router.get(
    '/packs',
    sync((_req, res) => {
      const packs = service.listPacks();
      res.json(envelope({ packs }, { count: packs.length }));
    }),
  );

  // 3. GET /packs/:packId
  router.get(
    '/packs/:packId',
    sync((req, res) => {
      res.json(envelope(service.getPack(req.params.packId)));
    }),
  );

  // 4. DELETE /packs/:packId
  router.delete(
    '/packs/:packId',
    sync((req, res) => {
      service.deletePack(req.params.packId);
      res.json(envelope({ deleted: true, pack_id: req.params.packId }));
    }),
  );

  // 5. GET /packs/:packId/sources?include_history=
  router.get(
    '/packs/:packId/sources',
    sync((req, res) => {
      const includeHistory = req.query.include_history === 'true' || req.query.include_history === '1';
      const sources = service.listSources(req.params.packId, includeHistory);
      res.json(envelope({ sources }, { count: sources.length }));
    }),
  );

  // 6. DELETE /packs/:packId/sources/:sourceId
  router.delete(
    '/packs/:packId/sources/:sourceId',
    sync((req, res) => {
      service.removeSource(req.params.packId, req.params.sourceId);
      res.json(envelope({ deleted: true, source_id: req.params.sourceId }));
    }),
  );

  // 7. POST /packs/:packId/text
  router.post(
    '/packs/:packId/text',
    sync((req, res) => {
      const body = parseTextBody(req.body);
      const result: SourceDict & { pack_id: string; deduplicated: boolean } =
        service.ingestTextTyped(req.params.packId, body.text, body);
      res.json(envelope(result));
    }),
  );

  // 8. POST /packs/:packId/files → 201（multipart）
  router.post(
    '/packs/:packId/files',
    (req: Request, res: Response, _next: NextFunction) => {
      const contentType = req.headers['content-type'] ?? '';
      if (!contentType.includes('multipart/form-data')) {
        sendError(res, new MemoryBankError('INVALID_UPLOAD', 'Content-Type must be multipart/form-data'));
        return;
      }
      parseMultipart(req)
        .then((parsed) => {
          const metadata = parseMetadataForm(parsed.fields.metadata);
          if (parsed.file.buffer.length > MEMORY_CONFIG.max_file_bytes) {
            throw new MemoryBankError('FILE_TOO_LARGE', 'Uploaded file exceeds the configured limit', 413);
          }
          const result = service.ingestFileTyped(
            req.params.packId,
            parsed.file.buffer,
            parsed.file.filename,
            parsed.file.mime,
            metadata,
            true,
          );
          res.status(201).json(envelope(result));
        })
        .catch((err) => sendError(res, err));
    },
  );

  // 9. POST /packs/:packId/folders → 201
  router.post(
    '/packs/:packId/folders',
    sync((req, res) => {
      const body = parseFolderBody(req.body);
      const result = service.ingestFolderTyped(req.params.packId, body.path, body);
      res.status(201).json(envelope(result, { count: result.total }));
    }),
  );

  // 10. POST /packs/:packId/query —— 注意：直接 {data, meta}，不是 envelope 套 envelope
  router.post(
    '/packs/:packId/query',
    sync((req, res) => {
      const body = parseQueryBody(req.body);
      const result = service.query(req.params.packId, body);
      res.json(result);
    }),
  );

  // 11. GET /packs/:packId/blobs/:sha256 —— 裸字节 + immutable 缓存头
  router.get(
    '/packs/:packId/blobs/:sha256',
    sync((req, res) => {
      const { data, mimeType } = service.readBlob(req.params.packId, req.params.sha256);
      res.setHeader('Content-Type', mimeType || mimeForExtension(''));
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      res.send(data);
    }),
  );

  router.use(memoryBankErrorHandler as unknown as express.ErrorRequestHandler);
  return router;
}

export default createMemoryBankRouter;
