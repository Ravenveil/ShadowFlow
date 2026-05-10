/**
 * agents.ts — sqlite persistence for AgentRecord.
 *
 * Story 15.1 — original JSON file implementation.
 * Story 15.16 — internals migrated to sqlite. Public API (listAgents,
 *               createAgent, deleteAgent, _resetForTests) is byte-compatible
 *               with the JSON era so 15.1 routes/tests don't change.
 *
 * Blueprint is stored as a TEXT column (JSON-serialised) since sqlite has
 * no first-class object type — we round-trip with JSON.parse/stringify.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getDb, _resetForTests as _resetSqliteForTests } from './sqlite';

export interface AgentRecord {
  agent_id: string;
  name: string;
  soul: string;
  workspace_id: string;
  blueprint: Record<string, unknown>;
  status: 'idle' | 'running' | 'paused' | 'error';
  source: 'quick_hire' | 'catalog';
  created_at: string;
}

interface AgentRow {
  agent_id: string;
  name: string;
  soul: string;
  workspace_id: string;
  blueprint: string; // JSON-encoded
  status: AgentRecord['status'];
  source: AgentRecord['source'];
  created_at: string;
}

function rowToRecord(r: AgentRow): AgentRecord {
  let blueprint: Record<string, unknown> = {};
  try {
    blueprint = JSON.parse(r.blueprint) as Record<string, unknown>;
  } catch {
    blueprint = {};
  }
  return {
    agent_id: r.agent_id,
    name: r.name,
    soul: r.soul,
    workspace_id: r.workspace_id,
    blueprint,
    status: r.status,
    source: r.source,
    created_at: r.created_at,
  };
}

export function listAgents(workspaceId?: string): AgentRecord[] {
  const db = getDb();
  const rows = workspaceId
    ? (db
        .prepare(
          `SELECT * FROM agents WHERE workspace_id = ? ORDER BY created_at ASC`,
        )
        .all(workspaceId) as AgentRow[])
    : (db
        .prepare(`SELECT * FROM agents ORDER BY created_at ASC`)
        .all() as AgentRow[]);
  return rows.map(rowToRecord);
}

export function createAgent(
  name: string,
  soul: string,
  workspace_id: string = 'default',
): AgentRecord {
  const agent: AgentRecord = {
    agent_id: randomUUID(),
    name,
    soul,
    workspace_id,
    blueprint: {
      capabilities: { tools: ['shadowflow-shell', 'shadowflow-fs', 'shadowflow-web'] },
      llm_provider: 'claude',
      model: 'claude-sonnet-4-6',
    },
    status: 'idle',
    source: 'quick_hire',
    created_at: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `INSERT INTO agents
       (agent_id, name, soul, workspace_id, blueprint, status, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      agent.agent_id,
      agent.name,
      agent.soul,
      agent.workspace_id,
      JSON.stringify(agent.blueprint),
      agent.status,
      agent.source,
      agent.created_at,
    );

  return agent;
}

export function deleteAgent(agent_id: string): boolean {
  const info = getDb()
    .prepare(`DELETE FROM agents WHERE agent_id = ?`)
    .run(agent_id);
  return info.changes > 0;
}

/**
 * Test-only helper — drop the sqlite handle and wipe db/JSON files in the
 * current cwd's .shadowflow/ dir. Mirrors runs._resetForTests for the same
 * reason: tests chdir between calls and need a fresh db opened in the new
 * cwd.
 */
export function _resetForTests(): void {
  _resetSqliteForTests();
  const dir = path.join(process.cwd(), '.shadowflow');
  for (const name of [
    'app.sqlite',
    'app.sqlite-wal',
    'app.sqlite-shm',
    'app.sqlite-journal',
    'agents.json',
  ]) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}
