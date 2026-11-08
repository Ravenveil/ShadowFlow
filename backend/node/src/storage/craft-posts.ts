/**
 * craft-posts.ts — 小红书博文数据层（craft 域扩展，2026-11-08）。
 *
 * 博文（craft_posts）：AI 草拟 → 用户确认 → 发布 的单向状态机，
 *   draft → confirmed → published（终态）。非法迁移抛 422 INVALID_TRANSITION，
 *   同状态 PATCH 是幂等 no-op（重试安全，不重复落标记）。
 *   发布即冻结（2026-11-08）：published 后内容字段（title/body/topics/images/
 *   product_id）不可再改——真改动 422 FROZEN，同值幂等 no-op 放行。
 *
 * 发布动作（status→published）同时落 [post] 社媒标记 —— 复用 craft-markers
 * 落库通道（storage/craft-intake.applyCraftMarkers），不手写重复逻辑：
 * 标记会走既有链路（营销运营动态 + 社媒发布域 mock 发帖）。fail-soft：
 * 标记落库失败/降级只记进返回结果（可见），不回滚发布状态。
 *
 * 商品关联：posts.product_id 引 cp_products.id（可空）；商品侧反向引用
 * source_post_id 在 craft-profit（cp_products 扩展列）。引用存在性校验放
 * 本层/路由层，craft-profit 不 import 本模块（避免循环依赖）。
 *
 * 与 merchant-board / craft-profit 同仓库风格：外接模块、自带幂等 DDL、
 * topics/images 以 JSON TEXT 存、读出即解析成数组（前端不碰 JSON 字符串）。
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from './sqlite';
import { getProduct } from './craft-profit';
import { applyCraftMarkers } from './craft-intake';

const DAY_MS = 24 * 60 * 60 * 1000;

const DDL = `
CREATE TABLE IF NOT EXISTS craft_posts (
  post_id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  topics TEXT NOT NULL DEFAULT '[]',
  images TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  product_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_craft_posts_status ON craft_posts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_craft_posts_product ON craft_posts(product_id);
`;

/** 以库文件为 key 记已建表；测试 _resetForTests() 换库后会自动重建。 */
const ready = new Set<string>();

function db(): Database.Database {
  const conn = getDb();
  const key = (conn as { name?: string }).name ?? 'default';
  if (!ready.has(key)) {
    conn.exec(DDL);
    ready.add(key);
  }
  return conn;
}

export class CraftPostError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'INVALID_INPUT') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ── 类型 ─────────────────────────────────────────────────────────────────────

export type PostStatus = 'draft' | 'confirmed' | 'published';

/** 聊天附件形态的图片项（name/path/url/is_image）。 */
export interface PostImage {
  name: string;
  path: string;
  url: string;
  is_image: boolean;
}

export interface CraftPost {
  post_id: string;
  title: string;
  body: string;
  topics: string[];
  images: PostImage[];
  status: PostStatus;
  /** 关联商品（cp_products.id，null = 未关联）。 */
  product_id: string | null;
  created_at: number;
  updated_at: number;
  published_at: number | null;
}

/** 发布时落 [post] 社媒标记的结果（fail-soft，可见不静默）。 */
export interface MarkerResult {
  ok: boolean;
  detail: string;
}

// ── 状态机（单向：draft → confirmed → published）───────────────────────────

export const POST_STATUSES: PostStatus[] = ['draft', 'confirmed', 'published'];

const NEXT_STATUS: Record<PostStatus, PostStatus[]> = {
  draft: ['confirmed'],
  confirmed: ['published'],
  published: [],
};

// ── 输入校验 ─────────────────────────────────────────────────────────────────

function text(v: unknown, max: number, field: string, required = false): string {
  const s = typeof v === 'string' ? v.trim().slice(0, max) : '';
  if (required && !s) throw new CraftPostError(`${field} is required`);
  return s;
}

