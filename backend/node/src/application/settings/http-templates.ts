/**
 * routes/system/templates.ts — 单后端迁移：模板清单 + 模板 inbox（Story 7.2 AC5 移植）
 *
 * 移植自 python shadowflow/server.py 的 _list_templates/_get_template +
 * shadowflow/api/groups/inbox.py 的 GET /api/templates/{id}/inbox、GET /api/templates：
 *   GET /api/templates                      — TemplateSwitcher 轻量清单
 *   GET /api/templates/:template_id/inbox   — 模板 roster 聚合的 inbox
 *
 * 数据源：共享 templates/*.yaml（仓库根，Python _SEED_DIR/_CUSTOM_DIR 同款，
 * Node server cwd=backend/node → 用 repoRoot() 上溯定位）。legacy 模式下 Python
 * 与 Node 读同一目录同一份 yaml → 无条件挂载。
 *
 * 对齐要点：
 *   - /api/templates 响应 = python server.py:1095 _template_list_items：
 *     {data:[{template_id,name,user_role,default_ops_room_name,brief_board_alias,
 *     theme_color,agent_roster_count,group_roster_count,source,builder_origin,
 *     workflow_id,description,kit_tags}], meta:{trace_id,timestamp}}
 *   - inbox：roster 直转（status=idle/计数 0），未知模板优雅降级回空 inbox
 *   - 坏 yaml 跳过不炸清单（python _load_template_file 同款 try/except）
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { repoRoot, repoDataDir } from '../adapters/infra-repo-root';

const router = Router();

type Obj = Record<string, unknown>;

interface RosterEntry {
  id: string;
  name: string;
  soul: string;
}

interface TemplateEntry {
  spec: {
    template_id: string;
    name: string;
    description?: string;
    user_role?: string;
    default_ops_room_name?: string;
    brief_board_alias?: string;
    theme_color?: string;
    metadata?: Obj;
    agent_roster: RosterEntry[];
    group_roster: Array<{ id: string; name: string; agents?: string[] }>;
  };
  source: 'seed' | 'custom';
}

/** 模板目录：仓库根 templates/（python _SEED_DIR 同款），SHADOWFLOW_DATA_DIR 不影响。 */
function templatesDir(): string {
  return path.join(repoRoot(), 'templates');
}

function loadTemplateFile(file: string, source: 'seed' | 'custom'): TemplateEntry | null {
  try {
    const raw = yaml.load(fs.readFileSync(file, 'utf-8')) as Obj | null;
    if (!raw || typeof raw !== 'object') return null;
    const roster = Array.isArray(raw['agent_roster']) ? raw['agent_roster'] : [];
    const groupRoster = Array.isArray(raw['group_roster']) ? raw['group_roster'] : [];
    const meta =
      raw['metadata'] && typeof raw['metadata'] === 'object' && !Array.isArray(raw['metadata'])
        ? (raw['metadata'] as Obj)
        : {};
    return {
      spec: {
        template_id: String(raw['template_id'] ?? path.basename(file, '.yaml')),
        name: String(raw['name'] ?? ''),
        description: typeof raw['description'] === 'string' ? raw['description'] : undefined,
        user_role: typeof raw['user_role'] === 'string' ? raw['user_role'] : undefined,
        default_ops_room_name:
          typeof raw['default_ops_room_name'] === 'string' ? raw['default_ops_room_name'] : undefined,
        brief_board_alias:
          typeof raw['brief_board_alias'] === 'string' ? raw['brief_board_alias'] : undefined,
        theme_color: typeof raw['theme_color'] === 'string' ? raw['theme_color'] : undefined,
        metadata: meta,
        agent_roster: roster
          .filter((a): a is Obj => !!a && typeof a === 'object' && !Array.isArray(a))
          .map((a) => ({
            id: String(a['id'] ?? ''),
            name: String(a['name'] ?? a['id'] ?? ''),
            soul: typeof a['soul'] === 'string' ? a['soul'] : '',
          }))
          .filter((a) => a.id),
        group_roster: groupRoster
          .filter((g): g is Obj => !!g && typeof g === 'object' && !Array.isArray(g))
          .map((g) => ({
            id: String(g['id'] ?? ''),
            name: String(g['name'] ?? g['id'] ?? ''),
            agents: Array.isArray(g['agents'])
              ? (g['agents'] as unknown[]).filter((x): x is string => typeof x === 'string')
              : undefined,
          }))
          .filter((g) => g.id),
      },
      source,
    };
  } catch {
    return null; // 坏 yaml 跳过（python _load_template_file 同款）
  }
}

