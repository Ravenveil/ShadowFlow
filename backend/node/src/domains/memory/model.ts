/**
 * memory 域 — 领域模型（内部，业务变化驱动）
 *
 * 这里只放业务概念与不变量，禁止 import：
 *   - express / HTTP
 *   - fs / path（IO 属 infra）
 *   - storage/*（数据访问属 infra）
 *
 * 依赖方向：use_case → model ← infra（infra 实现 repository，模型不认识 infra）
 */

export type MemoryScope = 'user' | 'project' | 'session';

/** 实体：一条 River 记忆。id 是身份标识，created_at/updated_at 由领域工厂生成。 */
export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

/** 持久化态（含开关），仅 repository 与 infra 使用，不暴露给 HTTP 层。 */
export interface MemoryStore {
  enabled: boolean;
  entries: MemoryEntry[];
}

/** 创建入参：身份与时间不在调用方控制范围内。 */
export type NewEntry = Pick<MemoryEntry, 'scope' | 'title' | 'content'>;
/** 更新入参：全部可选。 */
export type EntryPatch = Partial<Pick<MemoryEntry, 'scope' | 'title' | 'content'>>;

/** 领域不变量常量 —— 规则的单一真源 */
export const TITLE_MAX = 120;
export const CONTENT_MAX = 4000;
export const VALID_SCOPES: readonly MemoryScope[] = ['user', 'project', 'session'];
const UUID_RE = /^[0-9a-f-]{36}$/i;

/** 领域错误码：与 HTTP 状态解耦，use_case/路由决定映射。 */
export type DomainErrorCode =
  | 'INVALID_SCOPE'
  | 'INVALID_TITLE'
  | 'TITLE_TOO_LONG'
  | 'CONTENT_TOO_LONG';

export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode) {
    super(code);
    this.name = 'DomainError';
  }
}

// ── 值对象级校验（纯函数，无副作用） ─────────────────────────────────────────

export function isValidId(id: string): boolean {
  return UUID_RE.test(id);
}

export function isMemoryScope(value: unknown): value is MemoryScope {
  return typeof value === 'string' && (VALID_SCOPES as readonly string[]).includes(value);
}

function assertScope(scope: unknown): asserts scope is MemoryScope {
  if (!isMemoryScope(scope)) throw new DomainError('INVALID_SCOPE');
}

function assertTitle(title: unknown): asserts title is string {
  if (typeof title !== 'string' || title.trim().length === 0) throw new DomainError('INVALID_TITLE');
  if (title.length > TITLE_MAX) throw new DomainError('TITLE_TOO_LONG');
}

function assertContent(content: unknown): asserts content is string {
  if (typeof content !== 'string') throw new DomainError('CONTENT_TOO_LONG');
  if (content.length > CONTENT_MAX) throw new DomainError('CONTENT_TOO_LONG');
}

/**
 * 领域工厂：新建一条记忆。守护不变量（scope/title/content 约束），
 * 生成 id 与时间戳。接收一个可选 now/id 便于测试注入，生产走默认实现。
 */
export function createMemoryEntry(
  input: NewEntry,
  deps: { now?: () => string; newId?: () => string } = {},
): MemoryEntry {
  assertScope(input.scope);
  assertTitle(input.title);
  assertContent(input.content ?? '');
  const now = (deps.now ?? (() => new Date().toISOString()))();
  return {
    id: (deps.newId ?? (() => crypto.randomUUID()))(),
    scope: input.scope,
    title: input.title.trim(),
    content: input.content ?? '',
    created_at: now,
    updated_at: now,
  };
}

/**
 * 在既有实体上应用更新：守护同样的不变量，刷新 updated_at。
 * 返回新对象（不改入参），与 repository 的"整存整取"配合。
 */
export function applyPatch(
  entry: MemoryEntry,
  patch: EntryPatch,
  deps: { now?: () => string } = {},
): MemoryEntry {
  const next: MemoryEntry = { ...entry };
  if (patch.scope !== undefined) {
    assertScope(patch.scope);
    next.scope = patch.scope;
  }
  if (patch.title !== undefined) {
    assertTitle(patch.title);
    next.title = patch.title.trim();
  }
  if (patch.content !== undefined) {
    assertContent(patch.content);
    next.content = patch.content;
  }
  next.updated_at = (deps.now ?? (() => new Date().toISOString()))();
  return next;
}

/** 排序规则（业务规则）：按更新时间倒序。 */
export function sortByUpdatedDesc(entries: readonly MemoryEntry[]): MemoryEntry[] {
  return entries
    .slice()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}