/** topics：字符串数组（≤20 条，每条 ≤64 字，空项滤掉）；非数组 400。 */
function topicsOf(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new CraftPostError('topics 必须是字符串数组');
  if (v.length > 20) throw new CraftPostError('topics 最多 20 条');
  return v.map((t) => {
    if (typeof t !== 'string') throw new CraftPostError('topics 每项必须是字符串');
    return t.trim().slice(0, 64);
  }).filter(Boolean);
}

const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|heic|avif|svg)$/i;

function looksLikeImage(item: { name: string; path: string; url: string }): boolean {
  return IMG_EXT.test(item.name) || IMG_EXT.test(item.path) || IMG_EXT.test(item.url);
}

/** images：聊天附件对象数组（≤18 张），字段归一 {name,path,url,is_image}。 */
function imagesOf(v: unknown): PostImage[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new CraftPostError('images 必须是附件对象数组');
  if (v.length > 18) throw new CraftPostError('images 最多 18 张');
  return v.map((raw) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new CraftPostError('images 每项必须是 {name,path,url,is_image} 对象');
    }
    const o = raw as Record<string, unknown>;
    const item = {
      name: typeof o.name === 'string' ? o.name.trim().slice(0, 255) : '',
      path: typeof o.path === 'string' ? o.path.trim().slice(0, 1024) : '',
      url: typeof o.url === 'string' ? o.url.trim().slice(0, 2048) : '',
      is_image: false,
    };
    // is_image 缺省按扩展名猜；给了就信给的。
    item.is_image =
      typeof o.is_image === 'boolean' ? o.is_image : looksLikeImage(item);
    return item;
  });
}

/** status 校验；create 只收 draft|confirmed（发布必须走 PATCH 状态迁移）。 */
function statusOf(v: unknown, allowed: PostStatus[]): PostStatus {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!allowed.includes(s as PostStatus)) {
    const hint =
      s === 'published' && !allowed.includes('published')
        ? '（创建不能直接 published，请先建 draft/confirmed 再经 PATCH 发布）'
        : '';
    throw new CraftPostError(
      `status 非法: ${s || '(空)'}（可选 ${allowed.join('|')}）${hint}`,
    );
  }
  return s as PostStatus;
}

/** 商品引用：空/null 清空（存 NULL）；有值必须已上架存在（422）。 */
function productRefOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === 'string' ? v.trim().slice(0, 128) : '';
  if (!s) return null;
  if (!getProduct(s)) {
    throw new CraftPostError(`关联商品不存在: ${s}`, 422, 'PRODUCT_NOT_FOUND');
  }
  return s;
}

// ── 行 ↔ 对象（topics/images JSON 解析，读出即数组）────────────────────────

interface PostRow {
  post_id: string;
  title: string;
  body: string;
  topics: string;
  images: string;
  status: string;
  product_id: string | null;
  created_at: number;
  updated_at: number;
  published_at: number | null;
}