function listTemplates(): TemplateEntry[] {
  const dir = templatesDir();
  const results: TemplateEntry[] = [];
  // seed: templates/*.yaml（不递归子目录）
  try {
    const entries = fs.readdirSync(dir);
    for (const name of entries.filter((f) => f.endsWith('.yaml')).sort()) {
      const entry = loadTemplateFile(path.join(dir, name), 'seed');
      if (entry) results.push(entry);
    }
  } catch {
    /* 目录缺失 → 空 */
  }
  // custom: templates/custom/*.yaml（mtime 倒序）
  const customDir = path.join(dir, 'custom');
  try {
    const entries = fs
      .readdirSync(customDir)
      .filter((f) => f.endsWith('.yaml'))
      .map((f) => ({
        name: f,
        mtime: fs.statSync(path.join(customDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const { name } of entries) {
      const entry = loadTemplateFile(path.join(customDir, name), 'custom');
      if (entry) results.push(entry);
    }
  } catch {
    /* custom 目录缺失 → 忽略 */
  }
  return results;
}

function getTemplate(templateId: string): TemplateEntry | null {
  const dir = templatesDir();
  const custom = path.join(dir, 'custom', `${templateId}.yaml`);
  if (fs.existsSync(custom)) return loadTemplateFile(custom, 'custom');
  const seed = path.join(dir, `${templateId}.yaml`);
  if (fs.existsSync(seed)) return loadTemplateFile(seed, 'seed');
  return null;
}

function inboxMeta(): Obj {
  return {
    trace_id: randomUUID().replace(/-/g, ''),
    timestamp: new Date().toISOString(),
  };
}

/** roster → InboxData（python inbox.py InboxAggregator.build 同款：全 idle/零计数）。 */
function inboxFromTemplate(entry: TemplateEntry): Obj {
  const now = new Date().toISOString();
  const groups = entry.spec.group_roster.map((g) => ({
    id: g.id,
    name: g.name,
    templateId: entry.spec.template_id,
    status: 'idle',
    unreadCount: 0,
    pendingApprovalsCount: 0,
    lastMessage: '',
    lastActivityAt: now,
    metrics: {},
  }));
  const agentDms = entry.spec.agent_roster.map((a) => ({
    agentId: a.id,
    agentName: a.name,
    kind: 'local',
    status: 'idle',
    unreadCount: 0,
    lastMessage: '',
    lastActivityAt: now,
  }));
  return { groups, agent_dms: agentDms };
}

// ── GET /api/templates — TemplateSwitcher 清单（server.py:1095 同款字段）────

router.get('/templates', (_req: Request, res: Response) => {
  const summaries = listTemplates().map((entry) => {
    const meta = entry.spec.metadata ?? {};
    return {
      template_id: entry.spec.template_id,
      name: entry.spec.name,
      user_role: entry.spec.user_role ?? '',
      default_ops_room_name: entry.spec.default_ops_room_name ?? '',
      brief_board_alias: entry.spec.brief_board_alias ?? '',
      theme_color: entry.spec.theme_color ?? '#6366F1',
      agent_roster_count: entry.spec.agent_roster.length,
      group_roster_count: entry.spec.group_roster.length,
      source: entry.source,
      builder_origin: String(meta['builder_origin'] ?? ''),
      workflow_id: String(meta['workflow_id'] ?? ''),
      description: entry.spec.description ?? '',
      kit_tags: Array.isArray(meta['kit_tags'])
        ? (meta['kit_tags'] as unknown[]).filter((t): t is string => typeof t === 'string' && !!t)
        : [],
    };
  });
  res.json({ data: summaries, meta: inboxMeta() });
});

// ── GET /api/templates/:template_id/inbox — 模板 roster 聚合 ────────────────

router.get('/templates/:template_id/inbox', (req: Request, res: Response) => {
  const entry = getTemplate(req.params.template_id);
  if (!entry) {
    // 未知模板优雅降级（python 同款：空 inbox 不 404）
    res.json({ data: { groups: [], agent_dms: [] }, meta: inboxMeta() });
    return;
  }
  res.json({ data: inboxFromTemplate(entry), meta: inboxMeta() });
});

export default router;
