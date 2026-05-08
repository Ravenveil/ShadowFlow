/**
 * ToolPicker — Story 8.4b (AC1, AC3, AC4)
 *
 * Three-tier tool selector for a RoleProfile:
 *   - Builtin tools (static, always visible, zero-config toggle)
 *   - MCP tools (from registered providers, requires connection)
 *   - Permission rules: deny > ask > allow per tool
 *
 * Writes back to blueprint.tool_policies via useBuilderStore.
 */
import { useCallback, useEffect, useState } from 'react';
import type {
  BuiltinTool,
  McpProvider,
  McpToolSchema,
  PermissionLevel,
  ToolPolicy,
} from '../../../../../common/types/agent-builder';
import { useBuilderStore } from '../../../../stores/builderStore';

// ---------------------------------------------------------------------------
// API helpers (inline — no separate service layer needed here)
// ---------------------------------------------------------------------------

const API_BASE_URL = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

async function fetchBuiltins(): Promise<BuiltinTool[]> {
  const res = await fetch(`${API_BASE_URL}/tools/builtin`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data?.tools ?? [];
}

async function fetchProviders(): Promise<McpProvider[]> {
  const res = await fetch(`${API_BASE_URL}/tools/providers`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data?.providers ?? [];
}

async function fetchProviderTools(providerId: string): Promise<McpToolSchema[]> {
  const res = await fetch(`${API_BASE_URL}/tools/providers/${providerId}/tools`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data?.tools ?? [];
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const PERM_COLORS: Record<PermissionLevel, string> = {
  allow: 'text-sf-ok border-sf-ok/40 bg-sf-ok/10',
  ask: 'text-sf-warn border-sf-warn/40 bg-sf-warn/10',
  deny: 'text-sf-reject border-sf-reject/40 bg-sf-reject/10',
};

function PermChip({
  level,
  active,
  onClick,
}: {
  level: PermissionLevel;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-[5px] border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] transition-all',
        active ? PERM_COLORS[level] : 'border-sf-border bg-sf-elev2 text-sf-fg5',
      ].join(' ')}
    >
      {level}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Single tool row
// ---------------------------------------------------------------------------

interface ToolRowProps {
  toolId: string;
  name: string;
  description: string;
  typeTag: 'builtin' | 'mcp';
  providerLabel?: string;
  policy: ToolPolicy | undefined;
  onToggle: (toolId: string, providerInfo?: { provider_id: string }) => void;
  onPermChange: (toolId: string, perm: PermissionLevel) => void;
}

function ToolRow({
  toolId,
  name,
  description,
  typeTag,
  providerLabel,
  policy,
  onToggle,
  onPermChange,
}: ToolRowProps) {
  const enabled = policy?.visibility === 'enabled';
  const currentPerm = policy?.default_permission ?? (typeTag === 'builtin' ? 'allow' : 'ask');

  return (
    <div
      className={[
        'rounded-[8px] border px-3 py-2.5 transition-colors',
        enabled
          ? 'border-sf-accent/30 bg-sf-elev2'
          : 'border-sf-border/60 bg-sf-elev1',
      ].join(' ')}
      data-testid={`tool-row-${name}`}
    >
      <div className="flex items-start gap-2">
        {/* Toggle */}
        <button
          type="button"
          onClick={() => onToggle(toolId, policy?.provider_id ? { provider_id: policy.provider_id } : undefined)}
          className={[
            'mt-0.5 h-4 w-7 flex-shrink-0 rounded-full border transition-all',
            enabled
              ? 'border-sf-accent bg-sf-accent'
              : 'border-sf-border bg-sf-elev3',
          ].join(' ')}
          aria-label={enabled ? `Disable ${name}` : `Enable ${name}`}
          aria-pressed={enabled}
        >
          <span
            className={[
              'block h-3 w-3 rounded-full transition-transform',
              enabled ? 'translate-x-3.5 bg-white' : 'translate-x-0.5 bg-sf-fg5',
            ].join(' ')}
          />
        </button>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] font-semibold text-sf-fg1">{name}</span>
            <span
              className={[
                'rounded-[4px] px-1.5 py-px font-mono text-[8px] font-bold uppercase tracking-[0.1em]',
                typeTag === 'builtin'
                  ? 'bg-sf-ok/15 text-sf-ok'
                  : 'bg-sf-accent-tint text-sf-accent-bright',
              ].join(' ')}
            >
              {typeTag}
            </span>
            {providerLabel && (
              <span className="font-mono text-[8px] text-sf-fg5">{providerLabel}</span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[10px] leading-[1.4] text-sf-fg4">{description}</p>
        </div>
      </div>

      {/* Permission selector — only shown when enabled */}
      {enabled && (
        <div className="mt-2 flex items-center gap-1.5" data-testid={`tool-perm-${name}`}>
          <span className="font-mono text-[9px] text-sf-fg5">permission:</span>
          {(['allow', 'ask', 'deny'] as PermissionLevel[]).map((lvl) => (
            <PermChip
              key={lvl}
              level={lvl}
              active={currentPerm === lvl}
              onClick={() => onPermChange(toolId, lvl)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToolPicker
// ---------------------------------------------------------------------------

export interface ToolPickerProps {
  roleId?: string;
}

export function ToolPicker({ roleId }: ToolPickerProps) {
  const [builtins, setBuiltins] = useState<BuiltinTool[]>([]);
  const [providers, setProviders] = useState<McpProvider[]>([]);
  const [mcpTools, setMcpTools] = useState<McpToolSchema[]>([]);
  // Tracks only the MCP-tools loading state; builtin tools render immediately when available
  const [mcpLoading, setMcpLoading] = useState(true);

  const toolPolicies = useBuilderStore((s) => s.blueprint?.tool_policies ?? []);
  const updateToolPolicy = useBuilderStore((s) => s.updateToolPolicy);

  // Resolve whether the current role is a boss (can_spawn_tasks) so we can hide boss-only tools
  const isBoss = useBuilderStore((s) => {
    if (!roleId || !s.blueprint) return false;
    const allRoles = s.blueprint.role_profiles.flatMap((r) => [r, ...r.sub_agents]);
    return allRoles.find((r) => r.role_id === roleId)?.can_spawn_tasks ?? false;
  });

  // Load tools from API
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setMcpLoading(true);
      const [bts, pvs] = await Promise.all([fetchBuiltins(), fetchProviders()]);
      if (cancelled) return;
      // Render builtin tools immediately — they are always visible (AC1)
      setBuiltins(bts);
      setProviders(pvs);

      // Fetch schemas for all connected providers
      // Use allSettled so a single failing provider doesn't leave the component stuck loading
      const settled = await Promise.allSettled(
        pvs
          .filter((p) => p.status === 'connected')
          .map((p) => fetchProviderTools(p.provider_id)),
      );
      if (!cancelled) {
        const allMcp: McpToolSchema[] = settled.flatMap((r) =>
          r.status === 'fulfilled' ? r.value : [],
        );
        setMcpTools(allMcp);
        setMcpLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const findPolicy = useCallback(
    (toolId: string) => toolPolicies.find((p) => p.tool_id === toolId),
    [toolPolicies],
  );

  function handleToggle(toolId: string, providerInfo?: { provider_id: string }) {
    const existing = findPolicy(toolId);
    if (existing?.visibility === 'enabled') {
      updateToolPolicy(toolId, { visibility: 'disabled' });
    } else if (existing) {
      updateToolPolicy(toolId, { visibility: 'enabled' });
    } else {
      // New policy
      const isMcp = toolId.startsWith('mcp:');
      const newPolicy: ToolPolicy = {
        tool_id: toolId,
        provider_id: providerInfo?.provider_id,
        credentials_ref: providerInfo?.provider_id,
        visibility: 'enabled',
        permission_rules: [],
        default_permission: isMcp ? 'ask' : 'allow',
        trust_level: isMcp ? 'external' : 'internal',
        side_effects: 'read_only',
        requires_confirmation: isMcp,
        metadata: {},
      };
      updateToolPolicy(toolId, newPolicy as Partial<ToolPolicy>);
    }
  }

  function handlePermChange(toolId: string, perm: PermissionLevel) {
    updateToolPolicy(toolId, { default_permission: perm });
  }

  const hasProviders = providers.length > 0;
  const connectedProviders = providers.filter((p) => p.status === 'connected');
  // AC1: spawn_task is boss-only — hide it when the current role is not a boss
  const visibleBuiltins = builtins.filter((t) => !t.boss_only || isBoss);

  return (
    <div className="flex flex-col gap-3" data-testid="tool-picker">
      {/* Builtin tools */}
      <div>
        <p className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-sf-fg4">
          内置工具 · {visibleBuiltins.length}
        </p>
        <div className="flex flex-col gap-1.5">
          {visibleBuiltins.map((tool) => (
            <ToolRow
              key={tool.tool_id}
              toolId={tool.tool_id}
              name={tool.name}
              description={tool.description}
              typeTag="builtin"
              policy={findPolicy(tool.tool_id)}
              onToggle={handleToggle}
              onPermChange={handlePermChange}
            />
          ))}
        </div>
      </div>

      {/* MCP tools */}
      <div>
        <p className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-sf-fg4">
          MCP 工具 ·{' '}
          {mcpLoading ? (
            <span className="text-sf-fg5">加载中…</span>
          ) : hasProviders ? (
            <span>
              {mcpTools.length} 个工具，{connectedProviders.length} 个 Provider 已连接
            </span>
          ) : (
            <span className="text-sf-fg5">未注册 Provider</span>
          )}
        </p>

        {mcpLoading ? (
          <p className="py-2 font-mono text-[10px] text-sf-fg5">Loading MCP tools…</p>
        ) : mcpTools.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {mcpTools.map((tool) => {
              const provider = providers.find((p) => p.provider_id === tool.provider_id);
              return (
                <ToolRow
                  key={tool.tool_id}
                  toolId={tool.tool_id}
                  name={tool.name}
                  description={tool.description}
                  typeTag="mcp"
                  providerLabel={provider?.name ? `${provider.name} · MCP` : 'MCP'}
                  policy={findPolicy(tool.tool_id)}
                  onToggle={(id) => handleToggle(id, { provider_id: tool.provider_id })}
                  onPermChange={handlePermChange}
                />
              );
            })}
          </div>
        ) : (
          <p className="rounded-[7px] border border-dashed border-sf-border p-3 font-mono text-[10px] leading-[1.5] text-sf-fg5">
            {hasProviders
              ? '已注册 Provider 尚未连接，在设置页测试连接后工具将在此出现。'
              : '在设置页注册 MCP Provider，接入小红书搜索、GitHub 等专属工具。'}
          </p>
        )}
      </div>
    </div>
  );
}