function parseJsonArray<T>(raw: string): T[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function rowToPost(row: PostRow): CraftPost {
  return {
    post_id: row.post_id,
    title: row.title,
    body: row.body,
    topics: parseJsonArray<string>(row.topics),
    images: parseJsonArray<PostImage>(row.images),
    status: row.status as PostStatus,
    product_id: row.product_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    published_at: row.published_at,
  };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export function createPost(input: {
  title?: unknown;
  body?: unknown;
  topics?: unknown;
  images?: unknown;
  status?: unknown;
  product_id?: unknown;
}): CraftPost {
  const now = Date.now();
  const row: PostRow = {
    post_id: randomUUID(),
    title: text(input.title, 500, 'title'),
    body: text(input.body, 10000, 'body'),
    topics: JSON.stringify(topicsOf(input.topics)),
    images: JSON.stringify(imagesOf(input.images)),
    status:
      input.status === undefined || input.status === null || input.status === ''
        ? 'draft'
        : statusOf(input.status, ['draft', 'confirmed']),
    product_id: productRefOf(input.product_id),
    created_at: now,
    updated_at: now,
    published_at: null,
  };
  db()
    .prepare(
      `INSERT INTO craft_posts
         (post_id, title, body, topics, images, status, product_id, created_at, updated_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.post_id,
      row.title,
      row.body,
      row.topics,
      row.images,
      row.status,
      row.product_id,
      row.created_at,
      row.updated_at,
      row.published_at,
    );
  return rowToPost(row);
}

/** 列表：可选 status 过滤（非法 400）+ days 窗口过滤（created_at ≥ now−days）。 */
export function listPosts(opts: { status?: string; days?: number } = {}): CraftPost[] {
  const where: string[] = [];
  const params: unknown[] = [];
  const status = typeof opts.status === 'string' && opts.status.trim() ? opts.status.trim() : '';
  if (status) {
    if (!POST_STATUSES.includes(status as PostStatus)) {
      throw new CraftPostError(`status 非法: ${status}（可选 draft|confirmed|published）`);
    }
    where.push('status = ?');
    params.push(status);
  }
  if (opts.days !== undefined && Number.isFinite(opts.days) && opts.days > 0) {
    const d = Math.min(Math.round(opts.days), 365);
    where.push('created_at >= ?');
    params.push(Date.now() - d * DAY_MS);
  }
  const rows = db()
    .prepare(
      `SELECT * FROM craft_posts
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC, post_id DESC`,
    )
    .all(...params) as PostRow[];
  return rows.map(rowToPost);
}

/** 单条查找；没有返回 undefined（路由层转 404）。 */
export function getPost(postId: string): CraftPost | undefined {
  const row = db().prepare(`SELECT * FROM craft_posts WHERE post_id = ?`).get(postId) as
    | PostRow
    | undefined;
  return row ? rowToPost(row) : undefined;
}

/**
 * 商品删除级联（2026-11-08 卡片生命周期）：卡片与商品同生共死——删商品前
 * 调用，连删其博文卡（product_id 直挂 或 商品 source_post_id 反引，管道
 * 「回挂」两条链路都覆盖）。必须在删商品行【之前】调用（反引依赖商品行还在）。
 * 返回删除条数。
 */
export function deletePostsForProduct(productId: string): number {
  const id = String(productId ?? '').trim();
  if (!id) return 0;
  const r = db()
    .prepare(
      `DELETE FROM craft_posts
        WHERE product_id = ?
           OR post_id = (SELECT source_post_id FROM cp_products WHERE id = ?)`,
    )
    .run(id, id);
  return r.changes;
}

// ── PATCH（内容更新 + 状态机迁移 + 发布落 [post] 标记）───────────────────────

/**
 * 发布落标：合成一行 [post] 标记走 applyCraftMarkers 既有落库通道
 * （营销动态 + 社媒发布域）。media 随帖透传（2026-11-08 协议扩展）：
 * post.images 原样进 media（{name,path,url,is_image} 同构、≤18，库里已归一）。
 * fail-soft：任何失败降级为结果描述，不抛。
 */
async function firePostMarker(post: CraftPost): Promise<MarkerResult> {
  const line = `[post] ${JSON.stringify({
    platform: '小红书',
    title: post.title,
    text: post.body,
    media: post.images,
  })}`;
  try {
    const { applied } = await applyCraftMarkers(line, { scoped: true });
    const a = applied[0];
    if (!a) return { ok: false, detail: '标记未产生动作' };
    return { ok: a.ok, detail: a.detail ?? a.error ?? '' };
  } catch (err) {
    return { ok: false, detail: `标记落库异常: ${(err as Error).message}` };
  }
}

/** 同值判定（topics/images 数组按 JSON 序比，顺序敏感——归一化后键序固定）。 */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * PATCH：字段缺省（undefined）不动；product_id=null 清空关联。
 * 状态机单向（draft→confirmed→published），非法迁移抛 422 且整单不落库；
 * 同状态重复 PATCH 是幂等 no-op（不重复落 [post] 标记）。
 * 发布即冻结（2026-11-08）：published 后内容字段（title/body/topics/images/
 * product_id）不可再改——真改动抛 422 FROZEN 且整单不落库，同值幂等 no-op 放行
 * （不写库、不落标记）。
 * 迁移到 published 时同步落 [post] 社媒标记，结果随返回可见。
 */
export async function updatePost(
  postId: string,
  patch: {
    title?: unknown;
    body?: unknown;
    topics?: unknown;
    images?: unknown;
    status?: unknown;
    product_id?: unknown;
  },
): Promise<{ post: CraftPost; marker?: MarkerResult }> {
  const conn = db();
  const row = conn.prepare(`SELECT * FROM craft_posts WHERE post_id = ?`).get(postId) as
    | PostRow
    | undefined;
  if (!row) throw new CraftPostError(`博文不存在: ${postId}`, 404, 'POST_NOT_FOUND');
  const cur = rowToPost(row);

  // ① 请求值归一化（非法输入即时 400/422，先于一切状态判定）
  const want: {
    title?: string;
    body?: string;
    topics?: string[];
    images?: PostImage[];
    product_id?: string | null;
  } = {};
  if (patch.title !== undefined) want.title = text(patch.title, 500, 'title');
  if (patch.body !== undefined) want.body = text(patch.body, 10000, 'body');
  if (patch.topics !== undefined) want.topics = topicsOf(patch.topics);
  if (patch.images !== undefined) want.images = imagesOf(patch.images);
  if (patch.product_id !== undefined) want.product_id = productRefOf(patch.product_id);

  // ② 状态机（单向；同状态幂等 no-op）。非法迁移优先于冻结判定报 INVALID_TRANSITION。
  let transitionedToPublished = false;
  let statusChanged = false;
  let nextStatus: PostStatus = cur.status;
  if (patch.status !== undefined && patch.status !== null && patch.status !== '') {
    const target = statusOf(patch.status, POST_STATUSES);
    if (target !== cur.status) {
      if (!NEXT_STATUS[cur.status].includes(target)) {
        throw new CraftPostError(
          `状态不能从 ${cur.status} 迁移到 ${target}（单向：draft→confirmed→published）`,
          422,
          'INVALID_TRANSITION',
        );
      }
      statusChanged = true;
      nextStatus = target;
      if (target === 'published') transitionedToPublished = true;
    }
    // 同状态 → no-op（幂等重试安全）
  }

  // ③ 发布即冻结：published 后内容字段真改动 → 422 FROZEN，整单不落库；
  //    同值请求是幂等 no-op（放行到 ④ 后原样返回，不写库）。
  const contentChanged =
    (want.title !== undefined && want.title !== cur.title) ||
    (want.body !== undefined && want.body !== cur.body) ||
    (want.topics !== undefined && !sameJson(want.topics, cur.topics)) ||
    (want.images !== undefined && !sameJson(want.images, cur.images)) ||
    (want.product_id !== undefined && want.product_id !== cur.product_id);
  if (cur.status === 'published' && contentChanged) {
    throw new CraftPostError(
      '博文已发布，内容已冻结（title/body/topics/images/product_id 不可修改）',
      422,
      'FROZEN',
    );
  }

  // ④ 真无变化 → 幂等 no-op：不写库、不落标记、不动 updated_at
  if (!statusChanged && !contentChanged) {
    return { post: cur };
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (want.title !== undefined) {
    sets.push('title = ?');
    params.push(want.title);
  }
  if (want.body !== undefined) {
    sets.push('body = ?');
    params.push(want.body);
  }
  if (want.topics !== undefined) {
    sets.push('topics = ?');
    params.push(JSON.stringify(want.topics));
  }
  if (want.images !== undefined) {
    sets.push('images = ?');
    params.push(JSON.stringify(want.images));
  }
  if (want.product_id !== undefined) {
    sets.push('product_id = ?');
    params.push(want.product_id);
  }
  if (statusChanged) {
    sets.push('status = ?');
    params.push(nextStatus);
  }
  if (transitionedToPublished) {
    sets.push('published_at = ?');
    params.push(Date.now());
  }
  sets.push('updated_at = ?');
  params.push(Date.now());
  conn
    .prepare(`UPDATE craft_posts SET ${sets.join(', ')} WHERE post_id = ?`)
    .run(...params, postId);

  const post = getPost(postId) as CraftPost;
  if (transitionedToPublished) {
    return { post, marker: await firePostMarker(post) };
  }
  return { post };
}
