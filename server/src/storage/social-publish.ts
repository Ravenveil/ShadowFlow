/**
 * social-publish.ts — 社交发布域存储层（2026-11-07）。
 *
 * 产业方向（手工艺人代运营）的「营销发布」侧：账号（sp_accounts）→ 营销帖
 * （sp_posts，可挂 mb_products 商品一键生成）→ 发布回执（sp_publish_log）。
 *
 * 定位：挂在现有 Node/Express 后端上的外接模块，自带幂等 DDL，不改 sqlite.ts
 * 也不碰他人模块；发布出口走 lib/social-platforms 适配器（mock/real 双模）。
 *
 * 状态机：draft → publishing → published | failed。published 是终态（防重复
 * 发到真实平台）；failed 可重试，attempt 递增、每次尝试都落 log。
 * 所有写路径参数绑定；金额口径复用 mb_products（整数分）。
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from './sqlite';
import {
  findPlatform,
  getAdapter,
  type PlatformSpec,
  type PublishInput,
  type PublishReceipt,
} from '../lib/social-platforms';

const DDL = `
CREATE TABLE IF NOT EXISTS sp_accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  account_name TEXT NOT NULL,
  auth_mode TEXT NOT NULL DEFAULT 'mock',
  credentials TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sp_accounts_platform ON sp_accounts(platform);
CREATE TABLE IF NOT EXISTS sp_posts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  media TEXT NOT NULL DEFAULT '[]',
  product_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  external_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  published_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sp_posts_status ON sp_posts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sp_posts_account ON sp_posts(account_id);
CREATE TABLE IF NOT EXISTS sp_publish_log (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  request TEXT NOT NULL DEFAULT '{}',
  response TEXT NOT NULL DEFAULT '{}',
  external_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sp_log_post ON sp_publish_log(post_id, attempt);
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

export class SocialPublishError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface AccountRow {
  id: string;
  platform: string;
  account_name: string;
  auth_mode: string;
  credentials: string;
  status: string;
  created_at: number;
}

export interface PostRow {
  id: string;
  account_id: string;
  platform: string;
  title: string;
  content: string;
  media: string;
  product_id: string;
  status: string;
  external_id: string | null;
  error: string | null;
  created_at: number;
  published_at: number | null;
}

export interface PublishLogRow {
  id: string;
  post_id: string;
  platform: string;
  attempt: number;
  status: string;
  request: string;
  response: string;
  external_id: string | null;
  created_at: number;
}

// ── 账号 ──────────────────────────────────────────────────────────────────────

export function createAccount(input: {
  platform: string;
  account_name: string;
  auth_mode?: string;
  credentials?: unknown;
}): AccountRow {
  const spec = findPlatform(String(input.platform ?? ''));
  if (!spec) {
    throw new SocialPublishError(400, 'UNKNOWN_PLATFORM', `不支持的平台: ${input.platform}`);
  }
  const name = String(input.account_name ?? '').trim().slice(0, 64);
  if (!name) {
    throw new SocialPublishError(400, 'INVALID_ACCOUNT_NAME', 'account_name 不能为空');
  }
  const authMode = input.auth_mode === 'real' ? 'real' : 'mock';
  const credentials = JSON.stringify(input.credentials ?? {});
  const row: AccountRow = {
    id: randomUUID(),
    platform: spec.id,
    account_name: name,
    auth_mode: authMode,
    credentials,
    status: 'active',
    created_at: Date.now(),
  };
  db()
    .prepare(
      `INSERT INTO sp_accounts (id, platform, account_name, auth_mode, credentials, status, created_at)
       VALUES (@id, @platform, @account_name, @auth_mode, @credentials, @status, @created_at)`,
    )
    .run(row);
  return row;
}

export function listAccounts(): AccountRow[] {
  return db()
    .prepare('SELECT * FROM sp_accounts ORDER BY created_at ASC')
    .all() as AccountRow[];
}

export function getAccount(id: string): AccountRow | undefined {
  return db().prepare('SELECT * FROM sp_accounts WHERE id = ?').get(id) as AccountRow | undefined;
}

export function deleteAccount(id: string): void {
  const account = getAccount(id);
  if (!account) {
    throw new SocialPublishError(404, 'ACCOUNT_NOT_FOUND', `账号不存在: ${id}`);
  }
  const used = db()
    .prepare('SELECT COUNT(*) AS n FROM sp_posts WHERE account_id = ?')
    .get(id) as { n: number };
  if (used.n > 0) {
    throw new SocialPublishError(409, 'ACCOUNT_HAS_POSTS', '账号下已有帖子，不能删除');
  }
  db().prepare('DELETE FROM sp_accounts WHERE id = ?').run(id);
}

// ── 帖子 ──────────────────────────────────────────────────────────────────────

function parseMedia(spec: PlatformSpec, media: unknown): string[] {
  if (media == null) return [];
  if (!Array.isArray(media) || media.some((m) => typeof m !== 'string')) {
    throw new SocialPublishError(400, 'INVALID_MEDIA', 'media 必须是字符串数组');
  }
  const list = media as string[];
  if (list.length > spec.max_media) {
    throw new SocialPublishError(400, 'MEDIA_LIMIT', `${spec.name} 最多 ${spec.max_media} 张图`);
  }
  return list.map((m) => String(m).slice(0, 2048));
}

export function createPost(input: {
  account_id: string;
  title?: string;
  content?: string;
  media?: unknown;
  product_id?: string;
}): PostRow {
  const account = getAccount(String(input.account_id ?? ''));
  if (!account) {
    throw new SocialPublishError(404, 'ACCOUNT_NOT_FOUND', `账号不存在: ${input.account_id}`);
  }
  const spec = findPlatform(account.platform);
  if (!spec) {
    throw new SocialPublishError(400, 'UNKNOWN_PLATFORM', `不支持的平台: ${account.platform}`);
  }
  const title = String(input.title ?? '').trim();
  const content = String(input.content ?? '').trim();
  if (!content) {
    throw new SocialPublishError(400, 'INVALID_CONTENT', 'content 不能为空');
  }
  if (spec.title_max > 0 && title.length > spec.title_max) {
    throw new SocialPublishError(400, 'TITLE_LIMIT', `${spec.name} 标题最多 ${spec.title_max} 字`);
  }
  if (content.length > spec.content_max) {
    throw new SocialPublishError(400, 'CONTENT_LIMIT', `${spec.name} 正文最多 ${spec.content_max} 字`);
  }
  const media = parseMedia(spec, input.media);
  const row: PostRow = {
    id: randomUUID(),
    account_id: account.id,
    platform: account.platform,
    title,
    content,
    media: JSON.stringify(media),
    product_id: String(input.product_id ?? '').slice(0, 64),
    status: 'draft',
    external_id: null,
    error: null,
    created_at: Date.now(),
    published_at: null,
  };
  db()
    .prepare(
      `INSERT INTO sp_posts (id, account_id, platform, title, content, media, product_id, status,
                             external_id, error, created_at, published_at)
       VALUES (@id, @account_id, @platform, @title, @content, @media, @product_id, @status,
               @external_id, @error, @created_at, @published_at)`,
    )
    .run(row);
  return row;
}

export function listPosts(status?: string): PostRow[] {
  const conn = db();
  if (status) {
    return conn
      .prepare('SELECT * FROM sp_posts WHERE status = ? ORDER BY created_at DESC')
      .all(status) as PostRow[];
  }
  return conn.prepare('SELECT * FROM sp_posts ORDER BY created_at DESC').all() as PostRow[];
}

export function getPost(id: string): PostRow | undefined {
  return db().prepare('SELECT * FROM sp_posts WHERE id = ?').get(id) as PostRow | undefined;
}

export function listPublishLog(postId: string): PublishLogRow[] {
  return db()
    .prepare('SELECT * FROM sp_publish_log WHERE post_id = ? ORDER BY attempt ASC')
    .all(postId) as PublishLogRow[];
}

/** 只读引用 ① 线 mb_products（商品一键生成营销帖的内容来源），不写对方的表。 */
export function getProductBrief(id: string): { name: string; price_cents: number } | undefined {
  return db()
    .prepare('SELECT name, price_cents FROM mb_products WHERE id = ?')
    .get(id) as { name: string; price_cents: number } | undefined;
}

// ── 发布 ──────────────────────────────────────────────────────────────────────

/**
 * 发布（或重试）一张帖子。mock/real 由账号 auth_mode 决定；无论成败都落
 * sp_publish_log，失败不 5xx（回执结构化返回，帖子置 failed 可重试）。
 */
export async function publishPost(
  id: string,
): Promise<{ post: PostRow; receipt: PublishReceipt; attempt: number }> {
  const post = getPost(id);
  if (!post) {
    throw new SocialPublishError(404, 'POST_NOT_FOUND', `帖子不存在: ${id}`);
  }
  if (post.status === 'published') {
    throw new SocialPublishError(409, 'POST_ALREADY_PUBLISHED', '帖子已发布，不能重复发布');
  }
  const account = getAccount(post.account_id);
  if (!account) {
    throw new SocialPublishError(409, 'ACCOUNT_NOT_FOUND', '帖子所属账号已不存在');
  }

  const conn = db();
  const attemptRow = conn
    .prepare('SELECT COUNT(*) AS n FROM sp_publish_log WHERE post_id = ?')
    .get(id) as { n: number };
  const attempt = attemptRow.n + 1;

  conn.prepare(`UPDATE sp_posts SET status = 'publishing' WHERE id = ?`).run(id);

  const media = (() => {
    try {
      const parsed: unknown = JSON.parse(post.media);
      return Array.isArray(parsed) ? parsed.filter((m): m is string => typeof m === 'string') : [];
    } catch {
      return [];
    }
  })();
  const input: PublishInput = { title: post.title, content: post.content, media };

  const adapter = getAdapter(post.platform, account.auth_mode === 'real' ? 'real' : 'mock');
  const receipt = await adapter.publish(post.id, input, attempt);

  const finalStatus = receipt.ok ? 'published' : 'failed';
  const ts = Date.now();
  conn
    .prepare(
      `UPDATE sp_posts SET status = ?, external_id = ?, error = ?, published_at = ? WHERE id = ?`,
    )
    .run(
      finalStatus,
      receipt.external_id ?? null,
      receipt.ok ? null : (receipt.error ?? 'publish failed'),
      receipt.ok ? ts : null,
      id,
    );
  conn
    .prepare(
      `INSERT INTO sp_publish_log (id, post_id, platform, attempt, status, request, response, external_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      post.id,
      post.platform,
      attempt,
      receipt.ok ? 'success' : 'failed',
      JSON.stringify({ title: input.title, content_chars: input.content.length, media_count: input.media.length }),
      JSON.stringify(receipt),
      receipt.external_id ?? null,
      ts,
    );

  return { post: getPost(id) as PostRow, receipt, attempt };
}

export function stats(): {
  accounts: number;
  posts: number;
  published: number;
  failed: number;
  logs: number;
} {
  const conn = db();
  const count = (sql: string): number => (conn.prepare(sql).get() as { n: number }).n;
  return {
    accounts: count('SELECT COUNT(*) AS n FROM sp_accounts'),
    posts: count('SELECT COUNT(*) AS n FROM sp_posts'),
    published: count(`SELECT COUNT(*) AS n FROM sp_posts WHERE status = 'published'`),
    failed: count(`SELECT COUNT(*) AS n FROM sp_posts WHERE status = 'failed'`),
    logs: count('SELECT COUNT(*) AS n FROM sp_publish_log'),
  };
}
